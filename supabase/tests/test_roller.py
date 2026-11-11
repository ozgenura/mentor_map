"""Roller: asistan, dış eğitmen, bootcamp PO'su ve asistanı."""

import uuid

import psycopg
import pytest

from conftest import as_user
from test_senkron import AYSE, YONETICI, ot, senkron, temel

PO = "po@ornek.com"
ASISTAN = "asistan@ornek.com"
DIS = "dis@ornek.com"


def kisiler_ek():
    return [
        {"satir": 2, "ad": "Özge", "eposta": YONETICI, "rol": "Yönetici", "aktif": True, "ana_egitmen": ""},
        {"satir": 3, "ad": "Ayşe Kaya", "eposta": AYSE, "rol": "Eğitmen", "aktif": True, "ana_egitmen": "İK", "kurum": "İç"},
        {"satir": 4, "ad": "Pelin Ova", "eposta": PO, "rol": "Eğitmen", "aktif": True, "ana_egitmen": "", "kurum": "İç"},
        {"satir": 5, "ad": "Asu Sel", "eposta": ASISTAN, "rol": "Asistan", "aktif": True, "ana_egitmen": "", "kurum": "İç"},
        {"satir": 6, "ad": "Dora Dış", "eposta": DIS, "rol": "Eğitmen", "aktif": True, "ana_egitmen": "", "kurum": "Dış"},
    ]


def kur(db, po="Pelin Ova", asistan="Asu Sel", oturumlar=None):
    p = temel(oturumlar or [ot(2, str(uuid.uuid4()))], kisiler=kisiler_ek())
    p["bootcamplar"][0] |= {"po": po, "asistan": asistan}
    return senkron(db, p)


def yetkiler(db):
    return sorted(db.execute("""select k.ad, y.yetki from bootcamp_yetkilileri y join kisiler k on k.id = y.kisi_id""").fetchall())


def test_rol_kurum_ve_yetkiler_senkronlanir(db):
    r = kur(db)
    assert r["hata_sayisi"] == 0
    roller = dict(db.execute("select ad, rol::text from kisiler").fetchall())
    assert roller["Asu Sel"] == "asistan" and roller["Pelin Ova"] == "egitmen"
    dis = dict(db.execute("select ad, dis_egitmen from kisiler").fetchall())
    assert dis["Dora Dış"] is True and dis["Ayşe Kaya"] is False
    assert yetkiler(db) == [("Asu Sel", "asistan"), ("Ayşe Kaya", "ana_egitmen"), ("Pelin Ova", "po")]


def test_po_degisince_eski_po_cikar_ana_egitmene_dokunulmaz(db):
    kur(db)
    kur(db, po="Dora Dış", asistan="")
    assert yetkiler(db) == [("Ayşe Kaya", "ana_egitmen"), ("Dora Dış", "po")]


def test_sutun_gonderilmezse_po_korunur(db):
    kur(db)
    senkron(db, temel([ot(2, str(uuid.uuid4()))], kisiler=kisiler_ek()))  # po/asistan anahtarı yok
    assert ("Pelin Ova", "po") in yetkiler(db)


def test_bilinmeyen_po_hata_verir(db):
    r = kur(db, po="Kimse Yok")
    assert r["hata_sayisi"] == 1 and "PO" in r["hatalar"][0]["mesaj"]


def test_po_iptal_eder_asistan_edemez(db):
    oid = str(uuid.uuid4())
    kur(db, oturumlar=[ot(2, oid)])
    with as_user(db, ASISTAN):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select oturum_iptal(%s, 'hasta')", (oid,))
    with as_user(db, PO):
        db.execute("select oturum_iptal(%s, 'hasta')", (oid,))
    assert db.execute("select durum from oturumlar where id = %s", (oid,)).fetchone()[0] == "iptal"


def test_asistan_ve_po_iptal_bildirimi_alir(db):
    oid = str(uuid.uuid4())
    kur(db, oturumlar=[ot(2, oid)])
    db.execute("delete from bildirim_kuyrugu")
    with as_user(db, YONETICI):
        db.execute("select oturum_iptal(%s, 'hasta')", (oid,))
    alanlar = {x[0] for x in db.execute("""select k.ad from bildirim_kuyrugu b join kisiler k on k.id = b.kisi_id
                                            where b.olay = 'iptal'""").fetchall()}
    assert {"Asu Sel", "Pelin Ova", "Ayşe Kaya"} <= alanlar


def test_asistan_sayfadan_cikinca_pasife_alinir(db):
    kur(db)
    k = [x for x in kisiler_ek() if x["ad"] != "Asu Sel"]
    p = temel([ot(2, str(uuid.uuid4()))], kisiler=k)
    senkron(db, p)
    assert db.execute("select aktif from kisiler where ad = 'Asu Sel'").fetchone()[0] is False


def test_dis_mi_turkce_yazimlar(db):
    vals = db.execute("select _dis_mi('Dış'), _dis_mi('DIŞ'), _dis_mi('dis'), _dis_mi('İç'), _dis_mi(null)").fetchone()
    assert vals == (True, True, True, False, False)
