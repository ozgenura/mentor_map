import datetime as dt
import re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

D = dt.date
TR_ABBR = {9: "Eyl", 10: "Eki", 11: "Kas", 12: "Ara", 1: "Oca"}
TR_FULL = {9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık", 1: "Ocak"}
EN_FULL = {9: "September", 10: "October", 11: "November", 12: "December"}
GUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]

events = []


TR_MAP = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


def slug(s):
    s = s.translate(TR_MAP).lower()
    out = "".join(ch if ch.isalnum() else "-" for ch in s)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def trlower(s):
    return s.replace("İ", "i").replace("I", "ı").lower()


ALIASES = {"ayşe k.": "Ayşe Kaya", "e. şahin": "Elif Şahin"}


def clean_name(raw):
    n = " ".join(raw.split())
    if trlower(n) in ALIASES:
        return ALIASES[trlower(n)]
    return " ".join(w[:1].upper() + w[1:] for w in n.split(" "))


# Oturum türü kuralı: öncelik sırasıyla, satır etiketi + konu metninde aranır
TYPE_RULES = [
    (("kick-off", "açılış"), "Kick-Off"),
    (("master class",), "Master Class"),
    (("sunum",), "Sunum"),
    (("final proje", "proje çalışma", "proje teslim", "capstone"), "Proje"),
    (("uygulama",), "Uygulama"),
]


def session_type(row_label, konu, default):
    t = trlower(f"{row_label} {konu}")
    for kws, name in TYPE_RULES:
        if any(re.search(r"\b" + re.escape(k), t) for k in kws):
            return name
    return default


def ev(bootcamp, date, start, end, raw, row_label, konu, default_tur, slot, kaynak,
       notes=(), written_gun=None):
    raws = [p for p in (raw or "").split(" / ")] if raw and raw.strip() else [""]
    for rp in raws:
        m = clean_name(rp) if rp.strip() else ""
        warn, note = [], list(notes)
        if not m:
            warn.append("EGITMEN_YOK")
        if not start:
            warn.append("SAAT_YOK")
        gun = GUN[date.weekday()]
        if written_gun and written_gun != gun:
            warn.append("GUN_UYUSMAZLIGI")
        if m and rp != m:
            note.append("ISIM_NORMALIZE")
        if len(raws) > 1:
            note.append("COKLU_EGITMEN")
        if date.year > 2026:
            note.append("YIL_DEVRI")
        sid = f"{slug(bootcamp)}-{date.isoformat()}-{slot}-{slug(m) or 'atanmamis'}"
        events.append(dict(id=sid, bootcamp=bootcamp, tarih=date, gun=gun, slot=slot,
                           baslangic=start or "", bitis=end or "", mentor=m,
                           oturum_turu=session_type(row_label, konu, default_tur),
                           konu=konu, kaynak=kaynak,
                           uyarilar=";".join(warn), parser_notlari=";".join(note)))


thin = Side(style="thin", color="999999")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
F = "Arial"


def fill(h):
    return PatternFill("solid", start_color=h, end_color=h)


def cell(ws, ref, val, bold=False, color="000000", bg=None, size=10, center=True, border=True):
    c = ws[ref]
    c.value = val
    c.font = Font(name=F, bold=bold, color=color, size=size)
    if bg:
        c.fill = fill(bg)
    c.alignment = Alignment(horizontal="center" if center else "left", vertical="center", wrap_text=False)
    if border:
        c.border = BORDER
    return c


