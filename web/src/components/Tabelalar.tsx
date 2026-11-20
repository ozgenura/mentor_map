// Durak tabelaları (görsel taslak, yalnızca demo): Bugün ekranında metro tabelası gibi kapılar.
// Anonslar · PO'na ilet · Öneri / sorun. Tabelaya dokununca sohbet gibi ilerleyen bir pencere açılır
// (yapay zekâ değil; adım adım seçenekler). Veriler örnektir, hiçbir şey kaydedilmez.

import { useState } from "react";
import { GeriBildirimFormu } from "./GeriBildirim";
import { Pencere } from "./Pencere";
import { Ikon } from "./ui";

type Tabela = "anons" | "po" | "oneri";

const ANONSLAR = [
  { id: 1, hat: "DA", renk: "#7FA650", yazan: "Şafak Ünal", zaman: "2 saat önce", kalan: "3 gün",
    metin: "26 Kasım Perşembe dersi 21:00'e alındı. Zoom linki aynı.", goren: 9, toplam: 12, gordum: false },
  { id: 2, hat: "Tümü", renk: "#8F807A", yazan: "Özge", zaman: "dün", kalan: "2 gün",
    metin: "Mentor Map'e takvim aboneliği geldi: Profil → Takvimine bağla. Dersler telefon takviminize kendiliğinden düşer.",
    goren: 21, toplam: 34, gordum: true },
];

const MESAJLAR = [
  { id: 1, hat: "Vibe", renk: "#E08A4F", po: "Seda", konu: "Ders", zaman: "3 gün önce",
    metin: "19 Kasım'daki kapanış dersinde proje sunumlarına 30 dk ek süre verebilir miyiz?",
    cevap: { metin: "Olur, 23:30'a kadar uzatalım. Programı güncelledim.", zaman: "2 gün önce" } },
];

