"""Web uygulamasının demo modu için veri üretir (VITE_DEMO=1).

  python -m mentormap_importer.demo tests/fixtures/mentor_map_dummy.xlsx ../web/public/demo-data.json
  python -m mentormap_importer.demo --gercek program.xlsx ../web/public/demo-data.json

Veri, oturum_gorunumu biçimindedir.
- Dummy modu (varsayılan): test config'iyle okur; gösterim için bir iptal, bir yan seans, toplantı linkleri
  ve "Ne değişti" kayıtları ekler. Bunlar Excel'de yoktur, yalnızca demo verisidir.
- Gerçek mod (--gercek): config.yaml ile gerçek Excel'i okur ve hiçbir şey uydurmaz. Çıktıda gerçek
  eğitmen adları vardır: bu demoyu erişimi kısıtlanmış bir adreste yayınlayın.
"""

import datetime as dt
import json
import sys
import uuid
from pathlib import Path

from .parse import load_config, parse_workbook
from .textutil import slug

HERE = Path(__file__).resolve().parents[1]
TR = dt.timezone(dt.timedelta(hours=3))
# Yeni tasarımın bootcamp renkleri (pastel ağırlıklı; kırmızı tonlar dikkat rengine ayrıldı)
RENKLER = {"İK": "#A897FF", "DS": "#0F9D6E", "Fabric": "#E3A008", "BIO": "#5B8DEF", "Quantum": "#2BB3C0",
           "GeoBA": "#9C7A62", "Vibe": "#E08A4F", "SQL": "#3D7EA6", "AI SQL": "#3D7EA6", "DA": "#7FA650", "DL": "#B07AA1"}
BOOTCAMP_ADLARI = {"İK": "İK Analitiği", "DS": "Data Science", "Fabric": "Microsoft Fabric",
                   "GeoBA": "GeoBA Konumsal Analitik", "Quantum": "Quantum ML", "BIO": "Biyoinformatik",
                   "Vibe": "Vibe Code / Low Code Automation", "SQL": "AI SQL", "AI SQL": "AI SQL", "DA": "Data Analyst", "DL": "Deep Learning"}
SAAT_DILIMI = {"Can Yıldız": "Europe/Berlin", "Burak Aydın": "Europe/London"}
ANA_EGITMEN = {"Ayşe Kaya": ["İK", "BIO"], "Elif Şahin": ["Fabric"], "Deniz Koç": ["Quantum"], "Emre Çelik": ["DS"]}


def _id(s: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"mentormap-demo:{s}"))


def _ts(tarih: dt.date, hhmm: str | None) -> str | None:
    if hhmm is None:
        return None
    h, m = map(int, hhmm.split(":"))
    return (dt.datetime.combine(tarih, dt.time(0, 0), TR) + dt.timedelta(hours=h, minutes=m)).isoformat()


def _dummy_config() -> dict:
    conf = load_config(HERE / "tests" / "fixtures" / "config_dummy.yaml")
    for ad in ("Fabric", "GeoBA", "Quantum"):  # saatsiz sekmeler: 20:30 kararı
        conf["bootcamps"][ad]["default_hours"] = {"start": "20:30", "end": "23:00"}
    return conf


