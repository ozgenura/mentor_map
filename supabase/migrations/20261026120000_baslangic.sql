-- Mentor Map başlangıç şeması.
-- Yetkiler RLS ve security definer RPC'lerle veritabanında zorlanır; arayüz sadece yansıtır.
-- Saatler TR yerel saatiyle girilir, timestamptz olarak saklanır.

-- ============================================================ türler

create type public.rol as enum ('egitmen', 'yonetici');
create type public.oturum_durumu as enum ('planli', 'iptal');
create type public.oturum_kaynagi as enum ('excel', 'uygulama');
create type public.oturum_turu as enum
  ('Kick-Off', 'Ders', 'Uygulama', 'Master Class', 'Proje', 'Sunum', 'Yan Seans');
create type public.anlatici_rolu as enum ('ana', 'yardimci', 'konuk');

-- ============================================================ tablolar

create table public.kisiler (
  id uuid primary key default gen_random_uuid(),
  ad text not null check (btrim(ad) <> ''),
  eposta text not null check (eposta like '%@%'),
  saat_dilimi text not null default 'Europe/Istanbul',
  rol public.rol not null default 'egitmen',
  aktif boolean not null default true,
  olusturma timestamptz not null default now()
);
create unique index kisiler_eposta_uq on public.kisiler (lower(eposta));
create unique index kisiler_ad_uq on public.kisiler (ad);

-- Takvim aboneliği token'ı ayrı tabloda: herkes herkesin adını görür ama token'ı görmez.
create table public.takvim_tokenlari (
  kisi_id uuid primary key references public.kisiler (id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  olusturma timestamptz not null default now()
);

-- Excel'deki ham ad yazımları ("Ayşe K.") -> kişi. Anahtar: küçük harf, tek boşluk.
create table public.kisi_aliaslari (
  ham_ad text primary key,
  kisi_id uuid not null references public.kisiler (id) on delete cascade
);

create table public.bootcamp (
  id uuid primary key default gen_random_uuid(),
  ad text not null unique,
  kisa_kod text not null unique,
  renk text not null default '#6366f1',
  baslangic date,
  bitis date,
  -- [{"gun": 2, "baslangic": "20:30", "bitis": "24:00", "tur": "Ders"}]  (Faz 3)
  ders_kaliplari jsonb not null default '[]'::jsonb,
  olusturma timestamptz not null default now()
);

create table public.bootcamp_yetkilileri (
  bootcamp_id uuid not null references public.bootcamp (id) on delete cascade,
  kisi_id uuid not null references public.kisiler (id) on delete cascade,
  yetki text not null default 'ana_egitmen' check (yetki in ('ana_egitmen')),
  primary key (bootcamp_id, kisi_id, yetki)
);

create table public.oturumlar (
  id uuid primary key default gen_random_uuid(),
  bootcamp_id uuid not null references public.bootcamp (id) on delete cascade,
  tarih date not null,                 -- TR tarihine göre gün
  baslangic timestamptz,               -- null = saat bilinmiyor (SAAT_YOK)
  bitis timestamptz,
  slot text not null default '',
  tur public.oturum_turu not null default 'Ders',
  konu text not null default '',
  aciklama text,
  toplanti_linki text,
  materyal_linki text,
  notlar text,
  durum public.oturum_durumu not null default 'planli',
  iptal_gerekcesi text,
  iptal_eden uuid references public.kisiler (id) on delete set null,
  iptal_zamani timestamptz,
  kaynak public.oturum_kaynagi not null,
  dis_anahtar text unique,             -- Excel oturumları: bootcamp-tarih-slot
  kaynak_hucre text,                   -- Excel hücre adresi (hata ayıklama)
  uyarilar text[] not null default '{}',
  excelden_kalkti boolean not null default false,
  olusturan uuid references public.kisiler (id) on delete set null,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  surum integer not null default 0,    -- .ics SEQUENCE
  check ((baslangic is null) = (bitis is null)),
  check (bitis is null or bitis > baslangic),
  check (kaynak = 'uygulama' or dis_anahtar is not null),
  check (durum = 'planli' or btrim(coalesce(iptal_gerekcesi, '')) <> '')
);
create index oturumlar_tarih_idx on public.oturumlar (tarih);
create index oturumlar_bootcamp_idx on public.oturumlar (bootcamp_id);

create table public.oturum_anlaticilari (
  id uuid primary key default gen_random_uuid(),
  oturum_id uuid not null references public.oturumlar (id) on delete cascade,
  kisi_id uuid references public.kisiler (id) on delete cascade,
  konuk_ad text,
  rol public.anlatici_rolu not null default 'ana',
  check ((kisi_id is not null) <> (btrim(coalesce(konuk_ad, '')) <> '')),
  check (kisi_id is not null or rol = 'konuk')
);
create unique index oturum_anlaticilari_kisi_uq on public.oturum_anlaticilari (oturum_id, kisi_id)
  where kisi_id is not null;
create index oturum_anlaticilari_kisi_idx on public.oturum_anlaticilari (kisi_id);

create table public.degisiklik_kaydi (
  id bigint generated always as identity primary key,
  oturum_id uuid references public.oturumlar (id) on delete set null,
  kisi_id uuid references public.kisiler (id) on delete set null,   -- null = içe aktarım / sistem
  zaman timestamptz not null default now(),
  islem text not null,
  eski jsonb,
  yeni jsonb
);
create index degisiklik_kaydi_oturum_idx on public.degisiklik_kaydi (oturum_id);

create table public.bildirim_kuyrugu (
  id bigint generated always as identity primary key,
  kisi_id uuid not null references public.kisiler (id) on delete cascade,
  olay text not null,
  oturum_id uuid references public.oturumlar (id) on delete cascade,
  detay jsonb not null default '{}'::jsonb,
  olusturma timestamptz not null default now(),
  gonderildi timestamptz,
  hata text
);
create index bildirim_kuyrugu_bekleyen_idx on public.bildirim_kuyrugu (olusturma) where gonderildi is null;

create table public.ice_aktarimlar (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  dosya_adi text not null,
  ozet jsonb not null,
  onaylayan text
);

-- ============================================================ yardımcı fonksiyonlar

-- Giriş yapan kişinin kisiler.id'si (JWT'deki e-posta ile). Aktif değilse null.
create function public.mevcut_kisi_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select k.id from public.kisiler k
  where lower(k.eposta) = lower(coalesce(auth.jwt() ->> 'email', '')) and k.aktif
  limit 1
