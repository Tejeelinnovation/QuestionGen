"""
Deterministic Unicode Remapper for Indian Legacy Non-Unicode Fonts.
Supports:
- KrutiDev (KrutiDev010, KrutiDev040, KrutiDev240, DevLys)
- Walkman-Chanakya (Walkman-Chanakya905, Walkman-Chanakya901, Chanakya)
- Bhartiya Hindi, Shivaji, Shree-Lipi

Converts raw 8-bit ASCII character encodings directly into modern Unicode Devanagari
in sub-millisecond execution. Accuracy is measured against hand-verified ground truth.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

_K2U_MAPPINGS: List[Tuple[str, str]] = [
    ("Vf^;k\xa1", "टट्टियाँ"),
    ("Vf^;k", "टट्टिया"),
    ("^h", "ट्टी"),
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

LEGACY_FONT_SUBSTRINGS = (
    "chanakya",
    "kruti",
    "devlys",
    "walkman",
    "bhartiya",
    "shivaji",
    "shree",
    "bilingual",
    "akruti",
    "kundli",
    "aps",
)


def is_legacy_font(font_name: str) -> bool:
    if not font_name:
        return False
    lower = font_name.lower()
    return any(sub in lower for sub in LEGACY_FONT_SUBSTRINGS)


def remap_legacy_text(text: str) -> Tuple[str, bool]:
    """
    Converts 8-bit ASCII legacy font text (KrutiDev, Chanakya, Walkman)
    into standard Unicode Devanagari.
    
    Returns (converted_text, has_unmapped_bytes).
    If any raw Latin characters or replacement bytes remain, has_unmapped_bytes is True.
    """
    if not text:
        return text, False

    # If text already contains valid Devanagari, don't corrupt it
    if any("\u0900" <= c <= "\u097f" for c in text):
        return text, False

    converted = text
    for k, u in _K2U_MAPPINGS:
        converted = converted.replace(k, u)

    # Chhoti-ee matra reordering: 'f' followed by consonant cluster (including nukta consonants \u0958-\u095f)
    def _fix_chhoti_ee(match: re.Match) -> str:
        return match.group(1) + "ि"

    converted = re.sub(
        r"f((?:[\u0915-\u0939\u0958-\u095f]\u094d)*[\u0915-\u0939\u0958-\u095f])",
        _fix_chhoti_ee,
        converted,
    )

    # Reph (half-r) reordering: consonant cluster followed by 'Z'
    def _fix_reph(match: re.Match) -> str:
        return "र्" + match.group(1)

    converted = re.sub(
        r"((?:[\u0915-\u0939\u0958-\u095f]\u094d)*[\u0915-\u0939\u0958-\u095f][\u093e-\u094c\u0901-\u0903]*)Z",
        _fix_reph,
        converted,
    )

    # Decimal point fix
    converted = re.sub(r"(\d)ण्(\d)", r"\1.\2", converted)

    # Detect unmapped legacy bytes (residual ASCII letters or replacement glyphs in legacy span)
    has_unmapped_bytes = bool(re.search(r"[a-zA-Z\ufffd]", converted))

    return converted, has_unmapped_bytes


def convert_page_spans_to_unicode(fitz_page: Any) -> Tuple[Optional[str], bool]:
    """
    Extracts text spans from a PyMuPDF page using font-name awareness.
    Only spans encoded with legacy fonts are remapped to Devanagari;
    spans in standard fonts (Arial, Times-Roman, etc.) are kept as English.
    
    Returns (rebuilt_text, page_has_unmapped_bytes).
    """
    try:
        page_dict = fitz_page.get_text("dict")
    except Exception:
        return None, False

    blocks = page_dict.get("blocks", [])
    if not blocks:
        return None, False

    rebuilt_blocks: List[str] = []
    has_remapped_content = False
    page_has_unmapped_bytes = False

    for b in blocks:
        lines = b.get("lines")
        if not lines:
            continue

        b_lines: List[str] = []
        for l in lines:
            spans = l.get("spans", [])
            merged_spans: List[Tuple[bool, str]] = []
            for s in spans:
                font = (s.get("font") or "").lower()
                span_text = s.get("text") or ""
                if not span_text:
                    continue
                leg = is_legacy_font(font)
                if merged_spans and merged_spans[-1][0] == leg:
                    merged_spans[-1] = (leg, merged_spans[-1][1] + span_text)
                else:
                    merged_spans.append((leg, span_text))

            line_pieces: List[str] = []
            for leg, text in merged_spans:
                if leg:
                    remapped, unmapped = remap_legacy_text(text)
                    if unmapped:
                        page_has_unmapped_bytes = True
                        line_pieces.append(f"[UNMAPPED: {remapped}]")
                    else:
                        line_pieces.append(remapped)
                    has_remapped_content = True
                else:
                    line_pieces.append(text)

            if line_pieces:
                b_lines.append(" ".join(line_pieces))

        if b_lines:
            rebuilt_blocks.append("\n".join(b_lines))

    if not has_remapped_content:
        return None, False

    return "\n\n".join(rebuilt_blocks), page_has_unmapped_bytes
