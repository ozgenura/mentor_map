-- Uygulama içi geri bildirim: öneri, sorun ya da başka bir not. Herkes kendi gönderdiğini görür; yönetici hepsini görür
-- ve durumunu değiştirir. Yazma yalnızca RPC ile (gönderen kişi sunucuda belirlenir).

create table public.geri_bildirimler (
  id bigint generated always as identity primary key,
  kisi_id uuid references public.kisiler (id) on delete set null,
  tur text not null check (tur in ('oneri', 'sorun', 'diger')),
  metin text not null check (btrim(metin) <> '' and length(metin) <= 2000),
  sayfa text check (length(sayfa) <= 40),
  durum text not null default 'yeni' check (durum in ('yeni', 'inceleniyor', 'yapildi', 'kapandi')),
  olusturma timestamptz not null default now()
);
create index geri_bildirimler_olusturma_idx on public.geri_bildirimler (olusturma desc);

alter table public.geri_bildirimler enable row level security;
create policy okuma on public.geri_bildirimler for select to authenticated
  using (kisi_id = public.mevcut_kisi_id() or public.yonetici_mi());
revoke all on public.geri_bildirimler from anon, authenticated;
grant select on public.geri_bildirimler to authenticated;

create function public.geri_bildirim_gonder(p_tur text, p_metin text, p_sayfa text default null) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_kisi uuid := public.mevcut_kisi_id();
  v_id bigint;
begin
  if v_kisi is null then
    raise exception 'yetki yok' using errcode = '42501';
  end if;
  -- kötüye kullanıma karşı: kişi başına saatte 20
  if (select count(*) from public.geri_bildirimler
       where kisi_id = v_kisi and olusturma > now() - interval '1 hour') >= 20 then
    raise exception 'Çok fazla geri bildirim gönderildi; biraz sonra tekrar deneyin.' using errcode = 'P0001';
  end if;
  insert into public.geri_bildirimler (kisi_id, tur, metin, sayfa)
  values (v_kisi, p_tur, btrim(p_metin), nullif(btrim(coalesce(p_sayfa, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function public.geri_bildirim_durum(p_id bigint, p_durum text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.yonetici_mi() then
    raise exception 'yetki yok' using errcode = '42501';
  end if;
  update public.geri_bildirimler set durum = p_durum where id = p_id;
end $$;

revoke execute on function public.geri_bildirim_gonder(text, text, text), public.geri_bildirim_durum(bigint, text) from public, anon;
grant execute on function public.geri_bildirim_gonder(text, text, text), public.geri_bildirim_durum(bigint, text) to authenticated;
