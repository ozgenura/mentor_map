"""Kurum program şablonu içe aktarıcısı (MM-50..53, Aşama A)."""

import datetime as dt
import json
import uuid

import psycopg
import pytest

from conftest import as_user
from test_senkron import AYSE, GUN, YONETICI, ot, senkron, temel, yonetici_var  # noqa: F401

GMAIL = "ozge.kisisel@gmail.com"


class hata_bekle:
    """Beklenen hatada işlemi savepoint'e geri alır; sonraki sorgular çalışmaya devam eder."""

    def __init__(self, db, tur, match):
        self.db, self.ctx = db, pytest.raises(tur, match=match)

    def __enter__(self):
        self.db.execute("savepoint hb")
        return self.ctx.__enter__()

    def __exit__(self, *a):
        sonuc = self.ctx.__exit__(*a)
        self.db.execute("rollback to savepoint hb")
        return sonuc


def sablon(db, sekmeler, gonderen=YONETICI, **k):
    p = {"betik_surumu": 1, "gonderen": gonderen, "kaynak": "test", "sekmeler": sekmeler} | k
    return db.execute("select sablon_senkron(%s::jsonb)", (json.dumps(p),)).fetchone()[0]


def sekme(oturumlar, donem="İK3", kod="İK", **k):
    return {"sekme": kod, "kod": kod, "donem": donem, "oturumlar": oturumlar} | k


def oturum(oid=None, grup="A", hafta=1, tarih=GUN, egitmenler=("Ayşe Kaya",), **k):
    return {"id": oid or str(uuid.uuid4()), "satir": 9 + hafta, "grup": grup, "hafta": hafta, "modul": "SQL",
            "tarih": tarih, "baslangic": "20:30", "bitis": "23:00", "tur": "Ders", "konu": "SQL",
            "egitmenler": list(egitmenler), "konuklar": []} | k


@pytest.fixture
def kurulu(db):
    senkron(db, temel([]))  # bootcamp İK + kişiler (Map)
    return db


def test_yeni_sekme_iceri_alinir(kurulu):
    db = kurulu
    a = oturum(hafta=1)
    r = sablon(db, [sekme([a])])
    assert r["hata_sayisi"] == 0, r["hatalar"]
    assert r["sekmeler"][0] | {} == {"sekme": "İK", "donem": "İK3", "yeni": 1, "guncellenen": 0, "devralinan": 0, "kalkan": 0, "cakisma": 0}
    row = db.execute("""select o.kaynak::text, d.kod, d.kaynak, o.hafta, o.grup, o.modul, o.sablon_tabani->>'konu'
                        from oturumlar o join donem d on d.id = o.donem_id where o.id = %s""", (a["id"],)).fetchone()
    assert row == ("sablon", "İK3", "sablon", 1, "A", "SQL", "SQL")


def test_onizleme_yazmaz(kurulu):
    db = kurulu
    a = oturum()
    r = sablon(db, [sekme([a])], onizleme=True)
    assert r["onizleme"] is True and r["sekmeler"][0]["yeni"] == 1
    assert db.execute("select count(*) from oturumlar where id = %s", (a["id"],)).fetchone()[0] == 0
    assert db.execute("select kod from donem").fetchone()[0] == "İK"  # dönem de adlandırılmadı