def widths(ws, ws_w):
    for i, w in enumerate(ws_w, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


wb = Workbook()

# ---------------------------------------------------------------- İK (format A)
ws = wb.active
ws.title = "İK"
widths(ws, [12, 62, 18, 10, 18, 10, 24, 18])
BLACK, LAV, PURPLE = "000000", "D9D2E9", "8E7CC3"
for r in (1, 2):
    for col in "ABCDEFGH":
        ws[f"{col}{r}"].fill = fill(BLACK)
ws.merge_cells("A1:C2")
cell(ws, "A1", "İK ANALİTİĞİ BOOTCAMP PROGRAM AKIŞI", bold=True, color="FFFFFF", bg=BLACK, size=12)
ws.merge_cells("D1:E1"); cell(ws, "D1", "Ders", True, "FFFFFF", BLACK)
ws.merge_cells("D2:E2"); cell(ws, "D2", "TR 20:30 - 24:00", True, "FFFFFF", BLACK)
ws.merge_cells("F1:G1"); cell(ws, "F1", "Uygulama", True, "FFFFFF", BLACK)
ws.merge_cells("F2:G2"); cell(ws, "F2", "TR 20:30 - 23:00", True, "FFFFFF", BLACK)
for col, v in zip("ABCDEFGH", ["", "", "Konu", "Salı", "Eğitmen", "Perşembe", "", "Eğitmen"]):
    cell(ws, f"{col}3", v, True, bg=LAV)

ik = [
    ("Kick-Off", "HR Analytics Foundations & AI Ethics", "General Info", D(2026, 9, 22), "Ayşe Kaya", ["Ayşe Kaya"], D(2026, 9, 24), "-", "", []),
    ("Ders", "Getting the Data Right: Sampling & Statistics", "Excel-İstatistik", D(2026, 9, 29), "Ayşe Kaya ", ["Ayşe Kaya"], D(2026, 10, 1), "İstatistik-Güçlendirme", "Can Yıldız", ["Can Yıldız"]),
    ("Ders", "From Questions to Evidence: Statistical Tests & Surveys", "Excel-İstatistik", D(2026, 10, 6), "ayşe kaya", ["Ayşe Kaya"], D(2026, 10, 8), "İstatistik-Güçlendirme", "Can Yıldız", ["Can Yıldız"]),
    ("Ders", "Deeper Analysis: SQL Basics & HR Data Management", "Sql", D(2026, 10, 13), "Mehmet Demir", ["Mehmet Demir"], D(2026, 10, 15), "Uygulama Sql-1", "Elif Şahin", ["Elif Şahin"]),
    ("Ders", "Building Trustworthy Analytics: Advanced HR Metrics with SQL", "Sql", D(2026, 10, 20), "Ayşe K.", ["Ayşe Kaya"], D(2026, 10, 22), "Uygulama Sql-2", "Elif Şahin", ["Elif Şahin"]),
    ("Ders", "Telling the Story with Data: Visualization & BI Tools", "Power BI", D(2026, 10, 27), "Zeynep Arslan", ["Zeynep Arslan"], D(2026, 10, 29), "TATİL", None, None),
    ("Ders", "Operational HR Reporting: Dashboards in Power BI", "Power BI", D(2026, 11, 3), "Zeynep Arslan", ["Zeynep Arslan"], D(2026, 11, 5), "Uygulama Power BI", "Zeynep Arslan", ["Zeynep Arslan"]),
    ("Uygulama", "Operational HR Reporting: Dashboards in Power BI", "Uygulama Power BI", D(2026, 11, 10), "Zeynep Arslan", ["Zeynep Arslan"], D(2026, 11, 12), "Kitap Sunumu", "MERGE", []),
    ("ARA",),
    ("Ders", "Python for HR Analytics: Coding Fundamentals & ML Prep", "Python", D(2026, 11, 24), "Burak Aydın", ["Burak Aydın"], D(2026, 11, 26), "Uygulama Python 1", "İrem Aksoy", ["İrem Aksoy"]),
    ("Ders", "Predictive HR Analytics: Supervised Learning", "Python", D(2026, 12, 1), "Burak Aydın", ["Burak Aydın"], D(2026, 12, 3), "Uygulama Python 2", "İrem Aksoy", ["İrem Aksoy"]),
    ("Ders", "The Future of HR Analytics: GenAI Trends", "Python", D(2026, 12, 8), "Burak Aydın", ["Burak Aydın"], D(2026, 12, 10), "-", "", []),
    ("Proje 1", "Final Projeleri Hazırlık", "FP Çalışma", D(2026, 12, 15), "Selin Öztürk", ["Selin Öztürk"], D(2026, 12, 17), "Master Class Gen AI", "Deniz Koç", ["Deniz Koç"]),
    ("Proje 2", "Final Projeleri Geliştirme", "FP Çalışma", D(2026, 12, 22), "Selin Öztürk", ["Selin Öztürk"], D(2026, 12, 24), "Proje Çalışma", "Selin Öztürk", ["Selin Öztürk"]),
    ("ARA",),
    ("Proje 3", "Final Projeleri Hikayeleştirme", "FP Çalışma", D(2027, 1, 5), "Selin Öztürk", ["Selin Öztürk"], D(2027, 1, 7), "Proje Çalışma", "Selin Öztürk", ["Selin Öztürk"]),
    ("SUNUM",),
]
r = 4


def ik_date(d):
    return f"{d.day:02d} {TR_ABBR[d.month]}"


def tur_of(a, thu=False):
    if thu:
        return "Uygulama"
    if a.startswith("Proje"):
        return "Proje"
    return a


for row in ik:
    if row[0] == "ARA":
        ws.merge_cells(f"A{r}:H{r}")
        cell(ws, f"A{r}", "ARA", True, bg=PURPLE)
        r += 1
        continue
    if row[0] == "SUNUM":
        for col in "ABCDEFGH":
            ws[f"{col}{r}"].fill = fill(BLACK)
        cell(ws, f"A{r}", "Sunum", True, "FFFFFF", BLACK)
        cell(ws, f"F{r}", ik_date(D(2027, 1, 14)), True, "FFFFFF", "9900FF")
        cell(ws, f"G{r}", "Final Projesi", True, "FFFFFF", "9900FF")
        ev("İK", D(2027, 1, 14), "20:30", "23:00", "", "Sunum", "Final Projesi", "Uygulama", "persembe", f"İK!F{r}")
        r += 1
        continue
    a, b, c, td, tw, tm, hd, ht, hw, hm = row
    cell(ws, f"A{r}", a, color="9900FF" if a == "Kick-Off" else "000000", bold=a == "Kick-Off")
    cell(ws, f"B{r}", b)
    cell(ws, f"C{r}", c)
    cell(ws, f"D{r}", ik_date(td), True)
    cell(ws, f"E{r}", tw)
    cell(ws, f"F{r}", ik_date(hd), True)
    yd = "YIL_DEVRİ" if td.year == 2027 else ""
    ev("İK", td, "20:30", "24:00", tw, a, b, "Ders", "sali", f"İK!D{r}")
    if ht == "TATİL":
        ws.merge_cells(f"G{r}:H{r}")
        cell(ws, f"G{r}", "TATİL", True, bg=PURPLE)
    elif hw == "MERGE":
        ws.merge_cells(f"G{r}:H{r}")
        cell(ws, f"G{r}", ht, True, bg=LAV)
        ev("İK", hd, "20:30", "23:00", "", a, ht, "Uygulama", "persembe", f"İK!F{r}")
    else:
        cell(ws, f"G{r}", ht)
        cell(ws, f"H{r}", hw)
        if ht != "-":
            ev("İK", hd, "20:30", "23:00", hw, a, ht, "Uygulama", "persembe", f"İK!F{r}")
    r += 1

# ---------------------------------------------------------------- Fabric (format B)
ws = wb.create_sheet("Fabric")
widths(ws, [44, 13, 22, 40, 13, 18])
G, LG = "6AA84F", "D9EAD3"
ws.merge_cells("A1:F1")
cell(ws, "A1", "Microsoft Fabric Uygulamalı Eğitim Programı Takvimi", True, "FFFFFF", BLACK, 14)
for col, v in zip("ABCDEF", ["Ders", "Pazartesi", "Eğitmen", "Ders", "Perşembe", "Eğitmen"]):
    cell(ws, f"{col}2", v, True, "FFFFFF", G)
fab = [
    ("Kick-Off", D(2026, 10, 12), "12 Ekim", "Elif Şahin", ["Elif Şahin"], None, None, None, None),
    ("BI, DWH ve Microsoft Fabric'e Giriş", D(2026, 10, 19), "19 Ekim", "Elif Şahin", ["Elif Şahin"], "BI Modelleme Temelleri", D(2026, 10, 22), "Can Yıldız", ["Can Yıldız"]),
    ("Lakehouse ve OneLake Kullanımı", D(2026, 10, 26), "26 Ekim", "Elif Şahin", ["Elif Şahin"], "TATİL", D(2026, 10, 29), "", None),
    ("Dataflow Gen2 ile Veri Hazırlama", D(2026, 11, 2), "2 Kasım", "Elif Şahin / Emre Çelik", ["Elif Şahin", "Emre Çelik"], "MSSQL Kaynağından Fact Veri Alma", D(2026, 11, 5), "Can Yıldız", ["Can Yıldız"]),
    ("Spark SQL ve Parquet Dosya Mantığı", D(2026, 11, 9), "9 Kasım", "Elif Şahin", ["Elif Şahin"], "Pipeline ile Veri Orkestrasyonu", D(2026, 11, 12), "Can Yıldız", ["Can Yıldız"]),
    ("Warehouse ve Veri Kalitesi", D(2026, 11, 16), "16 Kasım ", "Elif Şahin", ["Elif Şahin"], "Power BI Semantic Model", D(2026, 11, 19), "Can Yıldız", ["Can Yıldız"]),
    ("DAX Temelleri", D(2026, 11, 23), "23 kasım", "E. Şahin", ["Elif Şahin"], "Power BI Rapor Tasarımı ve Yayınlama", D(2026, 11, 26), "Can Yıldız", ["Can Yıldız"]),
    ("Final Proje: Uçtan Uca Fabric Projesi", D(2026, 11, 30), "30 Kasım", "Elif Şahin", ["Elif Şahin"], None, None, None, None),
]
r = 3
for i, (mt, md, mds, mw, mm, tt, tdte, tw, tm) in enumerate(fab):
    bg = None if i % 2 == 0 else LG
    if mt == "Kick-Off":
        cell(ws, f"A{r}", mt, True, "FFFFFF", BLACK)
        tur = "Kick-Off"
    elif mt.startswith("Final"):
        cell(ws, f"A{r}", mt, True, bg="FFF2CC")
        tur = "Proje"
    else:
        cell(ws, f"A{r}", mt, bg=bg)
        tur = "Ders"
    cell(ws, f"B{r}", mds, True, bg=bg)
    cell(ws, f"C{r}", mw, bg=bg)
    ev("Fabric", md, None, None, mw, "", mt, "Ders", "pazartesi", f"Fabric!B{r}")
    if tt is None:
        for col in "DEF":
            cell(ws, f"{col}{r}", "")
    elif tt == "TATİL":
        cell(ws, f"D{r}", "TATİL", True, bg="FCE5CD")
        cell(ws, f"E{r}", f"{tdte.day} {TR_FULL[tdte.month]}", True, bg="FCE5CD")
        cell(ws, f"F{r}", "", bg="FCE5CD")
    else:
        cell(ws, f"D{r}", tt, bg="D0E0E3" if i == 1 else bg)
        cell(ws, f"E{r}", f"{tdte.day} {TR_FULL[tdte.month]}", True, bg=bg)
        cell(ws, f"F{r}", tw, bg=bg)
        ev("Fabric", tdte, None, None, tw, "", tt, "Ders", "persembe", f"Fabric!E{r}")
    r += 1

# ---------------------------------------------------------------- Quantum (format C)
ws = wb.create_sheet("Quantum")
widths(ws, [11, 44, 12, 52, 12])
B, LB = "4A86E8", "C9DAF8"
ws.merge_cells("A1:E1")
cell(ws, "A1", "Quantum Makine Öğrenmesi Uygulamalı Eğitim Programı Takvimi", True, size=13)
ws.merge_cells("A2:E2")
cell(ws, "A2", "Eğitmen: Deniz Koç  |  Konuk eğitmenler parantez içinde belirtilmiştir", center=False, size=9)
for col, v in zip("ABCDE", ["", "Ders", "Salı", "Ders", "Perşembe"]):
    cell(ws, f"{col}3", v, True, "FFFFFF", B)
cell(ws, "A4", ""); cell(ws, "B4", ""); cell(ws, "C4", "")
cell(ws, "D4", "Kick-Off", True, "FFFFFF", BLACK); cell(ws, "E4", "24 Eylül", True)
ev("Quantum", D(2026, 9, 24), None, None, "Deniz Koç", "", "Kick-Off", "Ders", "persembe", "Quantum!E4", ["EGITMEN_BASLIKTAN"])
qu = [
    ("1.Hafta", "Quantum için Python Giriş", D(2026, 9, 29), "Quantum için Python Giriş", D(2026, 10, 1)),
    ("2.Hafta", "Kuantum Bilgisayara Giriş & Donanımlar", D(2026, 10, 6), "ML, Scikit-Learn, Qiskit, Keras, TensorFlow, PennyLane", D(2026, 10, 8)),
    ("3.Hafta", "Kuantum Fizik Temelleri & Algoritmalar", D(2026, 10, 13), "Derin Öğrenme Master Class (Konuk: Burak Aydın)", D(2026, 10, 15)),
    ("4.Hafta", "Yapay Zeka & Makine Öğrenmesi", D(2026, 10, 20), "Yapay Zeka & Makine Öğrenmesi", D(2026, 10, 22)),
    ("5.Hafta", "TATİL", D(2026, 10, 27), "TATİL", D(2026, 10, 29)),
    ("6.Hafta", "ML vs QML Karşılaştırması", D(2026, 11, 3), "Python ile Kuantum Uygulama", D(2026, 11, 5)),
    ("7.Hafta", "Quantum AI & Quantum ML", D(2026, 11, 10), "Hybrid Model Stratejisi", D(2026, 11, 12)),
    ("8.Hafta", "Güvenlik & Risk Modelleme", D(2026, 11, 17), "Capstone Sunum Çalışması", D(2026, 11, 19)),
]
r = 5
for i, (h, t1, d1, t2, d2) in enumerate(qu):
    if t1 == "TATİL":
        bg = "EAD1DC"
        for col, v in zip("ABCDE", [h, "TATİL", f"{d1.day} {TR_FULL[d1.month]}", "TATİL", f"{d2.day} {TR_FULL[d2.month]}"]):
            cell(ws, f"{col}{r}", v, True, "FFFFFF", bg)
        r += 1
        continue
    bg = LB if i % 2 else None
    cell(ws, f"A{r}", h, True, bg=bg, center=False)
    cell(ws, f"B{r}", t1, bg=bg)
    cell(ws, f"C{r}", f"{d1.day} {TR_FULL[d1.month]}", True, bg=bg)
    cell(ws, f"D{r}", t2, bold="Capstone" in t2, bg=bg)
    cell(ws, f"E{r}", f"{d2.day} {TR_FULL[d2.month]}", True, bg=bg)
    ev("Quantum", d1, None, None, "Deniz Koç", "", t1, "Ders", "sali", f"Quantum!C{r}", ["EGITMEN_BASLIKTAN"])
    if "Konuk:" in t2:
        ev("Quantum", d2, None, None, "Burak Aydın", "", "Derin Öğrenme Master Class", "Ders", "persembe", f"Quantum!E{r}", ["EGITMEN_KONU_METNINDEN"])
    else:
        ev("Quantum", d2, None, None, "Deniz Koç", "", t2, "Ders", "persembe", f"Quantum!E{r}", ["EGITMEN_BASLIKTAN"])
    r += 1

# ---------------------------------------------------------------- BIO (format D: tidy table)
ws = wb.create_sheet("BIO")
widths(ws, [20, 12, 22, 16, 18, 52, 58, 14, 16])
IND = "351C75"
for col, v in zip("ABCDEFGHI", ["Tarih", "Gün", "Hafta", "Aşama", "Oturum", "Konu", "İçerik / Araçlar", "Saat", "Eğitmen"]):
    cell(ws, f"{col}1", v, True, "FFFFFF", IND)
bio = [
    # date, gün yazılan, hafta, aşama, oturum, konu, içerik, saat yazılan, (bas,bit), eğitmen yazılan, eğitmen temiz, uyarı, date_style
    (D(2026, 10, 12), "Pazartesi", "Açılış", "Açılış etkinliği", "Açılış", "Program tanıtımı ve süreç bilgilendirmesi", "", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Kick-Off", "", "en"),
    (D(2026, 10, 13), "Salı", "Ön Hazırlık 1. Hafta", "Ön hazırlık", "Salı oturumu", "Omikler nedir? Genomik nedir?", "Doküman: Sunum; teorik anlatım", "20.00-22.30", ("20:00", "22:30"), "Kaan Polat", "Ders", "SAAT_FORMATI_FARKLI", "en"),
    (D(2026, 10, 15), "Perşembe", "Ön Hazırlık 1. Hafta", "Ön hazırlık", "Perşembe oturumu", "Omikler nedir? Genomik nedir?", "Doküman: Sunum; araştırma ödevi", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 10, 20), "Salı", "Ön Hazırlık 2. Hafta", "Ön hazırlık", "Salı oturumu", "FASTQ ve kalite kontrolün gerçek anlamı", "Araçlar: Terminal, FastQC", "20:00–22:00", ("20:00", "22:00"), "Ayşe Kaya", "Ders", "", "en"),
    (D(2026, 10, 22), "Perşembe", "Ana Program 1. Hafta", "Ana program", "Perşembe oturumu", "Genomik veri türleri ve deneysel tasarım", "Doküman: Sunum; Jupyter Notebook", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 10, 27), "Salı", "Ana Program 2. Hafta", "Ana program", "Salı oturumu", "Alignment mantığı ve referans genom", "Araçlar: Terminal, BWA, SAM/BAM", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 10, 28), "Perşembe", "Ana Program 2. Hafta", "Ana program", "Perşembe oturumu", "FASTQ ve kalite kontrol (tekrar)", "Araçlar: Terminal, FastQC", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "GÜN_UYUŞMAZLIĞI (Perşembe yazıyor, tarih Çarşamba)", "en"),
    (D(2026, 11, 3), "Salı", "Ana Program 3. Hafta", "Ana program", "Salı oturumu", "VCF okuma ve filtreleme stratejileri", "Araçlar: bcftools", "20:00 - 22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 11, 5), "Perşembe", "Ana Program 3. Hafta", "Ana program", "Perşembe oturumu", "Variant Calling Pipeline", "Araçlar: GATK", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 11, 10), "Salı", "Ana Program 4. Hafta", "Ana program", "Salı oturumu", "Klinik ve fonksiyonel yorumlama", "Araçlar: ClinVar, gnomAD", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "TARİH_HÜCRESİ_GERÇEK_TARİH", "date"),
    (D(2026, 11, 12), "Perşembe", "Ana Program 4. Hafta", "Ana program", "Perşembe oturumu", "Variant Annotation Mantığı", "Araçlar: ANNOVAR", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 11, 17), "Salı", "Ana Program 5. Hafta", "Ana program", "Salı oturumu", "Karşılaştırmalı genomik analizler", "Araçlar: scikit-allel, NumPy, pandas", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 11, 19), "Perşembe", "Ana Program 5. Hafta", "Ana program", "Perşembe oturumu", "Popülasyon Genomiği Temelleri", "Araçlar: scikit-allel", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 11, 24), "Salı", "Ana Program 6. Hafta", "Ana program", "Salı oturumu", "Fonksiyonel yorumlama pipeline mimarisi", "Araçlar: Snakemake", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 11, 26), "Perşembe", "Ana Program 6. Hafta", "Ana program", "Perşembe oturumu", "Varyanttan Fonksiyona", "Araçlar: VEP, SnpEff", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 12, 1), "Salı", "Ana Program 7. Hafta", "Ana program", "Salı oturumu", "Kanser Genomiği Perspektifi", "Araçlar: COSMIC, cBioPortal", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 12, 3), "Perşembe", "Ana Program 7. Hafta", "Ana program", "Perşembe oturumu", "Klinik Genomik Vaka Analizi", "Doküman: Sunum; ClinVar, ACMG", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 12, 8), "Salı", "Ana Program 8. Hafta", "Ana program", "Salı oturumu", "Genomikte Gelecek ve Kariyer", "Teorik anlatım; Final Projesi", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 12, 10), "Perşembe", "Ana Program 8. Hafta", "Ana program", "Perşembe oturumu", "Baştan Sona Genomik Proje Tasarımı", "Araçlar: Git, GitHub, Linux", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Ders", "", "en"),
    (D(2026, 12, 15), "Salı", "Proje Teslimi", "Proje teslimi", "Teslim oturumu", "Final proje teslimi", "Proje teslimi / son kontrol", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Proje", "", "en"),
    (D(2026, 12, 17), "Perşembe", "Proje Teslimi", "Proje teslimi", "Teslim oturumu", "Final proje teslimi", "Proje teslimi / son kontrol", "20:00–22:00", ("20:00", "22:00"), "Kaan Polat", "Proje", "", "en"),
]
r = 2
for (d, gw, h, a, o, k, ic, sw, (s, e), mw, tur, uy, style) in bio:
    stage_bg = "FFF2CC" if a in ("Açılış etkinliği", "Proje teslimi") else ("DEEAF6" if a == "Ön hazırlık" else "EDE7F6")
    if style == "date":
        c = cell(ws, f"A{r}", dt.datetime(d.year, d.month, d.day), bg=stage_bg, center=False)
        c.number_format = "dd.mm.yyyy"
    else:
        cell(ws, f"A{r}", f"{d.day:02d} {EN_FULL[d.month]} {d.year}", bg=stage_bg, center=False)
    for col, v in zip("BCDEFGHI", [gw, h, a, o, k, ic, sw, mw]):
        cell(ws, f"{col}{r}", v, bg=stage_bg, center=False)
    ev("BIO", d, s, e, mw, a, k, "Ders", slug(gw), f"BIO!A{r}", written_gun=gw)
    r += 1

