"""Ekip Excel'indeki DA sekmesini, Mentor Map'in okuyabileceği standart haftalık şablona çevirir (öneri dosyası).

Kullanım: python3 -I da_sablon_oneri.py <ekip_excel.xlsx> <kisiler.json> <cikti.xlsx>

Standart şablon (bootcamp başına bir sekme, DA'nın haftalık düzeni korunur):
  · Üst blok: bootcamp adı, kodu, dönem, varsayılan saat, PO, asistanlar
  · Satır başına bir hafta; her oturum türünün kendi Tarih / Saat / Eğitmen sütunları
  · Eğitmenler Kişiler sekmesindeki tam adlarla, virgülle ayrılır
Tahmin edilen ya da teyit gereken her hücre sarı ve yorumlu.
"""
import datetime as dt
import json
import re
import sys

import openpyxl
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

YESIL, KREM, SARI, GRI_ZEMIN = "0B3B2C", "F7F3EF", "FFF2B3", "ECE5DF"
BASLIK = Font(bold=True, color="FFFFFF")
ZEMIN = PatternFill("solid", fgColor=YESIL)
GRUP_ZEMIN = PatternFill("solid", fgColor="124A38")
SARI_ZEMIN = PatternFill("solid", fgColor=SARI)
INCE = Side(style="thin", color="D9CDC6")
TURLER = ["Kick-Off", "Ders", "Uygulama", "Proje", "Sunum", "Master Class", "Mentor Görüşmesi", "Etkinlik"]
VARSAYILAN_SAAT = "20:30–23:00"

# Ekip Excel'indeki "Hafta türü" (B sütunu) -> Mentor Map oturum türü
TUR_ESLE = {"kick-off": "Kick-Off", "ders": "Ders", "son ders": "Ders", "workshop": "Uygulama",
            "sunum": "Sunum", "istatistik uyum 1": "Ders", "istatistik uyum 2": "Ders"}

# Gruplar: (başlık, gün farkı haftanın pazartesisine göre, tür)
GRUPLAR = [("Ders", 2, None), ("Mentor Görüşmesi", 0, "Mentor Görüşmesi"), ("Güçlendirme", 1, "Uygulama")]


