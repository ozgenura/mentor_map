// Durak tabelaları: Bugün ekranında metro tabelası gibi kapılar. Anonslar · PO'na ilet · Öneri / sorun.
// Tabelaya dokununca sohbet gibi adım adım ilerleyen bir pencere açılır (yapay zekâ değil; seçenekler).
// Anonslar 3 gün yayında kalır; açılınca kendiliğinden "görüldü" sayılır (kimseden onay istenmez).
// PO'na ilet: eğitmen bir programının PO'larına yazar; PO (gelen talepler) bir kez cevaplar.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TALEP_KONULARI, type Anons, type Talep } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import { gorece } from "../lib/time";
import { GeriBildirimFormu } from "./GeriBildirim";
import { Pencere } from "./Pencere";
import { Ikon } from "./ui";

type Tabela = "anons" | "po" | "oneri";

/** "Seda" → "Seda'ya", "Şafak" → "Şafak'a", "Elif" → "Elif'e" (yönelme eki). */
export function yonelme(ad: string): string {
  const k = ad.toLocaleLowerCase("tr");
  const sesli = [...k].reverse().find((c) => "aeıioöuü".includes(c)) ?? "e";
  const ek = "aıou".includes(sesli) ? "a" : "e";
  return `${ad}'${"aeıioöuü".includes(k.slice(-1)) ? "y" : ""}${ek}`;
}
function adlarYonelme(adlar: string[]): string {
  if (!adlar.length) return "";
  const son = yonelme(adlar[adlar.length - 1]);
  return adlar.length === 1 ? son : `${adlar.slice(0, -1).join(", ")} ve ${son}`;
}
const ilkAd = (ad: string) => ad.split(" ")[0];

function useTabelaVerisi() {
  const { api } = useBaglam();
  const anonslar = useQuery({ queryKey: ["anonslar"], queryFn: api.anonslar, refetchInterval: 5 * 60_000 });
  const talepler = useQuery({ queryKey: ["talepler"], queryFn: api.talepler, refetchInterval: 5 * 60_000 });
  return { anonslar: anonslar.data ?? [], talepler: talepler.data ?? [] };
}

/** Özellik anahtarı 'tabelalar' kapalıyken yalnızca yönetici görür (yeni özellik önce yöneticide denenir). */
export function DurakTabelalari() {
  const { api } = useBaglam();
  const acik = useQuery({ queryKey: ["ozellik", "tabelalar"], queryFn: () => api.ozellikAcik("tabelalar"), staleTime: 10 * 60_000 });
  const herkese = useQuery({ queryKey: ["ozellik-herkese", "tabelalar"], queryFn: () => api.ozellikHerkeseAcik("tabelalar"),
    enabled: !!acik.data, staleTime: 10 * 60_000 });
  // Özellik herkese kapalıyken yönetici önizleme olarak görür (birinin gözünden bakarken de); başlık bunu söyler.
  return acik.data ? <Tabelalar onizleme={herkese.data === false} /> : null;
}

