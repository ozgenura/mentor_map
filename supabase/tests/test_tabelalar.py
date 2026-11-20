"""Durak tabelaları: anonslar, talepler (PO'na ilet) ve push kuyruğu."""

import psycopg
import pytest

from conftest import as_user
from test_sablon import hata_bekle, kurulu, oturum, sablon, sekme  # noqa: F401
from test_senkron import AYSE, GUN, YONETICI, yonetici_var  # noqa: F401

CAN = "can@ornek.com"


@pytest.fixture
def hat(kurulu):
    """İK hattı: Ayşe PO; Can İK oturumunun eğitmeni; herkes bir cihaz kaydetmiş."""
    db = kurulu
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'""")
    sablon(db, [sekme([oturum(hafta=1, egitmenler=("Can Yıldız",))])])
    for e in (YONETICI, AYSE, CAN):
        with as_user(db, e):
            db.execute("select push_abone_ol(%s, 'p', 'a')", (f"https://push.example/{e}",))
    db.execute("delete from push_kuyrugu")
    db.execute("update uygulama_ayarlari set acik = true where anahtar = 'tabelalar'")
    return db


def ik(db):
    return db.execute("select id from bootcamp where kisa_kod = 'İK'").fetchone()[0]


def kuyruk(db):
    return sorted(db.execute("select k.ad, q.baslik from push_kuyrugu q join kisiler k on k.id = q.kisi_id").fetchall())


def test_po_hattina_anons_yazar_hat_gorur_ve_push(hat):
    db = hat
    with as_user(db, AYSE):
        db.execute("select anons_yaz(%s, 'Perşembe dersi 21:00''e alındı')", (ik(db),))
    assert kuyruk(db) == [("Can Yıldız", "📣 İK anonsu")]               # yazan kendine almaz; yönetici hatta değil
    with as_user(db, CAN):
        [a] = db.execute("select anonslarim()").fetchone()[0]
        assert a["metin"].startswith("Perşembe") and a["goren"] is None and a["gordum"] is False  # sayaç eğitmene dönmez
        db.execute("select anons_gorduk(array[%s]::bigint[])", (a["id"],))
    with as_user(db, AYSE):
        [a] = db.execute("select anonslarim()").fetchone()[0]
        assert (a["goren"], a["kitle"]) == (1, 1)


def test_anons_yetkileri_ve_sure(hat):
    db = hat
    with as_user(db, CAN), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yetkiniz yok"):
        db.execute("select anons_yaz(%s, 'x')", (ik(db),))
    with as_user(db, AYSE), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yalnızca yönetici"):
        db.execute("select anons_yaz(null, 'x')")
    with as_user(db, YONETICI):
        db.execute("select anons_yaz(null, 'Herkese merhaba')")
    with as_user(db, CAN):
        assert [a["kod"] for a in db.execute("select anonslarim()").fetchone()[0]] == [None]
    db.execute("update anonslar set bitis = now() - interval '1 minute'")   # 3 gün doldu
    with as_user(db, CAN):
        assert db.execute("select anonslarim()").fetchone()[0] == []


def test_hatta_olmayan_anonsu_gormez(hat):
    db = hat
    db.execute("insert into bootcamp (kisa_kod, ad) values ('DS', 'Data Science')")
    with as_user(db, YONETICI):
        db.execute("select anons_yaz((select id from bootcamp where kisa_kod = 'DS'), 'DS duyurusu')")
    with as_user(db, CAN):
        assert db.execute("select anonslarim()").fetchone()[0] == []


