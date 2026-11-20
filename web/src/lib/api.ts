// Veri katmanı. Canlıda Supabase; VITE_DEMO=1 iken public/demo-data.json (yerel geliştirme ve deneme sürümü).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gunEkle } from "./time";
import type { BildirimOlayi, Degisiklik, Kisi, Oturum, Yetki } from "./types";

/** Ana eğitmenin düzenleyebildiği, Excel'de olmayan alanlar */
export type OturumDetayi = { aciklama: string; toplanti_linki: string; materyal_linki: string; notlar: string };

/** Yan seans formu. Anlatıcı: kayıtlı kişi ya da adıyla yazılan konuk. Saatler TR, 'SS:DD'. */
export type YanSeans = {
  id?: string;
  bootcamp_id: string;
  tarih: string;
  baslangic: string;
  bitis: string;
  tur: string;
  konu: string;
  aciklama: string;
  toplanti_linki: string;
  anlaticilar: ({ kisi_id: string } | { konuk_ad: string })[];
};

export interface Api {
  mod: "supabase" | "demo";
  oturumlar(): Promise<Oturum[]>;
  /** Yönetici: şablondan kalkan oturumlar. */
  kalkanlar(): Promise<Oturum[]>;
  kalkanSil(id: string): Promise<void>;
  kisiler(): Promise<Kisi[]>;
  /** Giriş yapan kişinin kimliği (ana ya da ek e-postasıyla). Demoda null. */
  benimKisiId(): Promise<string | null>;
  yetkiler(): Promise<Yetki[]>;
  degisiklikler(kisiId: string): Promise<Degisiklik[]>;
  sonGuncelleme(): Promise<string | null>;
  takvimToken(kisiId: string): Promise<string | null>;
  tokenYenile(): Promise<string>;
  icsAdresi(token: string): string;
  iptal(oturumId: string, gerekce: string): Promise<void>;
  iptalGeriAl(oturumId: string): Promise<void>;
  detayGuncelle(oturumId: string, d: OturumDetayi): Promise<void>;
  yanSeansKaydet(s: YanSeans): Promise<string>;
  /** Şablondan gelen oturumun programını (tarih, saat, tür, konu, eğitmenler) düzenler; PO ve yönetici. */
  programGuncelle(s: YanSeans & { id: string }): Promise<void>;
  /** Açık şablon çakışmaları (kişinin yetkili olduğu bootcamp'ler). */
  cakismalar(): Promise<Cakisma[]>;
  cakismaCoz(id: number, secim: "sablon" | "uygulama"): Promise<void>;
  /** Durak tabelaları: anonslar (3 gün yayında) ve PO'na ilet talepleri. */
  anonslar(): Promise<Anons[]>;
  anonsYaz(bootcampId: string | null, metin: string): Promise<void>;
  anonsGorduk(idler: number[]): Promise<void>;
  talepler(): Promise<Talep[]>;
  talepGonder(bootcampId: string, konu: string, metin: string): Promise<void>;
  talepCevapla(id: number, metin: string): Promise<void>;
  talepleriOkudum(): Promise<void>;
  /** Anlık bildirim: cihaz kaydı, ders hatırlatması ayarı, deneme bildirimi. */
  pushAboneOl(a: { endpoint: string; p256dh: string; auth: string }): Promise<void>;
  pushAbonelikSil(endpoint: string): Promise<void>;
  bildirimAyari(hatirlatma?: boolean): Promise<{ hatirlatma: boolean; cihaz: number }>;
  pushDeneme(): Promise<void>;
  /** Özellik anahtarı (ör. 'tabelalar'); yöneticide hep açık. */
  ozellikAcik(anahtar: string): Promise<boolean>;
  senkronDurumu(): Promise<SenkronDurumu | null>;
  senkronAnahtariOlustur(): Promise<string>;
  senkronAdresi(): string | null;
  /** Kurum program şablonu bağlantısı (yönetici). */
  sablonDurumu(): Promise<SenkronDurumu | null>;
  sablonAnahtariOlustur(): Promise<string>;
  geriBildirimGonder(tur: GeriBildirimTuru, metin: string, sayfa: string): Promise<void>;
  /** Yönetici hepsini, diğerleri kendi gönderdiklerini alır. */
  geriBildirimler(): Promise<GeriBildirim[]>;
  geriBildirimDurum(id: number, durum: GeriBildirimDurumu): Promise<void>;
}

