"""openpyxl çalışma sayfası üzerinde ince bir okuma katmanı."""

import re

from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from .model import GUN
from .textutil import collapse, trlower

GUN_LOWER = {trlower(g): g for g in GUN}
# "Salı", "Pazartesi-TR 20:30", "Perşembe (TR 20:30)" gibi başlıkları tanır
GUN_BASLIK = re.compile(r"^(" + "|".join(GUN_LOWER) + r")(?![a-zçğıöşü])")


class SheetView:
    def __init__(self, ws: Worksheet):
        self.ws = ws
        self.title = ws.title
        self.max_row = ws.max_row
        self.max_col = ws.max_column
        self._merged = list(ws.merged_cells.ranges)

    def value(self, row: int, col: int):
        """Hücrenin kendi değeri. Birleştirilmiş aralıkta yalnızca sol üst hücre dolu döner."""
        return self.ws.cell(row=row, column=col).value

    def resolved(self, row: int, col: int):
        """Birleştirilmiş aralığın içindeyse sol üst hücrenin değeri (başlık okumaları için)."""
        for rng in self._merged:
            if rng.min_row <= row <= rng.max_row and rng.min_col <= col <= rng.max_col:
                return self.ws.cell(row=rng.min_row, column=rng.min_col).value
        return self.value(row, col)

    def text(self, row: int, col: int) -> str:
        v = self.value(row, col)
        return "" if v is None else str(v)

    def coord(self, row: int, col: int) -> str:
        return f"{self.title}!{get_column_letter(col)}{row}"

    def find_header_row(self) -> int:
        """Gün adı (Pazartesi…Pazar) içeren ilk satır."""
        for r in range(1, self.max_row + 1):
            if self.day_columns(r):
                return r
        raise ValueError(f"{self.title}: gün başlığı bulunamadı")

    def day_columns(self, row: int) -> list[tuple[int, str]]:
        out = []
        for c in range(1, self.max_col + 1):
            v = self.value(row, c)
            if isinstance(v, str):
                m = GUN_BASLIK.match(trlower(collapse(v)))
                if m:
                    out.append((c, GUN_LOWER[m.group(1)]))
        return out

    def is_empty(self) -> bool:
        return not any(c.value not in (None, "") for row in self.ws.iter_rows() for c in row)

    def row_values(self, row: int) -> list[tuple[int, object]]:
        return [(c, self.value(row, c)) for c in range(1, self.max_col + 1)
                if self.value(row, c) not in (None, "")]

    def header_text(self, row: int, col: int) -> str:
        return trlower(collapse(self.text(row, col)))


def col_index(letter: str) -> int:
    return column_index_from_string(letter)
