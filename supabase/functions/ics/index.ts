// Takvim aboneliği: GET /functions/v1/ics/<token>.ics
// Takvim uygulamaları giriş yapamaz; bu yüzden JWT doğrulaması kapalıdır (config.toml) ve
// koruma, kişiye özel tahmin edilemez token'dan gelir. Token yönetici ya da kişi tarafından yenilenir.

import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { buildCalendar, type IcsOturum } from "../_shared/ics.ts";

const GECMIS_GUN = 120; // takvimde ne kadar geriye gidilir

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });

  const token = new URL(req.url).pathname.split("/").pop()?.replace(/\.ics$/, "") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("Not Found", { status: 404 });

  const { data: sahip } = await db
    .from("takvim_tokenlari")
    .select("kisi_id, kisiler!inner(ad, aktif)")
    .eq("token", token)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const kisi = (sahip as any)?.kisiler;
  if (!sahip || !kisi?.aktif) return new Response("Not Found", { status: 404 });

  const { data: atamalar, error: e1 } = await db
    .from("oturum_anlaticilari")
    .select("oturum_id")
    .eq("kisi_id", sahip.kisi_id);
  if (e1) return new Response("Sunucu hatası", { status: 500 });

  const baslangic = new Date(Date.now() - GECMIS_GUN * 864e5).toISOString().slice(0, 10);
  const ids = (atamalar ?? []).map((a) => a.oturum_id);
  let oturumlar: IcsOturum[] = [];
  if (ids.length) {
    const { data, error } = await db
      .from("oturum_gorunumu")
      .select("id, bootcamp_ad, kisa_kod, tarih, baslangic, bitis, tur, konu, aciklama, toplanti_linki, " +
        "materyal_linki, durum, iptal_gerekcesi, surum, guncelleme, anlaticilar")
      .in("id", ids)
      .gte("tarih", baslangic)
      .order("tarih");
    if (error) return new Response("Sunucu hatası", { status: 500 });
    oturumlar = (data ?? []) as unknown as IcsOturum[];
  }

  const body = buildCalendar(kisi.ad, oturumlar);
  return new Response(req.method === "HEAD" ? null : body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mentor-map.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
});