# ---------------------------------------------------------------- DS (format A variant, real date cells)
ws = wb.create_sheet("DS")
widths(ws, [12, 50, 13, 26, 13, 30, 18])
for rr in (1, 2):
    for col in "ABCDEFG":
        ws[f"{col}{rr}"].fill = fill(BLACK)
ws.merge_cells("A1:B2")
cell(ws, "A1", "DATA SCIENCE BOOTCAMP PROGRAM AKIŞI", True, "FFFFFF", BLACK, 12)
ws.merge_cells("C1:G1"); cell(ws, "C1", "Ders & Uygulama", True, "FFFFFF", BLACK)
ws.merge_cells("C2:G2"); cell(ws, "C2", "TR 19:00 - 22:00", True, "FFFFFF", BLACK)
for col, v in zip("ABCDEFG", ["", "Konu", "Salı", "Eğitmen", "Perşembe", "Uygulama", "Eğitmen"]):
    cell(ws, f"{col}3", v, True, bg="FCE5CD")
ds = [
    ("Kick-Off", "Veri Bilimine Giriş & Program Tanıtımı", D(2026, 10, 6), "Emre Çelik", ["Emre Çelik"], D(2026, 10, 8), "Python Kurulum Atölyesi", "Mehmet  Demir", ["Mehmet Demir"], ""),
    ("Ders", "Python ile Veri Manipülasyonu (pandas)", D(2026, 10, 13), "Emre Çelik", ["Emre Çelik"], D(2026, 10, 15), "Uygulama pandas-1", "Mehmet Demir", ["Mehmet Demir"], ""),
    ("Ders", "Keşifçi Veri Analizi (EDA)", D(2026, 10, 20), "Emre Çelik", ["Emre Çelik"], D(2026, 10, 22), "Uygulama EDA", "Mehmet Demir", ["Mehmet Demir"], ""),
    ("Ders", "Özellik Mühendisliği", D(2026, 10, 27), "Emre Çelik", ["Emre Çelik"], D(2026, 10, 29), "TATİL", None, None, ""),
    ("Ders", "Denetimli Öğrenme: Regresyon", D(2026, 11, 3), "Emre Çelik", ["Emre Çelik"], D(2026, 11, 5), "Uygulama Regresyon", "Can Yıldız", ["Can Yıldız"], ""),
    ("Ders", "Denetimli Öğrenme: Sınıflandırma", D(2026, 11, 10), "Emre Çelik", ["Emre Çelik"], D(2026, 11, 12), "Uygulama Sınıflandırma", "Mehmet Demir", ["Mehmet Demir"], ""),
    ("Ders", "Model Değerlendirme & Hiperparametre", D(2026, 11, 17), "Zeynep Arslan / Emre Çelik", ["Zeynep Arslan", "Emre Çelik"], D(2026, 11, 19), "Uygulama Model Seçimi", "Mehmet Demir", ["Mehmet Demir"], ""),
    ("Ders", "Denetimsiz Öğrenme", D(2026, 11, 24), "Emre Çelik", ["Emre Çelik"], "31.11.2026", "Uygulama Kümeleme", "Mehmet Demir", ["Mehmet Demir"], "GEÇERSİZ_TARİH"),
    ("Proje", "Final Proje Çalışması", D(2026, 12, 1), "Emre Çelik", ["Emre Çelik"], D(2026, 12, 3), "Final Sunumları", "", [], ""),
]
r = 4
invalid_rows = []
for (a, b, td, tw, tm, hd, ht, hw, hm, flag) in ds:
    cell(ws, f"A{r}", a, bold=a == "Kick-Off")
    cell(ws, f"B{r}", b)
    c = cell(ws, f"C{r}", dt.datetime(td.year, td.month, td.day), True); c.number_format = "dd.mm.yyyy"
    cell(ws, f"D{r}", tw)
    ev("DS", td, "19:00", "22:00", tw, a, b, "Ders", "sali", f"DS!C{r}")
    if isinstance(hd, str):
        cell(ws, f"E{r}", hd, True)  # text, invalid date
        invalid_rows.append(dict(bootcamp="DS", kaynak=f"DS!E{r}", deger=hd, konu=ht, mentor="Mehmet Demir"))
    else:
        c = cell(ws, f"E{r}", dt.datetime(hd.year, hd.month, hd.day), True); c.number_format = "dd.mm.yyyy"
    if ht == "TATİL":
        ws.merge_cells(f"F{r}:G{r}")
        cell(ws, f"F{r}", "TATİL", True, bg="FCE5CD")
    else:
        cell(ws, f"F{r}", ht)
        cell(ws, f"G{r}", hw)
        if not isinstance(hd, str):
            ev("DS", hd, "19:00", "22:00", hw, a, ht, "Uygulama", "persembe", f"DS!E{r}")
    r += 1

