// Ana eğitmenin formları:
// - "detay": resmi (Excel'den gelen) oturumun Excel'de olmayan alanları: açıklama, linkler, not.
// - "yanSeans": yan seans ekleme ya da düzenleme (tarih, saat, konu, anlatıcılar dahil).

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import type { YanSeans } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import { basMs, bitMs } from "../lib/derive";
import { bugunTR, gunBasligi, saat, TR } from "../lib/time";
import type { Oturum } from "../lib/types";
import { Ikon } from "./ui";

const TURLER = ["Yan Seans", "Ders", "Ek Ders", "Uygulama", "Office Hours", "Master Class", "Sunum", "Mentor Görüşmesi", "Etkinlik"];

type Anlatici = { kisi_id: string } | { konuk_ad: string };

function Alan({ etiket, htmlFor, children, ipucu }: { etiket: string; htmlFor?: string; children: ReactNode; ipucu?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">{etiket}</label>
      {children}
      {ipucu && <span className="text-xs text-soluk">{ipucu}</span>}
    </div>
  );
}

const GIRDI = "h-11 rounded-xl border border-[#D9CDC6] bg-white px-3 text-sm outline-none focus:border-yesil focus:ring-2 focus:ring-yesil/20";

function Kabuk({ baslik, alt, onKapat, onKaydet, bekliyor, hata, kaydetMetni, children }: {
  baslik: string; alt?: string; onKapat: () => void; onKaydet: (e: React.FormEvent) => void; bekliyor: boolean;
  hata: string | null; kaydetMetni: string; children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-murekkep/50 sm:items-center sm:p-4" onClick={(e) => { e.stopPropagation(); onKapat(); }}>
      <form onSubmit={onKaydet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={baslik}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-zemin text-murekkep sm:max-w-lg sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h3 className="font-baslik text-xl font-bold">{baslik}</h3>
            {alt && <p className="mt-0.5 text-[13px] text-soluk">{alt}</p>}
          </div>
          <button type="button" onClick={onKapat} aria-label="Kapat" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><Ikon ad="kapat" boyut={18} /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-4">{children}</div>
        <div className="border-t border-cizgi bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {hata && <p role="alert" className="mb-2 text-sm text-mercan-yazi">{hata}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onKapat} className="h-11 rounded-[14px] border border-[#D9CDC6] text-sm font-semibold">Vazgeç</button>
            <button type="submit" disabled={bekliyor} className="h-11 rounded-[14px] bg-yesil text-sm font-bold text-white disabled:opacity-50">
              {bekliyor ? "Kaydediliyor…" : kaydetMetni}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function DetayFormu({ o, onKapat }: { o: Oturum; onKapat: () => void }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const [d, setD] = useState({
    aciklama: o.aciklama ?? "", toplanti_linki: o.toplanti_linki ?? "", materyal_linki: o.materyal_linki ?? "", notlar: o.notlar ?? "",
  });
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata(null);
    try {
      await api.detayGuncelle(o.id, d);
      await qc.invalidateQueries({ queryKey: ["oturumlar"] });
      onKapat();
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kaydedilemedi.");
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <Kabuk baslik="Oturumu düzenle" alt={`${o.kisa_kod} · ${o.konu} · ${gunBasligi(o.tarih)}`} onKapat={onKapat} onKaydet={kaydet}
      bekliyor={bekliyor} hata={hata} kaydetMetni="Kaydet">
      <p className="rounded-xl bg-mavi px-3 py-2.5 text-xs text-mavi-koyu">
        Tarih, saat, konu ve eğitmen Excel'den gelir; onları yönetici değiştirir. Buradaki alanlar Excel güncellemesinde ezilmez.
      </p>
      <Alan etiket="Toplantı linki" htmlFor="f-link">
        <input id="f-link" type="url" inputMode="url" placeholder="https://meet.google.com/…" value={d.toplanti_linki}
          onChange={(e) => setD({ ...d, toplanti_linki: e.target.value })} className={GIRDI} />
      </Alan>
      <Alan etiket="Materyal linki" htmlFor="f-materyal">
        <input id="f-materyal" type="url" inputMode="url" placeholder="https://drive.google.com/…" value={d.materyal_linki}
          onChange={(e) => setD({ ...d, materyal_linki: e.target.value })} className={GIRDI} />
      </Alan>
      <Alan etiket="Açıklama" htmlFor="f-aciklama" ipucu="Katılımcıların ve anlatıcıların göreceği kısa bilgi.">
        <textarea id="f-aciklama" rows={3} value={d.aciklama} onChange={(e) => setD({ ...d, aciklama: e.target.value })}
          className={`${GIRDI} h-auto py-2`} />
      </Alan>
      <Alan etiket="Not" htmlFor="f-not" ipucu="Eğitmenler arası not.">
        <textarea id="f-not" rows={2} value={d.notlar} onChange={(e) => setD({ ...d, notlar: e.target.value })}
          className={`${GIRDI} h-auto py-2`} />
      </Alan>
    </Kabuk>
  );
}

export function YanSeansFormu({ o, bootcampId, onKapat, onKaydedildi }: {
  o?: Oturum; bootcampId?: string; onKapat: () => void; onKaydedildi?: (id: string) => void;
}) {
  const { api, tum, kisiler, anaEgitmenMi } = useBaglam();
  const qc = useQueryClient();
  const bootcamplar = useMemo(() => [...new Map(tum.filter((x) => anaEgitmenMi(x.bootcamp_id))
    .map((x) => [x.bootcamp_id, x.bootcamp_ad])).entries()], [tum, anaEgitmenMi]);

  const [s, setS] = useState<YanSeans>(() => ({
    id: o?.id,
    bootcamp_id: o?.bootcamp_id ?? bootcampId ?? bootcamplar[0]?.[0] ?? "",
    tarih: o?.tarih ?? bugunTR(),
    baslangic: o?.baslangic ? saat(o.baslangic, TR) : "20:30",
    bitis: o?.bitis ? saat(o.bitis, TR) : "22:00",
    tur: o?.tur ?? "Yan Seans",
    konu: o?.konu ?? "",
    aciklama: o?.aciklama ?? "",
    toplanti_linki: o?.toplanti_linki ?? "",
    anlaticilar: (o?.anlaticilar ?? []).map((a): Anlatici => (a.kisi_id ? { kisi_id: a.kisi_id } : { konuk_ad: a.ad })),
  }));
  const [secilecek, setSecilecek] = useState("");
  const [konuk, setKonuk] = useState("");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const adlar = useMemo(() => new Map(kisiler.map((k) => [k.id, k.ad])), [kisiler]);
  const seciliKisiler = s.anlaticilar.filter((a): a is { kisi_id: string } => "kisi_id" in a).map((a) => a.kisi_id);

  // Seçili anlatıcıların bu saatteki diğer oturumları
  const cakismalar = useMemo(() => {
    if (!s.tarih || !s.baslangic || !s.bitis) return [];
    const bas = Date.parse(`${s.tarih}T${s.baslangic}:00+03:00`);
    const bit = Date.parse(`${s.tarih}T${s.bitis}:00+03:00`);
    return tum.filter((x) => x.id !== o?.id && x.durum === "planli" && x.tarih === s.tarih
      && x.anlaticilar.some((a) => a.kisi_id && seciliKisiler.includes(a.kisi_id))
      && (!x.baslangic || (basMs(x) < bit && bas < bitMs(x))));
  }, [tum, s.tarih, s.baslangic, s.bitis, seciliKisiler, o?.id]);

  function ekleKisi(id: string) {
    if (id && !seciliKisiler.includes(id)) setS({ ...s, anlaticilar: [...s.anlaticilar, { kisi_id: id }] });
    setSecilecek("");
  }
  function ekleKonuk() {
    if (konuk.trim()) setS({ ...s, anlaticilar: [...s.anlaticilar, { konuk_ad: konuk.trim() }] });
    setKonuk("");
  }

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!s.konu.trim()) return setHata("Konu zorunlu.");
    if (!s.anlaticilar.length) return setHata("En az bir anlatıcı seçin.");
    if (s.bitis <= s.baslangic) return setHata("Bitiş saati başlangıçtan sonra olmalı.");
    setBekliyor(true);
    setHata(null);
    try {
      const id = await api.yanSeansKaydet(s);
      await Promise.all([qc.invalidateQueries({ queryKey: ["oturumlar"] }), qc.invalidateQueries({ queryKey: ["degisiklikler"] })]);
      onKapat();
      onKaydedildi?.(id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kaydedilemedi.");
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <Kabuk baslik={o ? "Yan seansı düzenle" : "Yan seans ekle"} alt="Saatler TR saatidir. Anlatıcılara bildirim gider."
      onKapat={onKapat} onKaydet={kaydet} bekliyor={bekliyor} hata={hata} kaydetMetni={o ? "Kaydet" : "Seansı ekle"}>
      {!o && (
        <Alan etiket="Bootcamp" htmlFor="y-bootcamp">
          <select id="y-bootcamp" value={s.bootcamp_id} onChange={(e) => setS({ ...s, bootcamp_id: e.target.value })} className={GIRDI}>
            {bootcamplar.map(([id, ad]) => <option key={id} value={id}>{ad}</option>)}
          </select>
        </Alan>
      )}
      <Alan etiket="Konu" htmlFor="y-konu">
        <input id="y-konu" required value={s.konu} onChange={(e) => setS({ ...s, konu: e.target.value })}
          placeholder="Örn. SQL soru-cevap" className={GIRDI} />
      </Alan>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3 sm:col-span-1">
          <Alan etiket="Tarih" htmlFor="y-tarih">
            <input id="y-tarih" type="date" required value={s.tarih} onChange={(e) => setS({ ...s, tarih: e.target.value })} className={GIRDI} />
          </Alan>
        </div>
        <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-2">
          <Alan etiket="Başlangıç" htmlFor="y-bas">
            <input id="y-bas" type="time" required value={s.baslangic} onChange={(e) => setS({ ...s, baslangic: e.target.value })} className={GIRDI} />
          </Alan>
          <Alan etiket="Bitiş" htmlFor="y-bit">
            <input id="y-bit" type="time" required value={s.bitis} onChange={(e) => setS({ ...s, bitis: e.target.value })} className={GIRDI} />
          </Alan>
        </div>
      </div>
      <Alan etiket="Tür" htmlFor="y-tur">
        <select id="y-tur" value={s.tur} onChange={(e) => setS({ ...s, tur: e.target.value })} className={GIRDI}>
          {TURLER.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Alan>

      <Alan etiket="Anlatıcılar" ipucu="İlk eklenen ana anlatıcıdır. Ana eğitmenin kendisinin anlatması gerekmez.">
        {s.anlaticilar.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.anlaticilar.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-[13px] font-semibold">
                {"kisi_id" in a ? adlar.get(a.kisi_id) ?? "?" : `${a.konuk_ad} (konuk)`}
                <button type="button" aria-label="Çıkar" onClick={() => setS({ ...s, anlaticilar: s.anlaticilar.filter((_, j) => j !== i) })}
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-cizgi"><Ikon ad="kapat" boyut={14} /></button>
              </span>
            ))}
          </div>
        )}
        <select aria-label="Eğitmen ekle" value={secilecek} onChange={(e) => ekleKisi(e.target.value)} className={GIRDI}>
          <option value="">+ Kayıtlı eğitmen ekle</option>
          {kisiler.filter((k) => k.rol === "egitmen" && !seciliKisiler.includes(k.id)).map((k) => <option key={k.id} value={k.id}>{k.ad}{k.dis_egitmen ? " (dış)" : ""}</option>)}
        </select>
        <div className="flex gap-2">
          <input aria-label="Konuk anlatıcı adı" value={konuk} onChange={(e) => setKonuk(e.target.value)} placeholder="Konuk anlatıcı adı"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ekleKonuk(); } }} className={`${GIRDI} min-w-0 flex-1`} />
          <button type="button" onClick={ekleKonuk} className="h-11 shrink-0 rounded-xl bg-white px-3 text-[13px] font-semibold">Konuk ekle</button>
        </div>
      </Alan>

      {cakismalar.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-mercan-acik px-3 py-2.5 text-xs text-mercan-koyu">
          <span className="flex items-center gap-1.5 font-bold"><Ikon ad="uyari" boyut={15} /> Bu saatte başka oturumlar var</span>
          {cakismalar.map((x) => (
            <span key={x.id}>
              {x.anlaticilar.filter((a) => a.kisi_id && seciliKisiler.includes(a.kisi_id)).map((a) => a.ad).join(", ")}:{" "}
              {x.kisa_kod} · {x.konu} ({x.baslangic ? `${saat(x.baslangic)}–${saat(x.bitis!)}` : "saat belirsiz"})
            </span>
          ))}
          <span>Yine de kaydedebilirsin.</span>
        </div>
      )}

      <Alan etiket="Toplantı linki" htmlFor="y-link">
        <input id="y-link" type="url" inputMode="url" placeholder="https://meet.google.com/…" value={s.toplanti_linki}
          onChange={(e) => setS({ ...s, toplanti_linki: e.target.value })} className={GIRDI} />
      </Alan>
      <Alan etiket="Açıklama" htmlFor="y-aciklama">
        <textarea id="y-aciklama" rows={3} value={s.aciklama} onChange={(e) => setS({ ...s, aciklama: e.target.value })}
          className={`${GIRDI} h-auto py-2`} />
      </Alan>
    </Kabuk>
  );
}
