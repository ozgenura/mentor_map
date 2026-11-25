// Profil → Bildirim ayarları: bu cihazda anlık bildirimi aç/kapat, ders hatırlatması, deneme bildirimi.
// iPhone'da bildirim yalnızca ana ekrana eklenmiş uygulamada çalışır; adımlar gösterilir.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DEMO } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import { bildirimDurumu, bildirimleriAc, bildirimleriKapat, type BildirimDurumu } from "../lib/bildirim";
import { Ikon, Kart } from "./ui";

export function Bildirimler() {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [durum, setDurum] = useState<BildirimDurumu | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const ayar = useQuery({ queryKey: ["bildirimAyari"], queryFn: () => api.bildirimAyari(), enabled: !DEMO });
  useEffect(() => { bildirimDurumu().then(setDurum).catch(() => setDurum("desteklenmiyor")); }, []);

  async function is(f: () => Promise<void>, basari?: string) {
    setBekliyor(true); setMesaj(null);
    try { await f(); if (basari) setMesaj(basari); } catch (e) { setMesaj(e instanceof Error ? e.message : "Olmadı, tekrar dene."); }
    finally { setBekliyor(false); setDurum(await bildirimDurumu().catch(() => "desteklenmiyor" as const)); qc.invalidateQueries({ queryKey: ["bildirimAyari"] }); }
  }

  return (
    <Kart className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Ikon ad="zil" boyut={18} />
        <h2 className="font-baslik text-lg font-bold">Bildirim ayarları</h2>
        {durum === "acik" && <span className="ml-auto rounded-full bg-nane px-2.5 py-1 text-xs font-bold text-nane-koyu">Bu cihazda açık</span>}
      </div>
      <p className="text-[13px] text-soluk">
        Dersin iptal edildiğinde, saati değiştiğinde, bir derse atandığında, yeni anons ya da talep geldiğinde telefonuna bildirim gelir.
        Gece 23:00–08:00 arası yalnızca iptaller gelir, diğerleri sabah gelir.
      </p>

      {DEMO ? <p className="text-[13px] text-soluk">Demoda bildirim açılamaz.</p>
        : durum === "ios-ana-ekran" ? (
          <ol className="flex list-decimal flex-col gap-1 rounded-xl bg-zemin py-3 pl-8 pr-3 text-[13px]">
            <li>iPhone'da bildirim için Mentor Map'i ana ekrana eklemen gerekiyor. Bu sayfayı <strong>Safari</strong>'de aç.</li>
            <li>Alttaki <strong>Paylaş</strong> düğmesine dokun, <strong>Ana Ekrana Ekle</strong>'yi seç.</li>
            <li>Ana ekrandaki Mentor Map simgesinden aç, buraya dönüp <strong>Bildirimleri aç</strong>'a dokun.</li>
          </ol>
        ) : durum === "desteklenmiyor" ? (
          <p className="text-[13px] text-soluk">Bu tarayıcı anlık bildirimi desteklemiyor. Telefonda Chrome (Android) ya da ana ekrana eklenmiş uygulama (iPhone) kullan.</p>
        ) : durum === "reddedildi" ? (
          <p className="text-[13px] text-soluk">Bildirim izni kapalı. Tarayıcı ya da telefon ayarlarında Mentor Map için bildirimlere izin ver, sonra sayfayı yenile.</p>
        ) : durum === "kapali" ? (
          <button disabled={bekliyor} onClick={() => is(async () => api.pushAboneOl(await bildirimleriAc()), "Bildirimler açıldı 🚇")}
            className="h-11 rounded-2xl bg-yesil text-sm font-bold text-white disabled:opacity-50">Bildirimleri aç</button>
        ) : durum === "acik" ? (
          <div className="flex flex-wrap gap-2">
            <button disabled={bekliyor} onClick={() => is(() => api.pushDeneme(), "Deneme bildirimi yolda; bir dakika içinde gelir.")}
              className="h-10 rounded-full bg-yesil px-4 text-[13px] font-bold text-white disabled:opacity-50">Deneme bildirimi gönder</button>
            <button disabled={bekliyor} onClick={() => is(async () => { const e = await bildirimleriKapat(); if (e) await api.pushAbonelikSil(e); }, "Bu cihazda bildirimler kapandı.")}
              className="h-10 rounded-full border border-cizgi px-4 text-[13px] font-semibold disabled:opacity-50">Bu cihazda kapat</button>
          </div>
        ) : null}

      {!DEMO && ayar.data && (
        <label className="flex items-center justify-between gap-3 rounded-xl bg-zemin px-3 py-2.5 text-sm">
          <span><span className="font-semibold">Ders hatırlatması</span><span className="block text-xs text-soluk">Dersinden 1 saat önce, Zoom linkiyle</span></span>
          <input type="checkbox" className="h-5 w-5 accent-yesil" checked={ayar.data.hatirlatma} disabled={bekliyor}
            onChange={(e) => is(async () => { await api.bildirimAyari(e.target.checked); })} />
        </label>
      )}
      {!DEMO && ayar.data && ayar.data.cihaz > 0 && (
        <span className="text-xs text-soluk">Bildirim alan cihazların: {ayar.data.cihaz}</span>
      )}
      {mesaj && <span role="status" className="text-[13px] font-semibold">{mesaj}</span>}
    </Kart>
  );
}
