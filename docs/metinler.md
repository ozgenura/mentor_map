# Mentor Map: uygulamadaki metinler

18 Kasım 2026 itibarıyla canlıdaki web uygulamasında görünen slogan, başlık, açıklama ve uyarı metinleri.
Ekrana ve kimin gördüğüne göre gruplandı. Köşeli parantezli yerler (`[konu]`, `[ad]`) uygulamanın doldurduğu değerlerdir.
⚠️ işaretli maddeler gözüme takılan, karar vermeni istediğim yerler.

## Gözüme takılanlar (önce bunlara bakalım)

1. ⚠️ **Hitap karışık.** Uygulamanın çoğu "sen" diliyle yazılmış ("giriş yap", "takvimine bağla"), ama bazı hata ve uyarı mesajları "siz" dilinde: "Operasyon ekibine yazın", "Yeni kod isteyin", "Tekrar deneyin", "Yöneticiyle iletişime geçin", "takviminize yeni linki tekrar eklemeniz gerekir". Hepsini "sen" diline çekmeyi öneririm.
2. ⚠️ **Kime başvurulacağı tutarsız.** Kayıtlı olmayan e-postayla girişte "Operasyon ekibine yazın" yazıyor, kayıtlı ama pasif kişide "Yöneticiyle iletişime geçin". Tek bir muhatap seçelim.
3. ⚠️ **Seans formu "Saatler TR saatidir" diyor.** Yan seans eklerken saatler TR saatiyle giriliyor; bu doğru. Ama artık takvim kişinin kendi saatiyle gösterildiği için yurt dışındaki bir PO için karışabilir. "Saatleri TR saatiyle gir" gibi daha açık bir ifade önerilir.
4. ⚠️ **"Yan seans" ile "Seans ekle" ve "Ek oturum" karışık.** Aynı şeye (uygulamadan eklenen oturum) üç ad veriliyor: düğmede "Seans ekle", formda "Yan seans ekle", şablonda "Ek oturumlar", detay rozetinde "Uygulamadan eklendi". Tek bir ad seçelim (öneri: "Ek seans").
5. ⚠️ **"Anlatıcı" ile "Eğitmen".** Detayda "Anlatıcılar", listelerde "Eğitmen atanmamış", haritada "anlattığın". İkisi de yerinde kullanılmış olabilir, ama bir kez bakmakta fayda var.
6. ⚠️ **Takvim günlük uyarısı:** "Bu gün çakışan oturumların var. Operasyona haber vermeyi unutma." Operasyon ekibinin bu uyarıyı beklediğinden emin misin?

---

## Giriş ekranı (herkes, giriş yapmadan)

- Slogan: **"Her ders bir durak."**
- "Eğitmen takvimine e-posta adresinle giriş yap. Şifre yok; e-postana bir giriş bağlantısı ya da 6 haneli kod göndereceğiz."
- Alan: "E-posta adresin" · Düğme: "Kod gönder"
- Kod adımı: "E-postada bağlantı geldiyse ona dokunman yeterli; kod geldiyse buraya yaz." · "Giriş yap" · "Farklı e-posta kullan"
- Hatalar:
  - "Bu e-posta Mentor Map'te kayıtlı değil. Operasyon ekibine yazın." ⚠️ 1, 2
  - "Kod hatalı ya da süresi dolmuş. Yeni kod isteyin." ⚠️ 1
  - "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." ⚠️ 1
  - "Bir sorun oluştu. Tekrar deneyin." ⚠️ 1
- İmza: "bir [miuul A·Lab] ürünü"
- Kayıtlı ama pasif kişi: "[e-posta] bu e-posta eğitmen listesinde yok ya da pasif. Yöneticiyle iletişime geçin." · "Çıkış yap" ⚠️ 1, 2
- Uygulama açıklaması (tarayıcı ve paylaşım önizlemesi): "Eğitmenlerin bootcamp programını gördüğü takvim"

## Genel (herkes)

