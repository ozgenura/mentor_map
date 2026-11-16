-- Kurum program şablonundan gelen oturumlar için ayrı kaynak (ayrı migration: yeni enum değeri aynı işlemde kullanılamaz).
alter type public.oturum_kaynagi add value if not exists 'sablon';
