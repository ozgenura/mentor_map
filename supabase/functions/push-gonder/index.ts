// Anlık bildirim göndericisi. pg_cron her dakika çağırır (X-Mentormap-Cron başlığı = PUSH_CRON_ANAHTARI).
//   1) push_hatirlatmalari(): ~1 saat sonra başlayacak derslerin hatırlatmalarını kuyruğa ekler (isteyenlere)
//   2) push_bekleyenler(): gönderilecekleri alır (sessiz saatlerde yalnızca acil olanlar)
//   3) Web Push (VAPID) ile her cihaza gönderir; 404/410 dönen cihaz kaydı silinir
//   4) push_sonuc(): gönderilenleri işaretler
// Gizli anahtarlar: VAPID_PUBLIC, VAPID_PRIVATE, PUSH_CRON_ANAHTARI (Edge Function secret).

import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails("mailto:bildirim@mentor-map.invalid", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

type Abonelik = { endpoint: string; p256dh: string; auth: string };
type Bekleyen = { id: number; baslik: string; govde: string; url: string; abonelikler: Abonelik[] | null };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function esit(a: string, b: string) {
  if (a.length !== b.length) return false;
  let f = 0;
  for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}

Deno.serve(async (req) => {
  const beklenen = Deno.env.get("PUSH_CRON_ANAHTARI") ?? "";
  if (req.method !== "POST" || !beklenen || !esit(req.headers.get("x-mentormap-cron") ?? "", beklenen)) {
    return json({ hata: "yetkisiz" }, 401);
  }
  await db.rpc("push_hatirlatmalari");
  const { data, error } = await db.rpc("push_bekleyenler", { p_limit: 200 });
  if (error) return json({ hata: error.message }, 500);

  const gonderilen: number[] = [], olu: string[] = [], hatalar: Record<string, string> = {};
  await Promise.all((data as Bekleyen[]).map(async (b) => {
    const yuk = JSON.stringify({ baslik: b.baslik, govde: b.govde, url: b.url, etiket: `mm-${b.id}` });
    for (const s of b.abonelikler ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, yuk,
          { TTL: 60 * 60 * 12, urgency: "high" });
      } catch (e) {
        const kod = (e as { statusCode?: number }).statusCode;
        if (kod === 404 || kod === 410) olu.push(s.endpoint);
        else hatalar[String(b.id)] = `${kod ?? ""} ${(e as Error).message}`.slice(0, 200);
      }
    }
    gonderilen.push(b.id);
  }));
  if (gonderilen.length) {
    const { error: e2 } = await db.rpc("push_sonuc", { p_gonderilen: gonderilen, p_olu_endpointler: olu, p_hatalar: hatalar });
    if (e2) return json({ hata: e2.message }, 500);
  }
  return json({ gonderilen: gonderilen.length, silinen_cihaz: olu.length });
});
