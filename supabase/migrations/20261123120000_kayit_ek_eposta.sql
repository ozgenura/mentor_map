-- Giriş kancası ek e-postaları da tanır: kişi ek adresiyle (ör. kişisel Gmail) ilk kez girerken hesap açılabilsin.
-- (mevcut_kisi_id ek adresleri 18 Kasım'dan beri tanıyordu; hesabın açılmasına izin veren kanca tanımıyordu.)
create or replace function public.kayit_kontrol(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if exists (select 1 from public.kisiler k
             where k.aktif and (lower(k.eposta) = e or e = any (select lower(x) from unnest(k.ek_epostalar) x))) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Bu e-posta Mentor Map''te kayıtlı değil. Yöneticiye yaz.'));
end $$;