$$;

create function public.yonetici_mi() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.kisiler k
    where k.id = public.mevcut_kisi_id() and k.rol = 'yonetici')
$$;

create function public.ana_egitmen_mi(p_bootcamp_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yonetici_mi() or exists (
    select 1 from public.bootcamp_yetkilileri y
    where y.bootcamp_id = p_bootcamp_id and y.kisi_id = public.mevcut_kisi_id()
      and y.yetki = 'ana_egitmen')
$$;

-- TR yerel tarih + saat -> timestamptz. '24:00' ertesi gün 00:00 olur.
create function public.tr_zaman(p_tarih date, p_saat time) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_tarih + p_saat) at time zone 'Europe/Istanbul'
$$;

-- ============================================================ tetikleyiciler

create function public.kisi_token_olustur() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.takvim_tokenlari (kisi_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger kisiler_token after insert on public.kisiler
  for each row execute function public.kisi_token_olustur();

-- Bir oturumla ilgili kişilere (anlatıcılar + ana eğitmenler) bildirim kuyruğu satırı yazar.
-- İşlemi yapan kişinin kendisine bildirim gitmez.
create function public.bildirim_kuyruga_ekle(p_oturum_id uuid, p_olay text, p_detay jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.bildirim_kuyrugu (kisi_id, olay, oturum_id, detay)
  select distinct x.kisi_id, p_olay, p_oturum_id, p_detay
  from (
    select a.kisi_id from public.oturum_anlaticilari a
    where a.oturum_id = p_oturum_id and a.kisi_id is not null
    union
    select y.kisi_id from public.bootcamp_yetkilileri y
    join public.oturumlar o on o.bootcamp_id = y.bootcamp_id
    where o.id = p_oturum_id
  ) x
  join public.kisiler k on k.id = x.kisi_id and k.aktif
  where x.kisi_id is distinct from public.mevcut_kisi_id()
$$;

create function public.oturum_once_guncelle() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.guncelleme := now();
  if (new.tarih, new.baslangic, new.bitis, new.durum, new.konu, new.tur, new.aciklama,
      new.toplanti_linki, new.materyal_linki)
     is distinct from
     (old.tarih, old.baslangic, old.bitis, old.durum, old.konu, old.tur, old.aciklama,
      old.toplanti_linki, old.materyal_linki) then
    new.surum := old.surum + 1;
  end if;
  return new;
end $$;

create trigger oturumlar_once_guncelle before update on public.oturumlar
  for each row execute function public.oturum_once_guncelle();

create function public.oturum_kaydet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kaynak text := coalesce(nullif(current_setting('mentormap.islem_kaynagi', true), ''), 'uygulama');
  v_islem text;
  v_eski jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_yeni jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    v_islem := 'ekleme';
  elsif old.durum = 'planli' and new.durum = 'iptal' then
    v_islem := 'iptal';
  elsif old.durum = 'iptal' and new.durum = 'planli' then
    v_islem := 'iptal_geri_alma';
  else
    v_islem := 'guncelleme';
  end if;
  if tg_op = 'UPDATE' then
    -- yalnızca değişen alanları sakla
    select coalesce(jsonb_object_agg(k, v_eski -> k), '{}'), coalesce(jsonb_object_agg(k, v_yeni -> k), '{}')
      into v_eski, v_yeni
    from jsonb_object_keys(v_yeni) k
    where k not in ('guncelleme', 'surum') and (v_eski -> k) is distinct from (v_yeni -> k);
    if v_yeni = '{}'::jsonb then
      return new;
    end if;
  end if;
  insert into public.degisiklik_kaydi (oturum_id, kisi_id, islem, eski, yeni)
  values (new.id, public.mevcut_kisi_id(),
          case when v_kaynak = 'ice_aktarim' then 'ice_aktarim_' || v_islem else v_islem end,
          v_eski, v_yeni);

  if tg_op = 'UPDATE' and new.tarih >= (now() at time zone 'Europe/Istanbul')::date - 1 then
    if v_islem in ('iptal', 'iptal_geri_alma') then
      perform public.bildirim_kuyruga_ekle(new.id, v_islem,
        jsonb_build_object('gerekce', new.iptal_gerekcesi));
    elsif (old.tarih, old.baslangic, old.bitis) is distinct from (new.tarih, new.baslangic, new.bitis) then
      perform public.bildirim_kuyruga_ekle(new.id, 'zaman_degisti',
        jsonb_build_object('eski_tarih', old.tarih, 'eski_baslangic', old.baslangic,
                           'eski_bitis', old.bitis));
    end if;
  end if;
  return new;
end $$;

create trigger oturumlar_kaydet after insert or update on public.oturumlar
  for each row execute function public.oturum_kaydet();

-- ============================================================ RLS

alter table public.kisiler enable row level security;
alter table public.takvim_tokenlari enable row level security;
alter table public.kisi_aliaslari enable row level security;
alter table public.bootcamp enable row level security;
alter table public.bootcamp_yetkilileri enable row level security;
alter table public.oturumlar enable row level security;
alter table public.oturum_anlaticilari enable row level security;
alter table public.degisiklik_kaydi enable row level security;
alter table public.bildirim_kuyrugu enable row level security;
alter table public.ice_aktarimlar enable row level security;

-- Okuma: kayıtlı ve aktif her eğitmen tüm programı görür (karar: eğitmenler birbirini görür).
create policy okuma on public.kisiler for select to authenticated
  using (public.mevcut_kisi_id() is not null);
create policy okuma on public.bootcamp for select to authenticated
  using (public.mevcut_kisi_id() is not null);
create policy okuma on public.bootcamp_yetkilileri for select to authenticated
  using (public.mevcut_kisi_id() is not null);
create policy okuma on public.oturumlar for select to authenticated
  using (public.mevcut_kisi_id() is not null);
create policy okuma on public.oturum_anlaticilari for select to authenticated
  using (public.mevcut_kisi_id() is not null);

create policy kendi_tokeni on public.takvim_tokenlari for select to authenticated
  using (kisi_id = public.mevcut_kisi_id() or public.yonetici_mi());

create policy okuma on public.degisiklik_kaydi for select to authenticated
  using (public.yonetici_mi() or exists (
    select 1 from public.oturumlar o
    where o.id = oturum_id and public.ana_egitmen_mi(o.bootcamp_id)));

-- Yazma: doğrudan tablo yazımı yalnızca yöneticiye açık. Ana eğitmen RPC'lerle çalışır.
create policy yonetici on public.kisiler for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.kisi_aliaslari for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.bootcamp for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.bootcamp_yetkilileri for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.oturumlar for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.oturum_anlaticilari for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.bildirim_kuyrugu for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy yonetici on public.ice_aktarimlar for all to authenticated
  using (public.yonetici_mi()) with check (public.yonetici_mi());

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.degisiklik_kaydi, public.takvim_tokenlari from authenticated;

-- ============================================================ görünüm

create view public.oturum_gorunumu with (security_invoker = true) as
select o.id, o.bootcamp_id, b.ad as bootcamp_ad, b.kisa_kod, b.renk,
       o.tarih, o.baslangic, o.bitis, o.slot, o.tur, o.konu, o.aciklama, o.toplanti_linki,
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

-- ============================================================ RPC'ler

create function public.oturum_iptal(p_oturum_id uuid, p_gerekce text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.oturumlar;
begin
  select * into v from public.oturumlar where id = p_oturum_id for update;
  if not found then raise exception 'oturum bulunamadı' using errcode = 'P0002'; end if;
  if not public.ana_egitmen_mi(v.bootcamp_id) then
    raise exception 'bu bootcamp için iptal yetkiniz yok' using errcode = '42501';
  end if;
  if btrim(coalesce(p_gerekce, '')) = '' then
    raise exception 'iptal gerekçesi zorunlu' using errcode = '22023';
  end if;
  if v.durum = 'iptal' then raise exception 'oturum zaten iptal' using errcode = '22023'; end if;
  update public.oturumlar
     set durum = 'iptal', iptal_gerekcesi = btrim(p_gerekce), iptal_eden = public.mevcut_kisi_id(),
         iptal_zamani = now()
   where id = p_oturum_id;
end $$;

create function public.oturum_iptal_geri_al(p_oturum_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.oturumlar;
begin
  select * into v from public.oturumlar where id = p_oturum_id for update;
  if not found then raise exception 'oturum bulunamadı' using errcode = 'P0002'; end if;
  if not public.ana_egitmen_mi(v.bootcamp_id) then
    raise exception 'bu bootcamp için yetkiniz yok' using errcode = '42501';
  end if;
  if v.durum <> 'iptal' then raise exception 'oturum iptal değil' using errcode = '22023'; end if;
  update public.oturumlar
     set durum = 'planli', iptal_gerekcesi = null, iptal_eden = null, iptal_zamani = null
   where id = p_oturum_id;
end $$;

-- Ana eğitmenin düzenleyebildiği alanlar. Bu alanlar Excel'de yoktur, içe aktarım ezmez.
create function public.oturum_detay_guncelle(
  p_oturum_id uuid, p_aciklama text, p_toplanti_linki text, p_materyal_linki text, p_notlar text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_bootcamp uuid;
begin
  select bootcamp_id into v_bootcamp from public.oturumlar where id = p_oturum_id;
  if not found then raise exception 'oturum bulunamadı' using errcode = 'P0002'; end if;
  if not public.ana_egitmen_mi(v_bootcamp) then
    raise exception 'bu bootcamp için yetkiniz yok' using errcode = '42501';
  end if;
  update public.oturumlar
     set aciklama = nullif(btrim(p_aciklama), ''), toplanti_linki = nullif(btrim(p_toplanti_linki), ''),
         materyal_linki = nullif(btrim(p_materyal_linki), ''), notlar = nullif(btrim(p_notlar), '')
   where id = p_oturum_id;
end $$;

-- p_anlaticilar: [{"kisi_id": "<uuid>"} | {"konuk_ad": "Ad Soyad"}], en az bir anlatıcı.
create function public._anlaticilari_yaz(p_oturum_id uuid, p_anlaticilar jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_anlaticilar) <> 'array' or jsonb_array_length(p_anlaticilar) = 0 then
    raise exception 'en az bir anlatıcı gerekli' using errcode = '22023';
  end if;
  delete from public.oturum_anlaticilari where oturum_id = p_oturum_id;
  for e in select * from jsonb_array_elements(p_anlaticilar) loop
    n := n + 1;
    if e ? 'kisi_id' then
      insert into public.oturum_anlaticilari (oturum_id, kisi_id, rol)
      values (p_oturum_id, (e ->> 'kisi_id')::uuid, case when n = 1 then 'ana' else 'yardimci' end
              ::public.anlatici_rolu);
    elsif btrim(coalesce(e ->> 'konuk_ad', '')) <> '' then
      insert into public.oturum_anlaticilari (oturum_id, konuk_ad, rol)
      values (p_oturum_id, btrim(e ->> 'konuk_ad'), 'konuk');
    else
      raise exception 'geçersiz anlatıcı: %', e using errcode = '22023';
    end if;
  end loop;
end $$;

create function public.yan_seans_ekle(
  p_bootcamp_id uuid, p_tarih date, p_baslangic time, p_bitis time, p_konu text,
  p_anlaticilar jsonb, p_tur public.oturum_turu default 'Yan Seans', p_aciklama text default null,
  p_toplanti_linki text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_bas timestamptz := public.tr_zaman(p_tarih, p_baslangic);
  v_bit timestamptz := public.tr_zaman(p_tarih, p_bitis);
begin
  if not public.ana_egitmen_mi(p_bootcamp_id) then
    raise exception 'bu bootcamp için seans ekleme yetkiniz yok' using errcode = '42501';
  end if;
  if v_bit <= v_bas then raise exception 'bitiş başlangıçtan sonra olmalı' using errcode = '22023'; end if;
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

create function public.yan_seans_guncelle(
  p_oturum_id uuid, p_tarih date, p_baslangic time, p_bitis time, p_konu text,
  p_anlaticilar jsonb, p_tur public.oturum_turu default 'Yan Seans', p_aciklama text default null,
  p_toplanti_linki text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.oturumlar;
  v_bas timestamptz := public.tr_zaman(p_tarih, p_baslangic);
  v_bit timestamptz := public.tr_zaman(p_tarih, p_bitis);
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
  if v_bit <= v_bas then raise exception 'bitiş başlangıçtan sonra olmalı' using errcode = '22023'; end if;
  update public.oturumlar
     set tarih = p_tarih, baslangic = v_bas, bitis = v_bit, tur = p_tur, konu = btrim(p_konu),
         aciklama = nullif(btrim(p_aciklama), ''), toplanti_linki = nullif(btrim(p_toplanti_linki), '')
   where id = p_oturum_id;
  perform public._anlaticilari_yaz(p_oturum_id, p_anlaticilar);
  perform public.bildirim_kuyruga_ekle(p_oturum_id, 'yan_seans_degisti');
end $$;

-- Verilen kişilerin, verilen aralıkla çakışan planlı oturumları.
-- Saatsiz oturum aynı TR gününe düşüyorsa OLASI sayılır.
create function public.cakisma_kontrol(
  p_kisi_ids uuid[], p_baslangic timestamptz, p_bitis timestamptz, p_haric uuid default null)
returns table (oturum_id uuid, kisi_id uuid, kisi_ad text, bootcamp_ad text, konu text,
               baslangic timestamptz, bitis timestamptz, tip text)
language sql stable security definer set search_path = '' as $$
  select o.id, k.id, k.ad, b.ad, o.konu, o.baslangic, o.bitis,
         case when o.baslangic is null then 'OLASI' else 'KESIN' end
  from public.oturumlar o
  join public.oturum_anlaticilari a on a.oturum_id = o.id
  join public.kisiler k on k.id = a.kisi_id
  join public.bootcamp b on b.id = o.bootcamp_id
  where public.mevcut_kisi_id() is not null
    and a.kisi_id = any (p_kisi_ids)
    and o.durum = 'planli'
    and o.id is distinct from p_haric
    and (
      (o.baslangic is not null and o.baslangic < p_bitis and p_baslangic < o.bitis)
      or (o.baslangic is null and o.tarih = (p_baslangic at time zone 'Europe/Istanbul')::date)
    )
  order by o.baslangic nulls first, k.ad
$$;

create function public.takvim_token_yenile(p_kisi_id uuid default null) returns text
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
  return v_token;
end $$;

create function public.son_guncelleme() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest((select max(zaman) from public.ice_aktarimlar),
                  (select max(guncelleme) from public.oturumlar))
  where public.mevcut_kisi_id() is not null
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mevcut_kisi_id(), public.yonetici_mi(), public.ana_egitmen_mi(uuid),
  public.oturum_iptal(uuid, text), public.oturum_iptal_geri_al(uuid),
  public.oturum_detay_guncelle(uuid, text, text, text, text),
  public.yan_seans_ekle(uuid, date, time, time, text, jsonb, public.oturum_turu, text, text),
  public.yan_seans_guncelle(uuid, date, time, time, text, jsonb, public.oturum_turu, text, text),
  public.cakisma_kontrol(uuid[], timestamptz, timestamptz, uuid),
  public.takvim_token_yenile(uuid), public.son_guncelleme(), public.tr_zaman(date, time)
to authenticated;
