"""Adaptörlerin ortak oturum oluşturucusu."""

import re
from dataclasses import dataclass, field

from ..dates import InvalidDate, YearTracker, parse_date
from ..model import (EGITMEN_KONU_METNINDEN, EGITMEN_YOK, GUN, GUN_UYUSMAZLIGI, SAAT_YOK, TATIL_GUNU,
                     YIL_DEVRI, Anlatici, HataliKayit, Oturum)
from ..session_types import session_type
from ..sheet import SheetView
from ..textutil import collapse, normalize_name, split_mentors, trlower

KONUK = re.compile(r"\s*\(\s*konuk\s*:\s*([^)]+)\)", re.IGNORECASE)

# Eğitmen hücresinde kişi değil yer tutucu olan değerler (trlower ile karşılaştırılır)
VARSAYILAN_YER_TUTUCULAR = ["-", "–", "—", "mentor", "tüm ekip", "tbd", "?", "belirlenecek"]


@dataclass
class Context:
    bootcamp: str
    sheet: SheetView
    conf: dict
    aliases: dict[str, str]
    type_rules: list
    skip_cells: set[str]                 # trlower + collapse edilmiş değerler
    yer_tutucular: set[str] = field(default_factory=lambda: set(VARSAYILAN_YER_TUTUCULAR))
    tatiller: dict = field(default_factory=dict)  # date -> ad
    years: YearTracker = None
    oturumlar: list[Oturum] = field(default_factory=list)
    hatalar: list[HataliKayit] = field(default_factory=list)
    notlar: list[tuple[str, str]] = field(default_factory=list)  # işlenmemiş serbest notlar (hücre, metin)

    def __post_init__(self):
        self.years = YearTracker(self.conf.get("year_start"))

    def default_hours(self, start: str | None = None) -> tuple[str, str] | None:
        """Config'teki varsayılan saatler. start verilirse (başlıktan okunan) yalnızca bitiş config'ten gelir."""
        h = self.conf.get("default_hours")
        if start:
            if h and h.get("end"):
                return start, str(h["end"])
            return None
        if not h:
            return None
        return str(h["start"]), str(h["end"])

    def is_skip(self, value) -> bool:
        return value is not None and trlower(collapse(str(value))) in self.skip_cells

    def not_ekle(self, coord: str, value) -> None:
        if value not in (None, "") and str(value).strip():
            self.notlar.append((coord, collapse(str(value))))

    def add(self, *, date_value, date_coord: str, slot: str, hours: tuple[str, str] | None,
            raw_mentor, row_label: str, konu, default_tur: str, notes=(),
            written_gun: str | None = None, default_mentor: str | None = None, tur: str | None = None):
        konu = collapse("" if konu is None else str(konu))
        notes = list(notes)

        parts = [p for p in split_mentors(raw_mentor) if trlower(collapse(p)) not in self.yer_tutucular]
        m = KONUK.search(konu)
        if m:
            parts = [m.group(1)]
            konu = KONUK.sub("", konu).strip()
            notes = [EGITMEN_KONU_METNINDEN]
        elif not parts and default_mentor:
            parts = [default_mentor]

        anlaticilar = [Anlatici(normalize_name(p, self.aliases), p) for p in parts]
        anlaticilar = [a for a in anlaticilar if a.ad]

        try:
            parsed = parse_date(date_value, self.years)
        except InvalidDate:
            self.hatalar.append(HataliKayit(
                bootcamp=self.bootcamp, kaynak=date_coord, deger=str(date_value), konu=konu,
                mentor=", ".join(a.ad for a in anlaticilar)))
            return
        if parsed is None:
            return
        tarih, rolled = parsed
        if rolled:
            notes.append(YIL_DEVRI)

        uyarilar = []
        if not anlaticilar:
            uyarilar.append(EGITMEN_YOK)
        if not hours:
            uyarilar.append(SAAT_YOK)
        if written_gun and written_gun != GUN[tarih.weekday()]:
            uyarilar.append(GUN_UYUSMAZLIGI)
        if tarih in self.tatiller:
            uyarilar.append(TATIL_GUNU)

        self.oturumlar.append(Oturum(
            bootcamp=self.bootcamp, tarih=tarih, slot=slot,
            baslangic=hours[0] if hours else None, bitis=hours[1] if hours else None,
            anlaticilar=anlaticilar,
            tur=tur or session_type(row_label, konu, default_tur, self.type_rules),
            konu=konu, kaynak=date_coord, uyarilar=uyarilar, notlar=notes))
