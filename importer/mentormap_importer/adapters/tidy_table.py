"""tidy_table (BIO): her satır bir oturum, sütunlar başlık adıyla eşleşir."""

from ..dates import parse_time_range
from ..textutil import collapse, slug, trlower
from .base import Context

COLUMNS = {"tarih": "tarih", "gün": "gun", "aşama": "asama", "konu": "konu", "saat": "saat",
           "eğitmen": "egitmen"}


def parse(ctx: Context) -> None:
    sh = ctx.sheet
    cols = {}
    for c in range(1, sh.max_col + 1):
        key = COLUMNS.get(trlower(collapse(sh.text(1, c))))
        if key:
            cols[key] = c
    missing = {"tarih", "konu"} - cols.keys()
    if missing:
        raise ValueError(f"{sh.title}: eksik sütun {sorted(missing)}")

    def get(r, key):
        return sh.value(r, cols[key]) if key in cols else None

    for r in range(2, sh.max_row + 1):
        if get(r, "tarih") in (None, ""):
            continue
        gun = collapse(str(get(r, "gun") or "")) or None
        hours = parse_time_range(get(r, "saat")) or ctx.default_hours()
        ctx.add(date_value=get(r, "tarih"), date_coord=sh.coord(r, cols["tarih"]),
                slot=slug(gun) if gun else "gun", hours=hours, raw_mentor=get(r, "egitmen"),
                row_label=collapse(str(get(r, "asama") or "")), konu=get(r, "konu"),
                default_tur="Ders", written_gun=gun)
