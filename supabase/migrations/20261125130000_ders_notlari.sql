-- Ders sonu notları: dersin ana eğitmeni ders başladıktan sonra kartından kısa bir not bırakır;
-- yönetici ve "raporları görür" işaretli kişiler (ör. Atilla Hoca) haftalık board'da hepsini görür.
-- Özellik anahtarı 'ders_notlari' kapalıyken yalnızca yönetici görür (önizleme). Herkese açmak için:
--   update public.uygulama_ayarlari set acik = true where anahtar = 'ders_notlari';
-- Raporları görecek kişi:
--   update public.kisiler set rapor_izleyici = true where ad = 'Atilla Yardımcı';

alter table public.kisiler add column if not exists rapor_izleyici boolean not null default false;

insert into public.uygulama_ayarlari (anahtar, acik, aciklama)
values ('ders_notlari', false, 'Ders sonu notları, board ve haftalık özet')
on conflict (anahtar) do nothing;

create table if not exists public.ders_notlari (
  oturum_id uuid primary key references public.oturumlar (id) on delete cascade,
  plan text not null check (plan in ('tamam', 'kismen', 'geride')),
  nabiz text not null check (nabiz in ('zorlandi', 'iyi', 'cok_iyi')),
  katilim int check (katilim between 0 and 2000),
  islenen text not null default '' check (length(islenen) <= 2000),
  dikkat text check (length(dikkat) <= 2000),
  yazan uuid references public.kisiler (id) on delete set null,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
alter table public.ders_notlari enable row level security;
revoke all on public.ders_notlari from anon, authenticated;
-- Okuma ve yazma yalnızca aşağıdaki fonksiyonlarla.

-- Not alınan oturum türleri (sunum, etkinlik, kick-off dışarıda; mentor görüşmesinde de sınıfın nabzı tutulur).
create or replace function public._notlu_tur_mu(p_tur public.oturum_turu) returns boolean
language sql immutable set search_path = '' as $$
  select p_tur::text in ('Ders', 'Ek Ders', 'Uygulama', 'Proje', 'Master Class', 'Mentor Görüşmesi')
$$;

create or replace function public._ders_notu_yazari_mi(p_oturum uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.oturum_anlaticilari a
                  where a.oturum_id = p_oturum and a.rol = 'ana' and a.kisi_id = public.mevcut_kisi_id())
$$;

create or replace function public._rapor_goren_mi() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yonetici_mi()
      or exists (select 1 from public.kisiler where id = public.mevcut_kisi_id() and rapor_izleyici)
$$;

create or replace function public.ders_notlari_durumu() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('acik', public.ozellik_acik('ders_notlari'),
                            'izleyici', public.ozellik_acik('ders_notlari') and public._rapor_goren_mi())
$$;

create or replace function public._ders_notu_json(n public.ders_notlari) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when n.oturum_id is null then null else jsonb_build_object(
    'plan', n.plan, 'nabiz', n.nabiz, 'katilim', n.katilim, 'islenen', n.islenen, 'dikkat', n.dikkat,
    'yazan', (select ad from public.kisiler where id = n.yazan), 'guncelleme', n.guncelleme) end
$$;

-- Tek oturumun notu (ders kartı). Yazar ya da rapor gören okur; diğerlerine null.
create or replace function public.ders_notu(p_oturum uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n public.ders_notlari; v_yazar boolean; o record;
begin
  if not public.ozellik_acik('ders_notlari') then return null; end if;
  select tur, durum, baslangic, tarih into o from public.oturumlar where id = p_oturum;
  if not found or not public._notlu_tur_mu(o.tur) or o.durum <> 'planli' then return null; end if;
  v_yazar := public._ders_notu_yazari_mi(p_oturum);
  if not v_yazar and not public._rapor_goren_mi() then return null; end if;
  select * into n from public.ders_notlari where oturum_id = p_oturum;
  return jsonb_build_object(
    'yazabilir', v_yazar,
    'basladi', coalesce(o.baslangic <= now(), o.tarih <= (now() at time zone 'Europe/Istanbul')::date),
    'not', public._ders_notu_json(n));
end $$;

create or replace function public.ders_notu_kaydet(p_oturum uuid, p_plan text, p_nabiz text, p_katilim int,
                                                   p_islenen text, p_dikkat text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare o record;
begin
  if not public.ozellik_acik('ders_notlari') then
    raise exception 'ders notları henüz açık değil' using errcode = '42501';
  end if;
  if not public._ders_notu_yazari_mi(p_oturum) then
    raise exception 'bu dersin notunu yalnızca ana eğitmeni yazabilir' using errcode = '42501';
  end if;
  select tur, durum, baslangic, tarih into o from public.oturumlar where id = p_oturum;
  if not public._notlu_tur_mu(o.tur) or o.durum <> 'planli' then
    raise exception 'bu oturum için not alınmıyor' using errcode = '22023';
  end if;
  if not coalesce(o.baslangic <= now(), o.tarih <= (now() at time zone 'Europe/Istanbul')::date) then
    raise exception 'not ders başladıktan sonra yazılabilir' using errcode = '22023';
  end if;
  insert into public.ders_notlari (oturum_id, plan, nabiz, katilim, islenen, dikkat, yazan)
  values (p_oturum, p_plan, p_nabiz, p_katilim, btrim(coalesce(p_islenen, '')),
          nullif(btrim(coalesce(p_dikkat, '')), ''), public.mevcut_kisi_id())
  on conflict (oturum_id) do update set plan = excluded.plan, nabiz = excluded.nabiz, katilim = excluded.katilim,
    islenen = excluded.islenen, dikkat = excluded.dikkat, yazan = excluded.yazan, guncelleme = now();
end $$;

-- Board: pazartesiden başlayan haftanın başlamış, not alınan oturumları ve notları.
create or replace function public.ders_notlari_hafta(p_pazartesi date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.ozellik_acik('ders_notlari') and public._rapor_goren_mi()) then
    raise exception 'ders notlarını yalnızca yönetici ve rapor izleyicileri görür' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'bootcamp_id', o.bootcamp_id, 'kisa_kod', b.kisa_kod, 'bootcamp_ad', b.ad, 'renk', b.renk,
      'tarih', o.tarih, 'baslangic', o.baslangic, 'tur', o.tur, 'konu', o.konu,
      'egitmenler', coalesce((select jsonb_agg(k.ad order by k.ad) from public.oturum_anlaticilari a
                               join public.kisiler k on k.id = a.kisi_id
                              where a.oturum_id = o.id and a.rol = 'ana'), '[]'),
      'not', public._ders_notu_json(n))
      order by b.kisa_kod, o.tarih, o.baslangic nulls last)
    from public.oturumlar o
    join public.bootcamp b on b.id = o.bootcamp_id
    left join public.ders_notlari n on n.oturum_id = o.id
   where o.tarih between p_pazartesi and p_pazartesi + 6
     and o.durum = 'planli' and not o.excelden_kalkti and public._notlu_tur_mu(o.tur)
     and coalesce(o.baslangic <= now(), o.tarih <= (now() at time zone 'Europe/Istanbul')::date)), '[]');
