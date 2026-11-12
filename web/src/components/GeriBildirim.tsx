// Geri bildirim: herkes öneri / sorun gönderir; yönetici Profil'de hepsini görür ve durumunu işaretler.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { GeriBildirimDurumu, GeriBildirimTuru } from "../lib/api";
import { useBaglam, type Sekme } from "../lib/baglam";
import { gorece } from "../lib/time";
import { Ikon, Kart, Rozet, Segment } from "./ui";

const TUR_ADI: Record<GeriBildirimTuru, string> = { oneri: "Öneri", sorun: "Sorun", diger: "Diğer" };
const DURUM_ADI: Record<GeriBildirimDurumu, string> = { yeni: "Yeni", inceleniyor: "İnceleniyor", yapildi: "Yapıldı", kapandi: "Kapandı" };

export function GeriBildirimDugmesi({ sekme, ters = false, className = "" }: { sekme: Sekme; ters?: boolean; className?: string }) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <button onClick={() => setAcik(true)}
        className={`flex items-center gap-2 rounded-xl text-sm font-semibold ${ters ? "text-yesil-yazi hover:bg-yesil-acik" : "text-murekkep"} ${className}`}>
        <Ikon ad="mesaj" boyut={18} /> Öneri / sorun bildir
      </button>
      {acik && <GeriBildirimFormu sekme={sekme} onKapat={() => setAcik(false)} />}
    </>
  );
}

function GeriBildirimFormu({ sekme, onKapat }: { sekme: Sekme; onKapat: () => void }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [tur, setTur] = useState<GeriBildirimTuru>("oneri");
  const [metin, setMetin] = useState("");
  const gonder = useMutation({
    mutationFn: () => api.geriBildirimGonder(tur, metin.trim(), sekme),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["geri-bildirimler"] }),
  });
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-murekkep/50 sm:items-center sm:p-4" onClick={onKapat}>
      <form role="dialog" aria-modal="true" aria-label="Öneri / sorun bildir" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (metin.trim()) gonder.mutate(); }}
        className="flex w-full flex-col gap-4 rounded-t-[28px] bg-zemin p-5 text-murekkep sm:max-w-lg sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-baslik text-xl font-bold">Öneri / sorun bildir</h3>
            <p className="text-[13px] text-soluk">Mentor Map'i geliştirmemize yardım et. Yazdığını yalnızca yönetici görür.</p>
          </div>
          <button type="button" onClick={onKapat} aria-label="Kapat" className="rounded-full p-1.5 hover:bg-cizgi"><Ikon ad="kapat" /></button>
        </div>
        {gonder.isSuccess ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-kart bg-nane p-4 text-sm font-semibold text-nane-koyu">Teşekkürler, iletildi.</div>
            <button type="button" onClick={onKapat} className="h-11 rounded-full bg-yesil text-sm font-bold text-white">Kapat</button>
          </div>
        ) : (
          <>
            <Segment<GeriBildirimTuru> etiket="Tür" deger={tur} onDegis={setTur}
              secenekler={[["oneri", "Öneri"], ["sorun", "Sorun"], ["diger", "Diğer"]]} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">{tur === "sorun" ? "Ne oldu? Hangi ekranda?" : "Ne olsun istersin?"}</span>
              <textarea value={metin} onChange={(e) => setMetin(e.target.value)} maxLength={2000} rows={5} required autoFocus
                className="rounded-xl border border-[#D9CDC6] bg-white p-3 text-sm outline-none focus:border-yesil focus:ring-2 focus:ring-yesil/20" />
              <span className="self-end text-xs text-soluk">{metin.length}/2000</span>
            </label>
            {gonder.isError && <p className="text-sm font-semibold text-mercan-koyu">{(gonder.error as Error).message}</p>}
            <button type="submit" disabled={!metin.trim() || gonder.isPending}
              className="h-11 rounded-full bg-yesil text-sm font-bold text-white disabled:opacity-50">
              {gonder.isPending ? "Gönderiliyor…" : "Gönder"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

/** Yönetici: gelen geri bildirimler. */
export function GeriBildirimListesi() {
  const { api, kisiler } = useBaglam();
  const qc = useQueryClient();
  const [filtre, setFiltre] = useState<"acik" | "hepsi">("acik");
  const q = useQuery({ queryKey: ["geri-bildirimler"], queryFn: api.geriBildirimler });
  const durum = useMutation({
    mutationFn: ({ id, d }: { id: number; d: GeriBildirimDurumu }) => api.geriBildirimDurum(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["geri-bildirimler"] }),
  });
  const ad = new Map(kisiler.map((k) => [k.id, k.ad]));
  const list = (q.data ?? []).filter((g) => filtre === "hepsi" || g.durum === "yeni" || g.durum === "inceleniyor");
  const yeni = (q.data ?? []).filter((g) => g.durum === "yeni").length;
  return (
    <Kart className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-baslik text-lg font-bold">Geri bildirimler {yeni > 0 && <Rozet tur="yeni">{yeni} yeni</Rozet>}</h2>
        <Segment<"acik" | "hepsi"> kucuk etiket="Süzgeç" deger={filtre} onDegis={setFiltre} secenekler={[["acik", "Açık"], ["hepsi", "Hepsi"]]} />
      </div>
      {q.isLoading ? <span className="text-sm text-soluk">Yükleniyor…</span> : list.length === 0 ? (
        <span className="text-sm text-soluk">Açık geri bildirim yok.</span>
      ) : (
        <ul className="flex flex-col divide-y divide-cizgi">
          {list.map((g) => (
            <li key={g.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-soluk">
                <Rozet tur={g.tur === "sorun" ? "cakisma" : "gri"}>{TUR_ADI[g.tur]}</Rozet>
                <span className="font-semibold text-murekkep">{(g.kisi_id && ad.get(g.kisi_id)) || "?"}</span>
                <span>{gorece(g.olusturma)}{g.sayfa ? ` · ${g.sayfa}` : ""}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{g.metin}</p>
              <select aria-label="Durum" value={g.durum} className="secim self-start text-xs"
                onChange={(e) => durum.mutate({ id: g.id, d: e.target.value as GeriBildirimDurumu })}>
                {Object.entries(DURUM_ADI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}
