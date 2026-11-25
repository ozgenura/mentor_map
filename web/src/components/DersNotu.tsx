// Ders kartındaki "Ders sonu notu": ana eğitmen (ve yönetici) ders başladıktan sonra 1 dakikalık not bırakır;
// yönetici ve rapor izleyicisi aynı notu salt okunur görür.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NABIZ, PLAN_ADI, type DersNotu, type DersNotuGirdi, type DersPlani, type SinifNabzi } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import type { Oturum } from "../lib/types";

export const PLAN_RENGI: Record<DersPlani, string> = {
  tamam: "bg-nane text-nane-koyu",
  kismen: "bg-[#FFF1CC] text-[#7A5500]",
  geride: "bg-mercan-acik text-mercan-yazi",
};

export function DersNotuKarti({ o }: { o: Oturum }) {
  const { api, ben } = useBaglam();
  const q = useQuery({ queryKey: ["ders-notu", o.id], queryFn: () => api.dersNotu(o.id) });
  const [form, setForm] = useState(false);
  const d = q.data;
  if (!d) return null;
  if (!d.yazabilir && !d.not) return null;
  if (d.yazabilir && !d.basladi) return null;

  if (form) return <NotFormu o={o} eski={d.not} onKapat={() => setForm(false)} />;
  if (!d.not) {
    return (
      <button onClick={() => setForm(true)}
        className="flex h-14 items-center justify-between gap-3 rounded-2xl bg-mercan px-4 text-left text-[15px] font-bold text-[#3A0A10]">
        Ders sonu notu bırak <span className="text-[13px] font-medium opacity-80">~1 dk</span>
      </button>
    );
  }
  return (
    <section className="flex flex-col gap-2 rounded-kart bg-white p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-baslik text-base font-bold">Ders sonu notu</h3>
        {d.yazabilir && <button onClick={() => setForm(true)} className="h-9 rounded-xl border border-[#D9CDC6] px-3 text-[13px] font-semibold">Düzenle</button>}
      </div>
      <NotOzeti n={d.not} />
      {d.not.yazan && d.not.yazan !== ben?.ad && <span className="text-xs text-soluk">{d.not.yazan}</span>}
    </section>
  );
}

export function NotOzeti({ n }: { n: DersNotu }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
        <span className={`rounded-full px-2.5 py-1 ${PLAN_RENGI[n.plan]}`}>Plana göre: {PLAN_ADI[n.plan]}</span>
        <span className="rounded-full bg-cizgi px-2.5 py-1">{NABIZ[n.nabiz].yuz} {NABIZ[n.nabiz].ad}</span>
        {n.katilim != null && <span className="rounded-full bg-cizgi px-2.5 py-1">{n.katilim} kişi</span>}
      </div>
      {n.islenen && <p className="whitespace-pre-line"><span className="text-soluk">Ne işlendi: </span>{n.islenen}</p>}
      {n.dikkat && <p className="whitespace-pre-line rounded-xl bg-mercan-acik px-3 py-2 text-mercan-koyu"><strong>Dikkat: </strong>{n.dikkat}</p>}
    </div>
  );
}

function Secim<T extends string>({ etiket, deger, onDegis, secenekler }: {
  etiket: string; deger: T | null; onDegis: (v: T) => void; secenekler: [T, React.ReactNode][];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{etiket}</legend>
      <div className="grid grid-cols-3 gap-2">
        {secenekler.map(([v, ad]) => (
          <button key={v} type="button" aria-pressed={deger === v} onClick={() => onDegis(v)}
            className={`min-h-12 rounded-[14px] border-[1.5px] px-1.5 py-2 text-sm transition ${
              deger === v ? "border-yesil bg-nane font-bold text-nane-koyu" : "border-cizgi bg-zemin font-medium"}`}>
            {ad}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NotFormu({ o, eski, onKapat }: { o: Oturum; eski: DersNotu | null; onKapat: () => void }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<DersPlani | null>(eski?.plan ?? null);
  const [nabiz, setNabiz] = useState<SinifNabzi | null>(eski?.nabiz ?? null);
  const [katilim, setKatilim] = useState(eski?.katilim != null ? String(eski.katilim) : "");
  const [islenen, setIslenen] = useState(eski?.islenen ?? o.konu ?? "");
  const [dikkat, setDikkat] = useState(eski?.dikkat ?? "");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !nabiz) { setHata("Plan durumunu ve sınıfın durumunu seç."); return; }
    const k = katilim.trim() ? Number(katilim) : null;
    if (k != null && (!Number.isInteger(k) || k < 0)) { setHata("Katılım bir sayı olmalı."); return; }
    setBekliyor(true);
    setHata(null);
    try {
      const n: DersNotuGirdi = { plan, nabiz, katilim: k, islenen: islenen.trim(), dikkat: dikkat.trim() };
      await api.dersNotuKaydet(o.id, n);
      await Promise.all([qc.invalidateQueries({ queryKey: ["ders-notu", o.id] }), qc.invalidateQueries({ queryKey: ["ders-notlari-hafta"] })]);
      onKapat();
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kaydedilemedi.");
    } finally {
      setBekliyor(false);
    }
  }

  const alan = "w-full rounded-xl border-[1.5px] border-cizgi bg-zemin px-3 py-2.5 text-base outline-none focus:border-yesil";
  return (
    <form onSubmit={kaydet} className="flex flex-col gap-4 rounded-kart bg-white p-4">
      <h3 className="font-baslik text-lg font-bold">Ders sonu notu</h3>
      <Secim etiket="Plana göre" deger={plan} onDegis={setPlan}
        secenekler={(Object.keys(PLAN_ADI) as DersPlani[]).map((p) => [p, PLAN_ADI[p]])} />
      <Secim etiket="Sınıfın durumu" deger={nabiz} onDegis={setNabiz}
        secenekler={(Object.keys(NABIZ) as SinifNabzi[]).map((v) => [v, <><span className="block text-xl leading-tight">{NABIZ[v].yuz}</span>{NABIZ[v].ad}</>])} />
      <label className="flex flex-col gap-2 text-sm font-semibold">
        <span>Katılım <span className="font-normal text-soluk">· isteğe bağlı, yaklaşık</span></span>
        <input inputMode="numeric" value={katilim} onChange={(e) => setKatilim(e.target.value.replace(/\D/g, ""))} className={`${alan} max-w-[8rem]`} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        Ne işlendi
        <textarea rows={3} value={islenen} onChange={(e) => setIslenen(e.target.value)} maxLength={2000} className={`${alan} font-normal`} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        <span>Dikkat gerektiren <span className="font-normal text-soluk">· isteğe bağlı, raporda en üstte çıkar</span></span>
        <textarea rows={2} value={dikkat} onChange={(e) => setDikkat(e.target.value)} maxLength={2000}
          placeholder="Öğrenci, teknik sorun, materyal eksiği…" className={`${alan} font-normal`} />
      </label>
      {hata && <p role="alert" className="text-sm text-mercan-yazi">{hata}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onKapat} className="h-11 rounded-[14px] border border-[#D9CDC6] text-sm font-semibold">Vazgeç</button>
        <button type="submit" disabled={bekliyor} className="h-11 rounded-[14px] bg-yesil text-sm font-bold text-white disabled:opacity-50">
          {bekliyor ? "Bekle…" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}
