// Google Sheets şablonundaki Apps Script'in çağırdığı senkron ucu: POST /functions/v1/sheets-senkron
// Kimlik: X-Mentormap-Anahtar başlığı (yöneticinin uygulamada ürettiği anahtar; veritabanında yalnızca özeti durur).
// JWT doğrulaması kapalıdır (config.toml); anahtar olmadan hiçbir şey yazılmaz.

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const AZAMI_BOYUT = 2_000_000; // ~2 MB: binlerce satır için yeterli
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ hata: "Yalnızca POST" }, 405);

  const anahtar = req.headers.get("x-mentormap-anahtar") ?? "";
  if (!/^[0-9a-f]{64}$/.test(anahtar)) return json({ hata: "Anahtar eksik ya da hatalı" }, 401);
  const { data: gecerli, error: e1 } = await db.rpc("senkron_anahtari_dogrula", { p_anahtar: anahtar });
  if (e1) return json({ hata: "Sunucu hatası" }, 500);
  if (!gecerli) return json({ hata: "Anahtar geçersiz. Uygulamada yönetici yeni anahtar üretmiş olabilir." }, 401);

  const govde = await req.text();
  if (govde.length > AZAMI_BOYUT) return json({ hata: "Gönderilen veri çok büyük" }, 413);
  let veri: unknown;
  try {
    veri = JSON.parse(govde);
  } catch {
    return json({ hata: "Geçersiz JSON" }, 400);
  }
  if (typeof veri !== "object" || veri === null || Array.isArray(veri)) return json({ hata: "Geçersiz veri" }, 400);

  const { data, error } = await db.rpc("sheets_senkron", { p: veri });
  if (error) {
    if (error.message.includes("ONAY_GEREKLI")) {
      return json({ onay_gerekli: true, hata: error.message.replace(/^.*ONAY_GEREKLI:\s*/, "") }, 409);
    }
    console.error("sheets_senkron", error.message);
    return json({ hata: "Senkron yazılamadı: " + error.message }, 422);
  }
  return json({ tamam: true, ozet: data });
});
