"""Kurum program şablonu: yalnızca dersler, eğitmen adları, tarih ve saatler.
E-posta, rol, PO, asistan, Zoom, renk ve etkinlikler bu dosyada değil, Mentor Map'in kendi dosyasında tutulur.

Kullanım: python3 -I program_sablonu.py <eski_ekip_excel.xlsx> <kisiler.json> <cikti.xlsx>

Bootcamp sekmesi düzeni (her bootcamp ve dönem için aynı; Mentor Map bu düzeni okur):
  1–5. satır : bootcamp ve dönem bilgileri (etiket A/E sütununda, değer B/F sütununda)
  7. satır   : her oturum grubunun türü (açılır liste)
  8. satır   : her oturum grubunun adı (serbest: "Ders", "Pazartesi dersi" ...)
  9. satır   : sütun başlıkları; her grup: Tarih, Saat, Tür (boşsa grubun türü), Konu, Eğitmen(ler)
  10+        : satır başına bir hafta
Oturumun kimliği = Dönem (Kod + numara, ör. DA11) + Hafta + grup harfi (A/B/C). Tarih değişse de oturum aynı kalır.
Okuyucu kuralı: "kalktı" işareti yalnızca şablonda hâlâ bulunan dönemlerin oturumlarına uygulanır; şablondan tamamen
çıkan (ör. DA11 → DA12 yapılan) dönemin oturumları arşivde dokunulmadan kalır.
"""
import datetime as dt
import json
import re
import sys

import openpyxl
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

YESIL, KOYU, SARI, ACIK = "0B3B2C", "124A38", "FFF2B3", "F7F3EF"
BASLIK = Font(bold=True, color="FFFFFF")
F_YESIL = PatternFill("solid", fgColor=YESIL)
F_KOYU = PatternFill("solid", fgColor=KOYU)
F_SARI = PatternFill("solid", fgColor=SARI)
F_ACIK = PatternFill("solid", fgColor=ACIK)
ETIKET = Font(bold=True, color=YESIL)
INCE = Side(style="thin", color="D9CDC6")
TURLER = ["Kick-Off", "Ders", "Ek Ders", "Uygulama", "Mentor Görüşmesi", "Office Hours", "Proje", "Sunum", "Master Class", "Etkinlik"]
ILK = 10                      # ilk hafta satırı
SON = 300                     # biçim ve doğrulamaların uzandığı son satır
GRUP_KOL = {"A": 4, "B": 9, "C": 14}   # her grubun Tarih sütunu; ardından Saat, Tür, Konu, Eğitmen(ler)
NOT_KOL = 19
ETK_BASLIK = ["No", "Tarih", "Saat", "Başlık", "Açıklama", "Konuşmacı(lar)", "Dış konuşmacı", "Not"]
ETK_GENISLIK = [6, 12, 13, 32, 36, 26, 20, 26]


def yorum(hucre, metin):
    hucre.comment = Comment(metin, "Mentor Map")
    hucre.comment.width, hucre.comment.height = 320, 110


def liste(ws, aralik, secenekler=None, formul=None, sert=True, mesaj="Listeden seçin."):
    dv = DataValidation(type="list", formula1=formul or '"' + ",".join(secenekler) + '"', allow_blank=True)
    dv.errorStyle = "stop" if sert else "warning"
    dv.error, dv.errorTitle = mesaj, "Geçersiz değer"
    ws.add_data_validation(dv)
    dv.add(aralik)


