-- Ek e-postalar (kisiler.ek_epostalar) girişte de tanınır: kişi bu adreslerden biriyle giriş yaptığında
-- aynı kişi sayılır (yetkiler, takvim, düzenleme). Ek adresler yalnızca uygulama/yönetici tarafından eklenir;
-- Sheets senkronu ek_epostalar'a yazmaz. Önce ana e-posta eşleşir.
create or replace function public.mevcut_kisi_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select k.id from public.kisiler k
  where k.aktif and (lower(k.eposta) = lower(coalesce(auth.jwt() ->> 'email', ''))
                     or lower(coalesce(auth.jwt() ->> 'email', '')) = any (select lower(x) from unnest(k.ek_epostalar) x))
  order by (lower(k.eposta) = lower(coalesce(auth.jwt() ->> 'email', ''))) desc
  limit 1
$$;
