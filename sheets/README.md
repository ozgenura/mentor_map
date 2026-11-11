# Google Sheets şablonu

- `sablon_uret.py`: canlı veritabanından doldurulmuş şablonu (.xlsx) üretir; Drive'a yüklenince Google Sheets'e dönüşür.
- `MentorMap.gs`: şablona eklenen Apps Script. Her düzenlemeden ~1 dakika sonra tüm sayfayı `sheets-senkron`
  Edge Function'ına gönderir; sonucu "Senkron" sekmesine yazar, hatalı satırları boyar.

Akış: Sheets → Apps Script → `functions/v1/sheets-senkron` (X-Mentormap-Anahtar) → `public.sheets_senkron(jsonb)`.
Anahtarı yönetici uygulamada Profil → Google Sheets bağlantısı kartında üretir; veritabanında yalnızca sha256 özeti durur.
