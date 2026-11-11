-- Kurumsal şablondaki yeni oturum türleri: Etkinlik, Ek Ders, Office Hours.
-- Not: şablon okuyucusuyla birlikte uygulanacak.
alter type public.oturum_turu add value if not exists 'Etkinlik';
alter type public.oturum_turu add value if not exists 'Ek Ders';
alter type public.oturum_turu add value if not exists 'Office Hours';
