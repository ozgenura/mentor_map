// Etkinlikler sekmesi: bootcamp'lere bağlı ücretsiz etkinlikler ve Genel etkinlikler. Herkes hepsini görür.

import { useMemo, useState } from "react";
import { SayfaUstu } from "../components/Kabuk";
import { BootcampEtiketi, Bos, Ikon, Kart, Rozet } from "../components/ui";
import { gosterim, useBaglam } from "../lib/baglam";
import { guvenliLink } from "../lib/derive";
import { etkinlikGruplari, etkinlikMi, GENEL_KOD, type AyGrubu } from "../lib/etkinlik";
import { gunBasligi } from "../lib/time";
import type { Oturum } from "../lib/types";
import { SaatSecici } from "./Bugun";

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ayAdi = (ay: string) => `${AYLAR[Number(ay.slice(5, 7)) - 1]} ${ay.slice(0, 4)}`;

export function Etkinlikler() {
  const { tum } = useBaglam();
  const [bootcamp, setBootcamp] = useState("");
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const secenekler = useMemo(() => [...new Map(tum.filter(etkinlikMi).map((o) => [o.kisa_kod, o.bootcamp_ad])).entries()]
    .sort((a, b) => (a[0] === GENEL_KOD ? -1 : b[0] === GENEL_KOD ? 1 : a[0].localeCompare(b[0], "tr"))), [tum]);
  const g = useMemo(() => etkinlikGruplari(tum, bootcamp), [tum, bootcamp]);
  const adet = g.yaklasan.reduce((n, a) => n + a.etkinlikler.length, 0);

  return (
    <>
      <SayfaUstu ust="Bootcamp etkinlikleri ve genel etkinlikler" baslik={adet ? `${adet} yaklaşan etkinlik` : "Etkinlikler"}
        sag={<SaatSecici />} />
      <div className="flex flex-col gap-5 px-3 pt-4 lg:px-10">
        <div className="px-2 lg:px-0">
          <select aria-label="Bootcamp" value={bootcamp} onChange={(e) => setBootcamp(e.target.value)} className="secim">
            <option value="">Tüm etkinlikler</option>
            {secenekler.map(([kod, ad]) => <option key={kod} value={kod}>{kod === GENEL_KOD ? "Genel (bootcamp'e bağlı olmayan)" : ad}</option>)}
          </select>
        </div>
        {g.yaklasan.length ? <Gruplar gruplar={g.yaklasan} /> : (
          <Bos>
            Yaklaşan etkinlik yok. Etkinlikler program dosyasında Tür = Etkinlik seçilerek eklenir;
            bir bootcamp'e bağlı değilse Genel olarak yazılır.
          </Bos>
        )}
        {g.gecmis.length > 0 && (
          <section className="flex flex-col gap-3">
            <button onClick={() => setGecmisAcik((x) => !x)} aria-expanded={gecmisAcik}
              className="flex items-center gap-1.5 px-2 text-[13px] font-semibold text-soluk lg:px-0">
              <Ikon ad={gecmisAcik ? "sol" : "sag"} boyut={16} className={gecmisAcik ? "-rotate-90" : ""} />
              Geçmiş etkinlikler ({g.gecmis.reduce((n, a) => n + a.etkinlikler.length, 0)})
            </button>
            {gecmisAcik && <Gruplar gruplar={g.gecmis} soluk />}
          </section>
        )}
      </div>
    </>
  );
}

function Gruplar({ gruplar, soluk = false }: { gruplar: AyGrubu[]; soluk?: boolean }) {
  return (
    <div className={`flex flex-col gap-5 ${soluk ? "opacity-70" : ""}`}>
      {gruplar.map((a) => (
        <section key={a.ay} className="flex flex-col gap-2.5">
          <h2 className="px-2 font-baslik text-lg font-bold tracking-tight lg:px-0">{ayAdi(a.ay)}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {a.etkinlikler.map((o) => <EtkinlikKarti key={o.id} o={o} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function EtkinlikKarti({ o }: { o: Oturum }) {
  const { tz, saatModu, sec } = useBaglam();
  const g = gosterim(o, tz, saatModu);
  const iptal = o.durum === "iptal";
  const konusmacilar = o.anlaticilar.map((x) => x.ad).join(", ");
  const link = guvenliLink(o.toplanti_linki);
  return (
    <Kart className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-soluk">
            {gunBasligi(o.tarih)}{g.ana ? ` · ${g.ana} ${g.birim}` : ""}{g.ikincil ? ` (${g.ikincil})` : ""}
          </span>
          <h3 className={`font-baslik text-[19px] font-semibold leading-tight tracking-tight ${iptal ? "line-through" : ""}`}>
            {o.konu || "Etkinlik"}
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {o.kisa_kod === GENEL_KOD ? <Rozet tur="gri">Genel</Rozet> : <BootcampEtiketi kod={o.kisa_kod} renk={o.renk} />}
          {iptal && <Rozet tur="iptal">İptal</Rozet>}
        </div>
      </div>
      {konusmacilar && <span className="text-sm"><span className="text-soluk">Konuşmacı: </span>{konusmacilar}</span>}
      {o.aciklama && <p className="line-clamp-3 text-sm text-soluk">{o.aciklama}</p>}
      <div className="flex flex-wrap gap-2">
        {link && !iptal && (
          <a href={link} target="_blank" rel="noreferrer"
            className="flex h-10 items-center gap-1.5 rounded-full bg-yesil px-4 text-[13px] font-bold text-white">
            <Ikon ad="video" boyut={16} /> Katılım linki
          </a>
        )}
        <button onClick={() => sec(o)} className="h-10 rounded-full border border-cizgi px-4 text-[13px] font-semibold">Detay</button>
      </div>
    </Kart>
  );
}
