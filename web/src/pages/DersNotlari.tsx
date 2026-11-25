// Ders sonu notları board'u ve haftalık özet: yalnızca yönetici ve rapor izleyicisi (ör. Atilla Hoca) görür.

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { NotOzeti, PLAN_RENGI } from "../components/DersNotu";
import { SayfaUstu } from "../components/Kabuk";
import { BootcampEtiketi, Bos, Ikon, Segment } from "../components/ui";
import { NABIZ, PLAN_ADI, type DersPlani, type HaftaDersi, type SinifNabzi } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import { bugunTR, gunBasligi, gunEkle, haftaBasi, saat } from "../lib/time";

function ilkHafta(): string {
  // Haftalık özet bildirimi ?hafta=YYYY-MM-DD ile gelir.
  const h = new URLSearchParams(location.search).get("hafta");
  if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) {
    history.replaceState(null, "", location.pathname + location.hash);
    return haftaBasi(h);
  }
  return haftaBasi(bugunTR());
}

function aralik(pzt: string): string {
  const f = (ymd: string) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
  const [a, b] = [f(pzt), f(gunEkle(pzt, 6))];
  return a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]}–${b}` : `${a} – ${b}`;
}

export function DersNotlari() {
  const { api } = useBaglam();
  const [pzt, setPzt] = useState(ilkHafta);
  const [gorunum, setGorunum] = useState<"board" | "ozet">(() => (new URLSearchParams(location.search).has("hafta") ? "ozet" : "board"));
  const [program, setProgram] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["ders-notlari-hafta", pzt], queryFn: () => api.dersNotlariHafta(pzt) });
  const herkese = useQuery({ queryKey: ["ozellik-herkese", "ders_notlari"], queryFn: () => api.ozellikHerkeseAcik("ders_notlari"), staleTime: 10 * 60_000 });

  const tum = q.data ?? [];
  const programlar = useMemo(() => {
    const m = new Map<string, { id: string; kod: string; ad: string; renk: string; dersler: HaftaDersi[] }>();
    for (const d of tum) {
      if (!m.has(d.bootcamp_id)) m.set(d.bootcamp_id, { id: d.bootcamp_id, kod: d.kisa_kod, ad: d.bootcamp_ad, renk: d.renk, dersler: [] });
      m.get(d.bootcamp_id)!.dersler.push(d);
    }
    return [...m.values()];
  }, [tum]);
  const gorunen = program ? programlar.filter((p) => p.id === program) : programlar;
  const dersler = gorunen.flatMap((p) => p.dersler);
  const notlu = dersler.filter((d) => d.not);

  return (
    <>
      <SayfaUstu baslik="Ders notları"
        ust={herkese.data === false ? <span className="rounded bg-mercan-zemin px-1.5 py-0.5 font-semibold text-mercan-koyu">Önizleme · eğitmenler henüz görmüyor</span> : "Ders sonu notları"}
        sag={
          <div className="flex items-center gap-1">
            <button aria-label="Önceki hafta" onClick={() => setPzt(gunEkle(pzt, -7))} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D9CDC6] bg-white"><Ikon ad="sol" boyut={18} /></button>
            <span className="min-w-[8.5rem] text-center font-baslik text-[15px] font-bold">{aralik(pzt)}</span>
            <button aria-label="Sonraki hafta" onClick={() => setPzt(gunEkle(pzt, 7))} disabled={pzt >= haftaBasi(bugunTR())}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D9CDC6] bg-white disabled:opacity-40"><Ikon ad="sag" boyut={18} /></button>
          </div>
        } />
      <div className="flex flex-col gap-4 px-3 pt-4 lg:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <Segment etiket="Görünüm" deger={gorunum} onDegis={setGorunum} secenekler={[["board", "Board"], ["ozet", "Haftalık özet"]]} />
          {programlar.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Cip secili={!program} onClick={() => setProgram(null)}>Tüm programlar</Cip>
              {programlar.map((p) => <Cip key={p.id} secili={program === p.id} onClick={() => setProgram(p.id)}>{p.kod}</Cip>)}
            </div>
          )}
        </div>

        {q.isLoading ? <Bos>Yükleniyor…</Bos>
          : q.isError ? <Bos>Notlar yüklenemedi: {(q.error as Error).message}</Bos>
          : !dersler.length ? <Bos>Bu hafta henüz yapılmış ders yok.</Bos>
          : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Sayi n={dersler.length} ad="ders yapıldı" />
                <Sayi n={`${notlu.length}/${dersler.length}`} ad="not girildi" />
                <Sayi n={notlu.filter((d) => d.not!.plan === "tamam").length} ad="plana uygun" />
                <Sayi n={notlu.filter((d) => d.not!.dikkat).length} ad="dikkat notu" vurgu />
              </div>
              {gorunum === "board"
                ? <div className="flex flex-col gap-3">{gorunen.map((p) => <Hat key={p.id} p={p} />)}</div>
                : <Ozet programlar={gorunen} dersler={dersler} />}
              <p className="pb-4 text-xs text-soluk">Bu ekranı yalnızca yönetici ve rapor izleyicileri görür. Notu dersin ana eğitmeni ders kartından girer.</p>
            </>
          )}
      </div>
    </>
  );
}

function Cip({ secili, onClick, children }: { secili: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={secili}
      className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${secili ? "border-yesil bg-yesil text-white" : "border-[#D9CDC6] bg-white"}`}>
      {children}
    </button>
  );
}

