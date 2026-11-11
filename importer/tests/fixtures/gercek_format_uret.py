"""Gerçek Excel'in sekme yapılarını uydurma adlarla taklit eden test dosyasını üretir.

Gerçek dosya (kişi adları içerdiği için) repoya girmez; bu dosya onun tuzaklarını taşır:
- Vibe: gün başlığında saat ("Pazartesi-TR 20:30"), tek ortak Eğitmen sütunu, "Ara" birleşik satırı,
  küçük harf "Tatil", "-" konu, "Tüm Ekip" yer tutucusu, "-" ile birleşik iki eğitmen,
  Pazartesi sütununda salıya düşen tarih.
- SQL: Salı ve Perşembe yan yana, ortak konu sütunu, sütun-gün kayması.
- DS: tek tarihli haftalık liste, tarihli "ARA" satırı, hafta numarası boş satır,
  ilk adla yazım ("Ali"), Türkçe harf farkı ("Akdag" / "Akdağ").
- DA: haftada üç oturum, "Mentor" yer tutucusu, tarihli serbest not, çözülemeyen ilk ad ("Zeki").
- Fabric: eğitmen sütunu yok, satır sonunda serbest not.
- Bos: boş sekme.

  python tests/fixtures/gercek_format_uret.py
"""

import datetime as dt
from pathlib import Path

from openpyxl import Workbook

D = dt.datetime

wb = Workbook()

ws = wb.active
ws.title = "Vibe"
ws["A1"] = "Vibe Code Eğitim Takvimi"
ws.merge_cells("A1:F1")
ws.merge_cells("A2:B2")
ws["C2"], ws["E2"], ws["F2"] = "Pazartesi-TR 20:30 ", "Perşembe-TR 20:30", "Eğitmen"
rows = [
    ("Kick-Off", "Tanışma Toplantısı", D(2026, 9, 15), None, None, "Tüm Ekip"),          # salı, pazartesi sütununda
    ("1.Hafta", "Temeller", D(2026, 9, 28), "Uygulama 1", D(2026, 10, 1), "Ali Veli-Ayşe Tan"),
    ("Ara",),
    ("2.Hafta", "-", D(2026, 10, 19), "Kurulum", D(2026, 10, 22), "Mert Akdag"),
    ("3.Hafta", "Entegrasyonlar", D(2026, 10, 26), "Tatil", D(2026, 10, 29), "-"),
]
for i, r in enumerate(rows, start=3):
    if r == ("Ara",):
        ws[f"A{i}"] = "Ara"
        ws.merge_cells(f"A{i}:F{i}")
        continue
    for col, v in zip("ABCDEF", r):
        if v is not None:
            ws[f"{col}{i}"] = v

ws = wb.create_sheet("SQL")
ws["A1"] = "AI SQL"
ws["A2"], ws["B2"], ws["C2"] = "Ders", "Salı", "Perşembe"
ws["A3"], ws["B3"] = "Kick-Off", D(2026, 10, 27)
ws["A4"], ws["B4"], ws["C4"] = "Foundations", D(2026, 11, 3), D(2026, 11, 5)
ws["A5"], ws["B5"], ws["C5"] = "Real Applications", D(2026, 11, 12), D(2026, 11, 17)  # ikisi de kaymış
ws["A6"], ws["B6"] = "Final Proje", D(2026, 12, 1)

ws = wb.create_sheet("DS")
ws["A1"] = "Yeni Program"
ws.merge_cells("A1:D1")
for col, v in zip("ABCD", ["HAFTA", "İÇERİK", "Tarihler", "RECAP"]):
    ws[f"{col}2"] = v
ds = [
    (0, "Kick-off / Başlangıç", D(2026, 10, 7), "Ali Veli"),
    (1, "Python I", D(2026, 10, 14), "Mert Akdağ"),
    (2, "ARA", D(2026, 10, 21), None),
    (None, "SQL", D(2026, 10, 28), "Ali & Deniz Su"),
    (3, "Final Projesi Sunumlar", D(2026, 11, 4), None),
]
for i, r in enumerate(ds, start=3):
    for col, v in zip("ABCD", r):
        if v is not None:
            ws[f"{col}{i}"] = v

ws = wb.create_sheet("DA")
ws["E2"], ws["F2"], ws["G2"] = "Ders", "Mentor Görüşmesi", "Güçlendirme"
ws["E3"], ws["F3"], ws["G3"] = "Çarşamba", "Pazartesi", "Salı"
da = [
    (D(2026, 8, 5), "Ders", "İstatistik", "Uyum", "Ali Veli", "10 Ağustos: İlk Tanışma", None),
    (D(2026, 8, 12), "Ders", "CRM", "Excel", "Ali & Zeki", "Mentor", "Zeki"),
    (D(2026, 8, 19), "Sunum", "Final Sunum", None, None, None, None),
]
for i, r in enumerate(da, start=4):
    for col, v in zip("ABCDEFG", r):
        if v is not None:
            ws[f"{col}{i}"] = v

ws = wb.create_sheet("Fabric")
ws["A1"] = "Fabric Takvimi"
ws.merge_cells("A1:D1")
for col, v in zip("ABCD", ["Ders", "Pazartesi", "Ders", "Perşembe"]):
    ws[f"{col}2"] = v
ws["A3"], ws["B3"], ws["C3"], ws["D3"] = "Lakehouse", D(2026, 11, 9), "Pipeline", D(2026, 11, 12)
ws["E3"] = "13 Kasım ek ders"

wb.create_sheet("Bos")

wb.save(Path(__file__).with_name("gercek_format.xlsx"))
print("gercek_format.xlsx yazıldı")
