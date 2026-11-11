-- Roller: asistan (ders anlatmaz, sorumlu olduğu bootcamp'leri takip eder), dış eğitmen işareti,
-- bootcamp başına PO (düzenleme yetkisi) ve asistan ataması.
--   kisiler.rol         : egitmen | asistan | yonetici
--   kisiler.dis_egitmen : Miuul dışından eğitmen (uygulamayı kullanır, listelerde ayrı görünür)
--   bootcamp_yetkilileri.yetki : ana_egitmen | po | asistan
-- Düzenleme (iptal, link, not, yan seans): yönetici, o bootcamp'in ana eğitmeni ve PO'su. Asistan yalnızca görür.

alter table public.kisiler add column if not exists dis_egitmen boolean not null default false;

alter table public.bootcamp_yetkilileri drop constraint if exists bootcamp_yetkilileri_yetki_check;
alter table public.bootcamp_yetkilileri add constraint bootcamp_yetkilileri_yetki_check
  check (yetki in ('ana_egitmen', 'po', 'asistan'));

create or replace function public.ana_egitmen_mi(p_bootcamp_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yonetici_mi() or exists (
    select 1 from public.bootcamp_yetkilileri y
    where y.bootcamp_id = p_bootcamp_id and y.kisi_id = public.mevcut_kisi_id()
      and y.yetki in ('ana_egitmen', 'po'))
$$;

-- Sayfadaki Rol hücresi: "Yönetici" / "Asistan" / diğer her şey eğitmen.
create or replace function public._rol_coz(p text) returns public.rol
language sql immutable set search_path = '' as $$
  select case when lower(btrim(coalesce(p, ''))) like 'y%' then 'yonetici'
              when lower(btrim(coalesce(p, ''))) like 'a%' then 'asistan'
              else 'egitmen' end::public.rol
$$;

-- Sayfadaki Kurum hücresi: "Dış" ile başlıyorsa dış eğitmen.
create or replace function public._dis_mi(p text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(btrim(coalesce(p, ''))) ~ '^d(ı|i|i̇)(ş|s)'
$$;

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
  v_eposta text;
  v_k public.kisiler;
  adlar jsonb := '[]';
  v_gorulen_kisi uuid[] := '{}';
  v_pasif uuid[];
begin
  perform set_config('mentormap.islem_kaynagi', 'ice_aktarim', true);

  -- ---------------------------------------------------------------- bootcamp'ler
  for r in select * from jsonb_array_elements(coalesce(p -> 'bootcamplar', '[]')) loop
    if btrim(coalesce(r ->> 'kod', '')) = '' or btrim(coalesce(r ->> 'ad', '')) = '' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir', 'mesaj', 'Kod ve ad zorunlu');
      continue;
    end if;
    if not public.guvenli_link(nullif(btrim(r ->> 'zoom'), '')) then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                                               'mesaj', 'Zoom linki https:// ile başlamalı ve boşluk içermemeli');
      continue;
    end if;
    if coalesce(r ->> 'renk', '') <> '' and (r ->> 'renk') !~ '^#[0-9A-Fa-f]{6}$' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir', 'mesaj', 'Renk #RRGGBB biçiminde olmalı');
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

  -- ---------------------------------------------------------------- kişiler
  -- Önce e-postayla, bulunamazsa adla eşleşir. Ad değişirse yeniden adlandırma sayılır: eski ad takma ad olarak
  -- saklanır (Oturumlar'da eski adla kalan hücreler çalışmaya devam eder) ve betiğe bildirilir.
  for r in select * from jsonb_array_elements(coalesce(p -> 'kisiler', '[]')) loop
    v_ad := btrim(coalesce(r ->> 'ad', ''));
    v_eposta := lower(btrim(coalesce(r ->> 'eposta', '')));
    if v_ad = '' or v_eposta not like '%_@_%' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir', 'mesaj', 'Ad ve geçerli bir e-posta zorunlu');
      continue;
    end if;
    v_k := null;
    select * into v_k from public.kisiler where lower(eposta) = v_eposta;
    if v_k.id is null then select * into v_k from public.kisiler where ad = v_ad; end if;
    if v_k.id is not null then v_gorulen_kisi := v_gorulen_kisi || v_k.id; end if;  -- hatalı satır da "sayfada var" sayılır
    begin
      if v_k.id is null then
        insert into public.kisiler (ad, eposta, saat_dilimi, rol, aktif, dis_egitmen)
        values (v_ad, v_eposta, coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
                public._rol_coz(r ->> 'rol'),
                coalesce((r ->> 'aktif')::boolean, true), public._dis_mi(r ->> 'kurum'))
        returning id into v_kisi;
        v_gorulen_kisi := v_gorulen_kisi || v_kisi;
        n_kisi := n_kisi + 1;
      else
        if v_k.ad <> v_ad then
          insert into public.kisi_aliaslari (ham_ad, kisi_id)
          values (public._ad_anahtari(v_k.ad), v_k.id)
          on conflict (ham_ad) do update set kisi_id = excluded.kisi_id;
          adlar := adlar || jsonb_build_object('eski', v_k.ad, 'yeni', v_ad);
        end if;
        update public.kisiler
           set ad = v_ad, eposta = v_eposta,
               saat_dilimi = coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
               rol = public._rol_coz(r ->> 'rol'),
               aktif = coalesce((r ->> 'aktif')::boolean, true),
               dis_egitmen = case when r ? 'kurum' then public._dis_mi(r ->> 'kurum') else dis_egitmen end
         where id = v_k.id
           and (ad, eposta, saat_dilimi, rol, aktif, dis_egitmen) is distinct from
               (v_ad, v_eposta, coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
                public._rol_coz(r ->> 'rol'),
                coalesce((r ->> 'aktif')::boolean, true),
                case when r ? 'kurum' then public._dis_mi(r ->> 'kurum') else v_k.dis_egitmen end);
        if found then n_kisi := n_kisi + 1; end if;
      end if;
    exception
      when unique_violation then
        hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir',
                                                 'mesaj', 'Bu ad ya da e-posta başka bir kişide kayıtlı');
      when invalid_text_representation then
        hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir', 'mesaj', 'Aktif sütunu EVET ya da HAYIR olmalı');
    end;
  end loop;

  -- Kişiler sekmesinden çıkarılan eğitmen pasife alınır (giriş yapamaz, listelerde görünmez; geri eklenince açılır).
  -- Yöneticiler elle yönetilir. İkiden fazla kişi birden çıkıyorsa yanlışlıkla silmeye karşı onay istenir.
  if jsonb_array_length(coalesce(p -> 'kisiler', '[]')) > 0 then
    select coalesce(array_agg(id), '{}') into v_pasif from public.kisiler
     where aktif and rol <> 'yonetici' and not id = any (v_gorulen_kisi);
    if cardinality(v_pasif) > 2 and not coalesce((p ->> 'onay')::boolean, false) then
      raise exception using errcode = 'P0001',
        message = format('ONAY_GEREKLI: %s eğitmen Kişiler sekmesinde yok ve pasife alınacak. Bilerek çıkardıysanız "Büyük değişikliği onayla" ile gönderin.',
                         cardinality(v_pasif));
    end if;
    update public.kisiler set aktif = false where id = any (v_pasif);
  else
    v_pasif := '{}';
  end if;

  -- ana eğitmen yetkileri sayfadakiyle eşitlenir
  if jsonb_array_length(coalesce(p -> 'kisiler', '[]')) > 0 then
    delete from public.bootcamp_yetkilileri y
    where y.yetki = 'ana_egitmen' and not exists (
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

  -- PO ve asistan yetkileri Bootcamp'ler sekmesindeki PO / Asistan sütunlarıyla eşitlenir (sütun gönderildiyse).
  for r in select * from jsonb_array_elements(coalesce(p -> 'bootcamplar', '[]')) loop
    select id into v_bc from public.bootcamp where kisa_kod = btrim(coalesce(r ->> 'kod', ''));
    if v_bc is null then continue; end if;
    foreach v_ad in array array['po', 'asistan'] loop
      if not r ? v_ad then continue; end if;
      v_istenen := '{}';
      foreach v_eposta in array public._ad_listesi(r ->> v_ad) loop   -- v_eposta burada ad taşır
        select id into v_kisi from public.kisiler where ad = v_eposta;
        if v_kisi is null then
          select kisi_id into v_kisi from public.kisi_aliaslari where ham_ad = public._ad_anahtari(v_eposta);
        end if;
        if v_kisi is null then
          hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                       'mesaj', format('%s: "%s" Kişiler sekmesinde yok', case v_ad when 'po' then 'PO' else 'Asistan' end, v_eposta));
        else
          v_istenen := v_istenen || v_kisi;
        end if;
      end loop;
      delete from public.bootcamp_yetkilileri
       where bootcamp_id = v_bc and yetki = v_ad and not kisi_id = any (v_istenen);
      insert into public.bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
      select v_bc, k, v_ad from unnest(v_istenen) k
      on conflict do nothing;
    end loop;
  end loop;

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
          select kisi_id into v_kisi from public.kisi_aliaslari where ham_ad = public._ad_anahtari(v_ad);
        end if;
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
                          'hata_sayisi', jsonb_array_length(hatalar), 'hatalar', hatalar,
                          'yeniden_adlandirma', adlar,
                          'pasif', cardinality(v_pasif));
  insert into public.ice_aktarimlar (dosya_adi, ozet)
  values ('Google Sheets: ' || coalesce(p ->> 'kaynak', 'şablon'), r);
  return r;
end $$;

revoke execute on function public.sheets_senkron(jsonb) from public, anon, authenticated;
