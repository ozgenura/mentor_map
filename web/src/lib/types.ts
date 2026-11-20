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
  toplanti_linki: string | null; // oturumun linki, yoksa bootcamp'in varsayılanı (görüntü için)
  /** Oturuma özel link (ham); formlar bunu düzenler. Eski demo verisinde yok. */
  oturum_toplanti_linki?: string | null;
  /** Dönemin Zoom linki (program şablonundan). */
  varsayilan_toplanti_linki?: string | null;
  /** Oturuma özel materyal linki (ham) ve dönemin materyal linki; materyal_linki ikisinden gösterileni verir. */
  oturum_materyal_linki?: string | null;
  varsayilan_materyal_linki?: string | null;
  /** Bootcamp / Uygulamalı Eğitim Programı / Hafta Sonu Eğitimleri (Genel'de yok). */
  egitim_turu?: string | null;
  excelden_kalkti?: boolean;
  /** Dönem (DA11). Geçici dönemde kodun kendisidir (DA). */
  donem_kod?: string | null;
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
  /** Genel rol: yönetici (admin) ya da üye. "asistan" eski kayıtlardan; artık bootcamp yetkisidir. */
  rol: "egitmen" | "asistan" | "yonetici";
  /** Miuul dışından eğitmen */
  dis_egitmen?: boolean;
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

/** Bootcamp'e özel yetki. Yalnızca PO düzenler; ana eğitmen ve asistan bootcamp'in tümünü görür. Eski kayıtlarda yetki yoksa ana_egitmen. */
export type YetkiTuru = "ana_egitmen" | "po" | "asistan";
export type Yetki = { bootcamp_id: string; kisi_id: string; yetki?: YetkiTuru };
export const DUZENLEYEN_YETKILER: YetkiTuru[] = ["po"];

/** Eğitim türleri (filtre sırası). */
export const EGITIM_TURLERI = ["Bootcamp", "Uygulamalı Eğitim Programı", "Hafta Sonu Eğitimleri"];
