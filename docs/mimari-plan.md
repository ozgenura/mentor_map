# Mentor Map: mimari plan ve iş listesi

Son güncelleme: 16 Kasım 2026 · `d1a4207` commit'ine göre.

Bu dosya ürünün mimari kararlarını, hedef veri modelini ve kodlu iş listesini tutar. İşler `MM-xx`,
kararlar `K-x` koduyla anılır; commit mesajlarında aynı kodlar kullanılır.

> Depo herkese açık. Henüz kapanmamış güvenlik işleri burada yalnızca başlığıyla yer alır; ayrıntıları
> depo sahibindeki özel inceleme raporundadır. Bir güvenlik işi kapanınca ayrıntısı buraya eklenebilir.

## 1. Ürün ve hedef

Mentor Map, eğitmenlerin bootcamp programını gördüğü ve PO'ların yönettiği dahili takvimdir.

- **Bugün:** program Google Sheets'te tutulur, Mentor Map onu okur. Uygulamadan iptal, link, not ve yan seans
  eklenir.
- **Orta vade:** PO hem şablondan hem uygulamadan düzenler; iki taraf birbirini ezmeden eşitlenir.
- **Hedef:** tüm operasyon uygulamada, veri Supabase'de. Şablon bir düzenleme yüzeyi olarak kalabilir.

## 2. Kararlar

| Kod | Konu | Karar | Durum |
| --- | --- | --- | --- |
| K-1 | Verinin sahibi | Tek doğru Supabase. Şablon ikinci bir kaynak değil, bir düzenleme yüzeyi. İki taraf alan bazında birleştirilir (bölüm 4). | Karar verildi |
| K-2 | Kim düzenler | Yalnızca admin ve bootcamp'in PO'su. Ana eğitmen ve asistan eğitmen bootcamp'in tüm oturumlarını görür, düzenlemez. Eğitmen yalnızca anlattıklarını görür. | Uygulandı |
| K-3 | Rol modeli | Genel rol yalnızca admin ya da üye. PO, ana eğitmen ve asistan eğitmen bootcamp yetkisidir. | Uygulandı |
| K-4 | Kişinin anahtarı | `kisiler.id`; girişte `auth_user_id`. Ad tekilliği kalkar. | Bekliyor (MM-11) |
| K-5 | Kişi ve yetki yönetimi | Yalnızca uygulamadan, admin ekranından. Şablon yalnızca oturum taşır. | Karar verildi, ekran yok (MM-61, MM-66) |
| K-6 | "Silmek" | Üç ayrı durum: iptal (herkes görür, gerekçeli), kaldırıldı (programdan çıkar, geri alınabilir), kalıcı silme (yalnız admin). | Kısmen (kalkanlar listesi var) |
| K-7 | Görünürlük | Program herkese açık. E-posta ve eğitmenler arası not kimlere görünsün? | PO toplantısını bekliyor |
| K-8 | Bildirim | Akış ile gönderim ayrılır. Kanal ve hangi olayın anında gideceği belirlenecek. | PO toplantısını bekliyor |
| K-9 | Dönem | Program (DA) ve dönem (DA11) ayrı; dönemde taslak, aktif, tamamlandı durumu. | Modelde (bölüm 5) |
| K-10 | İçe aktarma yolları | Python içe aktarıcı yalnızca ilk yükleme ve göç için kalır. | Karar verildi |
| K-11 | Şablon okuyucu | Kurum program şablonunu okuyan kod yazılır; şablon orta vadede kalacağı için kalıcı yatırımdır. Eski düz Sheets senkronuna yalnızca güvenlik düzeltmesi yapılır. | Karar verildi |

**K-2 için açık soru:** son dakika iptali artık tek bir PO'ya ve admine bağlı. Vekil PO ya da "ana eğitmen
iptal edebilir" istisnası PO toplantısında sorulacak.

## 3. Bugünkü mimari

