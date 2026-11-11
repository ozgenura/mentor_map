"""Excel içe aktarımının veritabanı senkronu.

Paralel dönem kuralları (dokümandaki 'Excel ile paralel dönem' bölümü):
- Excel'in sahibi olduğu alanlar: tarih, saat, anlatıcılar, konu (tür yalnızca konu değişince).
- Uygulamanın sahibi olduğu alanlar hiç yazılmaz: durum/iptal, açıklama, linkler, not.
- Excel'den kalkan oturum silinmez; excelden_kalkti işaretlenir, karar yöneticinindir.
- Her çalışma önce plan üretir; apply aynı planı tek transaction'da uygular.
"""

import datetime as dt
from dataclasses import dataclass, field

import psycopg
from psycopg.rows import dict_row

from .model import Oturum
from .parse import ParseResult

ESLESMEDI = "EGITMEN_ESLESMEDI"
SAPMA_ESIGI = 0.20


@dataclass
class Degisiklik:
    dis_anahtar: str
    bootcamp: str
    tarih: dt.date
    konu: str
    alanlar: dict = field(default_factory=dict)   # alan -> (eski, yeni)


@dataclass
class Plan:
    yeni: list[Oturum] = field(default_factory=list)
    guncellenen: list[tuple[Oturum, Degisiklik]] = field(default_factory=list)
    kalkan: list[dict] = field(default_factory=list)
    geri_gelen: list[str] = field(default_factory=list)
    eslesmeyen_egitmenler: dict[str, list[str]] = field(default_factory=dict)  # ad -> hücreler
    yeni_bootcamplar: list[str] = field(default_factory=list)
    sapmalar: dict[str, tuple[int, int]] = field(default_factory=dict)         # bootcamp -> (eski, yeni)
    ayni: int = 0
    # dis_anahtar -> (Excel sırasıyla eşlenen kişi id'leri, veritabanına yazılacak uyarılar)
    eslesme: dict[str, tuple[list, list[str]]] = field(default_factory=dict)

    @property
    def fark_var(self) -> bool:
        return bool(self.yeni or self.guncellenen or self.kalkan or self.geri_gelen)

    def ozet(self) -> dict:
        return {
            "yeni": len(self.yeni), "guncellenen": len(self.guncellenen), "kalkan": len(self.kalkan),
            "geri_gelen": len(self.geri_gelen), "ayni": self.ayni,
            "eslesmeyen_egitmenler": sorted(self.eslesmeyen_egitmenler),
            "yeni_bootcamplar": self.yeni_bootcamplar,
            "sapmalar": {k: list(v) for k, v in self.sapmalar.items()},
        }


def _hhmm(ts, tarih: dt.date) -> str | None:
    """timestamptz -> TR saat 'HH:MM'; ertesi gün 00:00 ise '24:00'."""
    if ts is None:
        return None
    local = ts.astimezone(dt.timezone(dt.timedelta(hours=3)))
    if local.date() > tarih and local.hour == 0 and local.minute == 0:
        return "24:00"
    return local.strftime("%H:%M")


def db_aliases(conn) -> dict[str, str]:
    rows = conn.execute("select a.ham_ad, k.ad from kisi_aliaslari a join kisiler k on k.id = a.kisi_id").fetchall()
    return dict(rows)


def plan_olustur(conn, result: ParseResult) -> Plan:
    plan = Plan()
    cur = conn.cursor(row_factory=dict_row)
    kisiler = {r["ad"]: r["id"] for r in cur.execute("select id, ad from kisiler")}
    bootcamplar = {r["kisa_kod"]: r["id"] for r in cur.execute("select id, kisa_kod from bootcamp")}
    mevcut = {r["dis_anahtar"]: r for r in cur.execute("""
        select o.id, o.dis_anahtar, b.kisa_kod as bootcamp, o.tarih, o.baslangic, o.bitis, o.konu, o.tur,
               o.uyarilar, o.kaynak_hucre, o.durum, o.excelden_kalkti,
               coalesce(array_agg(a.kisi_id) filter (where a.kisi_id is not null), '{}') as kisiler
        from oturumlar o join bootcamp b on b.id = o.bootcamp_id
        left join oturum_anlaticilari a on a.oturum_id = o.id
        where o.kaynak = 'excel'
        group by o.id, b.kisa_kod""")}

    gelen_bootcamplar = {o.bootcamp for o in result.oturumlar}
    plan.yeni_bootcamplar = sorted(gelen_bootcamplar - bootcamplar.keys())

    for o in result.oturumlar:
        for a in o.anlaticilar:
            if a.ad not in kisiler:
                plan.eslesmeyen_egitmenler.setdefault(a.ad, []).append(o.kaynak)
        sira = list(dict.fromkeys(kisiler[a.ad] for a in o.anlaticilar if a.ad in kisiler))
        kisi_ids = set(sira)
        uyarilar = list(o.uyarilar)
        if any(a.ad not in kisiler for a in o.anlaticilar):
            uyarilar.append(ESLESMEDI)
        plan.eslesme[o.dis_anahtar] = (sira, uyarilar)

        m = mevcut.get(o.dis_anahtar)
        if m is None:
            plan.yeni.append(o)
            continue
        d = Degisiklik(o.dis_anahtar, o.bootcamp, o.tarih, o.konu)
        eski_bas, eski_bit = _hhmm(m["baslangic"], m["tarih"]), _hhmm(m["bitis"], m["tarih"])
        for alan, eski, yeni in [
            ("tarih", m["tarih"], o.tarih), ("baslangic", eski_bas, o.baslangic), ("bitis", eski_bit, o.bitis),
            ("konu", m["konu"], o.konu), ("uyarilar", sorted(m["uyarilar"]), sorted(uyarilar)),
            ("kaynak_hucre", m["kaynak_hucre"], o.kaynak),
            ("anlaticilar", set(m["kisiler"]), kisi_ids),
        ]:
            if eski != yeni:
                d.alanlar[alan] = (eski, yeni)
        if "konu" in d.alanlar and m["tur"] != o.tur:
            d.alanlar["tur"] = (m["tur"], o.tur)
        if m["excelden_kalkti"]:
            plan.geri_gelen.append(o.dis_anahtar)
        if d.alanlar:
            plan.guncellenen.append((o, d))
        else:
            plan.ayni += 1

    gelen_anahtarlar = {o.dis_anahtar for o in result.oturumlar}
    for key, m in mevcut.items():
        if (m["bootcamp"] in gelen_bootcamplar and key not in gelen_anahtarlar
                and not m["excelden_kalkti"]):
            plan.kalkan.append(dict(dis_anahtar=key, bootcamp=m["bootcamp"], tarih=m["tarih"],
                                    konu=m["konu"], durum=m["durum"]))

    for bc in gelen_bootcamplar:
        eski = sum(1 for m in mevcut.values() if m["bootcamp"] == bc and not m["excelden_kalkti"])
        yeni = sum(1 for o in result.oturumlar if o.bootcamp == bc)
        if eski and abs(yeni - eski) / eski > SAPMA_ESIGI:
            plan.sapmalar[bc] = (eski, yeni)
    return plan


