-- Aşama C (MM-56/57/58): iki yönlü senkron.
-- * PO şablondan gelen oturumun tarihini, saatini, türünü, konusunu ve eğitmenlerini uygulamadan düzenler.
-- * Şablon gönderiminde her alan tabana (son gönderimdeki şablon satırı) göre birleştirilir:
--   yalnızca şablonda değişen şablondan, yalnızca uygulamada değişen korunur ve şablona geri yazılır,
--   ikisinde farklı değişen çakışma olur (oturum değişmez; PO ya da yönetici çözer).

create table if not exists public.sablon_cakismalari (
  id bigint generated always as identity primary key,
  oturum_id uuid not null references public.oturumlar (id) on delete cascade,
  alan text not null check (alan in ('zaman', 'tur', 'konu', 'egitmenler')),
  sablon jsonb not null,            -- şablondaki değer (uygulamak için)
  sablon_metni text not null,
  uygulama_metni text not null,
  olusturma timestamptz not null default now(),
  cozum text check (cozum in ('sablon', 'uygulama', 'otomatik')),
  cozen uuid references public.kisiler (id),
  cozum_zamani timestamptz
);
create unique index if not exists sablon_cakismalari_acik on public.sablon_cakismalari (oturum_id, alan) where cozum is null;
alter table public.sablon_cakismalari enable row level security;
drop policy if exists okuma on public.sablon_cakismalari;
create policy okuma on public.sablon_cakismalari for select to authenticated
  using (public.ana_egitmen_mi((select o.bootcamp_id from public.oturumlar o where o.id = oturum_id)));
revoke all on public.sablon_cakismalari from anon, authenticated;
grant select on public.sablon_cakismalari to authenticated;

-- ------------------------------------------------------------ karşılaştırma biçimleri (şablon ↔ veritabanı)
create or replace function public._saat_k(p text) returns text
language sql immutable set search_path = '' as $$
  select case when nullif(btrim(coalesce(p, '')), '') is null then ''
              else replace(to_char(btrim(p)::time, 'HH24:MI'), '24:00', '00:00') end
$$;

create or replace function public._sablon_zaman_k(r jsonb) returns text
language sql immutable set search_path = '' as $$
  select btrim(coalesce(r ->> 'tarih', '')) || ' ' || public._saat_k(r ->> 'baslangic') || '-' || public._saat_k(r ->> 'bitis')
$$;

create or replace function public._oturum_zaman_k(p_tarih date, p_bas timestamptz, p_bit timestamptz) returns text
language sql stable set search_path = '' as $$
  select p_tarih::text || ' ' || coalesce(to_char(p_bas at time zone 'Europe/Istanbul', 'HH24:MI'), '') || '-'
         || coalesce(to_char(p_bit at time zone 'Europe/Istanbul', 'HH24:MI'), '')
$$;

create or replace function public._saat_metni(p_bas timestamptz, p_bit timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p_bas is null then '' else to_char(p_bas at time zone 'Europe/Istanbul', 'HH24:MI') || '–'
              || coalesce(to_char(p_bit at time zone 'Europe/Istanbul', 'HH24:MI'), '') end
$$;

create or replace function public._zaman_metni(p_tarih date, p_bas timestamptz, p_bit timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_tarih, 'DD.MM.YYYY') || case when p_bas is null then '' else ' · ' || public._saat_metni(p_bas, p_bit) end
$$;

-- eğitmenler: kayıtlı kişi kimliği ya da "konuk:Ad"; sırasız küme olarak karşılaştırılır
create or replace function public._sablon_egitmen_k(r jsonb) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x order by x), '{}') from (
    select coalesce(public._kisi_ad_ile(a)::text, 'konuk:' || a) x
      from unnest(public._ad_listesi(array_to_string(array(select jsonb_array_elements_text(coalesce(r -> 'egitmenler', '[]'))), ','))) a
    union all
    select 'konuk:' || a
      from unnest(public._ad_listesi(array_to_string(array(select jsonb_array_elements_text(coalesce(r -> 'konuklar', '[]'))), ','))) a
  ) t
$$;

create or replace function public._oturum_egitmen_k(p_oturum uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct coalesce(a.kisi_id::text, 'konuk:' || a.konuk_ad)
                            order by coalesce(a.kisi_id::text, 'konuk:' || a.konuk_ad)), '{}')
    from public.oturum_anlaticilari a where a.oturum_id = p_oturum
$$;

create or replace function public._sablon_egitmen_metni(r jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(r -> 'egitmenler', '[]')))
                  || array(select jsonb_array_elements_text(coalesce(r -> 'konuklar', '[]'))), ', '), ''), '(boş)')
$$;