| Parça | Ne yapar |
| --- | --- |
| `web/` | React + Vite + Tailwind PWA. Veri katmanı `web/src/lib/api.ts`; demo modu `public/demo-data.json` ile çalışır. |
| `supabase/migrations/` | Şema, RLS ve RPC'ler. Yetki veritabanında zorlanır; arayüz yalnızca yansıtır. |
| `supabase/functions/ics` | Kişiye özel takvim aboneliği. Tek RPC çağırır (`takvim_oturumlari`). |
| `supabase/functions/sheets-senkron` | Şablondaki Apps Script'in çağırdığı uç. Anahtar e-tabloya bağlıdır. |
| `sheets/MentorMap.gs` | Şablondaki betik: düzenlemeden sonra tüm sayfayı gönderir, sonucu "Senkron" sekmesine yazar. |
| `sheets/program_sablonu.py` | Kurum program şablonunu üretir (bootcamp başına sekme, hafta satırları, oturum grupları). Okuyucusu henüz yok (MM-50). |
| `importer/` | Excel içe aktarıcı. İlk yükleme aracı (K-10). |

Canlı ortam: web bir Cloudflare Worker'ında, veritabanı Supabase'de. Üç yeni migration canlıya uygulanmış durumda
(`senkron_guvenlik`, `faz0_duzeltmeler`, `rol_modeli`).

## 4. İki yönlü senkron

PO mevcut programlarda hem şablondan hem uygulamadan değişiklik, ekleme ve iptal yapabilir; uygulamadaki
değişiklik şablona da yansır. Koşul: iki taraf birbirini ezmez.

### Kurallar

1. **Tek doğru Supabase.** İki taraftan gelen her değişiklik aynı sunucu fonksiyonlarından geçer.
2. **Her oturumun kalıcı kimliği var.** Şablonda satırın gizli ve korumalı sütunlarında, grup başına bir kimlik.
   Satır taşınınca kimlik onunla gider; kopyalanan satıra betik yeni kimlik verir.
3. **Taban saklanır.** Her oturum için iki tarafın son uzlaştığı değerler tutulur. Karşılaştırma alan düzeyindedir:
   biri konuyu, diğeri saati değiştirdiyse çakışma yoktur.
4. **Çakışmada kimse kazanmaz.** Aynı alan iki tarafta farklı değere çekildiyse hiçbiri yazılmaz, PO seçer.
5. **Bazı alanların tek yazma yeri var.** İptal, linkler, materyal, kişi ve yetkiler yalnızca uygulamadan yazılır;
   şablonda salt okunur görünür.
6. **Her senkron tek işlem, kayıtlı ve geri alınabilir.**

### Birleştirme tablosu

| Şablon (tabana göre) | Uygulama (tabana göre) | Sonuç |
| --- | --- | --- |
| Değişti | Aynı | Uygulamaya yazılır; taban güncellenir. |
| Aynı | Değişti | Şablona yazılır; taban güncellenir. |
| Değişti | Aynı değere değişti | Yazma yok; taban güncellenir. |
| Değişti | Farklı değere değişti | Çakışma: iki taraf da olduğu gibi kalır, kuyruğa düşer. |
| Tarih silindi | Aynı | Oturum "kaldırıldı" olur (iptal değil). |
| Tarih silindi | Değişti ya da iptal edildi | Çakışma: kaldırma uygulanmaz, PO'ya sorulur. |
| Aynı | Oturum eklendi | Boş grup varsa ızgaraya, yoksa "Ek oturumlar" bölümüne yazılır. |
| Yeni satır ya da hücre | (yok) | Yeni oturum açılır, kimlik şablona yazılır. |

### Aşamalar

- **A · Şablondan uygulamaya.** Okuyucu, kalıcı kimlik, taban kaydı, sekme koruması (MM-50, 51, 52, 53, 56).
  Bu aşamada uygulamada tarih, saat, konu ve eğitmen henüz düzenlenmez.
- **B · Uygulama alanları şablonda görünür.** İptal, link ve ek oturumlar şablona salt okunur yazılır (MM-54).
- **C · Ortak alanlar iki yönlü.** PO uygulamada tarih, saat, konu ve eğitmeni düzenler; birleştirme ve çakışma
  kuyruğu devreye girer (MM-57, 58).

Ön koşul: canlı bir Google Sheets dosyası ve içindeki betik.

## 5. Hedef veri modeli (taslak 1)

İlke: çalışan tabloları yeniden adlandırmak yerine genişletmek. Bugünkü `bootcamp` satırı zaten bir dönemdir.

