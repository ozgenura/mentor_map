"""Dönem modeli (K-9): program (bootcamp) ve dönem; güncel dönem, arşiv, 14 gün kuralı."""

import datetime as dt
import uuid

import psycopg
import pytest

from conftest import as_user
from test_senkron import AYSE, GUN, YONETICI, ot, senkron, temel, yonetici_var  # noqa: F401


def donemli(oturumlar, donem=None, **k):
    p = temel(oturumlar, **k)
    if donem is not None:
        p["bootcamplar"][0]["donem"] = donem
    return p


def donem_kodu(db, oid):
    return db.execute("select d.kod from oturumlar o join donem d on d.id = o.donem_id where o.id = %s", (oid,)).fetchone()[0]


def test_yeni_bootcamp_gecici_donemle_gelir_ve_ilk_numarayla_adlanir(db):
    a = str(uuid.uuid4())
    senkron(db, donemli([ot(2, a)]))
    assert donem_kodu(db, a) == "İK"  # geçici dönem: adı kodun kendisi
    r = senkron(db, donemli([ot(2, a)], donem="İK3"))
    assert r["hata_sayisi"] == 0, r["hatalar"]
    assert donem_kodu(db, a) == "İK3"
    assert db.execute("select count(*) from donem").fetchone()[0] == 1


def test_numara_artinca_yeni_donem_eski_arsivde(db):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    senkron(db, donemli([ot(2, a)], donem="İK3"))
    # yeni dönem: eski satır silindi, yeni satır eklendi
    r = senkron(db, donemli([ot(3, b)], donem="İK4"))
    assert r["hata_sayisi"] == 0 and r["kalkan"] == 0  # eski dönem "kalktı" sayılmaz
    assert (donem_kodu(db, a), donem_kodu(db, b)) == ("İK3", "İK4")
    assert db.execute("select excelden_kalkti from oturumlar where id = %s", (a,)).fetchone()[0] is False
    guncel = db.execute("select kod from donem_gorunumu where guncel").fetchall()
    assert guncel == [("İK4",)]


def test_gecersiz_donem_kodu_reddedilir(db):
    r = senkron(db, donemli([], donem="DA11"))
    assert any("Kod + numara" in h["mesaj"] for h in r["hatalar"])
    r = senkron(db, donemli([], donem="İK 3"))
    assert any("Kod + numara" in h["mesaj"] for h in r["hatalar"])


def test_tamamlanmis_donem_degistirilemez_ve_kalkmaz(db):
    eski = (dt.date.today() - dt.timedelta(days=20)).isoformat()
    a = str(uuid.uuid4())
    senkron(db, donemli([ot(2, a, tarih=eski)], donem="İK3"))
    assert db.execute("select durum from donem_gorunumu where kod = 'İK3'").fetchone()[0] == "tamamlandi"
    r = senkron(db, donemli([ot(2, a, tarih=eski, konu="Değişti")], donem="İK3"))
    assert any("tamamlandı" in h["mesaj"] for h in r["hatalar"])
    assert db.execute("select konu from oturumlar where id = %s", (a,)).fetchone()[0] == "SQL"
    # satır silinse de kalktı sayılmaz
    r = senkron(db, donemli([], donem="İK3"))
    assert r["kalkan"] == 0


def test_14_gun_kurali(db):
    a = str(uuid.uuid4())
    sinir = (dt.date.today() - dt.timedelta(days=14)).isoformat()
    senkron(db, donemli([ot(2, a, tarih=sinir)], donem="İK3"))
    assert db.execute("select durum from donem_gorunumu where kod = 'İK3'").fetchone()[0] == "aktif"


def test_yan_seans_guncel_doneme_baglanir(db):
    senkron(db, donemli([ot(2, str(uuid.uuid4()))], donem="İK3"))
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'""")
    with as_user(db, AYSE):
        oid = db.execute("""select yan_seans_ekle((select id from bootcamp where kisa_kod = 'İK'), %s, '20:00', '21:00',
                            'Ek', jsonb_build_array(jsonb_build_object('kisi_id', (select id from kisiler where ad = 'Ayşe Kaya'))))""",
                         (GUN,)).fetchone()[0]
    assert donem_kodu(db, oid) == "İK3"


def test_donem_gorunur_yazilamaz(db):
    senkron(db, donemli([], donem="İK3"))
    with as_user(db, AYSE):
        assert db.execute("select count(*) from donem_gorunumu").fetchone()[0] == 1
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("update donem set kod = 'İK9'")
    assert db.execute("select kod from donem").fetchone()[0] == "İK3"
