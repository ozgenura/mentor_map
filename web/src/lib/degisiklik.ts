// Bildirim kayıtlarını ve çakışmaları "Ne değişti" kartlarına çevirir.

import { gosterim, type SaatModu } from "./baglam";
import type { Cakisma } from "./derive";
import { gorece, gunBasligi } from "./time";
import type { Degisiklik, Oturum } from "./types";

export type DegisiklikKarti = {
  anahtar: string;
  rozet: "yeni" | "cakisma" | "iptal" | "saat" | "gri";
  rozetMetin: string;
  baslik: string;
  alt: string;
  eski?: string;  // değişiklikte eski değer (üstü çizili)
  yeni?: string;
  zaman?: string; // "2 saat önce"
  zamanMs: number;
  oturum?: Oturum;
};

function oturumAlt(o: Oturum, tz: string, mod: SaatModu): string {
  const g = gosterim(o, tz, mod);
  return [gunBasligi(o.tarih), g.ana ? `${g.ana} ${g.birim}` : "Saat belirsiz", o.kisa_kod].join(" · ");
}

export function degisiklikKarti(d: Degisiklik, o: Oturum | undefined, tz: string, mod: SaatModu): DegisiklikKarti {
  const zamanMs = Date.parse(d.olusturma);
  const ortak = { anahtar: `d${d.id}`, zaman: gorece(d.olusturma), zamanMs, oturum: o };
  const konu = o?.konu || "Bir oturum";
  const alt = o ? oturumAlt(o, tz, mod) : "";
  switch (d.olay) {
    case "yan_seans_eklendi":
      return { ...ortak, rozet: "yeni", rozetMetin: "Yeni seans", baslik: `${konu} seansına anlatıcı olarak eklendin`,
        alt: d.detay.ekleyen ? `${alt} · ${d.detay.ekleyen} ekledi` : alt };
    case "atandin":
      return { ...ortak, rozet: "yeni", rozetMetin: "Atandın", baslik: `${konu} oturumuna atandın`, alt };
    case "atamadan_cikarildin":
      return { ...ortak, rozet: "gri", rozetMetin: "Çıkarıldın", baslik: `${konu} oturumundan çıkarıldın`, alt };
    case "iptal":
      return { ...ortak, rozet: "iptal", rozetMetin: "İptal", baslik: `${konu} iptal edildi`,
        alt: d.detay.gerekce ? `${alt} · ${d.detay.gerekce}` : alt };
    case "iptal_geri_alma":
      return { ...ortak, rozet: "yeni", rozetMetin: "Geri alındı", baslik: `${konu} yeniden programda`, alt };
    case "yan_seans_degisti":
      return { ...ortak, rozet: "saat", rozetMetin: "Güncellendi", baslik: `${konu} güncellendi`, alt };
    case "zaman_degisti": {
      const eski = d.detay.eski_baslangic && o
        ? gosterim({ tarih: o.tarih, baslangic: d.detay.eski_baslangic, bitis: d.detay.eski_bitis ?? null }, tz, mod)
        : null;
      const yeni = o ? gosterim(o, tz, mod) : null;
      return { ...ortak, rozet: "saat", rozetMetin: "Saat", baslik: `${konu}: saat değişti`, alt: o ? `${gunBasligi(o.tarih)} · ${o.kisa_kod}` : "",
        eski: eski?.ana ? `${eski.ana}` : "Saat belirsiz", yeni: yeni?.ana ? `${yeni.ana} ${yeni.birim}` : "Saat belirsiz" };
    }
  }
}

export function cakismaKarti(c: Cakisma, tz: string, mod: SaatModu): DegisiklikKarti {
  const s = (o: Oturum) => {
    const g = gosterim(o, tz, mod);
    return `${g.ana ?? "Saat belirsiz"} ${o.kisa_kod}`;
  };
  return {
    anahtar: `c${c.a.id}${c.b.id}`, rozet: "cakisma", rozetMetin: c.tip === "KESIN" ? "Çakışma" : "Olası çakışma",
    baslik: `${gunBasligi(c.a.tarih)}: iki oturumun üst üste`, alt: `${s(c.a)} ve ${s(c.b)}`,
    zamanMs: Number.MAX_SAFE_INTEGER, oturum: c.a,
  };
}
