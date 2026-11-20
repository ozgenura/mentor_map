"""Aşama C: iki yönlü senkron (uygulamadan program düzenleme, birleştirme, çakışma, geri yazım)."""

import psycopg
import pytest

from conftest import as_user
from test_sablon import hata_bekle, kurulu, oturum, sablon, sekme  # noqa: F401
from test_senkron import AYSE, GUN, YONETICI, yonetici_var  # noqa: F401

CAN = "can@ornek.com"


@pytest.fixture
def po(kurulu):
    db = kurulu
    db.execute("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id, yetki)
                  select b.id, k.id, 'po' from bootcamp b, kisiler k where b.kisa_kod = 'İK' and k.ad = 'Ayşe Kaya'
                  on conflict do nothing""")
    return db


def kisi(db, ad):
    return str(db.execute("select id from kisiler where ad = %s", (ad,)).fetchone()[0])


def duzenle(db, oid, tarih=GUN, bas="20:30", bit="23:00", tur="Ders", konu="SQL", egitmenler=None, kim=AYSE):
    eg = egitmenler if egitmenler is not None else [{"kisi_id": kisi(db, "Ayşe Kaya")}]
    import json
    with as_user(db, kim):
        db.execute("select oturum_programi_guncelle(%s, %s, %s, %s, %s, %s, %s::jsonb)",
                   (oid, tarih, bas, bit, tur, konu, json.dumps(eg)))


def alan(db, oid, *k):
    return db.execute(f"select {', '.join(k)} from oturum_gorunumu where id = %s", (oid,)).fetchone()


def test_uygulamadaki_degisiklik_korunur_ve_geri_yazilir(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    duzenle(db, a["id"], bas="21:00", bit="23:30", konu="SQL ileri")
    r = sablon(db, [sekme([a])])  # şablon aynı
    assert alan(db, a["id"], "konu", "to_char(baslangic at time zone 'Europe/Istanbul', 'HH24:MI')") == ("SQL ileri", "21:00")
    [g] = r["geri_yazim"]
    assert g["id"] == a["id"] and g["konu"] == "SQL ileri" and g["saat"] == "21:00–23:30" and g["tarih"] == GUN
    assert r["sekmeler"][0]["cakisma"] == 0
    # betik şablona yazdıktan sonra gelen gönderim: değişiklik yok, geri yazım da yok
    r = sablon(db, [sekme([a | {"konu": "SQL ileri", "baslangic": "21:00", "bitis": "23:30"}])])
    assert r["geri_yazim"] == [] and r["sekmeler"][0]["guncellenen"] == 0


def test_farkli_alanlar_birlesir(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    duzenle(db, a["id"], bas="21:00", bit="23:30")                      # uygulamada saat
    sablon(db, [sekme([a | {"konu": "Python"}])])                        # şablonda konu
    assert alan(db, a["id"], "konu", "to_char(baslangic at time zone 'Europe/Istanbul', 'HH24:MI')") == ("Python", "21:00")


def test_ayni_alan_farkli_degisirse_cakisma_ve_sablonla_cozum(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    duzenle(db, a["id"], konu="SQL (uygulama)")
    r = sablon(db, [sekme([a | {"konu": "SQL (şablon)"}])])
    assert r["sekmeler"][0]["cakisma"] == 1 and r["acik_cakisma"] == 1
    assert alan(db, a["id"], "konu") == ("SQL (uygulama)",)                # oturum değişmedi
    c = db.execute("select id, alan, sablon_metni, uygulama_metni from sablon_cakismalari where cozum is null").fetchone()
    assert c[1:] == ("konu", "SQL (şablon)", "SQL (uygulama)")
    with as_user(db, CAN), hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yetkiniz yok"):
        db.execute("select sablon_cakisma_coz(%s, 'sablon')", (c[0],))
    with as_user(db, AYSE):
        assert db.execute("select count(*) from sablon_cakismalari").fetchone()[0] == 1   # PO görür
        db.execute("select sablon_cakisma_coz(%s, 'sablon')", (c[0],))
    assert alan(db, a["id"], "konu") == ("SQL (şablon)",)
    r = sablon(db, [sekme([a | {"konu": "SQL (şablon)"}])])
    assert r["acik_cakisma"] == 0 and r["geri_yazim"] == []


def test_cakisma_uygulamayla_cozulunce_geri_yazilir(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    duzenle(db, a["id"], konu="SQL (uygulama)")
    sablon(db, [sekme([a | {"konu": "SQL (şablon)"}])])
    cid = db.execute("select id from sablon_cakismalari").fetchone()[0]
    with as_user(db, YONETICI):
        db.execute("select sablon_cakisma_coz(%s, 'uygulama')", (cid,))
    r = sablon(db, [sekme([a | {"konu": "SQL (şablon)"}])])
    assert alan(db, a["id"], "konu") == ("SQL (uygulama)",)
    assert [g["konu"] for g in r["geri_yazim"]] == ["SQL (uygulama)"] and r["acik_cakisma"] == 0


def test_ayni_degere_degisim_cakisma_degil(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    duzenle(db, a["id"], konu="Ortak")
    r = sablon(db, [sekme([a | {"konu": "Ortak"}])])
    assert r["sekmeler"][0]["cakisma"] == 0 and r["geri_yazim"] == []


def test_uygulamada_egitmen_degisir_bildirim_ve_geri_yazim(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    db.execute("delete from bildirim_kuyrugu")
    duzenle(db, a["id"], egitmenler=[{"kisi_id": kisi(db, "Can Yıldız")}, {"konuk_ad": "Dış Uzman"}])
    olay = sorted(db.execute("select k.ad, b.olay from bildirim_kuyrugu b join kisiler k on k.id = b.kisi_id").fetchall())
    assert olay == [("Ayşe Kaya", "atamadan_cikarildin"), ("Can Yıldız", "atandin")]
    r = sablon(db, [sekme([a])])  # şablonda hâlâ Ayşe: uygulamadaki korunur
    assert sorted(x["ad"] for x in alan(db, a["id"], "anlaticilar")[0]) == ["Can Yıldız", "Dış Uzman"]
    [g] = r["geri_yazim"]
    assert (g["egitmenler"], g["konuklar"]) == ("Can Yıldız", "Dış Uzman")


def test_saat_degisince_zaman_bildirimi(po):
    db = po
    a = oturum(hafta=1, egitmenler=("Can Yıldız",))  # değişikliği yapan (Ayşe) kendine bildirim almaz
    sablon(db, [sekme([a])])
    db.execute("delete from bildirim_kuyrugu")
    duzenle(db, a["id"], bas="19:00", bit="21:30", egitmenler=[{"kisi_id": kisi(db, "Can Yıldız")}])
    assert db.execute("select count(*) from bildirim_kuyrugu where olay = 'zaman_degisti'").fetchone()[0] >= 1


def test_yetki_ve_kaynak_kurallari(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    with hata_bekle(db, psycopg.errors.InsufficientPrivilege, "yetkiniz yok"):
        duzenle(db, a["id"], kim=CAN)                                   # eğitmen düzenleyemez
    excel = db.execute("""insert into oturumlar (bootcamp_id, tarih, tur, konu, kaynak, dis_anahtar)
                          select id, %s, 'Ders', 'X', 'excel', 'test-excel' from bootcamp where kisa_kod = 'İK' returning id""", (GUN,)).fetchone()[0]
    with hata_bekle(db, psycopg.errors.InsufficientPrivilege, "Mentor Map Program"):
        duzenle(db, str(excel))


def test_onizleme_cakisma_kaydetmez(po):
    db = po
    a = oturum(hafta=1)
    sablon(db, [sekme([a])])
    duzenle(db, a["id"], konu="SQL (uygulama)")
    r = sablon(db, [sekme([a | {"konu": "SQL (şablon)"}])], onizleme=True)
    assert r["sekmeler"][0]["cakisma"] == 1
    assert db.execute("select count(*) from sablon_cakismalari").fetchone()[0] == 0
