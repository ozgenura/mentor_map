"""Ders sonu notları: ana eğitmen yazar, yönetici ve rapor izleyicisi board'da görür; hatırlatma ve haftalık özet."""

import datetime as dt

import psycopg
import pytest

from conftest import as_user
from test_sablon import hata_bekle, kurulu, oturum, sablon, sekme  # noqa: F401
from test_senkron import AYSE, YONETICI, yonetici_var  # noqa: F401

CAN = "can@ornek.com"
DUN = (dt.date.today() - dt.timedelta(days=1)).isoformat()


@pytest.fixture
def ders(kurulu):
    """Dün yapılmış İK dersi: Can ana eğitmen, Ayşe yardımcı. Özellik açık, herkesin cihazı kayıtlı."""
    db = kurulu
    o = oturum(hafta=1, tarih=DUN, egitmenler=("Can Yıldız",))
    sablon(db, [sekme([o])])
    db.execute("""insert into oturum_anlaticilari (oturum_id, kisi_id, rol)
                  select %s, id, 'yardimci' from kisiler where ad = 'Ayşe Kaya'""", (o["id"],))
    for e in (YONETICI, AYSE, CAN):
        with as_user(db, e):
            db.execute("select push_abone_ol(%s, 'p', 'a')", (f"https://push.example/{e}",))
    db.execute("delete from push_kuyrugu")
    db.execute("update uygulama_ayarlari set acik = true where anahtar = 'ders_notlari'")
    return db, o["id"]


def kaydet(db, oid, plan="kismen", dikkat="3 kişi veri setine erişemedi"):
    db.execute("select ders_notu_kaydet(%s, %s, 'iyi', 27, 'JOIN ve alt sorgular', %s)", (oid, plan, dikkat))


def hafta(db):
    pzt = dt.date.today() - dt.timedelta(days=dt.date.today().weekday())
    gun = dt.date.fromisoformat(DUN)
    if gun < pzt:
        pzt -= dt.timedelta(days=7)
    return db.execute("select ders_notlari_hafta(%s)", (pzt.isoformat(),)).fetchone()[0]


def test_ana_egitmen_yazar_izleyici_gorur(ders):
    db, oid = ders
    with as_user(db, CAN):
        assert db.execute("select ders_notu(%s)", (oid,)).fetchone()[0] == {"yazabilir": True, "basladi": True, "not": None}
        kaydet(db, oid)
        kaydet(db, oid, plan="tamam")                                       # düzenleme üzerine yazar
        n = db.execute("select ders_notu(%s)", (oid,)).fetchone()[0]["not"]
        assert (n["plan"], n["katilim"], n["yazan"]) == ("tamam", 27, "Can Yıldız")
        with hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yalnızca yönetici"):
            db.execute("select ders_notlari_hafta(current_date)")
    with as_user(db, YONETICI):
        [s] = hafta(db)
        assert (s["egitmenler"], s["not"]["dikkat"]) == (["Can Yıldız"], "3 kişi veri setine erişemedi")
    # Rapor izleyicisi (Atilla Hoca gibi) görür; diğer eğitmen ne notu ne board'u görür.
    with as_user(db, AYSE):
        assert db.execute("select ders_notu(%s)", (oid,)).fetchone()[0] is None
        with hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yalnızca yönetici"):
            db.execute("select ders_notlari_hafta(current_date)")
    db.execute("update kisiler set rapor_izleyici = true where ad = 'Ayşe Kaya'")
    with as_user(db, AYSE):
        assert db.execute("select ders_notlari_durumu()").fetchone()[0] == {"acik": True, "izleyici": True}
        assert db.execute("select ders_notu(%s)", (oid,)).fetchone()[0]["yazabilir"] is False
        assert len(hafta(db)) == 1


def test_yalnizca_ana_egitmen_ve_baslamis_ders(ders):
    db, oid = ders
    with as_user(db, AYSE), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yalnızca ana eğitmeni"):
        kaydet(db, oid)                                                     # yardımcı eğitmen yazamaz
    db.execute("update oturumlar set tarih = current_date + 2, baslangic = now() + interval '2 days', bitis = now() + interval '2 days 2 hours'")
    with as_user(db, CAN), hata_bekle(db, psycopg.errors.InvalidParameterValue, "ders başladıktan sonra"):
        kaydet(db, oid)


def test_ozellik_kapaliyken_yalnizca_yonetici(ders):
    db, oid = ders
    db.execute("update uygulama_ayarlari set acik = false where anahtar = 'ders_notlari'")
    with as_user(db, CAN):
        assert db.execute("select ders_notlari_durumu()").fetchone()[0] == {"acik": False, "izleyici": False}
        assert db.execute("select ders_notu(%s)", (oid,)).fetchone()[0] is None
        with hata_bekle(db, psycopg.errors.InsufficientPrivilege, "henüz açık değil"):
            kaydet(db, oid)
    with as_user(db, YONETICI):
        assert db.execute("select ders_notlari_durumu()").fetchone()[0] == {"acik": True, "izleyici": True}


def test_not_hatirlatmasi_bir_kez_ve_not_varsa_yok(ders):
    db, oid = ders
    db.execute("update oturumlar set baslangic = now() - interval '170 minutes', bitis = now() - interval '50 minutes'")
    db.execute("delete from push_kuyrugu")                                  # saat değişti bildirimi ayrıca gider
    db.execute("select push_hatirlatmalari()")
    db.execute("select push_hatirlatmalari()")
    assert db.execute("""select k.ad, q.baslik, q.acil from push_kuyrugu q join kisiler k on k.id = q.kisi_id
                         where q.anahtar like 'dersnotu:%'""").fetchall() \
        == [("Can Yıldız", "📝 Bugünkü dersin nasıl geçti?", False)]            # yardımcıya gitmez, sessiz saate uyar
    db.execute("delete from push_kuyrugu")
    with as_user(db, CAN):
        kaydet(db, oid)
    db.execute("delete from push_kuyrugu")
    db.execute("select push_hatirlatmalari()")
    assert db.execute("select count(*) from push_kuyrugu where anahtar like 'dersnotu:%'").fetchone()[0] == 0


def test_not_alinmayan_tur_boardda_yok(ders):
    db, oid = ders
    db.execute("update oturumlar set tur = 'Mentor Görüşmesi'")
    with as_user(db, YONETICI):
        assert hafta(db) == []
        assert db.execute("select ders_notu(%s)", (oid,)).fetchone()[0] is None