def bootcamp_sekmesi(wb, baslik, bilgi, gruplar):
    """bilgi: üst blok değerleri; gruplar: [(harf, tür, ad)]"""
    ws = wb.create_sheet(baslik)
    sol = [("Bootcamp", bilgi.get("ad", ""), "Bootcamp'in tam adı."),
           ("Kod", bilgi.get("kod", ""), "Kısa kod (DA, İK, Fabric...). Takvimde ve haritada bu kodla görünür. Dönemden döneme değiştirmeyin."),
           ("Dönem", bilgi.get("donem", ""), "Kod + dönem numarası: DA11, Vibe2. Mentor Map her dönemi ayrı tutar. Yeni dönem başlarken "
                                            "numarayı artırın (DA11 → DA12); eski dönemin oturumları Mentor Map'te arşiv olarak kalır. "
                                            "Numarayı artırmadan tarihleri değiştirirseniz eski dönemin üzerine yazılır."),
           ("Varsayılan saat", bilgi.get("saat", "20:30–23:00"), "Saat hücresi boş olan oturumlar bu saati alır. Biçim: 20:30–23:00 (gece yarısı için 20:30–00:00).")]
    sag = [("Başlangıç – bitiş", None, "Otomatik: oturum tarihlerinden hesaplanır, elle yazmayın.")]
    for i, (etiket, deger, aciklama) in enumerate(sol, start=1):
        ws.cell(i, 1, etiket).font = ETIKET
        c = ws.cell(i, 2, deger)
        c.fill = F_ACIK
        yorum(c, aciklama)
        if etiket in ("Dönem",) and not deger:
            c.fill = F_SARI
    # Dönem = Kod + numara (DA11): oturum kimliğinin parçası, yeni dönem eskisinin üzerine yazmasın diye zorunlu biçim
    dv = DataValidation(type="custom", formula1='REGEXMATCH(TO_TEXT(B3),"^"&B2&"[0-9]+$")', allow_blank=True)
    dv.error = "Dönem = Kod + numara, boşluksuz: DA11, Vibe2"
    dv.prompt = "Kod + dönem numarası, boşluksuz: DA11, Vibe2. Yeni dönemde numarayı artırın (DA11 → DA12)."
    ws.add_data_validation(dv)
    dv.add("B3")
    for i, (etiket, deger, aciklama) in enumerate(sag, start=1):
        ws.cell(i, 5, etiket).font = ETIKET
        c = ws.cell(i, 6, deger)
        c.fill = F_ACIK
        yorum(c, aciklama)
    tarih_araliklari = ",".join(f"{openpyxl.utils.get_column_letter(k)}{ILK}:{openpyxl.utils.get_column_letter(k)}{SON}"
                                for k in GRUP_KOL.values())
    ws["F1"] = (f'=IF(COUNT({tarih_araliklari})=0,"",TEXT(MIN({tarih_araliklari}),"yyyy-mm-dd")&" → "&'
                f'TEXT(MAX({tarih_araliklari}),"yyyy-mm-dd"))')
    ws["F1"].fill = PatternFill(fill_type=None)
    ws["F1"].font = Font(italic=True, color="6B5C57")

    # oturum grubu tanımları (7–8. satır) ve sütun başlıkları (9. satır)
    ws.cell(7, 1, "Oturum türü →").font = Font(italic=True, color="6B5C57")
    ws.cell(8, 1, "Oturum adı →").font = Font(italic=True, color="6B5C57")
    for harf, tur, ad in gruplar:
        k = GRUP_KOL[harf]
        for satir, deger in ((7, tur), (8, ad)):
            c = ws.cell(satir, k, deger)
            ws.merge_cells(start_row=satir, start_column=k, end_row=satir, end_column=k + 4)
            c.font, c.fill, c.alignment = BASLIK, F_KOYU, Alignment(horizontal="center")
        yorum(ws.cell(7, k), f"{harf} grubunun varsayılan türü. Oturumun kendi Tür hücresi doluysa o geçerli.")
        yorum(ws.cell(8, k), f"{harf} grubunun adı (Ders, Mentor Görüşmesi, Pazartesi dersi...). Kullanılmıyorsa boş bırakın.")
    liste(ws, "D7:R7", TURLER)
    basliklar = ["Hafta", "Modül", "Haftanın konusu"]
    for _ in GRUP_KOL:
        basliklar += ["Tarih", "Saat", "Tür", "Konu", "Eğitmen(ler)"]
    basliklar.append("Not")
    genislik = [7, 18, 40] + [12, 12, 14, 26, 28] * 3 + [34]
    for k, (h, w) in enumerate(zip(basliklar, genislik), start=1):
        c = ws.cell(9, k, h)
        c.font, c.fill = BASLIK, F_YESIL
        c.alignment = Alignment(vertical="center")
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[9].height = 20
    yorum(ws.cell(9, 1), "Haftanın kalıcı numarası; oturumun kimliğinin parçası. Araya hafta eklerken mevcut numaraları değiştirmeyin, "
                         "yeni satıra kullanılmamış bir numara verin. Satır sırası önemli değil.")
    for k in GRUP_KOL.values():
        yorum(ws.cell(9, k + 1), "Boşsa varsayılan saat. Farklıysa 19:00–22:00 biçiminde.")
        yorum(ws.cell(9, k + 2), "Boşsa grubun türü (7. satır) geçerli. Bu oturum farklıysa seçin: Kick-Off, Proje, Sunum, Etkinlik...")
        yorum(ws.cell(9, k + 3), "Boşsa haftanın konusu geçerli.")
        yorum(ws.cell(9, k + 4), "Eğitmenler sekmesindeki tam adlarla; birden fazla kişi virgülle.")
    ws.freeze_panes = ws.cell(ILK, 4)

    # biçimler ve doğrulamalar
    for r in range(ILK, SON + 1):
        for k in GRUP_KOL.values():
            ws.cell(r, k).number_format = "yyyy-mm-dd"
    for k in GRUP_KOL.values():
        tc = openpyxl.utils.get_column_letter(k + 2)
        liste(ws, f"{tc}{ILK}:{tc}{SON}", TURLER)
        h = openpyxl.utils.get_column_letter(k + 4)
        liste(ws, f"{h}{ILK}:{h}{SON}", formul="='Eğitmenler'!$A$2:$A$500", sert=False,
              mesaj="Eğitmenler sekmesindeki adlardan seçin; birden fazlaysa virgülle yazın.")
        t = openpyxl.utils.get_column_letter(k)
        dv = DataValidation(type="date", operator="greaterThan", formula1="DATE(2024,1,1)", allow_blank=True)
        dv.error = "Tarih girin: 2026-11-18"
        ws.add_data_validation(dv)
        dv.add(f"{t}{ILK}:{t}{SON}")
    ws.conditional_formatting.add(f"A{ILK}:S{SON}", FormulaRule(formula=[f"COUNTIF($A${ILK}:$A${SON},$A{ILK})>1"],
                                                               fill=PatternFill("solid", fgColor="FDE3E5")))
    return ws


