import { describe, expect, it } from "vitest";
import { etkinlikGruplari, etkinlikMi } from "./etkinlik";
import type { Oturum } from "./types";

function o(id: string, tarih: string, ek: Partial<Oturum> = {}): Oturum {
  return {
    id, bootcamp_id: "b", bootcamp_ad: "DA", kisa_kod: "DA", renk: "#000000", tarih,
    baslangic: `${tarih}T17:30:00.000Z`, bitis: `${tarih}T20:00:00.000Z`, slot: "", tur: "Etkinlik", konu: id,
    aciklama: null, toplanti_linki: null, materyal_linki: null, notlar: null, durum: "planli", iptal_gerekcesi: null,
    kaynak: "excel", uyarilar: [], anlaticilar: [], ...ek,
  };
}

describe("etkinlikler", () => {
  const SIMDI = Date.parse("2026-11-12T12:00:00Z");
  const tum = [
    o("ders", "2026-11-20", { tur: "Ders" }),
    o("genel", "2026-12-03", { tur: "Ders", kisa_kod: "Genel" }),
    o("kasim", "2026-11-25"),
    o("eski", "2026-10-02"),
  ];
  it("Etkinlik türü ve Genel bootcamp etkinlik sayılır, ders sayılmaz", () => {
    expect(tum.filter(etkinlikMi).map((x) => x.id)).toEqual(["genel", "kasim", "eski"]);
  });
  it("yaklaşanlar aylara bölünür, geçmiş ayrı tutulur", () => {
    const g = etkinlikGruplari(tum, "", SIMDI);
    expect(g.yaklasan.map((a) => [a.ay, a.etkinlikler.map((x) => x.id)])).toEqual([["2026-11", ["kasim"]], ["2026-12", ["genel"]]]);
    expect(g.gecmis[0].etkinlikler[0].id).toBe("eski");
  });
  it("bootcamp süzgeci", () => {
    expect(etkinlikGruplari(tum, "Genel", SIMDI).yaklasan.flatMap((a) => a.etkinlikler.map((x) => x.id))).toEqual(["genel"]);
  });
});
