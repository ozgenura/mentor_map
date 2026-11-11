"""Tarih ve saat aralığı ayrıştırma.

Kabul edilen tarih biçimleri: Excel tarih hücresi, '22 Eyl', '12 Ekim', '23 kasım',
'12 October 2026', '04.11.2026'. Yılsız tarihlere YearTracker yıl atar.
"""

import datetime as dt
import re

from .textutil import trlower

MONTHS = {
    # Türkçe tam ve kısaltma
    "ocak": 1, "oca": 1, "şubat": 2, "şub": 2, "mart": 3, "mar": 3, "nisan": 4, "nis": 4,
    "mayıs": 5, "may": 5, "haziran": 6, "haz": 6, "temmuz": 7, "tem": 7, "ağustos": 8, "ağu": 8,
    "eylül": 9, "eyl": 9, "ekim": 10, "eki": 10, "kasım": 11, "kas": 11, "aralık": 12, "ara": 12,
    # İngilizce
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "april": 4, "apr": 4,
    "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8, "september": 9, "sep": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}


class InvalidDate(ValueError):
    pass


class YearTracker:
    """Yılsız tarihler için: ilk görülen ay başlangıç kabul edilir, ondan küçük ay ertesi yıldır."""

    def __init__(self, year_start: int | None):
        self.year_start = year_start
        self.first_month: int | None = None

    def resolve(self, month: int) -> tuple[int, bool]:
        if self.year_start is None:
            raise InvalidDate("yıl yok ve year_start tanımlı değil")
        if self.first_month is None:
            self.first_month = month
        if month < self.first_month:
            return self.year_start + 1, True
        return self.year_start, False


def parse_date(value, years: YearTracker) -> tuple[dt.date, bool] | None:
    """(tarih, yil_devri) döner. Boş hücre -> None. Okunamayan -> InvalidDate."""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date(), False
    if isinstance(value, dt.date):
        return value, False
    s = str(value).strip()
    if not s:
        return None
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", s)
    if m:
        d, mo, y = map(int, m.groups())
        return _make(y, mo, d, s), False
    m = re.fullmatch(r"(\d{1,2})\s+([^\W\d_]+)\.?(?:\s+(\d{4}))?", s)
    if m:
        d = int(m.group(1))
        name = trlower(m.group(2))
        if name not in MONTHS:
            raise InvalidDate(s)
        mo = MONTHS[name]
        if m.group(3):
            return _make(int(m.group(3)), mo, d, s), False
        y, rolled = years.resolve(mo)
        return _make(y, mo, d, s), rolled
    raise InvalidDate(s)


def _make(y, mo, d, raw) -> dt.date:
    try:
        return dt.date(y, mo, d)
    except ValueError as e:
        raise InvalidDate(raw) from e


TIME_RANGE = re.compile(r"(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})")


def parse_time_range(value) -> tuple[str, str] | None:
    """'20:00–22:00', '20.00-22.30', 'TR 20:30 - 24:00' -> ('20:00', '22:00')."""
    if value is None:
        return None
    m = TIME_RANGE.search(str(value))
    if not m:
        return None
    h1, m1, h2, m2 = m.groups()
    return f"{int(h1):02d}:{m1}", f"{int(h2):02d}:{m2}"


def to_minutes(t: str) -> int:
    h, m = map(int, t.split(":"))
    return h * 60 + m


TIME_SINGLE = re.compile(r"(?<![\d:.])(\d{1,2})[:.](\d{2})(?![\d])")


def parse_time_start(value) -> str | None:
    """'Pazartesi-TR 20:30' gibi tek saat yazılmış başlıktan başlangıç saati."""
    if value is None or parse_time_range(value):
        return None
    m = TIME_SINGLE.search(str(value))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None