| Tablo | Ne tutar | Bugünden farkı |
| --- | --- | --- |
| `program` | DA, İK gibi programın kendisi: kod, ad, renk. | Yeni. Dönemleri birbirine bağlar. |
| `bootcamp` (dönem) | DA11 gibi tek bir dönem: `program_id`, dönem kodu, durum, varsayılan saat ve link, şablondaki sekmenin kimliği. | Sütun eklenir; ad değişmez. Tamamlanan dönem şablondan değiştirilemez. |
| `oturum_grubu` | Dönemin haftalık oturum sütunları: sıra, ad, varsayılan tür. | Yeni. Şablondaki grupların karşılığı; üç ile sınırlı değil. |
| `hafta` | Dönem içinde kalıcı hafta numarası, modül, haftanın konusu. | Yeni. Program düzenleyicinin satırı. |
| `oturumlar` | Tek oturum. Eklenenler: `hafta_id`, `grup_id`, durum (planlı, iptal, kaldırıldı). | `excelden_kalkti` yerine "kaldırıldı" durumu. `kaynak` yalnızca nereden doğduğunu söyler. |
| `oturum_anlaticilari` | Ana, yardımcı, konuk. | Değişmez; değişiklikleri denetim kaydına girer. |
| `kisiler` | Kişi: `auth_user_id`, genel rol, dış eğitmen işareti. | Ad tekilliği kalkar. |
| `bootcamp_yetkilileri` | Dönem başına PO, ana eğitmen, asistan eğitmen. | Yalnızca uygulamadan yazılır. |
| `kisi_aliaslari` | Şablondaki yazım → kişi. | Admin ekranından yönetilir. |
| `sablon_tabani` | Oturum başına iki tarafın son uzlaştığı değerler. | Yeni. "Şablona yazılacaklar" oturum ile taban arasındaki farktan hesaplanır. |
| `senkron_cakismasi` | Oturum, alan, taban değeri, iki tarafın değeri, kim yazdı, durum, seçilen. | Yeni. |
| `denetim_kaydi` | Kim, ne zaman, hangi yüzeyden, eski ve yeni değer. | `degisiklik_kaydi` genişler: silme, anlatıcı, yetki ve kişi değişiklikleri de girer. |
| `bildirimler` + gönderim | Kişinin akışı ve her kanaldaki gönderim durumu ayrı. | `bildirim_kuyrugu` ikiye ayrılır. |

Geçiş sırası: (1) `program` ve dönem alanları, (2) `oturum_grubu`, `hafta` ve oturumdaki iki bağ, (3) `sablon_tabani`
ve birleştirme, (4) "kaldırıldı" durumu, denetim kaydı, `senkron_cakismasi`.

PO toplantısına bağlı kalanlar: yetki dönem başına mı program başına mı, dönem başına tek PO kuralı ve vekil,
haftaya bağlı olmayan oturumlar, bildirim kanalları.

## 6. İş listesi

Öncelik: P0 önce (yanıltan hata ve güvenlik), P1 ürünü sağlamlaştırır, P2 kullanım kalitesi.

### Açık güvenlik işleri (ayrıntı özel raporda)

| Kod | Öncelik | Başlık |
| --- | --- | --- |
| MM-60 | P0 | Senkron ucundaki deneme sınırı yeniden tasarlanacak |
| MM-61 | P0 | Bootcamp yetkileri ve yeni kişi kaydı şablondan çıkarılıp admin ekranına taşınacak |
| MM-64 | P0 | Yedek: secret'lar, ilk çalıştırma ve canlı geri yükleme denemesi (`docs/yedek.md`) |
| MM-11 | P2 | Kimlik `auth_user_id` üzerinden |
| MM-15 | P1 | Kişi bilgilerinde alan bazında görünürlük (K-7) |
| MM-18 | P1 | Admin işlemlerinin denetim kaydı |

### Tamamlananlar

