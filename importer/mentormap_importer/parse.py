"""Excel'i açar, her sekmeyi config'teki adaptörle okur, sonuçları birleştirir."""

import datetime as dt
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl
import yaml

from .adapters import ADAPTERS
from .adapters.base import VARSAYILAN_YER_TUTUCULAR, Context
from .conflicts import find_conflicts
from .model import EGITMEN_BELIRSIZ, ISIM_TAMAMLANDI, Cakisma, HataliKayit, Oturum
from .session_types import DEFAULT_RULES
from .sheet import SheetView
from .textutil import alias_key, collapse, slug, trlower


@dataclass
class ParseResult:
    oturumlar: list[Oturum]
    hatalar: list[HataliKayit]
    cakismalar: list[Cakisma]
    atlanan_sekmeler: list[str] = field(default_factory=list)
    sekme_hatalari: dict[str, str] = field(default_factory=dict)
    bos_sekmeler: list[str] = field(default_factory=list)
    notlar: list[tuple[str, str, str]] = field(default_factory=list)   # (bootcamp, hücre, metin)
    isim_eslemeleri: dict[str, str] = field(default_factory=dict)      # "Arda" -> "Arda Yüce"

    def satirlar(self) -> list[dict]:
        return [row for o in self.oturumlar for row in o.satirlar()]


def load_config(path: str | Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse_workbook(path: str | Path, config: dict, extra_aliases: dict[str, str] | None = None) -> ParseResult:
    aliases = {alias_key(k): v for k, v in (config.get("mentor_aliases") or {}).items()}
    aliases.update({alias_key(k): v for k, v in (extra_aliases or {}).items()})
    rules = config.get("session_types") or DEFAULT_RULES
    skip_cells = {trlower(collapse(str(v))) for v in (config.get("skip_cells") or ["TATİL", "-"])}
    yer_tutucular = {trlower(collapse(str(v))) for v in (config.get("placeholder_mentors") or VARSAYILAN_YER_TUTUCULAR)}
    tatiller = {k if isinstance(k, dt.date) else dt.date.fromisoformat(str(k)): ad
                for k, ad in (config.get("holidays") or {}).items()}
    bootcamps = config.get("bootcamps") or {}

    wb = openpyxl.load_workbook(path, data_only=True)
    result = ParseResult([], [], [])
    for ws in wb.worksheets:
        conf = bootcamps.get(ws.title)
        sheet = SheetView(ws)
        if sheet.is_empty():
            result.bos_sekmeler.append(ws.title)
            continue
        if conf is None:
            result.atlanan_sekmeler.append(ws.title)
            continue
        ctx = Context(bootcamp=conf.get("name", ws.title), sheet=sheet, conf=conf, aliases=aliases, type_rules=rules,
                      skip_cells=skip_cells, yer_tutucular=yer_tutucular, tatiller=tatiller)
        try:
            ADAPTERS[conf["adapter"]](ctx)
        except Exception as e:  # bir sekmenin bozulması diğerlerini durdurmaz
            result.sekme_hatalari[ws.title] = f"{type(e).__name__}: {e}"
            continue
        result.oturumlar.extend(ctx.oturumlar)
        result.hatalar.extend(ctx.hatalar)
        result.notlar.extend((ctx.bootcamp, c, t) for c, t in ctx.notlar)

    # Aynı anahtar ikinci kez gelirse (aynı gün, aynı sütun) ilki tutulur, diğeri hata listesine düşer.
    gorulen: set[str] = set()
    tekil = []
    for o in result.oturumlar:
        if o.dis_anahtar in gorulen:
            result.hatalar.append(HataliKayit(o.bootcamp, o.kaynak, o.tarih.isoformat(), o.konu,
                                              ", ".join(a.ad for a in o.anlaticilar), "TEKRAR_EDEN_OTURUM"))
            continue
        gorulen.add(o.dis_anahtar)
        tekil.append(o)
    result.oturumlar = tekil

    result.isim_eslemeleri = isimleri_tamamla(result.oturumlar)
    result.oturumlar.sort(key=lambda o: (o.tarih, o.baslangic or "", o.bootcamp))
    result.cakismalar = find_conflicts(result.satirlar())
    return result


def isimleri_tamamla(oturumlar: list[Oturum]) -> dict[str, str]:
    """Çalışma kitabının kendi içinden isim birleştirme:
    - 'Furkan Akdag' ve 'Furkan Akdağ' gibi yalnızca Türkçe harfle ayrışan yazımlar tek ada (Türkçe harfli olana).
    - Yalnızca ilk adla yazılmış 'Arda', kitapta tek bir 'Arda …' varsa onun tam adına.
    Çözülemeyen tek kelimelik ad EGITMEN_BELIRSIZ uyarısı alır. Dönüş: yapılan eşlemeler.
    """
    sayim = Counter(a.ad for o in oturumlar for a in o.anlaticilar)
    gruplar: dict[str, list[str]] = {}
    for ad in sayim:
        gruplar.setdefault(slug(ad), []).append(ad)
    esleme: dict[str, str] = {}
    for adlar in gruplar.values():
        if len(adlar) > 1:
            kanonik = max(adlar, key=lambda a: (sum(not ch.isascii() for ch in a), sayim[a]))
            esleme.update({a: kanonik for a in adlar if a != kanonik})

    tam_adlar = {esleme.get(a, a) for a in sayim if len(a.split()) >= 2}
    ilk_ad: dict[str, set[str]] = {}
    for ad in tam_adlar:
        ilk_ad.setdefault(trlower(ad.split()[0]), set()).add(ad)
    for ad in sayim:
        if len(ad.split()) == 1 and len(ilk_ad.get(trlower(ad), ())) == 1:
            esleme[ad] = next(iter(ilk_ad[trlower(ad)]))

    for o in oturumlar:
        belirsiz = False
        for a in o.anlaticilar:
            if a.ad in esleme:
                a.ad = esleme[a.ad]
                if ISIM_TAMAMLANDI not in o.notlar:
                    o.notlar.append(ISIM_TAMAMLANDI)
            if len(a.ad.split()) == 1:
                belirsiz = True
        # aynı kişi iki kez yazılmışsa ("Arda & Arda Yüce") teke indir
        tekil, gorulen = [], set()
        for a in o.anlaticilar:
            if a.ad not in gorulen:
                gorulen.add(a.ad)
                tekil.append(a)
        o.anlaticilar = tekil
        if belirsiz and EGITMEN_BELIRSIZ not in o.uyarilar:
            o.uyarilar.append(EGITMEN_BELIRSIZ)
    return esleme
