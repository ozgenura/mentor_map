// PO paneli: sorumlu olunan bootcamp'in programı, özet ve dikkat isteyen oturumlar. Yalnızca admin ve PO görür.
// Düzenleme oturum detayından yapılır (iptal, link, not, ek seans); konu/tarih/eğitmen şimdilik program dosyasından.

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SayfaUstu } from "../components/Kabuk";
import { YanSeansFormu } from "../components/SeansFormu";
import { Baslik, Bos, Ikon, Kart, Rozet, Segment } from "../components/ui";
import { gosterim, useBaglam } from "../lib/baglam";
import { bitMs } from "../lib/derive";
import { bootcampOturumlari, dikkatGruplari, dikkatListesi, haftalar, programOzeti, type Dikkat, type DikkatGrubu } from "../lib/program";
import { gunBasligi } from "../lib/time";
import type { Oturum } from "../lib/types";
import { SaatSecici } from "./Bugun";

const NEDEN: Record<Dikkat["neden"], string> = {
  egitmen_yok: "Eğitmen atanmamış",
  link_yok: "Toplantı linki yok",
  cakisma: "Eğitmen çakışması",
};

function okuSecim(): string | null {
  try { return localStorage.getItem("mm-program-bootcamp"); } catch { return null; }
}
function yazSecim(id: string) {
  try { localStorage.setItem("mm-program-bootcamp", id); } catch { /* yoksay */ }
}