def test_map_oturumu_devralinir_iptal_ve_link_korunur(kurulu):
    db = kurulu
    m = str(uuid.uuid4())
    senkron(db, temel([ot(2, m)]))  # Map'ten gelen oturum, aynı tarih 20:30
    db.execute("update oturumlar set toplanti_linki = 'https://ozel', durum = 'iptal', iptal_gerekcesi = 'hasta' where id = %s", (m,))
    a = oturum()
    r = sablon(db, [sekme([a])])
    assert r["sekmeler"][0]["devralinan"] == 1 and r["sekmeler"][0]["yeni"] == 0
    assert r["kimlik_degisimleri"] == [{"eski": a["id"], "yeni": m}]
    row = db.execute("select kaynak::text, toplanti_linki, durum::text from oturumlar where id = %s", (m,)).fetchone()
    assert row == ("sablon", "https://ozel", "iptal")
    # betik kimliği yazdıktan sonra ikinci gönderim aynı oturumu günceller
    r = sablon(db, [sekme([a | {"id": m, "konu": "Yeni"}])])
    assert r["sekmeler"][0]["guncellenen"] == 1
    # Map senkronu artık bu oturuma ve döneme dokunmaz
    r = senkron(db, temel([ot(2, m, konu="Map ezmeye çalışıyor"), ot(3, str(uuid.uuid4()))]))
    assert db.execute("select konu from oturumlar where id = %s", (m,)).fetchone()[0] == "Yeni"
    assert any("şablonundan yönetiliyor" in h["mesaj"] for h in r["hatalar"]), r["hatalar"]


def test_devralinamayan_map_oturumu_kalkar(kurulu):
    db = kurulu
    m = str(uuid.uuid4())
    senkron(db, temel([ot(2, m, baslangic="18:00", bitis="19:00")]))
    r = sablon(db, [sekme([oturum()])])
    assert r["sekmeler"][0]["kalkan"] == 1
    assert db.execute("select excelden_kalkti from oturumlar where id = %s", (m,)).fetchone()[0] is True


def test_eslesmeyen_ad_konuk_olur(kurulu):
    db = kurulu
    a = oturum(egitmenler=("Ayşe Kaya", "Misafir Hoca"))
    r = sablon(db, [sekme([a])])
    assert r["eslesmeyen_adlar"] == ["Misafir Hoca"]
    rows = sorted(db.execute("""select coalesce(k.ad, a.konuk_ad), a.rol::text from oturum_anlaticilari a
                                left join kisiler k on k.id = a.kisi_id where a.oturum_id = %s""", (a["id"],)).fetchall())
    assert rows == [("Ayşe Kaya", "ana"), ("Misafir Hoca", "konuk")]
    assert db.execute("select count(*) from kisiler where ad = 'Misafir Hoca'").fetchone()[0] == 0


def test_yetki_po_kendi_bootcampi(kurulu):
    db = kurulu
    db.execute("insert into bootcamp (ad, kisa_kod) values ('Data Science', 'DS')")
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'""")
    r = sablon(db, [sekme([oturum()]), sekme([oturum()], kod="DS", donem="DS5")], gonderen=AYSE)
    assert [x["sekme"] for x in r["sekmeler"]] == ["İK"]
    assert any("yetkiniz yok" in h["mesaj"] for h in r["hatalar"])


def test_taninmayan_gonderen_reddedilir_ek_eposta_taninir(kurulu):
    db = kurulu
    with hata_bekle(db, psycopg.errors.RaiseException, "GONDEREN_TANINMADI"):
        sablon(db, [sekme([oturum()])], gonderen=GMAIL)
    db.execute("update kisiler set ek_epostalar = array[%s] where eposta = %s", (GMAIL, YONETICI))
    assert sablon(db, [sekme([oturum()])], gonderen=GMAIL)["hata_sayisi"] == 0


def test_donem_zorunlu_ve_bicimli(kurulu):
    db = kurulu
    r = sablon(db, [sekme([oturum()], donem="")])
    assert "Dönem boş" in r["hatalar"][0]["mesaj"]
    r = sablon(db, [sekme([oturum()], donem="DA11")])
    assert "Kod + numara" in r["hatalar"][0]["mesaj"]


def test_toplu_kayma_onay_ister(kurulu):
    db = kurulu
    ilk = [oturum(hafta=i, tarih=(dt.date.today() + dt.timedelta(days=7 * i)).isoformat()) for i in range(1, 5)]
    sablon(db, [sekme(ilk)])
    kaymis = [x | {"tarih": (dt.date.fromisoformat(x["tarih"]) + dt.timedelta(days=90)).isoformat()} for x in ilk]
    with hata_bekle(db, psycopg.errors.RaiseException, "ONAY_GEREKLI"):
        sablon(db, [sekme(kaymis)])
    assert sablon(db, [sekme(kaymis)], onay=True)["sekmeler"][0]["guncellenen"] == 4


