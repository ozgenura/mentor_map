# Yedek ve geri yükleme

Ücretsiz Supabase planında otomatik yedek yok. `.github/workflows/yedek.yml` her Pazar 03:17 UTC'de
`public` şemasının dökümünü alır, **parolayla şifreler** ve GitHub Actions artifact'i olarak 90 gün saklar.
Aynı iş akışı her gün projeye bir istek atarak ücretsiz projenin duraklatılmasını önler.

Depo herkese açık olduğu için artifact'ler de herkes tarafından indirilebilir. Bu yüzden döküm şifresiz hiçbir
zaman yüklenmez; parola tanımlı değilse iş akışı hata verip durur.

## Kurulum (bir kez)

GitHub'da depo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Değer |
| --- | --- |
| `SUPABASE_URL` | `https://<proje>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → publishable / anon anahtar |
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler bağlantı adresi (parolasıyla) |
| `YEDEK_PAROLASI` | Uzun, rastgele bir parola. **Parola yöneticisinde de saklayın**: kaybolursa yedekler açılamaz. |

Sonra Actions → yedek → Run workflow ile bir kez elle çalıştırıp yeşil bittiğini görün.

## Geri yükleme

1. Actions → yedek → istenen çalıştırma → Artifacts'tan `mentormap-…` dosyasını indirin, zip'i açın
   (`mentormap.dump.gpg`).
2. Önce yalnızca açıp içeriği kontrol edin (parola sorulur):

   ```bash
   scripts/yedek_ac.sh mentormap.dump.gpg
   ```

3. Boş bir Supabase projesine (ya da yerel bir Postgres'e) yükleyin. **Canlı veritabanına doğrudan yüklemeyin.**

   ```bash
   scripts/yedek_ac.sh mentormap.dump.gpg "postgresql://postgres:<parola>@<sunucu>:5432/postgres"
   ```

   Hedefte `public` şeması boş olmalı. Tablolar, RLS politikaları, fonksiyonlar ve `authenticated` yetkileri geri gelir.
   `auth` şeması (giriş hesapları) yedekte yoktur; eğitmenler ilk girişte yeniden hesap açar.

## Deneme kaydı

- 2026-11-16: yerel Postgres 16 üzerinde döküm → şifreleme → yanlış parolanın reddi → boş veritabanına geri
  yükleme denendi. 12 tablo, 17 RLS politikası, veriler ve `authenticated` yetkileri geri geldi; `anon` erişimi kapalı kaldı.
- Canlı yedekten geri yükleme: secret'lar tanımlanıp ilk yedek alındıktan sonra yapılacak.
