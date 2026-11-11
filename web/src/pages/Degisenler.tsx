import { useMemo } from "react";
import { SayfaUstu } from "../components/Kabuk";
import { Bos, Ikon, Rozet } from "../components/ui";
import { useBaglam } from "../lib/baglam";
import { cakismaKarti, degisiklikKarti, type DegisiklikKarti } from "../lib/degisiklik";
import { bugunTR, gunBasligi } from "../lib/time";

export function Degisenler() {
  const { degisiklikler, cakismalar, tum, tz, saatModu, sonGorulme, okunduSay } = useBaglam();

  const { dikkat, yeni, onceki } = useMemo(() => {
    const byId = new Map(tum.map((o) => [o.id, o]));
    const kartlar = degisiklikler.map((d) => degisiklikKarti(d, d.oturum_id ? byId.get(d.oturum_id) : undefined, tz, saatModu));
    return {
      dikkat: cakismalar.filter((c) => c.a.tarih >= bugunTR()).map((c) => cakismaKarti(c, tz, saatModu)),
      yeni: kartlar.filter((k) => k.zamanMs > sonGorulme),
      onceki: kartlar.filter((k) => k.zamanMs <= sonGorulme),
    };
  }, [degisiklikler, cakismalar, tum, tz, saatModu, sonGorulme]);

  return (
    <>
      <SayfaUstu baslik="Ne değişti"
        ust={sonGorulme ? `Son okuduğun: ${gunBasligi(new Date(sonGorulme + 3 * 36e5).toISOString().slice(0, 10))}` : undefined}
        sag={yeni.length > 0 && (
          <button onClick={okunduSay} className="h-9 rounded-full border border-[#D9CDC6] bg-white px-3 text-xs font-semibold">Hepsini okundu say</button>
        )} />
      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-3 pt-4 lg:mx-0 lg:px-10">
        {dikkat.length > 0 && <Grup baslik={`Dikkat · ${dikkat.length}`} renk="text-mercan-yazi" kartlar={dikkat} />}
        {yeni.length > 0 && <Grup baslik={`Yeni · ${yeni.length}`} renk="text-mercan-yazi" kartlar={yeni} yeni />}
        {onceki.length > 0 && <Grup baslik="Daha önce" renk="text-silik" kartlar={onceki} soluk />}
        {!dikkat.length && !yeni.length && !onceki.length && <Bos>Henüz bir değişiklik yok. Programında bir şey değişince burada göreceksin.</Bos>}
      </div>
    </>
  );
}

function Grup({ baslik, renk, kartlar, yeni = false, soluk = false }: { baslik: string; renk: string; kartlar: DegisiklikKarti[]; yeni?: boolean; soluk?: boolean }) {
  const { sec } = useBaglam();
  return (
    <section className="flex flex-col gap-2.5">
      <span className={`px-2 pt-1 text-xs font-bold uppercase tracking-wider ${renk}`}>{baslik}</span>
      {kartlar.map((k) => (
        <article key={k.anahtar} className={`relative flex flex-col gap-2.5 rounded-kart bg-white p-4 ${soluk ? "opacity-75" : ""}`}>
          {yeni && <span className="absolute right-4 top-[18px] h-2 w-2 rounded-full bg-mercan" aria-label="Okunmadı" />}
          <div className="flex items-center gap-2">
            <Rozet tur={k.rozet}>{k.rozetMetin}</Rozet>
            {k.zaman && <span className="text-xs text-soluk">{k.zaman}</span>}
          </div>
          <h3 className="pr-4 font-baslik text-[17px] font-bold leading-snug tracking-tight">{k.baslik}</h3>
          {k.eski ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-silik line-through">{k.eski}</span>
              <Ikon ad="ok" boyut={16} />
              <span className="font-bold tabular-nums">{k.yeni}</span>
            </div>
          ) : null}
          <span className="text-[13px] text-[#4A3A36]">{k.alt}</span>
          {k.oturum && (
            <div>
              <button onClick={() => sec(k.oturum!)} className="h-10 rounded-xl bg-yesil px-3.5 text-[13px] font-semibold text-white">Oturuma bak</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
