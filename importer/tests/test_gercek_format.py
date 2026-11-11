"""Gerçek Excel'in yapıları (uydurma adlarla): Excel'e dokunmadan okunabildiğinin güvencesi.

Fixture: fixtures/gercek_format_uret.py ile üretilir; config: fixtures/config_gercek_format.yaml
(gerçek config.yaml'ın sekme tanımlarının kopyası).
"""

import collections
from pathlib import Path

import pytest

from mentormap_importer import load_config, parse_workbook

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def r():
    return parse_workbook(FIX / "gercek_format.xlsx", load_config(FIX / "config_gercek_format.yaml"))


@pytest.fixture(scope="module")
def by_key(r):
    return {o.dis_anahtar: o for o in r.oturumlar}


def adlar(o):
    return [a.ad for a in o.anlaticilar]


def test_sekme_sayilari(r):
    assert collections.Counter(o.bootcamp for o in r.oturumlar) == {"Vibe": 5, "SQL": 6, "DS": 4, "DA": 5, "Fabric": 2}
    assert r.bos_sekmeler == ["Bos"]
    assert r.sekme_hatalari == {} and r.atlanan_sekmeler == [] and r.hatalar == []


def test_vibe_baslik_saati_ortak_egitmen_ve_yer_tutucu(by_key):
    o = by_key["vibe-2026-09-28-pazartesi"]
    assert (o.baslangic, o.bitis) == ("20:30", "23:00")              # başlıktan başlangıç, config'ten bitiş
    assert adlar(o) == ["Ali Veli", "Ayşe Tan"]                       # "Ali Veli-Ayşe Tan", ortak F sütunu
    assert adlar(by_key["vibe-2026-10-01-persembe"]) == ["Ali Veli", "Ayşe Tan"]
    kick = by_key["vibe-2026-09-15-pazartesi"]
    assert kick.tur == "Kick-Off" and adlar(kick) == []               # "Tüm Ekip" kişi değil
    assert "GUN_UYUSMAZLIGI" in kick.uyarilar                         # salı tarihi pazartesi sütununda


def test_vibe_tatil_ara_ve_tire_atlanir(by_key):
    assert "vibe-2026-10-29-persembe" not in by_key                   # küçük harf "Tatil"
    assert "vibe-2026-10-19-pazartesi" not in by_key                  # konu "-"
    assert adlar(by_key["vibe-2026-10-26-pazartesi"]) == []           # eğitmen "-"


def test_sql_ortak_konu_ve_kayma(by_key):
    assert by_key["sql-2026-11-05-persembe"].konu == "Foundations"    # perşembe de A'daki konuyu alır
    assert "GUN_UYUSMAZLIGI" in by_key["sql-2026-11-12-sali"].uyarilar
    assert "GUN_UYUSMAZLIGI" in by_key["sql-2026-11-17-persembe"].uyarilar
    assert "GUN_UYUSMAZLIGI" not in by_key["sql-2026-11-03-sali"].uyarilar


def test_ds_liste_ara_ve_isim_birlestirme(r, by_key):
    assert "ds-2026-10-21-carsamba" not in by_key                     # tarihli ARA satırı
    assert adlar(by_key["ds-2026-10-28-carsamba"]) == ["Ali Veli", "Deniz Su"]   # "Ali" tamamlandı
    assert "TATIL_GUNU" in by_key["ds-2026-10-28-carsamba"].uyarilar
    assert adlar(by_key["ds-2026-10-14-carsamba"]) == ["Mert Akdağ"]
    assert r.isim_eslemeleri == {"Ali": "Ali Veli", "Mert Akdag": "Mert Akdağ"}


def test_da_haftalik_coklu_oturum(by_key, r):
    assert by_key["da-2026-08-05-ana"].tur == "Ders"
    assert "da-2026-08-03-pazartesi" not in by_key                    # tarihli not oturum değil
    mg = by_key["da-2026-08-10-pazartesi"]
    assert mg.tur == "Mentor Görüşmesi" and adlar(mg) == []           # "Mentor" yer tutucusu
    g = by_key["da-2026-08-11-sali"]
    assert g.tur == "Uygulama" and g.konu == "Güçlendirme: CRM" and "EGITMEN_BELIRSIZ" in g.uyarilar
    assert by_key["da-2026-08-19-ana"].tur == "Sunum"


def test_serbest_notlar_raporlanir(r):
    assert ("DA", "DA!F4", "10 Ağustos: İlk Tanışma") in r.notlar
    assert ("Fabric", "Fabric!E3", "13 Kasım ek ders") in r.notlar
