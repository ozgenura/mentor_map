// Program haritası (metro): her bootcamp bir hat, her hafta bir durak.
// Vurgulanan kişinin (ben ya da seçili eğitmen) oturumları dolu durak; kişinin iki bootcamp'i aynı saate
// düşüyorsa o hafta iki hattı birleştiren bir "aktarma" çizilir (çakışma).

import { cakismalar, siraliOturumlar, TATILLER } from "./derive";
import { gunEkle, haftaBasi } from "./time";
import type { Oturum } from "./types";

export type Hat = { id: string; kod: string; ad: string; renk: string; ilk: number; son: number };

export type Durak = {
  hatId: string;
  hafta: number; // haftalar[] içindeki sıra
  oturumlar: Oturum[];
  benim: boolean; // vurgulanan kişinin oturumu var
  iptal: boolean; // haftadaki tüm oturumlar iptal
  cakisma: boolean;
};

export type Aktarma = { hafta: number; hatlar: string[]; oturumlar: Oturum[] };

export type Not = { hafta: number; metin: string };

export type Harita = {
  haftalar: string[]; // pazartesi tarihleri
  hatlar: Hat[];
  duraklar: Durak[];
  aktarmalar: Aktarma[];
  notlar: Not[];
  cakisanlar: Set<string>; // vurgulanan kişinin çakışan oturum id'leri
  bugunHafta: number; // -1: program başlamadı, haftalar.length: program bitti
};

/** Bugün ekranından Takvim'e geçerken açılacak görünüm (sessionStorage). */
export const GORUNUM_ANAHTARI = "mm-takvim-gorunum";

export const durakAnahtari = (hatId: string, hafta: number) => `${hatId}|${hafta}`;

export function haritaKur(oturumlar: Oturum[], vurgu: (o: Oturum) => boolean, bugun: string): Harita {
  const sirali = siraliOturumlar(oturumlar);
  if (!sirali.length) return { haftalar: [], hatlar: [], duraklar: [], aktarmalar: [], notlar: [], cakisanlar: new Set(), bugunHafta: -1 };

  const ilkHafta = haftaBasi(sirali[0].tarih);
  const sonHafta = haftaBasi(sirali[sirali.length - 1].tarih);
  const haftalar: string[] = [];
  for (let h = ilkHafta; h <= sonHafta; h = gunEkle(h, 7)) haftalar.push(h);
  const sira = new Map(haftalar.map((h, i) => [h, i]));
  const haftaNo = (tarih: string) => sira.get(haftaBasi(tarih))!;

  const hatMap = new Map<string, Hat>();
  const durakMap = new Map<string, Durak>();
  for (const o of sirali) {
    const i = haftaNo(o.tarih);
    const hat = hatMap.get(o.bootcamp_id);
    if (!hat) hatMap.set(o.bootcamp_id, { id: o.bootcamp_id, kod: o.kisa_kod, ad: o.bootcamp_ad, renk: o.renk, ilk: i, son: i });
    else hat.son = i;
    const k = durakAnahtari(o.bootcamp_id, i);
    const d = durakMap.get(k) ?? { hatId: o.bootcamp_id, hafta: i, oturumlar: [], benim: false, iptal: true, cakisma: false };
    d.oturumlar.push(o);
    if (vurgu(o)) d.benim = true;
    if (o.durum === "planli") d.iptal = false;
    durakMap.set(k, d);
  }
  const hatlar = [...hatMap.values()].sort((a, b) => a.ilk - b.ilk || a.kod.localeCompare(b.kod, "tr"));

  // Kişisel çakışmalar: farklı bootcamp'ler aktarma, aynı bootcamp durakta işaret.
  const aktarmaMap = new Map<string, Aktarma>();
  const cakisanlar = new Set<string>();
  for (const c of cakismalar(sirali.filter(vurgu))) {
    cakisanlar.add(c.a.id).add(c.b.id);
    const i = haftaNo(c.a.tarih);
    if (c.a.bootcamp_id === c.b.bootcamp_id) {
      const d = durakMap.get(durakAnahtari(c.a.bootcamp_id, i));
      if (d) d.cakisma = true;
      continue;
    }
    const k = `${i}|${[c.a.bootcamp_id, c.b.bootcamp_id].sort().join("|")}`;
    const a = aktarmaMap.get(k) ?? { hafta: i, hatlar: [c.a.bootcamp_id, c.b.bootcamp_id], oturumlar: [] };
    for (const o of [c.a, c.b]) if (!a.oturumlar.includes(o)) a.oturumlar.push(o);
    aktarmaMap.set(k, a);
    for (const o of [c.a, c.b]) {
      const d = durakMap.get(durakAnahtari(o.bootcamp_id, i));
      if (d) d.cakisma = true;
    }
  }

  const notlar: Not[] = [];
  for (const h of hatlar) {
    notlar.push({ hafta: h.ilk, metin: `${h.kod} başlıyor` });
    if (h.son !== h.ilk) notlar.push({ hafta: h.son, metin: `${h.kod} son durak` });
  }
  for (const [t, ad] of Object.entries(TATILLER)) {
    const i = sira.get(haftaBasi(t));
    if (i !== undefined) notlar.push({ hafta: i, metin: `${ad} (tatil)` });
  }
  notlar.sort((a, b) => a.hafta - b.hafta);

  return {
    haftalar, hatlar,
    duraklar: [...durakMap.values()],
    aktarmalar: [...aktarmaMap.values()].sort((a, b) => a.hafta - b.hafta),
    notlar,
    cakisanlar,
    bugunHafta: sira.get(haftaBasi(bugun)) ?? (bugun < ilkHafta ? -1 : haftalar.length),
  };
}

/** Bugün ekranındaki mini hat: bootcamp programı haftalık duraklar halinde (kalabalık olmasın diye oturum değil hafta). */
export type MiniNokta = { anahtar: string; oran: number; gecti: boolean; benim: boolean };

export function miniHat(oturumlar: Oturum[], vurgu: (o: Oturum) => boolean, simdi = Date.now()): { noktalar: MiniNokta[]; bugunOran: number } {
  const list = siraliOturumlar(oturumlar.filter((o) => o.durum === "planli"));
  if (!list.length) return { noktalar: [], bugunOran: 0 };
  const t = (tarih: string) => Date.parse(`${tarih}T12:00:00Z`);
  const haftalar = new Map<string, { benim: boolean; son: string }>();
  for (const o of list) {
    const h = haftaBasi(o.tarih), v = haftalar.get(h);
    haftalar.set(h, { benim: (v?.benim ?? false) || vurgu(o), son: o.tarih });
  }
  const anahtarlar = [...haftalar.keys()];
  const bas = t(anahtarlar[0]), son = t(anahtarlar[anahtarlar.length - 1]);
  const oran = (x: number) => (son === bas ? 0.5 : Math.min(1, Math.max(0, (x - bas) / (son - bas))));
  return {
    noktalar: anahtarlar.map((h) => ({ anahtar: h, oran: oran(t(h)), gecti: t(haftalar.get(h)!.son) < simdi - 12 * 36e5, benim: haftalar.get(h)!.benim })),
    bugunOran: oran(simdi),
  };
}
