-- Cihaz eşleme: girişli bir cihazda (ör. telefonun tarayıcısı) üretilen kısa kodla başka bir cihazda
-- (ör. iPhone ana ekran uygulaması) e-posta olmadan giriş. Kod 10 dakika geçerli, tek kullanımlık, 8 karakter.
-- Kodu cihaz-eslesme Edge Function kullanır: koddan kişiyi bulur, Supabase ile tek kullanımlık giriş anahtarı üretir.

create table if not exists public.cihaz_kodlari (
  kod_ozeti text primary key,                 -- sha256(kod); kodun kendisi saklanmaz
  kisi_id uuid not null references public.kisiler (id) on delete cascade,
  olusturma timestamptz not null default now(),
  bitis timestamptz not null default now() + interval '10 minutes',
  kullanildi timestamptz
);
create table if not exists public.cihaz_denemeleri (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  basarili boolean not null
);
alter table public.cihaz_kodlari enable row level security;
alter table public.cihaz_denemeleri enable row level security;
revoke all on public.cihaz_kodlari, public.cihaz_denemeleri from anon, authenticated;

-- Girişli kişi kendi için kod üretir (öncekiler geçersiz olur). Döner: "K7P2-QX9M" biçiminde kod.
create or replace function public.cihaz_kodu_olustur() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ben uuid := public.mevcut_kisi_id();
  harf constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- karışan karakterler yok (0/O, 1/I/L)
  v_kod text := '';
  b bytea := uuid_send(gen_random_uuid());
begin
  if v_ben is null then raise exception 'giriş gerekli' using errcode = '42501'; end if;
  for i in 0..7 loop v_kod := v_kod || substr(harf, 1 + (get_byte(b, i) % length(harf)), 1); end loop;
  delete from public.cihaz_kodlari where kisi_id = v_ben or bitis < now();
  insert into public.cihaz_kodlari (kod_ozeti, kisi_id) values (encode(sha256(convert_to(v_kod, 'UTF8')), 'hex'), v_ben);
  return substr(v_kod, 1, 4) || '-' || substr(v_kod, 5, 4);
end $$;

-- Edge Function (service_role): kodu kullanır, kişinin giriş e-postasını döner. Hatalı denemeler sayılır;
-- son 15 dakikada 30 hatalı deneme olursa kodla giriş geçici olarak durur (kaba kuvvete karşı).
create or replace function public.cihaz_kodu_kullan(p_kod text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_kod text := upper(regexp_replace(coalesce(p_kod, ''), '[^A-Za-z0-9]', '', 'g'));
  v_kisi uuid;
begin
  if (select count(*) from public.cihaz_denemeleri where not basarili and zaman > now() - interval '15 minutes') >= 30 then
    raise exception 'KILITLI' using errcode = 'P0001';
  end if;
  update public.cihaz_kodlari set kullanildi = now()
   where kod_ozeti = encode(sha256(convert_to(v_kod, 'UTF8')), 'hex') and kullanildi is null and bitis > now()
  returning kisi_id into v_kisi;
  insert into public.cihaz_denemeleri (basarili) values (v_kisi is not null);
  delete from public.cihaz_denemeleri where zaman < now() - interval '1 day';
  if v_kisi is null then return null; end if;
  -- giriş adresi: kişinin bu projede zaten hesabı olan adresi (ana ya da ek), yoksa ana adres
  return coalesce(
    (select u.email from auth.users u join public.kisiler k on k.id = v_kisi
      where lower(u.email) = lower(k.eposta) or lower(u.email) = any (select lower(x) from unnest(k.ek_epostalar) x)
      order by (lower(u.email) = lower(k.eposta)) desc limit 1),
    (select eposta from public.kisiler where id = v_kisi and aktif));
end $$;

revoke execute on function public.cihaz_kodu_olustur() from public, anon;
grant execute on function public.cihaz_kodu_olustur() to authenticated;
revoke execute on function public.cihaz_kodu_kullan(text) from public, anon, authenticated;
grant execute on function public.cihaz_kodu_kullan(text) to service_role;
