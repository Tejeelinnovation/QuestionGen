"""
KrutiDev 010 to Unicode Devanagari Hindi Converter for Document AI Worker.
"""

from __future__ import annotations

import re
from typing import Tuple

_K2U_MAPPINGS: list[Tuple[str, str]] = [
    ("ñ", "॰"),
    ("Q+Z", "QZ+"),
    ("sas", "sa"),
    ("aa", "a"),
    (")Z", "र्द्ध"),
    ("ZZ", "Z"),
    ("‘", '"'),
    ("’", '"'),
    ("“", "'"),
    ("”", "'"),
    ("å", "०"),
    ("ƒ", "१"),
    ("„", "२"),
    ("…", "३"),
    ("†", "४"),
    ("‡", "५"),
    ("ˆ", "६"),
    ("‰", "७"),
    ("Š", "८"),
    ("‹", "९"),
    ("¶+", "फ़्"),
    ("d+", "क़"),
    ("[+k", "ख़"),
    ("[+", "ख़्"),
    ("x+", "ग़"),
    ("T+", "ज़्"),
    ("t+", "ज़"),
    ("M+", "ड़"),
    ("<+", "ढ़"),
    ("Q+", "फ़"),
    (";+", "य़"),
    ("j+", "ऱ"),
    ("u+", "ऩ"),
    ("Ùk", "त्त"),
    ("Ù", "त्त्"),
    ("Dr", "क्त"),
    ("–", "दृ"),
    ("—", "कृ"),
    ("é", "न्न"),
    ("™", "न्न्"),
    ("=kk", "=k"),
    ("f=k", "f="),
    ("à", "ह्न"),
    ("á", "ह्य"),
    ("â", "हृ"),
    ("ã", "ह्म"),
    ("ºz", "ह्र"),
    ("º", "ह्"),
    ("í", "द्द"),
    ("{k", "क्ष"),
    ("{", "क्ष्"),
    ("=", "त्र"),
    ("«", "त्र्"),
    ("Nî", "छ्य"),
    ("Vî", "ट्य"),
    ("Bî", "ठ्य"),
    ("Mî", "ड्य"),
    ("<î", "ढ्य"),
    ("|", "द्य"),
    ("K", "ज्ञ"),
    ("}", "द्व"),
    ("J", "श्र"),
    ("Vª", "ट्र"),
    ("Mª", "ड्र"),
    ("<ªª", "ढ्र"),
    ("Nª", "छ्र"),
    ("Ø", "क्र"),
    ("Ý", "फ्र"),
    ("nzZ", "र्द्र"),
    ("æ", "द्र"),
    ("ç", "प्र"),
    ("Á", "प्र"),
    ("xz", "ग्र"),
    ("#", "रु"),
    (":", "रू"),
    ("v‚", "ऑ"),
    ("vkS", "औ"),
    ("vks", "ओ"),
    ("vk", "आ"),
    ("v", "अ"),
    ("b±", "ईं"),
    ("Ã", "ई"),
    ("bZ", "ई"),
    ("b", "इ"),
    ("m", "उ"),
    ("Å", "ऊ"),
    (",s", "ऐ"),
    (",", "ए"),
    ("_", "ऋ"),
    ("ô", "क्क"),
    ("osQ", "के"),
    ("d", "क"),
    ("Dk", "क"),
    ("D", "क्"),
    ("[k", "ख"),
    ("[", "ख्"),
    ("x", "ग"),
    ("Xk", "ग"),
    ("X", "ग्"),
    ("Ä", "घ"),
    ("?k", "घ"),
    ("?", "घ्"),
    ("³", "ङ"),
    ("pkS", "चै"),
    ("p", "च"),
    ("Pk", "च"),
    ("P", "च्"),
    ("N", "छ"),
    ("t", "ज"),
    ("Tk", "ज"),
    ("T", "ज्"),
    (">", "झ"),
    ("÷", "झ्"),
    ("¥", "ञ"),
    ("ê", "ट्ट"),
    ("ë", "ट्ठ"),
    ("V", "ट"),
    ("B", "ठ"),
    ("ì", "ड्ड"),
    ("ï", "ड्ढ"),
    ("M", "ड"),
    ("<", "ढ"),
    (".k", "ण"),
    (".", "ण्"),
    ("r", "त"),
    ("Rk", "त"),
    ("R", "त्"),
    ("Fk", "थ"),
    ("F", "थ्"),
    (")", "ध"),
    ("n", "द"),
    ("/k", "ध"),
    ("èk", "ध"),
    ("/", "ध्"),
    ("Ë", "ध्"),
    ("è", "ध्"),
    ("u", "न"),
    ("Uk", "न"),
    ("U", "न्"),
    ("i", "प"),
    ("Ik", "प"),
    ("I", "प्"),
    ("Q", "फ"),
    ("¶", "फ्"),
    ("c", "ब"),
    ("Ck", "ब"),
    ("C", "ब्"),
    ("Hk", "भ"),
    ("H", "भ्"),
    ("e", "म"),
    ("Ek", "म"),
    ("E", "म्"),
    (";", "य"),
    ("¸", "य्"),
    ("j", "र"),
    ("y", "ल"),
    ("Yk", "ल"),
    ("Y", "ल्"),
    ("G", "ळ"),
    ("o", "व"),
    ("Ok", "व"),
    ("O", "व्"),
    ("'k", "श"),
    ("'", "श्"),
    ("\"k", "ष"),
    ("\"", "ष्"),
    ("l", "स"),
    ("Lk", "स"),
    ("L", "स्"),
    ("g", "ह"),
    ("È", "ऋ"),
    ("z", "्र"),
    ("Ì", "प्त"),
    ("Í", "ल्ल"),
    ("Î", "श्व"),
    ("Ï", "श्न"),
    ("Ñ", "कृ"),
    ("Ò", "ह्न"),
    ("Ó", "ह्क"),
    ("Ô", "ह्ल"),
    ("Ö", "ह्व"),
    ("Ù", "त्त"),
    ("Ük", "श"),
    ("Ü", "श्"),
    ("‚", "ै"),
    ("ks", "ो"),
    ("kS", "ौ"),
    ("k", "ा"),
    ("h", "ी"),
    ("q", "ु"),
    ("w", "ू"),
    ("`", "ृ"),
    ("s", "े"),
    ("S", "ै"),
    ("a", "ं"),
    ("¡", "ँ"),
    ("%", "ः"),
    ("W", "ॅ"),
    ("•", "ऽ"),
    ("·", "ऽ"),
    ("∙", "ऽ"),
    ("~j", "्र"),
    ("~", "्"),
    ("\\", "्"),
    ("+", "़"),
    (" ः", " :"),
    ("^", "‘"),
    ("*", "’"),
    ("Þ", "“"),
    ("ß", "”"),
    ("¼", "("),
    ("½", ")"),
    ("¿", "{"),
    ("À", "}"),
    ("¾", "="),
    ("A", "।"),
    ("&", "-"),
    ("Œ", "—"),
    ("]", "’"),
    ("~ ", "् "),
    ("@", "/"),
]

