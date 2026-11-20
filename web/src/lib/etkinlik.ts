// Etkinlikler: Tür'ü "Etkinlik" olan oturumlar. Bir bootcamp'e bağlı olabilir ya da "Genel" (kodu Genel olan bootcamp).

import { bitMs, siraliOturumlar } from "./derive";
import type { Oturum } from "./types";

export const GENEL_KOD = "Genel";

export function etkinlikMi(o: Oturum): boolean {
  return o.tur === "Etkinlik" || o.kisa_kod === GENEL_KOD;
}

export type AyGrubu = { ay: string; etkinlikler: Oturum[] };

/** Etkinlikleri (iptaller dahil) yaklaşan / geçmiş diye ayırır ve aylara böler. Yaklaşanlar eskiden yeniye, geçmiş yeniden eskiye. */
export function etkinlikGruplari(tum: Oturum[], bootcampKod = "", simdi = Date.now()): { yaklasan: AyGrubu[]; gecmis: AyGrubu[] } {
  const list = siraliOturumlar(tum.filter((o) => etkinlikMi(o) && (!bootcampKod || o.kisa_kod === bootcampKod)));
  const grupla = (os: Oturum[]) => {
    const m = new Map<string, Oturum[]>();
    for (const o of os) {
      const k = o.tarih.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return [...m.entries()].map(([ay, etkinlikler]) => ({ ay, etkinlikler }));
  };
  return {
    yaklasan: grupla(list.filter((o) => bitMs(o) > simdi)),
    gecmis: grupla(list.filter((o) => bitMs(o) <= simdi).reverse()),
  };
}

/** Google Takvim'e "etkinlik ekle" bağlantısı: kişi isterse etkinliği kendi takvimine ekler. */
export function googleTakvimLinki(o: Oturum): string {
  const z = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const g = (ymd: string) => ymd.replace(/-/g, "");
  const tarihler = o.baslangic && o.bitis ? `${z(o.baslangic)}/${z(o.bitis)}`
    : `${g(o.tarih)}/${g(new Date(Date.parse(`${o.tarih}T12:00:00Z`) + 864e5).toISOString().slice(0, 10))}`;
  const aciklama = [o.aciklama, o.toplanti_linki ? `Katılım: ${o.toplanti_linki}` : null, "Mentor Map etkinliği"].filter(Boolean).join("\n\n");
  const p = new URLSearchParams({ action: "TEMPLATE", text: o.konu || "Etkinlik", dates: tarihler, details: aciklama });
  if (o.toplanti_linki) p.set("location", o.toplanti_linki);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
