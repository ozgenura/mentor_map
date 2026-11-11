// Takvimin "Harita" görünümü: program bir metro haritası gibi.
// Mobilde hatlar dikey (haftalar yukarıdan aşağı akar), geniş ekranda yatay (zaman soldan sağa).

import { useEffect, useMemo, useRef, useState } from "react";
import { gosterim, useBaglam } from "../lib/baglam";
import { durakAnahtari, haritaKur, type Durak, type Harita as HaritaT } from "../lib/harita";
import { bugunTR, gunEkle } from "../lib/time";
import type { Oturum } from "../lib/types";
import { Bos, Ikon, Rozet } from "./ui";

const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_UST = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];
const MUREKKEP = "#22110F", MERCAN = "#F08891", MERCAN_KOYU = "#8E0D19", PASIF = "#C9BDB6";

const tarihParca = (t: string) => ({ ay: Number(t.slice(5, 7)) - 1, gun: Number(t.slice(8)) });

function gunKisa(t: string) {
  const d = new Date(`${t}T12:00:00Z`);
  return `${GUN_KISA[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${AY_KISA[d.getUTCMonth()]}`;
}

function haftaUst(bas: string) {
  const son = gunEkle(bas, 6);
  const a = tarihParca(bas), b = tarihParca(son);
  return a.ay === b.ay ? `${a.gun}–${b.gun} ${AY_UST[a.ay]}` : `${a.gun} ${AY_UST[a.ay]} – ${b.gun} ${AY_UST[b.ay]}`;
}

type Props = { oturumlar: Oturum[]; vurgu: (o: Oturum) => boolean; vurguVar: boolean };

