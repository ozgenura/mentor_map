import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SayfaUstu } from "../components/Kabuk";
import { ALab, Ikon, Kart } from "../components/ui";
import { DEMO } from "../lib/api";
import { useBaglam } from "../lib/baglam";
import { cikis, demoKisiSec } from "../lib/kimlik";
import { gorece, sehir, TR } from "../lib/time";

export function Profil({ demoSec }: { demoSec: (id: string) => void }) {
  const { ben, kisiler, tz, sonGuncelleme, anaEgitmenMi, tum, bakis } = useBaglam();
  const anaBootcamplar = [...new Map(tum.filter((o) => anaEgitmenMi(o.bootcamp_id)).map((o) => [o.bootcamp_id, o.bootcamp_ad])).values()];
  return (
    <>
      <SayfaUstu baslik="Profil" />
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-3 pt-4 lg:mx-0 lg:px-10">
        {DEMO && (
          <Kart className="flex flex-col gap-2 p-4">
            <label htmlFor="persona" className="text-sm font-semibold">Demo: kimin gözünden bakıyorsun?</label>
            <select id="persona" value={ben?.id ?? ""} className="secim w-full"
              onChange={(e) => { demoKisiSec(e.target.value); demoSec(e.target.value); }}>
              {kisiler.map((k) => (
                <option key={k.id} value={k.id}>{k.ad}{k.saat_dilimi !== TR ? ` (${sehir(k.saat_dilimi)})` : ""}</option>
              ))}
            </select>
            <span className="text-xs text-soluk">
              {kisiler.some((k) => k.ad === "Can Yıldız")
                ? "Berlin'deki eğitmeni görmek için Can Yıldız'ı, ana eğitmen araçları (iptal) için Fabric'in ana eğitmeni Elif Şahin'i seç. Veriler uydurmadır;"
                : "Programdaki herhangi bir eğitmeni seçebilirsin. İptal gibi yönetim araçlarını denemek için \"Yönetici (demo)\"yu seç;"}
              {" "}yaptığın iptaller yalnızca bu tarayıcıda görünür.
            </span>
          </Kart>
        )}

        {bakis && (
          <Kart className="flex flex-col gap-2 p-4">
            <label htmlFor="bakis" className="text-sm font-semibold">Yönetici: kimin gözünden bakıyorsun?</label>
            <select id="bakis" value={ben?.id ?? ""} className="secim w-full"
              onChange={(e) => bakis.sec(kisiler.find((k) => k.id === e.target.value)?.ad === bakis.gercekAd ? null : e.target.value)}>
              {kisiler.map((k) => (
                <option key={k.id} value={k.id}>{k.ad}{k.ad === bakis.gercekAd ? " (sen)" : ""}</option>
              ))}
            </select>
            <span className="text-xs text-soluk">Seçtiğin kişinin Bugün, Takvim ve Değişenler ekranlarını onun gördüğü gibi görürsün. Yalnızca görüntüdür; iptal gibi işlemler yine senin adınla kaydedilir.</span>
          </Kart>
        )}

        {ben && (
          <Kart className="divide-y divide-cizgi px-4">
            <Satir etiket="Ad">{ben.ad}</Satir>
            <Satir etiket="E-posta">{ben.eposta}</Satir>
            <Satir etiket="Saat dilimi">{tz === TR ? "Türkiye (TR)" : `${sehir(tz)} · saatler TR ile birlikte gösterilir`}</Satir>
            {anaBootcamplar.length > 0 && <Satir etiket="Ana eğitmen">{anaBootcamplar.join(", ")}</Satir>}
          </Kart>
        )}

        {ben && !bakis?.aktif && <Abonelik kisiId={ben.id} />}

        {bakis && !bakis.aktif && <SheetsBaglantisi />}

        <Kart className="flex items-center justify-between gap-3 p-4 text-sm">
          <span className="text-soluk">Program son güncelleme</span>
          <span className="font-semibold">{sonGuncelleme ? gorece(sonGuncelleme) : "—"}</span>
        </Kart>

        {!DEMO && (
          <button onClick={cikis} className="h-12 rounded-2xl border border-[#D9CDC6] bg-white text-sm font-semibold">Çıkış yap</button>
        )}
      </div>
      <div className="flex justify-center pb-4 pt-8 lg:justify-start lg:px-10"><ALab /></div>
    </>
  );
}

function Satir({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-3 text-sm">
      <span className="text-soluk">{etiket}</span>
      <span className="min-w-0 break-words font-medium">{children}</span>
    </div>
  );
}

