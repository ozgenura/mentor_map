"""Faz 0: Sheets senkronunun güvenlik kuralları (MM-10, MM-16)."""

import json

from conftest import as_user
from test_senkron import AYSE, YONETICI, senkron, temel, yonetici_var  # noqa: F401


def kisiler(**degis):
    k = [
        {"satir": 2, "ad": "Özge", "eposta": YONETICI, "rol": "Yönetici", "aktif": True, "ana_egitmen": ""},
        {"satir": 3, "ad": "Ayşe Kaya", "eposta": AYSE, "rol": "Eğitmen", "aktif": True, "ana_egitmen": "İK"},
        {"satir": 4, "ad": "Can Yıldız", "eposta": "can@ornek.com", "rol": "Eğitmen", "aktif": True, "ana_egitmen": ""},
    ]
    for ad, alanlar in degis.items():
        for x in k:
            if x["ad"] == ad.replace("_", " "):
                x.update(alanlar)
    return k


def kisi(db, ad):
    return db.execute("select eposta, rol::text, aktif from kisiler where ad = %s", (ad,)).fetchone()


def kur(db):
    senkron(db, temel([], kisiler=kisiler()))  # Özge yönetici olarak önceden var (yonetici_var)


def test_sayfadan_yonetici_yapilamaz(db):
    kur(db)
    r = senkron(db, temel([], kisiler=kisiler(Can_Yıldız={"rol": "Yönetici"})))
    assert kisi(db, "Can Yıldız")[1] == "egitmen"
    assert any("Yönetici rolü" in h["mesaj"] for h in r["hatalar"])


def test_yeni_kisi_yonetici_olarak_eklenemez(db):
    kur(db)
    k = kisiler() + [{"satir": 5, "ad": "Sızan Kişi", "eposta": "sizan@ornek.com", "rol": "Yönetici", "aktif": True}]
    senkron(db, temel([], kisiler=k))
    assert kisi(db, "Sızan Kişi")[1] == "egitmen"


def test_yoneticinin_epostasi_sayfadan_degismez(db):
    kur(db)
    r = senkron(db, temel([], kisiler=kisiler(Özge={"eposta": "saldirgan@ornek.com"})))
    assert kisi(db, "Özge")[0] == YONETICI
    assert any("Yöneticinin e-postası" in h["mesaj"] for h in r["hatalar"])
    with as_user(db, "saldirgan@ornek.com"):
        assert db.execute("select yonetici_mi()").fetchone()[0] is False


def test_eposta_sayfadan_degisir(db):
    kur(db)
    r = senkron(db, temel([], kisiler=kisiler(Can_Yıldız={"eposta": "Can.Yeni@ornek.com"})))
    assert kisi(db, "Can Yıldız")[0] == "can.yeni@ornek.com"
    assert r["eposta_degisimleri"] == [{"ad": "Can Yıldız", "eski": "can@ornek.com", "yeni": "can.yeni@ornek.com"}]
    assert not r["hatalar"]
    senkron(db, temel([], kisiler=kisiler(Can_Yıldız={"eposta": "can.yeni@ornek.com"})))  # tekrar: değişiklik yok
    assert db.execute("select count(*) from kisiler where ad = 'Can Yıldız'").fetchone()[0] == 1


def test_baskasinin_epostasi_alinamaz(db):
    kur(db)
    r = senkron(db, temel([], kisiler=kisiler(Can_Yıldız={"eposta": AYSE})))
    assert kisi(db, "Can Yıldız")[0] == "can@ornek.com"
    assert kisi(db, "Ayşe Kaya")[0] == AYSE


def test_yoneticinin_rolu_ve_aktifligi_sayfadan_degismez(db):
    kur(db)
    senkron(db, temel([], kisiler=kisiler(Özge={"rol": "Eğitmen", "aktif": False})))
    assert kisi(db, "Özge")[1:] == ("yonetici", True)


def test_rol_hucresi_asistanlik_vermez(db):
    # asistanlık bootcamp başına (Bootcamp'ler sekmesi); Kişiler'deki Rol hücresi genel rolü değiştirmez
    kur(db)
    senkron(db, temel([], kisiler=kisiler(Can_Yıldız={"rol": "Asistan"})))
    assert kisi(db, "Can Yıldız")[1] == "egitmen"


def anahtar(db):
    with as_user(db, YONETICI) as c:
        return c.execute("select senkron_anahtari_olustur()").fetchone()[0]


def denetle(db, a, tablo=None):
    return db.execute("select senkron_anahtari_denetle(%s, %s)", (a, tablo)).fetchone()[0]


def test_anahtar_ilk_e_tabloya_baglanir(db):
    kur(db)
    a = anahtar(db)
    assert denetle(db, a, "tablo-1") == "tamam"
    assert denetle(db, a, "tablo-1") == "tamam"
    assert denetle(db, a, "tablo-2") == "baska_tablo"
    assert denetle(db, a, None) == "baska_tablo"
    a2 = anahtar(db)  # yeni anahtar bağı sıfırlar
    assert denetle(db, a2, "tablo-2") == "tamam"


def test_eski_betik_kimliksiz_calisir_ta_ki_baglanana_kadar(db):
    kur(db)
    a = anahtar(db)
    assert denetle(db, a, None) == "tamam"
    assert denetle(db, a, "tablo-1") == "tamam"
    assert denetle(db, a, None) == "baska_tablo"


def test_hatali_denemeler_kilitlenir(db):
    kur(db)
    a = anahtar(db)
    for _ in range(10):
        assert denetle(db, "f" * 64) == "gecersiz"
    assert denetle(db, a) == "kilitli"  # doğru anahtar bile 15 dakika bekler


def test_istemci_denetleyemez(db):
    kur(db)
    import psycopg
    import pytest
    with as_user(db, YONETICI) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("select senkron_anahtari_denetle('x', null)")


def test_ek_eposta_ile_giris_ayni_kisi(db):
    kur(db)
    db.execute("update kisiler set ek_epostalar = array['Ozge.Ikinci@gmail.com'] where ad = 'Özge'")
    with as_user(db, "ozge.ikinci@gmail.com"):
        assert db.execute("select yonetici_mi()").fetchone()[0] is True
        assert db.execute("select mevcut_kisi_id() = (select id from kisiler where ad = 'Özge')").fetchone()[0] is True
    with as_user(db, "baska@gmail.com"):
        assert db.execute("select mevcut_kisi_id()").fetchone()[0] is None