create or replace function public._oturum_egitmen_metni(p_oturum uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(coalesce(k.ad, a.konuk_ad), ', ' order by a.rol, coalesce(k.ad, a.konuk_ad)), '(boş)')
    from public.oturum_anlaticilari a left join public.kisiler k on k.id = a.kisi_id where a.oturum_id = p_oturum
$$;

-- şablona geri yazılacak eğitmen hücreleri: kayıtlılar (ana önce) ve konuklar ayrı
create or replace function public._oturum_egitmen_hucre(p_oturum uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'egitmenler', coalesce((select string_agg(k.ad, ', ' order by a.rol, k.ad) from public.oturum_anlaticilari a
                             join public.kisiler k on k.id = a.kisi_id where a.oturum_id = p_oturum), ''),
    'konuklar', coalesce((select string_agg(a.konuk_ad, ', ' order by a.konuk_ad) from public.oturum_anlaticilari a
                           where a.oturum_id = p_oturum and a.kisi_id is null), ''))
$$;

-- Bir alanı birleştirir. Döner: true = şablondaki değer alınsın; false = uygulamadaki kalsın.
-- Çakışmada kayıt açar (aynı alan için açık kayıt varsa günceller); çakışma kalktıysa açık kaydı kapatır.
create or replace function public._alan_birlestir(p_oturum uuid, p_alan text, a jsonb, b jsonb, t jsonb,
                                                  p_sablon jsonb, p_sablon_metni text, p_uygulama_metni text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if t is not distinct from b then           -- şablonda değişiklik yok
    if a is not distinct from b then
      update public.sablon_cakismalari set cozum = 'otomatik', cozum_zamani = now()
       where oturum_id = p_oturum and alan = p_alan and cozum is null;
    end if;
    return false;
  end if;
  if a is not distinct from b or a is not distinct from t then   -- yalnızca şablonda değişti ya da aynı değere
    update public.sablon_cakismalari set cozum = 'otomatik', cozum_zamani = now()
     where oturum_id = p_oturum and alan = p_alan and cozum is null;
    return true;
  end if;
  insert into public.sablon_cakismalari (oturum_id, alan, sablon, sablon_metni, uygulama_metni)
  values (p_oturum, p_alan, p_sablon, p_sablon_metni, p_uygulama_metni)
  on conflict (oturum_id, alan) where cozum is null
    do update set sablon = excluded.sablon, sablon_metni = excluded.sablon_metni,
                  uygulama_metni = excluded.uygulama_metni, olusturma = now();
  return false;
end $$;

-- ------------------------------------------------------------ eğitmenleri yaz + atama bildirimleri
create or replace function public._egitmenleri_degistir(p_oturum uuid, p_anlaticilar jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_onceki uuid[]; v_sonraki uuid[]; v_tarih date;
begin
  select coalesce(array_agg(kisi_id), '{}') into v_onceki from public.oturum_anlaticilari
   where oturum_id = p_oturum and kisi_id is not null;
  perform public._anlaticilari_yaz(p_oturum, p_anlaticilar);
  select coalesce(array_agg(kisi_id), '{}') into v_sonraki from public.oturum_anlaticilari
   where oturum_id = p_oturum and kisi_id is not null;
  select tarih into v_tarih from public.oturumlar where id = p_oturum;
  if v_tarih >= (now() at time zone 'Europe/Istanbul')::date - 1 then
    insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
    select k, 'atamadan_cikarildin', p_oturum from unnest(v_onceki) k where not k = any (v_sonraki);
    insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
    select k, 'atandin', p_oturum from unnest(v_sonraki) k where not k = any (v_onceki);
  end if;
end $$;

-- ------------------------------------------------------------ uygulamadan program düzenleme (PO ve yönetici)
create or replace function public.oturum_programi_guncelle(
  p_oturum_id uuid, p_tarih date, p_baslangic time, p_bitis time, p_tur public.oturum_turu, p_konu text,
  p_anlaticilar jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.oturumlar; v_bas timestamptz; v_bit timestamptz;
begin
  select * into v from public.oturumlar where id = p_oturum_id for update;
  if not found then raise exception 'oturum bulunamadı' using errcode = 'P0002'; end if;
  if not public.ana_egitmen_mi(v.bootcamp_id) then
    raise exception 'bu bootcamp için yetkiniz yok' using errcode = '42501';
  end if;
  if v.kaynak = 'excel' then
    raise exception 'bu program Mentor Map Program sayfasından yönetiliyor; değişikliği orada yapın' using errcode = '42501';
  end if;
  if v.kaynak <> 'sablon' then
    raise exception 'eklenen seans seans formundan düzenlenir' using errcode = '22023';
  end if;
  if public.donem_tamamlandi_mi(v.donem_id) then
    raise exception 'tamamlanmış dönemin oturumu değiştirilemez' using errcode = '22023';
  end if;
  if btrim(coalesce(p_konu, '')) = '' then raise exception 'konu zorunlu' using errcode = '22023'; end if;
  if p_baslangic is not null then
    select a.baslangic, a.bitis into v_bas, v_bit from public._seans_araligi(p_tarih, p_baslangic, p_bitis) a;
  end if;
  update public.oturumlar set tarih = p_tarih, baslangic = v_bas, bitis = v_bit, tur = p_tur, konu = btrim(p_konu)
   where id = p_oturum_id
     and (tarih, baslangic, bitis, tur, konu) is distinct from (p_tarih, v_bas, v_bit, p_tur, btrim(p_konu));
  if public._oturum_egitmen_k(p_oturum_id) is distinct from (
       select coalesce(array_agg(distinct x order by x), '{}') from (
         select coalesce(e ->> 'kisi_id', 'konuk:' || btrim(e ->> 'konuk_ad')) x from jsonb_array_elements(p_anlaticilar) e) t) then
    perform public._egitmenleri_degistir(p_oturum_id, p_anlaticilar);
  end if;
end $$;

-- ------------------------------------------------------------ çakışma çözme
create or replace function public.sablon_cakisma_coz(p_id bigint, p_secim text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.sablon_cakismalari; v public.oturumlar; v_bas timestamptz; v_bit timestamptz; v_liste jsonb := '[]'; v_ad text;
begin
  select * into c from public.sablon_cakismalari where id = p_id and cozum is null for update;
  if not found then raise exception 'çakışma bulunamadı ya da çözülmüş' using errcode = 'P0002'; end if;
  select * into v from public.oturumlar where id = c.oturum_id for update;
  if not public.ana_egitmen_mi(v.bootcamp_id) then
    raise exception 'bu bootcamp için yetkiniz yok' using errcode = '42501';
  end if;
  if p_secim not in ('sablon', 'uygulama') then raise exception 'seçim sablon ya da uygulama olmalı' using errcode = '22023'; end if;
  if p_secim = 'sablon' then
    if c.alan = 'zaman' then
      if nullif(c.sablon ->> 'baslangic', '') is not null then
        select a.baslangic, a.bitis into v_bas, v_bit
          from public._seans_araligi((c.sablon ->> 'tarih')::date, (c.sablon ->> 'baslangic')::time, (c.sablon ->> 'bitis')::time) a;
      end if;
      update public.oturumlar set tarih = (c.sablon ->> 'tarih')::date, baslangic = v_bas, bitis = v_bit where id = v.id;
    elsif c.alan = 'tur' then
      update public.oturumlar set tur = (c.sablon #>> '{}')::public.oturum_turu where id = v.id;
    elsif c.alan = 'konu' then
      update public.oturumlar set konu = c.sablon #>> '{}' where id = v.id;
    else
      foreach v_ad in array public._ad_listesi(array_to_string(array(select jsonb_array_elements_text(c.sablon -> 'egitmenler')), ',')) loop
        v_liste := v_liste || case when public._kisi_ad_ile(v_ad) is not null
                                   then jsonb_build_object('kisi_id', public._kisi_ad_ile(v_ad))
                                   else jsonb_build_object('konuk_ad', v_ad) end;
      end loop;
      foreach v_ad in array public._ad_listesi(array_to_string(array(select jsonb_array_elements_text(c.sablon -> 'konuklar')), ',')) loop
        v_liste := v_liste || jsonb_build_object('konuk_ad', v_ad);
      end loop;
      if jsonb_array_length(v_liste) = 0 then
        delete from public.oturum_anlaticilari where oturum_id = v.id;
      else
        perform public._egitmenleri_degistir(v.id, v_liste);
      end if;
    end if;
  end if;
  -- "uygulama": oturum olduğu gibi kalır; sonraki gönderimde şablona geri yazılır
  update public.sablon_cakismalari set cozum = p_secim, cozen = public.mevcut_kisi_id(), cozum_zamani = now() where id = p_id;
end $$;

revoke execute on function public._alan_birlestir(uuid, text, jsonb, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public._egitmenleri_degistir(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._sablon_egitmen_k(jsonb) from public, anon, authenticated;
revoke execute on function public._oturum_egitmen_k(uuid) from public, anon, authenticated;
revoke execute on function public._oturum_egitmen_metni(uuid) from public, anon, authenticated;
revoke execute on function public._oturum_egitmen_hucre(uuid) from public, anon, authenticated;
revoke execute on function public.oturum_programi_guncelle(uuid, date, time, time, public.oturum_turu, text, jsonb) from public, anon;
grant execute on function public.oturum_programi_guncelle(uuid, date, time, time, public.oturum_turu, text, jsonb) to authenticated;
revoke execute on function public.sablon_cakisma_coz(bigint, text) from public, anon;
grant execute on function public.sablon_cakisma_coz(bigint, text) to authenticated;

create or replace function public.sablon_senkron(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s jsonb;
  r jsonb;
  v_gonderen uuid := public._kisi_eposta_ile(p ->> 'gonderen');
  v_yonetici boolean;
  v_bc uuid;
  v_dn record;
  v_donem uuid;
  v_genel boolean;
  v_id uuid;
  v_hedef uuid;
  v_eski public.oturumlar;
  v_tarih date;
  v_bas time;
  v_bit time;
  v_bas_tz timestamptz;
  v_bit_tz timestamptz;
  v_tur public.oturum_turu;
  v_mesaj text;
  v_ad text;
  v_kisi uuid;
  v_istenen uuid[];
  v_ana uuid;
  v_konuklar text[];
  v_mevcut uuid[];
  v_tum_ids uuid[];
  v_donemler uuid[] := '{}';
  v_kalkan uuid[];
  v_toplam int;
  v_kayan int;
  v_var int;
  v_sekme_ozet jsonb;
  ozet jsonb := '[]';
  hatalar jsonb := '[]';
  eslesmeyen jsonb := '[]';
  kimlikler jsonb := '[]';
  durumlar jsonb := '[]';
  ekler jsonb := '[]';
  geri jsonb := '[]';
  n_yeni int; n_guncel int; n_devir int; n_cakisma int;
  v_al_zaman boolean; v_al_tur boolean; v_al_konu boolean; v_al_egt boolean;
  e_tarih date; e_bas timestamptz; e_bit timestamptz; e_tur public.oturum_turu; e_konu text;
  v_geri jsonb;
  sonuc jsonb;
  v_onizleme boolean := coalesce((p ->> 'onizleme')::boolean, false);
begin
  perform pg_advisory_xact_lock(hashtext('public.sablon_senkron'));
  perform set_config('mentormap.islem_kaynagi', 'ice_aktarim', true);
  if v_gonderen is null then
    raise exception using errcode = 'P0001', message = format(
      'GONDEREN_TANINMADI: %s Mentor Map''te kayıtlı değil. Yöneticiden Google hesabınızı kişinize eklemesini isteyin.',
      coalesce(nullif(p ->> 'gonderen', ''), 'Gönderen hesap'));
  end if;
  select k.rol = 'yonetici' into v_yonetici from public.kisiler k where k.id = v_gonderen;

  begin  -- önizlemede bu blok geri alınır
    for s in select * from jsonb_array_elements(coalesce(p -> 'sekmeler', '[]')) loop
      n_yeni := 0; n_guncel := 0; n_devir := 0; n_cakisma := 0;
      v_genel := coalesce((s ->> 'genel')::boolean, false);
      select id into v_bc from public.bootcamp where kisa_kod = btrim(coalesce(s ->> 'kod', ''));
      if v_bc is null then
        hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'mesaj',
                     format('"%s" kodlu bootcamp Mentor Map''te yok', s ->> 'kod'));
        continue;
      end if;
      -- Genel herkesin planıdır: herhangi bir bootcamp'in PO'su gönderebilir. Diğer sekmeleri yalnızca kendi PO'su.
      if not v_yonetici and not exists (select 1 from public.bootcamp_yetkilileri
                                        where kisi_id = v_gonderen and yetki = 'po'
                                          and (bootcamp_id = v_bc or btrim(coalesce(s ->> 'kod', '')) = 'Genel')) then
        hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'mesaj',
                     'Bu sekmeyi göndermeye yetkiniz yok (yalnızca bootcamp''in PO''su ve yönetici)');
        continue;
      end if;

      if v_genel then
        select guncel_donem_id into v_donem from public.bootcamp where id = v_bc;
      else
        select * into v_dn from public._donem_ayarla(v_bc, s ->> 'donem');
        if v_dn.hata is not null then
          hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'satir', 3, 'mesaj', v_dn.hata);
          continue;
        end if;
        v_donem := v_dn.donem_id;
        if public.donem_tamamlandi_mi(v_donem) then
          hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'mesaj',
                       format('%s dönemi tamamlandı; şablondan değiştirilemez', s ->> 'donem'));
          continue;
        end if;
        -- Dönemin linkleri (B5 Zoom, B6 Materyal): eski betik anahtarı göndermez, o zaman dokunulmaz.
        if s ? 'zoom' then
          if public.guvenli_link(nullif(btrim(s ->> 'zoom'), '')) then
            update public.donem set zoom_linki = nullif(btrim(s ->> 'zoom'), '') where id = v_donem;
          else
            hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'satir', 5,
                         'mesaj', 'Zoom linki https:// ile başlamalı ve boşluk içermemeli; link kaydedilmedi');
          end if;
        end if;
        if s ? 'materyal' then
          if public.guvenli_link(nullif(btrim(s ->> 'materyal'), '')) then
            update public.donem set materyal_linki = nullif(btrim(s ->> 'materyal'), '') where id = v_donem;
          else
            hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'satir', 6,
                         'mesaj', 'Materyal linki https:// ile başlamalı ve boşluk içermemeli; link kaydedilmedi');
          end if;
        end if;
      end if;

      -- MM-51: numara artırılmadan tarihler toplu kaydı mı?
      select count(*), count(*) filter (where abs(o.tarih - (x ->> 'tarih')::date) > 21)
        into v_var, v_kayan
        from jsonb_array_elements(coalesce(s -> 'oturumlar', '[]')) x
        join public.oturumlar o on o.id = nullif(x ->> 'id', '')::uuid and o.donem_id = v_donem
       where coalesce(x ->> 'tarih', '') ~ '^\d{4}-\d{2}-\d{2}$';
      if v_var >= 3 and v_kayan * 2 > v_var and not coalesce((p ->> 'onay')::boolean, false) then
        raise exception using errcode = 'P0001', message = format(
          'ONAY_GEREKLI: %s sekmesinde %s oturumun %s''i 3 haftadan fazla kaydırılmış ama dönem aynı (%s). Yeni dönem başlıyorsa önce Dönem numarasını artırın; bilerek kaydırdıysanız onaylayarak gönderin.',
          s ->> 'sekme', v_var, v_kayan, s ->> 'donem');
      end if;

      v_donemler := v_donemler || v_donem;
      v_tum_ids := '{}';
      for r in select * from jsonb_array_elements(coalesce(s -> 'oturumlar', '[]')) loop
        v_mesaj := null;
        begin
          v_id := nullif(btrim(coalesce(r ->> 'id', '')), '')::uuid;
          if v_id is null then v_mesaj := 'Kimlik boş (betik doldurur; tekrar gönderin)'; end if;
          v_tarih := nullif(btrim(coalesce(r ->> 'tarih', '')), '')::date;
          if v_mesaj is null and v_tarih is null then v_mesaj := 'Tarih zorunlu (YYYY-AA-GG)'; end if;
          v_bas := nullif(btrim(coalesce(r ->> 'baslangic', '')), '')::time;
          v_bit := nullif(btrim(coalesce(r ->> 'bitis', '')), '')::time;
          v_tur := coalesce(nullif(btrim(coalesce(r ->> 'tur', '')), ''), 'Ders')::public.oturum_turu;
        exception
          when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
            v_mesaj := 'Tarih, saat ya da tür biçimi hatalı';
        end;
        if v_mesaj is not null then
          hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'satir', r -> 'satir', 'grup', r -> 'grup', 'mesaj', v_mesaj);
          if v_id is not null then v_tum_ids := v_tum_ids || v_id; end if;  -- hatalı satır "kalktı" sayılmaz
          continue;
        end if;
        v_bas_tz := case when v_bas is not null then public.tr_zaman(v_tarih, v_bas) end;
        v_bit_tz := case when v_bit is not null then public.tr_zaman(v_tarih, v_bit) end;
        if v_bit_tz is not null and v_bit_tz <= v_bas_tz then v_bit_tz := v_bit_tz + interval '1 day'; end if;

        -- anlatıcılar: ilk ad ana, diğerleri yardımcı; eşleşmeyen ad konuk (MM-53)
        v_istenen := '{}'; v_ana := null; v_konuklar := public._ad_listesi(array_to_string(
          array(select jsonb_array_elements_text(coalesce(r -> 'konuklar', '[]'))), ','));
        foreach v_ad in array public._ad_listesi(array_to_string(
            array(select jsonb_array_elements_text(coalesce(r -> 'egitmenler', '[]'))), ',')) loop
          v_kisi := public._kisi_ad_ile(v_ad);
          if v_kisi is null then
            v_konuklar := v_konuklar || v_ad;
            if not eslesmeyen @> to_jsonb(v_ad) then eslesmeyen := eslesmeyen || to_jsonb(v_ad); end if;
          else
            if v_ana is null then v_ana := v_kisi; end if;
            if not v_kisi = any (v_istenen) then v_istenen := v_istenen || v_kisi; end if;
          end if;
        end loop;

        -- kimlik: şablondaki; yoksa devralınacak Map oturumu
        v_hedef := v_id;
        v_eski := null;
        select * into v_eski from public.oturumlar where id = v_id for update;
        if v_eski.id is null then
          select * into v_eski from public.oturumlar o
           where o.bootcamp_id = v_bc and o.donem_id = v_donem and o.kaynak = 'excel'
             and o.tarih = v_tarih and o.baslangic is not distinct from v_bas_tz
             and not o.id = any (v_tum_ids)
           order by o.excelden_kalkti, o.olusturma limit 1 for update;
          if v_eski.id is not null then
            v_hedef := v_eski.id;
            kimlikler := kimlikler || jsonb_build_object('eski', v_id, 'yeni', v_hedef);
            n_devir := n_devir + 1;
          end if;
        elsif v_eski.bootcamp_id <> v_bc then
          hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'satir', r -> 'satir', 'grup', r -> 'grup',
                       'mesaj', 'Bu oturum başka bir bootcamp''e ait (satır kopyalanmış olabilir)');
          v_tum_ids := v_tum_ids || v_id;
          continue;
        elsif v_eski.kaynak = 'uygulama' then
          v_tum_ids := v_tum_ids || v_id;
          continue;
        end if;
        v_tum_ids := v_tum_ids || v_hedef;
        -- Aşama B: uygulamada tutulan alanlar şablona salt okunur geri yazılır (betik "Mentor Map durumu" sütununa)
        if v_eski.id is not null and (v_eski.durum = 'iptal' or nullif(btrim(v_eski.toplanti_linki), '') is not null
                                      or nullif(btrim(v_eski.materyal_linki), '') is not null) then
          durumlar := durumlar || jsonb_build_object('id', v_id, 'grup', r ->> 'grup', 'iptal', v_eski.durum = 'iptal',
                        'gerekce', v_eski.iptal_gerekcesi, 'link', nullif(btrim(v_eski.toplanti_linki), ''),
                        'materyal', nullif(btrim(v_eski.materyal_linki), ''));
        end if;

        -- Aşama C: alan alan üç yönlü birleştirme (taban = son gönderimdeki şablon satırı).
        -- Yalnızca şablonda değişen alan şablondan; yalnızca uygulamada değişen korunur (ve şablona geri yazılır);
        -- ikisinde farklı değişen çakışmadır (oturum değişmez, PO çözer).
        v_al_zaman := true; v_al_tur := true; v_al_konu := true; v_al_egt := true; v_geri := '{}';
        if v_eski.id is not null and v_eski.kaynak = 'sablon' and v_eski.sablon_tabani is not null then
          v_al_zaman := public._alan_birlestir(v_hedef, 'zaman',
            to_jsonb(public._oturum_zaman_k(v_eski.tarih, v_eski.baslangic, v_eski.bitis)),
            to_jsonb(public._sablon_zaman_k(v_eski.sablon_tabani)), to_jsonb(public._sablon_zaman_k(r)),
            jsonb_build_object('tarih', r ->> 'tarih', 'baslangic', r ->> 'baslangic', 'bitis', r ->> 'bitis'),
            public._zaman_metni(v_tarih, v_bas_tz, v_bit_tz), public._zaman_metni(v_eski.tarih, v_eski.baslangic, v_eski.bitis));
          v_al_tur := public._alan_birlestir(v_hedef, 'tur', to_jsonb(v_eski.tur::text),
            to_jsonb(coalesce(nullif(btrim(coalesce(v_eski.sablon_tabani ->> 'tur', '')), ''), 'Ders')), to_jsonb(v_tur::text),
            to_jsonb(v_tur::text), v_tur::text, v_eski.tur::text);
          v_al_konu := public._alan_birlestir(v_hedef, 'konu', to_jsonb(v_eski.konu),
            to_jsonb(btrim(coalesce(v_eski.sablon_tabani ->> 'konu', ''))), to_jsonb(btrim(coalesce(r ->> 'konu', ''))),
            to_jsonb(btrim(coalesce(r ->> 'konu', ''))), btrim(coalesce(r ->> 'konu', '')), v_eski.konu);
          v_al_egt := public._alan_birlestir(v_hedef, 'egitmenler', to_jsonb(public._oturum_egitmen_k(v_hedef)),
            to_jsonb(public._sablon_egitmen_k(v_eski.sablon_tabani)), to_jsonb(public._sablon_egitmen_k(r)),
            jsonb_build_object('egitmenler', coalesce(r -> 'egitmenler', '[]'), 'konuklar', coalesce(r -> 'konuklar', '[]')),
            public._sablon_egitmen_metni(r), public._oturum_egitmen_metni(v_hedef));
          -- uygulamada değişip şablonda değişmeyen alanlar: betik şablondaki hücrelere yazar
          if not v_al_zaman and public._oturum_zaman_k(v_eski.tarih, v_eski.baslangic, v_eski.bitis) <> public._sablon_zaman_k(r)
             and public._sablon_zaman_k(v_eski.sablon_tabani) = public._sablon_zaman_k(r) then
            v_geri := v_geri || jsonb_build_object('tarih', v_eski.tarih::text,
                        'saat', public._saat_metni(v_eski.baslangic, v_eski.bitis));
          end if;
          if not v_al_tur and v_eski.tur::text <> v_tur::text
             and coalesce(nullif(btrim(coalesce(v_eski.sablon_tabani ->> 'tur', '')), ''), 'Ders') = v_tur::text then
            v_geri := v_geri || jsonb_build_object('tur', v_eski.tur::text);
          end if;
          if not v_al_konu and v_eski.konu <> btrim(coalesce(r ->> 'konu', ''))
             and btrim(coalesce(v_eski.sablon_tabani ->> 'konu', '')) = btrim(coalesce(r ->> 'konu', '')) then
            v_geri := v_geri || jsonb_build_object('konu', v_eski.konu);
          end if;
          if not v_al_egt and public._oturum_egitmen_k(v_hedef) <> public._sablon_egitmen_k(r)
             and public._sablon_egitmen_k(v_eski.sablon_tabani) = public._sablon_egitmen_k(r) then
            v_geri := v_geri || public._oturum_egitmen_hucre(v_hedef);
          end if;
          if v_geri <> '{}' then
            geri := geri || (jsonb_build_object('id', v_id, 'grup', r ->> 'grup', 'genel', v_genel) || v_geri);
          end if;
        end if;
        e_tarih := case when v_al_zaman then v_tarih else v_eski.tarih end;
        e_bas := case when v_al_zaman then v_bas_tz else v_eski.baslangic end;
        e_bit := case when v_al_zaman then v_bit_tz else v_eski.bitis end;
        e_tur := case when v_al_tur then v_tur else v_eski.tur end;
        e_konu := case when v_al_konu then btrim(coalesce(r ->> 'konu', '')) else v_eski.konu end;

        if v_eski.id is null then
          insert into public.oturumlar (id, bootcamp_id, donem_id, tarih, baslangic, bitis, tur, konu, aciklama,
                                        kaynak, dis_anahtar, kaynak_hucre, hafta, grup, modul, sablon_tabani)
          values (v_hedef, v_bc, v_donem, v_tarih, v_bas_tz, v_bit_tz, v_tur, btrim(coalesce(r ->> 'konu', '')),
                  nullif(btrim(coalesce(r ->> 'aciklama', '')), ''), 'sablon', 'sablon:' || v_hedef,
                  (s ->> 'sekme') || '!' || (r ->> 'satir'), nullif(r ->> 'hafta', '')::int,
                  nullif(r ->> 'grup', ''), nullif(btrim(coalesce(r ->> 'modul', '')), ''), r);
          n_yeni := n_yeni + 1;
        else
          update public.oturumlar
             set donem_id = v_donem, tarih = e_tarih, baslangic = e_bas, bitis = e_bit, tur = e_tur,
                 konu = e_konu,
                 aciklama = case when v_genel then nullif(btrim(coalesce(r ->> 'aciklama', '')), '') else aciklama end,
                 kaynak = 'sablon', dis_anahtar = 'sablon:' || v_hedef, excelden_kalkti = false,
                 kaynak_hucre = (s ->> 'sekme') || '!' || (r ->> 'satir'), hafta = nullif(r ->> 'hafta', '')::int,
                 grup = nullif(r ->> 'grup', ''), modul = nullif(btrim(coalesce(r ->> 'modul', '')), ''),
                 sablon_tabani = r, uyarilar = '{}'
           where id = v_hedef
             and (donem_id, tarih, baslangic, bitis, tur, konu, kaynak, excelden_kalkti, hafta, grup, modul,
                  case when v_genel then aciklama end)
                 is distinct from (v_donem, e_tarih, e_bas, e_bit, e_tur, e_konu,
                                   'sablon'::public.oturum_kaynagi, false, nullif(r ->> 'hafta', '')::int,
                                   nullif(r ->> 'grup', ''), nullif(btrim(coalesce(r ->> 'modul', '')), ''),
                                   case when v_genel then nullif(btrim(coalesce(r ->> 'aciklama', '')), '') end);
          if found then n_guncel := n_guncel + 1; end if;
          update public.oturumlar set sablon_tabani = r where id = v_hedef and sablon_tabani is distinct from r;
        end if;

        -- anlatıcı farkı (bildirim yalnızca var olan oturumda ve dünden sonraki tarihlerde)
        -- Aşama C: eğitmenler uygulamada değiştiyse ya da çakışmadaysa şablon dokunmaz.
        if v_al_egt then
        select coalesce(array_agg(a.kisi_id), '{}') into v_mevcut
          from public.oturum_anlaticilari a where a.oturum_id = v_hedef and a.kisi_id is not null and a.rol <> 'konuk';
        delete from public.oturum_anlaticilari
         where oturum_id = v_hedef and kisi_id is not null and rol <> 'konuk' and not kisi_id = any (v_istenen);
        if v_eski.id is not null and v_tarih >= (now() at time zone 'Europe/Istanbul')::date - 1 then
          insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
          select k, 'atamadan_cikarildin', v_hedef from unnest(v_mevcut) k where not k = any (v_istenen);
          insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
          select k, 'atandin', v_hedef from unnest(v_istenen) k where not k = any (v_mevcut);
        end if;
        foreach v_kisi in array v_istenen loop
          insert into public.oturum_anlaticilari (oturum_id, kisi_id, rol)
          values (v_hedef, v_kisi, case when v_kisi = v_ana then 'ana' else 'yardimci' end::public.anlatici_rolu)
          on conflict (oturum_id, kisi_id) where kisi_id is not null
            do update set rol = excluded.rol where public.oturum_anlaticilari.rol <> excluded.rol;
        end loop;
        delete from public.oturum_anlaticilari
         where oturum_id = v_hedef and kisi_id is null and not (konuk_ad = any (v_konuklar));
        insert into public.oturum_anlaticilari (oturum_id, konuk_ad, rol)
        select v_hedef, k, 'konuk' from unnest(v_konuklar) k
        where not exists (select 1 from public.oturum_anlaticilari a
                          where a.oturum_id = v_hedef and a.kisi_id is null and a.konuk_ad = k);
        end if;
      end loop;

      -- dönem artık şablondan yönetilir; şablonda olmayan oturumları (eski Map oturumları dahil) "kalktı"
      update public.donem set kaynak = 'sablon' where id = v_donem and kaynak <> 'sablon';
      select count(*) into v_toplam from public.oturumlar
       where donem_id = v_donem and kaynak in ('excel', 'sablon') and not excelden_kalkti;
      select coalesce(array_agg(id), '{}') into v_kalkan from public.oturumlar
       where donem_id = v_donem and kaynak in ('excel', 'sablon') and not excelden_kalkti and not id = any (v_tum_ids);
      if cardinality(v_kalkan) > greatest(3, v_toplam * 0.2) and not coalesce((p ->> 'onay')::boolean, false) then
        raise exception using errcode = 'P0001', message = format(
          'ONAY_GEREKLI: %s sekmesinde %s oturum şablonda yok (%s oturumun). Yanlışlıkla silinmediyse onaylayarak gönderin.',
          s ->> 'sekme', cardinality(v_kalkan), v_toplam);
      end if;
      update public.oturumlar set excelden_kalkti = true where id = any (v_kalkan);

      -- Aşama B: uygulamadan eklenen oturumlar (ek seans, etkinlik) şablonun "Ek oturumlar" bölümüne
      ekler := ekler || jsonb_build_object('sekme', s ->> 'sekme', 'oturumlar', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tarih', g.tarih,
                 'saat', case when g.baslangic is null then '' else
                         to_char(g.baslangic at time zone 'Europe/Istanbul', 'HH24:MI') || '–' ||
                         to_char(g.bitis at time zone 'Europe/Istanbul', 'HH24:MI') end,
                 'tur', g.tur, 'konu', g.konu,
                 'anlaticilar', (select string_agg(x ->> 'ad', ', ') from jsonb_array_elements(g.anlaticilar) x),
                 'iptal', g.durum = 'iptal', 'gerekce', g.iptal_gerekcesi)
               order by g.tarih, g.baslangic)
        from public.oturum_gorunumu g
        where g.donem_id = v_donem and g.kaynak = 'uygulama'), '[]'));

      select count(*) into n_cakisma from public.sablon_cakismalari c
       where c.cozum is null and c.oturum_id = any (v_tum_ids);
      ozet := ozet || jsonb_build_object('sekme', s ->> 'sekme', 'donem', coalesce(s ->> 'donem', ''),
                'yeni', n_yeni, 'guncellenen', n_guncel, 'devralinan', n_devir, 'kalkan', cardinality(v_kalkan),
                'cakisma', n_cakisma);
    end loop;

    sonuc := jsonb_build_object('onizleme', v_onizleme, 'sekmeler', ozet,
               'hata_sayisi', jsonb_array_length(hatalar), 'hatalar', hatalar,
               'eslesmeyen_adlar', eslesmeyen, 'kimlik_degisimleri', kimlikler,
               'durumlar', durumlar, 'ek_oturumlar', ekler, 'geri_yazim', geri,
               'acik_cakisma', (select count(*) from public.sablon_cakismalari c join public.oturumlar o on o.id = c.oturum_id
                                where c.cozum is null and o.donem_id = any (v_donemler)),
               'gonderen', (select ad from public.kisiler where id = v_gonderen));
    if v_onizleme then
      raise exception using errcode = 'MM001', message = 'ONIZLEME';
    end if;
  exception when sqlstate 'MM001' then
    if sqlerrm <> 'ONIZLEME' then raise; end if;
    return sonuc;  -- önizleme: blok içindeki tüm yazımlar geri alındı
  end;

  insert into public.ice_aktarimlar (dosya_adi, ozet, onaylayan)
  values ('Şablon: ' || coalesce(p ->> 'kaynak', 'program şablonu'), sonuc,
          (select ad from public.kisiler where id = v_gonderen));
  return sonuc;
end $$;