/** Kişinin düzenleyebildiği bootcamp'ler (ad sırasıyla). */
export function yonetilenBootcamplar(tum: Oturum[], duzenleyebilirMi: (id: string) => boolean) {
  const m = new Map<string, { id: string; ad: string; kod: string; renk: string }>();
  for (const o of tum) if (!m.has(o.bootcamp_id) && duzenleyebilirMi(o.bootcamp_id))
    m.set(o.bootcamp_id, { id: o.bootcamp_id, ad: o.bootcamp_ad, kod: o.kisa_kod, renk: o.renk });
  return [...m.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

export function Program() {
  const { tum, duzenleyebilirMi, sec } = useBaglam();
  const qc = useQueryClient();
  const bootcamplar = useMemo(() => yonetilenBootcamplar(tum, duzenleyebilirMi), [tum, duzenleyebilirMi]);
  const [secim, setSecim] = useState<string | null>(okuSecim);
  const b = bootcamplar.find((x) => x.id === secim) ?? bootcamplar[0];
  const [kapsam, setKapsam] = useState<"yaklasan" | "tumu">("yaklasan");
  const [yeniSeans, setYeniSeans] = useState(false);

  const os = useMemo(() => (b ? bootcampOturumlari(tum, b.id) : []), [tum, b]);
  const ozet = useMemo(() => programOzeti(os), [os]);
  const dikkat = useMemo(() => dikkatListesi(os, tum), [os, tum]);
  const gruplar = useMemo(() => dikkatGruplari(dikkat), [dikkat]);
  const gosterilen = useMemo(() => haftalar(kapsam === "tumu" ? os : os.filter((o) => bitMs(o) > Date.now())), [os, kapsam]);

  if (!b) return (
    <>
      <SayfaUstu ust="PO paneli" baslik="Program" />
      <div className="px-3 pt-4 lg:px-10"><Bos>Düzenleyebildiğin bir bootcamp yok.</Bos></div>
    </>
  );

  return (
    <>
      <SayfaUstu ust="PO paneli" baslik={b.ad} sag={
        <div className="flex flex-wrap items-center gap-2">
          <SaatSecici />
          <button onClick={() => setYeniSeans(true)} className="flex h-10 items-center gap-1.5 rounded-full bg-yesil px-4 text-[13px] font-bold text-white">
            <Ikon ad="arti" boyut={16} /> Seans ekle
          </button>
        </div>
      } />
      {yeniSeans && (
        <YanSeansFormu bootcampId={b.id} onKapat={() => setYeniSeans(false)}
          onKaydedildi={(id) => setTimeout(() => {
            const y = qc.getQueryData<Oturum[]>(["oturumlar"])?.find((x) => x.id === id);
            if (y) sec(y);
          }, 50)} />
      )}
      <div className="flex flex-col gap-6 px-3 pt-4 lg:px-10">
        {bootcamplar.length > 1 && (
          <div className="px-2 lg:px-0">
            <select aria-label="Bootcamp" value={b.id} onChange={(e) => { setSecim(e.target.value); yazSecim(e.target.value); }} className="secim">
              {bootcamplar.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kutu genis etiket="Dönem" deger={ozet.donemler.join(", ") || "—"} />
          <Kutu etiket="İlerleme" deger={`${ozet.gecen}/${ozet.toplam}`} alt={ozet.ilk && ozet.son ? `${kisaTarih(ozet.ilk)} – ${kisaTarih(ozet.son)}` : undefined} />
          <Kutu etiket="Kalan oturum" deger={String(ozet.kalan)} />
          <Kutu etiket="İptal" deger={String(ozet.iptal)} />
          <Kutu etiket="Dikkat" deger={String(dikkat.length)} vurgu={dikkat.length > 0} />
        </div>

        <section className="flex flex-col gap-3">
          <Baslik>Dikkat isteyenler</Baslik>
          {gruplar.length ? (
            <Kart className="divide-y divide-cizgi">
              {gruplar.map((g) => <DikkatGrubuSatiri key={`${b.id}-${g.neden}`} bootcampId={b.id} g={g} />)}
            </Kart>
          ) : <Bos>Yaklaşan oturumlarda eksik yok: hepsinin eğitmeni ve linki var, çakışma yok.</Bos>}
        </section>

        <section className="flex flex-col gap-3">
          <Baslik sag={<Segment<"yaklasan" | "tumu"> kucuk etiket="Kapsam" deger={kapsam} onDegis={setKapsam}
            secenekler={[["yaklasan", "Yaklaşan"], ["tumu", "Tümü"]]} />}>Program</Baslik>
          {gosterilen.length ? gosterilen.map((h) => (
            <div key={h.bas} className="flex flex-col gap-1.5">
              <h3 className="px-2 text-xs font-bold uppercase tracking-wide text-soluk lg:px-0">{kisaTarih(h.bas)} haftası</h3>
              <Kart className="divide-y divide-cizgi">
                {h.oturumlar.map((o) => <Satir key={o.id} o={o} dikkat={dikkat.some((d) => d.o.id === o.id)} />)}
              </Kart>
            </div>
          )) : <Bos>Yaklaşan oturum yok.</Bos>}
          <p className="px-2 text-xs text-soluk lg:px-0">
            İptal, toplantı linki, materyal ve not oturumun detayından düzenlenir. Konu, tarih ve eğitmen değişiklikleri
            şimdilik program dosyasından yapılır.
          </p>
        </section>
      </div>
    </>
  );
}

function acikOku(k: string): boolean | null {
  try { const v = sessionStorage.getItem(k); return v === null ? null : v === "1"; } catch { return null; }
}

/** Sorun türü başlığı (kapalı: adet ve en yakın tarih); açılınca oturumlar alt alta. Açıklık bu oturum boyunca hatırlanır. */
function DikkatGrubuSatiri({ g, bootcampId }: { g: DikkatGrubu; bootcampId: string }) {
  const { sec, ben } = useBaglam();
  const anahtar = `mm-dikkat-${bootcampId}-${g.neden}`;
  const [acik, setAcik] = useState(() => acikOku(anahtar) ?? g.acil);
  const degistir = () => {
    setAcik((x) => {
      try { sessionStorage.setItem(anahtar, x ? "0" : "1"); } catch { /* yoksay */ }
      return !x;
    });
  };
  return (
    <div>
      <button onClick={degistir} aria-expanded={acik} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zemin">
        <Ikon ad="uyari" boyut={18} className="shrink-0 text-mercan-koyu" />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold">{NEDEN[g.neden]}</span>
          <span className="text-xs text-soluk">{g.kalemler.length} oturum · en yakını {kisaTarih(g.enYakin)}</span>
        </span>
        {g.acil && !acik && <Rozet tur="iptal">7 gün içinde</Rozet>}
        <Ikon ad="sag" boyut={16} className={`shrink-0 text-soluk transition ${acik ? "rotate-90" : ""}`} />
      </button>
      {acik && (
        <div className="flex flex-col pb-2">
          {g.varsayilanLinkYok && (
            <p className="mx-4 mb-1 rounded-xl bg-zemin px-3 py-2 text-xs text-soluk">
              Bootcamp'in varsayılan Zoom linki yok. {ben?.rol === "yonetici" ? "Eklerseniz" : "Yönetici eklerse"} hepsine uygulanır.
            </p>
          )}
          {g.kalemler.map((d) => (
            <button key={`${d.o.id}-${d.detay ?? ""}`} onClick={() => sec(d.o)}
              className="flex w-full items-center gap-3 py-2 pl-[46px] pr-4 text-left hover:bg-zemin">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{gunBasligi(d.o.tarih)} · {d.o.konu || d.o.tur}</span>
                {d.detay && <span className="truncate text-xs text-soluk">{d.detay}</span>}
              </span>
              <Ikon ad="sag" boyut={14} className="shrink-0 text-soluk" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Satir({ o, dikkat }: { o: Oturum; dikkat: boolean }) {
  const { tz, saatModu, sec } = useBaglam();
  const g = gosterim(o, tz, saatModu);
  const iptal = o.durum === "iptal";
  const gecti = bitMs(o) <= Date.now();
  return (
    <button onClick={() => sec(o)} className={`grid w-full grid-cols-[88px_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-zemin lg:grid-cols-[120px_120px_1fr_220px_auto] ${gecti ? "opacity-60" : ""}`}>
      <span className="flex flex-col text-[13px] font-semibold">
        {gunBasligi(o.tarih)}
        <span className="text-xs font-normal text-soluk lg:hidden">{g.ana ?? "Saat yok"}</span>
      </span>
      <span className="hidden text-[13px] lg:block">{g.ana ? `${g.ana} ${g.birim}` : "Saat yok"}</span>
      <span className="flex min-w-0 flex-col">
        <span className={`truncate text-sm font-semibold ${iptal ? "line-through" : ""}`}>{o.konu || o.tur}</span>
        <span className="truncate text-xs text-soluk">
          {o.tur}<span className="lg:hidden"> · {o.anlaticilar.map((a) => a.ad).join(", ") || "Eğitmen atanmamış"}</span>
        </span>
      </span>
      <span className="hidden truncate text-[13px] lg:block">{o.anlaticilar.map((a) => a.ad).join(", ") || <span className="text-mercan-koyu">Eğitmen atanmamış</span>}</span>
      <span className="flex items-center gap-1.5">
        {o.kaynak === "uygulama" && <Rozet tur="saat">Ek</Rozet>}
        {iptal && <Rozet tur="iptal">İptal</Rozet>}
        {!iptal && dikkat && <Ikon ad="uyari" boyut={16} className="text-mercan-koyu" />}
      </span>
    </button>
  );
}

function Kutu({ etiket, deger, alt, vurgu = false, genis = false }: { etiket: string; deger: string; alt?: string; vurgu?: boolean; genis?: boolean }) {
  return (
    <Kart className={`flex flex-col gap-1 p-4 ${genis ? "col-span-2 lg:col-span-1" : ""} ${vurgu ? "ring-2 ring-mercan-zemin" : ""}`}>
      <span className="text-xs font-semibold text-soluk">{etiket}</span>
      <span className={`font-baslik text-2xl font-bold tracking-tight ${vurgu ? "text-mercan-koyu" : ""}`}>{deger}</span>
      {alt && <span className="text-xs text-soluk">{alt}</span>}
    </Kart>
  );
}

const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function kisaTarih(ymd: string) {
  return `${Number(ymd.slice(8, 10))} ${AY[Number(ymd.slice(5, 7)) - 1]}`;
}
