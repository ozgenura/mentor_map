"""Mentor Map Google Sheets şablonunu (xlsx) üretir; Drive'a yüklenince Google Sheets'e çevrilir.

Kullanım: python3 sablon_uret.py veri.json cikti.xlsx
veri.json: {"bootcamplar": [...], "kisiler": [...], "oturumlar": [...], "turler": [...]}
"""
import datetime as dt
import json
import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

YESIL, KREM, MERCAN = "0B3B2C", "F7F3EF", "FDE3E5"
BASLIK = Font(bold=True, color="FFFFFF")
BASLIK_ZEMIN = PatternFill("solid", fgColor=YESIL)
GRI = Font(color="8F807A", size=9)
SAAT_DILIMLERI = ["Europe/Istanbul", "Europe/Berlin", "Europe/London", "Europe/Amsterdam", "Europe/Paris",
                  "Europe/Vienna", "Europe/Zurich", "America/New_York", "America/Toronto", "Asia/Dubai"]


def baslik(ws, basliklar, genislikler):
    ws.append(basliklar)
    for i, (h, w) in enumerate(zip(basliklar, genislikler), start=1):
        c = ws.cell(row=1, column=i)
        c.font, c.fill = BASLIK, BASLIK_ZEMIN
        c.alignment = Alignment(vertical="center")
        ws.column_dimensions[c.column_letter].width = w
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 22


def liste(ws, aralik, formul, mesaj, sert=True):
    dv = DataValidation(type="list", formula1=formul, allow_blank=True, showDropDown=False)
    dv.error, dv.errorTitle = mesaj, "Geçersiz değer"
    dv.errorStyle = "stop" if sert else "warning"
    ws.add_data_validation(dv)
    dv.add(aralik)


