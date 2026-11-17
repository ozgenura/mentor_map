import { describe, expect, it } from "vitest";
import { bootcampOturumlari, dikkatGruplari, dikkatListesi, haftalar, programOzeti } from "./program";
import type { Oturum } from "./types";

const SIMDI = Date.parse("2026-11-17T12:00:00+03:00");
let n = 0;
function o(p: Partial<Oturum>): Oturum {
  const tarih = p.tarih ?? "2026-11-20";
  return {
    id: `o${++n}`, bootcamp_id: "b1", bootcamp_ad: "Data", kisa_kod: "DA", renk: "#000", tarih,
    baslangic: `${tarih}T20:30:00+03:00`, bitis: `${tarih}T23:00:00+03:00`, slot: "", tur: "Ders", konu: "Konu",
    aciklama: null, toplanti_linki: "https://zoom.us/j/1", materyal_linki: null, notlar: null, durum: "planli",
    iptal_gerekcesi: null, kaynak: "excel", uyarilar: [], anlaticilar: [{ kisi_id: "k1", ad: "Ali", rol: "ana" }], ...p,
  };
}

describe("PO paneli", () => {
  it("özet: geçen, kalan, iptal ve dönemler; kalkan oturum sayılmaz", () => {
    const os = bootcampOturumlari([
      o({ tarih: "2026-11-10", donem_kod: "DA11" }), o({ tarih: "2026-11-24", donem_kod: "DA11" }),
      o({ tarih: "2026-11-26", durum: "iptal" }), o({ tarih: "2026-11-27", excelden_kalkti: true }),
      o({ bootcamp_id: "b2" }),
    ], "b1");
    expect(programOzeti(os, SIMDI)).toEqual({ toplam: 2, gecen: 1, kalan: 1, iptal: 1, ilk: "2026-11-10", son: "2026-11-26", donemler: ["DA11"] });
  });

  it("dikkat: eğitmensiz, linksiz (etkinlik hariç), geçmiş ve iptal sayılmaz", () => {
    const a = o({ anlaticilar: [] }), b = o({ tarih: "2026-11-21", toplanti_linki: null }), c = o({ tarih: "2026-11-22", toplanti_linki: null, tur: "Etkinlik" });
    const d = o({ tarih: "2026-11-10", anlaticilar: [] }), e = o({ durum: "iptal", anlaticilar: [] });
    expect(dikkatListesi([a, b, c, d, e], [a, b, c, d, e], SIMDI).map((x) => [x.o.id, x.neden]))
      .toEqual([[a.id, "egitmen_yok"], [b.id, "link_yok"]]);
  });

  it("dikkat: eğitmenin başka bootcamp'te aynı saatte dersi varsa çakışma", () => {
    const bu = o({ tarih: "2026-11-25" });
    const baska = o({ tarih: "2026-11-25", bootcamp_id: "b2", kisa_kod: "DS", konu: "Regresyon" });
    const [d] = dikkatListesi([bu], [bu, baska], SIMDI);
    expect(d).toMatchObject({ neden: "cakisma", detay: "Ali: DS · Regresyon" });
    expect(d.o.id).toBe(bu.id);
  });

  it("haftalar Pazartesi'den başlar", () => {
    const h = haftalar([o({ tarih: "2026-11-16" }), o({ tarih: "2026-11-19" }), o({ tarih: "2026-11-23" })]);
    expect(h.map((x) => [x.bas, x.oturumlar.length])).toEqual([["2026-11-16", 2], ["2026-11-23", 1]]);
  });
});

describe("dikkat grupları", () => {
  it("türe göre öncelik sırası, en yakın tarih, 7 gün içinde olan acil", () => {
    const yakin = o({ tarih: "2026-11-19", anlaticilar: [] });
    const uzak = o({ tarih: "2026-12-10", toplanti_linki: null, varsayilan_toplanti_linki: null });
    const ds = [{ o: yakin, neden: "egitmen_yok" as const }, { o: uzak, neden: "link_yok" as const },
      { o: uzak, neden: "cakisma" as const, detay: "x" }];
    expect(dikkatGruplari(ds, SIMDI).map((g) => [g.neden, g.kalemler.length, g.enYakin, g.acil, g.varsayilanLinkYok])).toEqual([
      ["cakisma", 1, "2026-12-10", false, false],
      ["egitmen_yok", 1, "2026-11-19", true, false],
      ["link_yok", 1, "2026-12-10", false, true],
    ]);
  });
});
