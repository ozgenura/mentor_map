import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { YanSeansFormu } from "../components/SeansFormu";
import { SayfaUstu } from "../components/Kabuk";
import { AyGorunumu, ipucu } from "../components/AyGorunumu";
import { Harita } from "../components/Harita";
import { GORUNUM_ANAHTARI } from "../lib/harita";
import { Takvim } from "../components/Takvim";
import { Bos, Ikon, Segment } from "../components/ui";
import { gosterim, useBaglam } from "../lib/baglam";
import { basMs, bitMs, kartEtiketi, kisaltmaHaritasi, siraliOturumlar, TATILLER, yaziRengi } from "../lib/derive";
import { bugunTR, gunBasligi, gunEkle, haftaBasi, saat, TR } from "../lib/time";
import type { Oturum } from "../lib/types";
import { SaatSecici } from "./Bugun";

type Gorunum = "gun" | "hafta" | "ay" | "harita";

function istenenGorunum(): Gorunum | null {
  try {
    const g = sessionStorage.getItem(GORUNUM_ANAHTARI);
    sessionStorage.removeItem(GORUNUM_ANAHTARI);
    return g === "gun" || g === "hafta" || g === "ay" || g === "harita" ? g : null;
  } catch {
    return null;
  }
}
type Kapsam = "ben" | "hepsi";
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function genisEkran() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

function haftaEtiketi(bas: string) {
  const son = gunEkle(bas, 6);
  const [a1, g1] = [Number(bas.slice(5, 7)), Number(bas.slice(8))];
  const [a2, g2] = [Number(son.slice(5, 7)), Number(son.slice(8))];
  return a1 === a2 ? `${g1}–${g2} ${AY[a1 - 1]}` : `${g1} ${AY[a1 - 1]} – ${g2} ${AY[a2 - 1]}`;
}

