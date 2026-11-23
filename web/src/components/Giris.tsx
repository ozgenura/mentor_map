import { useState } from "react";
import { supabase } from "../lib/api";
import { ALab, Logo } from "./ui";

/** E-postadaki giriş bağlantısından tek kullanımlık anahtar (token_hash) ve türü. Bağlantı değilse null. */
export function baglantidanAnahtar(metin: string): { token_hash: string; type: "magiclink" | "signup" | "invite" | "email" } | null {
  const m = metin.trim().match(/https?:\/\/\S+/);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    const token = u.searchParams.get("token") ?? u.searchParams.get("token_hash");
    if (!token) return null;
    const t = u.searchParams.get("type");
    return { token_hash: token, type: t === "signup" || t === "invite" || t === "email" ? t : "magiclink" };
  } catch {
    return null;
  }
}

function hataMesaji(m: string): string {
  if (/kayıtlı değil|signups not allowed|user not found|before user created/i.test(m)) return "Bu e-posta Mentor Map'te kayıtlı değil. Yöneticiye yaz.";
  if (/expired|invalid/i.test(m)) return "Kod hatalı ya da süresi dolmuş. Yeni kod iste.";
  if (/rate limit|too many/i.test(m)) return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.";
  return "Bir sorun oluştu. Tekrar dene.";
}

export function Giris() {
  const [eposta, setEposta] = useState("");
  const [kod, setKod] = useState("");
  const [adim, setAdim] = useState<"eposta" | "kod">("eposta");
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function kodGonder(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata(null);
    const { error } = await supabase!.auth.signInWithOtp({ email: eposta.trim(), options: { shouldCreateUser: true, emailRedirectTo: location.origin } });
    setBekliyor(false);
    if (error) setHata(hataMesaji(error.message));
    else setAdim("kod");
  }

  async function dogrula(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true);
    setHata(null);
    // iPhone'da ana ekran uygulaması e-postadaki bağlantıyı açamaz (bağlantı tarayıcıda açılır):
    // bağlantı kopyalanıp buraya yapıştırılırsa içindeki tek kullanımlık anahtarla giriş yapılır.
    const b = baglantidanAnahtar(kod);
    const { error } = b
      ? await supabase!.auth.verifyOtp(b)
      : await supabase!.auth.verifyOtp({ email: eposta.trim(), token: kod.replace(/\D/g, ""), type: "email" });
    setBekliyor(false);
    if (error) setHata(hataMesaji(error.message));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zemin px-5 lg:items-center lg:justify-center">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-10 lg:flex-none">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="font-baslik text-[34px] font-bold leading-[1.05] tracking-tight">Her ders<br />bir durak.</h1>
          <p className="text-sm text-soluk">Eğitmen takvimine e-posta adresinle giriş yap. Şifre yok; e-postana bir giriş bağlantısı ya da 6 haneli kod göndereceğiz.</p>
        </div>
        <form onSubmit={adim === "eposta" ? kodGonder : dogrula} className="flex flex-col gap-3 rounded-buyuk bg-white p-5">
          {adim === "eposta" ? (
            <>
              <label htmlFor="eposta" className="text-sm font-semibold">E-posta adresin</label>
              <input id="eposta" type="email" required autoComplete="email" autoFocus value={eposta}
                onChange={(e) => setEposta(e.target.value)} placeholder="ad.soyad@ornek.com"
                className="h-12 rounded-xl border border-[#D9CDC6] px-3 text-[15px] outline-none focus:border-yesil focus:ring-2 focus:ring-yesil/20" />
            </>
          ) : (
            <>
              <label htmlFor="kod" className="text-sm font-semibold">{eposta} adresine gelen kod ya da bağlantı</label>
              <p className="-mt-1 text-xs text-soluk">
                E-postadaki kodu yaz. Yalnızca bağlantı geldiyse ve uygulamayı ana ekrandan açtıysan: bağlantıya dokunma,
                basılı tutup <strong>Kopyala</strong>, sonra buraya yapıştır.
              </p>
              <input id="kod" autoComplete="one-time-code" required autoFocus autoCapitalize="off" autoCorrect="off" spellCheck={false}
                value={kod} onChange={(e) => setKod(e.target.value)} placeholder="Kod ya da bağlantı"
                className={`h-14 rounded-xl border border-[#D9CDC6] px-3 outline-none focus:border-yesil focus:ring-2 focus:ring-yesil/20 ${
                  /^\s*\d{0,6}\s*$/.test(kod) ? "text-center font-baslik text-2xl tracking-[0.5em]" : "text-sm"}`} />
              <button type="button" onClick={() => { setAdim("eposta"); setKod(""); }} className="self-start text-xs font-semibold underline">
                Farklı e-posta kullan
              </button>
            </>
          )}
          {hata && <p role="alert" className="text-sm text-mercan-yazi">{hata}</p>}
          <button type="submit" disabled={bekliyor} className="mt-1 h-12 rounded-2xl bg-yesil text-sm font-bold text-white disabled:opacity-60">
            {bekliyor ? "Bekle…" : adim === "eposta" ? "Kod gönder" : "Giriş yap"}
          </button>
        </form>
      </div>
      <ALab className="mx-auto pb-6" />
    </div>
  );
}
