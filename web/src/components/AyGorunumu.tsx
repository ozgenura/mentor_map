// Ay görünümü: kalabalığı azaltmak için gün başına en fazla iki mini kart (geniş ekran) ya da
// renkli noktalar (telefon). Güne dokununca o günün gün görünümü açılır.

import { useMemo, useState } from "react";
import { useBaglam } from "../lib/baglam";
import { kartEtiketi, kisaltmaHaritasi, siraliOturumlar, TATILLER } from "../lib/derive";
import { bugunTR, gunEkle, haftaBasi, saatAraligi } from "../lib/time";
import type { Oturum } from "../lib/types";
import { Ikon } from "./ui";

const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const KART_SAYISI = 2;

/** Fareyle üzerine gelince görünen tam bilgi (geniş ekran). Telefonda aynı bilgi detayda. */
export function ipucu(o: Oturum): string {
  return [
    `${o.bootcamp_ad} · ${o.tur}${o.durum === "iptal" ? " · İPTAL" : ""}`,
    o.konu,
    saatAraligi(o) ? `${saatAraligi(o)} TR` : "Saat belirsiz",
    o.anlaticilar.length ? o.anlaticilar.map((a) => (a.rol === "konuk" ? `${a.ad} (konuk)` : a.ad)).join(", ") : "Eğitmen atanmamış",
  ].join("\n");
}

export function AyGorunumu({ oturumlar, secili, onGunSec }: { oturumlar: Oturum[]; secili: string; onGunSec: (t: string) => void }) {
  const { tum, cakisanlar } = useBaglam();
  const [ay, setAy] = useState(secili.slice(0, 7)); // 'YYYY-MM'
  const harita = useMemo(() => kisaltmaHaritasi(tum.flatMap((o) => o.anlaticilar.map((a) => a.ad))), [tum]);
  const bugun = bugunTR();

  const gunler = useMemo(() => {
    const ilk = haftaBasi(`${ay}-01`);
    const [y, m] = ay.split("-").map(Number);
    const sonGun = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const hucre: string[] = [];
    for (let t = ilk; t <= sonGun || hucre.length % 7; t = gunEkle(t, 1)) hucre.push(t);
    return hucre;
  }, [ay]);

  const gunun = useMemo(() => {
    const m = new Map<string, Oturum[]>();
    for (const o of siraliOturumlar(oturumlar)) m.set(o.tarih, [...(m.get(o.tarih) ?? []), o]);
    return m;
  }, [oturumlar]);

  function kaydir(n: number) {
    const [y, m] = ay.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setAy(d.toISOString().slice(0, 7));
  }
  const [yil, ayNo] = ay.split("-").map(Number);

  return (
    <div className="rounded-[24px] bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="font-baslik text-xl font-bold tracking-tight">{AY[ayNo - 1]} {yil}</span>
        <div className="flex gap-1.5">
          <button aria-label="Önceki ay" onClick={() => kaydir(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zemin"><Ikon ad="sol" boyut={18} /></button>
          <button onClick={() => setAy(bugun.slice(0, 7))} className="h-10 rounded-xl bg-zemin px-3 text-[13px] font-semibold">Bugün</button>
          <button aria-label="Sonraki ay" onClick={() => kaydir(1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zemin"><Ikon ad="sag" boyut={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-silik">
        {GUN_KISA.map((g) => <span key={g} className="py-1">{g}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gunler.map((t) => {
          const list = gunun.get(t) ?? [];
          const buAy = t.slice(0, 7) === ay;
          const planli = list.filter((o) => o.durum === "planli");
          const renkler = [...new Set(planli.map((o) => o.renk))];
          const cakisma = planli.some((o) => cakisanlar.has(o.id));
          return (
            <button key={t} onClick={() => onGunSec(t)} aria-label={`${t}: ${list.length} oturum`}
              className={`flex min-h-[64px] flex-col items-stretch gap-1 rounded-xl p-1.5 text-left transition hover:bg-zemin lg:min-h-[112px] ${
                buAy ? "" : "opacity-40"} ${t === bugun ? "ring-2 ring-yesil/40" : ""}`}>
              <span className="flex items-center justify-between">
                <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${
                  t === bugun ? "bg-yesil text-white" : ""}`}>{Number(t.slice(8))}</span>
                {cakisma && <span className="h-2 w-2 rounded-full bg-mercan" title="Çakışma var" />}
              </span>
              {TATILLER[t] && <span className="truncate text-[10px] font-semibold text-mercan-yazi">{TATILLER[t]}</span>}

              {/* telefon: noktalar + sayı */}
              {list.length > 0 && (
                <span className="mt-auto flex items-center gap-0.5 lg:hidden">
                  {renkler.slice(0, 3).map((r) => <span key={r} className="h-1.5 w-1.5 rounded-full" style={{ background: r }} />)}
                  {list.length > 1 && <span className="ml-0.5 text-[10px] font-bold text-soluk">{list.length}</span>}
                </span>
              )}

              {/* geniş ekran: en fazla iki mini kart */}
              <span className="hidden flex-col gap-1 lg:flex">
                {list.slice(0, KART_SAYISI).map((o) => {
                  const iptal = o.durum === "iptal";
                  return (
                    <span key={o.id} title={ipucu(o)}
                      className={`block rounded-md border-l-[3px] bg-zemin px-1.5 py-1 ${iptal ? "opacity-50" : ""}`}
                      style={{ borderColor: o.renk }}>
                      <span className={`block truncate text-[11px] font-bold leading-tight ${iptal ? "line-through" : ""}`}>{kartEtiketi(o, harita)}</span>
                      <span className={`block truncate text-[11px] leading-tight text-soluk ${iptal ? "line-through" : ""}`}>{o.konu || o.tur}</span>
                    </span>
                  );
                })}
                {list.length > KART_SAYISI && (
                  <span className="px-1 text-[11px] font-bold text-yesil">+{list.length - KART_SAYISI} oturum daha</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[11px] text-soluk">Bir güne dokununca o günün bütün oturumları açılır. Kırmızı nokta çakışma demektir.</p>
    </div>
  );
}
