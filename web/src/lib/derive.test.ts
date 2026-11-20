import { describe, expect, it } from "vitest";
import { cakismalar, gectiMi, ilerlemeler, kalan, katilimZamani, siradaki, sonrakiOturum, yaziRengi } from "./derive";
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

import { anlattigiMi, benimMi } from "./derive";

describe("benimMi (roller)", () => {
  const ders = o("x", "2026-11-03", "20:30", "23:00", { bootcamp_id: "da" });
  it("anlatıcı kendi oturumunu görür", () => {
    expect(benimMi(ders, "k1")).toBe(true);
    expect(benimMi(ders, "k2")).toBe(false);
  });
  it("asistan / PO sorumlu olduğu bootcamp'in oturumunu görür ama anlatıcı sayılmaz", () => {
    expect(benimMi(ders, "k2", new Set(["da"]))).toBe(true);
    expect(benimMi(ders, "k2", new Set(["ik"]))).toBe(false);
    expect(anlattigiMi(ders, "k2")).toBe(false);
  });
});

import { kisiEtiketi, seansSuresiDk } from "../components/SeansFormu";
import { bugunTR } from "./time";
import { vi } from "vitest";

describe("Faz 0", () => {
  it("gece yarısını geçen seans süresi (MM-05)", () => {
    expect(seansSuresiDk("20:30", "00:00")).toBe(210);
    expect(seansSuresiDk("23:00", "01:00")).toBe(120);
    expect(seansSuresiDk("19:00", "22:00")).toBe(180);
    expect(seansSuresiDk("20:00", "19:00")).toBe(23 * 60);
  });
  it("anlatıcı listesinde herkes, rolüyle (MM-06)", () => {
    expect(kisiEtiketi({ id: "1", ad: "Özge", eposta: "", saat_dilimi: "Europe/Istanbul", rol: "yonetici" })).toBe("Özge (admin)");
    expect(kisiEtiketi({ id: "2", ad: "Dora", eposta: "", saat_dilimi: "Europe/Istanbul", rol: "egitmen", dis_egitmen: true })).toBe("Dora")  // iç/dış ayrımı uygulamada gösterilmez;
    expect(kisiEtiketi({ id: "3", ad: "Can", eposta: "", saat_dilimi: "Europe/Istanbul", rol: "egitmen" })).toBe("Can");
  });
  it("TR saatiyle 01:00'de bugün, UTC'deki dün değildir (MM-08)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T22:30:00Z")); // TR 17 Kasım 01:30
    expect(bugunTR()).toBe("2026-11-17");
    vi.useRealTimers();
  });
});

import { yetkiAdi } from "../components/OturumDetay";

describe("rol modeli", () => {
  it("rozet yalnızca admin ya da PO", () => {
    expect(yetkiAdi(true, [])).toBe("Admin");
    expect(yetkiAdi(false, ["po"])).toBe("PO");
    expect(yetkiAdi(true, ["po"])).toBe("PO");
  });
});

describe("takvim geri bildirimi (18 Kasım)", () => {
  const ders = o("ders", "2026-11-02", "20:30", "23:00");
  it("geçmiş: bitiş saatinden sonra", () => {
    expect(gectiMi(ders, Date.parse("2026-11-02T22:59:00+03:00"))).toBe(false);
    expect(gectiMi(ders, Date.parse("2026-11-02T23:00:00+03:00"))).toBe(true);
  });
  it("derse katıl: 30 dk kala başlar, ders bitince biter; iptalde yok", () => {
    expect(katilimZamani(ders, Date.parse("2026-11-02T19:59:00+03:00"))).toBe(false);
    expect(katilimZamani(ders, Date.parse("2026-11-02T20:00:00+03:00"))).toBe(true);
    expect(katilimZamani(ders, Date.parse("2026-11-02T22:30:00+03:00"))).toBe(true);
    expect(katilimZamani(ders, Date.parse("2026-11-02T23:00:00+03:00"))).toBe(false);
    expect(katilimZamani({ ...ders, durum: "iptal" }, Date.parse("2026-11-02T20:40:00+03:00"))).toBe(false);
  });
  it("sonraki oturum: verilen günden itibaren ilk planlı", () => {
    const list = [o("a", "2026-11-03", "20:00", "21:00", { durum: "iptal" }), o("b", "2026-11-10", "20:00", "21:00"), o("c", "2026-11-05", "20:00", "21:00")];
    expect(sonrakiOturum(list, "2026-11-03")?.id).toBe("c");
    expect(sonrakiOturum(list, "2026-11-11")).toBeUndefined();
  });
});
