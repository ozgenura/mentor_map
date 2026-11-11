-- Giriş yalnızca kisiler tablosunda aktif kaydı olan e-postalara açıktır.
-- Supabase Auth "Before User Created" kancası: ilk kodu isteyen e-posta listede yoksa hesap hiç açılmaz.
create or replace function public.kayit_kontrol(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if exists (select 1 from public.kisiler k where lower(k.eposta) = e and k.aktif) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Bu e-posta Mentor Map''te kayıtlı değil. Operasyon ekibine yazın.'));
end $$;

revoke execute on function public.kayit_kontrol(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.kayit_kontrol(jsonb) to supabase_auth_admin';
  end if;
end $$;