def da_doldur(ws, kaynak, kisiler):
    """Eski DA sekmesini standart düzene çevirir. Tahmin edilen ya da teyit gereken hücreler sarı ve yorumlu."""
    ilk_ad = {}
    for ad in kisiler:
        ilk_ad.setdefault(ad.split()[0].lower(), []).append(ad)

    def adlar(ham):
        if not ham:
            return "", None
        s = str(ham).strip()
        if s.lower() in ("mentor", "-", "tüm ekip"):
            return "", f'Eski hücrede kişi yerine "{s}" yazıyordu: bu görüşmeyi kim yapıyor?'
        notlar, sonuc = [], []
        if "/" in s:
            notlar.append(f'Eski hücre "{s}": "/" dönüşümlü mü demek? O hafta kim girdiyse yalnızca onu bırakın.')
        for parca in re.split(r"[&/,]| ve ", s):
            p = parca.strip()
            if not p:
                continue
            aday = [p] if p in kisiler else ilk_ad.get(p.split()[0].lower(), [])
            if len(aday) == 1:
                if aday[0] not in sonuc:
                    sonuc.append(aday[0])
            else:
                sonuc.append(p)
                notlar.append(f'"{p}" Kişiler listesinde bulunamadı.')
        return ", ".join(sonuc), " ".join(notlar) or None

    src = openpyxl.load_workbook(kaynak, data_only=True)["DA"]
    tur_esle = {"kick-off": "Kick-Off", "workshop": "Uygulama", "sunum": "Sunum"}
    r, hafta, sayac = ILK, 0, {"tahmini_tarih": 0, "egitmen": 0, "not": 0}
    for row in src.iter_rows(min_row=4, max_row=src.max_row):
        a, b, c_, d, e, f, g = (x.value for x in row[:7])
        if not isinstance(a, dt.datetime):
            continue
        hafta += 1
        tarih = a.date()
        pzt = tarih - dt.timedelta(days=tarih.weekday())
        ws.cell(r, 1, hafta)
        ws.cell(r, 2, d or "")
        ws.cell(r, 3, c_ or "")
        tur = tur_esle.get(str(b or "").strip().lower())
        if tur:
            ws.cell(r, GRUP_KOL["A"] + 2, tur)
        notlar = []
        # A: ana oturum (eski A sütunundaki tarih) · B: Mentor Görüşmesi (Pzt) · C: Güçlendirme (Sal)
        for harf, ham, gun in (("A", e, None), ("B", f, 0), ("C", g, 1)):
            k = GRUP_KOL[harf]
            if harf != "A" and not ham:
                continue
            if ham and re.match(r"^\d{1,2}\s+\w+\s*:", str(ham)):
                notlar.append(f"Eski not: {ham}")
                c = ws.cell(r, k)
                c.fill = F_SARI
                yorum(c, f'Eski hücrede "{ham}" yazıyordu. Bu bir oturumsa tarihini ve kişisini girin; değilse sarıyı kaldırın.')
                sayac["not"] += 1
                continue
            ot = tarih if harf == "A" or tarih.weekday() == gun else pzt + dt.timedelta(days=gun)
            tc = ws.cell(r, k, ot)
            tc.number_format = "yyyy-mm-dd"
            if harf != "A" and ot != tarih:
                tc.fill = F_SARI
                yorum(tc, "Eski Excel'de bu oturumun tarihi yazmıyordu; aynı haftanın günü olarak tahmin edildi. Doğruysa sarıyı kaldırın.")
                sayac["tahmini_tarih"] += 1
            if harf == "C":
                ws.cell(r, k + 3, f"Güçlendirme: {c_}" if c_ else "")
            kisi, sorun = adlar(ham)
            ec = ws.cell(r, k + 4, kisi)
            if sorun:
                ec.fill = F_SARI
                yorum(ec, sorun)
                sayac["egitmen"] += 1
        if notlar:
            ws.cell(r, NOT_KOL, " · ".join(notlar))
        for k in range(1, NOT_KOL + 1):
            ws.cell(r, k).border = Border(bottom=INCE)
            ws.cell(r, k).alignment = Alignment(vertical="top", wrap_text=k in (3, NOT_KOL))
        r += 1
    return hafta, sayac


