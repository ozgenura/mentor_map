"""RLS ve RPC yetki testleri. Her test kendi transaction'ında, sonunda geri alınır."""

import datetime as dt

import psycopg
import pytest

from conftest import as_user

YONETICI = "ozge@ornek.com"
AYSE = "ayse.kaya@ornek.com"      # İK ana eğitmeni
CAN = "can.yildiz@ornek.com"      # eğitmen
PASIF = "eski@ornek.com"
YABANCI = "kimse@ornek.com"

GUN = dt.date.today() + dt.timedelta(days=10)


@pytest.fixture
def seed(db):
    q = db.execute
    ids = {}
    for ad, eposta, rol, aktif in [("Özge", YONETICI, "yonetici", True), ("Ayşe Kaya", AYSE, "egitmen", True),
                                   ("Can Yıldız", CAN, "egitmen", True), ("Eski Eğitmen", PASIF, "egitmen", False)]:
        ids[eposta] = q("insert into kisiler (ad, eposta, rol, aktif) values (%s, %s, %s, %s) returning id",
                        (ad, eposta, rol, aktif)).fetchone()[0]
    ik = q("insert into bootcamp (ad, kisa_kod) values ('İK Analitiği', 'İK') returning id").fetchone()[0]
    ds = q("insert into bootcamp (ad, kisa_kod) values ('Data Science', 'DS') returning id").fetchone()[0]
    q("insert into bootcamp_yetkilileri (bootcamp_id, kisi_id) values (%s, %s)", (ik, ids[AYSE]))

    def oturum(bootcamp, anahtar, bas, bit, kisi):
        oid = q("""insert into oturumlar (bootcamp_id, tarih, baslangic, bitis, slot, tur, konu, kaynak, dis_anahtar)
                   values (%s, %s, tr_zaman(%s, %s), tr_zaman(%s, %s), 'sali', 'Ders', 'Konu', 'excel', %s)
                   returning id""", (bootcamp, GUN, GUN, bas, GUN, bit, anahtar)).fetchone()[0]
        q("insert into oturum_anlaticilari (oturum_id, kisi_id) values (%s, %s)", (oid, ids[kisi]))
        return oid

    ids["ik"], ids["ds"] = ik, ds
    ids["ik_oturum"] = oturum(ik, "ik-x-sali", "20:30", "24:00", AYSE)
    ids["ds_oturum"] = oturum(ds, "ds-x-sali", "19:00", "22:00", CAN)
    q("delete from bildirim_kuyrugu")
    return ids


def _count(db, sql, *args):
    return db.execute(sql, args).fetchone()[0]


# ---------------------------------------------------------------- okuma


def test_kayitsiz_eposta_hicbir_sey_goremez(db, seed):
    with as_user(db, YABANCI):
        assert _count(db, "select count(*) from oturum_gorunumu") == 0
        assert _count(db, "select count(*) from kisiler") == 0


def test_pasif_kisi_goremez(db, seed):
    with as_user(db, PASIF):
        assert _count(db, "select count(*) from oturum_gorunumu") == 0


def test_egitmen_tum_programi_gorur(db, seed):
    with as_user(db, CAN):
        rows = db.execute("select kisa_kod, anlaticilar from oturum_gorunumu order by kisa_kod").fetchall()
    assert [r[0] for r in rows] == ["DS", "İK"]
    assert rows[1][1][0]["ad"] == "Ayşe Kaya"


def test_token_yalnizca_sahibine_gorunur(db, seed):
    with as_user(db, CAN):
        rows = db.execute("select kisi_id from takvim_tokenlari").fetchall()
    assert rows == [(seed[CAN],)]
    with as_user(db, YONETICI):
        assert _count(db, "select count(*) from takvim_tokenlari") == 4


# ---------------------------------------------------------------- iptal


def test_egitmen_iptal_edemez(db, seed):
    with as_user(db, CAN):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select oturum_iptal(%s, 'hasta')", (seed["ds_oturum"],))


