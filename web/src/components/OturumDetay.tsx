import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { DEMO } from "../lib/api";
import { gosterim, useBaglam } from "../lib/baglam";
import { kalan, sureSaatMetni, TATILLER, yaziRengi, guvenliLink } from "../lib/derive";
import { gunBasligi } from "../lib/time";
import type { Oturum } from "../lib/types";
import { DetayFormu, YanSeansFormu } from "./SeansFormu";
import { Ikon, Rozet } from "./ui";

const ROL: Record<string, string> = { ana: "", yardimci: "yardımcı", konuk: "konuk" };

/** Oturum detayı: mobilde tam ekran sayfa, geniş ekranda sağdan açılan panel. */
export function OturumDetay({ o, onKapat }: { o: Oturum; onKapat: () => void }) {
  const { tz, saatModu, anaEgitmenMi, cakisanlar, ben } = useBaglam();
  const [iptalAcik, setIptalAcik] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const g = gosterim(o, tz, saatModu);
  const iptal = o.durum === "iptal";
  const yonetebilir = anaEgitmenMi(o.bootcamp_id);
  const yazi = yaziRengi(o.renk);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && !iptalAcik && onKapat();
    document.addEventListener("keydown", f);
    ref.current?.focus();
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", f);
      document.body.style.overflow = eski;
    };
  }, [onKapat, iptalAcik]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-murekkep/40" onClick={onKapat}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={o.konu || o.tur} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="h-full w-full overflow-y-auto bg-zemin outline-none lg:max-w-md lg:shadow-2xl">
        <div className="flex flex-col gap-4 rounded-b-[32px] px-5 pb-6 pt-4" style={{ background: o.renk, color: yazi }}>
          <div className="flex items-center justify-between">
            <button onClick={onKapat} aria-label="Kapat" className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/50">
              <Ikon ad="sol" boyut={20} />
            </button>
            {yonetebilir && <span className="rounded-full bg-mercan-zemin px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-mercan-koyu">Ana eğitmen</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/50 px-2.5 py-1 text-xs font-semibold">{o.bootcamp_ad}</span>
            <span className="rounded-full bg-white/50 px-2.5 py-1 text-xs font-semibold">{o.tur}</span>
            {o.kaynak === "uygulama" && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-yesil">Uygulamadan eklendi</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className={`font-baslik text-[28px] font-bold leading-[1.05] tracking-tight ${iptal ? "line-through opacity-70" : ""}`}>{o.konu || o.tur}</h2>
            <span className={`font-baslik text-[38px] font-bold leading-tight tracking-tighter tabular-nums ${iptal ? "line-through opacity-70" : ""}`}>
              {g.ana ?? "Saat belirsiz"}
            </span>
            <span className="text-sm font-medium opacity-80">
              {gunBasligi(o.tarih)}{g.ana ? ` · ${g.birim} saati · ${sureSaatMetni(o)}` : ""}{!iptal ? ` · ${kalan(o)}` : ""}
            </span>
            {g.ikincil && <span className="text-sm font-semibold opacity-90">{g.ikincil}</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3 px-3 py-4">
          {iptal && (
            <div className="rounded-kart bg-mercan-acik p-4 text-sm text-mercan-koyu">
              <strong className="font-semibold">Bu oturum iptal edildi.</strong>
              {o.iptal_gerekcesi && <span className="mt-1 block">{o.iptal_gerekcesi}</span>}
            </div>
          )}
          {!iptal && cakisanlar.has(o.id) && (
            <div className="flex items-center gap-2 rounded-kart bg-mercan-acik p-3.5 text-[13px] font-semibold text-mercan-koyu">
              <Ikon ad="uyari" boyut={18} /> Aynı saatte başka bir oturumun da var.
            </div>
          )}
          {TATILLER[o.tarih] && (
            <div className="rounded-kart bg-mavi p-3.5 text-[13px] font-semibold text-mavi-koyu">Bu tarih resmi tatil: {TATILLER[o.tarih]}</div>
          )}

          <div className="divide-y divide-cizgi rounded-kart bg-white px-4">
            <Satir etiket="Anlatıcılar">
              {o.anlaticilar.length ? (
                <ul className="flex flex-col gap-1">
                  {o.anlaticilar.map((a, i) => (
                    <li key={i}>
                      {a.kisi_id && a.kisi_id === ben?.id ? "Sen" : a.ad}
                      {ROL[a.rol] && <span className="ml-1 text-xs text-soluk">({ROL[a.rol]})</span>}
                    </li>
                  ))}
                </ul>
              ) : <Rozet tur="cakisma">Atanmamış</Rozet>}
            </Satir>
            {o.toplanti_linki && (
              <Satir etiket="Toplantı">
                <a href={guvenliLink(o.toplanti_linki) ?? undefined} target="_blank" rel="noreferrer" className="break-all font-semibold underline">{o.toplanti_linki.replace(/^https?:\/\//, "")}</a>
              </Satir>
            )}
            {o.materyal_linki && (
              <Satir etiket="Materyal">
                <a href={guvenliLink(o.materyal_linki) ?? undefined} target="_blank" rel="noreferrer" className="font-semibold underline">Materyali aç</a>
              </Satir>
            )}
            {o.aciklama && <Satir etiket="Açıklama"><span className="whitespace-pre-line">{o.aciklama}</span></Satir>}
            {o.notlar && <Satir etiket="Not"><span className="whitespace-pre-line">{o.notlar}</span></Satir>}
          </div>

          {o.toplanti_linki && !iptal && (
            <a href={guvenliLink(o.toplanti_linki) ?? undefined} target="_blank" rel="noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-yesil text-sm font-bold text-white">
              <Ikon ad="video" boyut={18} /> Toplantıya katıl
            </a>
          )}

          {yonetebilir && <Yonetim o={o} iptalAc={() => setIptalAcik(true)} />}
        </div>
      </div>
      {iptalAcik && <IptalPenceresi o={o} onKapat={() => setIptalAcik(false)} />}
    </div>
  );
}

function Satir({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-3 text-sm">
      <span className="text-soluk">{etiket}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Yonetim({ o, iptalAc }: { o: Oturum; iptalAc: () => void }) {
  const { api, sec } = useBaglam();
  const qc = useQueryClient();
  const [form, setForm] = useState<"duzenle" | "yeni" | null>(null);
  const iptal = o.durum === "iptal";
  const yanSeans = o.kaynak === "uygulama";

  async function geriAl() {
    await api.iptalGeriAl(o.id);
    await Promise.all([qc.invalidateQueries({ queryKey: ["oturumlar"] }), qc.invalidateQueries({ queryKey: ["degisiklikler"] })]);
  }

  return (
    <section className="flex flex-col gap-3 rounded-kart bg-yesil p-4 text-white">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-baslik text-base font-bold">Bu oturumu yönet</h3>
        <span className="text-xs text-yesil-soluk">Sadece ana eğitmen görür</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setForm("duzenle")} className="h-11 rounded-[14px] bg-white text-sm font-bold text-yesil">Düzenle</button>
        <button onClick={() => setForm("yeni")} className="flex h-11 items-center justify-center gap-1.5 rounded-[14px] border border-yesil-cizgi text-sm font-semibold">
          <Ikon ad="arti" boyut={16} /> Yan seans ekle
        </button>
      </div>
      {iptal ? (
        <button onClick={geriAl} className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-yesil-cizgi text-sm font-semibold">
          <Ikon ad="geriAl" boyut={18} /> İptali geri al
        </button>
      ) : (
        <button onClick={iptalAc} className="h-11 rounded-[14px] border border-mercan text-sm font-bold text-mercan-zemin">Oturumu iptal et</button>
      )}
      <span className="text-xs text-yesil-soluk">
        {DEMO ? "Demoda yaptığın değişiklikler yalnızca bu tarayıcıda görünür." : "Değişiklikler anlatıcılara e-postayla bildirilir ve takvimlerine yansır."}
      </span>
      {form === "duzenle" && (yanSeans
        ? <YanSeansFormu o={o} onKapat={() => setForm(null)} />
        : <DetayFormu o={o} onKapat={() => setForm(null)} />)}
      {form === "yeni" && (
        <YanSeansFormu bootcampId={o.bootcamp_id} onKapat={() => setForm(null)}
          onKaydedildi={(id) => setTimeout(() => { const y = qc.getQueryData<Oturum[]>(["oturumlar"])?.find((x) => x.id === id); if (y) sec(y); }, 50)} />
      )}
    </section>
  );
}

function IptalPenceresi({ o, onKapat }: { o: Oturum; onKapat: () => void }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [gerekce, setGerekce] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function onayla(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata(null);
    try {
      await api.iptal(o.id, gerekce.trim());
      await Promise.all([qc.invalidateQueries({ queryKey: ["oturumlar"] }), qc.invalidateQueries({ queryKey: ["degisiklikler"] })]);
      onKapat();
    } catch (err) {
      setHata(err instanceof Error ? err.message : "İptal edilemedi.");
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-murekkep/50 sm:items-center sm:p-4" onClick={(e) => { e.stopPropagation(); onKapat(); }}>
      <form onSubmit={onayla} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Oturumu iptal et"
        className="flex w-full flex-col gap-3 rounded-t-[28px] bg-white p-5 text-murekkep pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px]">
        <h3 className="font-baslik text-xl font-bold">Oturumu iptal et</h3>
        <p className="text-sm text-soluk">{o.kisa_kod} · {o.konu} · {gunBasligi(o.tarih)}</p>
        <label htmlFor="gerekce" className="text-sm font-semibold">Gerekçe</label>
        <textarea id="gerekce" required autoFocus rows={3} value={gerekce} onChange={(e) => setGerekce(e.target.value)}
          placeholder="Örn. eğitmen rahatsız; telafi tarihi duyurulacak"
          className="rounded-xl border border-[#D9CDC6] px-3 py-2 text-sm outline-none focus:border-yesil focus:ring-2 focus:ring-yesil/20" />
        <p className="text-xs text-soluk">Anlatıcılara e-posta gider, oturum takvimlerinden düşer. İstersen sonra geri alabilirsin.</p>
        {hata && <p role="alert" className="text-sm text-mercan-yazi">{hata}</p>}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button type="button" onClick={onKapat} className="h-11 rounded-[14px] border border-[#D9CDC6] text-sm font-semibold">Vazgeç</button>
          <button type="submit" disabled={bekliyor || !gerekce.trim()} className="h-11 rounded-[14px] bg-mercan-koyu text-sm font-bold text-white disabled:opacity-50">
            {bekliyor ? "Bekleyin…" : "İptal et"}
          </button>
        </div>
      </form>
    </div>
  );
}