# ---------------------------------------------------------------- GeoBA (format B variant, no mentor, no hours)
ws = wb.create_sheet("GeoBA")
widths(ws, [42, 13, 42, 13])
TEAL = "45818E"
ws.merge_cells("A1:D1")
cell(ws, "A1", "GeoBA - Konumsal İş Analitiği Programı", True, "FFFFFF", TEAL, 13)
for col, v in zip("ABCD", ["Ders", "Çarşamba", "Ders", "Cumartesi"]):
    cell(ws, f"{col}2", v, True, bg="D0E0E3")
geo = [
    ("Konumsal Veriye Giriş", D(2026, 11, 4), "QGIS Kurulum ve Arayüz", D(2026, 11, 7)),
    ("Koordinat Sistemleri ve Projeksiyonlar", D(2026, 11, 11), "Vektör Veri ile Çalışma", D(2026, 11, 14)),
    ("Raster Veri ve Uzaktan Algılama", D(2026, 11, 18), "Mekânsal Sorgular (PostGIS)", D(2026, 11, 21)),
    ("Lokasyon Analitiği: Mağaza Yeri Seçimi", D(2026, 11, 25), "Power BI ile Harita Görselleri", D(2026, 11, 28)),
    ("Final Proje Tanıtımı", D(2026, 12, 2), "Final Proje Sunumları", D(2026, 12, 5)),
]
r = 3
for i, (t1, d1, t2, d2) in enumerate(geo):
    bg = "F3F3F3" if i % 2 else None
    cell(ws, f"A{r}", t1, bg=bg)
    cell(ws, f"B{r}", d1.strftime("%d.%m.%Y"), True, bg=bg)
    cell(ws, f"C{r}", t2, bg=bg)
    cell(ws, f"D{r}", d2.strftime("%d.%m.%Y"), True, bg=bg)
    ev("GeoBA", d1, None, None, "", "", t1, "Ders", "carsamba", f"GeoBA!B{r}")
    ev("GeoBA", d2, None, None, "", "", t2, "Ders", "cumartesi", f"GeoBA!D{r}")
    r += 1

