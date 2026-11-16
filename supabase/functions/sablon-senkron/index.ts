// Kurum program şablonundaki Apps Script'in çağırdığı uç.
//   POST /functions/v1/sablon-senkron            -> sablon_senkron(p): içe aktarma ya da önizleme
//   GET  /functions/v1/sablon-senkron?korumalar  -> sekme korumaları için PO ve yönetici e-postaları
// Kimlik: X-Mentormap-Anahtar (yöneticinin uygulamada ürettiği şablon anahtarı) ve X-Mentormap-Tablo
// (e-tablo kimliği; anahtar ilk kullanımda ona bağlanır). JWT doğrulaması kapalıdır (config.toml).

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const AZAMI_BOYUT = 4_000_000;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ hata: "Yalnızca GET ve POST" }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > AZAMI_BOYUT) return json({ hata: "Gönderilen veri çok büyük" }, 413);

  const anahtar = req.headers.get("x-mentormap-anahtar") ?? "";
  if (!/^[0-9a-f]{64}$/.test(anahtar)) return json({ hata: "Anahtar eksik ya da hatalı" }, 401);
  const tablo = (req.headers.get("x-mentormap-tablo") ?? "").slice(0, 200) || null;
  const { data: sonuc, error: e1 } = await db.rpc("sablon_anahtari_denetle", { p_anahtar: anahtar, p_e_tablo: tablo });
  if (e1) return json({ hata: "Sunucu hatası" }, 500);
  if (sonuc === "kilitli") return json({ hata: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin." }, 429);
  if (sonuc === "baska_tablo") return json({ hata: "Bu anahtar başka bir e-tabloya bağlı. Yönetici yeni anahtar üretmeli." }, 403);
  if (sonuc !== "tamam") return json({ hata: "Anahtar geçersiz. Yönetici yeni anahtar üretmiş olabilir." }, 401);

  if (req.method === "GET") {
    const { data, error } = await db.rpc("sablon_korumalari");
    if (error) return json({ hata: "Sunucu hatası" }, 500);
    return json(data);
  }

  const govde = await req.text();
  if (govde.length > AZAMI_BOYUT) return json({ hata: "Gönderilen veri çok büyük" }, 413);
  let veri: unknown;
  try {
    veri = JSON.parse(govde);
  } catch {
    return json({ hata: "Geçersiz JSON" }, 400);
  }
  if (typeof veri !== "object" || veri === null || Array.isArray(veri)) return json({ hata: "Geçersiz veri" }, 400);

  const { data, error } = await db.rpc("sablon_senkron", { p: veri });
  if (error) {
    const m = error.message;
    if (m.includes("ONAY_GEREKLI")) return json({ onay_gerekli: true, hata: m.replace(/^.*ONAY_GEREKLI:\s*/, "") }, 409);
    if (m.includes("GONDEREN_TANINMADI")) return json({ hata: m.replace(/^.*GONDEREN_TANINMADI:\s*/, "") }, 403);
    console.error("sablon_senkron", m);
    return json({ hata: "İçe aktarılamadı: " + m }, 422);
  }
  return json({ tamam: true, sonuc: data });
});