def main(kaynak, kisiler_yolu, cikti):
    kisiler = [k["ad"] for k in json.load(open(kisiler_yolu, encoding="utf-8"))]
    ilk_ad = {}
    for ad in kisiler:
        ilk_ad.setdefault(ad.split()[0].lower(), []).append(ad)

    def tam_ad(parca):
        p = parca.strip()
        if not p:
            return None, None
        if p in kisiler:
            return p, None
        aday = ilk_ad.get(p.split()[0].lower(), [])
        if len(aday) == 1:
            return aday[0], None
        return p, f'"{p}" Kişiler listesinde tek bir kişiye eşlenemedi'

    def egitmenler(ham):
        """'Arda & Harun / Dilan' -> ('Arda Yüce, Harun Akın, Dilan Erkan', not)"""
        if not ham:
            return "", None
        s = str(ham).strip()
        if s.lower() in ("mentor", "-", "tüm ekip"):
            return "", f'Hücrede kişi yerine "{s}" yazıyor: görüşmeyi kim yapıyor?'
        notlar = []
        if "/" in s:
            notlar.append(f'Orijinali "{s}": "/" dönüşümlü mü anlamına geliyor? O hafta kim girdiyse yalnızca onu bırakın.')
        adlar = []
        for parca in re.split(r"[&/,]| ve ", s):
            ad, sorun = tam_ad(parca)
            if ad and ad not in adlar:
                adlar.append(ad)
            if sorun:
                notlar.append(sorun)
        return ", ".join(adlar), " ".join(notlar) or None

    src = openpyxl.load_workbook(kaynak, data_only=True)["DA"]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "DA"

    # ---------------------------------------------------------------- üst blok
    ust = [("Bootcamp", "Data Analyst", "Uygulamada görünen tam ad."),
           ("Kod", "DA", "Kısa kod. Değiştirmeyin; takvimde ve haritada bu kodla görünür."),
           ("Dönem", "", "Örnek: 2026 Yaz. Yeni dönem başlarken bu hücreyi değiştirin; Mentor Map eski dönemi arşivler, yenisini açar."),
           ("Varsayılan saat", VARSAYILAN_SAAT, "Saat sütunu boş bırakılan oturumlar bu saati alır.")]
    sag = [("Product owner", "", "Bu bootcamp'te iptal, link ve yan seans yetkisi olan kişi. Kişiler sekmesinden seçin."),
           ("Asistan(lar)", "", "Takviminde bu bootcamp'in tüm oturumlarını görecek kişiler. Virgülle ayırın."),
           ("Hafta günleri", "Ders: Çarşamba · Mentor: Pazartesi · Güçlendirme: Salı", "Bilgi amaçlı; her oturumun tarihi kendi sütununda yazılır.")]
    for i, (etiket, deger, not_) in enumerate(ust, start=1):
        ws.cell(i, 1, etiket).font = Font(bold=True, color=YESIL)
        c = ws.cell(i, 2, deger)
        c.comment = Comment(not_, "Mentor Map")
        if etiket == "Dönem":
            c.fill = SARI_ZEMIN
    for i, (etiket, deger, not_) in enumerate(sag, start=1):
        ws.cell(i, 5, etiket).font = Font(bold=True, color=YESIL)
        c = ws.cell(i, 6, deger)
        c.comment = Comment(not_, "Mentor Map")
        if etiket in ("Product owner", "Asistan(lar)"):
            c.fill = SARI_ZEMIN

    # ---------------------------------------------------------------- tablo başlıkları
    GR, HR, ILK = 6, 7, 8
    basliklar = ["Hafta", "Modül", "Konu", "Tür"]
    for g, _, _ in GRUPLAR:
        basliklar += ["Tarih", "Saat", "Eğitmen(ler)" if g != "Mentor Görüşmesi" else "Mentor"]
    basliklar += ["Not"]
    genislik = [7, 16, 44, 13] + [12, 12, 30] * 3 + [34]
    ws.cell(GR, 1, "Hafta")
    ws.merge_cells(start_row=GR, start_column=1, end_row=GR, end_column=4)
    for gi, (g, _, _) in enumerate(GRUPLAR):
        col = 5 + gi * 3
        ws.cell(GR, col, g)
        ws.merge_cells(start_row=GR, start_column=col, end_row=GR, end_column=col + 2)
    ws.cell(GR, 14, "")
    for col in range(1, 15):
        c = ws.cell(GR, col)
        c.font, c.fill, c.alignment = BASLIK, GRUP_ZEMIN, Alignment(horizontal="center")
    for col, (h, w) in enumerate(zip(basliklar, genislik), start=1):
        c = ws.cell(HR, col, h)
        c.font, c.fill = BASLIK, ZEMIN
        ws.column_dimensions[c.column_letter].width = w
    ws.freeze_panes = ws.cell(ILK, 4)
    ws.cell(HR, 6).comment = Comment("Boşsa varsayılan saat. Farklıysa 19:00–22:00 biçiminde yazın.", "Mentor Map")

    # ---------------------------------------------------------------- veri
    r = ILK
    hafta = 0
    sayac = {"tahmini_tarih": 0, "eğitmen_sorusu": 0}
    for row in src.iter_rows(min_row=4, max_row=src.max_row):
        a, b, c_, d, e, f, g = (x.value for x in row[:7])
        if not isinstance(a, dt.datetime) and not c_:
            continue
        hafta += 1
        tarih = a.date() if isinstance(a, dt.datetime) else None
        pazartesi = tarih - dt.timedelta(days=tarih.weekday()) if tarih else None
        tur = TUR_ESLE.get(str(b or "").strip().lower(), "Ders")
        ws.cell(r, 1, hafta)
        ws.cell(r, 2, d or "")
        ws.cell(r, 3, c_ or "")
        ws.cell(r, 4, tur)
        notlar = []

        hucreler = {0: e, 1: f, 2: g}
        # Ders sütunu boş, B'de bir oturum varsa (Kick-Off, Sunum) ana oturum A tarihindedir
        tek_oturum = not e and not f and not g or (str(b or "").strip().lower() in ("kick-off", "sunum") and not e)
        for gi, (grup, gun, _) in enumerate(GRUPLAR):
            col = 5 + gi * 3
            ham = hucreler[gi]
            if gi == 0 and tek_oturum:
                ham = ham or ""
            elif not ham:
                continue
            # serbest not ("10 Ağustos: İlk Tanışma") kişi değildir
            if ham and re.match(r"^\d{1,2}\s+\w+\s*:", str(ham)):
                notlar.append(f"{grup}: {ham}")
                ws.cell(r, col).fill = SARI_ZEMIN
                ws.cell(r, col).comment = Comment(f'Orijinal hücrede "{ham}" yazıyordu: bu bir oturum mu, not mu? Oturumsa tarihini ve kişisini yazın.', "Mentor Map")
                continue
            if gi == 0:
                oturum_tarihi = tarih
            elif tarih and tarih.weekday() == gun:
                oturum_tarihi = tarih
            else:
                oturum_tarihi = pazartesi + dt.timedelta(days=gun) if pazartesi else None
            tc = ws.cell(r, col, oturum_tarihi)
            tc.number_format = "yyyy-mm-dd"
            if gi > 0 and oturum_tarihi != tarih:
                tc.fill = SARI_ZEMIN
                tc.comment = Comment("Eski Excel'de bu oturumun tarihi yazmıyordu; aynı haftanın günü olarak tahmin edildi. Doğruysa sarıyı kaldırın.", "Mentor Map")
                sayac["tahmini_tarih"] += 1
            adlar, sorun = egitmenler(ham)
            ec = ws.cell(r, col + 2, adlar)
            if sorun:
                ec.fill = SARI_ZEMIN
                ec.comment = Comment(sorun, "Mentor Map")
                sayac["eğitmen_sorusu"] += 1
        if tarih and tarih.weekday() not in (0, 1, 2):
            notlar.append(f"Bu hafta tek oturum: {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'][tarih.weekday()]}")
        if notlar:
            ws.cell(r, 14, " · ".join(notlar))
        for col in range(1, 15):
            ws.cell(r, col).border = Border(bottom=INCE)
            ws.cell(r, col).alignment = Alignment(vertical="top", wrap_text=col in (3, 14))
        r += 1

    son = 300
    for gi in range(3):
        col = 5 + gi * 3
        for rr in range(ILK, son):
            ws.cell(rr, col).number_format = "yyyy-mm-dd"
    tur_dv = DataValidation(type="list", formula1='"' + ",".join(TURLER) + '"', allow_blank=True)
    ws.add_data_validation(tur_dv)
    tur_dv.add(f"D{ILK}:D{son}")
    kisi_dv = DataValidation(type="list", formula1="='Kişiler'!$A$2:$A$300", allow_blank=True,
                             errorStyle="warning", error="Kişiler sekmesindeki adlardan seçin; birden fazlaysa virgülle yazın.")
    ws.add_data_validation(kisi_dv)
    for col in ("G", "J", "M"):
        kisi_dv.add(f"{col}{ILK}:{col}{son}")
    kisi_dv.add("F1:F2")

    # ---------------------------------------------------------------- Kişiler
    wk = wb.create_sheet("Kişiler")
    wk.append(["Ad", "Rol", "Not"])
    for c in wk[1]:
        c.font, c.fill = BASLIK, ZEMIN
    for ad in kisiler:
        wk.append([ad, "", ""])
    wk.column_dimensions["A"].width = 24
    wk.column_dimensions["B"].width = 16
    wk.column_dimensions["C"].width = 40

    # ---------------------------------------------------------------- Nasıl doldurulur
    wn = wb.create_sheet("Nasıl doldurulur")
    wn.column_dimensions["A"].width = 110
    for metin, kalin in [
        ("Bootcamp sekmesi nasıl doldurulur", True),
        ("Her bootcamp kendi sekmesinde, bu düzenle. Mentor Map sekmeleri otomatik okur.", False),
        ("", False),
        ("• Üst blok: Dönem, Product owner ve Asistanlar mutlaka dolu olmalı. Yeni dönemde yalnızca Dönem hücresini ve tarihleri güncelleyin.", False),
        ("• Her satır bir hafta. Haftada olmayan oturumun Tarih hücresini boş bırakın.", False),
        ("• Her oturumun kendi Tarih hücresi var. Tarihi 2026-11-18 biçiminde yazın.", False),
        ("• Saat boşsa üstteki varsayılan saat geçerli. Farklıysa 19:00–22:00 yazın; gece yarısı biten ders için 20:30–00:00.", False),
        ("• Eğitmen adları Kişiler sekmesindeki tam adlarla. Birden fazla kişi: virgülle (Arda Yüce, İlker Ersoy).", False),
        ("• Hafta numarası oturumun kimliğidir. Araya hafta eklemek gerekirse numarasını değiştirmeyin; yeni satıra boştaki ilk numarayı verin, sıralama tarihle yapılır.", False),
        ("• Not sütunu yalnızca açıklama içindir; Mentor Map oradan oturum okumaz.", False),
        ("• Ücretsiz etkinlikler bu sekmeye değil, Etkinlikler sekmesine yazılır.", False),
        ("", False),
        ("Sarı hücreler", True),
        ("Eski Excel'den çevrilirken tahmin edilen ya da teyit gereken hücreler. Üzerindeki notu okuyun, doğrulayın, sarı rengi kaldırın.", False),
    ]:
        wn.append([metin])
        c = wn.cell(wn.max_row, 1)
        c.alignment = Alignment(wrap_text=True)
        if kalin:
            c.font = Font(bold=True, size=12, color=YESIL)

    wb.save(cikti)
    print(f"{hafta} hafta, {r - ILK} satır -> {cikti}")
    print("teyit gereken:", sayac)


if __name__ == "__main__":
    main(*sys.argv[1:4])