function Sayi({ n, ad, vurgu = false }: { n: number | string; ad: string; vurgu?: boolean }) {
  return (
    <div className={`rounded-2xl px-3.5 py-3 ${vurgu && n ? "bg-mercan-acik text-mercan-koyu" : "bg-white"}`}>
      <span className="block whitespace-nowrap font-baslik text-[26px] font-bold leading-tight tabular-nums">{n}</span>
      <span className="text-[13px] opacity-80">{ad}</span>
    </div>
  );
}

function Hat({ p }: { p: { kod: string; ad: string; renk: string; dersler: HaftaDersi[] } }) {
  const [acik, setAcik] = useState<string | null>(null);
  return (
    <section className="rounded-kart bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BootcampEtiketi kod={p.kod} renk={p.renk} />
        <h2 className="font-baslik text-base font-bold">{p.ad}</h2>
        <span className="text-xs text-soluk">{p.dersler.length} ders</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {p.dersler.map((d) => (
          <div key={d.id} className={acik === d.id ? "sm:col-span-2 xl:col-span-3" : ""}>
            <DersKarti d={d} acik={acik === d.id} onClick={() => setAcik(acik === d.id ? null : d.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function DersKarti({ d, acik, onClick }: { d: HaftaDersi; acik: boolean; onClick: () => void }) {
  const ust = (
    <div className="flex justify-between gap-2 text-xs text-soluk">
      <span>{gunBasligi(d.tarih).replace(/,.*/, "")} {d.tarih.slice(8)}.{d.tarih.slice(5, 7)}{d.baslangic ? ` · ${saat(d.baslangic)}` : ""}</span>
      <span className="truncate">{d.egitmenler.join(", ")}</span>
    </div>
  );
  if (!d.not) {
    return (
      <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D9CDC6] bg-zemin px-3 py-2.5 opacity-70">
        {ust}
        <div className="mt-1 text-sm font-semibold leading-snug">{d.konu || d.tur}</div>
        <div className="mt-1.5 text-xs text-soluk">Not girilmedi</div>
      </div>
    );
  }
  const n = d.not;
  return (
    <button onClick={onClick} aria-expanded={acik}
      className={`w-full rounded-[14px] border-[1.5px] bg-zemin px-3 py-2.5 text-left ${n.dikkat ? "border-mercan shadow-[inset_4px_0_0_#F08891]" : "border-cizgi"} ${acik ? "ring-2 ring-yesil" : ""}`}>
      {ust}
      <div className="mt-1 text-sm font-semibold leading-snug">{d.konu || d.tur}</div>
      {acik ? <div className="mt-2 text-sm"><NotOzeti n={n} /></div> : (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className={`rounded-full px-2 py-0.5 ${PLAN_RENGI[n.plan]}`}>{PLAN_ADI[n.plan]}</span>
          <span className="rounded-full bg-cizgi px-2 py-0.5">{NABIZ[n.nabiz].yuz}</span>
          {n.katilim != null && <span className="rounded-full bg-cizgi px-2 py-0.5">{n.katilim} kişi</span>}
          {n.dikkat && <span className="rounded-full bg-mercan-acik px-2 py-0.5 text-mercan-yazi">Dikkat</span>}
        </div>
      )}
    </button>
  );
}

const CUBUK: Record<DersPlani, string> = { tamam: "#0B5A3E", kismen: "#D9A300", geride: "#F08891" };

function Ozet({ programlar, dersler }: { programlar: { id: string; kod: string; ad: string; dersler: HaftaDersi[] }[]; dersler: HaftaDersi[] }) {
  const dikkat = dersler.filter((d) => d.not?.dikkat);
  const nabiz = (Object.keys(NABIZ) as SinifNabzi[]).map((v) => [v, dersler.filter((d) => d.not?.nabiz === v).length] as const);
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <section className="rounded-kart bg-white p-4">
        <h2 className="mb-2 font-baslik text-base font-bold">Dikkat gerektirenler</h2>
        {dikkat.length ? (
          <ul className="flex flex-col gap-2">
            {dikkat.map((d) => (
              <li key={d.id} className="rounded-xl bg-mercan-acik px-3 py-2 text-sm">
                <strong className="text-mercan-koyu">{d.kisa_kod} · {d.konu || d.tur}</strong>
                <p className="whitespace-pre-line">{d.not!.dikkat}</p>
                <span className="text-xs text-soluk">{d.egitmenler.join(", ")} · {gunBasligi(d.tarih)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-soluk">Bu hafta dikkat notu yok.</p>}
      </section>
      <section className="rounded-kart bg-white p-4">
        <h2 className="mb-1 font-baslik text-base font-bold">Programlara göre</h2>
        {programlar.map((p) => {
          const notlu = p.dersler.filter((d) => d.not);
          return (
            <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-cizgi py-2.5 text-sm first:border-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto]">
              <span className="truncate"><strong>{p.kod}</strong> {p.ad}</span>
              <div className="col-span-2 row-start-2 flex h-3 overflow-hidden rounded-full bg-ray sm:col-span-1 sm:row-start-1 sm:col-start-2">
                {(Object.keys(CUBUK) as DersPlani[]).map((k) => (
                  <i key={k} style={{ width: `${(notlu.filter((d) => d.not!.plan === k).length / p.dersler.length) * 100}%`, background: CUBUK[k] }} />
                ))}
              </div>
              <span className="whitespace-nowrap text-soluk">{notlu.length}/{p.dersler.length} not</span>
            </div>
          );
        })}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-soluk">
          {(Object.keys(CUBUK) as DersPlani[]).map((k) => (
            <span key={k}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-[-1px]" style={{ background: CUBUK[k] }} />{k === "tamam" ? "Plana uygun" : PLAN_ADI[k]}</span>
          ))}
        </div>
      </section>
      <section className="rounded-kart bg-white p-4">
        <h2 className="mb-1 font-baslik text-base font-bold">Sınıfların durumu</h2>
        <p className="text-sm">{nabiz.map(([v, n]) => `${NABIZ[v].yuz} ${NABIZ[v].ad} ${n}`).join(" · ")}</p>
      </section>
    </div>
  );
}
