-- "Ne değişti" ekranı: her eğitmen kendi bildirim kayıtlarını okuyabilir (yazamaz).
create policy kendi_bildirimlerim on public.bildirim_kuyrugu for select to authenticated
  using (kisi_id = public.mevcut_kisi_id());
