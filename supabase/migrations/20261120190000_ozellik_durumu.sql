-- Özellik herkese açık mı (yöneticinin "önizleme" etiketi için). ozellik_acik yöneticide hep true döner.
create or replace function public.ozellik_herkese_acik(p_anahtar text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select acik from public.uygulama_ayarlari where anahtar = p_anahtar), false)
$$;
revoke execute on function public.ozellik_herkese_acik(text) from public, anon;
grant execute on function public.ozellik_herkese_acik(text) to authenticated;