for s in wb.worksheets:
    s.sheet_view.showGridLines = True
wb.save("mentor_map_dummy.xlsx")

# ================================================================ expected output
ids = [e["id"] for e in events]
assert len(ids) == len(set(ids)), "id çakışması"


def tmin(t):
    h, m = map(int, t.split(":"))
    return h * 60 + m


conf = []
by = {}
for e in events:
    if e["mentor"]:
        by.setdefault((e["mentor"], e["tarih"]), []).append(e)
for (m, d), lst in sorted(by.items(), key=lambda x: (x[0][1], x[0][0])):
    for i in range(len(lst)):
        for j in range(i + 1, len(lst)):
            a, b = lst[i], lst[j]
            if a["baslangic"] and b["baslangic"]:
                if not (tmin(a["baslangic"]) < tmin(b["bitis"]) and tmin(b["baslangic"]) < tmin(a["bitis"])):
                    continue
                tip = "KESIN"
            else:
                tip = "OLASI"
            conf.append(dict(mentor=m, tarih=d, tip=tip, oturum_1=a["id"], oturum_2=b["id"]))

codes = [
    ("EGITMEN_YOK", "uyari", "evet", "Eğitmen hücresi boş veya sekmede eğitmen bilgisi yok", "Operasyon görünümünde Atanmamış oturumlar listesine düşer"),
    ("SAAT_YOK", "uyari", "evet", "Sekmede saat bilgisi yok", "Tüm gün gösterilir; çakışmalar OLASI sayılır; .ics'te TRANSP:TRANSPARENT"),
    ("GUN_UYUSMAZLIGI", "uyari", "evet", "Yazılan gün adı tarihle tutmuyor", "Tarih esas alınır, operasyona uyarı gösterilir"),
    ("ISIM_NORMALIZE", "parser_notu", "hayır", "Ham isim temizlendi (boşluk, büyük/küçük harf, kısaltma)", "Gösterilmez"),
    ("COKLU_EGITMEN", "parser_notu", "hayır", "Tek hücrede birden fazla eğitmen vardı, kayıt bölündü", "Gösterilmez"),
    ("EGITMEN_BASLIKTAN", "parser_notu", "hayır", "Eğitmen sekme başlığından alındı", "Gösterilmez"),
    ("EGITMEN_KONU_METNINDEN", "parser_notu", "hayır", "Eğitmen konu metnindeki (Konuk: …) kalıbından alındı", "Gösterilmez"),
    ("YIL_DEVRI", "parser_notu", "hayır", "Yılsız tarihe bir sonraki yıl atandı", "Gösterilmez"),
    ("GECERSIZ_TARIH", "hata", "evet", "Tarih parse edilemedi", "Kayıt alınmaz, errors.json'a yazılır"),
]