def main(kaynak, kisiler_yolu, cikti):
    kisiler = json.load(open(kisiler_yolu, encoding="utf-8"))
    adlar = [k["ad"] for k in kisiler]
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # ---------------------------------------------------------------- Nasıl doldurulur
    wn = wb.create_sheet("Nasıl doldurulur")
    wn.column_dimensions["A"].width = 120
    satirlar = [
        ("Miuul eğitim programı şablonu", 1),
        ("Bu dosya eğitim programının kaynağıdır: dersler, eğitmenler, tarih ve saatler. Mentor Map düzenli aralıklarla okur; "
         "değişiklik birkaç dakika içinde eğitmenlerin takvimine yansır.", 0),
        ("", 0),
        ("Sekmeler", 2),
        ("• Her bootcamp + dönem için bir sekme (örnek: DA). Yeni bootcamp ya da yeni dönem için \"_YENİ BOOTCAMP\" sekmesini kopyalayın.", 0),
        ("• Eğitmenler: açılır listelerde görünen adlar. Yeni bir eğitmen gelince önce buraya ekleyin.", 0),
        ("• Genel: bir bootcamp'e bağlı olmayan etkinlikler. Mentor Map'te \"Genel\" olarak görünür.", 0),
        ("", 0),
        ("Bootcamp sekmesi", 2),
        ("1. Üst blok: Bootcamp, Kod ve Dönem dolu olmalı. Dönem = Kod + dönem numarası, boşluksuz (DA11, Vibe2); başka biçim kabul edilmez. Başlangıç – bitiş kendiliğinden hesaplanır.", 0),
        ("2. 7–8. satırda haftalık oturum gruplarını tanımlayın: her grubun türü ve adı (DA: Ders / Mentor Görüşmesi / Güçlendirme; "
         "Fabric: Pazartesi dersi / Perşembe dersi). Kullanılmayan grubu boş bırakın.", 0),
        ("3. Her satır bir hafta. Hafta numarası kalıcıdır: araya hafta eklerken mevcut numaraları değiştirmeyin, yeni satıra kullanılmamış bir numara verin.", 0),
        ("4. Her oturumun kendi Tarih hücresi var (2026-11-18 biçiminde). O hafta yapılmayan oturumun tarihini boş bırakın.", 0),
        ("5. Saat boşsa varsayılan saat geçerli; farklıysa 19:00–22:00 yazın. Konu boşsa haftanın konusu geçerli.", 0),
        ("6. Eğitmen adları Eğitmenler sekmesindeki yazımla; birden fazla kişi virgülle (Arda Yüce, İlker Ersoy).", 0),
        ("7. Her oturumun kendi Tür hücresi var. Boşsa grubun türü (7. satır) geçerli; o oturum farklıysa seçin: Kick-Off, Ek Ders, Office Hours, Proje, Sunum, Master Class, Etkinlik...", 0),
        ("8. Not sütunu açıklama içindir; Mentor Map oradan oturum okumaz.", 0),
        ("9. Etkinlikler: bu bootcamp'e bağlı ücretsiz etkinlik için yeni bir hafta satırı açın (ya da o haftanın boş bir grubunu kullanın) "
         "ve oturumun Tür hücresinde Etkinlik seçin. Başlık Konu'ya, konuşmacı Eğitmen(ler) sütununa yazılır (listede olmayan dış konuşmacı "
         "da yazılabilir). Katılım linki ve kimlerin göreceği Mentor Map tarafında ayarlanır.", 0),
        ("", 0),
        ("Değişiklikler ne olur?", 2),
        ("• Tarih ya da saat değişirse oturum aynı kalır; ilgili eğitmenlere \"saat değişti\" bildirimi gider.", 0),
        ("• Bir haftayı silerseniz Mentor Map oturumu \"programdan kalktı\" olarak işaretler; birden çok satır birden silinirse onay ister.", 0),
        ("• Yeni dönem: Dönem numarasını artırın (DA11 → DA12) ve tarihleri güncelleyin; isterseniz önce sekmeyi kopyalayın. Mentor Map yeni dönemi ayrı açar, eski dönemin oturumları arşivde kalır. Numarayı artırmadan tarihleri değiştirmeyin: eski dönemin üzerine yazılır.", 0),
        ("", 0),
        ("Renkler", 2),
        ("Sarı: teyit bekleyen hücre (üzerindeki notu okuyun). Pembe: aynı hafta numarası iki kez kullanılmış.", 0),
    ]
    for metin, seviye in satirlar:
        wn.append([metin])
        c = wn.cell(wn.max_row, 1)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if seviye:
            c.font = Font(bold=True, size=14 if seviye == 1 else 12, color=YESIL)

    # ---------------------------------------------------------------- Eğitmenler (yalnızca adlar)
    wk = wb.create_sheet("Eğitmenler")
    wk.append(["Ad", "Not"])
    for c, w in zip(wk[1], [26, 40]):
        c.font, c.fill = BASLIK, F_YESIL
        wk.column_dimensions[c.column_letter].width = w
    yorum(wk["A1"], "Tam ad. Bootcamp sekmelerindeki açılır listeler bu sütundan gelir.")
    for k in kisiler:
        if k.get("rol") != "yonetici":
            wk.append([k["ad"], ""])
    wk.freeze_panes = "A2"

    # ---------------------------------------------------------------- DA (dolu örnek) ve boş şablon
    ws = bootcamp_sekmesi(wb, "DA", {"ad": "Data Analyst", "kod": "DA"},
                          [("A", "Ders", "Ders"), ("B", "Mentor Görüşmesi", "Mentor Görüşmesi"), ("C", "Uygulama", "Güçlendirme")])
    hafta, sayac = da_doldur(ws, kaynak, adlar)
    bootcamp_sekmesi(wb, "_YENİ BOOTCAMP", {}, [("A", "Ders", "Ders"), ("B", "", ""), ("C", "", "")])

    # Genel: bir bootcamp'e bağlı olmayan etkinlikler (Mentor Map'te "Genel" olarak görünür)
    wg = wb.create_sheet("Genel")
    wg.cell(1, 1, "Genel etkinlikler").font = Font(bold=True, size=13, color=YESIL)
    wg.cell(2, 1, "Bir bootcamp'e bağlı olmayan, Miuul genelindeki etkinlikler. Bootcamp'e bağlı etkinlikler o bootcamp'in sekmesine yazılır.")
    wg.cell(2, 1).font = Font(italic=True, color="6B5C57")
    wg.cell(3, 1, "Varsayılan saat").font = ETIKET
    wg.cell(3, 2, "20:30–23:00").fill = F_ACIK
    for i, (h, w) in enumerate(zip(ETK_BASLIK, ETK_GENISLIK), start=1):
        hc = wg.cell(5, i, h)
        hc.font, hc.fill = BASLIK, F_YESIL
        wg.column_dimensions[hc.column_letter].width = w
    yorum(wg.cell(5, 1), "Etkinliğin kalıcı numarası (1, 2, 3...). Tarih değişse de etkinlik aynı kalır.")
    yorum(wg.cell(5, 6), "Eğitmenler sekmesindeki adlardan; birden fazlaysa virgülle.")
    for r in range(6, SON + 1):
        wg.cell(r, 2).number_format = "yyyy-mm-dd"
    liste(wg, f"F6:F{SON}", formul="='Eğitmenler'!$A$2:$A$500", sert=False,
          mesaj="Eğitmenler sekmesindeki adlardan seçin; birden fazlaysa virgülle yazın.")
    wg.conditional_formatting.add(f"A6:H{SON}", FormulaRule(formula=['AND($A6<>"",COUNTIF($A$6:$A$300,$A6)>1)'],
                                                          fill=PatternFill("solid", fgColor="FDE3E5")))
    wg.freeze_panes = "A6"

    wb.move_sheet("DA", offset=-(len(wb.sheetnames) - 1))
    wb.move_sheet("Nasıl doldurulur", offset=-(len(wb.sheetnames) - 1))
    wb.active = 1
    wb.save(cikti)
    print(f"DA: {hafta} hafta · teyit: {sayac} · eğitmen: {wk.max_row - 1} -> {cikti}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