def test_talep_gonder_po_cevaplar_bir_kez(hat):
    db = hat
    with as_user(db, CAN):
        tid = db.execute("select talep_gonder(%s, 'Program / saat', 'Dersi 21:00''e alabilir miyiz?')", (ik(db),)).fetchone()[0]
    assert kuyruk(db) == [("Ayşe Kaya", "✉️ Yeni talep · Can Yıldız")]
    with as_user(db, AYSE):
        [t] = db.execute("select taleplerim()").fetchone()[0]
        assert t["gelen"] and t["okunmadi"] and t["gonderen"] == "Can Yıldız"
        db.execute("select talep_cevapla(%s, 'Olur, güncelledim.')", (tid,))
        with hata_bekle(db, psycopg.errors.InvalidParameterValue, "zaten cevaplandı"):
            db.execute("select talep_cevapla(%s, 'tekrar')", (tid,))
    assert ("Can Yıldız", "💬 Ayşe Kaya cevap verdi") in kuyruk(db)
    with as_user(db, CAN):
        [t] = db.execute("select taleplerim()").fetchone()[0]
        assert t["benim"] and t["cevap"] == "Olur, güncelledim." and t["okunmadi"]
        db.execute("select talepleri_okudum()")
        assert db.execute("select taleplerim()").fetchone()[0][0]["okunmadi"] is False
        with hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yetkiniz yok"):
            db.execute("select talep_cevapla(%s, 'x')", (tid,))


def test_hatta_olmayan_talep_gonderemez(hat):
    db = hat
    db.execute("insert into bootcamp (kisa_kod, ad) values ('DS', 'Data Science')")
    with as_user(db, CAN), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yalnızca bu programda"):
        db.execute("select talep_gonder((select id from bootcamp where kisa_kod = 'DS'), 'Diğer', 'x')")


def test_iptal_acil_push_sessiz_saatte_bile(hat):
    db = hat
    oid = db.execute("select id from oturumlar limit 1").fetchone()[0]
    with as_user(db, AYSE):
        db.execute("select oturum_iptal(%s, 'Eğitmen rahatsız')", (oid,))
    [(baslik, govde, acil, url)] = db.execute("select baslik, govde, acil, url from push_kuyrugu").fetchall()
    assert baslik.startswith("❌ İptal") and "Eğitmen rahatsız" in govde and acil and url == f"/?oturum={oid}"
    assert db.execute("select public.q_acil_mi(true, 2), public.q_acil_mi(false, 2), public.q_acil_mi(false, 9)").fetchone() == (True, False, True)


def test_abonelik_yoksa_kuyruga_girmez_ve_hatirlatma(hat):
    db = hat
    with as_user(db, CAN):
        db.execute("select push_abonelik_sil(%s)", (f"https://push.example/{CAN}",))
        db.execute("select anons_gorduk('{}')")
    with as_user(db, AYSE):
        db.execute("select anons_yaz(%s, 'x')", (ik(db),))
    assert kuyruk(db) == []
    with as_user(db, CAN):
        db.execute("select push_abone_ol(%s, 'p', 'a')", (f"https://push.example/{CAN}",))
        assert db.execute("select bildirim_ayarim(true)").fetchone()[0] == {"hatirlatma": True, "cihaz": 1}
    db.execute("update oturumlar set baslangic = now() + interval '1 hour', bitis = now() + interval '3 hours'")
    db.execute("delete from push_kuyrugu")                                  # saat değişti bildirimi ayrıca gider
    assert db.execute("select push_hatirlatmalari()").fetchone()[0] == 1
    db.execute("select push_hatirlatmalari()")                              # ikinci tur tekrar eklemez
    assert [b for _, b in kuyruk(db)] == ["⏰ 1 saat sonra: SQL"]
    with as_user(db, CAN), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "permission denied"):
        db.execute("select push_bekleyenler()")


def test_deneme_bildirimi(hat):
    db = hat
    with as_user(db, CAN):
        db.execute("select push_deneme()")
    assert kuyruk(db) == [("Can Yıldız", "🚇 Mentor Map")]


def test_ozellik_kapaliyken_yalnizca_yonetici(hat):
    db = hat
    db.execute("update uygulama_ayarlari set acik = false where anahtar = 'tabelalar'")
    with as_user(db, AYSE), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "henüz açık değil"):
        db.execute("select anons_yaz(%s, 'x')", (ik(db),))
    with as_user(db, CAN), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "henüz açık değil"):
        db.execute("select talep_gonder(%s, 'Diğer', 'x')", (ik(db),))
    with as_user(db, YONETICI):
        assert db.execute("select ozellik_acik('tabelalar')").fetchone()[0] is True
        db.execute("select anons_yaz(%s, 'Yönetici dener')", (ik(db),))
    with as_user(db, CAN):
        assert db.execute("select ozellik_acik('tabelalar')").fetchone()[0] is False
