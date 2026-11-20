-- Profil → Bildirimler → "Deneme bildirimi gönder": kişinin kendi cihazlarına hemen (sessiz saat dahil) bir bildirim.
create or replace function public.push_deneme() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.mevcut_kisi_id() is null then raise exception 'giriş gerekli' using errcode = '42501'; end if;
  if (select count(*) from public.push_kuyrugu where kisi_id = public.mevcut_kisi_id() and anahtar like 'deneme:%'
        and olusturma > now() - interval '1 hour') >= 5 then
    raise exception 'bir saatte en çok 5 deneme' using errcode = '54000';
  end if;
  perform public._push_ekle(public.mevcut_kisi_id(), '🚇 Mentor Map', 'Bildirimler açık. Ders değişikliklerini buradan duyacaksın.',
                            '/', true, 'deneme:' || public.mevcut_kisi_id() || ':' || extract(epoch from now())::bigint);
end $$;
revoke execute on function public.push_deneme() from public, anon;
grant execute on function public.push_deneme() to authenticated;
