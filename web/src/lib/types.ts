export type AnlaticiRolu = "ana" | "yardimci" | "konuk";

export type Anlatici = { kisi_id: string | null; ad: string; rol: AnlaticiRolu };

/** public.oturum_gorunumu satırı */
export type Oturum = {
  id: string;
  bootcamp_id: string;
  bootcamp_ad: string;
  kisa_kod: string;
  renk: string;
  tarih: string; // YYYY-MM-DD (TR günü)
  baslangic: string | null; // ISO; null = saat bilinmiyor
  bitis: string | null;
  slot: string;
  tur: string;
  konu: string;
  aciklama: string | null;
  toplanti_linki: string | null;
  materyal_linki: string | null;
  notlar: string | null;
  durum: "planli" | "iptal";
  iptal_gerekcesi: string | null;
  kaynak: "excel" | "uygulama";
  uyarilar: string[];
  anlaticilar: Anlatici[];
};

export type Kisi = {
  id: string;
  ad: string;
  eposta: string;
  saat_dilimi: string;
  rol: "egitmen" | "yonetici";
};

export type BildirimOlayi =
  | "iptal" | "iptal_geri_alma" | "zaman_degisti" | "yan_seans_eklendi" | "yan_seans_degisti"
  | "atandin" | "atamadan_cikarildin";

/** public.bildirim_kuyrugu satırı: kişinin "Ne değişti" akışı */
export type Degisiklik = {
  id: number;
  olay: BildirimOlayi;
  oturum_id: string | null;
  detay: Record<string, string | null>;
  olusturma: string; // ISO
};

export type Yetki = { bootcamp_id: string; kisi_id: string };
