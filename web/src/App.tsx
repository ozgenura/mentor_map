import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Giris } from "./components/Giris";
import { Kabuk } from "./components/Kabuk";
import { OturumDetay } from "./components/OturumDetay";
import { Logo } from "./components/ui";
import { api, DEMO, type Api } from "./lib/api";
import { BaglamCtx, type Baglam, type SaatModu, type Sekme } from "./lib/baglam";
import { cikis, useKimlik } from "./lib/kimlik";
import { anlattigiMi, benimMi, cakisanIdler, cakismalar, siradaki } from "./lib/derive";
import { TR } from "./lib/time";
import { DUZENLEYEN_YETKILER, type Kisi, type Oturum } from "./lib/types";
import { Bugun } from "./pages/Bugun";
import { Degisenler } from "./pages/Degisenler";
import { Etkinlikler } from "./pages/Etkinlikler";
import { Profil } from "./pages/Profil";
import { TakvimSayfasi } from "./pages/TakvimSayfasi";

function oku(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function yaz(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* depolama kapalı: tercih sadece bu oturumda yaşar */
  }
}

export default function App() {
  const kimlik = useKimlik();
  if (!api) return <Kurulum />;
  if (kimlik.yukleniyor) return <Tam>Yükleniyor…</Tam>;
  if (!DEMO && !kimlik.eposta) return <Giris />;
  return <Ana api={api} eposta={kimlik.eposta} demoKisiId={kimlik.demoKisiId} />;
}

const SEKMELER: Sekme[] = ["bugun", "takvim", "etkinlikler", "degisenler", "profil"];

