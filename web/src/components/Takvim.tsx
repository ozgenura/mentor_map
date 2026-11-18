import trLocale from "@fullcalendar/core/locales/tr";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBaglam } from "../lib/baglam";
import { gectiMi, kartEtiketi, kisaltmaHaritasi, sonrakiOturum, yaziRengi } from "../lib/derive";
import { duvar, gunBasligi, gunEkle, saat, TR } from "../lib/time";
import { Ikon } from "./ui";
import type { Oturum } from "../lib/types";
import { ipucu } from "./AyGorunumu";

function useDar() {
  const q = "(max-width: 640px)";
  const [dar, setDar] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setDar(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return dar;
}

/** Hafta görünümü. Saatler kişinin seçtiği saatle (TR ya da kendi saat dilimi) duvar saati olarak çizilir.
 *  Kart: 1. satır "DA · HA" ve saat, 2. satır ders adı; tam bilgi fareyle üzerine gelince. */
export function Takvim({ oturumlar, onGunSec }: { oturumlar: Oturum[]; onGunSec: (t: string) => void }) {
  const { sec, cakisanlar, tum, tz, saatModu } = useBaglam();
  const gTz = saatModu === "yerel" ? tz : TR;
  const dar = useDar();
  const harita = useMemo(() => kisaltmaHaritasi(tum.flatMap((o) => o.anlaticilar.map((a) => a.ad))), [tum]);
  const byId = useMemo(() => new Map(oturumlar.map((o) => [o.id, o])), [oturumlar]);
  const events = useMemo(
    () =>
      oturumlar.map((o) => {
        const iptal = o.durum === "iptal";
        const sinif = [...(iptal ? ["mm-iptal"] : cakisanlar.has(o.id) ? ["mm-cakisma"] : []), ...(gectiMi(o) ? ["mm-gecmis"] : [])];
        return {
          id: o.id,
          title: o.konu || o.tur,
          start: o.baslangic ? duvar(o.baslangic, gTz) : o.tarih,
          end: o.bitis ? duvar(o.bitis, gTz) : gunEkle(o.tarih, 1),
          allDay: !o.baslangic,
          backgroundColor: iptal ? "transparent" : o.renk,
          borderColor: o.renk,
          textColor: iptal ? "#6B5C57" : yaziRengi(o.renk),
          classNames: sinif,
        };
      }),
    [oturumlar, cakisanlar, gTz],
  );

  // Çoğu ders akşam: ızgara en erken oturumun bir saat öncesinden başlar (en geç 17:00).
  const ilkSaat = useMemo(() => {
    const saatler = oturumlar.filter((o) => o.baslangic).map((o) => Number(duvar(o.baslangic!, gTz).slice(11, 13)));
    return Math.max(0, Math.min(17, ...saatler) - 1);
  }, [oturumlar, gTz]);

  const view = dar ? "ucGun" : "timeGridWeek";
  const takvim = useRef<FullCalendar>(null);
  // Görünen aralık boşsa: açıklama ve sonraki oturuma git (geri bildirim, 18 Kasım).
  const [aralik, setAralik] = useState<[string, string] | null>(null);
  const bos = aralik && !oturumlar.some((o) => o.tarih >= aralik[0] && o.tarih < aralik[1]);
  const sonraki = bos ? sonrakiOturum(oturumlar, aralik![1]) : undefined;
  return (
    <div className="mm-takvim rounded-[24px] bg-white p-3 sm:p-4">
      {bos && (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-zemin px-4 py-3 text-[13px]">
          <span className="font-semibold">{dar ? "Bu günlerde" : "Bu hafta"} planlanmış oturum yok.</span>
          {sonraki ? (
            <button onClick={() => takvim.current?.getApi().gotoDate(sonraki.tarih)}
              className="flex items-center gap-1 font-semibold text-yesil underline">
              Sonraki oturum: {gunBasligi(sonraki.tarih)} · {sonraki.konu || sonraki.tur} <Ikon ad="sag" boyut={14} />
            </button>
          ) : <span className="text-soluk">İleride planlanmış oturum da yok.</span>}
        </div>
      )}
      <FullCalendar
        ref={takvim}
        datesSet={(a) => setAralik([a.startStr.slice(0, 10), a.endStr.slice(0, 10)])}
        key={view}
        plugins={[timeGridPlugin]}
        locale={trLocale}
        initialView={view}
        views={{ ucGun: { type: "timeGrid", duration: { days: 3 }, buttonText: "3 gün" } }}
        firstDay={1}
        height="auto"
        headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
        buttonText={{ today: "Bugün" }}
        slotMinTime={`${String(ilkSaat).padStart(2, "0")}:00:00`}
        slotMaxTime="24:00:00"
        allDayText="Saatsiz"
        nowIndicator
        eventMaxStack={3}
        moreLinkContent={(arg) => `+${arg.num}`}
        moreLinkHint="Bu saatteki diğer oturumlar için günü aç"
        moreLinkClick={(arg) => {
          const d = arg.date; // duvar saatiyle çizildiği için tarih bileşenleri gösterilen günün kendisidir
          onGunSec(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        events={events}
        eventContent={(arg) => {
          const o = byId.get(arg.event.id);
          if (!o) return null;
          return (
            <div className="flex h-full flex-col gap-0.5 overflow-hidden px-0.5 leading-tight">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11px] font-bold">{kartEtiketi(o, harita)}</span>
                {o.baslangic && <span className="shrink-0 text-[10px] font-semibold opacity-80">{saat(o.baslangic, gTz)}</span>}
              </div>
              <span className="line-clamp-2 text-[11px] font-medium opacity-90">{o.konu || o.tur}</span>
            </div>
          );
        }}
        eventDidMount={(info) => {
          const o = byId.get(info.event.id);
          if (o) info.el.title = ipucu(o);
        }}
        eventClick={(info) => {
          const o = byId.get(info.event.id);
          if (o) sec(o);
        }}
      />
      <p className="mt-2 px-1 text-[11px] text-soluk">
        Kartta bootcamp · anlatıcının baş harfleri ve ders adı yazar; tam bilgi için üzerine gel ya da dokun.
        Kırmızı çerçeve çakışma, soluk kart geçmiş oturum demektir.
      </p>
    </div>
  );
}