function Tabelalar({ onizleme }: { onizleme: boolean }) {
  const { anonslar, talepler } = useTabelaVerisi();
  // Bildirime dokunulunca (?tabela=anons | po) ilgili tabela açılır.
  const [acik, setAcik] = useState<Tabela | null>(() => {
    const t = new URLSearchParams(location.search).get("tabela");
    return t === "anons" || t === "po" ? t : null;
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).has("tabela")) history.replaceState(null, "", location.pathname + location.hash);
  }, []);
  const yeniAnons = anonslar.filter((a) => !a.gordum && !a.benim).length;
  const okunmamis = talepler.filter((t) => t.okunmadi).length;
  const gelen = talepler.filter((t) => t.gelen && !t.cevap).length;
  const sonAnons = anonslar[0];
  return (
    <section aria-label="Durak tabelaları" className="overflow-hidden rounded-[24px] bg-yesil text-white shadow-lg shadow-yesil/15">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-yesil-soluk">
          Durak tabelası{onizleme && <span className="ml-2 rounded bg-mercan-zemin px-1.5 py-0.5 normal-case tracking-normal text-mercan-koyu">Önizleme</span>}
        </span>
        <span className="flex gap-1" aria-hidden="true">
          {["#F08891", "#7FA650", "#E3A008", "#5B8DEF"].map((r) => <span key={r} className="h-1.5 w-4 rounded-full" style={{ background: r }} />)}
        </span>
      </div>
      <TabelaSatiri harf="A" renk="#F08891" ad="Anonslar" alt={sonAnons ? sonAnons.metin : "Yayında anons yok"}
        rozet={yeniAnons ? `${yeniAnons} yeni` : undefined} onClick={() => setAcik("anons")} />
      <TabelaSatiri harf="P" renk="#5B8DEF" ad="PO'na ilet"
        alt={gelen ? `${gelen} talep cevap bekliyor` : "Programla ilgili konuyu PO'na yaz"}
        rozet={okunmamis ? `${okunmamis} yeni` : undefined} onClick={() => setAcik("po")} />
      <TabelaSatiri harf="Ö" renk="#E3A008" ad="Öneri / sorun" alt="Mentor Map'i geliştirmemize yardım et" onClick={() => setAcik("oneri")} son />
      {acik === "anons" && <AnonsPenceresi anonslar={anonslar} onKapat={() => setAcik(null)} />}
      {acik === "po" && <PoPenceresi talepler={talepler} onKapat={() => setAcik(null)} />}
      {acik === "oneri" && <GeriBildirimFormu sekme="bugun" onKapat={() => setAcik(null)} />}
    </section>
  );
}

