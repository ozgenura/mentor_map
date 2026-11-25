// Profil → Başka cihazda giriş: bu cihazda 10 dakikalık, tek kullanımlık eşleme kodu üretir.
// iPhone'da ana ekran uygulaması e-postadaki bağlantıyı açamadığı için en kolay yol budur.

import { useEffect, useState } from "react";
import { useBaglam } from "../lib/baglam";
import { Ikon, Kart } from "./ui";

export function CihazEslesme() {
  const { api } = useBaglam();
  const [kod, setKod] = useState<{ kod: string; bitis: number } | null>(null);
  const [simdi, setSimdi] = useState(Date.now());
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    if (!kod) return;
    const t = setInterval(() => setSimdi(Date.now()), 1000);
    return () => clearInterval(t);
  }, [kod]);
  const kalan = kod ? Math.max(0, Math.round((kod.bitis - simdi) / 1000)) : 0;

  async function al() {
    setHata(null);
    try { setKod({ kod: await api.cihazKoduOlustur(), bitis: Date.now() + 10 * 60_000 }); setSimdi(Date.now()); }
    catch (e) { setHata(e instanceof Error ? e.message : "Kod alınamadı."); }
  }

  return (
    <Kart className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Ikon ad="kisi" boyut={18} />
        <h2 className="font-baslik text-lg font-bold">Başka cihazda giriş</h2>
      </div>
      <p className="text-[13px] text-soluk">
        Telefonuna eklediğin Mentor Map uygulamasına e-posta beklemeden girmek için: burada kod al, uygulamanın giriş ekranında
        "eşleme koduyla gir"e dokunup kodu yaz.
      </p>
      {kod && kalan > 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl bg-zemin py-3">
          <span className="select-all font-baslik text-3xl font-bold tracking-[0.15em]">{kod.kod}</span>
          <span className="text-xs text-soluk">{Math.floor(kalan / 60)}:{String(kalan % 60).padStart(2, "0")} içinde, bir kez kullanılır</span>
        </div>
      ) : (
        <button onClick={al} className="h-11 rounded-2xl bg-yesil text-sm font-bold text-white">{kod ? "Yeni kod al" : "Kod al"}</button>
      )}
      {hata && <span role="alert" className="text-xs text-mercan-koyu">{hata}</span>}
    </Kart>
  );
}
