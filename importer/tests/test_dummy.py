"""Dummy Excel'den üretilen çıktı, mentor_map_beklenen.xlsx cevap anahtarıyla birebir karşılaştırılır.

Cevap anahtarı elle düzeltilmez; fixtures/mentor_map_generator.py ile yeniden üretilir.
"""

import collections
import datetime as dt
from pathlib import Path

import openpyxl
import pytest

from mentormap_importer import load_config, parse_workbook

FIX = Path(__file__).parent / "fixtures"


def _sheet(wb, name):
    rows = list(wb[name].iter_rows(values_only=True))
    head = rows[0]
    out = []
    for r in rows[1:]:
        d = dict(zip(head, r))
        for k, v in d.items():
            if isinstance(v, dt.datetime):
                d[k] = v.date()
        out.append(d)
    return out


@pytest.fixture(scope="module")
def expected():
    wb = openpyxl.load_workbook(FIX / "mentor_map_beklenen.xlsx")
    return {name: _sheet(wb, name) for name in ("Oturumlar", "Çakışmalar", "Hatalı Kayıtlar")}


@pytest.fixture(scope="module")
def result():
    return parse_workbook(FIX / "mentor_map_dummy.xlsx", load_config(FIX / "config_dummy.yaml"))


@pytest.fixture(scope="module")
def actual_rows(result):
    return {r["id"]: r for r in result.satirlar()}


def _diff_report(exp_ids, act_ids):
    missing = sorted(exp_ids - act_ids)
    extra = sorted(act_ids - exp_ids)
    return f"eksik ({len(missing)}): {missing}\nfazla ({len(extra)}): {extra}"


# ---------------------------------------------------------------- faz 1


def test_oturum_sayisi(expected, actual_rows):
    exp = collections.Counter(r["bootcamp"] for r in expected["Oturumlar"])
    act = collections.Counter(r["bootcamp"] for r in actual_rows.values())
    assert act == exp
    assert len(actual_rows) == 103


def test_idler_birebir(expected, actual_rows):
    exp_ids = {r["id"] for r in expected["Oturumlar"]}
    assert set(actual_rows) == exp_ids, _diff_report(exp_ids, set(actual_rows))


@pytest.mark.parametrize("alan", ["tarih", "mentor", "baslangic", "bitis"])
def test_temel_alanlar(expected, actual_rows, alan):
    farklar = [(e["id"], e[alan], actual_rows[e["id"]][alan])
               for e in expected["Oturumlar"]
               if e["id"] in actual_rows and e[alan] != actual_rows[e["id"]][alan]]
    assert not farklar, f"{alan} farkları (id, beklenen, gelen): {farklar}"


def test_cakismalar(expected, result):
    exp = {(c["mentor"], c["tarih"], c["tip"], frozenset([c["oturum_1"], c["oturum_2"]]))
           for c in expected["Çakışmalar"]}
    act = {(c.mentor, c.tarih, c.tip, frozenset([c.oturum_1, c.oturum_2])) for c in result.cakismalar}
    assert act == exp


def test_hatali_kayitlar(expected, result):
    exp = {(h["bootcamp"], h["kaynak"], h["deger"], h["konu"], h["mentor"], h["hata"])
           for h in expected["Hatalı Kayıtlar"]}
    act = {(h.bootcamp, h.kaynak, h.deger, h.konu, h.mentor, h.hata) for h in result.hatalar}
    assert act == exp


def test_atlanan_sekme_yok(result):
    assert result.atlanan_sekmeler == []
    assert result.sekme_hatalari == {}


# ---------------------------------------------------------------- faz 2


@pytest.mark.parametrize("alan", ["uyarilar", "oturum_turu", "konu", "gun", "slot", "kaynak"])
def test_faz2_alanlar(expected, actual_rows, alan):
    farklar = [(e["id"], e[alan], actual_rows[e["id"]][alan])
               for e in expected["Oturumlar"]
               if e["id"] in actual_rows and e[alan] != actual_rows[e["id"]][alan]]
    assert not farklar, f"{alan} farkları (id, beklenen, gelen): {farklar}"