_KRUTIDEV_TRIGGERS = [
    "dksf", "foHk", "izf", "gSA", "osQ", "thok", "rFkk", "vkSj", "esa", "dgrs", "gksrh", "gksrk",
    "vè;", "ljy", "js[kk", "fcanq", "f=k", "lehdj.k", "fn,", "fn;k", "blfy,", "mQè", "vko`Qfr",
    "Hkwfedk", "mnkgj.k", "iz'ukoyh", "f=kHkqt", "nwjh", "d{kk", "dks.", "yac", "Kkr", "T;kfefr",
    "chtxf.kr", "lw=k", "x-v{k", "y-v{k", "mís'", "fopkj", "LFkfr", "dks.k", "var%", "O;kid"
]


def is_krutidev(text: str) -> bool:
    if not text:
        return False
    if any("\u0900" <= c <= "\u097f" for c in text):
        return False
    return any(trigger in text for trigger in _KRUTIDEV_TRIGGERS)


def krutidev_to_unicode(text: str) -> str:
    if not text or not is_krutidev(text):
        return text

    # Split to preserve parenthesized English words: (Straight Lines), (Introduction), etc.
    parts = re.split(r"(\([A-Za-z0-9\s\,\.\-\+\=\_\/]+\))", text)
    result = []
    for part in parts:
        if part.startswith("(") and part.endswith(")"):
            result.append(part)
            continue

        converted = part
        for k, u in _K2U_MAPPINGS:
            converted = converted.replace(k, u)

        def fix_chhoti_ee(match):
            char_seq = match.group(1)
            return char_seq + "ि"

        converted = re.sub(r"f((?:[\u0915-\u0939]\u094d)*[\u0915-\u0939])", fix_chhoti_ee, converted)

        def fix_reph(match):
            char_seq = match.group(1)
            return "र्" + char_seq

        converted = re.sub(
            r"((?:[\u0915-\u0939]\u094d)*[\u0915-\u0939][\u093e-\u094c\u0901-\u0903]*)Z",
            fix_reph,
            converted,
        )

        # Fix decimal points between digits that were mapped from KrutiDev 'ण्'
        converted = re.sub(r"(\d)ण्(\d)", r"\1.\2", converted)

        result.append(converted)

    return "".join(result)
