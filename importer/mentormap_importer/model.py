"""İçe aktarıcının çıktı modeli.

Bir Oturum = bir bootcamp'te, bir tarihte, bir slottaki görev. Anlatıcılar bir liste;
veritabanında oturum_anlaticilari tablosuna, testte ise eğitmen başına bir satıra açılır.
"""

import datetime as dt
from dataclasses import dataclass, field

from .textutil import slug

GUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]

# Uyarı kodları (operasyon görür, teste girer)
EGITMEN_YOK = "EGITMEN_YOK"
SAAT_YOK = "SAAT_YOK"
GUN_UYUSMAZLIGI = "GUN_UYUSMAZLIGI"
GECERSIZ_TARIH = "GECERSIZ_TARIH"
TATIL_GUNU = "TATIL_GUNU"            # oturum resmi tatile denk geliyor
EGITMEN_BELIRSIZ = "EGITMEN_BELIRSIZ"  # yalnızca ilk adla yazılmış, kim olduğu çözülemedi

# Parser notları (gösterilmez, test edilmez)
ISIM_NORMALIZE = "ISIM_NORMALIZE"
COKLU_EGITMEN = "COKLU_EGITMEN"
EGITMEN_BASLIKTAN = "EGITMEN_BASLIKTAN"
EGITMEN_KONU_METNINDEN = "EGITMEN_KONU_METNINDEN"
YIL_DEVRI = "YIL_DEVRI"
ISIM_TAMAMLANDI = "ISIM_TAMAMLANDI"    # "Arda" -> "Arda Yüce" (çalışma kitabındaki tam addan)


@dataclass
class Anlatici:
    ad: str
    ham: str


@dataclass
class Oturum:
    bootcamp: str
    tarih: dt.date
    slot: str
    baslangic: str | None
    bitis: str | None
    anlaticilar: list[Anlatici]
    tur: str
    konu: str
    kaynak: str
    uyarilar: list[str] = field(default_factory=list)
    notlar: list[str] = field(default_factory=list)

    @property
    def gun(self) -> str:
        return GUN[self.tarih.weekday()]

    @property
    def dis_anahtar(self) -> str:
        return f"{slug(self.bootcamp)}-{self.tarih.isoformat()}-{self.slot}"

    def satirlar(self) -> list[dict]:
        """Cevap anahtarındaki 'Oturumlar' biçimi: eğitmen başına bir satır."""
        kisiler = self.anlaticilar or [Anlatici("", "")]
        rows = []
        for a in kisiler:
            notes = list(self.notlar)
            if a.ad and a.ham != a.ad:
                notes.append(ISIM_NORMALIZE)
            if len(kisiler) > 1:
                notes.append(COKLU_EGITMEN)
            if YIL_DEVRI in notes:  # sona taşı (generator sırası)
                notes.remove(YIL_DEVRI)
                notes.append(YIL_DEVRI)
            rows.append(dict(
                id=f"{self.dis_anahtar}-{slug(a.ad) or 'atanmamis'}",
                bootcamp=self.bootcamp, tarih=self.tarih, gun=self.gun, slot=self.slot,
                baslangic=self.baslangic, bitis=self.bitis, mentor=a.ad or None,
                oturum_turu=self.tur, konu=self.konu, kaynak=self.kaynak,
                uyarilar=";".join(self.uyarilar) or None,
                parser_notlari=";".join(notes) or None,
            ))
        return rows


@dataclass
class HataliKayit:
    bootcamp: str
    kaynak: str
    deger: str
    konu: str
    mentor: str
    hata: str = GECERSIZ_TARIH


@dataclass
class Cakisma:
    mentor: str
    tarih: dt.date
    tip: str  # KESIN | OLASI
    oturum_1: str
    oturum_2: str
