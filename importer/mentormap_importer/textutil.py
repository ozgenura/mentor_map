"""Metin yardımcıları: Türkçe büyük/küçük harf, slug, isim normalizasyonu."""

import re

TR_ASCII = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


def trlower(s: str) -> str:
    return s.replace("İ", "i").replace("I", "ı").lower()


def trupper(s: str) -> str:
    return s.replace("i", "İ").replace("ı", "I").upper()


def slug(s: str) -> str:
    s = s.translate(TR_ASCII).lower()
    out = re.sub(r"[^a-z0-9]+", "-", s)
    return out.strip("-")


def collapse(s: str) -> str:
    return " ".join(s.split())


def normalize_name(raw: str, aliases: dict[str, str]) -> str:
    """Ham ismi temizler. aliases anahtarları trlower + collapse edilmiş ham adlardır."""
    n = collapse(raw)
    if not n:
        return ""
    key = trlower(n)
    if key in aliases:
        return aliases[key]
    return " ".join(trupper(w[:1]) + w[1:] for w in n.split(" "))


def alias_key(raw: str) -> str:
    return trlower(collapse(raw))


MENTOR_AYIRICI = re.compile(r"\s*(?:/|&|,|;|\s-\s|-|\s+ve\s+)\s*")


def split_mentors(raw) -> list[str]:
    """'Elif Şahin / Emre Çelik', 'Arda & Ali', 'Işık-Nehir', 'A, B ve C' -> parçalar. Boş hücre -> [].

    Tek parçalı hücre ham haliyle döner (ISIM_NORMALIZE notu için); isim temizliği normalize_name'dedir.
    """
    if raw is None:
        return []
    s = str(raw)
    if not s.strip():
        return []
    if " / " in s and not re.search(r"[&,;]|\S-\S", s):
        return [p for p in s.split(" / ") if p.strip()]  # dummy ile birebir uyum: ham parça korunur
    parcalar = [p.strip() for p in MENTOR_AYIRICI.split(s) if p.strip()]
    return [s] if len(parcalar) == 1 and parcalar[0] == s.strip() else parcalar