function TabelaSatiri({ harf, renk, ad, alt, rozet, onClick, son = false }: {
  harf: string; renk: string; ad: string; alt: string; rozet?: string; onClick: () => void; son?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-yesil-acik ${son ? "" : "border-b border-yesil-cizgi"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-baslik text-[15px] font-bold text-yesil ring-2 ring-white/80"
        style={{ background: renk }}>{harf}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-baslik text-[17px] font-bold leading-tight tracking-tight">{ad}</span>
        <span className="truncate text-xs text-yesil-soluk">{alt}</span>
      </span>
      {rozet && <span className="shrink-0 rounded-full bg-mercan-zemin px-2 py-0.5 text-[11px] font-bold text-mercan-koyu">{rozet}</span>}
      <Ikon ad="ok" boyut={18} className="shrink-0 text-yesil-soluk transition group-hover:translate-x-0.5" />
    </button>
  );
}

/* ---------- pencere iskeleti ---------- */

function TabelaPenceresi({ harf, renk, ad, onKapat, kirli = false, children }: {
  harf: string; renk: string; ad: string; onKapat: () => void; kirli?: boolean; children: React.ReactNode;
}) {
  return (
    <Pencere etiket={ad} onKapat={onKapat} kirli={kirli} dis="fixed inset-0 z-50 flex items-end justify-center bg-murekkep/40 sm:items-center"
      className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-zemin text-murekkep sm:rounded-[28px]">
      <div className="flex items-center gap-3 bg-yesil px-5 py-4 text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-full font-baslik text-base font-bold text-yesil ring-2 ring-white/80"
          style={{ background: renk }}>{harf}</span>
        <span className="flex-1 font-baslik text-xl font-bold tracking-tight">{ad}</span>
        <button type="button" onClick={onKapat} aria-label="Kapat" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Ikon ad="kapat" boyut={18} /></button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-4">{children}</div>
    </Pencere>
  );
}

function Balon({ children, ben = false }: { children: React.ReactNode; ben?: boolean }) {
  return (
    <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${ben ? "self-end rounded-br-md bg-yesil text-white" : "self-start rounded-bl-md bg-white"}`}>
      {children}
    </div>
  );
}

function Secenekler({ secenekler, onSec }: { secenekler: { deger: string; ad: string; renk?: string }[]; onSec: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 self-start">
      {secenekler.map((s) => (
        <button type="button" key={s.deger} onClick={() => onSec(s.deger)}
          className="flex items-center gap-1.5 rounded-full border border-cizgi bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-yesil">
          {s.renk && <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.renk }} />}{s.ad}
        </button>
      ))}
    </div>
  );
}

function Etiket({ kod, renk }: { kod: string | null; renk: string | null }) {
  return <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: renk ?? "#8F807A" }}>{kod ?? "Tümü"}</span>;
}

function Gonder({ etiket, metin, setMetin, yerTutucu, bekliyor, hata, onGonder }: {
  etiket: string; metin: string; setMetin: (s: string) => void; yerTutucu: string; bekliyor: boolean; hata: string | null; onGonder: () => void;
}) {
  return (
    <>
      <textarea rows={3} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder={yerTutucu} maxLength={1000}
        className="rounded-xl border border-cizgi bg-white px-3 py-2 text-sm outline-none focus:border-yesil" />
      {hata && <span role="alert" className="text-xs text-mercan-koyu">{hata}</span>}
      <button type="button" disabled={!metin.trim() || bekliyor} onClick={onGonder}
        className="h-11 self-end rounded-full bg-yesil px-5 text-sm font-bold text-white disabled:opacity-40">{bekliyor ? "Gönderiliyor…" : etiket}</button>
    </>
  );
}

function useGonderim() {
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  async function calistir(f: () => Promise<void>) {
    setBekliyor(true); setHata(null);
    try { await f(); return true; } catch (e) { setHata(e instanceof Error ? e.message : "Gönderilemedi."); return false; } finally { setBekliyor(false); }
  }
  return { bekliyor, hata, calistir };
}

/* ---------- Anonslar ---------- */

function AnonsPenceresi({ anonslar, onKapat }: { anonslar: Anons[]; onKapat: () => void }) {
  const { api, programPaneli } = useBaglam();
  const qc = useQueryClient();
  const [yaz, setYaz] = useState(false);
  // açılınca görülmüş sayılır
  useEffect(() => {
    const idler = anonslar.filter((a) => !a.gordum && !a.benim).map((a) => a.id);
    if (idler.length) api.anonsGorduk(idler).then(() => qc.invalidateQueries({ queryKey: ["anonslar"] })).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TabelaPenceresi harf="A" renk="#F08891" ad="Anonslar" onKapat={onKapat}>
      {anonslar.length === 0 && <Balon>Şu an yayında anons yok 🚇</Balon>}
      {anonslar.map((a) => (
        <article key={a.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-soluk">
            <Etiket kod={a.kod} renk={a.renk} />
            <span className="font-semibold text-murekkep">{a.yazan}</span> · {gorece(a.olusturma)} · {kalanGun(a.bitis)}
          </div>
          <p className="whitespace-pre-line text-[15px] font-medium leading-snug">{a.metin}</p>
          {a.goren !== null && a.kitle !== null && <span className="text-xs text-soluk">{a.goren}/{a.kitle} kişi gördü</span>}
        </article>
      ))}
      {programPaneli && (yaz ? <AnonsYaz onBitti={() => setYaz(false)} /> : (
        <button type="button" onClick={() => setYaz(true)}
          className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-yesil text-sm font-bold text-yesil">
          <Ikon ad="arti" boyut={16} /> Anons yaz
        </button>
      ))}
    </TabelaPenceresi>
  );
}

function kalanGun(bitis: string) {
  const g = Math.ceil((Date.parse(bitis) - Date.now()) / 864e5);
  return g <= 1 ? "bugün kalkıyor" : `${g} gün daha yayında`;
}

function AnonsYaz({ onBitti }: { onBitti: () => void }) {
  const { api, tum, duzenleyebilirMi, ben } = useBaglam();
  const qc = useQueryClient();
  const [hat, setHat] = useState<string | null>(null);
  const [metin, setMetin] = useState("");
  const [gitti, setGitti] = useState(false);
  const g = useGonderim();
  const hatlar = useMemo(() => {
    const m = new Map<string, { deger: string; ad: string; renk: string }>();
    for (const o of tum) if (!m.has(o.bootcamp_id) && duzenleyebilirMi(o.bootcamp_id) && !o.excelden_kalkti)
      m.set(o.bootcamp_id, { deger: o.bootcamp_id, ad: o.kisa_kod, renk: o.renk });
    const l = [...m.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    return ben?.rol === "yonetici" ? [...l, { deger: "*", ad: "Tüm hatlar", renk: "#8F807A" }] : l;
  }, [tum, duzenleyebilirMi, ben]);
  const hatAdi = hatlar.find((h) => h.deger === hat)?.ad;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-mavi/60 p-3">
      <Balon>Anons hangi hatta yayınlansın?</Balon>
      {!hat ? <Secenekler secenekler={hatlar} onSec={setHat} /> : <Balon ben>{hatAdi}</Balon>}
      {hat && !gitti && <>
        <Balon>Anonsun ne? 3 gün yayında kalır, sonra kendiliğinden kalkar.</Balon>
        <Gonder etiket="Anonsu yayınla" metin={metin} setMetin={setMetin} yerTutucu="Örn. Perşembe dersi 21:00'e alındı."
          bekliyor={g.bekliyor} hata={g.hata} onGonder={async () => {
            if (await g.calistir(() => api.anonsYaz(hat === "*" ? null : hat, metin.trim()))) {
              setGitti(true);
              qc.invalidateQueries({ queryKey: ["anonslar"] });
            }
          }} />
      </>}
      {gitti && <>
        <Balon ben>{metin}</Balon>
        <Balon>Anons {hatAdi === "Tüm hatlar" ? "tüm hatlarda" : `${hatAdi} hattında`} yayında 🚇</Balon>
        <button type="button" onClick={onBitti} className="self-start text-[13px] font-semibold underline">Tamam</button>
      </>}
    </div>
  );
}

/* ---------- PO'na ilet ---------- */

function PoPenceresi({ talepler, onKapat }: { talepler: Talep[]; onKapat: () => void }) {
  const { api, benimler, kisiler } = useBaglam();
  const qc = useQueryClient();
  const yetkiler = useQuery({ queryKey: ["yetkiler"], queryFn: api.yetkiler });
  const [hat, setHat] = useState<string | null>(null);
  const [konu, setKonu] = useState<string | null>(null);
  const [metin, setMetin] = useState("");
  const [gitti, setGitti] = useState<string | null>(null);
  const g = useGonderim();
  useEffect(() => {
    if (talepler.some((t) => t.okunmadi)) api.talepleriOkudum().then(() => qc.invalidateQueries({ queryKey: ["talepler"] })).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kişinin yer aldığı ve PO'su tanımlı programlar
  const adlar = useMemo(() => new Map(kisiler.map((k) => [k.id, k.ad])), [kisiler]);
  const programlar = useMemo(() => {
    const m = new Map<string, { deger: string; ad: string; renk: string; po: string[] }>();
    for (const o of benimler) {
      if (m.has(o.bootcamp_id) || o.excelden_kalkti) continue;
      const po = (yetkiler.data ?? []).filter((y) => y.bootcamp_id === o.bootcamp_id && y.yetki === "po")
        .map((y) => adlar.get(y.kisi_id)).filter((x): x is string => !!x).map(ilkAd);
      if (po.length) m.set(o.bootcamp_id, { deger: o.bootcamp_id, ad: o.kisa_kod, renk: o.renk, po });
    }
    return [...m.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }, [benimler, yetkiler.data, adlar]);
  const secili = programlar.find((p) => p.deger === hat);
  const gelen = talepler.filter((t) => t.gelen);
  const benim = talepler.filter((t) => t.benim);

  return (
    <TabelaPenceresi harf="P" renk="#5B8DEF" ad="PO'na ilet" onKapat={onKapat} kirli={!!metin.trim() && !gitti}>
      {gelen.length > 0 && <>
        <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-soluk">Gelen talepler</h3>
        {gelen.map((t) => <GelenTalep key={t.id} t={t} />)}
        <div className="my-1 border-t border-cizgi" />
      </>}
      {benim.map((t) => (
        <div key={t.id} className="flex flex-col gap-2 rounded-2xl bg-white/60 p-3">
          <span className="flex items-center gap-2 text-xs text-soluk"><Etiket kod={t.kod} renk={t.renk} />{t.konu} · {gorece(t.olusturma)}</span>
          <Balon ben>{t.metin}</Balon>
          {t.cevap && <Balon><span className="block text-[11px] font-bold text-soluk">{ilkAd(t.cevaplayan ?? "PO")} · {gorece(t.cevap_zamani!)}</span>{t.cevap}</Balon>}
        </div>
      ))}
      {benim.length > 0 && <div className="my-1 border-t border-cizgi" />}

      {programlar.length === 0 ? (
        <Balon>Yer aldığın programların PO'su henüz tanımlı değil. Öneri / sorun tabelasından bize yazabilirsin.</Balon>
      ) : <>
        <Balon>Merhaba! Hangi programın PO'suna yazmak istersin?</Balon>
        {!hat ? <Secenekler secenekler={programlar} onSec={setHat} /> : <Balon ben>{secili?.ad}</Balon>}
        {secili && <>
          <Balon>{secili.ad} için mesajın {adlarYonelme(secili.po)} gidecek. Ne hakkında?</Balon>
          {!konu ? <Secenekler secenekler={TALEP_KONULARI.map((k) => ({ deger: k, ad: k }))} onSec={setKonu} /> : <Balon ben>{konu}</Balon>}
        </>}
        {secili && konu && !gitti && <>
          <Balon>Yaz bakalım 👇</Balon>
          <Gonder etiket="Gönder" metin={metin} setMetin={setMetin} yerTutucu="Mesajın…" bekliyor={g.bekliyor} hata={g.hata}
            onGonder={async () => {
              if (await g.calistir(() => api.talepGonder(secili.deger, konu, metin.trim()))) {
                setGitti(adlarYonelme(secili.po));
                qc.invalidateQueries({ queryKey: ["talepler"] });
              }
            }} />
        </>}
        {gitti && <>
          <Balon ben>{metin}</Balon>
          <Balon>Talebin {gitti} ulaştı 🚇</Balon>
          <button type="button" onClick={() => { setHat(null); setKonu(null); setMetin(""); setGitti(null); }}
            className="self-start text-[13px] font-semibold underline">Yeni talep</button>
        </>}
      </>}
    </TabelaPenceresi>
  );
}

function GelenTalep({ t }: { t: Talep }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [metin, setMetin] = useState("");
  const g = useGonderim();
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-3">
      <span className="flex flex-wrap items-center gap-2 text-xs text-soluk">
        <Etiket kod={t.kod} renk={t.renk} /><span className="font-semibold text-murekkep">{t.gonderen}</span> · {t.konu} · {gorece(t.olusturma)}
      </span>
      <Balon>{t.metin}</Balon>
      {t.cevap ? (
        <Balon ben><span className="block text-[11px] font-bold opacity-70">{t.cevaplayan} · {gorece(t.cevap_zamani!)}</span>{t.cevap}</Balon>
      ) : (
        <Gonder etiket="Cevapla" metin={metin} setMetin={setMetin} yerTutucu={`${ilkAd(t.gonderen)} için cevabın…`} bekliyor={g.bekliyor} hata={g.hata}
          onGonder={async () => {
            if (await g.calistir(() => api.talepCevapla(t.id, metin.trim()))) qc.invalidateQueries({ queryKey: ["talepler"] });
          }} />
      )}
    </div>
  );
}
