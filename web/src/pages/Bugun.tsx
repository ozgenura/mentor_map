import { useMemo } from "react";
import { SayfaUstu } from "../components/Kabuk";
import { Baslik, BootcampEtiketi, Bos, Ikon, Kart, Rozet, Sayac, Segment } from "../components/ui";
import { gosterim, useBaglam, type SaatModu } from "../lib/baglam";
import { bitMs, haftaGunleri, haftaOzeti, kalan, saatMetni, siradaki, siraliOturumlar, guvenliLink } from "../lib/derive";
import { cakismaKarti, degisiklikKarti } from "../lib/degisiklik";
import { bugunTR, gunBasligi, gunEkle, haftaBasi, sehir, TR } from "../lib/time";
import type { Oturum } from "../lib/types";
import { HaritaSeridi } from "../components/HaritaSeridi";

const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const AY_KISA = ["OCA", "ŞUB", "MAR", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİ", "KAS", "ARA"];

export function SaatSecici() {
  const { tz, saatModu, setSaatModu } = useBaglam();
  if (tz === TR) return null;
  return (
    <Segment<SaatModu> etiket="Saat gösterimi" deger={saatModu} onDegis={setSaatModu}
      secenekler={[["tr", "TR saati"], ["yerel", `${sehir(tz)} saati`]]} />
  );
}

export function Bugun() {
  const b = useBaglam();
  const { ben, benimler, tum, tz, saatModu } = b;
  const kaynak = ben ? benimler : tum;
  const sira = siradaki(kaynak);
  const ozet = haftaOzeti(kaynak);
  const sonrakiOzet = haftaOzeti(kaynak, gunEkle(haftaBasi(bugunTR()), 7));
  const yaklasan = siraliOturumlar(kaynak).filter((o) => o.id !== sira?.id && bitMs(o) > Date.now()).slice(0, 5);
  const ilkAd = ben?.ad.split(" ")[0];

  const kartlar = useMemo(() => {
    const byId = new Map(tum.map((o) => [o.id, o]));
    const yeni = b.degisiklikler.filter((d) => Date.parse(d.olusturma) > b.sonGorulme)
      .map((d) => degisiklikKarti(d, d.oturum_id ? byId.get(d.oturum_id) : undefined, tz, saatModu));
    const gelecekCakisma = b.cakismalar.filter((c) => c.a.tarih >= bugunTR()).map((c) => cakismaKarti(c, tz, saatModu));
    return [...gelecekCakisma, ...yeni];
  }, [b.degisiklikler, b.cakismalar, b.sonGorulme, tum, tz, saatModu]);

  const baslik = ben
    ? <>Merhaba {ilkAd}.<br />{ozet.adet ? `Bu hafta ${ozet.adet} oturumun var.` : "Bu hafta oturumun yok."}</>
    : <>Merhaba.<br />Programda bu hafta {ozet.adet} oturum var.</>;

  return (
    <>
      <SayfaUstu ust={gunBasligi(bugunTR())} baslik={baslik} sag={<div className="hidden lg:block"><SaatSecici /></div>} />
      <div className="px-5 pt-4 lg:hidden"><SaatSecici /></div>

      <div className="mt-4 grid gap-6 px-3 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:px-10">
        <div className="flex flex-col gap-6 lg:order-2">
          {sira ? <SiradakiKart o={sira} /> : <Bos>Yaklaşan oturum yok.</Bos>}
          <HaritaSeridi />
          <section className="flex flex-col gap-2.5 px-2 lg:px-0">
            <Baslik sag={<button onClick={() => b.git("degisenler")} className="text-[13px] font-semibold underline">Tümü</button>}>
              Son girişinden beri <Sayac n={kartlar.length} />
            </Baslik>
            {kartlar.length ? (
              <Kart className="divide-y divide-cizgi">
                {kartlar.slice(0, 3).map((k) => (
                  <button key={k.anahtar} onClick={() => k.oturum && b.sec(k.oturum)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
                      k.rozet === "yeni" ? "bg-nane text-nane-koyu" : k.rozet === "saat" ? "bg-mavi text-mavi-koyu" : k.rozet === "gri" ? "bg-cizgi" : "bg-mercan-acik text-mercan-yazi"}`}>
                      <Ikon ad={k.rozet === "yeni" ? "arti" : k.rozet === "saat" ? "saat" : k.rozet === "iptal" ? "iptal" : "uyari"} boyut={18} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold">{k.baslik}</span>
                      <span className="truncate text-xs text-soluk">{k.eski ? `${k.eski} → ${k.yeni}` : k.alt}{k.zaman ? ` · ${k.zaman}` : ""}</span>
                    </span>
                  </button>
                ))}
              </Kart>
            ) : <Bos>Son girişinden beri değişiklik yok.</Bos>}
          </section>
        </div>

        <div className="flex flex-col gap-6 px-2 lg:order-1 lg:px-0">
          <section className="flex flex-col gap-2.5">
            <Baslik sag={<span className="text-[13px] text-soluk">{ozet.adet} oturum · {saatMetni(ozet.saat)}</span>}>Bu hafta</Baslik>
            <HaftaSeridi oturumlar={kaynak} />
            <span className="text-[13px] text-soluk">Gelecek hafta: {sonrakiOzet.adet} oturum · {saatMetni(sonrakiOzet.saat)}</span>
          </section>

          <section className="flex flex-col gap-2.5">
            <Baslik sag={<button onClick={() => b.git("takvim")} className="text-[13px] font-semibold underline">Takvim</button>}>Yaklaşan</Baslik>
            {yaklasan.length ? (
              <div className="flex flex-col gap-2">
                {yaklasan.map((o) => <YaklasanSatir key={o.id} o={o} />)}
              </div>
            ) : <Bos>Başka yaklaşan oturum yok.</Bos>}
          </section>
        </div>
      </div>
    </>
  );
}

function SiradakiKart({ o }: { o: Oturum }) {
  const { tz, saatModu, sec, ben } = useBaglam();
  const g = gosterim(o, tz, saatModu);
  const k = kalan(o);
  const digerleri = o.anlaticilar.filter((a) => a.kisi_id !== ben?.id).map((a) => a.ad);
  const kim = ben && o.anlaticilar.some((a) => a.kisi_id === ben.id)
    ? ["Sen", ...digerleri].join(" + ")
    : o.anlaticilar.map((a) => a.ad).join(", ") || "Eğitmen atanmamış";
  return (
    <div className="flex flex-col gap-3.5 rounded-buyuk bg-yesil p-5 text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-mercan-zemin px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-mercan-koyu">
          {k === "Şimdi" ? "Şu an sürüyor" : `Sıradaki · ${k}`}
        </span>
        <span className="text-xs font-semibold text-yesil-soluk">{o.kisa_kod} · {o.tur}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-baslik text-[44px] font-bold leading-none tracking-tighter tabular-nums">{g.ana ?? "Saat belirsiz"}</span>
        <span className="text-[13px] text-yesil-soluk">{g.ana ? `${g.birim} saati` : ""}{g.ikincil ? ` · ${g.ikincil}` : ""}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-baslik text-[21px] font-semibold leading-tight tracking-tight">{o.konu || o.tur}</span>
        <span className="text-[13px] text-yesil-soluk">{gunBasligi(o.tarih)} · {kim}</span>
      </div>
      <div className={`grid gap-2 ${o.toplanti_linki ? "grid-cols-2" : "grid-cols-1"}`}>
        {o.toplanti_linki && (
          <a href={guvenliLink(o.toplanti_linki) ?? undefined} target="_blank" rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-white text-sm font-bold text-yesil">
            <Ikon ad="video" boyut={18} /> Toplantıya katıl
          </a>
        )}
        <button onClick={() => sec(o)} className="h-12 rounded-[14px] border border-yesil-cizgi text-sm font-semibold">
          Detay ve materyal
        </button>
      </div>
    </div>
  );
}

function HaftaSeridi({ oturumlar }: { oturumlar: Oturum[] }) {
  const { git } = useBaglam();
  const gunler = haftaGunleri(oturumlar);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {gunler.map((g, i) => (
        <button key={g.tarih} onClick={() => git("takvim")} title={g.tatil}
          className={`flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-2xl ${
            g.bugun ? "bg-yesil text-white" : g.tatil ? "border border-dashed border-[#D9CDC6] text-silik" : "bg-white"}`}>
          <span className="text-[11px] font-semibold opacity-75">{g.tatil ? "Tatil" : GUN_KISA[i]}</span>
          <span className="font-baslik text-lg font-bold">{Number(g.tarih.slice(8))}</span>
          <span className="flex h-1.5 gap-0.5">
            {g.renkler.map((r) => <span key={r} className="h-1.5 w-1.5 rounded-full" style={{ background: r }} />)}
          </span>
        </button>
      ))}
    </div>
  );
}

function YaklasanSatir({ o }: { o: Oturum }) {
  const { tz, saatModu, sec, cakisanlar } = useBaglam();
  const g = gosterim(o, tz, saatModu);
  const iptal = o.durum === "iptal";
  const d = new Date(`${o.tarih}T12:00:00Z`);
  return (
    <button onClick={() => sec(o)} className="flex w-full items-center gap-3.5 rounded-[18px] bg-white px-3.5 py-3 text-left">
      <span className="flex w-11 shrink-0 flex-col items-center">
        <span className="text-[11px] font-bold tracking-wider text-soluk">{AY_KISA[d.getUTCMonth()]}</span>
        <span className="font-baslik text-2xl font-bold leading-none">{String(d.getUTCDate()).padStart(2, "0")}</span>
        <span className="text-[11px] text-soluk">{GUN_KISA[(d.getUTCDay() + 6) % 7]}</span>
      </span>
      <span className="w-px self-stretch bg-cizgi" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`font-baslik text-[15px] font-bold tabular-nums ${iptal ? "text-silik line-through" : ""}`}>
          {g.ana ? `${g.ana} ${g.birim}` : "Saat belirsiz"}
        </span>
        <span className={`truncate text-sm font-medium ${iptal ? "text-silik line-through" : ""}`}>{o.konu || o.tur}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <BootcampEtiketi kod={o.kisa_kod} renk={o.renk} />
          <span className="text-xs text-soluk">{o.tur}</span>
          {iptal && <Rozet tur="iptal">İptal</Rozet>}
          {!iptal && cakisanlar.has(o.id) && <Rozet tur="cakisma">Çakışma</Rozet>}
        </span>
      </span>
    </button>
  );
}
