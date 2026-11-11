"""multi_rows (DA): satır başına bir hafta, haftada birden fazla oturum türü, tek tarih sütunu.

config örneği:
  header_row: 3
  date_col: A          # ana oturumun tarihi
  label_col: B         # Kick-Off / Ders / Workshop / Sunum
  topic_col: C
  sessions:
    - {col: E, tur: Ders, ana: true}                         # ana oturum: tarih sütunundaki gün
    - {col: F, tur: Mentor Görüşmesi, gun: Pazartesi}        # aynı haftanın pazartesisi
    - {col: G, tur: Uygulama, gun: Salı, konu_on_ek: Güçlendirme}

Ana oturum, tarih ve konu varsa her zaman oluşur (eğitmen hücresi boş olsa bile). Diğer oturumlar
yalnızca kendi hücresi doluysa oluşur; hücrede yer tutucu ("Mentor") varsa eğitmensiz oluşur.
Hücrede tarih içeren serbest metin ("10 Ağustos: İlk Tanışma") oturum sayılmaz, not olarak raporlanır.
Haftanın günü, ana tarihin bulunduğu haftanın (pazartesi başlangıçlı) o günüdür: bu bir varsayımdır.
"""

import datetime as dt
import re

from ..dates import MONTHS
from ..model import GUN
from ..sheet import col_index
from ..textutil import collapse, slug, trlower
from .base import Context

TARIHLI_NOT = re.compile(r"\d{1,2}\s+(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\b", re.IGNORECASE)


def parse(ctx: Context) -> None:
    sh, conf = ctx.sheet, ctx.conf
    h = int(conf.get("header_row", 2))
    dc, tc = col_index(conf["date_col"]), col_index(conf["topic_col"])
    lc = col_index(conf["label_col"]) if conf.get("label_col") else None
    oturumlar = conf.get("sessions") or []
    if not any(s.get("ana") for s in oturumlar):
        raise ValueError(f"{ctx.bootcamp}: multi_rows için bir ana oturum (ana: true) gerekli")

    for r in range(h + 1, sh.max_row + 1):
        tarih, konu = sh.value(r, dc), sh.value(r, tc)
        if not isinstance(tarih, (dt.date, dt.datetime)) or ctx.is_skip(konu):
            if tarih not in (None, "") and not isinstance(tarih, (dt.date, dt.datetime)):
                ctx.add(date_value=tarih, date_coord=sh.coord(r, dc), slot="ana", hours=None, raw_mentor=None,
                        row_label="", konu=konu, default_tur="Ders")  # okunamayan tarih: hata listesine düşer
            continue
        tarih = tarih.date() if isinstance(tarih, dt.datetime) else tarih
        etiket = collapse(sh.text(r, lc)) if lc else ""
        pazartesi = tarih - dt.timedelta(days=tarih.weekday())
        for s in oturumlar:
            c = col_index(s["col"])
            hucre = sh.value(r, c)
            if s.get("ana"):
                gun_tarih = tarih
                if not konu:
                    continue
            else:
                if hucre in (None, ""):
                    continue
                if TARIHLI_NOT.search(trlower(str(hucre))):
                    ctx.not_ekle(sh.coord(r, c), hucre)
                    continue
                gun_tarih = pazartesi + dt.timedelta(days=GUN.index(s["gun"]))
            on_ek = s.get("konu_on_ek")
            ctx.add(date_value=gun_tarih, date_coord=sh.coord(r, c if not s.get("ana") else dc),
                    slot=slug(s.get("gun") or s["tur"]) if not s.get("ana") else "ana",
                    hours=ctx.default_hours(), raw_mentor=hucre, row_label=etiket if s.get("ana") else "",
                    konu=f"{on_ek}: {collapse(str(konu or ''))}" if on_ek else konu,
                    default_tur=s["tur"], tur=None if s.get("ana") else s["tur"])