def uygula(conn, result: ParseResult, plan: Plan, dosya_adi: str, onaylayan: str | None = None) -> None:
    """Planı tek transaction'da yazar. conn autocommit olmamalı; commit çağırana aittir."""
    q = conn.execute
    q("select set_config('mentormap.islem_kaynagi', 'ice_aktarim', true)")
    for kod in plan.yeni_bootcamplar:
        q("insert into bootcamp (ad, kisa_kod) values (%s, %s)", (kod, kod))
    bootcamplar = dict(q("select kisa_kod, id from bootcamp").fetchall())

    for o in plan.yeni:
        sira, uyarilar = plan.eslesme[o.dis_anahtar]
        oid = q("""insert into oturumlar (bootcamp_id, tarih, baslangic, bitis, slot, tur, konu, kaynak,
                                          dis_anahtar, kaynak_hucre, uyarilar)
                   values (%s, %s, tr_zaman(%s, %s::time), tr_zaman(%s, %s::time), %s, %s, %s, 'excel', %s, %s, %s)
                   returning id""",
                (bootcamplar[o.bootcamp], o.tarih, o.tarih, o.baslangic, o.tarih, o.bitis, o.slot, o.tur,
                 o.konu, o.dis_anahtar, o.kaynak, uyarilar)).fetchone()[0]
        for i, kid in enumerate(sira):
            q("insert into oturum_anlaticilari (oturum_id, kisi_id, rol) values (%s, %s, %s)",
              (oid, kid, "ana" if i == 0 else "yardimci"))

    for o, d in plan.guncellenen:
        sira, uyarilar = plan.eslesme[o.dis_anahtar]
        oid = q("select id from oturumlar where dis_anahtar = %s", (o.dis_anahtar,)).fetchone()[0]
        q("""update oturumlar set tarih = %s, baslangic = tr_zaman(%s, %s::time), bitis = tr_zaman(%s, %s::time),
                    konu = %s, uyarilar = %s, kaynak_hucre = %s, tur = case when %s then %s::oturum_turu else tur end
             where id = %s""",
          (o.tarih, o.tarih, o.baslangic, o.tarih, o.bitis, o.konu, uyarilar, o.kaynak,
           "tur" in d.alanlar, o.tur, oid))
        if "anlaticilar" in d.alanlar:
            eski, yeni = d.alanlar["anlaticilar"]
            for kid in eski - yeni:
                q("delete from oturum_anlaticilari where oturum_id = %s and kisi_id = %s", (oid, kid))
                _bildirim(q, kid, "atamadan_cikarildin", oid, o.tarih)
            for kid in yeni - eski:
                q("insert into oturum_anlaticilari (oturum_id, kisi_id, rol) values (%s, %s, 'yardimci')", (oid, kid))
                _bildirim(q, kid, "atandin", oid, o.tarih)
            q("""update oturum_anlaticilari set rol = case when kisi_id = %s then 'ana'::anlatici_rolu
                                                       else 'yardimci'::anlatici_rolu end
                 where oturum_id = %s and kisi_id is not null""", (sira[0] if sira else None, oid))

    if plan.geri_gelen:
        q("update oturumlar set excelden_kalkti = false where dis_anahtar = any(%s)", (plan.geri_gelen,))
    if plan.kalkan:
        q("update oturumlar set excelden_kalkti = true where dis_anahtar = any(%s)",
          ([k["dis_anahtar"] for k in plan.kalkan],))

    ozet = plan.ozet() | {"hatali_kayit": len(result.hatalar), "atlanan_sekmeler": result.atlanan_sekmeler,
                          "sekme_hatalari": result.sekme_hatalari}
    q("insert into ice_aktarimlar (dosya_adi, ozet, onaylayan) values (%s, %s, %s)",
      (dosya_adi, psycopg.types.json.Jsonb(ozet), onaylayan))


def _bildirim(q, kisi_id, olay, oturum_id, tarih):
    if tarih >= dt.date.today() - dt.timedelta(days=1):
        q("insert into bildirim_kuyrugu (kisi_id, olay, oturum_id) values (%s, %s, %s)", (kisi_id, olay, oturum_id))
