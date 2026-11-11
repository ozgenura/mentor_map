-- Google Sheets şablonundan anlık senkron.
-- Şablondaki Apps Script, Edge Function (sheets-senkron) üzerinden tüm sayfayı gönderir;
-- bu fonksiyon farkı tek transaction'da yazar. Sheets'in sahip olduğu alanlar: bootcamp, tarih, saat, tür, konu,
-- anlatıcılar, kişiler ve bootcamp bilgileri. Uygulamanın sahip olduğu alanlara (iptal, link, not) dokunulmaz.

-- Zoom seviye 1: bootcamp'in varsayılan toplantı linki; oturumda link yoksa bu görünür.
alter table public.bootcamp add column if not exists varsayilan_toplanti_linki text;

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
         where a.oturum_id = o.id), '[]'::jsonb) as anlaticilar
from public.oturumlar o
join public.bootcamp b on b.id = o.bootcamp_id;

grant select on public.oturum_gorunumu to authenticated;

-- Bağlantı anahtarı: yalnızca özeti (sha256) saklanır; düz hali bir kez, oluşturan yöneticiye gösterilir.
create table if not exists public.senkron_anahtari (
  id boolean primary key default true check (id),
  ozet text not null,
  olusturan uuid references public.kisiler (id) on delete set null,
  olusturma timestamptz not null default now(),
  son_kullanim timestamptz
);
alter table public.senkron_anahtari enable row level security;  -- politika yok: istemci okuyamaz

create or replace function public.senkron_anahtari_olustur() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.yonetici_mi() then
    raise exception 'yalnızca yönetici' using errcode = '42501';
  end if;
  insert into public.senkron_anahtari (id, ozet, olusturan)
  values (true, encode(sha256(convert_to(v, 'UTF8')), 'hex'), public.mevcut_kisi_id())
  on conflict (id) do update set ozet = excluded.ozet, olusturan = excluded.olusturan,
                                 olusturma = now(), son_kullanim = null;
  return v;
end $$;

