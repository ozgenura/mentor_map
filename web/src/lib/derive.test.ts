import { describe, expect, it } from "vitest";
import { cakismalar, ilerlemeler, kalan, siradaki, yaziRengi } from "./derive";
import type { Oturum } from "./types";

function o(id: string, tarih: string, bas: string | null, bit: string | null, ek: Partial<Oturum> = {}): Oturum {
  const ts = (s: string | null) => (s ? new Date(`${tarih}T${s}:00+03:00`).toISOString() : null);
  return {
    id, bootcamp_id: "b1", bootcamp_ad: "İK", kisa_kod: "İK", renk: "#A897FF", tarih, baslangic: ts(bas), bitis: ts(bit),
    slot: "", tur: "Ders", konu: id, aciklama: null, toplanti_linki: null, materyal_linki: null, notlar: null,
    durum: "planli", iptal_gerekcesi: null, kaynak: "excel", uyarilar: [], anlaticilar: [{ kisi_id: "k1", ad: "A", rol: "ana" }],
    ...ek,
  };
}

const SIMDI = Date.parse("2026-11-02T12:00:00+03:00");

describe("derive", () => {
  it("sıradaki: bitmiş ve iptal olanı atlar", () => {
    const list = [o("dun", "2026-11-01", "20:00", "22:00"), o("iptal", "2026-11-03", "19:00", "20:00", { durum: "iptal" }),
      o("yarin", "2026-11-03", "20:30", "23:00")];
    expect(siradaki(list, SIMDI)?.id).toBe("yarin");
    expect(kalan(list[2], SIMDI)).toBe("Yarın");
    expect(kalan(o("x", "2026-11-07", "11:00", "12:00"), SIMDI)).toBe("5 gün sonra");
  });

  it("çakışma: kesişen KESIN, saatsiz OLASI, arka arkaya değil", () => {
    const cs = cakismalar([o("ds", "2026-11-05", "19:00", "22:00"), o("fab", "2026-11-05", "20:30", "23:00"),
      o("arka", "2026-11-06", "18:00", "20:00"), o("arka2", "2026-11-06", "20:00", "22:00"),
      o("saatsiz", "2026-11-07", null, null), o("saatli", "2026-11-07", "20:00", "21:00")]);
    expect(cs.map((c) => [c.a.id, c.b.id, c.tip])).toEqual([["ds", "fab", "KESIN"], ["saatsiz", "saatli", "OLASI"]]);
  });

  it("ilerleme: biten / toplam, yan seanslar sayılmaz", () => {
    const list = [o("a", "2026-10-20", "20:00", "22:00"), o("b", "2026-11-10", "20:00", "22:00"),
      o("yan", "2026-10-21", "11:00", "12:00", { kaynak: "uygulama" })];
    const [ik] = ilerlemeler(list, "k1", SIMDI);
    expect([ik.gecen, ik.toplam, ik.son]).toEqual([1, 2, "2026-11-10"]);
  });

  it("okunur yazı rengi", () => {
    expect(yaziRengi("#A897FF")).toBe("#22110F");
    expect(yaziRengi("#0B3B2C")).toBe("#FFFFFF");
  });
});

describe("kısaltma", () => {
  it("baş harfler, çakışınca ad + soyadın baş harfi", async () => {
    const { kisaltmaHaritasi, kartEtiketi } = await import("./derive");
    const h = kisaltmaHaritasi(["Harun Akın", "Hakan Arslan", "İrem Aksoy", "M.Gökhan Cebeci", "Rüya Yılmaz", "Işık"]);
    expect(h.get("Işık")).toBe("Işık");
    expect(h.get("Harun Akın")).toBe("Harun A.");
    expect(h.get("Hakan Arslan")).toBe("Hakan A.");
    expect(h.get("İrem Aksoy")).toBe("İA");
    expect(h.get("M.Gökhan Cebeci")).toBe("MC");
    expect(h.get("Rüya Yılmaz")).toBe("RY");
    const oturum = o("x", "2026-11-05", "20:30", "23:00", {
      kisa_kod: "DA",
      anlaticilar: [{ kisi_id: "1", ad: "Rüya Yılmaz", rol: "ana" }, { kisi_id: null, ad: "Dr. Konuk", rol: "konuk" }],
    });
    expect(kartEtiketi(oturum, h)).toBe("DA · RY +1");
    expect(kartEtiketi({ ...oturum, anlaticilar: [] }, h)).toBe("DA");
  });
});

import { guvenliLink } from "./derive";
describe("guvenliLink", () => {
  it("yalnızca http(s) linkleri geçirir", () => {
    expect(guvenliLink("https://zoom.us/j/1?pwd=x")).toBe("https://zoom.us/j/1?pwd=x");
    expect(guvenliLink("javascript:alert(1)")).toBeNull();
    expect(guvenliLink(" JaVaScRiPt:alert(1)")).toBeNull();
    expect(guvenliLink("data:text/html,<script>")).toBeNull();
    expect(guvenliLink("zoom.us/j/1")).toBeNull();
    expect(guvenliLink(null)).toBeNull();
  });
});
