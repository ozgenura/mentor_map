import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DEMO } from "../lib/api";
import { gosterim, useBaglam } from "../lib/baglam";
import { kalan, katilimZamani, sureSaatMetni, TATILLER, yaziRengi, guvenliLink } from "../lib/derive";
import { gunBasligi } from "../lib/time";
import type { Oturum } from "../lib/types";
import { OturumCakismalari } from "./Cakismalar";
import { DetayFormu, YanSeansFormu } from "./SeansFormu";
import { Pencere } from "./Pencere";
import { Ikon, Rozet } from "./ui";

const ROL: Record<string, string> = { ana: "", yardimci: "yardımcı", konuk: "konuk" };

/** Detaydaki rozet: düzenleme yetkisinin kaynağı (MM-42). Yalnızca admin ve PO düzenler. */
export function yetkiAdi(yonetici: boolean, yetkiler: string[]): string {
  return yonetici && !yetkiler.includes("po") ? "Admin" : "PO";
}

/** Oturum detayı: mobilde tam ekran sayfa, geniş ekranda sağdan açılan panel. */
export function OturumDetay({ o, onKapat }: { o: Oturum; onKapat: () => void }) {
  const { tz, saatModu, duzenleyebilirMi, cakisanlar, ben, yetkilerim } = useBaglam();
  const [iptalAcik, setIptalAcik] = useState(false);
  const g = gosterim(o, tz, saatModu);
  const iptal = o.durum === "iptal";
  const yonetebilir = duzenleyebilirMi(o.bootcamp_id);
  const yazi = yaziRengi(o.renk);
  // Ders 30 dk içinde başlıyor ya da sürüyor: katılım düğmesi en üstte ve vurgulu.
  const katilLink = !iptal ? guvenliLink(o.toplanti_linki) : null;
  const simdiKatil = !!katilLink && katilimZamani(o);

  return (
    <Pencere etiket={o.konu || o.tur} onKapat={onKapat} dis="fixed inset-0 z-50 flex justify-end bg-murekkep/40"
      className="h-full w-full overflow-y-auto bg-zemin lg:max-w-md lg:shadow-2xl">
        <div className="flex flex-col gap-4 rounded-b-[32px] px-5 pb-6 pt-4" style={{ background: o.renk, color: yazi }}>
          <div className="flex items-center justify-between">
            <button onClick={onKapat} aria-label="Kapat" className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/50">
              <Ikon ad="sol" boyut={20} />
            </button>
            {yonetebilir && <span lang="en" className="rounded-full bg-mercan-zemin px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-mercan-koyu">
              {yetkiAdi(ben?.rol === "yonetici", yetkilerim.filter((y) => y.bootcamp_id === o.bootcamp_id).map((y) => y.yetki ?? "ana_egitmen"))}
            </span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/50 px-2.5 py-1 text-xs font-semibold">{o.bootcamp_ad}</span>
            {o.donem_kod && o.donem_kod !== o.kisa_kod && (
              <span className="rounded-full bg-white/50 px-2.5 py-1 text-xs font-semibold">{o.donem_kod}</span>
            )}
            <span className="rounded-full bg-white/50 px-2.5 py-1 text-xs font-semibold">{o.tur}</span>
            {o.kaynak === "uygulama" && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-yesil">Eklenen seans</span>}
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
          {simdiKatil && (
            <a href={katilLink!} target="_blank" rel="noreferrer"
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-mercan-koyu text-[15px] font-bold text-white shadow-lg shadow-mercan/40">
              <Ikon ad="video" boyut={20} /> Derse katıl · {kalan(o) === "Şimdi" ? "ders sürüyor" : "birazdan başlıyor"}
            </a>
          )}
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
            <Satir etiket="Eğitmenler">
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

          {katilLink && !simdiKatil && (
            <a href={katilLink} target="_blank" rel="noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-yesil text-sm font-bold text-white">
              <Ikon ad="video" boyut={18} /> Derse katıl
            </a>
          )}

          {yonetebilir && <OturumCakismalari oturumId={o.id} />}
          {yonetebilir && <Yonetim o={o} iptalAc={() => setIptalAcik(true)} />}
        </div>
      {iptalAcik && <IptalPenceresi o={o} onKapat={() => setIptalAcik(false)} />}
    </Pencere>
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
  const [form, setForm] = useState<"duzenle" | "program" | "yeni" | null>(null);
  const iptal = o.durum === "iptal";
  const yanSeans = o.kaynak === "uygulama";
  const sablondan = o.kaynak === "sablon";  // Aşama C: programı uygulamadan da düzenlenir

  async function geriAl() {
    await api.iptalGeriAl(o.id);
    await Promise.all([qc.invalidateQueries({ queryKey: ["oturumlar"] }), qc.invalidateQueries({ queryKey: ["degisiklikler"] })]);
  }

  return (
    <section className="flex flex-col gap-3 rounded-kart bg-yesil p-4 text-white">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-baslik text-base font-bold">Bu oturumu yönet</h3>
        <span className="text-xs text-yesil-soluk">Yalnızca düzenleme yetkisi olanlar görür</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sablondan && (
          <button onClick={() => setForm("program")} className="col-span-2 h-11 rounded-[14px] bg-white text-sm font-bold text-yesil">
            Programı düzenle (tarih, saat, konu, eğitmen)
          </button>
        )}
        <button onClick={() => setForm("duzenle")} className={`h-11 rounded-[14px] text-sm font-bold ${sablondan ? "border border-yesil-cizgi text-white" : "bg-white text-yesil"}`}>
          {sablondan ? "Link ve not" : "Düzenle"}
        </button>
        <button onClick={() => setForm("yeni")} className="flex h-11 items-center justify-center gap-1.5 rounded-[14px] border border-yesil-cizgi text-sm font-semibold">
          <Ikon ad="arti" boyut={16} /> Seans ekle
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
        {DEMO ? "Demoda yaptığın değişiklikler yalnızca bu tarayıcıda görünür." : "Değişiklikler eğitmenlerin Değişenler ekranında görünür ve takvim aboneliklerine yansır."}
      </span>
      {form === "program" && <YanSeansFormu o={o} program onKapat={() => setForm(null)} />}
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
    <Pencere etiket="Oturumu iptal et" onKapat={onKapat} onSubmit={onayla} kirli={!!gerekce.trim() && !bekliyor}
      dis="fixed inset-0 z-[60] flex items-end justify-center bg-murekkep/50 sm:items-center sm:p-4"
      className="flex w-full flex-col gap-3 rounded-t-[28px] bg-white p-5 text-murekkep pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px]">
        <h3 className="font-baslik text-xl font-bold">Oturumu iptal et</h3>
        <p className="text-sm text-soluk">{o.kisa_kod} · {o.konu} · {gunBasligi(o.tarih)}</p>
        <label htmlFor="gerekce" className="text-sm font-semibold">Gerekçe</label>
        <textarea id="gerekce" required autoFocus rows={3} value={gerekce} onChange={(e) => setGerekce(e.target.value)}
          placeholder="Örn. eğitmen rahatsız; telafi tarihi duyurulacak"
          className="rounded-xl border border-[#D9CDC6] px-3 py-2 text-sm outline-none focus:border-yesil focus:ring-2 focus:ring-yesil/20" />
        <p className="text-xs text-soluk">Eğitmenler bunu Değişenler ekranında görür, oturum takvim aboneliklerinde iptal olarak görünür. İstersen sonra geri alabilirsin.</p>
        {hata && <p role="alert" className="text-sm text-mercan-yazi">{hata}</p>}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button type="button" onClick={onKapat} className="h-11 rounded-[14px] border border-[#D9CDC6] text-sm font-semibold">Vazgeç</button>
          <button type="submit" disabled={bekliyor || !gerekce.trim()} className="h-11 rounded-[14px] bg-mercan-koyu text-sm font-bold text-white disabled:opacity-50">
            {bekliyor ? "Bekle…" : "İptal et"}
          </button>
        </div>
    </Pencere>
  );
}
