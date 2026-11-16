// Ortak pencere (MM-07): odak içeride kalır, Esc yalnızca en üstteki pencereyi kapatır, kaydedilmemiş değişiklik
// varsa kapatmadan önce sorar, kapanınca odak pencereyi açan öğeye döner. Arka plana tıklamak da aynı kuralla kapatır.

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

const yigin: string[] = [];
const ODAKLANABILIR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Ozellikler = {
  etiket: string;
  onKapat: () => void;
  /** Kaydedilmemiş değişiklik var mı: varsa kapatmadan önce onay istenir. */
  kirli?: boolean;
  /** Arka plan katmanının sınıfları (konum ve hizalama). */
  dis: string;
  /** Pencerenin kendi sınıfları. */
  className: string;
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
};

export function Pencere({ etiket, onKapat, kirli = false, dis, className, onSubmit, children }: Ozellikler) {
  const id = useId();
  const ref = useRef<HTMLElement | null>(null);
  const [soruyor, setSoruyor] = useState(false);
  const kirliRef = useRef(kirli);
  kirliRef.current = kirli;
  const kapatRef = useRef(onKapat);
  kapatRef.current = onKapat;
  // Açan öğe ilk render'da yakalanır: autoFocus'lu bir alan odağı efektten önce alır.
  const [oncekiOdak] = useState(() => document.activeElement as HTMLElement | null);

  const kapatIste = useCallback(() => {
    if (kirliRef.current) setSoruyor(true);
    else kapatRef.current();
  }, []);

  useEffect(() => {
    yigin.push(id);
    const eskiTasma = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      const i = yigin.lastIndexOf(id);
      if (i >= 0) yigin.splice(i, 1);
      if (!yigin.length) document.body.style.overflow = eskiTasma;
      if (oncekiOdak?.isConnected) oncekiOdak.focus();
    };
  }, [id, oncekiOdak]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (yigin[yigin.length - 1] !== id) return; // yalnızca en üstteki pencere
      if (e.key === "Escape") {
        e.preventDefault();
        if (soruyor) setSoruyor(false);
        else kapatIste();
      } else if (e.key === "Tab" && ref.current) {
        const ogeler = [...ref.current.querySelectorAll<HTMLElement>(ODAKLANABILIR)].filter((x) => x.offsetParent !== null);
        if (!ogeler.length) return;
        const ilk = ogeler[0], son = ogeler[ogeler.length - 1];
        if (e.shiftKey && (document.activeElement === ilk || document.activeElement === ref.current)) { e.preventDefault(); son.focus(); }
        else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
      }
    };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [id, kapatIste, soruyor]);

  const ic = (
    <>
      {children}
      {soruyor && (
        <div role="alertdialog" aria-label="Değişiklikler kaydedilmedi"
          className="absolute inset-0 z-10 flex items-center justify-center bg-murekkep/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-[24px] bg-white p-5 text-murekkep">
            <h3 className="font-baslik text-lg font-bold">Değişiklikler kaydedilmedi</h3>
            <p className="text-sm text-soluk">Kapatırsan yazdıkların kaybolur.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" autoFocus onClick={() => setSoruyor(false)} className="h-11 rounded-[14px] border border-cizgi text-sm font-semibold">Düzenlemeye dön</button>
              <button type="button" onClick={() => kapatRef.current()} className="h-11 rounded-[14px] bg-mercan-koyu text-sm font-bold text-white">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  const ortak = {
    role: "dialog", "aria-modal": true, "aria-label": etiket, tabIndex: -1,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    className: `relative outline-none ${className}`,
  } as const;
  return (
    <div className={dis} onClick={(e) => { e.stopPropagation(); kapatIste(); }}>
      {onSubmit
        ? <form ref={(x) => { ref.current = x; }} onSubmit={onSubmit} {...ortak}>{ic}</form>
        : <div ref={(x) => { ref.current = x; }} {...ortak}>{ic}</div>}
    </div>
  );
}

/** Tarayıcının confirm() penceresi yerine (MM-48). */
export function Onay({ soru, aciklama, evet, tehlikeli = false, onEvet, onHayir }: {
  soru: string; aciklama?: string; evet: string; tehlikeli?: boolean; onEvet: () => void; onHayir: () => void;
}) {
  return (
    <Pencere etiket={soru} onKapat={onHayir} dis="fixed inset-0 z-[70] flex items-end justify-center bg-murekkep/50 sm:items-center sm:p-4"
      className="flex w-full flex-col gap-3 rounded-t-[28px] bg-white p-5 text-murekkep pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-[28px]">
      <h3 className="font-baslik text-lg font-bold">{soru}</h3>
      {aciklama && <p className="text-sm text-soluk">{aciklama}</p>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button type="button" autoFocus onClick={onHayir} className="h-11 rounded-[14px] border border-cizgi text-sm font-semibold">Vazgeç</button>
        <button type="button" onClick={onEvet}
          className={`h-11 rounded-[14px] text-sm font-bold text-white ${tehlikeli ? "bg-mercan-koyu" : "bg-yesil"}`}>{evet}</button>
      </div>
    </Pencere>
  );
}