traps = [
    ("İK", "Ay kısaltmaları (Eyl/Eki/Kas/Ara/Oca), yıl yok", "Yılı config'teki year_start'tan al; ay geriye düşünce yılı artır (Oca → 2027, YIL_DEVRI notu)."),
    ("İK", "'Ara' hem Aralık kısaltması hem ARA (tatil arası) satırı", "Yapısal kural: A sütunu tam olarak ARA ve satırda tarih hücresi yoksa satır atlanır. Substring veya harf duyarsız eşleşme kullanma; '01 Ara' bir tarihtir."),
    ("İK", "Saatler satırda değil, başlıkta (D2 ve F2)", "Salı 20:30–24:00, Perşembe 20:30–23:00."),
    ("İK", "Bitiş 24:00", "JSON'da 24:00 olarak kalır; ertesi gün 00:00'a çevirme işini .ics üretimi ve çakışma hesabı yapar."),
    ("İK", "Aynı isim farklı yazımlar: 'Ayşe Kaya', 'Ayşe Kaya ' (sonda boşluk), 'ayşe kaya', 'Ayşe K.'", "Trim + boşluk tekilleştirme + alias tablosu; hepsi ISIM_NORMALIZE notu alır."),
    ("İK", "Birleştirilmiş hücreler: TATİL ve Kitap Sunumu (G:H)", "Kitap Sunumu oturumdur ama eğitmeni yok (EGITMEN_YOK); TATİL oturum değildir."),
    ("İK", "Perşembe konusu '-' olan satırlar", "Oturum yok sayılır."),
    ("Fabric", "Saat bilgisi hiç yok", "Dummy config'te default_hours YOK; oturumlar SAAT_YOK alır. Gerçek veride saatler operasyondan gelince config'e eklenir."),
    ("Fabric", "'16 Kasım ' sonda boşluk, '23 kasım' küçük harf", "Tarih parse öncesi trim + küçük harf."),
    ("Fabric", "İki eğitmen tek hücrede: 'Elif Şahin / Emre Çelik'", "' / ' ile böl, her eğitmene ayrı kayıt (COKLU_EGITMEN)."),
    ("Fabric", "Kısaltılmış isim: 'E. Şahin'", "Alias tablosu."),
    ("Quantum", "Eğitmen sütunu yok; eğitmen başlık notunda (A2)", "Config'teki default_mentor (EGITMEN_BASLIKTAN)."),
    ("Quantum", "Konuk eğitmen konu metninde: '(Konuk: Burak Aydın)'", "Regex ile çek, varsayılanı ez, parantezi konudan sil (EGITMEN_KONU_METNINDEN)."),
    ("Quantum", "Kick-Off sadece Perşembe tarafında, Salı boş", "Boş hücreleri oturum sayma."),
    ("BIO", "Tarih İngilizce metin: '12 October 2026'", "İngilizce ay adlarını da destekle."),
    ("BIO", "Bir satırda tarih gerçek Excel tarih hücresi (BIO!A11)", "Hem metin hem datetime tipini kabul et."),
    ("BIO", "Saat formatı değişken: '20:00–22:00', '20.00-22.30', '20:00 - 22:00'", "Ayırıcı ve noktayı normalize et."),
    ("BIO", "28 October 2026 'Perşembe' yazıyor, aslında Çarşamba", "Tarihi esas al, GUN_UYUSMAZLIGI uyarısı."),
    ("DS", "Tarihler gerçek Excel tarih hücresi", "Doğrudan datetime oku."),
    ("DS", "Geçersiz tarih: '31.11.2026' (metin)", "Kaydı alma, Hatalı Kayıtlar'a GECERSIZ_TARIH ile yaz."),
    ("DS", "'Mehmet  Demir' çift boşluk", "Boşlukları tekilleştir (ISIM_NORMALIZE)."),
    ("DS", "Final Sunumları satırında eğitmen boş", "Oturum kalır, EGITMEN_YOK."),
    ("GeoBA", "Çarşamba/Cumartesi, eğitmen ve saat hiç yok", "Gün adlarını başlıktan oku; EGITMEN_YOK + SAAT_YOK; id'de mentor yerine 'atanmamis'."),
    ("GeoBA", "Tarih noktalı metin: '04.11.2026'", "dd.mm.yyyy metin parse."),
    ("Çapraz", "Ayşe Kaya 20 Ekim: İK 20:30–24:00 ve BIO 20:00–22:00", "KESIN çakışma."),
    ("Çapraz", "Can Yıldız 5 Kasım: Fabric (saat yok) ve DS 19:00–22:00", "OLASI çakışma."),
]

