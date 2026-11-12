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