export function TakvimSayfasi() {
  const { tum, ben, kisiler, anaEgitmenMi, sec } = useBaglam();
  const qc = useQueryClient();
  const [yeniSeans, setYeniSeans] = useState(false);
  const yonetebilir = useMemo(() => tum.some((o) => anaEgitmenMi(o.bootcamp_id)), [tum, anaEgitmenMi]);
  const [gorunum, setGorunum] = useState<Gorunum>(() => istenenGorunum() ?? (genisEkran() ? "hafta" : "gun"));
  const [kapsam, setKapsam] = useState<Kapsam>(ben ? "ben" : "hepsi");
  const [bootcamp, setBootcamp] = useState("");
  const [egitmen, setEgitmen] = useState("");
  const [secili, setSecili] = useState(bugunTR());

  const bootcamplar = useMemo(() => [...new Map(tum.map((o) => [o.kisa_kod, o.bootcamp_ad])).entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "tr")), [tum]);

  const gorunen = useMemo(() => tum.filter((o) => {
    if (bootcamp && o.kisa_kod !== bootcamp) return false;
    if (kapsam === "ben" && ben) return o.anlaticilar.some((a) => a.kisi_id === ben.id);
    if (egitmen) return o.anlaticilar.some((a) => a.kisi_id === egitmen);
    return true;
  }), [tum, bootcamp, kapsam, egitmen, ben]);

  // Harita tüm programı gösterir: kişinin (ya da seçili eğitmenin) bootcamp'lerinin bütün oturumları, kişininkiler vurgulu.
  const vurguId = kapsam === "ben" && ben ? ben.id : egitmen || null;
  const vurgu = useMemo(() => (o: Oturum) => !!vurguId && o.anlaticilar.some((a) => a.kisi_id === vurguId), [vurguId]);
  const haritaOturumlari = useMemo(() => {
    const hatlar = vurguId ? new Set(tum.filter(vurgu).map((o) => o.bootcamp_id)) : null;
    return tum.filter((o) => (!bootcamp || o.kisa_kod === bootcamp) && (!hatlar || hatlar.has(o.bootcamp_id)));
  }, [tum, vurgu, vurguId, bootcamp]);

  return (
    <>
      <SayfaUstu baslik="Takvim" sag={
        <div className="flex flex-wrap items-center gap-2">
          <SaatSecici />
          {yonetebilir && (
            <button onClick={() => setYeniSeans(true)} className="flex h-10 items-center gap-1.5 rounded-full bg-yesil px-4 text-[13px] font-bold text-white">
              <Ikon ad="arti" boyut={16} /> Seans ekle
            </button>
          )}
        </div>
      } />
      {yeniSeans && (
        <YanSeansFormu bootcampId={tum.find((o) => o.kisa_kod === bootcamp && anaEgitmenMi(o.bootcamp_id))?.bootcamp_id}
          onKapat={() => setYeniSeans(false)}
          onKaydedildi={(id) => setTimeout(() => {
            const y = qc.getQueryData<Oturum[]>(["oturumlar"])?.find((x) => x.id === id);
            if (y) { setSecili(y.tarih); sec(y); }
          }, 50)} />
      )}
      <div className="flex flex-col gap-3 px-5 pt-4 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          {ben && <Segment<Kapsam> etiket="Kapsam" deger={kapsam} onDegis={setKapsam} secenekler={[["ben", "Benim"], ["hepsi", "Herkes"]]} />}
          <Segment<Gorunum> etiket="Görünüm" deger={gorunum} onDegis={setGorunum}
            secenekler={[["gun", "Gün"], ["hafta", "Hafta"], ["ay", "Ay"], ["harita", "Harita"]]} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Bootcamp" value={bootcamp} onChange={(e) => setBootcamp(e.target.value)} className="secim">
            <option value="">Tüm bootcamp'ler</option>
            {bootcamplar.map(([kod, ad]) => <option key={kod} value={kod}>{ad}</option>)}
          </select>
          {kapsam === "hepsi" && (
            <select aria-label="Eğitmen" value={egitmen} onChange={(e) => setEgitmen(e.target.value)} className="secim">
              <option value="">Tüm eğitmenler</option>
              {kisiler.filter((k) => k.rol === "egitmen").map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="mt-4 px-3 lg:px-10">
        {gorunum === "harita"
          ? <Harita oturumlar={haritaOturumlari} vurgu={vurgu} vurguVar={!!vurguId} />
          : gorunum === "gun"
          ? <GunGorunumu oturumlar={gorunen} secili={secili} setSecili={setSecili} />
          : gorunum === "ay"
            ? <AyGorunumu oturumlar={gorunen} secili={secili} onGunSec={(t) => { setSecili(t); setGorunum("gun"); }} />
            : <Takvim oturumlar={gorunen} onGunSec={(t) => { setSecili(t); setGorunum("gun"); }} />}
      </div>
    </>
  );
}

function GunGorunumu({ oturumlar, secili, setSecili }: { oturumlar: Oturum[]; secili: string; setSecili: (t: string) => void }) {
  const bas = haftaBasi(secili);
  const bugun = bugunTR();
  const gunun = siraliOturumlar(oturumlar.filter((o) => o.tarih === secili));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <span className="font-baslik text-xl font-bold tracking-tight">{haftaEtiketi(bas)}</span>
        <div className="flex gap-1.5">
          <button aria-label="Önceki hafta" onClick={() => setSecili(gunEkle(secili, -7))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><Ikon ad="sol" boyut={18} /></button>
          <button onClick={() => setSecili(bugun)} className="h-10 rounded-xl bg-white px-3 text-[13px] font-semibold">Bugün</button>
          <button aria-label="Sonraki hafta" onClick={() => setSecili(gunEkle(secili, 7))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><Ikon ad="sag" boyut={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => {
          const t = gunEkle(bas, i);
          const renkler = [...new Set(oturumlar.filter((o) => o.tarih === t && o.durum === "planli").map((o) => o.renk))].slice(0, 3);
          const aktif = t === secili;
          return (
            <button key={t} onClick={() => setSecili(t)} aria-pressed={aktif}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl ${
                aktif ? "bg-yesil text-white" : t === bugun ? "bg-white ring-2 ring-yesil/30" : "bg-white"}`}>
              <span className={`text-[11px] font-semibold ${aktif ? "text-yesil-soluk" : "text-soluk"}`}>{TATILLER[t] ? "Tatil" : GUN_KISA[i]}</span>
              <span className="font-baslik text-lg font-bold">{Number(t.slice(8))}</span>
              <span className="flex h-1.5 gap-0.5">{renkler.map((r) => <span key={r} className="h-1.5 w-1.5 rounded-full" style={{ background: r }} />)}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-[24px] bg-white p-3.5">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-baslik text-base font-bold">{gunBasligi(secili)}</span>
          {TATILLER[secili] && <span className="text-xs font-semibold text-mercan-yazi">{TATILLER[secili]}</span>}
        </div>
        {gunun.length ? <Cizelge oturumlar={gunun} /> : <Bos>Bu gün oturum yok.</Bos>}
      </div>
    </div>
  );
}

const SAAT_PX = 60;

/** Bir günün saat çizelgesi. Konumlar TR saatine göre; üst üste binenler yan yana şeritlere ayrılır. */
function Cizelge({ oturumlar }: { oturumlar: Oturum[] }) {
  const { sec, tz, saatModu, cakisanlar } = useBaglam();
  const saatliler = oturumlar.filter((o) => o.baslangic);
  const saatsizler = oturumlar.filter((o) => !o.baslangic);
  const gun = oturumlar[0]?.tarih ?? bugunTR();
  const gunBas = Date.parse(`${gun}T00:00:00+03:00`);
  const ilk = saatliler.length ? Math.min(17, ...saatliler.map((o) => Number(saat(o.baslangic!, TR).slice(0, 2)))) : 17;
  const ust = Math.max(0, ilk - 1);
  const saatler = Array.from({ length: 24 - ust + 1 }, (_, i) => ust + i);

  // şerit ataması
  const seritler: number[] = [];
  const yerlesim = new Map<string, number>();
  for (const o of saatliler) {
    let s = seritler.findIndex((bitis) => bitis <= basMs(o));
    if (s === -1) { s = seritler.length; seritler.push(0); }
    seritler[s] = bitMs(o);
    yerlesim.set(o.id, s);
  }
  const seritSayisi = Math.max(1, seritler.length);
  const y = (ms: number) => ((ms - gunBas) / 36e5 - ust) * SAAT_PX;

  // Aynı saatte ikiden fazla oturum varsa çizelge okunmaz: o gün liste olarak gösterilir.
  if (seritSayisi > 2) return <GunListesi oturumlar={oturumlar} />;

  return (
    <div className="flex flex-col gap-2">
      {saatsizler.map((o) => (
        <button key={o.id} onClick={() => sec(o)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px]"
          style={{ background: o.renk, color: yaziRengi(o.renk) }}>
          <span className="font-semibold">Saat belirsiz</span><span className="truncate">{o.konu}</span>
        </button>
      ))}
      <div className="relative" style={{ height: (24 - ust) * SAAT_PX + 8 }}>
        {saatler.map((h) => (
          <div key={h} className="absolute inset-x-0 flex items-center gap-2" style={{ top: (h - ust) * SAAT_PX }}>
            <span className="w-11 -translate-y-1/2 text-right text-[11px] font-semibold tabular-nums text-silik">{String(h).padStart(2, "0")}:00</span>
            <span className="h-px flex-1 bg-cizgi" />
          </div>
        ))}
        <div className="absolute bottom-0 left-[3.25rem] right-0 top-0">
          {saatliler.map((o) => {
            const s = yerlesim.get(o.id) ?? 0;
            const iptal = o.durum === "iptal";
            const g = gosterim(o, tz, saatModu);
            const cakisma = !iptal && cakisanlar.has(o.id);
            return (
              <button key={o.id} onClick={() => sec(o)} title={ipucu(o)}
                className={`absolute flex flex-col gap-0.5 overflow-hidden rounded-2xl px-3 py-2 text-left ${iptal ? "border-2 border-dashed" : ""} ${cakisma ? "ring-2 ring-mercan ring-offset-2" : ""}`}
                style={{
                  top: y(basMs(o)) + 1, height: Math.max(36, y(bitMs(o)) - y(basMs(o)) - 3),
                  left: `calc(${(s / seritSayisi) * 100}% + ${s ? 4 : 0}px)`, width: `calc(${100 / seritSayisi}% - ${s ? 4 : 0}px)`,
                  background: iptal ? "transparent" : o.renk, borderColor: o.renk, color: iptal ? "#6B5C57" : yaziRengi(o.renk),
                }}>
                <span className={`font-baslik text-[13px] font-bold tabular-nums ${iptal ? "line-through" : ""}`}>{g.ana}</span>
                <span className={`text-[13px] font-semibold leading-tight ${iptal ? "line-through" : ""}`}>{o.konu || o.tur}</span>
                <span className="mt-auto flex items-center gap-1 text-[11px] font-semibold opacity-90">
                  {iptal ? "İptal" : `${o.kisa_kod} · ${o.anlaticilar.map((a) => a.ad).join(", ") || "Eğitmen atanmamış"}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {saatliler.some((o) => o.durum === "planli" && cakisanlar.has(o.id)) && (
        <div className="flex items-center gap-2 rounded-xl bg-mercan-acik px-3 py-2.5 text-xs font-semibold text-mercan-koyu">
          <Ikon ad="uyari" boyut={16} /> Bu gün çakışan oturumların var. Operasyona bildirildi.
        </div>
      )}
    </div>
  );
}


function GunListesi({ oturumlar }: { oturumlar: Oturum[] }) {
  const { sec, tz, saatModu, cakisanlar, tum } = useBaglam();
  const harita = useMemo(() => kisaltmaHaritasi(tum.flatMap((o) => o.anlaticilar.map((a) => a.ad))), [tum]);
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs text-soluk">Bu gün aynı saatte çok oturum var; liste olarak gösteriliyor.</p>
      {oturumlar.map((o) => {
        const g = gosterim(o, tz, saatModu);
        const iptal = o.durum === "iptal";
        return (
          <button key={o.id} onClick={() => sec(o)} title={ipucu(o)}
            className={`flex w-full gap-3 rounded-2xl border-l-4 bg-zemin px-3 py-2.5 text-left ${iptal ? "opacity-60" : ""} ${
              !iptal && cakisanlar.has(o.id) ? "ring-2 ring-mercan" : ""}`}
            style={{ borderColor: o.renk }}>
            <span className="w-[4.5rem] shrink-0 font-baslik text-[13px] font-bold tabular-nums">{g.ana ?? "Saat belirsiz"}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={`text-[13px] font-bold ${iptal ? "line-through" : ""}`}>{kartEtiketi(o, harita)}</span>
              <span className={`text-[13px] leading-snug ${iptal ? "line-through" : ""}`}>{o.konu || o.tur}</span>
              <span className="truncate text-xs text-soluk">
                {iptal ? "İptal" : o.anlaticilar.map((a) => a.ad).join(", ") || "Eğitmen atanmamış"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