| Kod | Başlık |
| --- | --- |
| MM-01 | Şablondan kalkan oturum arayüzde ve abonelikte görünmüyor; admin için kalkanlar listesi |
| MM-02 | Arayüz metinleri gerçek davranışı söylüyor |
| MM-03 | Formlar oturumun kendi linkini düzenliyor; bootcamp linki kopyalanmıyor |
| MM-04 | Oturumlar sayfa sayfa çekiliyor |
| MM-05 | Gece yarısını geçen seans eklenebiliyor |
| MM-06 | Anlatıcı listesinde tüm aktif kişiler |
| MM-07 | Ortak pencere bileşeni: odak, Esc, kaydedilmemiş değişiklik onayı |
| MM-08 | Tarih hesapları TR saatine göre |
| MM-10 | Şablondan admin yapılamıyor, e-posta değiştirilemiyor (kalan kısım MM-61) |
| MM-12 | Çıkışta cihazdaki veri siliniyor |
| MM-14 | Yedek iş akışı düzeltildi, döküm şifreleniyor (ilk çalıştırma MM-64) |
| MM-16 | Senkronda kilit, boyut denetimi, anahtarın e-tabloya bağlanması (deneme sınırı MM-60) |
| MM-17 | Takvim linkini yalnızca sahibi görüyor |
| MM-19 | Takvim fonksiyonu tek RPC çağırıyor |
| MM-42 | Rozet gerçek yetkiyi yazıyor |
| MM-45 | Profilde "Gönderdiklerim" |
| MM-48 | Tarayıcı `confirm()` yerine uygulama penceresi |

MM-13 geçersizdi: canlı sitede güvenlik başlıkları zaten var.

### Açık işler