export type Anons = {
  id: number; metin: string; olusturma: string; bitis: string; bootcamp_id: string | null; kod: string | null; renk: string | null;
  yazan: string; gordum: boolean; benim: boolean; goren: number | null; kitle: number | null;
};
export type Talep = {
  id: number; konu: string; metin: string; olusturma: string; bootcamp_id: string; kod: string; renk: string;
  gonderen: string; benim: boolean; gelen: boolean; cevap: string | null; cevaplayan: string | null; cevap_zamani: string | null;
  okunmadi: boolean;
};
export const TALEP_KONULARI = ["Ders içeriği", "Program / saat", "Materyal / link", "Diğer"];

/** Şablon ile uygulamanın aynı alanı farklı değiştirdiği durum (Aşama C). */
export type Cakisma = {
  id: number; oturum_id: string; alan: "zaman" | "tur" | "konu" | "egitmenler";
  sablon_metni: string; uygulama_metni: string; olusturma: string;
};
export const CAKISMA_ALANI: Record<Cakisma["alan"], string> = { zaman: "Tarih ve saat", tur: "Tür", konu: "Konu", egitmenler: "Eğitmenler" };

export type GeriBildirimTuru = "oneri" | "sorun" | "diger";
export type GeriBildirimDurumu = "yeni" | "inceleniyor" | "yapildi" | "kapandi";
export type GeriBildirim = {
  id: number; kisi_id: string | null; tur: GeriBildirimTuru; metin: string; sayfa: string | null;
  durum: GeriBildirimDurumu; olusturma: string;
};

export type SenkronDurumu = {
  anahtar_var: boolean;
  anahtar_olusturma: string | null;
  son_senkron: string | null;
  son_ozet: { yeni: number; guncellenen: number; kalkan: number; hata_sayisi: number } | null;
};

const GECMIS_GUN = 120;

export const DEMO = import.meta.env.VITE_DEMO === "1";
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  !DEMO && URL_ && KEY ? createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

function sinir(): string {
  return new Date(Date.now() - GECMIS_GUN * 864e5).toISOString().slice(0, 10);
}

const SAYFA = 1000;