export function Harita({ oturumlar, vurgu, vurguVar }: Props) {
  const bugun = bugunTR();
  const h = useMemo(() => haritaKur(oturumlar, vurgu, bugun), [oturumlar, vurgu, bugun]);
  const [secili, setSecili] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(false); // mobil alt panel açık mı

  const durakBul = (k: string | null) => (k ? h.duraklar.find((d) => durakAnahtari(d.hatId, d.hafta) === k) : undefined);
  // Masaüstünde panel boş kalmasın: sıradaki vurgulu durak, yoksa bu haftanın ilk durağı.
  const varsayilan = useMemo(() => {
    const ileri = h.duraklar.filter((d) => d.hafta >= h.bugunHafta).sort((a, b) => a.hafta - b.hafta);
    const d = (vurguVar ? ileri.find((x) => x.benim) : undefined) ?? ileri[0] ?? h.duraklar[h.duraklar.length - 1];
    return d ? durakAnahtari(d.hatId, d.hafta) : null;
  }, [h, vurguVar]);
  const seciliDurak = durakBul(secili) ?? durakBul(varsayilan);

  if (!h.hatlar.length) return <Bos>Haritada gösterilecek oturum yok.</Bos>;

  const durakSec = (d: Durak, mobil: boolean) => {
    setSecili(durakAnahtari(d.hatId, d.hafta));
    if (mobil) setSayfa(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <Lejant h={h} vurguVar={vurguVar} />
      <div className="lg:hidden">
        <DikeyHarita h={h} vurgu={vurgu} vurguVar={vurguVar} onDurak={(d) => durakSec(d, true)} />
        <p className="mt-2.5 px-2 text-[11px] leading-snug text-soluk">
          Her hat bir bootcamp. Haftalar yukarıdan aşağı akar{vurguVar ? "; dolu duraklar senin oturumların" : ""}. Bir durağa dokununca o haftanın oturumları açılır.
        </p>
        {sayfa && seciliDurak && <AltPanel d={seciliDurak} h={h} onKapat={() => setSayfa(false)} />}
      </div>
      <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <YatayHarita h={h} vurguVar={vurguVar} secili={seciliDurak} onDurak={(d) => durakSec(d, false)} />
        <div className="flex flex-col gap-4">
          {seciliDurak && <DurakKarti d={seciliDurak} h={h} />}
          <Siradakiler h={h} vurgu={vurgu} vurguVar={vurguVar} onSec={(k) => setSecili(k)} />
        </div>
      </div>
    </div>
  );
}

function Lejant({ h, vurguVar }: { h: HaritaT; vurguVar: boolean }) {
  return (
    <div className="flex flex-col gap-2 px-2 lg:px-0">
      <div className="flex flex-wrap gap-1.5">
        {h.hatlar.map((x) => (
          <span key={x.id} className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-semibold">
            <span className="h-[5px] w-4 rounded-[3px]" style={{ background: x.renk }} />{x.ad}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-soluk">
        {vurguVar && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-murekkep" />Senin durağın</span>}
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-silik bg-white" />Programdaki oturum</span>
        {vurguVar && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-[18px] rounded-full border-2 border-murekkep bg-white" style={{ boxShadow: `0 0 0 2px ${MERCAN}` }} />Aktarma (çakışma)</span>}
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-dashed border-[#C9BDB6] bg-white" />İptal</span>
      </div>
    </div>
  );
}

/* ---------- ortak çizim parçaları ---------- */

function DurakNoktasi({ d, renk, x, y, gecmis, secili, onClick }: {
  d: Durak; renk: string; x: number; y: number; gecmis: boolean; secili?: boolean; onClick: () => void;
}) {
  const r = d.benim ? 7 : 5;
  const ilk = d.oturumlar[0];
  const etiket = `${ilk.kisa_kod} · ${d.oturumlar.length} oturum · ${d.oturumlar.map((o) => `${gunKisa(o.tarih)} ${o.konu || o.tur}`).join("; ")}`;
  return (
    <g role="button" tabIndex={0} aria-label={etiket} onClick={onClick} className="cursor-pointer outline-none"
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      opacity={gecmis && !d.benim ? 0.55 : 1}>
      <title>{etiket}</title>
      <circle cx={x} cy={y} r={15} fill="transparent" />
      {secili && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={MUREKKEP} strokeWidth={1.5} strokeDasharray="3 2" />}
      {d.cakisma && <circle cx={x} cy={y} r={r + 3.5} fill="none" stroke={MERCAN} strokeWidth={2.5} />}
      {d.iptal
        ? <circle cx={x} cy={y} r={r} fill="#FFFFFF" stroke={PASIF} strokeWidth={2} strokeDasharray="2.5 2" />
        : d.benim
          ? <circle cx={x} cy={y} r={r - 1.5} fill={MUREKKEP} stroke={renk} strokeWidth={3} />
          : <circle cx={x} cy={y} r={r - 1.25} fill="#FFFFFF" stroke={renk} strokeWidth={2.5} />}
    </g>
  );
}

/* ---------- mobil: dikey ---------- */

type Satir = { metin: string; tur: "ben" | "not" | "cakisma" | "iptal"; o?: Oturum };

function haftaSatirlari(h: HaritaT, i: number, vurgu: (o: Oturum) => boolean, vurguVar: boolean): Satir[] {
  const haftanin = h.duraklar.filter((d) => d.hafta === i).flatMap((d) => d.oturumlar);
  const out: Satir[] = [];
  if (vurguVar) {
    const benim = haftanin.filter(vurgu).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.baslangic ?? "").localeCompare(b.baslangic ?? ""));
    const cak = h.cakisanlar;
    for (const o of benim.slice(0, 4)) {
      const iptal = o.durum === "iptal";
      out.push({
        metin: `${gunKisa(o.tarih)} · ${o.kisa_kod} · ${o.konu || o.tur}${iptal ? " · iptal" : cak.has(o.id) ? " · çakışma" : ""}`,
        tur: iptal ? "iptal" : cak.has(o.id) ? "cakisma" : "ben", o,
      });
    }
    if (benim.length > 4) out.push({ metin: `+${benim.length - 4} oturum daha`, tur: "not" });
  } else if (haftanin.length) {
    const sayim = new Map<string, number>();
    for (const o of haftanin) if (o.durum === "planli") sayim.set(o.kisa_kod, (sayim.get(o.kisa_kod) ?? 0) + 1);
    if (sayim.size) out.push({ metin: [...sayim].map(([k, n]) => `${k} ${n}`).join(" · ") + " oturum", tur: "not" });
  }
  for (const n of h.notlar.filter((n) => n.hafta === i).slice(0, 2)) out.push({ metin: n.metin, tur: "not" });
  return out;
}

const SATIR_STIL: Record<Satir["tur"], string> = {
  ben: "text-[12px] font-semibold text-murekkep",
  cakisma: "text-[12px] font-bold text-mercan-koyu",
  iptal: "text-[12px] font-semibold text-silik line-through",
  not: "text-[11px] text-silik",
};

function DikeyHarita({ h, vurgu, vurguVar, onDurak }: { h: HaritaT; vurgu: (o: Oturum) => boolean; vurguVar: boolean; onDurak: (d: Durak) => void }) {
  const { sec } = useBaglam();
  const bugunRef = useRef<HTMLDivElement>(null);
  const n = h.hatlar.length;
  const ara = n <= 3 ? 26 : n <= 5 ? 21 : 17;
  const solBos = 20;
  const rayGen = solBos * 2 + (n - 1) * ara;
  const xOf = new Map(h.hatlar.map((x, i) => [x.id, solBos + i * ara]));

  const satirlar = h.haftalar.map((_, i) => haftaSatirlari(h, i, vurgu, vurguVar));
  const yukseklik = satirlar.map((s) => Math.max(64, 26 + s.length * 18));
  const ust: number[] = [];
  yukseklik.reduce((t, y, i) => ((ust[i] = t), t + y), 0);
  const toplam = ust[ust.length - 1] + yukseklik[yukseklik.length - 1];
  const merkez = (i: number) => ust[i] + yukseklik[i] / 2;
  const bugunY = h.bugunHafta < 0 ? 0 : h.bugunHafta >= h.haftalar.length ? toplam : merkez(h.bugunHafta);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 1023px)").matches || !bugunRef.current) return;
    const y = bugunRef.current.getBoundingClientRect().top + window.scrollY - 160;
    window.scrollTo({ top: Math.max(0, y) });
  }, []);

  const bugun = bugunTR();
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-white" style={{ height: toplam }}>
      {h.haftalar.map((_, i) => (
        <div key={i} ref={i === h.bugunHafta ? bugunRef : undefined}
          className={`absolute inset-x-0 ${i === h.bugunHafta ? "bg-mercan-acik" : ""}`} style={{ top: ust[i], height: yukseklik[i] }} />
      ))}
      <svg className="absolute left-0 top-0" width={rayGen} height={toplam} aria-hidden={false} role="group" aria-label="Program haritası">
        {h.hatlar.map((x) => {
          const cx = xOf.get(x.id)!, y1 = merkez(x.ilk), y2 = merkez(x.son);
          const kes = Math.min(Math.max(bugunY, y1), y2);
          return (
            <g key={x.id}>
              <rect x={cx - 3} y={y1} width={6} height={Math.max(0, y2 - y1)} rx={3} fill={x.renk} opacity={0.35} />
              {y2 > kes && <rect x={cx - 3} y={kes} width={6} height={y2 - kes} rx={3} fill={x.renk} />}
              <rect x={cx - 9} y={y2 - 3} width={18} height={6} rx={3} fill={x.renk} opacity={x.son < h.bugunHafta ? 0.35 : 1} />
            </g>
          );
        })}
        {h.aktarmalar.map((a) => {
          const xs = a.hatlar.map((id) => xOf.get(id)!).filter((v) => v !== undefined);
          const x1 = Math.min(...xs) - 11, x2 = Math.max(...xs) + 11, y = merkez(a.hafta);
          return <rect key={`${a.hafta}-${a.hatlar.join()}`} x={x1} y={y - 11} width={x2 - x1} height={22} rx={11} fill="#FFFFFF" stroke={MUREKKEP} strokeWidth={2.5} />;
        })}
        {h.aktarmalar.map((a) => {
          const xs = a.hatlar.map((id) => xOf.get(id)!);
          const x1 = Math.min(...xs) - 14.5, x2 = Math.max(...xs) + 14.5, y = merkez(a.hafta);
          return <rect key={`d-${a.hafta}-${a.hatlar.join()}`} x={x1} y={y - 14.5} width={x2 - x1} height={29} rx={14.5} fill="none" stroke={MERCAN} strokeWidth={3} />;
        })}
        {h.duraklar.map((d) => {
          const hat = h.hatlar.find((x) => x.id === d.hatId)!;
          return <DurakNoktasi key={durakAnahtari(d.hatId, d.hafta)} d={d} renk={hat.renk} x={xOf.get(d.hatId)!} y={merkez(d.hafta)}
            gecmis={d.hafta < h.bugunHafta} onClick={() => onDurak(d)} />;
        })}
      </svg>
      {h.haftalar.map((bas, i) => (
        <div key={bas} className="absolute right-3 flex flex-col justify-center gap-[3px] border-b border-cizgi"
          style={{ top: ust[i], height: yukseklik[i], left: rayGen + 8 }}>
          <span className="flex items-center justify-between gap-2">
            <span className={`text-[11px] font-bold tracking-wide ${i < h.bugunHafta ? "text-[#B8ABA4]" : "text-silik"}`}>{haftaUst(bas)}</span>
            {i === h.bugunHafta && (
              <span className="shrink-0 rounded-full bg-mercan-zemin px-2 py-[3px] text-[10px] font-bold tracking-wide text-mercan-koyu">
                BURADASIN · {tarihParca(bugun).gun} {AY_UST[tarihParca(bugun).ay].slice(0, 3)}
              </span>
            )}
          </span>
          {satirlar[i].map((s, j) => s.o
            ? <button key={j} onClick={() => sec(s.o!)} className={`truncate text-left leading-[1.3] ${SATIR_STIL[s.tur]}`}>{s.metin}</button>
            : <span key={j} className={`truncate leading-[1.3] ${SATIR_STIL[s.tur]}`}>{s.metin}</span>)}
        </div>
      ))}
    </div>
  );
}

/* ---------- geniş ekran: yatay ---------- */

const HAFTA_PX = 64, SATIR_PX = 96, UST_PX = 48, SOL_PX = 156;

function YatayHarita({ h, vurguVar, secili, onDurak }: { h: HaritaT; vurguVar: boolean; secili?: Durak; onDurak: (d: Durak) => void }) {
  const kaydir = useRef<HTMLDivElement>(null);
  const gen = h.haftalar.length * HAFTA_PX + 24;
  const yuk = UST_PX + h.hatlar.length * SATIR_PX + 28; // altta BUGÜN etiketi için yer
  const xOf = (i: number) => i * HAFTA_PX + HAFTA_PX / 2 + 12;
  const yOf = new Map(h.hatlar.map((x, i) => [x.id, UST_PX + i * SATIR_PX + SATIR_PX / 2]));
  const bugun = bugunTR();
  const gunFarki = (Date.parse(`${bugun}T12:00:00Z`) - Date.parse(`${h.haftalar[0]}T12:00:00Z`)) / 864e5;
  const bugunX = 12 + (gunFarki + 0.5) * (HAFTA_PX / 7);
  const bugunIcinde = gunFarki >= 0 && gunFarki < h.haftalar.length * 7;

  useEffect(() => {
    const el = kaydir.current;
    if (el && bugunIcinde) el.scrollLeft = Math.max(0, bugunX - HAFTA_PX * 3);
  }, [bugunX, bugunIcinde]);

  return (
    <div className="flex overflow-hidden rounded-[24px] bg-white">
      <div className="shrink-0 border-r border-cizgi" style={{ width: SOL_PX, paddingTop: UST_PX }}>
        {h.hatlar.map((x) => (
          <div key={x.id} className="flex flex-col justify-center gap-1 px-4" style={{ height: SATIR_PX }}>
            <span className="flex items-center gap-2 text-[13px] font-bold">
              <span className="h-[5px] w-4 shrink-0 rounded-[3px]" style={{ background: x.renk }} />{x.kod}
            </span>
            <span className="text-[11px] leading-tight text-soluk">{x.ad}</span>
          </div>
        ))}
      </div>
      <div ref={kaydir} className="min-w-0 flex-1 overflow-x-auto">
        <svg width={gen} height={yuk} role="group" aria-label="Program haritası" className="block">
          {h.haftalar.map((bas, i) => {
            const p = tarihParca(bas);
            const yeniAy = i === 0 || tarihParca(h.haftalar[i - 1]).ay !== p.ay;
            return (
              <g key={bas}>
                {yeniAy && <text x={xOf(i) - HAFTA_PX / 2 + 4} y={18} fontSize={11} fontWeight={700} letterSpacing="0.06em" fill="#6B5C57">{AY_UST[p.ay]}</text>}
                <text x={xOf(i)} y={36} fontSize={10} textAnchor="middle" fill="#8F807A">{p.gun}</text>
                {yeniAy && i > 0 && <line x1={xOf(i) - HAFTA_PX / 2} x2={xOf(i) - HAFTA_PX / 2} y1={UST_PX - 6} y2={yuk} stroke="#EFE8E2" />}
              </g>
            );
          })}
          {h.hatlar.map((x) => {
            const y = yOf.get(x.id)!, x1 = xOf(x.ilk), x2 = xOf(x.son);
            const kes = Math.min(Math.max(bugunX, x1), x2);
            return (
              <g key={x.id}>
                <rect x={x1} y={y - 3} width={Math.max(0, x2 - x1)} height={6} rx={3} fill={x.renk} opacity={0.35} />
                {x2 > kes && <rect x={kes} y={y - 3} width={x2 - kes} height={6} rx={3} fill={x.renk} />}
                <rect x={x2 - 3} y={y - 9} width={6} height={18} rx={3} fill={x.renk} opacity={x2 < bugunX ? 0.35 : 1} />
              </g>
            );
          })}
          {bugunIcinde && (
            <g>
              <line x1={bugunX} x2={bugunX} y1={UST_PX - 6} y2={yuk - 24} stroke={MERCAN_KOYU} strokeWidth={1.5} strokeDasharray="4 4" />
              <rect x={bugunX - 26} y={yuk - 24} width={52} height={18} rx={9} fill="#F9C9CD" />
              <text x={bugunX} y={yuk - 11.5} fontSize={10} fontWeight={700} textAnchor="middle" fill={MERCAN_KOYU}>BUGÜN</text>
            </g>
          )}
          {h.aktarmalar.map((a) => {
            const ys = a.hatlar.map((id) => yOf.get(id)!);
            const y1 = Math.min(...ys), y2 = Math.max(...ys), x = xOf(a.hafta);
            return (
              <g key={`${a.hafta}-${a.hatlar.join()}`}>
                <rect x={x - 14.5} y={y1 - 14.5} width={29} height={y2 - y1 + 29} rx={14.5} fill="none" stroke={MERCAN} strokeWidth={3} />
                <rect x={x - 11} y={y1 - 11} width={22} height={y2 - y1 + 22} rx={11} fill="#FFFFFF" stroke={MUREKKEP} strokeWidth={2.5} />
                <text x={x + 18} y={(y1 + y2) / 2 + 4} fontSize={11} fontWeight={700} fill={MERCAN_KOYU}>Aktarma · çakışma</text>
              </g>
            );
          })}
          {h.duraklar.map((d) => {
            const hat = h.hatlar.find((x) => x.id === d.hatId)!;
            const x = xOf(d.hafta), y = yOf.get(d.hatId)!;
            const benimTarih = vurguVar && d.benim ? d.oturumlar.find((o) => h.cakisanlar.has(o.id))?.tarih ?? d.oturumlar[0].tarih : null;
            const aktarmada = h.aktarmalar.some((a) => a.hafta === d.hafta && a.hatlar.includes(d.hatId));
            return (
              <g key={durakAnahtari(d.hatId, d.hafta)}>
                <DurakNoktasi d={d} renk={hat.renk} x={x} y={y} gecmis={x < bugunX}
                  secili={!!secili && secili.hatId === d.hatId && secili.hafta === d.hafta} onClick={() => onDurak(d)} />
                {benimTarih && (
                  <text x={aktarmada ? x - 18 : x} y={aktarmada ? y + 4 : y + 24} fontSize={10} fontWeight={700} textAnchor={aktarmada ? "end" : "middle"} fill={x < bugunX ? "#B8ABA4" : MUREKKEP} pointerEvents="none">
                    {tarihParca(benimTarih).gun} {AY_KISA[tarihParca(benimTarih).ay]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ---------- durak paneli ---------- */

function DurakIcerik({ d, h }: { d: Durak; h: HaritaT }) {
  const { sec, tz, saatModu } = useBaglam();
  const hat = h.hatlar.find((x) => x.id === d.hatId)!;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-soluk">
          <span className="h-[5px] w-4 rounded-[3px]" style={{ background: hat.renk }} />{hat.ad}
        </span>
        <span className="font-baslik text-lg font-bold tracking-tight">{haftaUst(h.haftalar[d.hafta])}</span>
        {d.cakisma && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-mercan-koyu"><Ikon ad="uyari" boyut={14} /> Bu hafta çakışan oturumun var</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {d.oturumlar.map((o) => {
          const g = gosterim(o, tz, saatModu);
          const iptal = o.durum === "iptal";
          return (
            <button key={o.id} onClick={() => sec(o)}
              className="flex flex-col gap-0.5 rounded-2xl border-l-4 bg-zemin px-3 py-2.5 text-left" style={{ borderColor: hat.renk }}>
              <span className="flex items-center gap-2 text-xs font-semibold text-soluk">
                {gunKisa(o.tarih)} · {g.ana ? `${g.ana} ${g.birim}` : "Saat belirsiz"}
                {iptal && <Rozet tur="iptal">İptal</Rozet>}
              </span>
              <span className={`text-sm font-semibold leading-snug ${iptal ? "text-silik line-through" : ""}`}>{o.konu || o.tur}</span>
              <span className="truncate text-xs text-soluk">{o.tur} · {o.anlaticilar.map((a) => a.ad).join(", ") || "Eğitmen atanmamış"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DurakKarti({ d, h }: { d: Durak; h: HaritaT }) {
  return (
    <div className="rounded-[24px] bg-white p-4">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-silik">Seçili durak</span>
      <DurakIcerik d={d} h={h} />
    </div>
  );
}

function AltPanel({ d, h, onKapat }: { d: Durak; h: HaritaT; onKapat: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onKapat();
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [onKapat]);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-murekkep/30" onClick={onKapat}>
      <div role="dialog" aria-modal="true" aria-label="Durak" onClick={(e) => e.stopPropagation()}
        className="max-h-[70vh] w-full overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-cizgi" />
        <div className="flex items-start justify-between gap-3">
          <DurakIcerik d={d} h={h} />
          <button aria-label="Kapat" onClick={onKapat} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zemin">
            <Ikon ad="kapat" boyut={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Siradakiler({ h, vurgu, vurguVar, onSec }: { h: HaritaT; vurgu: (o: Oturum) => boolean; vurguVar: boolean; onSec: (k: string) => void }) {
  const simdi = Date.now();
  const liste = h.duraklar
    .flatMap((d) => d.oturumlar.map((o) => ({ o, d })))
    .filter(({ o }) => o.durum === "planli" && (!vurguVar || vurgu(o)) && Date.parse(o.bitis ?? `${o.tarih}T23:59:00+03:00`) > simdi)
    .sort((a, b) => a.o.tarih.localeCompare(b.o.tarih) || (a.o.baslangic ?? "").localeCompare(b.o.baslangic ?? ""))
    .slice(0, 5);
  if (!liste.length) return null;
  return (
    <div className="rounded-[24px] bg-white p-4">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-silik">{vurguVar ? "Senin sıradaki durakların" : "Sıradaki duraklar"}</span>
      <div className="flex flex-col">
        {liste.map(({ o, d }) => (
          <button key={o.id} onClick={() => onSec(durakAnahtari(d.hatId, d.hafta))}
            className="flex items-center gap-3 border-b border-cizgi py-2.5 text-left last:border-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.renk }} />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-semibold text-soluk">{gunKisa(o.tarih)} · {o.kisa_kod}</span>
              <span className="truncate text-[13px] font-semibold">{o.konu || o.tur}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
