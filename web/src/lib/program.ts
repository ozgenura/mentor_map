// PO paneli hesapları: bootcamp'in özeti, dikkat isteyen oturumlar, haftalara bölünmüş program.

import { basMs, bitMs, cakismalar, siraliOturumlar } from "./derive";
import { haftaBasi } from "./time";
import type { Oturum } from "./types";

export type Dikkat = { o: Oturum; neden: "egitmen_yok" | "link_yok" | "cakisma"; detay?: string };

export type ProgramOzeti = {
  toplam: number;
  gecen: number;
  kalan: number;
  iptal: number;
  ilk: string | null;
  son: string | null;
  donemler: string[];
};

/** Bootcamp'in oturumları (programdan kalkanlar hariç). */
export function bootcampOturumlari(tum: Oturum[], bootcampId: string): Oturum[] {
  return siraliOturumlar(tum.filter((o) => o.bootcamp_id === bootcampId && !o.excelden_kalkti));
}

export function programOzeti(os: Oturum[], simdi = Date.now()): ProgramOzeti {
  const planli = os.filter((o) => o.durum === "planli");
  return {
    toplam: planli.length,
    gecen: planli.filter((o) => bitMs(o) <= simdi).length,
    kalan: planli.filter((o) => bitMs(o) > simdi).length,
    iptal: os.length - planli.length,
    ilk: os[0]?.tarih ?? null,
    son: os[os.length - 1]?.tarih ?? null,
    donemler: [...new Set(os.map((o) => o.donem_kod).filter((x): x is string => !!x))],
  };
}

/**
 * Yaklaşan planlı oturumlarda PO'nun ilgilenmesi gerekenler:
 * eğitmeni atanmamış, toplantı linki olmayan (bootcamp varsayılanı da yoksa), eğitmeni aynı saatte başka oturumda.
 * Etkinliklerde link eksikliği uyarılmaz (çoğu yüz yüze ya da sonradan duyurulur).
 */
export function dikkatListesi(os: Oturum[], tum: Oturum[], simdi = Date.now()): Dikkat[] {
  const out: Dikkat[] = [];
  const gelecek = os.filter((o) => o.durum === "planli" && bitMs(o) > simdi);
  for (const o of gelecek) {
    if (!o.anlaticilar.length) out.push({ o, neden: "egitmen_yok" });
    if (!o.toplanti_linki && o.tur !== "Etkinlik") out.push({ o, neden: "link_yok" });
  }
  // Eğitmen çakışması: bu bootcamp'in oturumunu anlatan kişinin aynı saatte başka bir oturumu var mı (tüm bootcamp'ler).
  const ids = new Set(gelecek.map((o) => o.id));
  const kisiler = new Set(gelecek.flatMap((o) => o.anlaticilar.map((a) => a.kisi_id).filter(Boolean)));
  const gorulen = new Set<string>();
  for (const k of kisiler) {
    const onunki = tum.filter((o) => !o.excelden_kalkti && o.anlaticilar.some((a) => a.kisi_id === k));
    for (const c of cakismalar(onunki)) {
      for (const [x, y] of [[c.a, c.b], [c.b, c.a]] as const) {
        const anahtar = `${x.id}|${y.id}`;
        if (!ids.has(x.id) || gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        const ad = x.anlaticilar.find((a) => a.kisi_id === k)?.ad ?? "Eğitmen";
        out.push({ o: x, neden: "cakisma", detay: `${ad}: ${y.kisa_kod} · ${y.konu || y.tur}` });
      }
    }
  }
  return out.sort((a, b) => basMs(a.o) - basMs(b.o));
}

export type Hafta = { bas: string; oturumlar: Oturum[] };

/** Oturumları takvim haftalarına (Pazartesi) böler; sıra korunur. */
export function haftalar(os: Oturum[]): Hafta[] {
  const out: Hafta[] = [];
  for (const o of os) {
    const bas = haftaBasi(o.tarih);
    if (out[out.length - 1]?.bas !== bas) out.push({ bas, oturumlar: [] });
    out[out.length - 1].oturumlar.push(o);
  }
  return out;
}
