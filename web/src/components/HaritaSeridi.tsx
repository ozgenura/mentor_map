// Bugün ekranındaki "Haritan" kartı: kişinin bootcamp hatları, bu hafta ve önündeki 4 hafta.
// Durağa dokununca o haftadaki (tercihen kişinin) oturumu açılır; "Haritanın tamamı" Takvim → Harita'ya gider.

import { useMemo } from "react";
import { useBaglam } from "../lib/baglam";
import { ilerlemeler } from "../lib/derive";
import { durakAnahtari, GORUNUM_ANAHTARI, haritaKur } from "../lib/harita";
import { bugunTR, gunEkle } from "../lib/time";
import type { Oturum } from "../lib/types";

const PENCERE = 5;
const AY_UST = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];
const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MUREKKEP = "#22110F", MERCAN = "#F08891", MERCAN_KOYU = "#8E0D19";

export function HaritaSeridi() {
  const { tum, ben, sec, git } = useBaglam();
  const bugun = bugunTR();
  const vurgu = useMemo(() => (o: Oturum) => !!ben && o.anlaticilar.some((a) => a.kisi_id === ben.id), [ben]);
  const h = useMemo(() => {
    const hatlar = new Set(tum.filter(vurgu).map((o) => o.bootcamp_id));
    return haritaKur(tum.filter((o) => hatlar.has(o.bootcamp_id)), vurgu, bugun);
  }, [tum, vurgu, bugun]);
  const ilerleme = useMemo(() => new Map(ben ? ilerlemeler(tum, ben.id).map((p) => [p.bootcampId, p]) : []), [tum, ben]);

  if (!ben || h.bugunHafta < 0 || h.bugunHafta >= h.haftalar.length) return null;
  const w0 = h.bugunHafta, w1 = Math.min(h.haftalar.length - 1, w0 + PENCERE - 1);
  const hatlar = h.hatlar.filter((x) => x.son >= w0 && x.ilk <= w1);
  if (!hatlar.length) return null;

  const W = 340, col = W / PENCERE, UST = 22, ARA = 38;
  const yOf = new Map(hatlar.map((x, i) => [x.id, UST + i * ARA]));
  const H = UST + (hatlar.length - 1) * ARA + 40;
  const xOf = (i: number) => (i - w0 + 0.5) * col;
  const gunFarki = (Date.parse(`${bugun}T12:00:00Z`) - Date.parse(`${h.haftalar[w0]}T12:00:00Z`)) / 864e5;
  const bugunX = ((gunFarki + 0.5) / 7) * col;

  const pencereDuraklari = h.duraklar.filter((d) => d.hafta >= w0 && d.hafta <= w1 && yOf.has(d.hatId));
  const aktarmalar = h.aktarmalar.filter((a) => a.hafta >= w0 && a.hafta <= w1 && a.hatlar.every((id) => yOf.has(id)));
  const ilkAktarma = aktarmalar[0]?.oturumlar.map((o) => o.tarih).sort()[0];
  const benimKalan = h.duraklar.filter((d) => d.benim && d.hafta >= w0)
    .flatMap((d) => d.oturumlar.filter((o) => vurgu(o) && o.durum === "planli" && o.tarih >= bugun)).length;

  const durakAc = (oturumlar: Oturum[]) => {
    const o = oturumlar.find((x) => vurgu(x) && x.durum === "planli") ?? oturumlar.find(vurgu) ?? oturumlar[0];
    if (o) sec(o);
  };
  const haritayaGit = () => {
    try { sessionStorage.setItem(GORUNUM_ANAHTARI, "harita"); } catch { /* yoksay */ }
    git("takvim");
  };

  return (
    <section className="flex flex-col gap-2.5 px-2 lg:px-0">
      <div className="flex items-baseline justify-between">
        <h2 className="font-baslik text-lg font-bold tracking-tight">Haritan</h2>
        <button onClick={haritayaGit} className="text-[13px] font-semibold underline">Takvim</button>
      </div>
      <div className="flex flex-col gap-2 rounded-[24px] bg-white px-4 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold">
            {hatlar.map((x) => {
              const p = ilerleme.get(x.id);
              return (
                <span key={x.id} className="inline-flex items-center gap-1.5">
                  <span className="h-[5px] w-3.5 rounded-[3px]" style={{ background: x.renk }} />{x.kod}
                  {p && <span className="font-semibold text-silik tabular-nums">{p.gecen}/{p.toplam}</span>}
                </span>
              );
            })}
          </span>
          {ilkAktarma && (
            <span className="text-[11px] font-bold text-mercan-koyu">
              {Number(ilkAktarma.slice(8))} {AY_KISA[Number(ilkAktarma.slice(5, 7)) - 1]} · aktarma
            </span>
          )}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label="Önümüzdeki 5 haftanın haritası">
          <rect x={0} y={2} width={col} height={H - 22} rx={10} fill="#FDE3E5" />
          {Array.from({ length: PENCERE - 1 }, (_, i) => (
            <line key={i} x1={col * (i + 1)} x2={col * (i + 1)} y1={6} y2={H - 22} stroke="#EFE8E2" />
          ))}
          {hatlar.map((x) => {
            const y = yOf.get(x.id)!;
            const x1 = x.ilk < w0 ? 2 : xOf(x.ilk), x2 = x.son > w1 ? W - 2 : xOf(x.son);
            const kes = Math.min(Math.max(bugunX, x1), x2);
            return (
              <g key={x.id}>
                {kes > x1 && <rect x={x1} y={y - 3} width={kes - x1} height={6} rx={3} fill={x.renk} opacity={0.35} />}
                {x2 > kes && <rect x={kes} y={y - 3} width={x2 - kes} height={6} rx={3} fill={x.renk} />}
                {x.son <= w1 && <rect x={x2 - 3} y={y - 9} width={6} height={18} rx={3} fill={x.renk} />}
              </g>
            );
          })}
          {aktarmalar.map((a) => {
            const ys = a.hatlar.map((id) => yOf.get(id)!);
            const y1 = Math.min(...ys), y2 = Math.max(...ys), x = xOf(a.hafta);
            return (
              <g key={`${a.hafta}-${a.hatlar.join()}`} role="button" tabIndex={0} className="cursor-pointer"
                aria-label="Çakışan oturumlar" onClick={() => durakAc(a.oturumlar)}
                onKeyDown={(e) => e.key === "Enter" && durakAc(a.oturumlar)}>
                <rect x={x - 14.5} y={y1 - 14.5} width={29} height={y2 - y1 + 29} rx={14.5} fill="none" stroke={MERCAN} strokeWidth={3} />
                <rect x={x - 11} y={y1 - 11} width={22} height={y2 - y1 + 22} rx={11} fill="#FFFFFF" stroke={MUREKKEP} strokeWidth={2.5} />
              </g>
            );
          })}
          {pencereDuraklari.map((d) => {
            const hat = hatlar.find((x) => x.id === d.hatId)!;
            const x = xOf(d.hafta), y = yOf.get(d.hatId)!;
            const etiket = `${hat.kod}, ${d.oturumlar.length} oturum: ${d.oturumlar.map((o) => o.konu || o.tur).join("; ")}`;
            return (
              <g key={durakAnahtari(d.hatId, d.hafta)} role="button" tabIndex={0} aria-label={etiket} className="cursor-pointer outline-none"
                onClick={() => durakAc(d.oturumlar)} onKeyDown={(e) => e.key === "Enter" && durakAc(d.oturumlar)}>
                <title>{etiket}</title>
                <circle cx={x} cy={y} r={15} fill="transparent" />
                {d.iptal
                  ? <circle cx={x} cy={y} r={4.5} fill="#FFFFFF" stroke="#C9BDB6" strokeWidth={2} strokeDasharray="2.5 2" />
                  : d.benim
                    ? <circle cx={x} cy={y} r={5.5} fill={MUREKKEP} stroke={hat.renk} strokeWidth={3} />
                    : <circle cx={x} cy={y} r={4} fill="#FFFFFF" stroke={hat.renk} strokeWidth={2.5} />}
              </g>
            );
          })}
          <line x1={bugunX} x2={bugunX} y1={6} y2={H - 22} stroke={MERCAN_KOYU} strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />
          {Array.from({ length: PENCERE }, (_, i) => {
            const t = gunEkle(h.haftalar[w0], 7 * i);
            return (
              <text key={t} x={col * (i + 0.5)} y={H - 6} textAnchor="middle" fontSize={10} fontWeight={700} letterSpacing="0.03em"
                fill={i === 0 ? MERCAN_KOYU : "#8F807A"}>
                {i === 0 ? "BU HAFTA" : `${Number(t.slice(8))} ${AY_UST[Number(t.slice(5, 7)) - 1]}`}
              </text>
            );
          })}
        </svg>
        <div className="flex items-center justify-between border-t border-cizgi pt-2.5">
          <span className="text-xs text-soluk">{benimKalan ? `Önünde ${benimKalan} durak` : "Önünde durak yok"}</span>
          <button onClick={haritayaGit} className="text-[13px] font-bold text-yesil">Haritanın tamamı →</button>
        </div>
      </div>
    </section>
  );
}
