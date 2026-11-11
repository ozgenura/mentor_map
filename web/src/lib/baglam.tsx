// Ekranların paylaştığı durum: veri, giriş yapan kişi, saat gösterim tercihi, seçili oturum.

import { createContext, useContext } from "react";
import type { Api } from "./api";
import type { Cakisma } from "./derive";
import { farkliSaat, saatAraligi, sehir, TR } from "./time";
import type { Degisiklik, Kisi, Oturum, Yetki } from "./types";

export type SaatModu = "tr" | "yerel";

export type Baglam = {
  api: Api;
  tum: Oturum[];
  benimler: Oturum[];
  kisiler: Kisi[];
  ben: Kisi | undefined;
  tz: string;
  saatModu: SaatModu;
  setSaatModu: (m: SaatModu) => void;
  /** Bootcamp'te düzenleme yetkisi: yönetici, ana eğitmen ya da PO. */
  anaEgitmenMi: (bootcampId: string) => boolean;
  /** Kişinin bootcamp yetkileri (ana eğitmen, PO, asistan). */
  yetkilerim: Yetki[];
  /** Asistan ya da PO olduğu bootcamp'ler: tüm oturumları kişinin takviminde görünür. */
  sorumlu: ReadonlySet<string>;
  /** Oturum kişinin takviminde mi (anlatıyor ya da bootcamp'ten sorumlu). */
  banaMi: (o: Oturum) => boolean;
  sec: (o: Oturum) => void;
  cakismalar: Cakisma[];
  cakisanlar: Set<string>;
  degisiklikler: Degisiklik[];
  yeniDegisiklik: number;
  sonGorulme: number;
  okunduSay: () => void;
  sonGuncelleme: string | null;
  git: (s: Sekme) => void;
  /** Yalnızca gerçek modda yönetici için: başka bir kişinin gözünden bakma. */
  bakis: { yonetici: true; aktif: boolean; gercekAd: string; sec: (kisiId: string | null) => void } | null;
};

export type Sekme = "bugun" | "takvim" | "degisenler" | "profil";

export const BaglamCtx = createContext<Baglam | null>(null);

export function useBaglam(): Baglam {
  const b = useContext(BaglamCtx);
  if (!b) throw new Error("BaglamCtx yok");
  return b;
}

export type Gosterim = { ana: string | null; birim: string; ikincil: string | null };

/** Bir oturumun saatini kişinin tercihine göre: ana satır + diğer saat diliminde ikinci satır. */
export function gosterim(o: Pick<Oturum, "tarih" | "baslangic" | "bitis">, tz: string, mod: SaatModu): Gosterim {
  const tr = saatAraligi(o);
  if (!tr) return { ana: null, birim: "", ikincil: null };
  const fark = farkliSaat(o.baslangic, tz);
  // Şehir adına ek getirmiyoruz ("Berlin'de" / "London'da" ünlü uyumu): "Berlin 18:30–21:00" biçimi.
  if (mod === "yerel" && fark) return { ana: saatAraligi(o, tz), birim: sehir(tz), ikincil: `TR ${tr}` };
  return { ana: tr, birim: "TR", ikincil: fark ? `${sehir(tz)} ${saatAraligi(o, tz)}` : null };
}

export const TR_TZ = TR;