- Menü: Bugün · Takvim · Etkinlikler · Program (yalnızca admin ve PO) · Değişenler · Profil
- Yükleniyor: "Program yükleniyor…" · Hata: "Program yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin." ⚠️ 1
- Geri bildirim düğmesi: "Öneri / sorun bildir" · Pencere: "Mentor Map'i geliştirmemize yardım et. Yazdığını yalnızca yönetici görür." · Sonuç: "Teşekkürler, iletildi."
- Kaydedilmemiş değişiklikle pencere kapatılırken: "Değişiklikler kaydedilmedi" · "Kapatırsan yazdıkların kaybolur." · "Düzenlemeye dön"

## Bugün

- Üst satır: tarih (ör. "Salı, 17 Kasım")
- Başlık: "Merhaba [ad]. Bu hafta [n] oturumun var." / "Merhaba [ad]. Bu hafta oturumun yok."
- Sıradaki kartı: "Sıradaki · [Yarın / 2 gün sonra]" ya da "Şu an sürüyor" · "Derse katıl" · "Detay ve materyal"
- Bölümler: "Son girişinden beri" (boşsa: "Son girişinden beri değişiklik yok.") · "Bu hafta" · "Gelecek hafta: [n] oturum · [n] sa" · "Yaklaşan" (boşsa: "Yaklaşan oturum yok.")
- Haritan şeridi: "Önünde [n] durak" / "Önünde durak yok" · "Haritanın tamamı →"
- Yurt dışındakiler için saat seçici: "TR saati" / "[Şehir] saati"

## Takvim

- Üst satır: "Saatler [TR saati / Berlin saati] ile gösteriliyor"
- Seçimler: "Benim / Herkes" · "Gün / Hafta / Ay / Harita" · "Tüm bootcamp'ler" · "Tüm eğitmenler"
- Gün: "Bu gün planlanmış oturum yok." · "Sonraki oturum: [tarih] · [konu]" · "İleride planlanmış oturum da yok."
- Hafta: "Bu hafta planlanmış oturum yok." (dar ekranda "Bu günlerde…") · "Sonraki oturum: …"
- Hafta altı not: "Kartta bootcamp · anlatıcının baş harfleri ve ders adı yazar; tam bilgi için üzerine gel ya da dokun. Kırmızı çerçeve çakışma, soluk kart geçmiş oturum demektir."
- Ay altı not: "Bir güne dokununca o günün bütün oturumları açılır. Kırmızı nokta çakışma, soluk kart geçmiş oturum demektir."
- Gün uyarıları: "Bu gün çakışan oturumların var. Operasyona haber vermeyi unutma." ⚠️ 6 · "Bu gün aynı saatte çok oturum var; liste olarak gösteriliyor."
- Saatsiz oturum: "Saat belirsiz" · Eğitmensiz: "Eğitmen atanmamış"

### Harita

- Üst açıklama: "Yer aldığın programların tamamı gösteriliyor. **Dolu duraklar senin anlattığın oturumlar**; boş duraklarda programın diğer oturumları var." (başka eğitmen seçiliyse: "[ad] adlı eğitmenin yer aldığı programların tamamı…")
- Lejant: "Senin durağın" · "Programdaki oturum" · "Aktarma (çakışma)" · "İptal"
- Mobil not: "Her hat bir bootcamp. Haftalar yukarıdan aşağı akar. Bir durağa dokununca o haftanın oturumları açılır."
- Durak paneli: "Seçili durak" · "Bu hafta çakışan oturumun var" · "Bu hafta senin oturumun yok; programın oturumları gösteriliyor." · rozet "Sen" / "Anlatıyor"
- Yan liste: "Senin sıradaki durakların" / "[ad]: sıradaki duraklar" / "Sıradaki duraklar"
- Boş: "Haritada gösterilecek oturum yok."

## Oturum detayı (herkes)

- Rozetler: bootcamp adı · dönem · tür · "Uygulamadan eklendi" ⚠️ 4
- Saat satırı: "[gün] · [TR/Berlin] saati · [süre] · [Bugün / Yarın / n gün sonra]"
- Ders yaklaşınca en üstte: "Derse katıl · birazdan başlıyor" / "Derse katıl · ders sürüyor"; diğer zamanlarda altta "Derse katıl"
- Uyarılar: "Bu oturum iptal edildi." [gerekçe] · "Aynı saatte başka bir oturumun da var." · "Bu tarih resmi tatil: [tatil]"
- Alanlar: "Anlatıcılar" (ad yanında "(yardımcı)", "(konuk)", "· dış eğitmen"; kişinin kendisi "Sen") · "Toplantı" · "Materyal" → "Materyali aç" · "Açıklama" · "Not" · Atanmamışsa rozet "Atanmamış"

