"""Geri bildirim: gönderme, görünürlük, yönetici durumu."""

import psycopg
import pytest

from conftest import as_user
from test_yetkiler import AYSE, CAN, YABANCI, YONETICI, seed  # noqa: F401


def test_egitmen_gonderir_yalnizca_kendininkini_gorur(db, seed):
    with as_user(db, AYSE):
        db.execute("select geri_bildirim_gonder('oneri', 'Haftalık görünümde renkler', 'takvim')")
    with as_user(db, CAN):
        db.execute("select geri_bildirim_gonder('sorun', 'Bildirim gelmedi')")
        assert db.execute("select count(*) from geri_bildirimler").fetchone()[0] == 1
    with as_user(db, YONETICI):
        assert db.execute("select count(*) from geri_bildirimler").fetchone()[0] == 2


def test_tabloya_dogrudan_yazilamaz(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("insert into geri_bildirimler (tur, metin) values ('oneri', 'x')")


def test_kayitsiz_gonderemez(db, seed):
    with as_user(db, YABANCI):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select geri_bildirim_gonder('oneri', 'x')")


def test_bos_ve_gecersiz_tur_reddedilir(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute("select geri_bildirim_gonder('oneri', '   ')")
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute("select geri_bildirim_gonder('baska', 'x')")


def test_durumu_yalnizca_yonetici_degistirir(db, seed):
    with as_user(db, AYSE):
        gid = db.execute("select geri_bildirim_gonder('oneri', 'x')").fetchone()[0]
    with as_user(db, CAN):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select geri_bildirim_durum(%s, 'yapildi')", (gid,))
    with as_user(db, YONETICI):
        db.execute("select geri_bildirim_durum(%s, 'yapildi')", (gid,))
    assert db.execute("select durum from geri_bildirimler where id = %s", (gid,)).fetchone()[0] == "yapildi"


def test_saatte_20_sinir(db, seed):
    with as_user(db, AYSE):
        for i in range(20):
            db.execute("select geri_bildirim_gonder('diger', %s)", (f"not {i}",))
        with pytest.raises(psycopg.errors.RaiseException):
            db.execute("select geri_bildirim_gonder('diger', 'bir tane daha')")
