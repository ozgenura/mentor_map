-- Eğitim türü: bootcamp'ler Bootcamp / Uygulamalı Eğitim Programı / Hafta Sonu Eğitimleri olarak gruplanır
-- (uygulamada filtrelenir). Mentor Map Program'daki Bootcamp'ler sekmesinin "Eğitim türü" sütunundan gelir.

alter table public.bootcamp add column if not exists egitim_turu text
  check (egitim_turu in ('Bootcamp', 'Uygulamalı Eğitim Programı', 'Hafta Sonu Eğitimleri'));

-- Yazım toleransı: büyük/küçük harf, "Hafta sonu", tekil/çoğul.
create or replace function public._egitim_turu_coz(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or btrim(p) = '' then null
    when lower(btrim(p)) like 'bootcamp%' then 'Bootcamp'
    when lower(btrim(p)) like 'uygulamal%' then 'Uygulamalı Eğitim Programı'
    when lower(btrim(p)) like 'hafta sonu%' or lower(btrim(p)) like 'haftasonu%' then 'Hafta Sonu Eğitimleri'
  end
$$;

create or replace view public.oturum_gorunumu with (security_invoker = true) as
select o.id, o.bootcamp_id, b.ad as bootcamp_ad, b.kisa_kod, b.renk,
       o.tarih, o.baslangic, o.bitis, o.slot, o.tur, o.konu, o.aciklama,
       coalesce(nullif(btrim(o.toplanti_linki), ''), d.zoom_linki) as toplanti_linki,
       coalesce(nullif(btrim(o.materyal_linki), ''), d.materyal_linki) as materyal_linki, o.notlar, o.durum, o.iptal_gerekcesi, o.iptal_zamani, o.kaynak,
       o.uyarilar, o.excelden_kalkti, o.guncelleme, o.surum,
       coalesce((
         select jsonb_agg(jsonb_build_object('kisi_id', a.kisi_id, 'ad', coalesce(k.ad, a.konuk_ad),
                                             'rol', a.rol)
                          order by a.rol, coalesce(k.ad, a.konuk_ad))
         from public.oturum_anlaticilari a
         left join public.kisiler k on k.id = a.kisi_id
         where a.oturum_id = o.id), '[]'::jsonb) as anlaticilar,
       nullif(btrim(o.toplanti_linki), '') as oturum_toplanti_linki,
       d.zoom_linki as varsayilan_toplanti_linki,
       o.donem_id,
       d.kod as donem_kod,
       nullif(btrim(o.materyal_linki), '') as oturum_materyal_linki,
       d.materyal_linki as varsayilan_materyal_linki,
       b.egitim_turu
from public.oturumlar o
join public.bootcamp b on b.id = o.bootcamp_id
left join public.donem d on d.id = o.donem_id;

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
  v_konuk_kisi uuid[];
  v_tum uuid[];
  v_konuk text;
  v_donem public.donem;
  v_donem_kod text;
  v_tur_adi text;
  v_kisa text;
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
  epostalar jsonb := '[]';
  v_gorulen_kisi uuid[] := '{}';
  v_pasif uuid[];
  v_rol public.rol;
  v_aktif boolean;
begin
  -- Aynı anda gelen iki gönderim sırayla işlenir (MM-16).
  perform pg_advisory_xact_lock(hashtext('public.sheets_senkron'));
  -- Betik sürüm 2'den önceki gönderimler sütunları konumla okuyordu; sayfa düzeni değiştiği için reddedilir.
  if coalesce(nullif(p ->> 'betik_surumu', '')::int, 1) < 2 then
    raise exception using errcode = 'P0001',
      message = 'ESKI_BETIK: Apps Script güncel değil. Mentor Map''in gönderdiği son MentorMap.gs ile değiştirin.';
  end if;
  perform set_config('mentormap.islem_kaynagi', 'ice_aktarim', true);

  -- ---------------------------------------------------------------- bootcamp'ler
  for r in select * from jsonb_array_elements(coalesce(p -> 'bootcamplar', '[]')) loop
    if btrim(coalesce(r ->> 'kod', '')) = '' or btrim(coalesce(r ->> 'ad', '')) = '' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir', 'mesaj', 'Kod ve ad zorunlu');
      continue;
    end if;
    -- Zoom ve materyal linkleri dönem başına program şablonundan gelir; bu sayfa okumaz.
    if coalesce(r ->> 'renk', '') <> '' and (r ->> 'renk') !~ '^#[0-9A-Fa-f]{6}$' then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir', 'mesaj', 'Renk #RRGGBB biçiminde olmalı');
      continue;
    end if;
    -- Eğitim türü (Bootcamp / Uygulamalı Eğitim Programı / Hafta Sonu Eğitimleri): sütun yoksa dokunulmaz.
    v_tur_adi := public._egitim_turu_coz(r ->> 'egitim_turu');
    if r ? 'egitim_turu' and nullif(btrim(r ->> 'egitim_turu'), '') is not null and v_tur_adi is null then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                   'mesaj', 'Eğitim türü Bootcamp, Uygulamalı Eğitim Programı ya da Hafta Sonu Eğitimleri olmalı');
      continue;
    end if;
    begin
      insert into public.bootcamp (kisa_kod, ad, renk, egitim_turu)
      values (btrim(r ->> 'kod'), btrim(r ->> 'ad'), coalesce(nullif(btrim(r ->> 'renk'), ''), '#6366f1'), v_tur_adi)
      on conflict (kisa_kod) do update
        set ad = excluded.ad, renk = excluded.renk,
            egitim_turu = case when r ? 'egitim_turu' then excluded.egitim_turu else public.bootcamp.egitim_turu end
        where (public.bootcamp.ad, public.bootcamp.renk, public.bootcamp.egitim_turu)
              is distinct from (excluded.ad, excluded.renk,
                                case when r ? 'egitim_turu' then excluded.egitim_turu else public.bootcamp.egitim_turu end);
      if found then n_bc := n_bc + 1; end if;
    exception when unique_violation then
      hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                                               'mesaj', 'Bu ad başka bir bootcamp''te kullanılıyor');
      continue;
    end;

    -- Güncel dönem (K-9): "Dönem" hücresi Kod + numara (DA11). Geçici dönem (adı kodun kendisi) ilk numarayla
    -- yeniden adlandırılır; numara değişince (DA11 -> DA12) yeni dönem açılır, eskisi arşivde kalır.
    v_kisa := btrim(r ->> 'kod');
    v_donem_kod := btrim(coalesce(r ->> 'donem', ''));
    if v_donem_kod <> '' then
      if left(v_donem_kod, length(v_kisa)) <> v_kisa or substr(v_donem_kod, length(v_kisa) + 1) !~ '^[0-9]+$' then
        hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                     'mesaj', format('Dönem Kod + numara olmalı (ör. %s12)', v_kisa));
        continue;
      end if;
      v_donem_kod := public._donem_kodu_esle(v_kisa, v_donem_kod);  -- Vibe2 = Vibe02
      select d.* into v_donem from public.bootcamp b join public.donem d on d.id = b.guncel_donem_id
       where b.kisa_kod = v_kisa;
      if v_donem.kod is distinct from v_donem_kod then
        if exists (select 1 from public.donem d join public.bootcamp b on b.id = d.bootcamp_id
                    where d.kod = v_donem_kod and b.kisa_kod <> v_kisa) then
          hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                       'mesaj', format('%s başka bir bootcamp''in dönemi', v_donem_kod));
          continue;
        end if;
        if v_donem.kod = v_kisa and not exists (select 1 from public.donem where kod = v_donem_kod) then
          update public.donem set kod = v_donem_kod where id = v_donem.id;           -- geçici dönem adlandırılır
        else
          insert into public.donem (bootcamp_id, kod)
          select id, v_donem_kod from public.bootcamp where kisa_kod = v_kisa
          on conflict (kod) do nothing;
          update public.bootcamp set guncel_donem_id = (select id from public.donem where kod = v_donem_kod)
           where kisa_kod = v_kisa;
        end if;
        n_bc := n_bc + 1;
      end if;
    end if;
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
        -- Sayfadan yönetici açılamaz (MM-10): yönetici rolü yalnızca uygulamadan verilir.
        v_rol := public._rol_coz(r ->> 'rol');
        if v_rol = 'yonetici' then
          v_rol := 'egitmen';
          hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir',
                       'mesaj', 'Yönetici rolü sayfadan verilemez; kişi eğitmen olarak eklendi');
        end if;
        insert into public.kisiler (ad, eposta, saat_dilimi, rol, aktif, dis_egitmen)
        values (v_ad, v_eposta, coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
                v_rol,
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
        -- E-posta bu sayfadan değişebilir: Mentor Map Program yalnızca yöneticinin erişimindedir ve anahtar
        -- bu e-tabloya bağlıdır (TOFU). Kişi ada göre bulunur; yeni adres başka birine aitse ya da kişi
        -- yöneticiyse değişmez (yöneticinin giriş adresi yalnızca uygulamadan değişir).
        -- Kimse sayfadan yönetici yapılamaz; yöneticinin rolü ve aktifliği sayfadan değişmez (MM-10).
        if v_eposta <> lower(v_k.eposta) then
          if v_k.rol = 'yonetici' then
            hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir',
                         'mesaj', 'Yöneticinin e-postası sayfadan değişmez; kayıtlı adres korundu');
          elsif exists (select 1 from public.kisiler x where x.id <> v_k.id
                          and (lower(x.eposta) = v_eposta or v_eposta = any (x.ek_epostalar))) then
            hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir',
                         'mesaj', 'Bu e-posta başka bir kişide kayıtlı; değiştirilmedi');
          else
            update public.kisiler set eposta = v_eposta where id = v_k.id;
            epostalar := epostalar || jsonb_build_object('ad', v_ad, 'eski', v_k.eposta, 'yeni', v_eposta);
          end if;
        end if;
        v_rol := public._rol_coz(r ->> 'rol');
        v_aktif := coalesce((r ->> 'aktif')::boolean, true);
        if v_k.rol = 'yonetici' then
          v_rol := 'yonetici';
          v_aktif := v_k.aktif;
        elsif v_rol = 'yonetici' then
          v_rol := v_k.rol;
          hatalar := hatalar || jsonb_build_object('sekme', 'Kişiler', 'satir', r -> 'satir',
                       'mesaj', 'Yönetici rolü sayfadan verilemez; rol değişmedi');
        end if;
        update public.kisiler
           set ad = v_ad,
               saat_dilimi = coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
               rol = v_rol,
               aktif = v_aktif,
               dis_egitmen = case when r ? 'kurum' then public._dis_mi(r ->> 'kurum') else dis_egitmen end
         where id = v_k.id
           and (ad, saat_dilimi, rol, aktif, dis_egitmen) is distinct from
               (v_ad, coalesce(nullif(btrim(r ->> 'saat_dilimi'), ''), 'Europe/Istanbul'),
                v_rol, v_aktif,
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

  -- Bootcamp yetkileri (PO, ana eğitmen, asistan) Bootcamp'ler sekmesindeki sütunlarla eşitlenir (sütun gönderildiyse).
  -- Roller tek yerden atanır; Kişiler sekmesi rol taşımaz.
  for r in select * from jsonb_array_elements(coalesce(p -> 'bootcamplar', '[]')) loop
    select id into v_bc from public.bootcamp where kisa_kod = btrim(coalesce(r ->> 'kod', ''));
    if v_bc is null then continue; end if;
    foreach v_ad in array array['po', 'ana_egitmen', 'asistan'] loop
      if not r ? v_ad then continue; end if;
      v_istenen := '{}';
      foreach v_eposta in array public._ad_listesi(r ->> v_ad) loop   -- v_eposta burada ad taşır
        select id into v_kisi from public.kisiler where ad = v_eposta;
        if v_kisi is null then
          select kisi_id into v_kisi from public.kisi_aliaslari where ham_ad = public._ad_anahtari(v_eposta);
        end if;
        if v_kisi is null then
          hatalar := hatalar || jsonb_build_object('sekme', 'Bootcamp''ler', 'satir', r -> 'satir',
                       'mesaj', format('%s: "%s" Kişiler sekmesinde yok',
                         case v_ad when 'po' then 'PO' when 'ana_egitmen' then 'Ana eğitmen' else 'Asistan' end, v_eposta));
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
    -- Konuk: Mentor Map'te kayıtlı biriyse kişi olarak bağlanır (takviminde görünür), değilse adıyla yazılır.
    v_konuklar := '{}';
    v_konuk_kisi := '{}';
    foreach v_konuk in array public._ad_listesi(r ->> 'konuk') loop
      v_kisi := null;
      select id into v_kisi from public.kisiler where ad = v_konuk;
      if v_kisi is null then
        select kisi_id into v_kisi from public.kisi_aliaslari where ham_ad = public._ad_anahtari(v_konuk);
      end if;
      if v_kisi is null then
        v_konuklar := v_konuklar || v_konuk;
      elsif not v_kisi = any (v_istenen) and not v_kisi = any (v_konuk_kisi) then
        v_konuk_kisi := v_konuk_kisi || v_kisi;
      end if;
    end loop;
    v_tum := v_istenen || v_konuk_kisi;

    v_bas_tz := case when v_bas is not null then public.tr_zaman(v_tarih, v_bas) end;
    v_bit_tz := case when v_bit is not null then public.tr_zaman(v_tarih, v_bit) end;
    if v_bit_tz is not null and v_bit_tz <= v_bas_tz then v_bit_tz := v_bit_tz + interval '1 day'; end if;

    v_eski := null;
    select * into v_eski from public.oturumlar where id = v_id for update;
    if not found and exists (select 1 from public.bootcamp b join public.donem d on d.id = b.guncel_donem_id
                              where b.id = v_bc and d.kaynak = 'sablon') then
      -- bu bootcamp'in güncel dönemi kurum şablonundan yönetiliyor: yeni oturum şablona yazılır
      hatalar := hatalar || jsonb_build_object('sekme', 'Oturumlar', 'satir', r -> 'satir',
                   'mesaj', 'Bu bootcamp''in dönemi program şablonundan yönetiliyor; oturumu şablona ekleyin');
      continue;
    end if;
    if not found then
      insert into public.oturumlar (id, bootcamp_id, tarih, baslangic, bitis, tur, konu, kaynak, dis_anahtar, kaynak_hucre)
      values (v_id, v_bc, v_tarih, v_bas_tz, v_bit_tz, v_tur, btrim(coalesce(r ->> 'konu', '')), 'excel',
              'sheet:' || v_id, 'Oturumlar!' || (r ->> 'satir'));
      n_yeni := n_yeni + 1;
    elsif v_eski.kaynak in ('uygulama', 'sablon') then
      continue;  -- sahibi uygulama (yan seans) ya da kurum şablonu (devralınmış oturum)
    elsif public.donem_tamamlandi_mi(v_eski.donem_id) then
      -- tamamlanmış dönem arşivdir: şablondan değiştirilemez (K-9)
      if (v_eski.tarih, v_eski.baslangic, v_eski.bitis, v_eski.tur, v_eski.konu)
         is distinct from (v_tarih, v_bas_tz, v_bit_tz, v_tur, btrim(coalesce(r ->> 'konu', ''))) then
        hatalar := hatalar || jsonb_build_object('sekme', 'Oturumlar', 'satir', r -> 'satir',
                     'mesaj', format('%s dönemi tamamlandı; oturumu değiştirilemez',
                                     (select kod from public.donem where id = v_eski.donem_id)));
      end if;
      continue;
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
     where oturum_id = v_id and kisi_id is not null and not kisi_id = any (v_tum);
    if v_bildir then
      insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
      select k, 'atamadan_cikarildin', v_id from unnest(v_mevcut) k where not k = any (v_tum);
      insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id)
      select k, 'atandin', v_id from unnest(v_tum) k where not k = any (v_mevcut);
    end if;
    foreach v_kisi in array v_istenen loop
      insert into public.oturum_anlaticilari (oturum_id, kisi_id, rol)
      values (v_id, v_kisi, case when v_kisi = v_ana then 'ana' else 'yardimci' end::public.anlatici_rolu)
      on conflict (oturum_id, kisi_id) where kisi_id is not null
        do update set rol = excluded.rol where public.oturum_anlaticilari.rol <> excluded.rol;
    end loop;
    foreach v_kisi in array v_konuk_kisi loop
      insert into public.oturum_anlaticilari (oturum_id, kisi_id, rol)
      values (v_id, v_kisi, 'konuk')
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
  -- Yalnızca güncel dönemlerin oturumları "kalktı" sayılır; eski dönemler arşivde dokunulmadan kalır (K-9).
  select count(*) into v_toplam from public.oturumlar o
   where o.kaynak = 'excel' and not o.excelden_kalkti
     and (o.donem_id is null or o.donem_id in (select guncel_donem_id from public.bootcamp));
  select coalesce(array_agg(o.id), '{}') into v_kalkan from public.oturumlar o
   where o.kaynak = 'excel' and not o.excelden_kalkti and not o.id = any (v_gecerli)
     and (o.donem_id is null or o.donem_id in (select guncel_donem_id from public.bootcamp))
     and not public.donem_tamamlandi_mi(o.donem_id);
  if cardinality(v_kalkan) > greatest(3, v_toplam * 0.2) and not coalesce((p ->> 'onay')::boolean, false) then
    raise exception using errcode = 'P0001',
      message = format('ONAY_GEREKLI: %s oturum şablonda yok (%s oturumun %%%s''i). Yanlışlıkla silinmediyse "Büyük değişikliği onayla" ile gönderin.',
                       cardinality(v_kalkan), v_toplam, round(100.0 * cardinality(v_kalkan) / greatest(v_toplam, 1)));
  end if;
  update public.oturumlar set excelden_kalkti = true where id = any (v_kalkan);

  r := jsonb_build_object('yeni', n_yeni, 'guncellenen', n_guncel, 'geri_gelen', n_geri,
                          'kalkan', cardinality(v_kalkan), 'kisi', n_kisi, 'bootcamp', n_bc,
                          'hata_sayisi', jsonb_array_length(hatalar), 'hatalar', hatalar,
                          'yeniden_adlandirma', adlar, 'eposta_degisimleri', epostalar,
                          'pasif', cardinality(v_pasif));
  insert into public.ice_aktarimlar (dosya_adi, ozet)
  values ('Google Sheets: ' || coalesce(p ->> 'kaynak', 'şablon'), r);
  return r;
end $$;