/** Supabase bir istekte en çok 1000 satır döndürür: hepsi gelene kadar sayfa sayfa çeker. */
async function tumSayfalar<T>(
  sayfa: (bas: number, son: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const hepsi: T[] = [];
  for (let bas = 0; ; bas += SAYFA) {
    const parca = ok(await sayfa(bas, bas + SAYFA - 1));
    hepsi.push(...parca);
    if (parca.length < SAYFA) return hepsi;
  }
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

function supabaseApi(db: SupabaseClient): Api {
  return {
    mod: "supabase",
    async oturumlar() {
      // Şablondan kalkan oturumlar gösterilmez (MM-01); yönetici ayrı listede görür (kalkanlar). Sayfa sayfa çekilir (MM-04).
      return tumSayfalar((bas, son) => db.from("oturum_gorunumu").select("*").gte("tarih", sinir()).eq("excelden_kalkti", false)
        .order("tarih").order("baslangic").order("id").range(bas, son));
    },
    async kalkanlar() {
      return ok(await db.from("oturum_gorunumu").select("*").eq("excelden_kalkti", true)
        .order("tarih", { ascending: false }).limit(200));
    },
    async kalkanSil(id) {
      ok(await db.from("oturumlar").delete().eq("id", id).eq("excelden_kalkti", true));
    },
    async benimKisiId() {
      const { data, error } = await db.rpc("mevcut_kisi_id");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    async kisiler() {
      return ok(await db.from("kisiler").select("id, ad, eposta, saat_dilimi, rol").eq("aktif", true).order("ad"));
    },
    async yetkiler() {
      return ok(await db.from("bootcamp_yetkilileri").select("bootcamp_id, kisi_id, yetki"));
    },
    async degisiklikler(kisiId) {
      const r = await db.from("bildirim_kuyrugu").select("id, olay, oturum_id, detay, olusturma")
        .eq("kisi_id", kisiId).order("olusturma", { ascending: false }).limit(50);
      return ok(r) as Degisiklik[];
    },
    async sonGuncelleme() {
      return ok(await db.rpc("son_guncelleme"));
    },
    async senkronDurumu() {
      return ok(await db.rpc("senkron_durumu")) as SenkronDurumu | null;
    },
    async senkronAnahtariOlustur() {
      return ok(await db.rpc("senkron_anahtari_olustur")) as string;
    },
    senkronAdresi() {
      return `${URL_}/functions/v1/sheets-senkron`;
    },
    async sablonDurumu() {
      return ok(await db.rpc("sablon_durumu")) as SenkronDurumu | null;
    },
    async sablonAnahtariOlustur() {
      return ok(await db.rpc("sablon_anahtari_olustur")) as string;
    },
    async takvimToken(kisiId) {
      const r = ok(await db.from("takvim_tokenlari").select("token").eq("kisi_id", kisiId).maybeSingle());
      return (r as { token: string } | null)?.token ?? null;
    },
    async tokenYenile() {
      return ok(await db.rpc("takvim_token_yenile"));
    },
    icsAdresi(token) {
      return `${URL_!.replace(/\/$/, "")}/functions/v1/ics/${token}.ics`;
    },
    async iptal(oturumId, gerekce) {
      ok(await db.rpc("oturum_iptal", { p_oturum_id: oturumId, p_gerekce: gerekce }));
    },
    async iptalGeriAl(oturumId) {
      ok(await db.rpc("oturum_iptal_geri_al", { p_oturum_id: oturumId }));
    },
    async detayGuncelle(oturumId, d) {
      ok(await db.rpc("oturum_detay_guncelle", {
        p_oturum_id: oturumId, p_aciklama: d.aciklama, p_toplanti_linki: d.toplanti_linki,
        p_materyal_linki: d.materyal_linki, p_notlar: d.notlar,
      }));
    },
    async yanSeansKaydet(s) {
      const ortak = {
        p_tarih: s.tarih, p_baslangic: s.baslangic, p_bitis: s.bitis, p_konu: s.konu, p_anlaticilar: s.anlaticilar,
        p_tur: s.tur, p_aciklama: s.aciklama, p_toplanti_linki: s.toplanti_linki,
      };
      if (s.id) {
        ok(await db.rpc("yan_seans_guncelle", { p_oturum_id: s.id, ...ortak }));
        return s.id;
      }
      return ok(await db.rpc("yan_seans_ekle", { p_bootcamp_id: s.bootcamp_id, ...ortak }));
    },
    async programGuncelle(s) {
      ok(await db.rpc("oturum_programi_guncelle", {
        p_oturum_id: s.id, p_tarih: s.tarih, p_baslangic: s.baslangic, p_bitis: s.bitis, p_tur: s.tur,
        p_konu: s.konu, p_anlaticilar: s.anlaticilar,
      }));
    },
    async cakismalar() {
      return ok(await db.from("sablon_cakismalari").select("id, oturum_id, alan, sablon_metni, uygulama_metni, olusturma")
        .is("cozum", null).order("olusturma")) as Cakisma[];
    },
    async cakismaCoz(id, secim) {
      ok(await db.rpc("sablon_cakisma_coz", { p_id: id, p_secim: secim }));
    },
    anonslar: async () => ok(await db.rpc("anonslarim")) as Anons[],
    async anonsYaz(bootcampId, metin) { ok(await db.rpc("anons_yaz", { p_bootcamp: bootcampId, p_metin: metin })); },
    async anonsGorduk(idler) { if (idler.length) ok(await db.rpc("anons_gorduk", { p_idler: idler })); },
    talepler: async () => ok(await db.rpc("taleplerim")) as Talep[],
    async talepGonder(b, konu, metin) { ok(await db.rpc("talep_gonder", { p_bootcamp: b, p_konu: konu, p_metin: metin })); },
    async talepCevapla(id, metin) { ok(await db.rpc("talep_cevapla", { p_id: id, p_metin: metin })); },
    async talepleriOkudum() { ok(await db.rpc("talepleri_okudum")); },
    async pushAboneOl(a) { ok(await db.rpc("push_abone_ol", { p_endpoint: a.endpoint, p_p256dh: a.p256dh, p_auth: a.auth })); },
    async pushAbonelikSil(endpoint) { ok(await db.rpc("push_abonelik_sil", { p_endpoint: endpoint })); },
    bildirimAyari: async (hatirlatma) => ok(await db.rpc("bildirim_ayarim", { p_hatirlatma: hatirlatma ?? null })) as { hatirlatma: boolean; cihaz: number },
    async pushDeneme() { ok(await db.rpc("push_deneme")); },
    ozellikAcik: async (anahtar) => ok(await db.rpc("ozellik_acik", { p_anahtar: anahtar })) === true,
    async geriBildirimGonder(tur, metin, sayfa) {
      ok(await db.rpc("geri_bildirim_gonder", { p_tur: tur, p_metin: metin, p_sayfa: sayfa }));
    },
    async geriBildirimler() {
      return ok(await db.from("geri_bildirimler").select("id, kisi_id, tur, metin, sayfa, durum, olusturma")
        .order("olusturma", { ascending: false }).limit(200)) as GeriBildirim[];
    },
    async geriBildirimDurum(id, durum) {
      ok(await db.rpc("geri_bildirim_durum", { p_id: id, p_durum: durum }));
    },
  };
}

// ---------------------------------------------------------------- demo
const simdi = Date.now();
const DEMO_ANONSLAR: Anons[] = [
  { id: 1, metin: "26 Kasım Perşembe dersi 21:00'e alındı. Zoom linki aynı.", olusturma: new Date(simdi - 2 * 36e5).toISOString(),
    bitis: new Date(simdi + 3 * 864e5).toISOString(), bootcamp_id: null, kod: "Fabric", renk: "#E3A008", yazan: "Elif Şahin",
    gordum: false, benim: false, goren: null, kitle: null },
];
const DEMO_TALEPLER: Talep[] = [
  { id: 1, konu: "Program / saat", metin: "Kapanış dersinde proje sunumlarına 30 dk ek süre verebilir miyiz?",
    olusturma: new Date(simdi - 3 * 864e5).toISOString(), bootcamp_id: "", kod: "Fabric", renk: "#E3A008", gonderen: "Sen",
    benim: true, gelen: false, cevap: "Olur, 23:30'a kadar uzatalım. Programı güncelledim.", cevaplayan: "Elif",
    cevap_zamani: new Date(simdi - 2 * 864e5).toISOString(), okunmadi: true },
];
// Demoda yapılan değişiklikler (iptal, düzenleme, yan seans) yalnızca bu tarayıcıda tutulur.
// Bildirimler gerçek sistemdeki gibi oturumun anlatıcılarına ve bootcamp'in ana eğitmenlerine yazılır.

type DemoDegisiklik = Omit<Degisiklik, "olusturma"> & { kisi_id: string; once_saat: number };
type DemoVeri = { olusturma: string; kisiler: Kisi[]; oturumlar: Oturum[]; yetkiler: Yetki[]; degisiklikler: DemoDegisiklik[] };
type YerelBildirim = Degisiklik & { kisi_id: string };
type Yerel = {
  iptaller: Record<string, string | null>;          // oturum id -> gerekçe (null = geri alındı)
  duzenlemeler: Record<string, Partial<Oturum>>;    // oturum id -> değişen alanlar
  yeniSeanslar: Oturum[];
  bildirimler: YerelBildirim[];
  geriBildirimler?: GeriBildirim[];
  anonslar?: Anons[];
  talepler?: Talep[];
};

const YEREL_ANAHTAR = "mm-demo-yerel";
function yereliOku(): Yerel {
  const bos: Yerel = { iptaller: {}, duzenlemeler: {}, yeniSeanslar: [], bildirimler: [] };
  try {
    return { ...bos, ...JSON.parse(localStorage.getItem(YEREL_ANAHTAR) || "{}") };
  } catch {
    return bos;
  }
}
let yerel: Yerel = yereliOku();
function yereliYaz(degisim: Partial<Yerel>) {
  yerel = { ...yerel, ...degisim };
  try {
    localStorage.setItem(YEREL_ANAHTAR, JSON.stringify(yerel));
  } catch {
    /* depolama kapalıysa değişiklikler sayfa yenilenene kadar yaşar */
  }
}

let demoCache: Promise<DemoVeri> | null = null;
function demoVeri(): Promise<DemoVeri> {
  demoCache ??= fetch(`${import.meta.env.BASE_URL}demo-data.json`).then((r) => {
    if (!r.ok) throw new Error("demo-data.json bulunamadı (npm run demo-data)");
    return r.json();
  });
  return demoCache;
}

async function demoOturumlar(): Promise<Oturum[]> {
  const v = await demoVeri();
  return [...v.oturumlar, ...yerel.yeniSeanslar].map((o) => {
    let s = { ...o, ...(yerel.duzenlemeler[o.id] ?? {}) };
    if (o.id in yerel.iptaller) {
      const g = yerel.iptaller[o.id];
      s = g === null ? { ...s, durum: "planli", iptal_gerekcesi: null } : { ...s, durum: "iptal", iptal_gerekcesi: g };
    }
    return s;
  });
}

/** TR tarih + 'SS:DD' -> ISO. '24:00' ertesi gün 00:00 olur. */
function trIso(tarih: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.parse(`${tarih}T00:00:00+03:00`) + (h * 60 + m) * 6e4).toISOString();
}

async function bildir(oturumId: string, olay: BildirimOlayi, detay: Record<string, string | null> = {}) {
  const v = await demoVeri();
  const o = (await demoOturumlar()).find((x) => x.id === oturumId);
  if (!o) return;
  const kisiler = new Set([
    ...o.anlaticilar.map((a) => a.kisi_id).filter((k): k is string => !!k),
    ...v.yetkiler.filter((y) => y.bootcamp_id === o.bootcamp_id).map((y) => y.kisi_id),
  ]);
  const zaman = new Date().toISOString();
  const yeni = [...kisiler].map((kisi_id, i) => ({ id: Date.now() * 100 + i, kisi_id, olay, oturum_id: oturumId, detay, olusturma: zaman }));
  yereliYaz({ bildirimler: [...yerel.bildirimler, ...yeni] });
}

const demoApi: Api = {
  mod: "demo",
  oturumlar: demoOturumlar,
  kalkanlar: async () => [],
  kalkanSil: async () => {},
  kisiler: async () => (await demoVeri()).kisiler,
  benimKisiId: async () => null,
  // Eski demo verisinde yetki türü yok; o kişiler demoda düzenleyebilsin diye PO sayılır.
  yetkiler: async () => (await demoVeri()).yetkiler.map((y) => ({ ...y, yetki: y.yetki ?? "po" })),
  async degisiklikler(kisiId) {
    const simdi = Date.now();
    const sabit = (await demoVeri()).degisiklikler
      .filter((d) => d.kisi_id === kisiId)
      .map(({ once_saat, kisi_id: _k, ...d }) => ({ ...d, olusturma: new Date(simdi - once_saat * 36e5).toISOString() }));
    const yeni = yerel.bildirimler.filter((d) => d.kisi_id === kisiId).map(({ kisi_id: _k, ...d }) => d);
    return [...yeni, ...sabit].sort((a, b) => b.olusturma.localeCompare(a.olusturma));
  },
  sonGuncelleme: async () => new Date(Date.now() - 3 * 36e5).toISOString(),
  senkronDurumu: async () => null,
  senkronAnahtariOlustur: async () => { throw new Error("Demoda yok"); },
  senkronAdresi: () => null,
  sablonDurumu: async () => null,
  sablonAnahtariOlustur: async () => { throw new Error("Demoda yok"); },
  async geriBildirimGonder(tur, metin, sayfa) {
    const kisi = (() => { try { return localStorage.getItem("mm-demo-kisi"); } catch { return null; } })();
    yereliYaz({ geriBildirimler: [{ id: Date.now(), kisi_id: kisi, tur, metin, sayfa, durum: "yeni", olusturma: new Date().toISOString() },
      ...(yerel.geriBildirimler ?? [])] });
  },
  geriBildirimler: async () => yerel.geriBildirimler ?? [],
  async geriBildirimDurum(id, durum) {
    yereliYaz({ geriBildirimler: (yerel.geriBildirimler ?? []).map((g) => (g.id === id ? { ...g, durum } : g)) });
  },
  takvimToken: async (kisiId) => `demo-${kisiId.slice(0, 8)}`,
  tokenYenile: async () => `demo-${Math.random().toString(16).slice(2, 10)}`,
  icsAdresi: (token) => `https://<proje>.supabase.co/functions/v1/ics/${token}.ics`,
  async iptal(oturumId, gerekce) {
    yereliYaz({ iptaller: { ...yerel.iptaller, [oturumId]: gerekce } });
    await bildir(oturumId, "iptal", { gerekce });
  },
  async iptalGeriAl(oturumId) {
    yereliYaz({ iptaller: { ...yerel.iptaller, [oturumId]: null } });
    await bildir(oturumId, "iptal_geri_alma");
  },
  async detayGuncelle(oturumId, d) {
    const bosIseNull = (s: string) => s.trim() || null;
    yereliYaz({ duzenlemeler: { ...yerel.duzenlemeler, [oturumId]: {
      ...(yerel.duzenlemeler[oturumId] ?? {}), aciklama: bosIseNull(d.aciklama), toplanti_linki: bosIseNull(d.toplanti_linki),
      materyal_linki: bosIseNull(d.materyal_linki), notlar: bosIseNull(d.notlar),
    } } });
  },
  async programGuncelle(s) {
    await demoApi.yanSeansKaydet(s);
  },
  cakismalar: async () => [],
  anonslar: async () => (yerel.anonslar ?? DEMO_ANONSLAR),
  async anonsYaz(bootcampId, metin) {
    const tum = await demoOturumlar();
    const o = tum.find((x) => x.bootcamp_id === bootcampId);
    yereliYaz({ anonslar: [{ id: Date.now(), metin, olusturma: new Date().toISOString(), bitis: new Date(Date.now() + 3 * 864e5).toISOString(),
      bootcamp_id: bootcampId, kod: o?.kisa_kod ?? null, renk: o?.renk ?? "#8F807A", yazan: "Sen", gordum: true, benim: true, goren: 0, kitle: 8 },
      ...(yerel.anonslar ?? DEMO_ANONSLAR)] });
  },
  async anonsGorduk(idler) {
    yereliYaz({ anonslar: (yerel.anonslar ?? DEMO_ANONSLAR).map((a) => (idler.includes(a.id) ? { ...a, gordum: true } : a)) });
  },
  talepler: async () => (yerel.talepler ?? DEMO_TALEPLER),
  async talepGonder(bootcampId, konu, metin) {
    const tum = await demoOturumlar();
    const o = tum.find((x) => x.bootcamp_id === bootcampId);
    yereliYaz({ talepler: [{ id: Date.now(), konu, metin, olusturma: new Date().toISOString(), bootcamp_id: bootcampId,
      kod: o?.kisa_kod ?? "", renk: o?.renk ?? "#8F807A", gonderen: "Sen", benim: true, gelen: false, cevap: null, cevaplayan: null,
      cevap_zamani: null, okunmadi: false }, ...(yerel.talepler ?? DEMO_TALEPLER)] });
  },
  async talepCevapla(id, metin) {
    yereliYaz({ talepler: (yerel.talepler ?? DEMO_TALEPLER).map((t) => (t.id === id
      ? { ...t, cevap: metin, cevaplayan: "Sen", cevap_zamani: new Date().toISOString(), okunmadi: false } : t)) });
  },
  async talepleriOkudum() {
    yereliYaz({ talepler: (yerel.talepler ?? DEMO_TALEPLER).map((t) => ({ ...t, okunmadi: false })) });
  },
  async pushAboneOl() { throw new Error("Demoda bildirim açılamaz."); },
  async pushAbonelikSil() { /* demo */ },
  bildirimAyari: async () => ({ hatirlatma: false, cihaz: 0 }),
  async pushDeneme() { throw new Error("Demoda bildirim yok."); },
  ozellikAcik: async () => true,
  async cakismaCoz() { /* demoda şablon yok */ },
  async yanSeansKaydet(s) {
    const v = await demoVeri();
    const tum = await demoOturumlar();
    const ornek = tum.find((o) => o.bootcamp_id === s.bootcamp_id);
    if (!ornek) throw new Error("Bootcamp bulunamadı");
    const adlar = new Map(v.kisiler.map((k) => [k.id, k.ad]));
    const anlaticilar = s.anlaticilar.map((a, i) => "kisi_id" in a
      ? { kisi_id: a.kisi_id, ad: adlar.get(a.kisi_id) ?? "?", rol: (i === 0 ? "ana" : "yardimci") as "ana" | "yardimci" }
      : { kisi_id: null, ad: a.konuk_ad.trim(), rol: "konuk" as const });
    const alanlar: Partial<Oturum> = {
      tarih: s.tarih, baslangic: trIso(s.tarih, s.baslangic),
      bitis: trIso(s.bitis <= s.baslangic ? gunEkle(s.tarih, 1) : s.tarih, s.bitis), tur: s.tur,
      konu: s.konu.trim(), aciklama: s.aciklama.trim() || null, toplanti_linki: s.toplanti_linki.trim() || null, anlaticilar,
    };
    if (s.id) {
      const eski = yerel.yeniSeanslar.find((o) => o.id === s.id);
      if (eski) yereliYaz({ yeniSeanslar: yerel.yeniSeanslar.map((o) => (o.id === s.id ? { ...o, ...alanlar } : o)) });
      else yereliYaz({ duzenlemeler: { ...yerel.duzenlemeler, [s.id]: { ...(yerel.duzenlemeler[s.id] ?? {}), ...alanlar } } });
      await bildir(s.id, "yan_seans_degisti");
      return s.id;
    }
    const id = `yerel-${Date.now().toString(36)}`;
    const yeni: Oturum = {
      ...ornek, ...alanlar, id, slot: "yan-seans", materyal_linki: null, notlar: null, durum: "planli",
      iptal_gerekcesi: null, kaynak: "uygulama", uyarilar: [],
    } as Oturum;
    yereliYaz({ yeniSeanslar: [...yerel.yeniSeanslar, yeni] });
    await bildir(id, "yan_seans_eklendi");
    return id;
  },
};

export const api: Api | null = DEMO ? demoApi : supabase ? supabaseApi(supabase) : null;
