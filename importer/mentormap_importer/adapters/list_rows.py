"""list_rows (yeni DS, haftalık liste): her satır bir oturum, tek tarih sütunu.

config: header_row (varsayılan 2), date_col, topic_col, mentor_col (opsiyonel), label_col (opsiyonel).
Gün adı tarihten hesaplanır; saat config'teki default_hours'tan gelir. Konusu "ARA" olan satır atlanır.
"""

from ..model import GUN
from ..sheet import col_index
from ..textutil import collapse, slug
from .base import Context


def parse(ctx: Context) -> None:
    sh, conf = ctx.sheet, ctx.conf
    for anahtar in ("date_col", "topic_col"):
        if anahtar not in conf:
            raise ValueError(f"{ctx.bootcamp}: list_rows için config'te {anahtar} gerekli")
    h = int(conf.get("header_row", 2))
    dc, tc = col_index(conf["date_col"]), col_index(conf["topic_col"])
    mc = col_index(conf["mentor_col"]) if conf.get("mentor_col") else None
    lc = col_index(conf["label_col"]) if conf.get("label_col") else None

    for r in range(h + 1, sh.max_row + 1):
        konu, tarih = sh.value(r, tc), sh.value(r, dc)
        if tarih in (None, "") or ctx.is_skip(konu):
            continue
        try:
            gun = GUN[tarih.weekday()]  # gerçek tarih hücresi
        except AttributeError:
            gun = None
        ctx.add(date_value=tarih, date_coord=sh.coord(r, dc), slot=slug(gun) if gun else "liste",
                hours=ctx.default_hours(), raw_mentor=sh.value(r, mc) if mc else None,
                row_label=collapse(sh.text(r, lc)) if lc else "", konu=konu, default_tur="Ders")
