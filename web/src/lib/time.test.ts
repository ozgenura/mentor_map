import { describe, expect, it } from "vitest";
import { farkliSaat, gunBasligi, haftaBasi, saatAraligi, trDuvar } from "./time";

const ders = { tarih: "2026-10-20", baslangic: "2026-10-20T17:30:00Z", bitis: "2026-10-20T21:00:00Z" };

describe("time", () => {
  it("TR'de gece yarısı biten ders 24:00 gösterilir", () => {
    expect(saatAraligi(ders)).toBe("20:30–24:00");
  });

  it("Berlin'deki eğitmen yaz saati bitince 2 saat geride görür", () => {
    // 20 Ekim: Berlin UTC+2 (yaz saati) -> 1 saat geride
    expect(saatAraligi(ders, "Europe/Berlin")).toBe("19:30–23:00");
    // 3 Kasım: Berlin UTC+1 -> 2 saat geride
    const kasim = { tarih: "2026-11-03", baslangic: "2026-11-03T17:30:00Z", bitis: "2026-11-03T20:00:00Z" };
    expect(saatAraligi(kasim, "Europe/Berlin")).toBe("18:30–21:00");
  });

  it("saatsiz oturum", () => {
    expect(saatAraligi({ tarih: "2026-11-04", baslangic: null, bitis: null })).toBeNull();
  });

  it("farklı saat dilimi tespiti", () => {
    expect(farkliSaat(ders.baslangic, "Europe/Istanbul")).toBe(false);
    expect(farkliSaat(ders.baslangic, "Europe/London")).toBe(true);
    expect(farkliSaat(ders.baslangic, "Asia/Riyadh")).toBe(false); // UTC+3, TR ile aynı
  });

  it("TR duvar saati", () => {
    expect(trDuvar(ders.bitis)).toBe("2026-10-21T00:00:00");
  });

  it("gün başlığı ve hafta başı", () => {
    expect(gunBasligi("2026-10-20")).toBe("Salı, 20 Ekim");
    expect(haftaBasi("2026-10-22")).toBe("2026-10-19");
    expect(haftaBasi("2026-10-19")).toBe("2026-10-19");
  });
});