function Abonelik({ kisiId }: { kisiId: string }) {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const token = useQuery({ queryKey: ["token", kisiId], queryFn: () => api.takvimToken(kisiId) });
  const [kopyalandi, setKopyalandi] = useState(false);
  const https = token.data ? api.icsAdresi(token.data) : "";
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(https);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      /* pano izni yoksa kullanıcı metni elle seçer */
    }
  }
  async function yenile() {
    if (!confirm("Eski link çalışmayı bırakır; takviminize yeni linki tekrar eklemeniz gerekir. Devam edilsin mi?")) return;
    qc.setQueryData(["token", kisiId], await api.tokenYenile());
  }

  return (
    <section className="flex flex-col gap-3 rounded-buyuk bg-yesil p-5 text-white">
      <div className="flex items-center gap-2">
        <Ikon ad="abone" />
        <h2 className="font-baslik text-lg font-bold">Takvimine bağla</h2>
      </div>
      <p className="text-[13px] leading-relaxed text-yesil-yazi">
        Oturumların Google, Apple ya da Outlook takvimine abonelik olarak eklenir. İptaller ve yeni seanslar kendiliğinden yansır.
      </p>
      {DEMO && <p className="rounded-xl bg-yesil-acik px-3 py-2 text-xs text-yesil-yazi">Demo sürümünde abonelik linki çalışmaz.</p>}
      {token.data && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={google} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-[14px] bg-white text-sm font-bold text-yesil">Google Takvim'e ekle</a>
            <a href={webcal} className="flex h-11 items-center justify-center rounded-[14px] border border-yesil-cizgi text-sm font-semibold">Apple / Outlook'ta aç</a>
          </div>
          <div className="flex gap-2">
            <input readOnly value={https} aria-label="Abonelik linki" onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl bg-yesil-acik px-3 py-2 font-mono text-xs text-white" />
            <button onClick={kopyala} className="shrink-0 rounded-xl bg-yesil-acik px-3 text-xs font-semibold">{kopyalandi ? "Kopyalandı" : "Kopyala"}</button>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-yesil-soluk">
            <span>Link sana özel, paylaşma.</span>
            <button onClick={yenile} className="font-semibold text-mercan-zemin underline">Link sızdıysa yenile</button>
          </div>
        </>
      )}
    </section>
  );
}

/** Yönetici: Google Sheets şablonunun bağlantı anahtarı ve son senkron. Anahtar yalnızca üretildiği anda görünür. */
function SheetsBaglantisi() {
  const { api } = useBaglam();
  const qc = useQueryClient();
  const durum = useQuery({ queryKey: ["senkron"], queryFn: api.senkronDurumu, refetchInterval: 60_000 });
  const [anahtar, setAnahtar] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [kopyalandi, setKopyalandi] = useState<string | null>(null);
  const d = durum.data;
  const adres = api.senkronAdresi();

  async function uret() {
    if (d?.anahtar_var && !confirm("Yeni anahtar üretilince eski anahtar çalışmaz; şablondaki betiğe yenisini girmek gerekir. Devam edilsin mi?")) return;
    setBekliyor(true);
    try {
      setAnahtar(await api.senkronAnahtariOlustur());
      qc.invalidateQueries({ queryKey: ["senkron"] });
    } finally {
      setBekliyor(false);
    }
  }
  async function kopyala(metin: string, ne: string) {
    try { await navigator.clipboard.writeText(metin); setKopyalandi(ne); setTimeout(() => setKopyalandi(null), 2000); } catch { /* elle seçilebilir */ }
  }

  return (
    <Kart className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Google Sheets bağlantısı</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${d?.son_senkron ? "bg-nane text-nane-koyu" : "bg-cizgi text-soluk"}`}>
          {d?.son_senkron ? `Son senkron ${gorece(d.son_senkron)}` : "Henüz senkron yok"}
        </span>
      </div>
      {d?.son_ozet && (
        <span className="text-xs text-soluk">
          Son gönderim: {d.son_ozet.yeni} yeni, {d.son_ozet.guncellenen} güncellenen, {d.son_ozet.kalkan} kalkan
          {d.son_ozet.hata_sayisi ? `, ${d.son_ozet.hata_sayisi} hatalı satır (şablondaki Senkron sekmesinde)` : ""}.
        </span>
      )}
      {anahtar ? (
        <div className="flex flex-col gap-2 rounded-xl bg-mercan-acik p-3">
          <span className="text-xs font-semibold text-mercan-koyu">Bu anahtar yalnızca şimdi görünür. Şablonda Mentor Map → Bağlantıyı kur menüsüne yapıştır; başka yerde paylaşma.</span>
          <div className="flex gap-2">
            <input readOnly value={anahtar} aria-label="Bağlantı anahtarı" onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1.5 font-mono text-[11px]" />
            <button onClick={() => kopyala(anahtar, "anahtar")} className="shrink-0 rounded-lg bg-white px-3 text-xs font-semibold">
              {kopyalandi === "anahtar" ? "Kopyalandı" : "Kopyala"}</button>
          </div>
        </div>
      ) : (
        <button onClick={uret} disabled={bekliyor}
          className="h-10 rounded-xl border border-[#D9CDC6] text-[13px] font-semibold disabled:opacity-60">
          {d?.anahtar_var ? "Yeni anahtar üret (eskisi geçersiz olur)" : "Bağlantı anahtarı üret"}
        </button>
      )}
      {adres && (
        <button onClick={() => kopyala(adres, "adres")} className="self-start text-xs font-semibold underline">
          {kopyalandi === "adres" ? "Adres kopyalandı" : "Senkron adresini kopyala"}
        </button>
      )}
    </Kart>
  );
}
