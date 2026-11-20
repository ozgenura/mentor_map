// Şablon çakışmaları (Aşama C): şablon ile uygulama aynı alanı farklı değiştirdiğinde oturum değişmez,
// PO ya da yönetici hangisinin geçerli olduğunu seçer. "Uygulamadaki" seçilirse sonraki gönderimde şablona yazılır.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CAKISMA_ALANI, type Cakisma } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import { gunBasligi } from "../lib/time";
import { Ikon, Kart } from "./ui";

export function useCakismalar() {
  const { api, programPaneli } = useBaglam();
  return useQuery({ queryKey: ["cakismalar"], queryFn: api.cakismalar, enabled: programPaneli, refetchInterval: 5 * 60_000 });
}

function CakismaSatiri({ c, oturumAdi }: { c: Cakisma; oturumAdi?: string }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  async function coz(secim: "sablon" | "uygulama") {
    setBekliyor(true); setHata(null);
    try {
      await api.cakismaCoz(c.id, secim);
      await Promise.all(["cakismalar", "oturumlar", "degisiklikler"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Çözülemedi.");
    } finally {
      setBekliyor(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <span className="text-sm font-semibold">{CAKISMA_ALANI[c.alan]}{oturumAdi ? ` · ${oturumAdi}` : ""}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        <button disabled={bekliyor} onClick={() => coz("sablon")}
          className="flex flex-col items-start gap-0.5 rounded-xl border border-cizgi px-3 py-2 text-left hover:bg-zemin disabled:opacity-50">
          <span className="text-[11px] font-bold uppercase tracking-wide text-soluk">Şablondaki geçerli</span>
          <span className="text-[13px] font-semibold">{c.sablon_metni}</span>
        </button>
        <button disabled={bekliyor} onClick={() => coz("uygulama")}
          className="flex flex-col items-start gap-0.5 rounded-xl border border-cizgi px-3 py-2 text-left hover:bg-zemin disabled:opacity-50">
          <span className="text-[11px] font-bold uppercase tracking-wide text-soluk">Uygulamadaki geçerli</span>
          <span className="text-[13px] font-semibold">{c.uygulama_metni}</span>
        </button>
      </div>
      {hata && <span role="alert" className="text-xs text-mercan-koyu">{hata}</span>}
    </div>
  );
}

/** PO paneli: seçili bootcamp'in açık çakışmaları. */
export function CakismaListesi({ bootcampId }: { bootcampId: string }) {
  const { tum } = useBaglam();
  const q = useCakismalar();
  const oturum = new Map(tum.map((o) => [o.id, o]));
  const list = (q.data ?? []).filter((c) => oturum.get(c.oturum_id)?.bootcamp_id === bootcampId);
  if (!list.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 px-2 font-baslik text-lg font-bold tracking-tight text-mercan-koyu lg:px-0">
        <Ikon ad="uyari" boyut={18} /> Şablon çakışmaları · {list.length}
      </h2>
      <p className="px-2 text-xs text-soluk lg:px-0">
        Aynı alan hem şablonda hem uygulamada farklı değiştirildi; oturum şimdilik uygulamadaki haliyle duruyor. Geçerli olanı seç.
        "Uygulamadaki" seçilirse sonraki gönderimde şablona yazılır.
      </p>
      <Kart className="divide-y divide-cizgi">
        {list.map((c) => {
          const o = oturum.get(c.oturum_id);
          return <CakismaSatiri key={c.id} c={c} oturumAdi={o ? `${gunBasligi(o.tarih)} · ${o.konu || o.tur}` : undefined} />;
        })}
      </Kart>
    </section>
  );
}

/** Oturum detayı: bu oturumun açık çakışmaları. */
export function OturumCakismalari({ oturumId }: { oturumId: string }) {
  const q = useCakismalar();
  const list = (q.data ?? []).filter((c) => c.oturum_id === oturumId);
  if (!list.length) return null;
  return (
    <div className="flex flex-col rounded-kart bg-mercan-acik text-mercan-koyu">
      <span className="flex items-center gap-2 px-4 pt-3 text-[13px] font-bold"><Ikon ad="uyari" boyut={16} /> Şablonla çakışma var</span>
      <div className="divide-y divide-mercan-zemin">{list.map((c) => <CakismaSatiri key={c.id} c={c} />)}</div>
    </div>
  );
}
