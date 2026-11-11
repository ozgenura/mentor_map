"""İçe aktarım senkronu: önizleme, uygulama, tekrar çalıştırma, iptalin korunması, kalkan oturum.

Yerel PostgreSQL gerekir (supabase/tests/conftest.py ile aynı kurulum). Yoksa testler atlanır.
"""

import copy
import sys
from pathlib import Path

import psycopg
import pytest

ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(ROOT / "supabase" / "tests"))
import conftest as dbsetup  # noqa: E402

from mentormap_importer import load_config, parse_workbook  # noqa: E402
from mentormap_importer.sync import ESLESMEDI, plan_olustur, uygula  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
EGITMENLER = ["Ayşe Kaya", "Can Yıldız", "Mehmet Demir", "Elif Şahin", "Zeynep Arslan", "Burak Aydın",
              "İrem Aksoy", "Selin Öztürk", "Deniz Koç", "Emre Çelik"]  # Kaan Polat bilerek yok


@pytest.fixture(scope="module")
def db_url():
    try:
        return dbsetup.kur_test_db()
    except psycopg.OperationalError:
        pytest.skip("yerel PostgreSQL yok")


@pytest.fixture
def conn(db_url):
    with psycopg.connect(db_url) as c:
        for i, ad in enumerate(EGITMENLER):
            c.execute("insert into kisiler (ad, eposta) values (%s, %s)", (ad, f"e{i}@ornek.com"))
        yield c
        c.rollback()


@pytest.fixture(scope="module")
def result():
    return parse_workbook(FIX / "mentor_map_dummy.xlsx", load_config(FIX / "config_dummy.yaml"))


def _say(conn, sql, *a):
    return conn.execute(sql, a).fetchone()[0]


def test_bos_veritabaninda_onizleme_hicbir_sey_yazmaz(conn, result):
    plan = plan_olustur(conn, result)
    assert len(plan.yeni) == 101          # 103 satır; iki oturumda iki eğitmen var
    assert plan.guncellenen == plan.kalkan == []
    assert sorted(plan.yeni_bootcamplar) == ["BIO", "DS", "Fabric", "GeoBA", "Quantum", "İK"]
    assert set(plan.eslesmeyen_egitmenler) == {"Kaan Polat"}
    assert _say(conn, "select count(*) from oturumlar") == 0


def test_uygula_sonra_tekrar_calistir_fark_yok(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    assert _say(conn, "select count(*) from oturumlar") == 101
    assert _say(conn, "select count(*) from oturum_anlaticilari") == 103 - 13 - 20  # eğitmensiz 13, Kaan 20
    assert _say(conn, "select count(*) from oturumlar where %s = any(uyarilar)", ESLESMEDI) == 20
    # 24:00 ertesi gün 00:00 olarak saklanır
    assert _say(conn, """select bitis = '2026-10-21 00:00+03' from oturumlar
                         where dis_anahtar = 'ik-2026-10-20-sali'""") is True
    plan2 = plan_olustur(conn, result)
    assert not plan2.fark_var and plan2.ayni == 101


def test_iptal_yeniden_ice_aktarimda_korunur(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    conn.execute("""update oturumlar set durum = 'iptal', iptal_gerekcesi = 'hasta'
                    where dis_anahtar = 'ds-2026-11-10-sali'""")
    plan = plan_olustur(conn, result)
    assert not plan.fark_var
    uygula(conn, result, plan, "dummy.xlsx")
    assert _say(conn, "select durum::text from oturumlar where dis_anahtar = 'ds-2026-11-10-sali'") == "iptal"


def test_egitmen_degisince_oturum_guncellenir_ve_bildirim_gider(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    degisik = copy.deepcopy(result)
    o = next(x for x in degisik.oturumlar if x.dis_anahtar == "ik-2027-01-05-sali")
    o.anlaticilar[0].ad = "Can Yıldız"
    o.baslangic = "21:00"
    plan = plan_olustur(conn, degisik)
    assert len(plan.guncellenen) == 1
    alanlar = plan.guncellenen[0][1].alanlar
    assert set(alanlar) == {"anlaticilar", "baslangic"}
    uygula(conn, degisik, plan, "dummy.xlsx")
    ad = _say(conn, """select k.ad from oturum_anlaticilari a join kisiler k on k.id = a.kisi_id
                       join oturumlar o on o.id = a.oturum_id where o.dis_anahtar = 'ik-2027-01-05-sali'""")
    assert ad == "Can Yıldız"
    olaylar = {r[0] for r in conn.execute("select olay from bildirim_kuyrugu").fetchall()}
    assert olaylar == {"atandin", "atamadan_cikarildin", "zaman_degisti"}
    islem = _say(conn, """select islem from degisiklik_kaydi d join oturumlar o on o.id = d.oturum_id
                          where o.dis_anahtar = 'ik-2027-01-05-sali' order by d.id desc""")
    assert islem == "ice_aktarim_guncelleme"


def test_excelden_kalkan_silinmez_isaretlenir(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    eksik = copy.deepcopy(result)
    eksik.oturumlar = [o for o in eksik.oturumlar if o.dis_anahtar != "geoba-2026-12-05-cumartesi"]
    plan = plan_olustur(conn, eksik)
    assert [k["dis_anahtar"] for k in plan.kalkan] == ["geoba-2026-12-05-cumartesi"]
    uygula(conn, eksik, plan, "dummy.xlsx")
    assert _say(conn, "select excelden_kalkti from oturumlar where dis_anahtar = 'geoba-2026-12-05-cumartesi'")
    # geri gelirse işaret kalkar
    plan3 = plan_olustur(conn, result)
    assert plan3.geri_gelen == ["geoba-2026-12-05-cumartesi"]
    uygula(conn, result, plan3, "dummy.xlsx")
    assert not _say(conn, "select excelden_kalkti from oturumlar where dis_anahtar = 'geoba-2026-12-05-cumartesi'")


def test_okunamayan_sekmenin_oturumlari_kalkmis_sayilmaz(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    eksik = copy.deepcopy(result)
    eksik.oturumlar = [o for o in eksik.oturumlar if o.bootcamp != "BIO"]
    assert plan_olustur(conn, eksik).kalkan == []


def test_buyuk_sapma_raporlanir(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    az = copy.deepcopy(result)
    ik = [o for o in az.oturumlar if o.bootcamp == "İK"]
    az.oturumlar = [o for o in az.oturumlar if o.bootcamp != "İK"] + ik[:10]
    assert plan_olustur(conn, az).sapmalar == {"İK": (26, 10)}


def test_ice_aktarim_kaydi_yazilir(conn, result):
    uygula(conn, result, plan_olustur(conn, result), "dummy.xlsx")
    ozet = _say(conn, "select ozet from ice_aktarimlar order by id desc")
    assert ozet["yeni"] == 101 and ozet["hatali_kayit"] == 1
