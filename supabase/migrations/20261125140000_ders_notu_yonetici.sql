-- Yönetici her dersin notunu görür ve yazabilir/düzeltebilir (her ekranı deneyebilsin diye).
create or replace function public._ders_notu_yazari_mi(p_oturum uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yonetici_mi()
      or exists (select 1 from public.oturum_anlaticilari a
                  where a.oturum_id = p_oturum and a.rol = 'ana' and a.kisi_id = public.mevcut_kisi_id())
$$;
revoke execute on function public._ders_notu_yazari_mi(uuid) from public, anon, authenticated;
