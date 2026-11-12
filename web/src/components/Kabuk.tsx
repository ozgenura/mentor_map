// Uygulama iskeleti: mobilde başparmak hizasında alt menü, geniş ekranda koyu yeşil yan menü.

import type { ReactNode } from "react";
import { DEMO } from "../lib/api";
import { useBaglam, type Sekme } from "../lib/baglam";
import { GeriBildirimDugmesi } from "./GeriBildirim";
import { ALab, Ikon, Logo } from "./ui";

const SEKMELER: { id: Sekme; ad: string; ikon: string }[] = [
  { id: "bugun", ad: "Bugün", ikon: "ev" },
  { id: "takvim", ad: "Takvim", ikon: "takvim" },
  { id: "etkinlikler", ad: "Etkinlikler", ikon: "etkinlik" },
  { id: "degisenler", ad: "Değişenler", ikon: "zil" },
  { id: "profil", ad: "Profil", ikon: "kisi" },
];

function basHarfler(ad: string) {
  return ad.split(" ").map((p) => p[0]).slice(0, 2).join("");
}

export function Kabuk({ sekme, children }: { sekme: Sekme; children: ReactNode }) {
  const { git, yeniDegisiklik, ben, tz, bakis } = useBaglam();
  return (
    <div className="min-h-dvh bg-zemin text-murekkep lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col gap-7 bg-yesil px-4 py-6 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="flex items-center gap-2 px-2">
          <Logo ters />
          {DEMO && <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Demo</span>}
        </div>
        <nav aria-label="Ana menü" className="flex flex-col gap-1">
          {SEKMELER.map((s) => (
            <button key={s.id} onClick={() => git(s.id)} aria-current={sekme === s.id ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                sekme === s.id ? "bg-white text-yesil" : "text-yesil-yazi hover:bg-yesil-acik"}`}>
              <Ikon ad={s.ikon} boyut={18} />
              {s.ad}
              {s.id === "degisenler" && yeniDegisiklik > 0 && (
                <span className="ml-auto inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-mercan-zemin px-1.5 text-xs font-bold text-mercan-koyu">
                  {yeniDegisiklik}
                </span>
              )}
            </button>
          ))}
        </nav>
        {ben && (
          <button onClick={() => git("profil")} className="mt-auto flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-yesil-acik">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-baslik text-[13px] font-bold text-yesil">
              {basHarfler(ben.ad)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{ben.ad}</span>
              <span className="truncate text-xs text-yesil-soluk">{tz.split("/").pop()?.replace(/_/g, " ")}</span>
            </span>
          </button>
        )}
        <GeriBildirimDugmesi sekme={sekme} ters className={`h-10 px-3 ${ben ? "-mt-5" : "mt-auto"}`} />
        <ALab ters className="px-2" />
      </aside>

      <div className="min-w-0 flex-1 pb-28 lg:pb-10">
        {bakis?.aktif && ben && (
          <div role="status" className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-mercan-zemin px-5 py-2.5 text-[13px] text-mercan-koyu lg:px-10">
            <span><span className="font-bold">{ben.ad}</span> olarak görüntülüyorsun. Yaptığın işlemler senin yetkinle kaydedilir.</span>
            <button onClick={() => bakis.sec(null)} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold">Kendine dön</button>
          </div>
        )}
        {children}
      </div>

      <nav aria-label="Ana menü"
        className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 grid h-16 grid-cols-5 items-center rounded-[22px] bg-yesil px-1.5 shadow-lg shadow-yesil/20 lg:hidden">
        {SEKMELER.map((s) => (
          <button key={s.id} onClick={() => git(s.id)} aria-current={sekme === s.id ? "page" : undefined}
            className={`relative mx-0.5 flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] transition ${
              sekme === s.id ? "bg-white font-bold text-yesil" : "font-semibold text-yesil-soluk"}`}>
            <Ikon ad={s.ikon} boyut={20} />
            {s.ad}
            {s.id === "degisenler" && yeniDegisiklik > 0 && (
              <span className="absolute left-[54%] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-yesil bg-mercan" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function SayfaUstu({ ust, baslik, sag }: { ust?: ReactNode; baslik: ReactNode; sag?: ReactNode }) {
  return (
    <header className="px-5 pt-5 lg:px-10 lg:pt-8">
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <Logo />
        {DEMO && <span className="rounded bg-mercan-acik px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mercan-koyu">Demo</span>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          {ust && <span className="text-[13px] font-medium text-soluk">{ust}</span>}
          <h1 className="font-baslik text-[30px] font-bold leading-[1.05] tracking-tight lg:text-[38px]">{baslik}</h1>
        </div>
        {sag}
      </div>
    </header>
  );
}
