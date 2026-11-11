// Veri katmanı. Canlıda Supabase; VITE_DEMO=1 iken public/demo-data.json (yerel geliştirme ve deneme sürümü).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  kisiler(): Promise<Kisi[]>;
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
  senkronDurumu(): Promise<SenkronDurumu | null>;
  senkronAnahtariOlustur(): Promise<string>;
  senkronAdresi(): string | null;
}

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

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

function supabaseApi(db: SupabaseClient): Api {
  return {
    mod: "supabase",
    async oturumlar() {
      return ok(await db.from("oturum_gorunumu").select("*").gte("tarih", sinir()).order("tarih").order("baslangic"));
    },
    async kisiler() {
      return ok(await db.from("kisiler").select("id, ad, eposta, saat_dilimi, rol, dis_egitmen").eq("aktif", true).order("ad"));
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
  };
}

// ---------------------------------------------------------------- demo
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
  kisiler: async () => (await demoVeri()).kisiler,
  yetkiler: async () => (await demoVeri()).yetkiler,
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
      tarih: s.tarih, baslangic: trIso(s.tarih, s.baslangic), bitis: trIso(s.tarih, s.bitis), tur: s.tur,
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