## Oturum yönetimi (yalnızca admin ve PO)

- Detayın altında: "Bu oturumu yönet" · "Yalnızca düzenleme yetkisi olanlar görür" · "Oturumu düzenle" · "Yan seans ekle" ⚠️ 4 · "Oturumu iptal et" / "İptali geri al"
- İptal penceresi: "Anlatıcılar bunu Değişenler ekranında görür, oturum takvim aboneliklerinde iptal olarak görünür. İstersen sonra geri alabilirsin." · gerekçe örneği "Örn. eğitmen rahatsız; telafi tarihi duyurulacak" · "İptal et" · hata "İptal edilemedi."
- Düzenleme formu: "Oturumu düzenle" · "Tarih, saat, konu ve eğitmen program dosyasından gelir; değişiklik orada yapılır. Buradaki alanlar program güncellemesinde korunur." · "Toplantı linki" (ipucu: "Boş bırakılırsa bootcamp'in linki kullanılır: [link]") · "Açıklama" (ipucu: "Anlatıcıların ve eğitmenlerin göreceği kısa bilgi.") · "Değişiklikler anlatıcıların Değişenler ekranında görünür ve takvim aboneliklerine yansır."
- Yan seans formu: "Yan seans ekle" / "Yan seansı düzenle" · alt satır "Saatler TR saatidir. Anlatıcılara bildirim gider." ⚠️ 3 · konu örneği "Örn. SQL soru-cevap" · "Anlatıcılar: İlk eklenen ana anlatıcıdır. Mentor Map kullanıcısı olan konuk da listeden seçilebilir." · "+ Kayıtlı eğitmen ekle" · "Konuk ekle" · "Konuk anlatıcı adı" · "Seansı ekle"
  - Uyarı: "Bu saatte başka oturumlar var. Yine de kaydedebilirsin."
  - Hatalar: "En az bir anlatıcı seçin." ⚠️ 1 · "Seans en çok 12 saat sürebilir." · "Ertesi gün biter." (gece yarısını geçen seans)

## Etkinlikler (herkes)

- Üst satır: "Bootcamp etkinlikleri ve genel etkinlikler" · Başlık: "[n] yaklaşan etkinlik" / "Etkinlikler"
- Seçim: "Tüm etkinlikler" · "Genel (bootcamp'e bağlı olmayan)"
- Kart: "Konuşmacı: [adlar]" · "Katılım linki" · "Detay" · rozet "Genel" / "İptal"
- Boş: "Yaklaşan etkinlik yok." · "Geçmiş etkinlikler ([n])"

## Program, yani PO paneli (yalnızca admin ve PO)

- Üst satır: "PO paneli" · Başlık: bootcamp adı · "Seans ekle" ⚠️ 4
- Kutular: "Dönem" · "İlerleme" · "Kalan oturum" · "İptal" · "Dikkat"
- "Dikkat isteyenler": "Eğitmen çakışması" · "Eğitmen atanmamış" · "Toplantı linki yok" · "[n] oturum · en yakını [tarih]" · rozet "7 gün içinde"
  - Link notu: "Bootcamp'in varsayılan Zoom linki yok. [Eklerseniz / Yönetici eklerse] hepsine uygulanır." ⚠️ 1 ("Eklerseniz")
  - Boş: "Yaklaşan oturumlarda eksik yok: hepsinin eğitmeni ve linki var, çakışma yok."
- "Program": "Yaklaşan / Tümü" · "[tarih] haftası" · rozet "Ek" ⚠️ 4 · "Saat yok"
- Alt not: "İptal, toplantı linki, materyal ve not oturumun detayından düzenlenir. Konu, tarih ve eğitmen değişiklikleri şimdilik program dosyasından yapılır."
- Yetkisi yoksa: "Düzenleyebildiğin bir bootcamp yok."

