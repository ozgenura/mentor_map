-- Durak tabelaları ve anlık bildirim (push).
-- * Anonslar: PO kendi hattına (bootcamp), yönetici herhangi bir hatta ya da tüm hatlara yazar; 3 gün yayında kalır.
--   Görülme, anonslar açılınca kendiliğinden sayılır (kimseden "gördüm" istenmez); sayıyı yazan ve yöneticiler görür.
-- * Talepler ("PO'na ilet"): eğitmen bir programının PO'larına yazar; PO (ya da yönetici) bir kez cevaplar.
-- * Push: olaylar push_kuyrugu'na düşer; her dakika çalışan push-gonder Edge Function gönderir.
--   Sessiz saatler 23:00–08:00 (TR): yalnızca acil olanlar (iptal) gider, diğerleri sabah gider.
--   İsteyen ders hatırlatması açar (dersten ~1 saat önce).

-- ------------------------------------------------------------ hattaki kişiler
-- Bir bootcamp'in "hattı": yetkilileri (PO, ana eğitmen, asistan) ve güncel ya da gelecek oturumlarının eğitmenleri.
create or replace function public._hat_kisileri(p_bootcamp uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select y.kisi_id from public.bootcamp_yetkilileri y join public.kisiler k on k.id = y.kisi_id and k.aktif
   where y.bootcamp_id = p_bootcamp
  union
  select a.kisi_id from public.oturum_anlaticilari a
    join public.oturumlar o on o.id = a.oturum_id
    join public.kisiler k on k.id = a.kisi_id and k.aktif
   where o.bootcamp_id = p_bootcamp and not o.excelden_kalkti
     and (o.donem_id = (select guncel_donem_id from public.bootcamp where id = p_bootcamp)
          or o.tarih >= (now() at time zone 'Europe/Istanbul')::date)
$$;

create or replace function public.hatta_mi(p_bootcamp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yonetici_mi() or public.mevcut_kisi_id() in (select public._hat_kisileri(p_bootcamp))
$$;

-- ------------------------------------------------------------ tablolar
create table if not exists public.anonslar (
  id bigint generated always as identity primary key,
  bootcamp_id uuid references public.bootcamp (id) on delete cascade,   -- null: tüm hatlar
  yazan uuid not null references public.kisiler (id),
  metin text not null check (length(btrim(metin)) between 1 and 1000),
  olusturma timestamptz not null default now(),
  bitis timestamptz not null default now() + interval '3 days'
);
create table if not exists public.anons_gorulme (
  anons_id bigint not null references public.anonslar (id) on delete cascade,
  kisi_id uuid not null references public.kisiler (id) on delete cascade,
  zaman timestamptz not null default now(),
  primary key (anons_id, kisi_id)
);
create table if not exists public.talepler (
  id bigint generated always as identity primary key,
  gonderen uuid not null references public.kisiler (id),
  bootcamp_id uuid not null references public.bootcamp (id) on delete cascade,
  konu text not null check (konu in ('Ders içeriği', 'Program / saat', 'Materyal / link', 'Diğer')),
  metin text not null check (length(btrim(metin)) between 1 and 2000),
  olusturma timestamptz not null default now(),
  cevap text check (cevap is null or length(btrim(cevap)) between 1 and 2000),
  cevaplayan uuid references public.kisiler (id),
  cevap_zamani timestamptz,
  po_okudu timestamptz,
  gonderen_okudu timestamptz
);
create table if not exists public.push_abonelikleri (
  id bigint generated always as identity primary key,
  kisi_id uuid not null references public.kisiler (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  olusturma timestamptz not null default now(),
  son_kullanim timestamptz
);
create table if not exists public.push_kuyrugu (
  id bigint generated always as identity primary key,
  kisi_id uuid not null references public.kisiler (id) on delete cascade,
  baslik text not null,
  govde text not null,
  url text not null default '/',
  acil boolean not null default false,
  anahtar text unique,                -- tekrarı önler (ders hatırlatması)
  olusturma timestamptz not null default now(),
  gonderildi timestamptz,
  hata text
);
create index if not exists push_kuyrugu_bekleyen on public.push_kuyrugu (olusturma) where gonderildi is null;
alter table public.kisiler add column if not exists push_hatirlatma boolean not null default false;

alter table public.anonslar enable row level security;
alter table public.anons_gorulme enable row level security;
alter table public.talepler enable row level security;
alter table public.push_abonelikleri enable row level security;
alter table public.push_kuyrugu enable row level security;
revoke all on public.anonslar, public.anons_gorulme, public.talepler, public.push_abonelikleri, public.push_kuyrugu
  from anon, authenticated;
-- Okuma ve yazma yalnızca aşağıdaki fonksiyonlarla (adları ve sayaçları birlikte döner).

-- ------------------------------------------------------------ push kuyruğuna ekleme
create or replace function public._push_ekle(p_kisi uuid, p_baslik text, p_govde text, p_url text,
                                             p_acil boolean default false, p_anahtar text default null)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.push_kuyrugu (kisi_id, baslik, govde, url, acil, anahtar)
  select p_kisi, left(p_baslik, 120), left(p_govde, 240), coalesce(p_url, '/'), p_acil, p_anahtar
   where exists (select 1 from public.push_abonelikleri where kisi_id = p_kisi)
  on conflict (anahtar) do nothing
$$;

-- Değişenler akışına düşen olaylar push olarak da gider.
create or replace function public._bildirimden_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o record; v_baslik text; v_govde text;
begin
  select g.konu, g.tur, g.kisa_kod, g.tarih, g.baslangic, g.bitis, g.iptal_gerekcesi into o
    from public.oturum_gorunumu g where g.id = new.oturum_id;
  if not found then return new; end if;
  v_govde := o.kisa_kod || ' · ' || to_char(o.tarih, 'DD.MM') ||
             case when o.baslangic is null then '' else ' ' || public._saat_metni(o.baslangic, o.bitis) end;
  v_baslik := case new.olay
    when 'iptal' then '❌ İptal: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    when 'iptal_geri_alma' then '✅ Yeniden programda: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    when 'zaman_degisti' then '🕒 Saat değişti: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    when 'atandin' then '📌 Derse atandın: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    when 'atamadan_cikarildin' then 'Dersten çıkarıldın: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    when 'yan_seans_eklendi' then '➕ Yeni seans: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    when 'yan_seans_degisti' then 'Seans güncellendi: ' || coalesce(nullif(o.konu, ''), o.tur::text)
    else null end;
  if v_baslik is null then return new; end if;
  if new.olay = 'iptal' and o.iptal_gerekcesi is not null then v_govde := v_govde || ' · ' || o.iptal_gerekcesi; end if;
  perform public._push_ekle(new.kisi_id, v_baslik, v_govde, '/?oturum=' || new.oturum_id, new.olay = 'iptal');
  return new;
end $$;
drop trigger if exists bildirim_push on public.bildirim_kuyrugu;
create trigger bildirim_push after insert on public.bildirim_kuyrugu for each row execute function public._bildirimden_push();

-- ------------------------------------------------------------ anonslar
create or replace function public.anons_yaz(p_bootcamp uuid, p_metin text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint; v_ben uuid := public.mevcut_kisi_id(); v_kod text; k uuid;
begin
  if p_bootcamp is null and not public.yonetici_mi() then
    raise exception 'tüm hatlara yalnızca yönetici anons yazabilir' using errcode = '42501';
  end if;
  if p_bootcamp is not null and not public.ana_egitmen_mi(p_bootcamp) then
    raise exception 'bu hatta anons yazma yetkiniz yok' using errcode = '42501';
  end if;
  if btrim(coalesce(p_metin, '')) = '' then raise exception 'anons boş olamaz' using errcode = '22023'; end if;
  insert into public.anonslar (bootcamp_id, yazan, metin) values (p_bootcamp, v_ben, btrim(p_metin)) returning id into v_id;
  select kisa_kod into v_kod from public.bootcamp where id = p_bootcamp;
  for k in (select id from public.kisiler where aktif and p_bootcamp is null
            union select public._hat_kisileri(p_bootcamp) where p_bootcamp is not null) loop
    if k <> v_ben then
      perform public._push_ekle(k, '📣 ' || coalesce(v_kod || ' anonsu', 'Anons'), btrim(p_metin), '/?tabela=anons');
    end if;
  end loop;
  return v_id;
end $$;

-- Kişinin görebildiği yayındaki anonslar. "goren/kitle" yalnızca yazana, yöneticiye ve o hattın PO'suna döner.
create or replace function public.anonslarim() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x ->> 'olusturma' desc), '[]') from (
    select jsonb_build_object(
      'id', a.id, 'metin', a.metin, 'olusturma', a.olusturma, 'bitis', a.bitis,
      'bootcamp_id', a.bootcamp_id, 'kod', b.kisa_kod, 'renk', b.renk, 'yazan', k.ad,
      'gordum', exists (select 1 from public.anons_gorulme g where g.anons_id = a.id and g.kisi_id = public.mevcut_kisi_id()),
      'benim', a.yazan = public.mevcut_kisi_id(),
      'goren', case when a.yazan = public.mevcut_kisi_id() or public.yonetici_mi()
                         or (a.bootcamp_id is not null and public.ana_egitmen_mi(a.bootcamp_id))
                    then (select count(*) from public.anons_gorulme g where g.anons_id = a.id and g.kisi_id <> a.yazan) end,
      'kitle', case when a.yazan = public.mevcut_kisi_id() or public.yonetici_mi()
                         or (a.bootcamp_id is not null and public.ana_egitmen_mi(a.bootcamp_id))
                    then (select count(*) from (select id from public.kisiler where aktif and a.bootcamp_id is null
                          union select public._hat_kisileri(a.bootcamp_id) where a.bootcamp_id is not null) t
                          where t.id <> a.yazan) end) x
    from public.anonslar a
    join public.kisiler k on k.id = a.yazan
    left join public.bootcamp b on b.id = a.bootcamp_id
    where a.bitis > now()
      and (a.bootcamp_id is null or public.hatta_mi(a.bootcamp_id) or public.ana_egitmen_mi(a.bootcamp_id))
  ) t
$$;

create or replace function public.anons_gorduk(p_idler bigint[]) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.anons_gorulme (anons_id, kisi_id)
  select a.id, public.mevcut_kisi_id() from public.anonslar a
   where a.id = any (p_idler) and a.bitis > now() and public.mevcut_kisi_id() is not null
     and (a.bootcamp_id is null or public.hatta_mi(a.bootcamp_id) or public.ana_egitmen_mi(a.bootcamp_id))
  on conflict do nothing
$$;

-- ------------------------------------------------------------ talepler (PO'na ilet)
create or replace function public.talep_gonder(p_bootcamp uuid, p_konu text, p_metin text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint; v_ben uuid := public.mevcut_kisi_id(); v_ad text; v_kod text; k uuid;
begin
  if v_ben is null or not public.hatta_mi(p_bootcamp) then
    raise exception 'yalnızca bu programda yer alanlar PO''ya yazabilir' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bootcamp_yetkilileri where bootcamp_id = p_bootcamp and yetki = 'po') then
    raise exception 'bu programın PO''su tanımlı değil' using errcode = '22023';
  end if;
  insert into public.talepler (gonderen, bootcamp_id, konu, metin) values (v_ben, p_bootcamp, p_konu, btrim(p_metin))
  returning id into v_id;
  select ad into v_ad from public.kisiler where id = v_ben;
  select kisa_kod into v_kod from public.bootcamp where id = p_bootcamp;
  for k in select kisi_id from public.bootcamp_yetkilileri where bootcamp_id = p_bootcamp and yetki = 'po' loop
    if k <> v_ben then
      perform public._push_ekle(k, '✉️ Yeni talep · ' || v_ad, v_kod || ' · ' || p_konu || ': ' || btrim(p_metin), '/?tabela=po');
    end if;
  end loop;
  return v_id;
end $$;

create or replace function public.talep_cevapla(p_id bigint, p_metin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.talepler; v_ad text;
begin
  select * into t from public.talepler where id = p_id for update;
  if not found or not public.ana_egitmen_mi(t.bootcamp_id) then
    raise exception 'bu talebi cevaplama yetkiniz yok' using errcode = '42501';
  end if;
  if t.cevap is not null then raise exception 'bu talep zaten cevaplandı' using errcode = '22023'; end if;
  if btrim(coalesce(p_metin, '')) = '' then raise exception 'cevap boş olamaz' using errcode = '22023'; end if;
  update public.talepler set cevap = btrim(p_metin), cevaplayan = public.mevcut_kisi_id(), cevap_zamani = now(),
         po_okudu = coalesce(po_okudu, now()), gonderen_okudu = null
   where id = p_id;
  select ad into v_ad from public.kisiler where id = public.mevcut_kisi_id();
  perform public._push_ekle(t.gonderen, '💬 ' || coalesce(v_ad, 'PO') || ' cevap verdi', btrim(p_metin), '/?tabela=po');
end $$;

-- Gönderen tarafı: kendi talepleri; PO tarafı: kendi programlarına gelenler (yönetici hepsini görür).
create or replace function public.taleplerim() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x ->> 'olusturma' desc), '[]') from (
    select jsonb_build_object(
      'id', t.id, 'konu', t.konu, 'metin', t.metin, 'olusturma', t.olusturma,
      'bootcamp_id', t.bootcamp_id, 'kod', b.kisa_kod, 'renk', b.renk,
      'gonderen', g.ad, 'benim', t.gonderen = public.mevcut_kisi_id(),
      'gelen', t.gonderen <> public.mevcut_kisi_id() and public.ana_egitmen_mi(t.bootcamp_id),
      'cevap', t.cevap, 'cevaplayan', c.ad, 'cevap_zamani', t.cevap_zamani,
      'okunmadi', case when t.gonderen = public.mevcut_kisi_id() then t.cevap is not null and t.gonderen_okudu is null
                       else t.po_okudu is null end) x
    from public.talepler t
    join public.bootcamp b on b.id = t.bootcamp_id
    join public.kisiler g on g.id = t.gonderen
    left join public.kisiler c on c.id = t.cevaplayan
    where t.gonderen = public.mevcut_kisi_id() or public.ana_egitmen_mi(t.bootcamp_id)
  ) t
$$;

create or replace function public.talepleri_okudum() returns void
language sql volatile security definer set search_path = '' as $$
  update public.talepler set gonderen_okudu = now()
   where gonderen = public.mevcut_kisi_id() and cevap is not null and gonderen_okudu is null;
  update public.talepler set po_okudu = now()
   where po_okudu is null and gonderen <> public.mevcut_kisi_id() and public.ana_egitmen_mi(bootcamp_id);
$$;

-- ------------------------------------------------------------ push aboneliği ve ayar
create or replace function public.push_abone_ol(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.mevcut_kisi_id() is null then raise exception 'giriş gerekli' using errcode = '42501'; end if;
  insert into public.push_abonelikleri (kisi_id, endpoint, p256dh, auth)
  values (public.mevcut_kisi_id(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set kisi_id = excluded.kisi_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.push_abonelik_sil(p_endpoint text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.push_abonelikleri where endpoint = p_endpoint and kisi_id = public.mevcut_kisi_id()
$$;

create or replace function public.bildirim_ayarim(p_hatirlatma boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ben uuid := public.mevcut_kisi_id();
begin
  if v_ben is null then raise exception 'giriş gerekli' using errcode = '42501'; end if;
  if p_hatirlatma is not null then update public.kisiler set push_hatirlatma = p_hatirlatma where id = v_ben; end if;
  return jsonb_build_object('hatirlatma', (select push_hatirlatma from public.kisiler where id = v_ben),
                            'cihaz', (select count(*) from public.push_abonelikleri where kisi_id = v_ben));
end $$;

-- ------------------------------------------------------------ gönderici (push-gonder Edge Function, service_role)
-- Ders hatırlatması: 50–70 dk sonra başlayan planlı oturumun eğitmenlerine (isteyenlere), oturum başına bir kez.
create or replace function public.push_hatirlatmalari() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int := 0; r record;
begin
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
  return n;
end $$;

-- Gönderilecekler: sessiz saatlerde (TR 23:00–08:00) yalnızca acil olanlar. 1 günden eski bekleyenler düşer.
create or replace function public.push_bekleyenler(p_limit int default 200) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_saat int := extract(hour from now() at time zone 'Europe/Istanbul');
begin
  update public.push_kuyrugu set gonderildi = now(), hata = 'süresi geçti'
   where gonderildi is null and olusturma < now() - interval '1 day';
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'baslik', q.baslik, 'govde', q.govde, 'url', q.url,
            'abonelikler', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                              from public.push_abonelikleri s where s.kisi_id = q.kisi_id)))
    from (select * from public.push_kuyrugu
           where gonderildi is null and public.q_acil_mi(acil, v_saat)
           order by olusturma limit p_limit) q), '[]');
end $$;

create or replace function public.q_acil_mi(p_acil boolean, p_saat int) returns boolean
language sql immutable set search_path = '' as $$ select p_acil or p_saat between 8 and 22 $$;

create or replace function public.push_sonuc(p_gonderilen bigint[], p_olu_endpointler text[], p_hatalar jsonb default '{}')
returns void language sql volatile security definer set search_path = '' as $$
  update public.push_kuyrugu set gonderildi = now(), hata = p_hatalar ->> id::text where id = any (p_gonderilen);
  delete from public.push_abonelikleri where endpoint = any (p_olu_endpointler);
  update public.push_abonelikleri set son_kullanim = now()
   where kisi_id in (select kisi_id from public.push_kuyrugu where id = any (p_gonderilen))
     and not endpoint = any (p_olu_endpointler);
$$;

-- ------------------------------------------------------------ yetkiler
revoke execute on function public._hat_kisileri(uuid), public._push_ekle(uuid, text, text, text, boolean, text),
  public._bildirimden_push(), public.push_hatirlatmalari(), public.push_bekleyenler(int),
  public.push_sonuc(bigint[], text[], jsonb), public.q_acil_mi(boolean, int) from public, anon, authenticated;
grant execute on function public.push_hatirlatmalari(), public.push_bekleyenler(int),
  public.push_sonuc(bigint[], text[], jsonb) to service_role;
revoke execute on function public.anons_yaz(uuid, text), public.anonslarim(), public.anons_gorduk(bigint[]),
  public.talep_gonder(uuid, text, text), public.talep_cevapla(bigint, text), public.taleplerim(), public.talepleri_okudum(),
  public.push_abone_ol(text, text, text), public.push_abonelik_sil(text), public.bildirim_ayarim(boolean),
  public.hatta_mi(uuid) from public, anon;
grant execute on function public.anons_yaz(uuid, text), public.anonslarim(), public.anons_gorduk(bigint[]),
  public.talep_gonder(uuid, text, text), public.talep_cevapla(bigint, text), public.taleplerim(), public.talepleri_okudum(),
  public.push_abone_ol(text, text, text), public.push_abonelik_sil(text), public.bildirim_ayarim(boolean),
  public.hatta_mi(uuid) to authenticated;
