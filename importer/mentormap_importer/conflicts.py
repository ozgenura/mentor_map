"""Çakışma tespiti: aynı eğitmen, aynı gün, saat aralıkları kesişiyorsa KESIN; saatlerden biri
bilinmiyorsa OLASI. Arka arkaya (biri bitince öteki başlar) çakışma sayılmaz."""

from itertools import combinations

from .dates import to_minutes
from .model import Cakisma


def find_conflicts(rows: list[dict]) -> list[Cakisma]:
    by: dict[tuple, list[dict]] = {}
    for r in rows:
        if r["mentor"]:
            by.setdefault((r["mentor"], r["tarih"]), []).append(r)
    out = []
    for (mentor, tarih), lst in sorted(by.items(), key=lambda x: (x[0][1], x[0][0])):
        for a, b in combinations(lst, 2):
            if a["baslangic"] and b["baslangic"]:
                a0, a1 = to_minutes(a["baslangic"]), to_minutes(a["bitis"])
                b0, b1 = to_minutes(b["baslangic"]), to_minutes(b["bitis"])
                if not (a0 < b1 and b0 < a1):
                    continue
                tip = "KESIN"
            else:
                tip = "OLASI"
            out.append(Cakisma(mentor, tarih, tip, a["id"], b["id"]))
    return out
