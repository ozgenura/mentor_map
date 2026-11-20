import { describe, expect, it } from "vitest";
import { yonelme } from "../components/Tabelalar";

describe("PO'na ilet", () => {
  it("yönelme eki: Seda'ya, Şafak'a, Elif'e, Tutku'ya, Enes'e", () => {
    expect(["Seda", "Şafak", "Elif", "Tutku", "Enes", "Dilruba", "Furkan"].map(yonelme))
      .toEqual(["Seda'ya", "Şafak'a", "Elif'e", "Tutku'ya", "Enes'e", "Dilruba'ya", "Furkan'a"]);
  });
});