def main(xlsx: str, out: str, gercek: bool = False) -> None:
    r = parse_workbook(xlsx, load_config(HERE / "config.yaml") if gercek else _dummy_config())
    adlar = sorted({a.ad for o in r.oturumlar for a in o.anlaticilar})
    kisiler = [dict(id=_id(ad), ad=ad, eposta="" if gercek else f"{slug(ad).replace('-', '.')}@ornek.com",
                    saat_dilimi=SAAT_DILIMI.get(ad, "Europe/Istanbul") if not gercek else "Europe/Istanbul",
                    rol="egitmen") for ad in adlar]
    kisiler.append(dict(id=_id("yonetici"), ad="Yönetici (demo)", eposta="yonetici@ornek.com",
                        saat_dilimi="Europe/Istanbul", rol="yonetici"))
    bootcamplar = sorted({o.bootcamp for o in r.oturumlar})
    renk = {b: RENKLER.get(b, "#6B5C57") for b in bootcamplar}

    def satir(o, **ek):
        return dict(
            id=_id(o.dis_anahtar), bootcamp_id=_id(o.bootcamp), bootcamp_ad=BOOTCAMP_ADLARI.get(o.bootcamp, o.bootcamp),
            kisa_kod=o.bootcamp, renk=renk[o.bootcamp], tarih=o.tarih.isoformat(),
            baslangic=_ts(o.tarih, o.baslangic), bitis=_ts(o.tarih, o.bitis), slot=o.slot, tur=o.tur, konu=o.konu,
            aciklama=None, toplanti_linki=None, materyal_linki=None, notlar=None, durum="planli",
            iptal_gerekcesi=None, kaynak="excel", uyarilar=o.uyarilar,
            anlaticilar=[dict(kisi_id=_id(a.ad), ad=a.ad, rol="ana" if i == 0 else "yardimci")
                         for i, a in enumerate(o.anlaticilar)],
        ) | ek

    if gercek:
        oturumlar = [satir(o) for o in r.oturumlar]
        veri = dict(olusturma=dt.datetime.now(TR).isoformat(), kisiler=kisiler, oturumlar=oturumlar, yetkiler=[],
                    degisiklikler=[])
        Path(out).write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"GERÇEK VERİ: {len(oturumlar)} oturum, {len(kisiler)} kişi -> {out}")
        return

    oturumlar = [satir(o, toplanti_linki=f"https://meet.google.com/demo-{slug(o.bootcamp)}") for o in r.oturumlar]
    # demo: bir iptal, bir oturuma açıklama ve materyal
    for s in oturumlar:
        if s["kisa_kod"] == "DS" and s["tarih"] == "2026-11-10":
            s.update(durum="iptal", iptal_gerekcesi="Eğitmen rahatsız; telafi tarihi duyurulacak.")
        if s["kisa_kod"] == "İK" and s["tarih"] == "2026-11-03":
            s.update(aciklama="Power BI Desktop kurulu gelin.", materyal_linki="https://drive.google.com/drive/folders/ornek")

    # demo: yan seans her zaman veri üretildikten sonraki ilk cumartesiye düşer
    bugun = dt.datetime.now(TR).date()
    cmt = bugun + dt.timedelta(days=(5 - bugun.weekday()) % 7 or 7)
    yan = dict(oturumlar[0]) | dict(
        id=_id("yan-seans-1"), bootcamp_id=_id("İK"), bootcamp_ad=BOOTCAMP_ADLARI["İK"], kisa_kod="İK", renk=renk["İK"],
        tarih=cmt.isoformat(), baslangic=_ts(cmt, "11:00"), bitis=_ts(cmt, "12:30"),
        slot="yan-seans", tur="Yan Seans", konu="SQL soru-cevap", kaynak="uygulama", uyarilar=[],
        aciklama="Ödev öncesi açık soru-cevap. SQL-2 ödevindeki join sorularına odaklanacağız.",
        toplanti_linki="https://meet.google.com/demo-yan-seans", materyal_linki="https://drive.google.com/drive/folders/ornek",
        anlaticilar=[dict(kisi_id=_id("Can Yıldız"), ad="Can Yıldız", rol="ana"),
                     dict(kisi_id=None, ad="Dr. Konuk Anlatıcı", rol="konuk")])
    oturumlar.append(yan)
    oturumlar.sort(key=lambda s: (s["tarih"], s["baslangic"] or ""))

    def bul(kod, tarih):
        return next(s for s in oturumlar if s["kisa_kod"] == kod and s["tarih"] == tarih)

    # demo: "Ne değişti" akışı. once_saat, sayfa açıldığı andan geriye sayılır.
    ds_iptal = bul("DS", "2026-11-10")
    fabric = bul("Fabric", "2026-11-12")
    degisiklikler = []
    def ekle(kisi, olay, oturum, once_saat, **detay):
        degisiklikler.append(dict(id=len(degisiklikler) + 1, kisi_id=_id(kisi), olay=olay, oturum_id=oturum["id"],
                                  detay=detay, once_saat=once_saat))
    ekle("Can Yıldız", "yan_seans_eklendi", yan, 2, ekleyen="Ayşe Kaya")
    ekle("Can Yıldız", "zaman_degisti", fabric, 26, eski_baslangic=_ts(dt.date(2026, 11, 12), "20:00"),
         eski_bitis=_ts(dt.date(2026, 11, 12), "22:30"))
    ekle("Can Yıldız", "atandin", bul("DS", "2026-11-05"), 120)
    for kisi in ("Emre Çelik",):
        ekle(kisi, "iptal", ds_iptal, 20, gerekce=ds_iptal["iptal_gerekcesi"])
    ekle("Elif Şahin", "zaman_degisti", fabric, 26, eski_baslangic=_ts(dt.date(2026, 11, 12), "20:00"),
         eski_bitis=_ts(dt.date(2026, 11, 12), "22:30"))

    yetkiler = [dict(kisi_id=_id(ad), bootcamp_id=_id(b)) for ad, bs in ANA_EGITMEN.items() for b in bs]
    veri = dict(olusturma=dt.datetime.now(TR).isoformat(), kisiler=kisiler, oturumlar=oturumlar, yetkiler=yetkiler,
                degisiklikler=degisiklikler)
    Path(out).write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(oturumlar)} oturum, {len(kisiler)} kişi, {len(degisiklikler)} değişiklik -> {out}")

if __name__ == "__main__":
    args = sys.argv[1:]
    gercek = "--gercek" in args
    args = [a for a in args if a != "--gercek"]
    main(args[0], args[1], gercek=gercek)
