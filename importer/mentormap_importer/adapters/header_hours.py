"""header_hours (İK, DS): gün sütunları başlık satırında, saatler başlığın üstünde.

Her gün sütunu bir blok başlatır. Bloktaki 'Eğitmen' başlıklı sütun eğitmendir; başka bir sütun
varsa o günün konusudur ve blok 'Uygulama' sayılır. Konu sütunu olmayan blok satırın genel konu
sütununu (topic_col, varsayılan B) kullanır ve 'Ders' sayılır.
"""

from ..dates import parse_time_range
from ..sheet import col_index
from ..textutil import collapse, slug, trlower
from .base import Context


def parse(ctx: Context) -> None:
    sh = ctx.sheet
    h = sh.find_header_row()
    days = sh.day_columns(h)
    label_col = col_index(ctx.conf.get("label_col", "A"))
    topic_col = col_index(ctx.conf.get("topic_col", "B"))

    blocks = []
    for i, (c, gun) in enumerate(days):
        end = days[i + 1][0] if i + 1 < len(days) else sh.max_col + 1
        mentor_col = own_topic = None
        for cc in range(c + 1, end):
            if sh.header_text(h, cc) == "eğitmen":
                mentor_col = mentor_col or cc
            elif own_topic is None:
                own_topic = cc
        hours = None
        for r in range(1, h):
            hours = parse_time_range(sh.resolved(r, c))
            if hours:
                break
        blocks.append(dict(date_col=c, slot=slug(gun), gun=gun, mentor_col=mentor_col,
                           topic_col=own_topic or topic_col,
                           default_tur="Uygulama" if own_topic else "Ders",
                           hours=hours or ctx.default_hours()))

    for r in range(h + 1, sh.max_row + 1):
        label = collapse(sh.text(r, label_col))
        has_date = any(sh.value(r, b["date_col"]) not in (None, "") for b in blocks)
        if trlower(label) == "ara" and not has_date:
            continue
        for b in blocks:
            konu = sh.value(r, b["topic_col"])
            if ctx.is_skip(konu):
                continue
            ctx.add(date_value=sh.value(r, b["date_col"]), date_coord=sh.coord(r, b["date_col"]),
                    slot=b["slot"], hours=b["hours"],
                    raw_mentor=sh.value(r, b["mentor_col"]) if b["mentor_col"] else None,
                    row_label=label, konu=konu, default_tur=b["default_tur"], written_gun=b["gun"])
