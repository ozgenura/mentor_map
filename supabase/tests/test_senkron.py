"""Google Sheets senkronu (sheets_senkron) ve bağlantı anahtarı testleri."""

import datetime as dt
import json
import uuid

import psycopg
import pytest

from conftest import as_user

YONETICI = "ozge@ornek.com"
AYSE = "ayse.kaya@ornek.com"
GUN = (dt.date.today() + dt.timedelta(days=10)).isoformat()


def senkron(db, payload):
    return db.execute("select sheets_senkron(%s::jsonb)", (json.dumps(payload),)).fetchone()[0]


def temel(oturumlar, kisiler=None, onay=False):
    return {
        "kaynak": "test", "onay": onay,
        "bootcamplar": [{"satir": 2, "kod": "İK", "ad": "İK Analitiği", "renk": "#A897FF", "zoom": "https://zoom.us/j/1"}],
        "kisiler": kisiler if kisiler is not None else [
            {"satir": 2, "ad": "Özge", "eposta": YONETICI, "rol": "Yönetici", "aktif": True, "ana_egitmen": ""},
            {"satir": 3, "ad": "Ayşe Kaya", "eposta": AYSE, "rol": "Eğitmen", "aktif": True, "ana_egitmen": "İK"},
            {"satir": 4, "ad": "Can Yıldız", "eposta": "can@ornek.com", "rol": "Eğitmen", "aktif": True, "ana_egitmen": ""},
        ],
        "oturumlar": oturumlar,
    }


def ot(satir, oid, **k):
    return {"satir": satir, "id": oid, "bootcamp": "İK", "tarih": GUN, "baslangic": "20:30", "bitis": "23:00",
            "tur": "Ders", "konu": "SQL", "ana": "Ayşe Kaya", "yardimci": "", "konuk": ""} | k


def test_ilk_senkron_ve_degisiklik(db):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    r = senkron(db, temel([ot(2, a), ot(3, b, konu="Python", yardimci="Can Yıldız", konuk="Dış Konuk")]))
    assert (r["yeni"], r["hata_sayisi"]) == (2, 0)
    g = db.execute("select toplanti_linki, anlaticilar from oturum_gorunumu where id = %s", (b,)).fetchone()
    assert g[0] == "https://zoom.us/j/1"  # bootcamp'in varsayılan linki
    assert sorted((x["ad"], x["rol"]) for x in g[1]) == [("Ayşe Kaya", "ana"), ("Can Yıldız", "yardimci"), ("Dış Konuk", "konuk")]
    assert db.execute("select count(*) from bootcamp_yetkilileri").fetchone()[0] == 1

    # aynı sayfa tekrar: değişiklik yok
    r = senkron(db, temel([ot(2, a), ot(3, b, konu="Python", yardimci="Can Yıldız", konuk="Dış Konuk")]))
    assert (r["yeni"], r["guncellenen"], r["kalkan"]) == (0, 0, 0)

    # saat değişti + Can çıkarıldı: Ayşe'ye zaman bildirimi, Can'a çıkarıldın
    r = senkron(db, temel([ot(2, a), ot(3, b, konu="Python", baslangic="19:00", bitis="22:00")]))
    assert r["guncellenen"] == 1
    olaylar = sorted(db.execute("""select k.ad, b.olay from bildirim_kuyrugu b join kisiler k on k.id = b.kisi_id
                                   where b.oturum_id = %s""", (b,)).fetchall())
    assert ("Can Yıldız", "atamadan_cikarildin") in olaylar
    assert ("Ayşe Kaya", "zaman_degisti") in olaylar


