// Giriş yapan kişi. Supabase modunda oturumdaki e-posta; demo modunda seçilen kişi.

import { useEffect, useState } from "react";
import { DEMO, supabase } from "./api";

const DEMO_ANAHTAR = "mm-demo-kisi";

export type Kimlik = { yukleniyor: boolean; eposta: string | null; demoKisiId: string | null };

function oku(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function demoKisiSec(id: string) {
  try {
    localStorage.setItem(DEMO_ANAHTAR, id);
  } catch {
    /* tarayıcı depolaması kapalı olabilir */
  }
}

export function useKimlik(): Kimlik {
  const [k, setK] = useState<Kimlik>({ yukleniyor: !DEMO, eposta: null, demoKisiId: DEMO ? oku(DEMO_ANAHTAR) : null });
  useEffect(() => {
    if (DEMO || !supabase) return;
    supabase.auth.getSession().then(({ data }) =>
      setK({ yukleniyor: false, eposta: data.session?.user.email?.toLowerCase() ?? null, demoKisiId: null }),
    );
    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setK({ yukleniyor: false, eposta: s?.user.email?.toLowerCase() ?? null, demoKisiId: null }),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return k;
}

/** Çıkış: oturumu kapatır ve cihazda kalan kişisel veriyi siler (MM-12): çevrimdışı önbellek, mm-* kayıtları. */
export async function cikis() {
  if (supabase) await supabase.auth.signOut();
  try {
    // Uygulama dosyalarının önbelleği kalır; yalnızca program verisinin önbelleği (vite.config.ts) silinir.
    if ("caches" in window) await caches.delete("supabase-rest");
  } catch { /* yoksay */ }
  for (const depo of [localStorage, sessionStorage]) {
    try {
      for (const k of Object.keys(depo)) if (k.startsWith("mm-") || k.startsWith("sb-")) depo.removeItem(k);
    } catch { /* depolama kapalı olabilir */ }
  }
  location.replace(location.pathname); // bellekteki sorgu önbelleği de sıfırlanır
}
