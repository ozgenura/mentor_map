-- Asistan rolü: ders anlatmayan ama sorumlu olduğu bootcamp'leri takip eden kişi.
-- (Yeni enum değeri aynı işlemde kullanılamadığı için ayrı migration.)
alter type public.rol add value if not exists 'asistan' after 'egitmen';