def test_uygulama_alanlarina_dokunmaz_ve_kalkani_isaretler(db):
    ids = [str(uuid.uuid4()) for _ in range(6)]
    senkron(db, temel([ot(i + 2, x) for i, x in enumerate(ids)]))
    db.execute("update oturumlar set notlar = 'not', toplanti_linki = 'https://ozel' where id = %s", (ids[0],))
    db.execute("update oturumlar set durum = 'iptal', iptal_gerekcesi = 'hasta' where id = %s", (ids[1],))
    r = senkron(db, temel([ot(i + 2, x, konu="Yeni konu") for i, x in enumerate(ids[:5])]))
    assert r["kalkan"] == 1
    row = db.execute("select notlar, toplanti_linki, konu from oturumlar where id = %s", (ids[0],)).fetchone()
    assert row == ("not", "https://ozel", "Yeni konu")
    assert db.execute("select durum from oturumlar where id = %s", (ids[1],)).fetchone()[0] == "iptal"
    assert db.execute("select excelden_kalkti from oturumlar where id = %s", (ids[5],)).fetchone()[0] is True


def test_toplu_silme_onay_ister(db):
    ids = [str(uuid.uuid4()) for _ in range(10)]
    senkron(db, temel([ot(i + 2, x) for i, x in enumerate(ids)]))
    db.execute("savepoint s")
    with pytest.raises(psycopg.errors.RaiseException, match="ONAY_GEREKLI"):
        senkron(db, temel([ot(2, ids[0])]))
    db.execute("rollback to savepoint s")
    assert db.execute("select count(*) from oturumlar where excelden_kalkti").fetchone()[0] == 0
    r = senkron(db, temel([ot(2, ids[0])], onay=True))
    assert r["kalkan"] == 9


def test_hatali_satir_atlanir_ve_kalkmis_sayilmaz(db):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    senkron(db, temel([ot(2, a), ot(3, b)]))
    r = senkron(db, temel([ot(2, a), ot(3, b, ana="Bilinmeyen Kişi"), ot(4, str(uuid.uuid4()), tarih="31.12.2026"),
                           ot(5, str(uuid.uuid4()), bootcamp="YOK"), ot(6, "", konu="ID'siz")]))
    satirlar = sorted(h["satir"] for h in r["hatalar"])
    assert satirlar == [3, 4, 5, 6]
    assert r["kalkan"] == 0 and r["yeni"] == 0


def test_anahtar_yalnizca_yonetici_ve_istemci_cagiramaz(db):
    senkron(db, temel([]))
    with as_user(db, AYSE) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("select senkron_anahtari_olustur()")
    with as_user(db, YONETICI) as c:
        anahtar = c.execute("select senkron_anahtari_olustur()").fetchone()[0]
        assert len(anahtar) == 64
        assert c.execute("select senkron_durumu() ->> 'anahtar_var'").fetchone()[0] == "true"
    with as_user(db, YONETICI) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("select sheets_senkron('{}'::jsonb)")
    with as_user(db, YONETICI) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("select senkron_anahtari_dogrula(%s)", (anahtar,))
    assert db.execute("select senkron_anahtari_dogrula(%s)", (anahtar,)).fetchone()[0] is True
    assert db.execute("select senkron_anahtari_dogrula('yanlis')").fetchone()[0] is False
    assert db.execute("select count(*) from senkron_anahtari where ozet = %s", (anahtar,)).fetchone()[0] == 0


def test_tehlikeli_linkler_reddedilir(db):
    a = str(uuid.uuid4())
    senkron(db, temel([ot(2, a)]))
    for kotu in ["javascript:alert(1)", "https://zoom.us/j/1\r\nATTENDEE:x", "data:text/html,<script>", " https://a b"]:
        db.execute("savepoint s")
        with pytest.raises(psycopg.errors.CheckViolation):
            db.execute("update oturumlar set toplanti_linki = %s where id = %s", (kotu, a))
        db.execute("rollback to savepoint s")
    db.execute("update oturumlar set toplanti_linki = 'https://zoom.us/j/123?pwd=abc' where id = %s", (a,))
    p = temel([ot(2, a)])
    p["bootcamplar"][0]["zoom"] = "javascript:alert(1)"
    r = senkron(db, p)
    assert [h["mesaj"] for h in r["hatalar"]] == ["Zoom linki https:// ile başlamalı ve boşluk içermemeli"]


