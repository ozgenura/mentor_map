"""Oturum türü kuralı: config'teki sırayla, satır etiketi + konu metninde kelime başında eşleşme."""

import re

from .textutil import trlower

DEFAULT_RULES = [
    {"keywords": ["kick-off", "açılış"], "type": "Kick-Off"},
    {"keywords": ["master class"], "type": "Master Class"},
    {"keywords": ["sunum"], "type": "Sunum"},
    {"keywords": ["final proje", "proje çalışma", "proje teslim", "capstone"], "type": "Proje"},
    {"keywords": ["uygulama"], "type": "Uygulama"},
]


def session_type(row_label: str, konu: str, default: str, rules=None) -> str:
    text = trlower(f"{row_label} {konu}")
    for rule in rules or DEFAULT_RULES:
        if any(re.search(r"\b" + re.escape(trlower(k)), text) for k in rule["keywords"]):
            return rule["type"]
    return default
