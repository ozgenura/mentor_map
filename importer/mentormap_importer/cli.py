"""Komut satırı.

  python -m mentormap_importer.cli ice-aktar yeni.xlsx            # önizleme, hiçbir şey yazmaz
  python -m mentormap_importer.cli ice-aktar yeni.xlsx --apply    # farkları yazar
  python -m mentormap_importer.cli kisiler kisiler.csv [--apply]  # eğitmen listesi ve ana eğitmenler

Bağlantı: DATABASE_URL ortam değişkeni ya da importer/.env dosyası (Supabase > Project Settings >
Database > Connection string). Bu anahtar yalnızca yöneticinin bilgisayarında durur.
"""

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from collections import Counter

from .model import GUN_UYUSMAZLIGI
from .parse import load_config, parse_workbook
from .sync import db_aliases, plan_olustur, uygula

HERE = Path(__file__).resolve().parents[1]


def _conn():
    load_dotenv(HERE / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL tanımlı değil (importer/.env dosyasına ekleyin).")
    return psycopg.connect(url)


def _yaz_rapor(result, plan) -> None:
    p = print
    p(f"\nOkunan oturum: {len(result.oturumlar)}   hatalı kayıt: {len(result.hatalar)}")
    for h in result.hatalar:
        p(f"  ! {h.kaynak}: '{h.deger}' okunamadı ({h.hata}) — {h.konu}")
    for s, e in result.sekme_hatalari.items():
        p(f"  ! {s} sekmesi okunamadı: {e}")
    if result.atlanan_sekmeler:
        p(f"  - config'te olmayan, atlanan sekmeler: {', '.join(result.atlanan_sekmeler)}")
    if result.bos_sekmeler:
        p(f"  - boş sekmeler: {', '.join(result.bos_sekmeler)}")
    for bc, hucre, metin in result.notlar:
        p(f"  ? işlenmeyen not {hucre}: \"{metin}\" (oturum mu, bilgi mi? gerekiyorsa uygulamadan ekleyin)")
    for ham, tam in sorted(result.isim_eslemeleri.items()):
        p(f"  = '{ham}' → '{tam}' olarak eşlendi")
    sayac = Counter(u for o in result.oturumlar for u in o.uyarilar)
    if sayac:
        p("  Uyarılar: " + ", ".join(f"{k} {v}" for k, v in sayac.most_common()))
    for o in result.oturumlar:
        if GUN_UYUSMAZLIGI in o.uyarilar:
            p(f"  ! {o.kaynak}: {o.tarih} {o.gun}, ama bulunduğu sütun başka bir güne ait ({o.konu[:40]})")
    belirsiz = sorted({a.ad for o in result.oturumlar for a in o.anlaticilar if len(a.ad.split()) == 1})
    if belirsiz:
        p(f"  ? yalnızca ilk adla yazılmış, kim olduğu çözülemeyen eğitmenler: {', '.join(belirsiz)} "
          "(kisi_aliaslari tablosuna tam adlarını ekleyin)")
    if plan is None:
        return
    o = plan.ozet()
    p(f"\nYeni: {o['yeni']}   Güncellenen: {o['guncellenen']}   Excel'den kalkan: {o['kalkan']}   "
      f"Geri gelen: {o['geri_gelen']}   Değişmeyen: {o['ayni']}")
    for b in plan.yeni_bootcamplar:
        p(f"  + yeni bootcamp oluşturulacak: {b}")
    for ot, d in plan.guncellenen:
        alanlar = ", ".join(f"{k}: {v[0]} → {v[1]}" for k, v in d.alanlar.items() if k != "kaynak_hucre")
        if alanlar:
            p(f"  ~ {d.bootcamp} {d.tarih} {d.konu[:40]}: {alanlar}")
    for k in plan.kalkan:
        p(f"  - Excel'den kalktı ({k['durum']}): {k['bootcamp']} {k['tarih']} {k['konu'][:40]}")
    for ad, hucreler in sorted(plan.eslesmeyen_egitmenler.items()):
        p(f"  ? eşlenemeyen eğitmen '{ad}' ({len(hucreler)} oturum, örn. {hucreler[0]}): "
          "kişiyi ekleyin ya da alias tanımlayın")
    for bc, (eski, yeni) in plan.sapmalar.items():
        p(f"  ! SAPMA {bc}: {eski} → {yeni} oturum (%{SAPMA_YUZDE}'den fazla). Sekme yapısı değişmiş olabilir.")


SAPMA_YUZDE = 20


def cmd_ice_aktar(args) -> int:
    config = load_config(args.config)
    if args.sadece_oku:
        result = parse_workbook(args.dosya, config)
        _yaz_rapor(result, None)
        return 0
    with _conn() as conn:
        result = parse_workbook(args.dosya, config, extra_aliases=db_aliases(conn))
        plan = plan_olustur(conn, result)
        _yaz_rapor(result, plan)
        if args.json:
            Path(args.json).write_text(json.dumps(plan.ozet(), ensure_ascii=False, indent=2, default=str))
        if not args.apply:
            print("\nÖnizleme. Yazmak için --apply ekleyin.")
            return 0
        if plan.sapmalar and not args.sapma_onay:
            print("\nSapma var; kontrol ettiyseniz --sapma-onay ile tekrar çalıştırın. Hiçbir şey yazılmadı.")
            return 2
        uygula(conn, result, plan, Path(args.dosya).name, onaylayan=os.environ.get("USER"))
        conn.commit()
        print("\nUygulandı.")
    return 0


def cmd_kisiler(args) -> int:
    """CSV sütunları: ad, eposta, rol (egitmen|yonetici), saat_dilimi, ana_egitmen (kısa kodlar, ; ile)."""
    with open(args.dosya, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    with _conn() as conn:
        q = conn.execute
        for r in rows:
            q("""insert into kisiler (ad, eposta, rol, saat_dilimi) values (%s, %s, %s, %s)
                 on conflict (lower(eposta)) do update
                   set ad = excluded.ad, rol = excluded.rol, saat_dilimi = excluded.saat_dilimi""",
              (r["ad"].strip(), r["eposta"].strip(), (r.get("rol") or "egitmen").strip(),
               (r.get("saat_dilimi") or "Europe/Istanbul").strip()))
            for kod in filter(None, (x.strip() for x in (r.get("ana_egitmen") or "").split(";"))):
                q("insert into bootcamp (ad, kisa_kod) values (%s, %s) on conflict do nothing", (kod, kod))
                q("""insert into bootcamp_yetkilileri (bootcamp_id, kisi_id)
                     select b.id, k.id from bootcamp b, kisiler k
                     where b.kisa_kod = %s and lower(k.eposta) = lower(%s) on conflict do nothing""",
                  (kod, r["eposta"].strip()))
        print(f"{len(rows)} kişi işlendi.")
        if not args.apply:
            conn.rollback()
            print("Önizleme. Yazmak için --apply ekleyin.")
            return 0
        conn.commit()
        print("Uygulandı.")
    _giris_hesaplari_ac([r["eposta"].strip() for r in rows])
    return 0


def _giris_hesaplari_ac(epostalar: list[str]) -> None:
    """Kayıt kapalı olduğu için her eğitmene Supabase Auth hesabı yönetici açar (Admin API).
    SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı değilse atlanır."""
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok: giriş hesapları açılmadı.")
        return
    acilan = 0
    for e in epostalar:
        req = urllib.request.Request(
            f"{url.rstrip('/')}/auth/v1/admin/users", method="POST",
            data=json.dumps({"email": e, "email_confirm": True}).encode(),
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=20)
            acilan += 1
        except urllib.error.HTTPError as err:
            if err.code != 422:  # 422 = zaten kayıtlı
                print(f"  ! {e}: giriş hesabı açılamadı ({err.code})")
    print(f"{acilan} yeni giriş hesabı açıldı.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="mentormap")
    sub = ap.add_subparsers(dest="komut", required=True)
    a = sub.add_parser("ice-aktar", help="Excel programını içe aktar")
    a.add_argument("dosya")
    a.add_argument("--config", default=str(HERE / "config.yaml"))
    a.add_argument("--apply", action="store_true", help="farkları veritabanına yaz")
    a.add_argument("--sapma-onay", action="store_true", help="oturum sayısı sapmasını onayla")
    a.add_argument("--sadece-oku", action="store_true", help="veritabanına bağlanmadan sadece Excel'i oku")
    a.add_argument("--json", help="özet raporu bu dosyaya yaz")
    a.set_defaults(func=cmd_ice_aktar)
    k = sub.add_parser("kisiler", help="eğitmen listesini CSV'den yükle")
    k.add_argument("dosya")
    k.add_argument("--apply", action="store_true")
    k.set_defaults(func=cmd_kisiler)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
