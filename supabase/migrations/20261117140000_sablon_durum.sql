-- Aşama B (MM-54): içe aktarıcı, uygulamada tutulan alanları (iptal ve gerekçesi, toplantı ve materyal linki)
-- ve uygulamadan eklenen oturumları sonuçta döner; şablondaki betik bunları salt okunur olarak yazar.
-- Önizleme de aynı bilgiyi döner ("Durumu yenile": programı değiştirmeden yalnızca bu alanları günceller).

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
  n_yeni int; n_guncel int; n_devir int;
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
      n_yeni := 0; n_guncel := 0; n_devir := 0;
      v_genel := coalesce((s ->> 'genel')::boolean, false);
      select id into v_bc from public.bootcamp where kisa_kod = btrim(coalesce(s ->> 'kod', ''));
      if v_bc is null then
        hatalar := hatalar || jsonb_build_object('sekme', s ->> 'sekme', 'mesaj',
                     format('"%s" kodlu bootcamp Mentor Map''te yok', s ->> 'kod'));
        continue;
      end if;
      if not v_yonetici and not exists (select 1 from public.bootcamp_yetkilileri
                                        where bootcamp_id = v_bc and kisi_id = v_gonderen and yetki = 'po') then
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
             set donem_id = v_donem, tarih = v_tarih, baslangic = v_bas_tz, bitis = v_bit_tz, tur = v_tur,
                 konu = btrim(coalesce(r ->> 'konu', '')),
                 aciklama = case when v_genel then nullif(btrim(coalesce(r ->> 'aciklama', '')), '') else aciklama end,
                 kaynak = 'sablon', dis_anahtar = 'sablon:' || v_hedef, excelden_kalkti = false,
                 kaynak_hucre = (s ->> 'sekme') || '!' || (r ->> 'satir'), hafta = nullif(r ->> 'hafta', '')::int,
                 grup = nullif(r ->> 'grup', ''), modul = nullif(btrim(coalesce(r ->> 'modul', '')), ''),
                 sablon_tabani = r, uyarilar = '{}'
           where id = v_hedef
             and (donem_id, tarih, baslangic, bitis, tur, konu, kaynak, excelden_kalkti, hafta, grup, modul)
                 is distinct from (v_donem, v_tarih, v_bas_tz, v_bit_tz, v_tur, btrim(coalesce(r ->> 'konu', '')),
                                   'sablon'::public.oturum_kaynagi, false, nullif(r ->> 'hafta', '')::int,
                                   nullif(r ->> 'grup', ''), nullif(btrim(coalesce(r ->> 'modul', '')), ''));
          if found then n_guncel := n_guncel + 1; end if;
          update public.oturumlar set sablon_tabani = r where id = v_hedef and sablon_tabani is distinct from r;
        end if;

        -- anlatıcı farkı (bildirim yalnızca var olan oturumda ve dünden sonraki tarihlerde)
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

      ozet := ozet || jsonb_build_object('sekme', s ->> 'sekme', 'donem', coalesce(s ->> 'donem', ''),
                'yeni', n_yeni, 'guncellenen', n_guncel, 'devralinan', n_devir, 'kalkan', cardinality(v_kalkan));
    end loop;

    sonuc := jsonb_build_object('onizleme', v_onizleme, 'sekmeler', ozet,
               'hata_sayisi', jsonb_array_length(hatalar), 'hatalar', hatalar,
               'eslesmeyen_adlar', eslesmeyen, 'kimlik_degisimleri', kimlikler,
               'durumlar', durumlar, 'ek_oturumlar', ekler,
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
