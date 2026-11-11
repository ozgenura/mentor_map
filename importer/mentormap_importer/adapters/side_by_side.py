"""side_by_side (Fabric, GeoBA, Vibe, SQL) ve weekly (Quantum).

Başlık satırında gün adları vardır; her gün sütunu bir blok başlatır.
- Konu: gün sütununun solundaki ilk gün-olmayan sütun. SQL'deki gibi iki gün yan yana ise
  ikisi de satırın ortak konu sütununu (A) kullanır.
- Eğitmen: her günün sağında kendi 'Eğitmen' sütunu varsa (Fabric dummy) o blok için; sekmede tek bir
  'Eğitmen' sütunu varsa (Vibe'daki F) satırdaki bütün günler için.
- Saat: başlıktaki aralık ya da tek saat ("Pazartesi-TR 20:30"); yoksa config'teki default_hours.
- Kullanılmayan sütunlardaki dolu hücreler serbest not olarak raporlanır (Fabric E7 gibi).
weekly, aynı yapıya sekme başlığından gelen varsayılan eğitmeni (default_mentor) ekler; konu
metnindeki '(Konuk: …)' kalıbı varsayılanı ezer.
"""

from ..dates import parse_time_range, parse_time_start
from ..model import EGITMEN_BASLIKTAN
from ..sheet import col_index
from ..textutil import collapse, slug
from .base import Context


def parse(ctx: Context, default_mentor: str | None = None) -> None:
    sh = ctx.sheet
    h = sh.find_header_row()
    days = sh.day_columns(h)
    day_cols = {c for c, _ in days}
    egitmen_cols = [c for c in range(1, sh.max_col + 1) if sh.header_text(h, c) == "eğitmen"]
    label_col = col_index(ctx.conf["label_col"]) if ctx.conf.get("label_col") else None

    blocks = []
    for c, gun in days:
        topic_col = next((cc for cc in range(c - 1, 0, -1) if cc not in day_cols), None)
        own = c + 1 if c + 1 in egitmen_cols and len(egitmen_cols) > 1 else None
        # Sekmede tek 'Eğitmen' sütunu varsa (Vibe) satırdaki bütün günlere aittir
        mentor_col = own or (egitmen_cols[0] if len(egitmen_cols) == 1 else None)
        baslik = sh.resolved(h, c)
        hours = parse_time_range(baslik) or ctx.default_hours(parse_time_start(baslik)) or ctx.default_hours()
        blocks.append(dict(date_col=c, topic_col=topic_col, mentor_col=mentor_col, slot=slug(gun), gun=gun, hours=hours))

    konu_cols = {b["topic_col"] for b in blocks if b["topic_col"]}
    if label_col is None and 1 not in konu_cols | day_cols:
        label_col = 1  # A sütunu konu değilse satır etiketidir ("Kick-Off", "1.Hafta")
    ilk_konu = min(konu_cols, default=1)
    kullanilan = {label_col, *range(1, ilk_konu)} | {b["date_col"] for b in blocks} | konu_cols | \
                 {b["mentor_col"] for b in blocks}
    notes = [EGITMEN_BASLIKTAN] if default_mentor else []

    for r in range(h + 1, sh.max_row + 1):
        label = collapse(sh.text(r, label_col)) if label_col else ""
        for b in blocks:
            konu = sh.value(r, b["topic_col"]) if b["topic_col"] else None
            if ctx.is_skip(konu):
                continue
            ctx.add(date_value=sh.value(r, b["date_col"]), date_coord=sh.coord(r, b["date_col"]),
                    slot=b["slot"], hours=b["hours"],
                    raw_mentor=sh.value(r, b["mentor_col"]) if b["mentor_col"] else None,
                    row_label=label, konu=konu, default_tur="Ders", notes=notes,
                    written_gun=b["gun"], default_mentor=default_mentor)
        for c, v in sh.row_values(r):
            if c not in kullanilan:
                ctx.not_ekle(sh.coord(r, c), v)


def parse_weekly(ctx: Context) -> None:
    mentor = ctx.conf.get("default_mentor")
    if not mentor:
        raise ValueError(f"{ctx.bootcamp}: weekly adaptörü default_mentor ister")
    parse(ctx, default_mentor=mentor)