export function DurakTabelalari() {
  const [acik, setAcik] = useState<Tabela | null>(null);
  const yeniAnons = ANONSLAR.filter((a) => !a.gordum).length;
  const yeniCevap = MESAJLAR.filter((m) => m.cevap).length;
  return (
    <section aria-label="Durak tabelaları" className="overflow-hidden rounded-[24px] bg-yesil text-white shadow-lg shadow-yesil/15">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-yesil-soluk">Durak tabelası</span>
        <span className="flex gap-1" aria-hidden="true">
          {["#F08891", "#7FA650", "#E3A008", "#5B8DEF"].map((r) => <span key={r} className="h-1.5 w-4 rounded-full" style={{ background: r }} />)}
        </span>
      </div>
      <TabelaSatiri harf="A" renk="#F08891" ad="Anonslar" alt={ANONSLAR[0].metin} rozet={yeniAnons ? `${yeniAnons} yeni` : undefined}
        onClick={() => setAcik("anons")} />
      <TabelaSatiri harf="P" renk="#5B8DEF" ad="PO'na ilet" alt="Programla ilgili sorunu PO'na yaz"
        rozet={yeniCevap ? `${yeniCevap} cevap` : undefined} onClick={() => setAcik("po")} />
      <TabelaSatiri harf="Ö" renk="#E3A008" ad="Öneri / sorun" alt="Mentor Map'i geliştirmemize yardım et" onClick={() => setAcik("oneri")} son />
      {acik === "anons" && <AnonsPenceresi onKapat={() => setAcik(null)} />}
      {acik === "po" && <PoPenceresi onKapat={() => setAcik(null)} />}
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

/* ---------- pencere iskeleti: tabela başlığı + sohbet akışı ---------- */

function TabelaPenceresi({ harf, renk, ad, onKapat, children }: {
  harf: string; renk: string; ad: string; onKapat: () => void; children: React.ReactNode;
}) {
  return (
    <Pencere etiket={ad} onKapat={onKapat} dis="fixed inset-0 z-50 flex items-end justify-center bg-murekkep/40 sm:items-center"
      className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-zemin text-murekkep sm:rounded-[28px]">
      <div className="flex items-center gap-3 bg-yesil px-5 py-4 text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-full font-baslik text-base font-bold text-yesil ring-2 ring-white/80"
          style={{ background: renk }}>{harf}</span>
        <span className="flex-1 font-baslik text-xl font-bold tracking-tight">{ad}</span>
        <button onClick={onKapat} aria-label="Kapat" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Ikon ad="kapat" boyut={18} /></button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-4">{children}</div>
    </Pencere>
  );
}

function Balon({ children, ben = false }: { children: React.ReactNode; ben?: boolean }) {
  return (
    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${ben ? "self-end rounded-br-md bg-yesil text-white" : "self-start rounded-bl-md bg-white"}`}>
      {children}
    </div>
  );
}

function Secenekler({ secenekler, onSec }: { secenekler: [string, string?][]; onSec: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 self-start">
      {secenekler.map(([s, renk]) => (
        <button key={s} onClick={() => onSec(s)}
          className="flex items-center gap-1.5 rounded-full border border-cizgi bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-yesil">
          {renk && <span className="h-2.5 w-2.5 rounded-full" style={{ background: renk }} />}{s}
        </button>
      ))}
    </div>
  );
}

/* ---------- Anonslar ---------- */

function AnonsPenceresi({ onKapat }: { onKapat: () => void }) {
  const [yaz, setYaz] = useState(false);
  return (
    <TabelaPenceresi harf="A" renk="#F08891" ad="Anonslar" onKapat={onKapat}>
      {ANONSLAR.map((a) => {
        return (
          <article key={a.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-soluk">
              <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: a.renk }}>{a.hat}</span>
              <span className="font-semibold text-murekkep">{a.yazan}</span> · {a.zaman} · {a.kalan} daha yayında
            </div>
            <p className="text-[15px] font-medium leading-snug">{a.metin}</p>
            {/* Görülme kendiliğinden (anonslar açılınca) sayılır; kimseden onay istenmez. Sayıyı yalnızca yazan PO ve yönetici görür. */}
            <span className="text-xs text-soluk">{a.goren}/{a.toplam} kişi gördü</span>
          </article>
        );
      })}
      {yaz ? <AnonsYaz onBitti={() => setYaz(false)} /> : (
        <button onClick={() => setYaz(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-yesil text-sm font-bold text-yesil">
          <Ikon ad="arti" boyut={16} /> Anons yaz (yalnızca PO ve yönetici görür)
        </button>
      )}
    </TabelaPenceresi>
  );
}

function AnonsYaz({ onBitti }: { onBitti: () => void }) {
  const [hat, setHat] = useState<string | null>(null);
  const [metin, setMetin] = useState("");
  const [gitti, setGitti] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-mavi/60 p-3">
      <Balon>Anons hangi hatta yayınlansın?</Balon>
      {!hat ? <Secenekler secenekler={[["Vibe", "#E08A4F"], ["Fabric", "#E3A008"], ["Tüm hatlar", "#8F807A"]]} onSec={setHat} /> : <Balon ben>{hat}</Balon>}
      {hat && !gitti && <>
        <Balon>Anonsun ne? 3 gün yayında kalır, sonra kendiliğinden kalkar.</Balon>
        <textarea rows={3} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Örn. Perşembe dersi 21:00'e alındı."
          className="rounded-xl border border-cizgi bg-white px-3 py-2 text-sm outline-none focus:border-yesil" />
        <button disabled={!metin.trim()} onClick={() => setGitti(true)}
          className="h-11 self-end rounded-full bg-yesil px-5 text-sm font-bold text-white disabled:opacity-40">Anonsu yayınla</button>
      </>}
      {gitti && <>
        <Balon ben>{metin}</Balon>
        <Balon>Anons {hat} hattında yayında 🚇</Balon>
        <button onClick={onBitti} className="self-start text-[13px] font-semibold underline">Tamam</button>
      </>}
    </div>
  );
}

/* ---------- PO'na ilet ---------- */

function PoPenceresi({ onKapat }: { onKapat: () => void }) {
  const [hat, setHat] = useState<string | null>(null);
  const [konu, setKonu] = useState<string | null>(null);
  const [metin, setMetin] = useState("");
  const [gitti, setGitti] = useState(false);
  const po: Record<string, string> = { Vibe: "Seda", Fabric: "Seda", DA: "Şafak" };
  return (
    <TabelaPenceresi harf="P" renk="#5B8DEF" ad="PO'na ilet" onKapat={onKapat}>
      {MESAJLAR.map((m) => (
        <div key={m.id} className="flex flex-col gap-2 rounded-2xl bg-white/60 p-3">
          <span className="flex items-center gap-2 text-xs text-soluk">
            <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: m.renk }}>{m.hat}</span>
            {m.konu} · {m.zaman}
          </span>
          <Balon ben>{m.metin}</Balon>
          {m.cevap && <Balon><span className="block text-[11px] font-bold text-soluk">{m.po} · {m.cevap.zaman}</span>{m.cevap.metin}</Balon>}
        </div>
      ))}
      <div className="my-1 border-t border-cizgi" />
      <Balon>Merhaba! Hangi programın PO'suna yazmak istersin?</Balon>
      {!hat ? <Secenekler secenekler={[["Vibe", "#E08A4F"], ["Fabric", "#E3A008"], ["DA", "#7FA650"]]} onSec={setHat} /> : <Balon ben>{hat}</Balon>}
      {hat && <>
        <Balon>{hat} için mesajın {po[hat]}'ya gidecek. Ne hakkında?</Balon>
        {!konu ? <Secenekler secenekler={[["Ders içeriği"], ["Program / saat"], ["Materyal / link"], ["Diğer"]]} onSec={setKonu} /> : <Balon ben>{konu}</Balon>}
      </>}
      {hat && konu && !gitti && <>
        <Balon>Yaz bakalım 👇</Balon>
        <textarea rows={3} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Mesajın…"
          className="rounded-xl border border-cizgi bg-white px-3 py-2 text-sm outline-none focus:border-yesil" />
        <button disabled={!metin.trim()} onClick={() => setGitti(true)}
          className="h-11 self-end rounded-full bg-yesil px-5 text-sm font-bold text-white disabled:opacity-40">Gönder</button>
      </>}
      {gitti && <>
        <Balon ben>{metin}</Balon>
        <Balon>Talebin {po[hat!]}'ya ulaştı 🚇</Balon>
      </>}
    </TabelaPenceresi>
  );
}
