-- Faz 0 düzeltmeleri.
--  MM-01  Şablondan kalkan oturum: arayüz varsayılan olarak göstermez (istemci süzer), takvim aboneliğinde
--         iptal olarak çıkar ki takvim uygulamaları düşürsün.
--  MM-03  Görünüm, oturumun kendi linkini ve bootcamp'in varsayılan linkini ayrıca verir; formlar ham değeri düzenler.
--  MM-05  Yan seans gece yarısını geçebilir: bitiş başlangıçtan küçük ya da eşitse ertesi gün; en çok 12 saat.
--  MM-04 / MM-19 / MM-44  Takvim aboneliği tek RPC'den gelir; asistan ve PO'nun bootcamp'leri de girer.
--  MM-17  Takvim linkini yalnızca sahibi görür; yönetici yenileyebilir ama yeni linki göremez.

-- ---------------------------------------------------------------- MM-03
create or replace view public.oturum_gorunumu with (security_invoker = true) as
select o.id, o.bootcamp_id, b.ad as bootcamp_ad, b.kisa_kod, b.renk,
       o.tarih, o.baslangic, o.bitis, o.slot, o.tur, o.konu, o.aciklama,
       coalesce(nullif(btrim(o.toplanti_linki), ''), b.varsayilan_toplanti_linki) as toplanti_linki,
       o.materyal_linki, o.notlar, o.durum, o.iptal_gerekcesi, o.iptal_zamani, o.kaynak,
       o.uyarilar, o.excelden_kalkti, o.guncelleme, o.surum,
       coalesce((
         select jsonb_agg(jsonb_build_object('kisi_id', a.kisi_id, 'ad', coalesce(k.ad, a.konuk_ad),
                                             'rol', a.rol)
                          order by a.rol, coalesce(k.ad, a.konuk_ad))
         from public.oturum_anlaticilari a
         left join public.kisiler k on k.id = a.kisi_id
         where a.oturum_id = o.id), '[]'::jsonb) as anlaticilar,
       nullif(btrim(o.toplanti_linki), '') as oturum_toplanti_linki,
       b.varsayilan_toplanti_linki
from public.oturumlar o
join public.bootcamp b on b.id = o.bootcamp_id;

-- ---------------------------------------------------------------- MM-05
-- TR tarih + saatler -> [başlangıç, bitiş]. Bitiş başlangıçtan küçük ya da eşitse ertesi gün sayılır
-- (senkrondaki kuralın aynısı); süre 12 saati aşarsa reddedilir.
create or replace function public._seans_araligi(p_tarih date, p_baslangic time, p_bitis time,
                                                 out baslangic timestamptz, out bitis timestamptz)
language plpgsql immutable set search_path = '' as $$
begin
  baslangic := public.tr_zaman(p_tarih, p_baslangic);
  bitis := public.tr_zaman(p_tarih, p_bitis);
  if bitis <= baslangic then bitis := bitis + interval '1 day'; end if;
  if bitis - baslangic > interval '12 hours' then
    raise exception 'seans en çok 12 saat sürebilir' using errcode = '22023';
  end if;
end $$;