def test_tamamlanmis_donem_reddedilir(kurulu):
    db = kurulu
    eski = (dt.date.today() - dt.timedelta(days=30)).isoformat()
    a = oturum(tarih=eski)
    sablon(db, [sekme([a], donem="İK2")])
    r = sablon(db, [sekme([a | {"konu": "Değişti"}], donem="İK2")])
    assert "tamamlandı" in r["hatalar"][0]["mesaj"]


def test_satir_silinince_kalkar(kurulu):
    db = kurulu
    a, b = oturum(hafta=1), oturum(hafta=2)
    sablon(db, [sekme([a, b])])
    r = sablon(db, [sekme([a])])
    assert r["sekmeler"][0]["kalkan"] == 1


def test_istemci_cagiramaz(kurulu):
    db = kurulu
    with as_user(db, YONETICI):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select sablon_senkron('{}'::jsonb)")
    with as_user(db, YONETICI):
        assert len(db.execute("select sablon_anahtari_olustur()").fetchone()[0]) == 64


def test_korumalar_po_epostalari(kurulu):
    db = kurulu
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'""")
    k = db.execute("select sablon_korumalari()").fetchone()[0]
    assert k["bootcamplar"]["İK"] == [AYSE] and YONETICI in k["yoneticiler"]


def test_durum_ve_ek_oturumlar_doner(kurulu):
    db = kurulu
    a, b = oturum(hafta=1), oturum(hafta=2)
    sablon(db, [sekme([a, b])])
    db.execute("update oturumlar set durum = 'iptal', iptal_gerekcesi = 'hasta', toplanti_linki = 'https://zoom.us/j/9' where id = %s", (a["id"],))
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'""")
    with as_user(db, AYSE):
        db.execute("""select yan_seans_ekle((select id from bootcamp where kisa_kod = 'İK'), %s, '19:00', '20:00', 'Office hours',
                      jsonb_build_array(jsonb_build_object('kisi_id', (select id from kisiler where ad = 'Ayşe Kaya'))), 'Office Hours')""", (GUN,))
    r = sablon(db, [sekme([a, b])], onizleme=True)  # "Durumu yenile"
    assert r["durumlar"] == [{"id": a["id"], "grup": "A", "iptal": True, "gerekce": "hasta",
                              "link": "https://zoom.us/j/9", "materyal": None}]
    [ek] = r["ek_oturumlar"]
    assert ek["sekme"] == "İK" and [(x["konu"], x["saat"], x["anlaticilar"]) for x in ek["oturumlar"]] == [("Office hours", "19:00–20:00", "Ayşe Kaya")]


def test_donem_linkleri_sablondan(kurulu):
    """Zoom ve materyal linki dönem başına şablondan (B5, B6); oturuma özel link öncelikli; yeni dönem ayrı link."""
    db = kurulu
    a, b = oturum(hafta=1), oturum(hafta=2)
    sablon(db, [sekme([a, b], zoom="https://zoom.us/j/3", materyal="https://drive.google.com/ik3")])
    db.execute("update oturumlar set materyal_linki = 'https://ozel.example/x' where id = %s", (b["id"],))
    g = lambda oid: db.execute("select toplanti_linki, materyal_linki, oturum_materyal_linki, varsayilan_materyal_linki "
                               "from oturum_gorunumu where id = %s", (oid,)).fetchone()
    assert g(a["id"]) == ("https://zoom.us/j/3", "https://drive.google.com/ik3", None, "https://drive.google.com/ik3")
    assert g(b["id"])[1:3] == ("https://ozel.example/x", "https://ozel.example/x")

    # hatalı link kaydedilmez, öbürü yazılır; anahtar yoksa (eski betik) dokunulmaz
    r = sablon(db, [sekme([a, b], zoom="javascript:alert(1)", materyal="")])
    assert [h["satir"] for h in r["hatalar"]] == [5]
    assert g(a["id"])[:2] == ("https://zoom.us/j/3", None)
    sablon(db, [sekme([a, b])])
    assert g(a["id"])[0] == "https://zoom.us/j/3"

    # yeni dönem: kendi linki; eski dönemin oturumları eski linkte kalır
    c = oturum(hafta=1, tarih="2027-03-01")
    sablon(db, [sekme([c], donem="İK4", zoom="https://zoom.us/j/4")])
    assert g(c["id"])[0] == "https://zoom.us/j/4"
    assert g(a["id"])[0] == "https://zoom.us/j/3"


