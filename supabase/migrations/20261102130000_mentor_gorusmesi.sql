-- Gerçek programlardaki (DA) mentor görüşmeleri ayrı bir oturum türü.
alter type public.oturum_turu add value if not exists 'Mentor Görüşmesi';
