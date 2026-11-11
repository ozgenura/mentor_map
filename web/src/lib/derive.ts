// Ekranların ortak hesapları: sıradaki oturum, çakışmalar, bootcamp ilerlemesi, hafta şeridi.

import { bugunTR, gun, gunEkle, haftaBasi, sureSaat, TR } from "./time";
import type { Oturum } from "./types";

/** Resmi tatiller (TR). Tatile denk gelen oturum işaretlenir. */
export const TATILLER: Record<string, string> = {
  "2026-10-28": "Cumhuriyet Bayramı arifesi",
  "2026-10-29": "Cumhuriyet Bayramı",
  "2027-01-01": "Yılbaşı",
  "2027-04-23": "Ulusal Egemenlik ve Çocuk Bayramı",
  "2027-05-01": "Emek ve Dayanışma Günü",
};

export function basMs(o: Oturum): number {
  return o.baslangic ? Date.parse(o.baslangic) : Date.parse(`${o.tarih}T00:00:00+03:00`);
}

export function bitMs(o: Oturum): number {
  return o.bitis ? Date.parse(o.bitis) : Date.parse(`${gunEkle(o.tarih, 1)}T00:00:00+03:00`);
}

export function siraliOturumlar(os: Oturum[]): Oturum[] {
  return [...os].sort((a, b) => a.tarih.localeCompare(b.tarih) || basMs(a) - basMs(b));
}

/** Kişi oturumu anlatıyor mu. */
export function anlattigiMi(o: Oturum, kisiId: string | undefined): boolean {
  return !!kisiId && o.anlaticilar.some((a) => a.kisi_id === kisiId);
}

/** Kişinin takviminde görünür mü: anlattığı oturumlar + sorumlu olduğu (asistan / PO) bootcamp'lerin tüm oturumları. */
export function benimMi(o: Oturum, kisiId: string | undefined, sorumlu?: ReadonlySet<string>): boolean {
  return anlattigiMi(o, kisiId) || !!sorumlu?.has(o.bootcamp_id);
}

/** Bitmemiş ilk planlı oturum. */
export function siradaki(os: Oturum[], simdi = Date.now()): Oturum | undefined {
  return siraliOturumlar(os).find((o) => o.durum === "planli" && bitMs(o) > simdi);
}

/** 'Şimdi' | 'Bugün' | 'Yarın' | '4 gün sonra' */
export function kalan(o: Oturum, simdi = Date.now()): string {
  if (basMs(o) <= simdi && simdi < bitMs(o) && o.baslangic) return "Şimdi";
  const bugun = gun(new Date(simdi).toISOString(), TR);
  const fark = Math.round((Date.parse(`${o.tarih}T12:00:00Z`) - Date.parse(`${bugun}T12:00:00Z`)) / 864e5);
  if (fark <= 0) return "Bugün";
  if (fark === 1) return "Yarın";
  return `${fark} gün sonra`;
}

export type Cakisma = { a: Oturum; b: Oturum; tip: "KESIN" | "OLASI" };

/** Aynı gün, saatleri kesişen (ya da biri saatsiz) planlı oturum çiftleri. Arka arkaya olan çakışma sayılmaz. */
export function cakismalar(os: Oturum[]): Cakisma[] {
  const gunler = new Map<string, Oturum[]>();
  for (const o of os) if (o.durum === "planli") gunler.set(o.tarih, [...(gunler.get(o.tarih) ?? []), o]);
  const out: Cakisma[] = [];
  for (const list of gunler.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.baslangic && b.baslangic) {
          if (basMs(a) < bitMs(b) && basMs(b) < bitMs(a)) out.push({ a, b, tip: "KESIN" });
        } else {
          out.push({ a, b, tip: "OLASI" });
        }
      }
    }
  }
  return out.sort((x, y) => x.a.tarih.localeCompare(y.a.tarih));
}

export function cakisanIdler(cs: Cakisma[]): Set<string> {
  return new Set(cs.flatMap((c) => [c.a.id, c.b.id]));
}

export type Ilerleme = { bootcampId: string; ad: string; kod: string; renk: string; gecen: number; toplam: number; son: string; sonKonu: string };