def main(veri_yolu, cikti):
    v = json.load(open(veri_yolu, encoding="utf-8"))
    wb = Workbook()

    # ------------------------------------------------------------ Oturumlar
    ws = wb.active
    ws.title = "Oturumlar"
    baslik(ws, ["ID", "Bootcamp", "Tarih", "Başlangıç", "Bitiş", "Tür", "Konu", "Ana eğitmen",
                "Yardımcı eğitmen(ler)", "Konuk"], [11, 10, 12, 10, 8, 16, 52, 20, 26, 18])
    ws["A1"].comment = Comment("Mentor Map'in oturum kimliği. Betik doldurur; elle yazmayın, silmeyin. "
                               "Yeni oturum için boş bir satıra yazmanız yeterli.", "Mentor Map")
    ws["E1"].comment = Comment("Gece yarısı biten ders için 00:00 yazın.", "Mentor Map")
    ws["I1"].comment = Comment("Birden fazla kişi: virgülle ayırın. Adlar Kişiler sekmesindeki gibi yazılmalı.", "Mentor Map")
    ws["J1"].comment = Comment("Mentor Map'te kaydı olmayan dış konuşmacı. Virgülle ayırın.", "Mentor Map")
    for o in v["oturumlar"]:
        bas = dt.time.fromisoformat(o["baslangic"]) if o.get("baslangic") else None
        bit = dt.time.fromisoformat(o["bitis"]) if o.get("bitis") else None
        ws.append([o["id"], o["bootcamp"], dt.date.fromisoformat(o["tarih"]), bas, bit, o["tur"], o["konu"],
                   o.get("ana") or "", o.get("yardimci") or "", o.get("konuk") or ""])
    son = 2000
    for r in range(2, son + 1):
        ws.cell(row=r, column=1).font = GRI
        ws.cell(row=r, column=3).number_format = "yyyy-mm-dd"
        ws.cell(row=r, column=4).number_format = "hh:mm"
        ws.cell(row=r, column=5).number_format = "hh:mm"
    liste(ws, f"B2:B{son}", "='Bootcamp''ler'!$A$2:$A$100", "Bootcamp'ler sekmesindeki kodlardan birini seçin.")
    liste(ws, f"F2:F{son}", '"' + ",".join(t for t in v["turler"] if t != "Yan Seans") + '"',
          "Listeden bir tür seçin.")
    liste(ws, f"H2:H{son}", "='Kişiler'!$A$2:$A$300", "Kişiler sekmesindeki adlardan birini seçin.")
    tv = DataValidation(type="date", operator="greaterThan", formula1="DATE(2024,1,1)", allow_blank=True)
    tv.error = "Tarih girin (örnek: 2026-11-12)."
    ws.add_data_validation(tv)
    tv.add(f"C2:C{son}")
    # geçmiş tarihli satırları soluk göster
    ws.conditional_formatting.add(f"A2:J{son}", FormulaRule(formula=["AND($C2<>\"\",$C2<TODAY())"],
                                                            font=Font(color="A39690")))

    # ------------------------------------------------------------ Kişiler
    wk = wb.create_sheet("Kişiler")
    baslik(wk, ["Ad", "E-posta", "Rol", "Saat dilimi", "Ana eğitmen olduğu bootcamp'ler", "Aktif"],
           [22, 34, 11, 18, 30, 8])
    wk["A1"].comment = Comment("Oturumlar sekmesinde bu ad kullanılır. Adı değiştirirseniz oturumlardaki yazımı da değiştirin.", "Mentor Map")
    wk["B1"].comment = Comment("Giriş bu adresle yapılır. 'eposta-bekleniyor' yazanlar giriş yapamaz: gerçek adresi girin.", "Mentor Map")
    wk["E1"].comment = Comment("Bootcamp kodları, virgülle (örnek: DA, İK). Ana eğitmen o bootcamp'te iptal ve link düzenleyebilir.", "Mentor Map")
    for k in v["kisiler"]:
        wk.append([k["ad"], k["eposta"], "Yönetici" if k["rol"] == "yonetici" else "Eğitmen", k["saat_dilimi"],
                   k.get("ana") or "", "EVET" if k["aktif"] else "HAYIR"])
    liste(wk, "C2:C300", '"Eğitmen,Yönetici"', "Eğitmen ya da Yönetici seçin.")
    liste(wk, "D2:D300", '"' + ",".join(SAAT_DILIMLERI) + '"', "Listede yoksa IANA adını yazın (örnek: Asia/Tokyo).", sert=False)
    liste(wk, "F2:F300", '"EVET,HAYIR"', "EVET ya da HAYIR seçin.")
    wk.conditional_formatting.add("B2:B300", FormulaRule(formula=['ISNUMBER(SEARCH("eposta-bekleniyor",B2))'],
                                                        fill=PatternFill("solid", fgColor=MERCAN)))

    # ------------------------------------------------------------ Bootcamp'ler
    wb_ = wb.create_sheet("Bootcamp'ler")
    baslik(wb_, ["Kod", "Ad", "Renk", "Varsayılan Zoom linki"], [10, 34, 10, 48])
    wb_["A1"].comment = Comment("Kısa kod; Oturumlar sekmesinde bu kod seçilir. Değiştirmeyin.", "Mentor Map")
    wb_["C1"].comment = Comment("Takvimdeki renk, #RRGGBB (örnek: #7FA650).", "Mentor Map")
    wb_["D1"].comment = Comment("Bu bootcamp'in oturumlarında, ayrı link girilmedikçe bu link görünür.", "Mentor Map")
    for b in v["bootcamplar"]:
        wb_.append([b["kod"], b["ad"], b["renk"], b.get("zoom") or ""])
        wb_.cell(row=wb_.max_row, column=3).fill = PatternFill("solid", fgColor=b["renk"].lstrip("#"))

    # ------------------------------------------------------------ Senkron (betik doldurur)
    ws_log = wb.create_sheet("Senkron")
    ws_log.append(["Son deneme", "Henüz gönderilmedi"])
    ws_log.append(["Durum", "Bağlantı kurulunca burada görünür"])
    ws_log["A1"].font = ws_log["A2"].font = Font(bold=True)
    ws_log.column_dimensions["A"].width = 16
    ws_log.column_dimensions["B"].width = 60

    # ------------------------------------------------------------ Nasıl kullanılır
    wn = wb.create_sheet("Nasıl kullanılır")
    wn.column_dimensions["A"].width = 110
    satirlar = [
        ("Mentor Map program şablonu", True),
        ("Bu dosya Mentor Map'in kaynağıdır. Burada yapılan değişiklik yaklaşık 1 dakika içinde uygulamaya yansır.", False),
        ("", False),
        ("Günlük kullanım", True),
        ("• Her satır bir oturumdur. Yeni oturum için Oturumlar sekmesinde boş bir satıra yazın; ID'yi betik verir.", False),
        ("• Bir oturumu kopyalayıp yapıştırarak çoğaltabilirsiniz; kopyaya yeni ID verilir.", False),
        ("• Oturumu silmek için satırı silin. Mentor Map'te 'şablondan kalktı' olarak işaretlenir, kaybolmaz.", False),
        ("• İptal, Zoom linki ve notlar uygulamadan yönetilir; bu dosyada ilgili sütun yok.", False),
        ("• Saatler Türkiye saatidir. Gece yarısı biten ders için Bitiş'e 00:00 yazın.", False),
        ("• Eğitmen adları Kişiler sekmesindekiyle aynı yazılmalı. Dış konuşmacılar Konuk sütununa.", False),
        ("• Hatalı satırlar kırmızıya boyanır ve Senkron sekmesinde nedeniyle listelenir; düzeltince kırmızı kalkar.", False),
        ("• Aynı anda çok sayıda oturum silinirse (%20'den fazla) gönderim durur ve onay ister: Mentor Map menüsü → Büyük değişikliği onayla ve gönder.", False),
        ("", False),
        ("Kurulum (dosyanın sahibi bir kez yapar)", True),
        ("1. Uzantılar → Apps Script. Açılan sayfadaki kodu silin, Mentor Map betiğinin (MentorMap.gs) tamamını yapıştırın, Kaydet'e basın.", False),
        ("2. Bu sekmeyi yenileyin. Menüde 'Mentor Map' görünür.", False),
        ("3. Yönetici uygulamada Profil → Google Sheets bağlantısı → 'Bağlantı anahtarı üret' der ve anahtarı size iletir.", False),
        ("4. Mentor Map → Bağlantıyı kur → anahtarı yapıştırın. Google izin ister; izin verin. İlk gönderim hemen yapılır.", False),
        ("5. Senkron sekmesinde 'Gönderildi' görmelisiniz.", False),
        ("", False),
        ("Satır renkleri betik tarafından yönetilir (kırmızı = hatalı satır); Oturumlar sekmesinde elle renk vermeyin.", False),
    ]
    for metin, kalin in satirlar:
        wn.append([metin])
        c = wn.cell(row=wn.max_row, column=1)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if kalin:
            c.font = Font(bold=True, size=13 if wn.max_row == 1 else 11, color=YESIL)

    wb.save(cikti)
    print(f"{len(v['oturumlar'])} oturum, {len(v['kisiler'])} kişi, {len(v['bootcamplar'])} bootcamp -> {cikti}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
