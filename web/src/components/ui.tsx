import { useId } from "react";
// Ortak arayüz parçaları: ikonlar, segment, başlık, etiketler.

import type { ReactNode } from "react";
import { yaziRengi } from "../lib/derive";

const YOLLAR: Record<string, ReactNode> = {
  ev: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  takvim: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  zil: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  kisi: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  video: <><path d="M15 10l5-3v10l-5-3" /><rect x="3" y="6" width="12" height="12" rx="2" /></>,
  sag: <path d="M9 18l6-6-6-6" />,
  sol: <path d="M15 18l-6-6 6-6" />,
  uyari: <><path d="M12 8v5M12 17h.01" /><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  saat: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arti: <path d="M12 5v14M5 12h14" />,
  kapat: <path d="M6 6l12 12M18 6L6 18" />,
  dosya: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  ok: <path d="M5 12h14M13 6l6 6-6 6" />,
  iptal: <><circle cx="12" cy="12" r="9" /><path d="M8 8l8 8" /></>,
  geriAl: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" /></>,
  abone: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M12 13v5M9.5 15.5h5" /></>,
  etkinlik: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  mesaj: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
};

export function Ikon({ ad, boyut = 20, className = "" }: { ad: keyof typeof YOLLAR | string; boyut?: number; className?: string }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      {YOLLAR[ad]}
    </svg>
  );
}

/** Uygulama işareti (M³ harita karesi): mercan M hattı karenin kenarından taşar, krem hatla kesiştiği yerde aktarma durağı, üs olarak 3. */
export function Isaret({ boyut = 28, className = "" }: { boyut?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 100 100" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs><clipPath id={id}><rect width="100" height="100" rx="22" /></clipPath></defs>
      <rect width="100" height="100" rx="22" fill="#0B3B2C" />
      <g clipPath={`url(#${id})`}>
        <path d="M-4 77H104" stroke="#F7F3EF" strokeWidth="7" />
        <path d="M24 110V38L44 58L64 38V110" fill="none" stroke="#F08891" strokeWidth="11" strokeLinejoin="round" />
        <rect x="55.5" y="70" width="17" height="14" rx="7" fill="#fff" stroke="#0B3B2C" strokeWidth="3" />
        <path d="M75 25.5H87L80.5 33.5Q88.5 33.5 88.5 41Q88.5 49 80.5 49Q76 49 73.5 46" fill="none" stroke="#F7F3EF"
          strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function Logo({ ters = false, className = "" }: { ters?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Isaret boyut={30} className={ters ? "ring-1 ring-yesil-cizgi rounded-[7px]" : ""} />
      <span className={`font-baslik text-lg font-bold tracking-tight ${ters ? "text-white" : "text-murekkep"}`}>mentor map</span>
    </span>
  );
}

/** Miuul A-Lab imzası. Logo dosyası gelene kadar yazı olarak durur. */
export function ALab({ ters = false, className = "" }: { ters?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide ${ters ? "text-yesil-soluk" : "text-silik"} ${className}`}>
      bir <span className="font-bold">Miuul A-Lab</span> ürünü
    </span>
  );
}

export function Segment<T extends string>({ deger, onDegis, secenekler, etiket, kucuk = false }: {
  deger: T; onDegis: (v: T) => void; secenekler: [T, string][]; etiket: string; kucuk?: boolean;
}) {
  return (
    <div role="group" aria-label={etiket} className="inline-flex gap-0.5 rounded-full bg-ray p-1">
      {secenekler.map(([v, metin]) => (
        <button key={v} aria-pressed={deger === v} onClick={() => onDegis(v)}
          className={`rounded-full font-semibold transition ${kucuk ? "h-8 px-3 text-xs" : "h-9 px-4 text-[13px]"} ${
            deger === v ? "bg-yesil text-white" : "text-[#4A3A36] hover:text-murekkep"}`}>
          {metin}
        </button>
      ))}
    </div>
  );
}

export function Baslik({ children, sag }: { children: ReactNode; sag?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 font-baslik text-[19px] font-bold tracking-tight">{children}</h2>
      {sag}
    </div>
  );
}

export function Sayac({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-mercan-zemin px-1.5 font-sans text-xs font-bold text-mercan-koyu">
      {n}
    </span>
  );
}

export function BootcampEtiketi({ kod, renk }: { kod: string; renk: string }) {
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: renk, color: yaziRengi(renk) }}>
      {kod}
    </span>
  );
}

const ROZET: Record<string, string> = {
  yeni: "bg-nane text-nane-koyu",
  cakisma: "bg-mercan-zemin text-mercan-koyu",
  iptal: "bg-mercan-zemin text-mercan-koyu",
  saat: "bg-mavi text-mavi-koyu",
  gri: "bg-cizgi text-[#4A3A36]",
};

export function Rozet({ tur, children }: { tur: keyof typeof ROZET; children: ReactNode }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${ROZET[tur]}`}>{children}</span>;
}

export function Kart({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-kart bg-white ${className}`}>{children}</div>;
}

export function Bos({ children }: { children: ReactNode }) {
  return <div className="rounded-kart border border-dashed border-[#D9CDC6] p-6 text-center text-sm text-soluk">{children}</div>;
}