create or replace function public.yan_seans_ekle(
  p_bootcamp_id uuid, p_tarih date, p_baslangic time, p_bitis time, p_konu text,
  p_anlaticilar jsonb, p_tur public.oturum_turu default 'Yan Seans', p_aciklama text default null,
  p_toplanti_linki text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_bas timestamptz;
  v_bit timestamptz;
begin
  if not public.ana_egitmen_mi(p_bootcamp_id) then
    raise exception 'bu bootcamp için seans ekleme yetkiniz yok' using errcode = '42501';
  end if;
  select a.baslangic, a.bitis into v_bas, v_bit from public._seans_araligi(p_tarih, p_baslangic, p_bitis) a;
  if btrim(coalesce(p_konu, '')) = '' then raise exception 'konu zorunlu' using errcode = '22023'; end if;
  insert into public.oturumlar (bootcamp_id, tarih, baslangic, bitis, slot, tur, konu, aciklama,
                                toplanti_linki, kaynak, olusturan)
  values (p_bootcamp_id, p_tarih, v_bas, v_bit, 'yan-seans', p_tur, btrim(p_konu),
          nullif(btrim(p_aciklama), ''), nullif(btrim(p_toplanti_linki), ''), 'uygulama',
          public.mevcut_kisi_id())
  returning id into v_id;
  perform public._anlaticilari_yaz(v_id, p_anlaticilar);
  perform public.bildirim_kuyruga_ekle(v_id, 'yan_seans_eklendi');
  return v_id;
end $$;

create or replace function public.yan_seans_guncelle(
  p_oturum_id uuid, p_tarih date, p_baslangic time, p_bitis time, p_konu text,
  p_anlaticilar jsonb, p_tur public.oturum_turu default 'Yan Seans', p_aciklama text default null,
  p_toplanti_linki text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.oturumlar;
  v_bas timestamptz;
  v_bit timestamptz;
begin
  select * into v from public.oturumlar where id = p_oturum_id for update;
  if not found then raise exception 'oturum bulunamadı' using errcode = 'P0002'; end if;
  if not public.ana_egitmen_mi(v.bootcamp_id) then
    raise exception 'bu bootcamp için yetkiniz yok' using errcode = '42501';
  end if;
  if v.kaynak <> 'uygulama' then
    raise exception 'resmi oturumun tarih ve saatini yalnızca yönetici değiştirebilir'
      using errcode = '42501';
  end if;
  select a.baslangic, a.bitis into v_bas, v_bit from public._seans_araligi(p_tarih, p_baslangic, p_bitis) a;
  update public.oturumlar
     set tarih = p_tarih, baslangic = v_bas, bitis = v_bit, tur = p_tur, konu = btrim(p_konu),
         aciklama = nullif(btrim(p_aciklama), ''), toplanti_linki = nullif(btrim(p_toplanti_linki), '')
   where id = p_oturum_id;
  perform public._anlaticilari_yaz(p_oturum_id, p_anlaticilar);
  perform public.bildirim_kuyruga_ekle(p_oturum_id, 'yan_seans_degisti');
end $$;

-- ---------------------------------------------------------------- MM-04 / MM-19 / MM-44 / MM-01
-- Takvim aboneliği: token'ın sahibinin anlattığı oturumlar + asistan ya da PO olduğu bootcamp'lerin tüm oturumları,
-- son 120 günden itibaren. Şablondan kalkan oturum iptal olarak döner (takvim uygulaması düşürür).
-- Yalnızca Edge Function (service_role) çağırır; istemciye kapalı.
create or replace function public.takvim_oturumlari(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with sahip as (
    select k.id, k.ad from public.takvim_tokenlari t
    join public.kisiler k on k.id = t.kisi_id and k.aktif
    where t.token = p_token
  ),
  secili as (
    select a.oturum_id as id from public.oturum_anlaticilari a, sahip where a.kisi_id = sahip.id
    union
    select o.id from public.oturumlar o
    join public.bootcamp_yetkilileri y on y.bootcamp_id = o.bootcamp_id and y.yetki in ('asistan', 'po')
    join sahip on sahip.id = y.kisi_id
  )
  select case when not exists (select 1 from sahip) then null else jsonb_build_object(
    'ad', (select ad from sahip),
    'oturumlar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'bootcamp_ad', g.bootcamp_ad, 'kisa_kod', g.kisa_kod, 'tarih', g.tarih,
               'baslangic', g.baslangic, 'bitis', g.bitis, 'tur', g.tur, 'konu', g.konu,
               'aciklama', g.aciklama, 'toplanti_linki', g.toplanti_linki, 'materyal_linki', g.materyal_linki,
               'durum', case when g.excelden_kalkti then 'iptal' else g.durum::text end,
               'iptal_gerekcesi', case when g.excelden_kalkti then 'Programdan kaldırıldı' else g.iptal_gerekcesi end,
               'surum', g.surum, 'guncelleme', g.guncelleme, 'anlaticilar', g.anlaticilar)
             order by g.tarih, g.baslangic)
      from public.oturum_gorunumu g
      where g.id in (select id from secili)
        and g.tarih >= (now() at time zone 'Europe/Istanbul')::date - 120), '[]'::jsonb))
  end
$$;
revoke execute on function public.takvim_oturumlari(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.takvim_oturumlari(text) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------- MM-17
drop policy if exists kendi_tokeni on public.takvim_tokenlari;
create policy kendi_tokeni on public.takvim_tokenlari for select to authenticated
  using (kisi_id = public.mevcut_kisi_id());

create or replace function public.takvim_token_yenile(p_kisi_id uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_kisi uuid := coalesce(p_kisi_id, public.mevcut_kisi_id());
  v_token text;
begin
  if v_kisi is null or (v_kisi <> public.mevcut_kisi_id() and not public.yonetici_mi()) then
    raise exception 'yetki yok' using errcode = '42501';
  end if;
  update public.takvim_tokenlari
     set token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
         olusturma = now()
   where kisi_id = v_kisi
  returning token into v_token;
  -- Yönetici başkasının linkini yenileyebilir (sızdıysa) ama yeni linki göremez.
  return case when v_kisi = public.mevcut_kisi_id() then v_token end;
end $$;
