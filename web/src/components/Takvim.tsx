import trLocale from "@fullcalendar/core/locales/tr";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useState } from "react";
import { useBaglam } from "../lib/baglam";
import { kartEtiketi, kisaltmaHaritasi, yaziRengi } from "../lib/derive";
import { gunEkle, saat, trDuvar } from "../lib/time";
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

/** Hafta görünümü. Saatler TR duvar saatiyle çizilir (program TR'ye göre kurulur).
 *  Kart: 1. satır "DA · HA" ve saat, 2. satır ders adı; tam bilgi fareyle üzerine gelince. */
export function Takvim({ oturumlar, onGunSec }: { oturumlar: Oturum[]; onGunSec: (t: string) => void }) {
  const { sec, cakisanlar, tum } = useBaglam();
  const dar = useDar();
  const harita = useMemo(() => kisaltmaHaritasi(tum.flatMap((o) => o.anlaticilar.map((a) => a.ad))), [tum]);
  const byId = useMemo(() => new Map(oturumlar.map((o) => [o.id, o])), [oturumlar]);
  const events = useMemo(
    () =>
      oturumlar.map((o) => {
        const iptal = o.durum === "iptal";
        const sinif = iptal ? ["mm-iptal"] : cakisanlar.has(o.id) ? ["mm-cakisma"] : [];
        return {
          id: o.id,
          title: o.konu || o.tur,
          start: o.baslangic ? trDuvar(o.baslangic) : o.tarih,
          end: o.bitis ? trDuvar(o.bitis) : gunEkle(o.tarih, 1),
          allDay: !o.baslangic,
          backgroundColor: iptal ? "transparent" : o.renk,
          borderColor: o.renk,
          textColor: iptal ? "#6B5C57" : yaziRengi(o.renk),
          classNames: sinif,
        };
      }),
    [oturumlar, cakisanlar],
  );

  // Çoğu ders akşam: ızgara en erken oturumun bir saat öncesinden başlar (en geç 17:00).
  const ilkSaat = useMemo(() => {
    const saatler = oturumlar.filter((o) => o.baslangic).map((o) => Number(trDuvar(o.baslangic!).slice(11, 13)));
    return Math.max(0, Math.min(17, ...saatler) - 1);
  }, [oturumlar]);

  const view = dar ? "ucGun" : "timeGridWeek";
  return (
    <div className="mm-takvim rounded-[24px] bg-white p-3 sm:p-4">
      <FullCalendar
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
          const d = arg.date; // TR duvar saatiyle çizildiği için yerel tarih bileşenleri TR günüdür
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
                {o.baslangic && <span className="shrink-0 text-[10px] font-semibold opacity-80">{saat(o.baslangic)}</span>}
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
        Saatler TR saatidir. Kartta bootcamp · anlatıcının baş harfleri ve ders adı yazar; tam bilgi için üzerine gel ya da dokun.
        Kırmızı çerçeve çakışma demektir.
      </p>
    </div>
  );
}