HDR = Font(name=F, bold=True, color="FFFFFF")


def sheet(wb_, title, header, rows, wd, first=False):
    s = wb_.active if first else wb_.create_sheet(title)
    s.title = title
    s.append(header)
    for row in rows:
        s.append(row)
    for c in s[1]:
        c.font = HDR; c.fill = fill("434343")
    for row in s.iter_rows(min_row=2):
        for c in row:
            c.font = Font(name=F)
            if isinstance(c.value, dt.date):
                c.number_format = "yyyy-mm-dd"
    widths(s, wd)
    s.freeze_panes = "A2"
    return s


ex = Workbook()
cols = ["id", "bootcamp", "tarih", "gun", "slot", "baslangic", "bitis", "mentor", "oturum_turu",
        "konu", "kaynak", "uyarilar", "parser_notlari"]
ev_sorted = sorted(events, key=lambda x: (x["tarih"], x["baslangic"], x["bootcamp"], x["mentor"]))
s = sheet(ex, "Oturumlar", cols, [[e[c] for c in cols] for e in ev_sorted],
          [40, 10, 12, 11, 12, 10, 8, 16, 13, 46, 13, 30, 40], first=True)
s.auto_filter.ref = s.dimensions
sheet(ex, "Çakışmalar", ["mentor", "tarih", "tip", "oturum_1", "oturum_2"],
      [[c["mentor"], c["tarih"], c["tip"], c["oturum_1"], c["oturum_2"]] for c in conf], [16, 12, 10, 44, 44])
sheet(ex, "Hatalı Kayıtlar", ["bootcamp", "kaynak", "deger", "konu", "mentor", "hata"],
      [[i["bootcamp"], i["kaynak"], i["deger"], i["konu"], i["mentor"], "GECERSIZ_TARIH"] for i in invalid_rows],
      [10, 10, 12, 24, 16, 18])
sheet(ex, "Uyarı Kodları", ["kod", "grup", "teste_girer", "anlam", "app davranışı"], codes, [26, 13, 12, 58, 70])
sheet(ex, "Tür Kuralları", ["öncelik", "anahtar kelimeler (satır etiketi + konu)", "oturum_turu"],
      [[i + 1, ", ".join(k) + " (kelime başında eşleşir)", n] for i, (k, n) in enumerate(TYPE_RULES)]
      + [["varsayılan", "eşleşme yoksa sütunun varsayılanı (Salı/Ders sütunu → Ders, Uygulama sütunu → Uygulama)", "Ders / Uygulama"]],
      [12, 70, 16])
sheet(ex, "Tuzaklar", ["sheet", "tuzak", "beklenen davranış"], traps, [10, 70, 80])
ex.save("mentor_map_beklenen.xlsx")

print("oturum:", len(events))
for c in conf:
    print(c)