## Değişenler (herkes)

- Başlık: "Ne değişti" · "Son okuduğun: [tarih]" · "Hepsini okundu say"
- Gruplar: "Dikkat · [n]" · "Yeni · [n]" · "Daha önce" · rozet "Okunmadı" · "Oturuma bak"
- Kart başlıkları:
  - "[konu] seansına anlatıcı olarak eklendin" · "[…] · [ad] ekledi"
  - "[konu] oturumuna atandın" / "[konu] oturumundan çıkarıldın"
  - "[konu] iptal edildi" · "[…] · [gerekçe]" / "[konu] yeniden programda"
  - "[konu] güncellendi" / "[konu]: saat değişti"
  - "[tarih]: iki oturumun üst üste" (çakışma) · "Çakışma" / "Olası çakışma"
- Boş: "Henüz bir değişiklik yok. Programında bir şey değişince burada göreceksin."

## Profil (herkes)

- Roller: "Admin" · "Product owner" · "Ana eğitmen" · "Asistan eğitmen" · "Dış eğitmen" · saat dilimi ("Türkiye (TR)" ya da şehir)
- "Program son güncelleme: [n saat önce / az önce]"
- "Takvimine bağla": "Oturumların Google, Apple ya da Outlook takvimine abonelik olarak eklenir. İptaller ve yeni seanslar kendiliğinden yansır." · "Google Takvim'e ekle" · "Apple / Outlook'ta aç" · "Link sana özel, paylaşma." · "Link sızdıysa yenile" · "Adres kopyalandı"
  - Yenileme onayı: "Eski link çalışmayı bırakır; takviminize yeni linki tekrar eklemeniz gerekir." ⚠️ 1
- "Çıkış yap"

## Profil, yalnızca admin

- "Yönetici: kimin gözünden bakıyorsun?" · "Seçtiğin kişinin Bugün, Takvim ve Değişenler ekranlarını onun gördüğü gibi görürsün. Yalnızca görüntüdür; iptal gibi işlemler yine senin adınla kaydedilir."
- Başkasının gözünden bakarken üst şerit: "[ad] olarak görüntülüyorsun. Yaptığın işlemler senin yetkinle kaydedilir." · "Kendine dön"
- "Mentor Map Program bağlantısı": "Son gönderim: [n] yeni, [n] güncellenen, [n] kalkan, [n] hatalı satır (sayfadaki Senkron sekmesinde)." · "Henüz senkron yok"
- "Program şablonu bağlantısı": "PO'ların doldurduğu kurum şablonu. Şablonda Mentor Map → Önizle ile hiçbir şey yazmadan sonucu görebilir, Gönder ile aktarırsınız." ⚠️ 1 ("aktarırsınız")
- Anahtar: "Bağlantı anahtarı üret" / "Yeni anahtar üret (eskisi geçersiz olur)" · "Bu anahtar yalnızca şimdi görünür. Şablonda Mentor Map → Bağlantıyı kur menüsüne yapıştır; başka yerde paylaşma." · onay "Yeni anahtar üretilsin mi? Eski anahtar çalışmayı bırakır; şablondaki betiğe yenisini girmek gerekir." · "Kopyalandı"
- "Programdan kalkan oturumlar": "Şablondan silindiği için takvimlerde ve aboneliklerde görünmüyor. Yanlışlıkla silindiyse satırı şablona geri ekleyin; bir sonraki senkronda geri gelir." ⚠️ 1 · "Kalkan oturum yok." · "Kalıcı sil"
- Geri bildirim listesi: "Açık geri bildirim yok."

## Demo'ya özel (yalnızca demo linkinde)

- "Demo: kimin gözünden bakıyorsun?" · "Berlin'deki eğitmeni görmek için Can Yıldız'ı, düzenleme araçları (iptal) için Fabric'in PO'su Elif Şahin'i seç. Veriler uydurmadır; …"
- "Demoda yaptığın değişiklikler yalnızca bu tarayıcıda görünür." · "Demo sürümünde abonelik linki çalışmaz."
