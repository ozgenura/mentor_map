-- Özellik anahtarları: yeni bir özellik önce yalnızca yöneticide açılır, hazır olunca herkese açılır.
-- 'tabelalar' (Durak tabelası: anonslar ve PO'na ilet) şimdilik kapalı; herkese açmak için:
--   update public.uygulama_ayarlari set acik = true where anahtar = 'tabelalar';

create table if not exists public.uygulama_ayarlari (
  anahtar text primary key,
  acik boolean not null default false,
  aciklama text
);
alter table public.uygulama_ayarlari enable row level security;
revoke all on public.uygulama_ayarlari from anon, authenticated;
insert into public.uygulama_ayarlari (anahtar, acik, aciklama)
values ('tabelalar', false, 'Durak tabelası: anonslar ve PO''na ilet')
on conflict (anahtar) do nothing;

-- Yönetici için her özellik açık (deneyebilsin diye).
create or replace function public.ozellik_acik(p_anahtar text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.yonetici_mi() or coalesce((select acik from public.uygulama_ayarlari where anahtar = p_anahtar), false)
$$;
revoke execute on function public.ozellik_acik(text) from public, anon;
grant execute on function public.ozellik_acik(text) to authenticated;

create or replace function public.anons_yaz(p_bootcamp uuid, p_metin text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint; v_ben uuid := public.mevcut_kisi_id(); v_kod text; k uuid;
begin
  if not public.ozellik_acik('tabelalar') then
    raise exception 'anonslar henüz açık değil' using errcode = '42501';
  end if;
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

create or replace function public.talep_gonder(p_bootcamp uuid, p_konu text, p_metin text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint; v_ben uuid := public.mevcut_kisi_id(); v_ad text; v_kod text; k uuid;
begin
  if not public.ozellik_acik('tabelalar') then
    raise exception 'PO''na ilet henüz açık değil' using errcode = '42501';
  end if;
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
