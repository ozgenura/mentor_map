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

export async function cikis() {
  if (supabase) await supabase.auth.signOut();
}
