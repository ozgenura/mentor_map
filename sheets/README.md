# Google Sheets şablonu

- `sablon_uret.py`: canlı veritabanından doldurulmuş şablonu (.xlsx) üretir; Drive'a yüklenince Google Sheets'e dönüşür.
- `MentorMap.gs`: şablona eklenen Apps Script. Her düzenlemeden ~1 dakika sonra tüm sayfayı `sheets-senkron`
  Edge Function'ına gönderir; sonucu "Senkron" sekmesine yazar, hatalı satırları boyar.

Akış: Sheets → Apps Script → `functions/v1/sheets-senkron` (X-Mentormap-Anahtar) → `public.sheets_senkron(jsonb)`.
Anahtarı yönetici uygulamada Profil → Google Sheets bağlantısı kartında üretir; veritabanında yalnızca sha256 özeti durur.

## Kurum program şablonu

- `program_sablonu.py`: kurum dosyası şablonunu (.xlsx) üretir. Sekmeler: Nasıl doldurulur, Eğitmenler, bootcamp
  sekmeleri (örnek DA, boş `_YENİ BOOTCAMP`), Genel (bootcamp'e bağlı olmayan etkinlikler).
- Drive .xlsx'i Google Sheets'e çevirirken **başka sekmeye bağlanan açılır listeleri düşürür** (Eğitmen sütunları).
  Yükledikten sonra bu listeleri Sheets API ile ekleyin: `ONE_OF_RANGE` → `='Eğitmenler'!$A$2:$A`, `strict: false`
  (bootcamp sekmelerinde H, L, P, X sütunları 10. satırdan; Genel'de F sütunu 6. satırdan).