/** Kişinin içinde olduğu her bootcamp için tüm programın ilerlemesi. */
export function ilerlemeler(tum: Oturum[], kisiId: string, simdi = Date.now(), sorumlu?: ReadonlySet<string>): Ilerleme[] {
  const benimkiler = new Set(tum.filter((o) => benimMi(o, kisiId, sorumlu)).map((o) => o.bootcamp_id));
  const out: Ilerleme[] = [];
  for (const id of benimkiler) {
    const list = siraliOturumlar(tum.filter((o) => o.bootcamp_id === id && o.durum === "planli" && o.kaynak === "excel"));
    if (!list.length) continue;
    const son = list[list.length - 1];
    out.push({
      bootcampId: id, ad: son.bootcamp_ad, kod: son.kisa_kod, renk: son.renk,
      gecen: list.filter((o) => bitMs(o) <= simdi).length, toplam: list.length, son: son.tarih, sonKonu: son.konu,
    });
  }
  return out.sort((a, b) => a.son.localeCompare(b.son));
}

export type HaftaGunu = { tarih: string; adet: number; renkler: string[]; tatil?: string; bugun: boolean };

export function haftaGunleri(os: Oturum[], bas = haftaBasi(bugunTR())): HaftaGunu[] {
  const bugun = bugunTR();
  return Array.from({ length: 7 }, (_, i) => {
    const tarih = gunEkle(bas, i);
    const list = os.filter((o) => o.tarih === tarih && o.durum === "planli");
    return { tarih, adet: list.length, renkler: [...new Set(list.map((o) => o.renk))].slice(0, 3), tatil: TATILLER[tarih], bugun: tarih === bugun };
  });
}

export function haftaOzeti(os: Oturum[], bas = haftaBasi(bugunTR())): { adet: number; saat: number } {
  const son = gunEkle(bas, 6);
  const list = os.filter((o) => o.durum === "planli" && o.tarih >= bas && o.tarih <= son);
  return { adet: list.length, saat: list.reduce((t, o) => t + sureSaat(o), 0) };
}

export function saatMetni(s: number): string {
  return `${s.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sa`;
}

/** Zemin rengine göre okunur yazı rengi. */
export function yaziRengi(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.35 ? "#22110F" : "#FFFFFF";
}

export function sureSaatMetni(o: Oturum): string {
  return `${sureSaat(o).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} saat`;
}

function trUst(s: string): string {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** Takvim kartları için kısa ad: "Harun Akın" -> "HA". Aynı baş harfli iki kişi varsa "Halil A." */
export function kisaltmaHaritasi(adlar: string[]): Map<string, string> {
  const tekil = [...new Set(adlar.filter(Boolean))];
  const bas = (ad: string) => {
    const p = ad.replace(/\./g, ". ").split(/\s+/).filter(Boolean);
    if (p.length < 2) return ad; // tek kelimelik ad ("Işık") olduğu gibi kalır
    return trUst(p[0][0] + p[p.length - 1][0]);
  };
  const sayac = new Map<string, number>();
  for (const ad of tekil) sayac.set(bas(ad), (sayac.get(bas(ad)) ?? 0) + 1);
  return new Map(tekil.map((ad) => {
    if ((sayac.get(bas(ad)) ?? 0) <= 1) return [ad, bas(ad)];
    const p = ad.split(/\s+/);
    return [ad, p.length > 1 ? `${p[0]} ${trUst(p[p.length - 1][0])}.` : ad];
  }));
}

/** "DA · HA", "DA · HA +1", konuk için "DA · Konuk", anlatıcısız yalnızca "DA" */
export function kartEtiketi(o: Oturum, harita: Map<string, string>): string {
  const [ilk, ...diger] = o.anlaticilar;
  if (!ilk) return o.kisa_kod;
  const ad = ilk.rol === "konuk" ? "Konuk" : harita.get(ilk.ad) ?? ilk.ad;
  return `${o.kisa_kod} · ${ad}${diger.length ? ` +${diger.length}` : ""}`;
}

/** Yalnızca http(s) adresleri link olarak açılır; "javascript:" gibi şemalar düz metin kalır. */
export function guvenliLink(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
  } catch {
    return null;
  }
}