function Ana({ api, eposta, demoKisiId }: { api: Api; eposta: string | null; demoKisiId: string | null }) {
  const kisiler = useQuery({ queryKey: ["kisiler"], queryFn: api.kisiler });
  const oturumlar = useQuery({ queryKey: ["oturumlar"], queryFn: api.oturumlar, refetchInterval: 5 * 60_000 });
  const yetkiler = useQuery({ queryKey: ["yetkiler"], queryFn: api.yetkiler });
  const sonGuncelleme = useQuery({ queryKey: ["son"], queryFn: api.sonGuncelleme });
  const [demoId, setDemoId] = useState(demoKisiId);
  const [bakisId, setBakisIdDurum] = useState<string | null>(() => {
    try { return sessionStorage.getItem("mm-bakis"); } catch { return null; }
  });
  const setBakisId = useCallback((id: string | null) => {
    setBakisIdDurum(id);
    try { if (id) sessionStorage.setItem("mm-bakis", id); else sessionStorage.removeItem("mm-bakis"); } catch { /* yoksay */ }
  }, []);

  const ben: Kisi | undefined = useMemo(() => {
    const list = kisiler.data ?? [];
    if (DEMO) {
      // Demoda varsayılan: seçilmiş kişi, yoksa Can Yıldız (uydurma veri), yoksa sıradaki oturumu en yakın eğitmen.
      const sira = siradaki((oturumlar.data ?? []).filter((o) => o.anlaticilar.some((a) => a.kisi_id)));
      const enYakin = sira?.anlaticilar.find((a) => a.kisi_id)?.kisi_id;
      return list.find((k) => k.id === demoId) ?? list.find((k) => k.ad === "Can Yıldız")
        ?? list.find((k) => k.id === enYakin) ?? list[0];
    }
    const gercek = list.find((k) => k.eposta.toLowerCase() === eposta);
    // Yönetici başka bir kişinin gözünden bakabilir (yalnızca görüntü; veritabanı yetkisi değişmez).
    if (gercek?.rol === "yonetici" && bakisId) return list.find((k) => k.id === bakisId) ?? gercek;
    return gercek;
  }, [kisiler.data, oturumlar.data, eposta, demoId, bakisId]);
  const gercekBen = useMemo(() => (kisiler.data ?? []).find((k) => k.eposta.toLowerCase() === eposta), [kisiler.data, eposta]);

  const degisiklikler = useQuery({
    queryKey: ["degisiklikler", ben?.id], queryFn: () => api.degisiklikler(ben!.id), enabled: !!ben, refetchInterval: 5 * 60_000,
  });

  // Sekme adres çubuğunda (#takvim) tutulur: geri tuşu ve yer imi çalışır.
  const [sekme, setSekme] = useState<Sekme>(() => {
    const h = location.hash.slice(1) as Sekme;
    return SEKMELER.includes(h) ? h : "bugun";
  });
  useEffect(() => {
    const f = () => {
      const h = location.hash.slice(1) as Sekme;
      setSekme(SEKMELER.includes(h) ? h : "bugun");
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const git = useCallback((s: Sekme) => {
    location.hash = s === "bugun" ? "" : s;
    setSekme(s);
    window.scrollTo({ top: 0 });
  }, []);

  const [saatModu, setSaatModuDurum] = useState<SaatModu>(() => (oku("mm-saat") as SaatModu) || "tr");
  const setSaatModu = useCallback((m: SaatModu) => { setSaatModuDurum(m); yaz("mm-saat", m); }, []);

  const sonGorulmeAnahtari = `mm-son-gorulme-${ben?.id ?? "x"}`;
  const [sonGorulme, setSonGorulme] = useState(0);
  useEffect(() => {
    // İlk açılışta son 7 gün "yeni" sayılır.
    setSonGorulme(Number(oku(sonGorulmeAnahtari)) || Date.now() - 7 * 864e5);
  }, [sonGorulmeAnahtari]);
  const okunduSay = useCallback(() => {
    const t = Date.now();
    setSonGorulme(t);
    yaz(sonGorulmeAnahtari, String(t));
  }, [sonGorulmeAnahtari]);

  const [seciliId, setSeciliId] = useState<string | null>(null);
  const kapat = useCallback(() => setSeciliId(null), []);

  const tum = oturumlar.data ?? [];
  const yetkilerim = useMemo(() => (yetkiler.data ?? []).filter((y) => y.kisi_id === ben?.id), [yetkiler.data, ben]);
  const sorumlu = useMemo(() => new Set(yetkilerim.filter((y) => y.yetki === "asistan" || y.yetki === "po").map((y) => y.bootcamp_id)),
    [yetkilerim]);
  const banaMi = useCallback((o: Oturum) => benimMi(o, ben?.id, sorumlu), [ben, sorumlu]);
  const benimler = useMemo(() => tum.filter(banaMi), [tum, banaMi]);
  // Çakışma yalnızca anlattığı oturumlar arasında: asistanın takip ettiği iki bootcamp aynı saatte olabilir.
  const cs = useMemo(() => cakismalar(ben ? tum.filter((o) => anlattigiMi(o, ben.id)) : []), [tum, ben]);

  const baglam: Baglam = {
    api, tum, benimler, kisiler: kisiler.data ?? [], ben,
    tz: ben?.saat_dilimi ?? TR, saatModu, setSaatModu,
    anaEgitmenMi: (bid) => ben?.rol === "yonetici"
      || yetkilerim.some((y) => y.bootcamp_id === bid && DUZENLEYEN_YETKILER.includes(y.yetki ?? "ana_egitmen")),
    yetkilerim, sorumlu, banaMi,
    sec: (o) => setSeciliId(o.id),
    cakismalar: cs, cakisanlar: cakisanIdler(cs),
    degisiklikler: degisiklikler.data ?? [],
    yeniDegisiklik: (degisiklikler.data ?? []).filter((d) => Date.parse(d.olusturma) > sonGorulme).length
      + cs.filter((c) => c.a.tarih >= new Date().toISOString().slice(0, 10)).length,
    sonGorulme, okunduSay,
    sonGuncelleme: sonGuncelleme.data ?? null,
    git,
    bakis: !DEMO && gercekBen?.rol === "yonetici"
      ? { yonetici: true, aktif: !!ben && ben.id !== gercekBen.id, gercekAd: gercekBen.ad, sec: setBakisId }
      : null,
  };

  if (!DEMO && kisiler.isSuccess && !ben) return <KayitsizEposta eposta={eposta} />;
  const secili = seciliId ? tum.find((o) => o.id === seciliId) : undefined;

  return (
    <BaglamCtx.Provider value={baglam}>
      <Kabuk sekme={sekme}>
        {oturumlar.isLoading ? (
          <Tam>Program yükleniyor…</Tam>
        ) : oturumlar.isError ? (
          <div role="alert" className="m-5 rounded-kart bg-mercan-acik p-4 text-sm text-mercan-koyu">
            Program yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.
          </div>
        ) : sekme === "takvim" ? <TakvimSayfasi />
          : sekme === "etkinlikler" ? <Etkinlikler />
          : sekme === "degisenler" ? <Degisenler />
          : sekme === "profil" ? <Profil demoSec={setDemoId} />
          : <Bugun />}
      </Kabuk>
      {secili && <OturumDetay o={secili} onKapat={kapat} />}
    </BaglamCtx.Provider>
  );
}

function KayitsizEposta({ eposta }: { eposta: string | null }) {
  return (
    <Tam>
      <Logo className="mb-6" />
      <p className="max-w-sm text-center">
        <strong className="block text-murekkep">{eposta}</strong>
        bu e-posta eğitmen listesinde yok ya da pasif. Yöneticiyle iletişime geçin.
      </p>
      <button onClick={cikis} className="mt-4 h-11 rounded-2xl border border-[#D9CDC6] bg-white px-4 text-sm font-semibold">Çıkış yap</button>
    </Tam>
  );
}

function Kurulum() {
  return (
    <Tam>
      <p className="max-w-md text-center">
        Supabase bağlantısı tanımlı değil. <code>web/.env</code> dosyasına <code>VITE_SUPABASE_URL</code> ve{" "}
        <code>VITE_SUPABASE_ANON_KEY</code> ekleyin ya da demo için <code>VITE_DEMO=1</code> kullanın.
      </p>
    </Tam>
  );
}

function Tam({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[50vh] flex-col items-center justify-center bg-zemin p-6 text-sm text-soluk">{children}</div>;
}
