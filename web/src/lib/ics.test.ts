import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, fold, trLocal, type IcsOturum } from "../../../supabase/functions/_shared/ics.ts";

const base: IcsOturum = {
  id: "11111111-1111-1111-1111-111111111111",
  bootcamp_ad: "İK Analitiği",
  kisa_kod: "İK",
  tarih: "2026-10-20",
  baslangic: "2026-10-20T17:30:00Z", // 20:30 TR
  bitis: "2026-10-20T21:00:00Z", // 24:00 TR = 21 Ekim 00:00
  tur: "Ders",
  konu: "Advanced HR Metrics with SQL",
  durum: "planli",
  surum: 2,
  guncelleme: "2026-10-26T09:15:00.123Z",
  anlaticilar: [{ ad: "Ayşe Kaya", rol: "ana" }],
};

const unfold = (s: string) => s.replace(/\r\n /g, "");

describe("ics", () => {
  it("TR saatini TZID ile yazar, 24:00 ertesi gün 00:00 olur", () => {
    const ics = unfold(buildCalendar("Ayşe Kaya", [base]));
    expect(ics).toContain("DTSTART;TZID=Europe/Istanbul:20261020T203000");
    expect(ics).toContain("DTEND;TZID=Europe/Istanbul:20261021T000000");
    expect(ics).toContain("UID:11111111-1111-1111-1111-111111111111@mentormap");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("DTSTAMP:20261026T091500Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("BEGIN:VTIMEZONE");
  });

  it("iptal edilen oturum CANCELLED ve gerekçeli", () => {
    const ics = unfold(buildCalendar("x", [{ ...base, durum: "iptal", iptal_gerekcesi: "Eğitmen hasta" }]));
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SUMMARY:İPTAL: [İK] Advanced HR Metrics with SQL");
    expect(ics).toContain("İptal gerekçesi: Eğitmen hasta");
  });

  it("saatsiz oturum tüm gün ve meşgul göstermez", () => {
    const ics = unfold(buildCalendar("x", [{ ...base, baslangic: null, bitis: null }]));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261020");
    expect(ics).toContain("DTEND;VALUE=DATE:20261021");
    expect(ics).toContain("TRANSP:TRANSPARENT");
    expect(ics).toContain("Saat bilgisi belirsiz.");
  });

  it("satırlar CRLF ile biter ve 75 oktetten uzun değildir", () => {
    const uzun = { ...base, konu: "Çok uzun bir konu başlığı ".repeat(8), aciklama: "Ş".repeat(100) };
    const ics = buildCalendar("Ayşe Kaya", [uzun]);
    expect(ics.endsWith("\r\n")).toBe(true);
    const enc = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain("Ş".repeat(100));
  });

  it("metin kaçışları", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("fold çok baytlı karakteri bölmez", () => {
    const folded = fold("X:" + "ğ".repeat(60));
    expect(folded.split("\r\n ").join("")).toBe("X:" + "ğ".repeat(60));
  });

  it("trLocal", () => {
    expect(trLocal("2026-11-03T16:00:00Z")).toBe("20261103T190000");
  });
});

describe("ics enjeksiyonu", () => {
  it("satır sonu içeren konu ve link yeni alan açamaz", () => {
    const ics = unfold(buildCalendar("X", [{ ...base, konu: "A\rATTENDEE:mailto:x@y\nB",
      toplanti_linki: "https://zoom.us/j/1\r\nATTENDEE:mailto:kotu@ornek.com" } as IcsOturum]));
    expect(ics).not.toMatch(/\r\nATTENDEE/);
    expect(ics).not.toContain("URL:https://zoom.us/j/1");
    expect(escapeText("a\rb")).toBe("a\\nb");
  });
});