def test_kisi_yeniden_adlandirma(db):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    kisiler = lambda ad: [
        {"satir": 2, "ad": "Özge", "eposta": YONETICI, "rol": "Yönetici", "aktif": True, "ana_egitmen": ""},
        {"satir": 3, "ad": ad, "eposta": "ata@eposta-bekleniyor.invalid", "rol": "Eğitmen", "aktif": True, "ana_egitmen": "İK"},
    ]
    senkron(db, temel([ot(2, a, ana="Ata")], kisiler("Ata")))
    kid = db.execute("select id from kisiler where ad = 'Ata'").fetchone()[0]
    # Kişiler'de tam ad yazıldı; Oturumlar'da bir hücre hâlâ eski adla
    r = senkron(db, temel([ot(2, a, ana="Ata"), ot(3, b, ana="Ata Yılmaz")], kisiler("Ata Yılmaz")))
    assert r["hata_sayisi"] == 0, r["hatalar"]
    assert r["yeniden_adlandirma"] == [{"eski": "Ata", "yeni": "Ata Yılmaz"}]
    assert db.execute("select id, ad from kisiler where eposta = 'ata@eposta-bekleniyor.invalid'").fetchone() == (kid, "Ata Yılmaz")
    assert db.execute("select count(*) from kisiler").fetchone()[0] == 2
    for oid in (a, b):
        assert db.execute("select kisi_id from oturum_anlaticilari where oturum_id = %s", (oid,)).fetchone()[0] == kid
    assert db.execute("select count(*) from bootcamp_yetkilileri where kisi_id = %s", (kid,)).fetchone()[0] == 1
    # tekrar gönderimde yeniden adlandırma bildirilmez
    r = senkron(db, temel([ot(2, a, ana="Ata Yılmaz"), ot(3, b, ana="Ata Yılmaz")], kisiler("Ata Yılmaz")))
    assert r["yeniden_adlandirma"] == [] and r["hata_sayisi"] == 0


def test_sablondan_cikan_kisi_pasif_olur(db):
    senkron(db, temel([]))
    kisiler = temel([])["kisiler"]
    # Can çıkarıldı -> pasif; tekrar eklenince aktif
    r = senkron(db, temel([], [k for k in kisiler if k["ad"] != "Can Yıldız"]))
    assert r["pasif"] == 1
    assert db.execute("select aktif from kisiler where ad = 'Can Yıldız'").fetchone()[0] is False
    senkron(db, temel([], kisiler))
    assert db.execute("select aktif from kisiler where ad = 'Can Yıldız'").fetchone()[0] is True
    # ad ve e-posta birlikte değişti: yeni kişi açılır, eski pasife alınır (artık iki aktif kayıt kalmaz)
    yeni = [k if k["ad"] != "Can Yıldız" else {**k, "ad": "Can Yıldız Ak", "eposta": "can.ak@ornek.com"} for k in kisiler]
    r = senkron(db, temel([], yeni))
    assert r["pasif"] == 1
    assert db.execute("select count(*) from kisiler where aktif and ad like 'Can%'").fetchone()[0] == 1
    # yönetici sayfada olmasa da pasif olmaz
    r = senkron(db, temel([], [k for k in yeni if k["ad"] != "Özge"]))
    assert db.execute("select aktif from kisiler where ad = 'Özge'").fetchone()[0] is True


def test_toplu_kisi_silme_onay_ister(db):
    fazla = temel([])["kisiler"] + [{"satir": 9 + i, "ad": f"E{i}", "eposta": f"e{i}@ornek.com", "rol": "Eğitmen",
                                     "aktif": True, "ana_egitmen": ""} for i in range(3)]
    senkron(db, temel([], fazla))
    db.execute("savepoint s")
    with pytest.raises(psycopg.errors.RaiseException, match="ONAY_GEREKLI"):
        senkron(db, temel([]))
    db.execute("rollback to savepoint s")
    p = temel([]); p["onay"] = True
    assert senkron(db, p)["pasif"] == 3
