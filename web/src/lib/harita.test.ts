import { describe, expect, it } from "vitest";
import { haritaKur, miniHat } from "./harita";
import type { Oturum } from "./types";

function o(id: string, bc: string, tarih: string, bas: string, bit: string, kisi = "k1", ek: Partial<Oturum> = {}): Oturum {
  const ts = (s: string) => new Date(`${tarih}T${s}:00+03:00`).toISOString();
  return {
    id, bootcamp_id: bc, bootcamp_ad: bc, kisa_kod: bc, renk: "#A897FF", tarih, baslangic: ts(bas), bitis: ts(bit),
    slot: "", tur: "Ders", konu: id, aciklama: null, toplanti_linki: null, materyal_linki: null, notlar: null,
    durum: "planli", iptal_gerekcesi: null, kaynak: "excel", uyarilar: [], anlaticilar: [{ kisi_id: kisi, ad: kisi, rol: "ana" }],
    ...ek,
  };
}
const benim = (x: Oturum) => x.anlaticilar.some((a) => a.kisi_id === "k1");

describe("harita", () => {
  const list = [
    o("ds1", "DS", "2026-10-07", "20:30", "23:00", "k2"),
    o("fab1", "FAB", "2026-10-15", "20:30", "23:00"),
    o("ds2", "DS", "2026-11-05", "19:00", "22:00"),
    o("fab2", "FAB", "2026-11-05", "20:30", "23:00"),
    o("ds3", "DS", "2026-11-19", "20:30", "23:00", "k2", { durum: "iptal" }),
  ];
  const h = haritaKur(list, benim, "2026-11-03");

  it("haftalar ve hatlar programın ilk ve son haftasına göre", () => {
    expect(h.haftalar[0]).toBe("2026-10-05");
    expect(h.haftalar.at(-1)).toBe("2026-11-16");
    expect(h.hatlar.map((x) => [x.kod, x.ilk, x.son])).toEqual([["DS", 0, 6], ["FAB", 1, 4]]);
    expect(h.bugunHafta).toBe(4);
  });

  it("duraklar: benim, iptal ve aktarma (kişisel çakışma)", () => {
    const d = (bc: string, i: number) => h.duraklar.find((x) => x.hatId === bc && x.hafta === i)!;
    expect(d("DS", 0).benim).toBe(false);
    expect(d("FAB", 1).benim).toBe(true);
    expect(d("DS", 6).iptal).toBe(true);
    expect(h.aktarmalar).toHaveLength(1);
    expect(h.aktarmalar[0].hafta).toBe(4);
    expect(d("DS", 4).cakisma && d("FAB", 4).cakisma).toBe(true);
  });

  it("başkasının çakışması aktarma sayılmaz", () => {
    const h2 = haritaKur(list, (x) => x.anlaticilar.some((a) => a.kisi_id === "k2"), "2026-11-03");
    expect(h2.aktarmalar).toHaveLength(0);
  });

  it("mini hat: oranlar ve bugün", () => {
    const m = miniHat(list.filter((x) => x.bootcamp_id === "DS"), benim, Date.parse("2026-11-03T12:00:00+03:00"));
    expect(m.noktalar.map((n) => n.anahtar)).toEqual(["2026-10-05", "2026-11-02"]); // iptal olan hafta yok
    expect(m.noktalar[0].oran).toBe(0);
    expect(m.noktalar[1].benim).toBe(true);
    expect(m.bugunOran).toBeGreaterThan(0.9);
    expect(m.bugunOran).toBeLessThan(1.0001);
  });
});