create or replace function public.senkron_anahtari_dogrula(p_anahtar text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.senkron_anahtari set son_kullanim = now()
  where ozet = encode(sha256(convert_to(coalesce(p_anahtar, ''), 'UTF8')), 'hex');
  return found;
end $$;

create or replace function public.senkron_durumu() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.yonetici_mi() then jsonb_build_object(
    'anahtar_var', exists (select 1 from public.senkron_anahtari),
    'anahtar_olusturma', (select olusturma from public.senkron_anahtari),
    'son_senkron', (select max(zaman) from public.ice_aktarimlar where dosya_adi like 'Google Sheets%'),
    'son_ozet', (select ozet from public.ice_aktarimlar where dosya_adi like 'Google Sheets%' order by zaman desc limit 1))
  end
$$;

-- Ad listesi: "Ayşe Kaya, Can Yıldız" -> ['Ayşe Kaya', 'Can Yıldız']
create or replace function public._ad_listesi(p text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}')
  from unnest(string_to_array(replace(coalesce(p, ''), ';', ','), ',')) x
$$;

-- Payload: {"kaynak": "...", "onay": false,
--   "kisiler":     [{"satir": 2, "ad", "eposta", "saat_dilimi", "rol", "aktif", "ana_egitmen"}],
--   "bootcamplar": [{"satir": 2, "kod", "ad", "renk", "zoom"}],
--   "oturumlar":   [{"satir": 2, "id", "bootcamp", "tarih", "baslangic", "bitis", "tur", "konu",
--                    "ana", "yardimci", "konuk"}]}
-- Hatalı satır atlanır ve raporlanır; hatalı satırdaki oturum "kalktı" sayılmaz.
-- Excel kaynaklı oturumların %20'sinden fazlası kalkacaksa, "onay": true gelmeden hiçbir şey yazılmaz.
create or replace function public.sheets_senkron(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r jsonb;
  hatalar jsonb := '[]';
  v_kisi uuid;
  v_bc uuid;
  v_id uuid;
  v_tarih date;
  v_bas time;
  v_bit time;
  v_bas_tz timestamptz;
  v_bit_tz timestamptz;
  v_tur public.oturum_turu;
  v_eski public.oturumlar;
  v_istenen uuid[];
  v_ana uuid;
  v_konuklar text[];
  v_mevcut uuid[];
  v_bildir boolean;
  v_ad text;
  v_gecerli uuid[] := '{}';
  v_kalkan uuid[];
  v_toplam int;
  n_yeni int := 0; n_guncel int := 0; n_kisi int := 0; n_bc int := 0; n_geri int := 0;
  v_mesaj text;
begin
  perform set_config('mentormap.islem_kaynagi', 'ice_aktarim', true);

  -- ---------------------------------------------------------------- bootcamp'ler
  for r in select * from jsonb_array_elements(coalesce(p -> 'bootcamplar', '[]')) loop
    if btrim(coalesce(r ->> 'kod', '')) = '' or btrim(coalesce(r ->> 'ad', '')) = '' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir', 'mesaj', 'Kod ve ad zorunlu');
      continue;
    end if;
    begin
      insert into public.bootcamp (kisa_kod, ad, renk, varsayilan_toplanti_linki)
      values (btrim(r ->> 'kod'), btrim(r ->> 'ad'),
              coalesce(nullif(btrim(r ->> 'renk'), ''), '#6366f1'), nullif(btrim(r ->> 'zoom'), ''))
      on conflict (kisa_kod) do update
        set ad = excluded.ad, renk = excluded.renk, varsayilan_toplanti_linki = excluded.varsayilan_toplanti_linki
        where (public.bootcamp.ad, public.bootcamp.renk, public.bootcamp.varsayilan_toplanti_linki)
              is distinct from (excluded.ad, excluded.renk, excluded.varsayilan_toplanti_linki);
      if found then n_bc := n_bc + 1; end if;
    exception when unique_violation then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                                               'mesaj', 'Bu ad başka bir bootcamp''te kullanılıyor');
    end;
  end loop;

  -- ---------------------------------------------------------------- kişiler (anahtar: ad)
  for r in select * from jsonb_array_elements(coalesce(p -> 'kisiler', '[]')) loop
    v_ad := btrim(coalesce(r ->> 'ad', ''));
    if v_ad = '' or coalesce(r ->> 'eposta', '') not like '%_@_%' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir', 'mesaj', 'Ad ve geçerli bir e-posta zorunlu');
      continue;
    end if;
    v_kisi := null;
    begin
      insert into public.kisiler (ad, eposta, saat_dilimi, rol, aktif)
      values (v_ad, lower(btrim(r ->> 'eposta')),
              coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
              case when lower(coalesce(r ->> 'rol', '')) like 'y%' then 'yonetici' else 'egitmen' end::public.rol,
              coalesce((r ->> 'aktif')::boolean, true))
      on conflict (ad) do update
        set eposta = excluded.eposta, saat_dilimi = excluded.saat_dilimi, rol = excluded.rol, aktif = excluded.aktif
        where (public.kisiler.eposta, public.kisiler.saat_dilimi, public.kisiler.rol, public.kisiler.aktif)
              is distinct from (excluded.eposta, excluded.saat_dilimi, excluded.rol, excluded.aktif)
      returning id into v_kisi;
      if v_kisi is not null then n_kisi := n_kisi + 1; end if;
    exception
      when unique_violation then
        hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir', 'mesaj', 'Bu e-posta başka bir kişide kayıtlı');
      when invalid_text_representation then
        hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir', 'mesaj', 'Aktif sütunu EVET ya da HAYIR olmalı');
    end;
  end loop;

  -- ana eğitmen yetkileri sayfadakiyle eşitlenir
  if jsonb_array_length(coalesce(p -> 'kisiler', '[]')) > 0 then
    delete from public.bootcamp_yetkilileri y
    where not exists (
      select 1 from jsonb_array_elements(p -> 'kisiler') r2
      join public.kisiler k on k.ad = btrim(r2 ->> 'ad')
      join public.bootcamp b on b.kisa_kod = any (public._ad_listesi(r2 ->> 'ana_egitmen'))
      where k.id = y.kisi_id and b.id = y.bootcamp_id);
    insert into public.bootcamp_yetkilileri (bootcamp_id, kisi_id)
    select b.id, k.id
    from jsonb_array_elements(p -> 'kisiler') r2
    join public.kisiler k on k.ad = btrim(r2 ->> 'ad')
    join public.bootcamp b on b.kisa_kod = any (public._ad_listesi(r2 ->> 'ana_egitmen'))
    on conflict do nothing;
  end if;

  -- ---------------------------------------------------------------- oturumlar
  for r in select * from jsonb_array_elements(coalesce(p -> 'oturumlar', '[]')) loop
    begin
      v_mesaj := null;
      v_id := nullif(btrim(coalesce(r ->> 'id', '')), '')::uuid;
      if v_id is null then v_mesaj := 'ID boş (betik doldurur; satırı silip yeniden ekleyin)'; end if;
      select id into v_bc from public.bootcamp where kisa_kod = btrim(coalesce(r ->> 'bootcamp', ''));
      if v_mesaj is null and v_bc is null then v_mesaj := 'Bootcamp kodu Bootcamp''ler sekmesinde yok'; end if;
      v_tarih := nullif(btrim(coalesce(r ->> 'tarih', '')), '')::date;
      if v_mesaj is null and v_tarih is null then v_mesaj := 'Tarih zorunlu (YYYY-AA-GG)'; end if;
      v_bas := nullif(btrim(coalesce(r ->> 'baslangic', '')), '')::time;
      v_bit := nullif(btrim(coalesce(r ->> 'bitis', '')), '')::time;
      if v_mesaj is null and (v_bas is null) <> (v_bit is null) then
        v_mesaj := 'Başlangıç ve bitiş birlikte girilmeli ya da ikisi de boş kalmalı';
      end if;
      v_tur := coalesce(nullif(btrim(coalesce(r ->> 'tur', '')), ''), 'Ders')::public.oturum_turu;
    exception
      when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
        v_mesaj := 'Tarih, saat, ID ya da tür biçimi hatalı';
    end;

    -- anlatıcılar: ana + yardımcılar kişi olmalı
    v_istenen := '{}';
    v_ana := null;
    if v_mesaj is null then
      foreach v_ad in array public._ad_listesi(r ->> 'ana') || public._ad_listesi(r ->> 'yardimci') loop
        select id into v_kisi from public.kisiler where ad = v_ad;
        if v_kisi is null then
          v_mesaj := format('"%s" Kişiler sekmesinde yok (dışarıdan biriyse Konuk sütununa yazın)', v_ad);
          exit;
        end if;
        if v_ana is null then v_ana := v_kisi; end if;
        if not v_kisi = any (v_istenen) then v_istenen := v_istenen || v_kisi; end if;
      end loop;
    end if;

    if v_mesaj is not null then
      hatalar := hatalar || jsonb_build_object('sekme', 'Oturumlar', 'satir', r -> 'satir', 'mesaj', v_mesaj);
      if v_id is not null then v_gecerli := v_gecerli || v_id; end if;  -- hatalı satır "kalktı" sayılmaz
      continue;
    end if;
    v_gecerli := v_gecerli || v_id;
    v_konuklar := public._ad_listesi(r ->> 'konuk');

    v_bas_tz := case when v_bas is not null then public.tr_zaman(v_tarih, v_bas) end;
    v_bit_tz := case when v_bit is not null then public.tr_zaman(v_tarih, v_bit) end;
    if v_bit_tz is not null and v_bit_tz <= v_bas_tz then v_bit_tz := v_bit_tz + interval '1 day'; end if;

    v_eski := null;
    select * into v_eski from public.oturumlar where id = v_id for update;
    if not found then
      insert into public.oturumlar (id, bootcamp_id, tarih, baslangic, bitis, tur, konu, kaynak, dis_anahtar, kaynak_hucre)
      values (v_id, v_bc, v_tarih, v_bas_tz, v_bit_tz, v_tur, btrim(coalesce(r ->> 'konu', '')), 'excel',
              'sheet:' || v_id, 'Oturumlar!' || (r ->> 'satir'));
      n_yeni := n_yeni + 1;
    elsif v_eski.kaynak = 'uygulama' then
      continue;  -- uygulamada eklenen yan seans: şablonda görünse de sahibi uygulama
    else
      update public.oturumlar
         set bootcamp_id = v_bc, tarih = v_tarih, baslangic = v_bas_tz, bitis = v_bit_tz, tur = v_tur,
             konu = btrim(coalesce(r ->> 'konu', '')), excelden_kalkti = false,
             kaynak_hucre = 'Oturumlar!' || (r ->> 'satir'),
             uyarilar = '{}'
       where id = v_id
         and (bootcamp_id, tarih, baslangic, bitis, tur, konu, excelden_kalkti, uyarilar)
             is distinct from (v_bc, v_tarih, v_bas_tz, v_bit_tz, v_tur, btrim(coalesce(r ->> 'konu', '')), false, '{}'::text[]);
      if found then
        if v_eski.excelden_kalkti then n_geri := n_geri + 1; else n_guncel := n_guncel + 1; end if;
      end if;
    end if;

    -- anlatıcı farkı; bildirim yalnızca mevcut oturumda ve dünden sonraki tarihlerde
    v_bildir := v_eski.id is not null and v_tarih >= (now() at time zone 'Europe/Istanbul')::date - 1;
    select coalesce(array_agg(a.kisi_id), '{}') into v_mevcut
      from public.oturum_anlaticilari a where a.oturum_id = v_id and a.kisi_id is not null;
    delete from public.oturum_anlaticilari
     where oturum_id = v_id and kisi_id is not null and not kisi_id = any (v_istenen);
    if v_bildir then
      insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
      select k, 'atamadan_cikarildin', v_id from unnest(v_mevcut) k where not k = any (v_istenen);
      insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
      select k, 'atandin', v_id from unnest(v_istenen) k where not k = any (v_mevcut);
    end if;
    foreach v_kisi in array v_istenen loop
      insert into public.oturum_anlaticilari (oturum_id, kisi_id, rol)
      values (v_id, v_kisi, case when v_kisi = v_ana then 'ana' else 'yardimci' end::public.anlatici_rolu)
      on conflict (oturum_id, kisi_id) where kisi_id is not null
        do update set rol = excluded.rol where public.oturum_anlaticilari.rol <> excluded.rol;
    end loop;
    delete from public.oturum_anlaticilari
     where oturum_id = v_id and kisi_id is null and not (konuk_ad = any (v_konuklar));
    insert into public.oturum_anlaticilari (oturum_id, konuk_ad, rol)
    select v_id, k, 'konuk' from unnest(v_konuklar) k
    where not exists (select 1 from public.oturum_anlaticilari a
                      where a.oturum_id = v_id and a.kisi_id is null and a.konuk_ad = k);
  end loop;

  -- ---------------------------------------------------------------- şablondan kalkanlar
  select count(*) into v_toplam from public.oturumlar where kaynak = 'excel' and not excelden_kalkti;
  select coalesce(array_agg(id), '{}') into v_kalkan from public.oturumlar
   where kaynak = 'excel' and not excelden_kalkti and not id = any (v_gecerli);
  if cardinality(v_kalkan) > greatest(3, v_toplam * 0.2) and not coalesce((p ->> 'onay')::boolean, false) then
    raise exception using errcode = 'P0001',
      message = format('ONAY_GEREKLI: %s oturum şablonda yok (%s oturumun %%%s''i). Yanlışlıkla silinmediyse "Büyük değişikliği onayla" ile gönderin.',
                       cardinality(v_kalkan), v_toplam, round(100.0 * cardinality(v_kalkan) / greatest(v_toplam, 1)));
  end if;
  update public.oturumlar set excelden_kalkti = true where id = any (v_kalkan);

  r := jsonb_build_object('yeni', n_yeni, 'guncellenen', n_guncel, 'geri_gelen', n_geri,
                          'kalkan', cardinality(v_kalkan), 'kisi', n_kisi, 'bootcamp', n_bc,
                          'hata_sayisi', jsonb_array_length(hatalar), 'hatalar', hatalar);
  insert into public.ice_aktarimlar (dosya_adi, ozet)
  values ('Google Sheets: ' || coalesce(p ->> 'kaynak', 'şablon'), r);
  return r;
end $$;

revoke execute on function public.sheets_senkron(jsonb) from public, anon, authenticated;
revoke execute on function public.senkron_anahtari_dogrula(text) from public, anon, authenticated;
revoke execute on function public._ad_listesi(text) from public, anon;
grant execute on function public.senkron_anahtari_olustur(), public.senkron_durumu() to authenticated;
revoke execute on function public.senkron_anahtari_olustur(), public.senkron_durumu() from public, anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.sheets_senkron(jsonb), public.senkron_anahtari_dogrula(text) to service_role';
  end if;
end $$;