def test_hafta_sonu_tarih_bazli_sekme(kurulu):
    """Hafta sonu eğitimleri Genel gibi tarih bazlı sekmeden gelir: dönem gerekmez, tür satırdan."""
    db = kurulu
    db.execute("insert into bootcamp (kisa_kod, ad, egitim_turu) values ('HS', 'Hafta Sonu Eğitimleri', 'Hafta Sonu Eğitimleri')")
    g1 = oturum(grup="E", tarih="2026-12-05", konu="Power BI için Etkin SQL Kullanımı", tur="Ders", baslangic="10:00", bitis="17:00")
    g2 = oturum(grup="E", tarih="2026-12-06", konu="Power BI için Etkin SQL Kullanımı", tur="Ders", baslangic="10:00", bitis="17:00")
    r = sablon(db, [{"sekme": "Hafta Sonu", "kod": "HS", "genel": True, "oturumlar": [g1, g2]}])
    assert r["hata_sayisi"] == 0, r["hatalar"]
    rows = db.execute("select tarih::text, tur::text, egitim_turu from oturum_gorunumu where kisa_kod = 'HS' order by tarih").fetchall()
    assert rows == [("2026-12-05", "Ders", "Hafta Sonu Eğitimleri"), ("2026-12-06", "Ders", "Hafta Sonu Eğitimleri")]


def test_genel_her_poya_acik(kurulu):
    """Genel'i herhangi bir bootcamp'in PO'su gönderebilir; korumada Genel'in düzenleyicileri tüm PO'lar."""
    db = kurulu
    db.execute("insert into bootcamp (kisa_kod, ad) values ('Genel', 'Genel etkinlikler') on conflict do nothing")
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'""")
    e = oturum(grup="E", tarih="2026-12-10", konu="Kariyer günü", tur="Etkinlik")
    r = sablon(db, [{"sekme": "Genel", "kod": "Genel", "genel": True, "oturumlar": [e]}], gonderen=AYSE)
    assert r["hata_sayisi"] == 0, r["hatalar"]
    k = db.execute("select sablon_korumalari()").fetchone()[0]
    assert AYSE in k["bootcamplar"]["Genel"] and AYSE in k["bootcamplar"]["İK"]
    # PO olmayan eğitmen Genel'i gönderemez
    r = sablon(db, [{"sekme": "Genel", "kod": "Genel", "genel": True, "oturumlar": [e]}], gonderen="can@ornek.com")
    assert r["hata_sayisi"] == 1 and "yetki" in r["hatalar"][0]["mesaj"]


def test_tarih_sekmesinde_aciklama_degisimi(kurulu):
    db = kurulu
    db.execute("insert into bootcamp (kisa_kod, ad) values ('HS', 'Hafta Sonu Eğitimleri')")
    g = oturum(grup="E", tarih="2026-12-05", tur="Ders", aciklama="1. gün")
    sablon(db, [{"sekme": "Hafta Sonu", "kod": "HS", "genel": True, "oturumlar": [g]}])
    r = sablon(db, [{"sekme": "Hafta Sonu", "kod": "HS", "genel": True, "oturumlar": [g | {"aciklama": "1. gün / 2 · Cumartesi"}]}])
    assert r["sekmeler"][0]["guncellenen"] == 1
    assert db.execute("select aciklama from oturumlar where id = %s", (g["id"],)).fetchone()[0] == "1. gün / 2 · Cumartesi"
