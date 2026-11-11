import datetime as dt
from pathlib import Path

import pytest

from mentormap_importer import load_config, parse_workbook
from mentormap_importer.dates import InvalidDate, YearTracker, parse_date, parse_time_range
from mentormap_importer.session_types import session_type
from mentormap_importer.textutil import normalize_name

FIX = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("raw,expected", [
    ("22 Eyl", dt.date(2026, 9, 22)),
    ("01 Ara", dt.date(2026, 12, 1)),
    ("12 Ekim", dt.date(2026, 10, 12)),
    ("16 Kasım ", dt.date(2026, 11, 16)),
    ("23 kasım", dt.date(2026, 11, 23)),
    ("12 October 2026", dt.date(2026, 10, 12)),
    ("04.11.2026", dt.date(2026, 11, 4)),
    (dt.datetime(2026, 11, 10), dt.date(2026, 11, 10)),
])
def test_parse_date(raw, expected):
    assert parse_date(raw, YearTracker(2026))[0] == expected


def test_yil_devri():
    years = YearTracker(2026)
    assert parse_date("22 Eyl", years) == (dt.date(2026, 9, 22), False)
    assert parse_date("05 Oca", years) == (dt.date(2027, 1, 5), True)


@pytest.mark.parametrize("raw", ["31.11.2026", "32 Ekim", "yarın"])
def test_gecersiz_tarih(raw):
    with pytest.raises(InvalidDate):
        parse_date(raw, YearTracker(2026))


@pytest.mark.parametrize("raw,expected", [
    ("20:00–22:00", ("20:00", "22:00")),
    ("20.00-22.30", ("20:00", "22:30")),
    ("20:00 - 22:00", ("20:00", "22:00")),
    ("TR 20:30 - 24:00", ("20:30", "24:00")),
    ("Ders", None),
])
def test_parse_time_range(raw, expected):
    assert parse_time_range(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("Ayşe Kaya ", "Ayşe Kaya"),
    ("ayşe kaya", "Ayşe Kaya"),
    ("Mehmet  Demir", "Mehmet Demir"),
    ("Ayşe K.", "Ayşe Kaya"),
    ("irem aksoy", "İrem Aksoy"),
])
def test_normalize_name(raw, expected):
    assert normalize_name(raw, {"ayşe k.": "Ayşe Kaya"}) == expected


def test_tur_onceligi():
    assert session_type("Sunum", "Final Projesi", "Uygulama") == "Sunum"
    assert session_type("", "Final Proje Sunumları", "Ders") == "Sunum"
    assert session_type("", "Final Proje Tanıtımı", "Ders") == "Proje"
    assert session_type("Ders", "Spark SQL", "Ders") == "Ders"


def test_default_hours_saatsiz_sekmelere_saat_verir():
    conf = load_config(FIX / "config_dummy.yaml")
    for ad in ("Fabric", "GeoBA", "Quantum"):
        conf["bootcamps"][ad]["default_hours"] = {"start": "20:30", "end": "23:00"}
    r = parse_workbook(FIX / "mentor_map_dummy.xlsx", conf)
    saatsiz = [o for o in r.oturumlar if o.baslangic is None]
    assert saatsiz == []
    fabric = next(o for o in r.oturumlar if o.bootcamp == "Fabric")
    assert (fabric.baslangic, fabric.bitis) == ("20:30", "23:00")