def test_ana_egitmen_kendi_bootcampinde_iptal_eder(db, seed):
    with as_user(db, AYSE):
        db.execute("select oturum_iptal(%s, 'Eğitmen hasta')", (seed["ik_oturum"],))
        durum, gerekce = db.execute("select durum, iptal_gerekcesi from oturum_gorunumu where id = %s",
                                    (seed["ik_oturum"],)).fetchone()
    assert (durum, gerekce) == ("iptal", "Eğitmen hasta")
    islem, kisi = db.execute("select islem, kisi_id from degisiklik_kaydi where oturum_id = %s order by id desc",
                             (seed["ik_oturum"],)).fetchone()
    assert (islem, kisi) == ("iptal", seed[AYSE])


def test_iptal_gerekcesi_zorunlu(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            db.execute("select oturum_iptal(%s, '  ')", (seed["ik_oturum"],))


def test_ana_egitmen_baska_bootcampte_iptal_edemez(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select oturum_iptal(%s, 'neden')", (seed["ds_oturum"],))


def test_iptal_geri_alinir(db, seed):
    with as_user(db, AYSE):
        db.execute("select oturum_iptal(%s, 'x')", (seed["ik_oturum"],))
        db.execute("select oturum_iptal_geri_al(%s)", (seed["ik_oturum"],))
    assert _count(db, "select count(*) from oturumlar where id = %s and durum = 'planli' and iptal_gerekcesi is null",
                  seed["ik_oturum"]) == 1


def test_yonetici_iptal_edince_anlaticiya_bildirim_gider(db, seed):
    with as_user(db, YONETICI):
        db.execute("select oturum_iptal(%s, 'Tatil')", (seed["ik_oturum"],))
    rows = db.execute("select kisi_id, olay from bildirim_kuyrugu").fetchall()
    assert rows == [(seed[AYSE], "iptal")]


# ---------------------------------------------------------------- doğrudan yazma


def test_ana_egitmen_tabloya_dogrudan_yazamaz(db, seed):
    with as_user(db, AYSE):
        cur = db.execute("update oturumlar set konu = 'değişti' where id = %s", (seed["ik_oturum"],))
        assert cur.rowcount == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("insert into degisiklik_kaydi (islem) values ('sahte')")


def test_ana_egitmen_resmi_oturumun_saatini_degistiremez(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("""select yan_seans_guncelle(%s, %s, '18:00', '19:00', 'x', %s::jsonb)""",
                       (seed["ik_oturum"], GUN, f'[{{"kisi_id": "{seed[AYSE]}"}}]'))


def test_yonetici_saat_degistirir_surum_artar_bildirim_gider(db, seed):
    with as_user(db, YONETICI):
        db.execute("update oturumlar set baslangic = tr_zaman(tarih, '21:00') where id = %s", (seed["ik_oturum"],))
    assert _count(db, "select surum from oturumlar where id = %s", seed["ik_oturum"]) == 1
    assert db.execute("select olay from bildirim_kuyrugu").fetchall() == [("zaman_degisti",)]


def test_ana_egitmen_detay_alanlarini_duzenler(db, seed):
    with as_user(db, AYSE):
        db.execute("select oturum_detay_guncelle(%s, 'Açıklama', 'https://meet', '', null)", (seed["ik_oturum"],))
    row = db.execute("select aciklama, toplanti_linki, materyal_linki from oturumlar where id = %s",
                     (seed["ik_oturum"],)).fetchone()
    assert row == ("Açıklama", "https://meet", None)


# ---------------------------------------------------------------- yan seans


def test_yan_seans_konuk_ve_kayitli_anlaticiyla_eklenir(db, seed):
    anlaticilar = f'[{{"kisi_id": "{seed[CAN]}"}}, {{"konuk_ad": "Dr. Konuk"}}]'
    with as_user(db, AYSE):
        oid = db.execute("select yan_seans_ekle(%s, %s, '18:00', '19:30', 'SQL soru-cevap', %s::jsonb)",
                         (seed["ik"], GUN, anlaticilar)).fetchone()[0]
        tur, kaynak, anl = db.execute("select tur, kaynak, anlaticilar from oturum_gorunumu where id = %s",
                                      (oid,)).fetchone()
    assert (tur, kaynak) == ("Yan Seans", "uygulama")
    assert {(a["ad"], a["rol"]) for a in anl} == {("Can Yıldız", "ana"), ("Dr. Konuk", "konuk")}
    # Ekleyen Ayşe'ye değil, anlatıcı Can'a bildirim gider
    assert db.execute("select kisi_id, olay from bildirim_kuyrugu").fetchall() == [(seed[CAN], "yan_seans_eklendi")]


def test_yan_seans_anlaticisiz_eklenemez(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            db.execute("select yan_seans_ekle(%s, %s, '18:00', '19:00', 'x', '[]'::jsonb)", (seed["ik"], GUN))


def test_yan_seans_bitis_baslangictan_once_olamaz(db, seed):
    with as_user(db, AYSE):
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            db.execute("select yan_seans_ekle(%s, %s, '20:00', '19:00', 'x', %s::jsonb)",
                       (seed["ik"], GUN, f'[{{"kisi_id": "{seed[AYSE]}"}}]'))


def test_egitmen_yalnizca_kendi_bildirimlerini_gorur(db, seed):
    with as_user(db, YONETICI):
        db.execute("select oturum_iptal(%s, 'Tatil')", (seed["ik_oturum"],))   # Ayşe'ye bildirim
        db.execute("select oturum_iptal(%s, 'Tatil')", (seed["ds_oturum"],))   # Can'a bildirim
    with as_user(db, CAN):
        rows = db.execute("select kisi_id, olay from bildirim_kuyrugu").fetchall()
        cur = db.execute("update bildirim_kuyrugu set gonderildi = now()")
        assert cur.rowcount == 0
    assert rows == [(seed[CAN], "iptal")]


def test_egitmen_yan_seans_ekleyemez(db, seed):
    with as_user(db, CAN):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select yan_seans_ekle(%s, %s, '18:00', '19:00', 'x', %s::jsonb)",
                       (seed["ik"], GUN, f'[{{"kisi_id": "{seed[CAN]}"}}]'))


# ---------------------------------------------------------------- yardımcılar


def test_cakisma_kontrol(db, seed):
    with as_user(db, AYSE):
        rows = db.execute("select kisi_ad, bootcamp_ad, tip from cakisma_kontrol(%s, tr_zaman(%s, '20:00'), tr_zaman(%s, '21:00'))",
                          ([seed[CAN]], GUN, GUN)).fetchall()
        bos = db.execute("select count(*) from cakisma_kontrol(%s, tr_zaman(%s, '22:00'), tr_zaman(%s, '23:00'))",
                         ([seed[CAN]], GUN, GUN)).fetchone()[0]
    assert rows == [("Can Yıldız", "Data Science", "KESIN")]
    assert bos == 0  # 22:00'de biten oturumla arka arkaya: çakışma değil


def test_tr_zaman_24_ertesi_gun(db):
    v = db.execute("select tr_zaman('2026-10-20', '24:00') = '2026-10-21 00:00+03'::timestamptz").fetchone()[0]
    assert v is True


def test_token_yenilenir_ve_baskasininki_yenilenemez(db, seed):
    eski = db.execute("select token from takvim_tokenlari where kisi_id = %s", (seed[CAN],)).fetchone()[0]
    with as_user(db, CAN):
        yeni = db.execute("select takvim_token_yenile()").fetchone()[0]
        assert yeni != eski and len(yeni) == 64
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            db.execute("select takvim_token_yenile(%s)", (seed[AYSE],))
