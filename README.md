# Mentor Map

Eğitmenlerin bootcamp programını gördüğü ve yönettiği dahili takvim. Ürün ve teknik kararlar:
[Mentor Map — Ürün ve Teknik Doküman](https://claude.ai/artifact/1M2b4HuEVdfjTdkC4jZNqQ).

| Klasör | İçerik |
| --- | --- |
| `importer/` | Excel içe aktarıcı (Python): 4 adaptör, önizleme/uygulama senkronu, kişi listesi yükleme |
| `supabase/migrations/` | Veritabanı şeması, RLS politikaları, iptal ve yan seans RPC'leri |
| `supabase/functions/ics/` | Kişiye özel takvim aboneliği (.ics) Edge Function'ı |
| `supabase/tests/` | Yetki testleri (yerel PostgreSQL üzerinde) |
| `web/` | React + Vite + Tailwind PWA |

## Durum

Faz 1 (okuma) kodu hazır: içe aktarım, giriş, benim programım / tüm program, ajanda-hafta-ay, iki saat dilimi,
takvim aboneliği, PWA. Faz 2'nin veritabanı tarafı da hazır (iptal, yan seans, detay düzenleme RPC'leri,
değişiklik kaydı, bildirim kuyruğu); arayüzü ve e-posta gönderimi henüz yok.

## Yerel geliştirme

```bash
# İçe aktarıcı + testler
cd importer
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python -m pytest                  # dummy cevap anahtarı + senkron testleri

# Veritabanı yetki testleri (yerel PostgreSQL gerekir; TEST_DATABASE_URL ile değiştirilebilir)
cd ../supabase/tests && ../../importer/.venv/bin/python -m pytest

# Web (Supabase olmadan, demo verisiyle)
cd ../../web
npm install
npm run demo-data                           # dummy Excel'den public/demo-data.json
VITE_DEMO=1 npm run dev
npm test                                    # .ics ve saat testleri
```

## Canlıya alma (bir kez)

1. **Supabase projesi:** supabase.com'da yeni proje, bölge **Frankfurt (eu-central-1)**, ücretsiz plan.
2. **Şema:** `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`
3. **Giriş ayarı:** Authentication > Providers > Email: "Allow new users to sign up" **kapalı**,
   e-posta şablonunda `{{ .Token }}` (6 haneli kod) kullanılsın. Authentication > URL Configuration'a
   uygulamanın adresi eklenir.
4. **Takvim fonksiyonu:** `npx supabase functions deploy ics --no-verify-jwt`
5. **Eğitmenler:** `importer/.env` içine `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` yazılır, sonra
   `python -m mentormap_importer.cli kisiler kisiler.csv --apply`
   (CSV sütunları: `ad,eposta,rol,saat_dilimi,ana_egitmen`; ana eğitmen sütunu bootcamp kısa kodları, `;` ile).
   Komut giriş hesaplarını da açar.
6. **Program:** `python -m mentormap_importer.cli ice-aktar program.xlsx` (önizleme), kontrol sonrası `--apply`.
7. **Web:** Cloudflare Pages'e repo bağlanır. Kök `web`, build `npm run build`, çıktı `dist`, ortam değişkenleri
   `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY`. Özel alan adı Pages ayarlarından eklenir.

## Paralel dönemde içe aktarım

Excel güncellendikçe (öneri: haftada bir):

```bash
cd importer
.venv/bin/python -m mentormap_importer.cli ice-aktar yeni.xlsx           # farkları gör
.venv/bin/python -m mentormap_importer.cli ice-aktar yeni.xlsx --apply   # yaz
```

- Uygulamadaki iptaller, açıklamalar ve linkler hiç ezilmez.
- Excel'den kalkan oturum silinmez, `excelden_kalkti` işaretlenir.
- Bir sekmede oturum sayısı %20'den fazla değişirse yazmadan durur (`--sapma-onay`).
- Eşlenemeyen eğitmen adı raporlanır: kişiyi ekleyin ya da `kisi_aliaslari` tablosuna yazım biçimini ekleyin.