| Kod | Öncelik | Alan | Başlık | Kabul ölçütü |
| --- | --- | --- | --- | --- |
| MM-62 | P1 | Backend | Kalkan oturumu kalıcı silme bir RPC'den geçsin ve kayda yazılsın | Silinen oturum için değişiklik kaydında "silme" satırı var |
| MM-63 | P1 | Backend | Programdan kalkan oturum için anlatıcıya bildirim; `surum` artsın | Anlatıcı Değişenler'de "programdan kaldırıldı" kartını görür |
| MM-66 | P1 | Backend | Admin için kişi düzenleme ekranı: e-posta, aktiflik, genel rol, PO ataması | Admin e-postayı uygulamadan değiştirir; değişiklik kayda düşer |
| MM-50 | P1 | Şablon | Kurum program şablonunu okuyan senkron | Örnek sekme eksiksiz içe aktarılır; Dönem hücresi boş sekme açık hatayla reddedilir |
| MM-51 | P1 | Şablon | Oturum kimliği ve "eski dönemin üzerine yazma" koruması | Dönem numarası artırılmadan tarihleri değişen sekme eski oturumları ezmez |
| MM-52 | P1 | Şablon | Sekme koruması ve değişikliği yapanın kaydı | PO olmayanın düzenlediği sekme reddedilir; kabul edilen değişiklik PO'nun adıyla görünür |
| MM-53 | P1 | Şablon | Şablondaki ad ile kişinin eşleştirilmesi | Bir kez eşleştirilen yazım sonraki okumalarda kendiliğinden tanınır |
| MM-56 | P1 | Senkron | Taban kaydı ve alan bazında üç yönlü birleştirme | Birleştirme tablosunun her satırı için test; sessiz ezilme olmadığını gösteren özellik testi |
| MM-54 | P1 | Senkron | Uygulama alanlarının şablonda salt okunur gösterimi (Aşama B) | Uygulamada iptal edilen oturum şablonda "İptal" görünür; PO bu sütunu değiştiremez |
| MM-57 | P1 | Senkron | Uygulamadan şablona geri yazma (Aşama C) | Uygulamadaki değişiklik iki dakika içinde şablonda; sonraki turda geri gelmez |
| MM-58 | P1 | UX | Çakışma kuyruğu ekranı | Çözülen çakışmada seçilen değer iki tarafa yazılır, hücre işareti kalkar |
| MM-20 | P1 | Backend | Bildirimlerin gerçekten gönderilmesi (K-8) | İptalde anlatıcıya birkaç dakika içinde ulaşır; başarısız gönderim yeniden denenir |
| MM-22 | P1 | Backend | Eşzamanlı düzenlemede iyimser kilit (`surum`) | Eski sürümle kaydetme reddedilir |
| MM-23 | P1 | Backend | Saklama süreleri ve zamanlanmış temizlik | Süresi geçen kayıtlar otomatik silinir; süreler belgeli |
| MM-26 | P1 | Backend | CI: lint, üretilen tipler, deneme ortamı, otomatik deploy | PR'da lint, tip, test ve önizleme adresi çıkar |
| MM-30 | P1 | Frontend | Tek büyük context'in bölünmesi | Saat tercihi değişince takvim verisi yeniden hesaplanmaz |
| MM-31 | P1 | Frontend | Hata sınırı, `useMutation`, Türkçe hata mesajları | Geçersiz linkte anlaşılır Türkçe mesaj |
| MM-32 | P1 | Frontend | Oturum ve süzgeçler adreste | Oturum linki açılınca aynı oturum açılır; yenileyince süzgeçler kalır |
| MM-40 | P1 | UX | "Değişenler" rozeti: çakışmayı susturma, okundu bilgisi sunucuda | Tümü görülünce rozet her cihazda kaybolur |
| MM-46 | P1 | UX | Erişilebilirlik: kontrast, en küçük metin 12 px, klavye | Otomatik taramada kontrast hatası yok |
| MM-65 | P2 | Frontend | Rol modelinin kalan izleri: `ana_egitmen_mi` adı, form notu, çıkış temizliğinin kapsamı | Kodda "ana eğitmen düzenler" anlamı taşıyan ad ve metin kalmaz |
| MM-24 | P2 | Backend | RLS politikalarında `(select ...)` biçimi | Yetki testleri geçer; `explain` çıktısında InitPlan |
| MM-25 | P2 | Backend | Oturum türleri ve tatiller tek kaynaktan | Yeni tür tek migration ile eklenir |
| MM-27 | P2 | Belge | README'nin güncellenmesi (canlı kurulum Worker, Sheets senkronu, roller) | README ile sıfırdan kurulum yapılabilir |
| MM-33 | P2 | Frontend | Tekrarlar: gün ve ay adları, elle yazılmış renkler, `setTimeout(50)` | `src` içinde elle yazılmış hex renk kalmaz |
| MM-34 | P2 | Frontend | Demo verisi canlı pakete girmesin; fontlar siteyle sunulsun | Canlı build'de demo verisi yok |
| MM-41 | P2 | UX | Saat tercihi Hafta görünümünde | Gün ve Hafta görünümleri aynı saati gösterir |
| MM-43 | P2 | UX | Giriş: tek yöntem, yeniden gönder, geri sayım | Kod gelmeyince ekrandan çıkmadan yeniden istenir |
| MM-44 | P2 | UX | Abonelikte Google Takvim gecikme notu (asistan ve PO kısmı tamam) | Not ekranda |
| MM-47 | P2 | UX | Karanlık tema | Sistem teması karanlıkken tüm ekranlar okunur |
| MM-55 | P2 | Şablon | Talimata "iptal uygulamadan yapılır" notu | Talimat iptal ile kaldırma farkını anlatır |

MM-21 (eski senkron fonksiyonunun yeniden yazımı) iptal edildi: yerini şablon okuyucu alacak.

## 7. Ekranlar

- **Program düzenleyici (PO):** şablondaki ızgaranın aynısı; her satır bir hafta, her sütun bir oturum grubu, yanda
  düzenleme paneli. İptal ile Kaldır ayrı işlemler. Telefonda ızgara yerine hafta kartları.
- **Çakışma ekranı:** önceki değer, şablondaki değer ve uygulamadaki değer yan yana, kimin ne zaman yazdığıyla.
  Aynı çakışma şablonda işaretli hücre ve not olarak görünür.
- **Admin:** kişiler ve yetkiler (MM-61, MM-66), kalkan oturumlar, senkron durumu, denetim kaydı.

## 8. Henüz kapsamda olmayanlar

Operasyon uygulamaya taşındıkça gerekecekler: eğitmen değişikliği akışı, müsaitlik ve izin, ders gerçekleşti
kaydı ve kayıt linki, eğitmen saat raporu, dersten önce hatırlatma, arama, 120 günden eski oturumlara erişim,
hata izleme ve kullanım ölçümü, deneme ortamı, KVKK süreçleri (aydınlatma, saklama süresi, silme), ücretli
Supabase planına geçiş.
