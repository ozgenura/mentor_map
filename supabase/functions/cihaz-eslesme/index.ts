// Cihaz eşleme: girişli bir cihazda üretilen kodla (Profil → Bu cihazdan başka cihaza giriş) e-postasız giriş.
//   POST { kod } -> { token_hash }  — istemci supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) ile oturum açar.
// Kod 10 dakika geçerli ve tek kullanımlık; hatalı denemeler veritabanında sayılır (30 hata / 15 dk sonra durur).
// generateLink e-posta göndermez; yalnızca tek kullanımlık giriş anahtarı üretir.

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const IZINLI = ["https://mentor-map.oac.workers.dev", "http://localhost:5173"];

Deno.serve(async (req) => {
  const koken = req.headers.get("origin") ?? "";
  const cors = {
    "access-control-allow-origin": IZINLI.includes(koken) ? koken : IZINLI[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
    "vary": "origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ hata: "Yalnızca POST" }, 405);

  let kod = "";
  try { kod = String((await req.json()).kod ?? "").slice(0, 32); } catch { return json({ hata: "Kod eksik" }, 400); }
  const { data: eposta, error } = await db.rpc("cihaz_kodu_kullan", { p_kod: kod });
  if (error) {
    if (error.message.includes("KILITLI")) return json({ hata: "Çok fazla hatalı deneme. 15 dakika sonra tekrar dene." }, 429);
    return json({ hata: "Sunucu hatası" }, 500);
  }
  if (!eposta) return json({ hata: "Kod hatalı ya da süresi dolmuş. Diğer cihazda yeni kod al." }, 400);

  const { data, error: e2 } = await db.auth.admin.generateLink({ type: "magiclink", email: eposta as string });
  if (e2 || !data?.properties?.hashed_token) return json({ hata: "Giriş anahtarı üretilemedi" }, 500);
  return json({ token_hash: data.properties.hashed_token });
});
