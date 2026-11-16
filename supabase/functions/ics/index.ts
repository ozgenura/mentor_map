// Takvim aboneliği: GET /functions/v1/ics/<token>.ics
// Takvim uygulamaları giriş yapamaz; bu yüzden JWT doğrulaması kapalıdır (config.toml) ve
// koruma, kişiye özel tahmin edilemez token'dan gelir. Token yönetici ya da kişi tarafından yenilenir.

import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { buildCalendar, type IcsOturum } from "../_shared/ics.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });

  const token = new URL(req.url).pathname.split("/").pop()?.replace(/\.ics$/, "") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("Not Found", { status: 404 });

  // Tek RPC: kişinin anlattığı oturumlar + asistan / PO olduğu bootcamp'ler; şablondan kalkanlar iptal olarak.
  const { data, error } = await db.rpc("takvim_oturumlari", { p_token: token });
  if (error) return new Response("Sunucu hatası", { status: 500 });
  if (!data) return new Response("Not Found", { status: 404 });
  const { ad, oturumlar } = data as { ad: string; oturumlar: IcsOturum[] };

  const body = buildCalendar(ad, oturumlar);
  return new Response(req.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mentor-map.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
});