end $$;

-- ------------------------------------------------------------ hatırlatmalar (push-gonder her dakika çağırır)
create or replace function public.push_hatirlatmalari() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  n int := 0; r record;
  v_notlar_acik boolean := coalesce((select acik from public.uygulama_ayarlari where anahtar = 'ders_notlari'), false);
  v_simdi timestamp := now() at time zone 'Europe/Istanbul';
  v_gecen date := (date_trunc('week', now() at time zone 'Europe/Istanbul') - interval '7 days')::date;
begin
  -- Ders hatırlatması: 50–70 dk sonra başlayan planlı oturumun eğitmenlerine (isteyenlere), oturum başına bir kez.
  for r in
    select a.kisi_id, g.id, g.konu, g.tur, g.kisa_kod, g.baslangic, g.bitis, g.toplanti_linki
      from public.oturum_gorunumu g
      join public.oturum_anlaticilari a on a.oturum_id = g.id
      join public.kisiler k on k.id = a.kisi_id and k.aktif and k.push_hatirlatma
     where g.durum = 'planli' and not coalesce(g.excelden_kalkti, false)
       and g.baslangic between now() + interval '50 minutes' and now() + interval '70 minutes'
  loop
    perform public._push_ekle(r.kisi_id, '⏰ 1 saat sonra: ' || coalesce(nullif(r.konu, ''), r.tur::text),
      r.kisa_kod || ' · ' || public._saat_metni(r.baslangic, r.bitis) || ' TR' ||
        case when r.toplanti_linki is not null then ' · Derse katıl için dokun' else '' end,
      '/?oturum=' || r.id, true, 'hatirlatma:' || r.id || ':' || r.kisi_id);
    n := n + 1;
  end loop;

  -- Ders sonu notu: bitişten 40–60 dk sonra hâlâ not yoksa ana eğitmene hatırlatma (ertesi sabah bir kez daha).
  -- (22:00'de biten ders 22:40–23:00 arasında; sessiz saate kalmaz.)
  for r in
    select a.kisi_id, o.id, o.konu, o.tur, b.kisa_kod
      from public.oturumlar o
      join public.bootcamp b on b.id = o.bootcamp_id
      join public.oturum_anlaticilari a on a.oturum_id = o.id and a.rol = 'ana'
      join public.kisiler k on k.id = a.kisi_id and k.aktif
     where (v_notlar_acik or k.rol = 'yonetici')
       and o.durum = 'planli' and not o.excelden_kalkti and public._notlu_tur_mu(o.tur)
       and o.bitis between now() - interval '60 minutes' and now() - interval '40 minutes'
       and not exists (select 1 from public.ders_notlari d where d.oturum_id = o.id)
  loop
    perform public._push_ekle(r.kisi_id, '📝 Bugünkü dersin nasıl geçti?',
      r.kisa_kod || ' · ' || coalesce(nullif(r.konu, ''), r.tur::text) || ' · 1 dakikalık not bırak',
      '/?oturum=' || r.id, false, 'dersnotu:' || r.id || ':' || r.kisi_id);
    n := n + 1;
  end loop;

  -- Ertesi sabah (TR 09:00–09:59) dünkü dersin notu hâlâ yoksa ikinci ve son hatırlatma.
  if extract(hour from v_simdi) = 9 then
    for r in
      select a.kisi_id, o.id, o.konu, o.tur, b.kisa_kod
        from public.oturumlar o
        join public.bootcamp b on b.id = o.bootcamp_id
        join public.oturum_anlaticilari a on a.oturum_id = o.id and a.rol = 'ana'
        join public.kisiler k on k.id = a.kisi_id and k.aktif
       where (v_notlar_acik or k.rol = 'yonetici')
         and o.durum = 'planli' and not o.excelden_kalkti and public._notlu_tur_mu(o.tur)
         and o.tarih = v_simdi::date - 1
         and not exists (select 1 from public.ders_notlari d where d.oturum_id = o.id)
    loop
      perform public._push_ekle(r.kisi_id, '📝 Dünkü dersin notu',
        r.kisa_kod || ' · ' || coalesce(nullif(r.konu, ''), r.tur::text) || ' · 1 dakikanı ayırabilirsen not bırak',
        '/?oturum=' || r.id, false, 'dersnotu-sabah:' || r.id || ':' || r.kisi_id);
      n := n + 1;
    end loop;
  end if;

  -- Haftalık özet: pazartesi 09:00 (TR) sonrası, geçen haftanın özeti rapor görenlere; hafta başına bir kez.
  if extract(isodow from v_simdi) = 1 and extract(hour from v_simdi) >= 9 then
    for r in
      select k.id kisi_id,
             count(o.id) ders, count(d.oturum_id) notlu, count(d.dikkat) dikkat
        from public.kisiler k
        cross join public.oturumlar o
        left join public.ders_notlari d on d.oturum_id = o.id
       where k.aktif and (k.rol = 'yonetici' or (v_notlar_acik and k.rapor_izleyici))
         and o.tarih between v_gecen and v_gecen + 6
         and o.durum = 'planli' and not o.excelden_kalkti and public._notlu_tur_mu(o.tur)
       group by k.id
    loop
      perform public._push_ekle(r.kisi_id, '🗒️ Haftalık ders özeti hazır',
        r.ders || ' ders, ' || r.notlu || ' not' ||
          case when r.dikkat > 0 then ', ' || r.dikkat || ' dikkat notu' else '' end || '. Görmek için dokun.',
        '/?hafta=' || v_gecen || '#notlar', false, 'haftalik:' || v_gecen || ':' || r.kisi_id);
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;

-- ------------------------------------------------------------ yetkiler
revoke execute on function public._notlu_tur_mu(public.oturum_turu), public._ders_notu_yazari_mi(uuid),
  public._rapor_goren_mi(), public._ders_notu_json(public.ders_notlari), public.push_hatirlatmalari()
  from public, anon, authenticated;
grant execute on function public.push_hatirlatmalari() to service_role;
revoke execute on function public.ders_notlari_durumu(), public.ders_notu(uuid),
  public.ders_notu_kaydet(uuid, text, text, int, text, text), public.ders_notlari_hafta(date) from public, anon;
grant execute on function public.ders_notlari_durumu(), public.ders_notu(uuid),
  public.ders_notu_kaydet(uuid, text, text, int, text, text), public.ders_notlari_hafta(date) to authenticated;
