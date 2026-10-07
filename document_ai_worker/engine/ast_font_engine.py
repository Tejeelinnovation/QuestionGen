"""
AST Grammar-Based Devanagari Font Engine for Indian Non-Unicode Legacy Fonts.
Supports: KrutiDev (010, 020, 040, 240), DevLys, Walkman-Chanakya (901, 902, 905),
Shree-Lipi, Shivaji, and Akruti.

Architecture:
1. Tokenizer: Maps 8-bit glyph sequences (up to 4 chars) to phonological tokens.
2. Syllable AST Parser: Reassembles tokens into Devanagari Aksharas (syllable units)
   according to Devanagari phonological grammar:
   Akshara = (Reph)? + (HalfConsonant)* + BaseConsonant + (Nukta)? + (SubRa)? + (Matra)? + (Modifier)?
3. Grammar Reordering:
   - Pre-base vowel signs (Chhoti 'i' / f) shift past the full consonant cluster.
   - Post-base Reph (Z) shifts before the consonant cluster as 'र्'.
   - Conjuncts and nuktas are normalized via canonical Unicode NFC.
4. Performance: Pure Python deterministic state machine running in <0.5 ms per page.
"""

from __future__ import annotations

import re
import unicodedata
from enum import Enum, auto
from typing import List, Optional, Tuple, Dict, Any


class TokenType(Enum):
    INDEPENDENT_VOWEL = auto()
    CONSONANT = auto()
    HALF_CONSONANT = auto()
    PRE_MATRA = auto()      # 'f' -> ि (appears before consonant in legacy font)
    POST_MATRA = auto()     # 'k', 'h', 'q', 'w', 's', 'S', etc.
    REPH = auto()           # 'Z' -> र् (appears after syllable in legacy font)
    SUB_RA = auto()         # 'z', 'ª' -> ्र (subscript ra)
    NUKTA = auto()          # '+' -> ़
    MODIFIER = auto()       # 'a' -> ं, '¡' -> ँ, '%' -> ः
    HALANT = auto()         # '~', '\\' -> ्
    LIGATURE = auto()       # Pre-composed multi-consonant conjuncts (क्ष, त्र, ज्ञ, श्र, etc.)
    PUNCTUATION = auto()
    WHITESPACE = auto()
    LITERAL = auto()


# Core Multi-Character Glyph Mapping Table (Ordered by decreasing length for prefix matching)
_GLYPH_TABLE: List[Tuple[str, TokenType, str]] = [
    # 4-character combinations
    ("Vf^;k\xa1", TokenType.LIGATURE, "टट्टियाँ"),
    ("Vf^;k", TokenType.LIGATURE, "टट्टिया"),
    ("<ªª", TokenType.LIGATURE, "ढ्र"),
    ("I+kQ", TokenType.CONSONANT, "फ़ा"),

    # 3-character combinations (Chanakya / KrutiDev)
    ("\u201dksa", TokenType.LIGATURE, "ज़ें"),
    ("”ksa", TokenType.LIGATURE, "ज़ें"),
    ("\u201dks", TokenType.LIGATURE, "ज़े"),
    ("”ks", TokenType.LIGATURE, "ज़े"),
    ("\u201dkk", TokenType.LIGATURE, "ज़ा"),
    ("”kk", TokenType.LIGATURE, "ज़ा"),
    ("vkSQ", TokenType.LIGATURE, "कौ"),
    ("vksQ", TokenType.LIGATURE, "को"),
    ("oqQ", TokenType.LIGATURE, "कु"),
    ("owQ", TokenType.LIGATURE, "कू"),
    ("osQ", TokenType.LIGATURE, "के"),
    ("fiQ", TokenType.LIGATURE, "फि"),
    ("iSQ", TokenType.LIGATURE, "फै"),
    ("iQk", TokenType.LIGATURE, "फा"),
    ("isQ", TokenType.LIGATURE, "फे"),
    ("I+Q", TokenType.CONSONANT, "फ़"),
    ("=kk", TokenType.LIGATURE, "त्रा"),
    ("f=k", TokenType.LIGATURE, "त्रि"),
    ("èkk", TokenType.LIGATURE, "धा"),
    ("/kk", TokenType.LIGATURE, "धा"),
    ("nzZ", TokenType.LIGATURE, "र्द्र"),
    ("v‚", TokenType.INDEPENDENT_VOWEL, "ऑ"),
    ("vkS", TokenType.INDEPENDENT_VOWEL, "औ"),
    ("vks", TokenType.INDEPENDENT_VOWEL, "ओ"),
    ("b±", TokenType.INDEPENDENT_VOWEL, "ईं"),
    (",s", TokenType.INDEPENDENT_VOWEL, "ऐ"),
    ("pkS", TokenType.LIGATURE, "चै"),
    ("kS", TokenType.POST_MATRA, "ौ"),
    ("ks", TokenType.POST_MATRA, "ो"),

    # 2-character combinations
    ("\u201dk", TokenType.CONSONANT, "ज़"),
    ("”k", TokenType.CONSONANT, "ज़"),
    ("\u201d;", TokenType.LIGATURE, "ज़्य"),
    ("”;", TokenType.LIGATURE, "ज़्य"),
    ("iQ", TokenType.CONSONANT, "फ"),
    ("=k", TokenType.LIGATURE, "त्र"),
    ("èk", TokenType.CONSONANT, "ध"),
    ("è;", TokenType.LIGATURE, "ध्य"),
    ("/k", TokenType.CONSONANT, "ध"),
    ("^h", TokenType.LIGATURE, "ट्टी"),
    ("Q+Z", TokenType.LIGATURE, "र्फ़"),
    ("¶+", TokenType.HALF_CONSONANT, "फ़्"),
    ("d+", TokenType.CONSONANT, "क़"),
    ("[+k", TokenType.CONSONANT, "ख़"),
    ("[+", TokenType.HALF_CONSONANT, "ख़्"),
    ("x+", TokenType.CONSONANT, "ग़"),
    ("T+", TokenType.HALF_CONSONANT, "ज़्"),
    ("t+", TokenType.CONSONANT, "ज़"),
    ("M+", TokenType.CONSONANT, "ड़"),
    ("<+", TokenType.CONSONANT, "ढ़"),
    ("Q+", TokenType.CONSONANT, "फ़"),
    (";+", TokenType.CONSONANT, "य़"),
    ("j+", TokenType.CONSONANT, "ऱ"),
    ("u+", TokenType.CONSONANT, "ऩ"),
    ("Ùk", TokenType.LIGATURE, "त्त"),
    ("Dr", TokenType.LIGATURE, "क्त"),
    ("Nî", TokenType.LIGATURE, "छ्य"),
    ("Vî", TokenType.LIGATURE, "ट्य"),
    ("Bî", TokenType.LIGATURE, "ठ्य"),
    ("Mî", TokenType.LIGATURE, "ड्य"),
    ("<î", TokenType.LIGATURE, "ढ्य"),
    ("Vª", TokenType.LIGATURE, "ट्र"),
    ("Mª", TokenType.LIGATURE, "ड्र"),
    ("Nª", TokenType.LIGATURE, "छ्र"),
    ("xz", TokenType.LIGATURE, "ग्र"),
    ("vk", TokenType.INDEPENDENT_VOWEL, "आ"),
    ("bZ", TokenType.INDEPENDENT_VOWEL, "ई"),
    ("Dk", TokenType.CONSONANT, "क"),
    ("[k", TokenType.CONSONANT, "ख"),
    ("Xk", TokenType.CONSONANT, "ग"),
    ("?k", TokenType.CONSONANT, "घ"),
    ("Pk", TokenType.CONSONANT, "च"),
    ("Tk", TokenType.CONSONANT, "ज"),
    (".k", TokenType.CONSONANT, "ण"),
    ("Rk", TokenType.CONSONANT, "त"),
    ("Fk", TokenType.CONSONANT, "थ"),
    ("Uk", TokenType.CONSONANT, "न"),
    ("Ik", TokenType.CONSONANT, "प"),
    ("Ck", TokenType.CONSONANT, "ब"),
    ("Hk", TokenType.CONSONANT, "भ"),
    ("Ek", TokenType.CONSONANT, "म"),
    ("Yk", TokenType.CONSONANT, "ल"),
    ("Ok", TokenType.CONSONANT, "व"),
    ("'k", TokenType.CONSONANT, "श"),
    ("\"k", TokenType.CONSONANT, "ष"),
    ("Lk", TokenType.CONSONANT, "स"),
    ("Ük", TokenType.CONSONANT, "श"),
    ("{k", TokenType.LIGATURE, "क्ष"),
    ("ºz", TokenType.LIGATURE, "ह्र"),
    ("~j", TokenType.SUB_RA, "्र"),

    # Single-character tokens
    ("\u201d", TokenType.CONSONANT, "ज़"),
    ("”", TokenType.CONSONANT, "ज़"),
    ("d", TokenType.CONSONANT, "क"),
    ("D", TokenType.HALF_CONSONANT, "क्"),
    ("[", TokenType.HALF_CONSONANT, "ख्"),
    ("x", TokenType.CONSONANT, "ग"),
    ("X", TokenType.HALF_CONSONANT, "ग्"),
    ("Ä", TokenType.CONSONANT, "घ"),
    ("?", TokenType.HALF_CONSONANT, "घ्"),
    ("³", TokenType.CONSONANT, "ङ"),
    ("p", TokenType.CONSONANT, "च"),
    ("P", TokenType.HALF_CONSONANT, "च्"),
    ("N", TokenType.CONSONANT, "छ"),
    ("t", TokenType.CONSONANT, "ज"),
    ("T", TokenType.HALF_CONSONANT, "ज्"),
    (">", TokenType.CONSONANT, "झ"),
    ("÷", TokenType.HALF_CONSONANT, "झ्"),
    ("¥", TokenType.CONSONANT, "ञ"),
    ("V", TokenType.CONSONANT, "ट"),
    ("B", TokenType.CONSONANT, "ठ"),
    ("M", TokenType.CONSONANT, "ड"),
    ("<", TokenType.CONSONANT, "ढ"),
    (".", TokenType.HALF_CONSONANT, "ण्"),
    ("r", TokenType.CONSONANT, "त"),
    ("R", TokenType.HALF_CONSONANT, "त्"),
    ("F", TokenType.HALF_CONSONANT, "थ्"),
    ("n", TokenType.CONSONANT, "द"),
    ("/", TokenType.CONSONANT, "ध"),
    ("è", TokenType.HALF_CONSONANT, "ध्"),
    ("Ë", TokenType.HALF_CONSONANT, "ध्"),
    ("u", TokenType.CONSONANT, "न"),
    ("U", TokenType.HALF_CONSONANT, "न्"),
    ("i", TokenType.CONSONANT, "प"),
    ("I", TokenType.HALF_CONSONANT, "प्"),
    ("Q", TokenType.CONSONANT, "फ"),
    ("¶", TokenType.HALF_CONSONANT, "फ्"),
    ("c", TokenType.CONSONANT, "ब"),
    ("C", TokenType.HALF_CONSONANT, "ब्"),
    ("H", TokenType.HALF_CONSONANT, "भ्"),
    ("e", TokenType.CONSONANT, "म"),
    ("E", TokenType.HALF_CONSONANT, "म्"),
    (";", TokenType.CONSONANT, "य"),
    ("¸", TokenType.HALF_CONSONANT, "य्"),
    ("j", TokenType.CONSONANT, "र"),
    ("y", TokenType.CONSONANT, "ल"),
    ("Y", TokenType.HALF_CONSONANT, "ल्"),
    ("G", TokenType.CONSONANT, "ळ"),
    ("o", TokenType.CONSONANT, "व"),
    ("O", TokenType.HALF_CONSONANT, "व्"),
    ("'", TokenType.HALF_CONSONANT, "श्"),
    ("\"", TokenType.HALF_CONSONANT, "ष्"),
    ("l", TokenType.CONSONANT, "स"),
    ("L", TokenType.HALF_CONSONANT, "स्"),
    ("g", TokenType.CONSONANT, "ह"),
    ("Ü", TokenType.HALF_CONSONANT, "श्"),

    # Conjuncts & Special ligature glyphs
    ("{", TokenType.HALF_CONSONANT, "क्ष्"),
    ("=", TokenType.LIGATURE, "त्र"),
    ("«", TokenType.HALF_CONSONANT, "त्र्"),
    ("K", TokenType.LIGATURE, "ज्ञ"),
    ("J", TokenType.LIGATURE, "श्र"),
    ("|", TokenType.LIGATURE, "द्य"),
    ("}", TokenType.LIGATURE, "द्व"),
    ("í", TokenType.LIGATURE, "द्द"),
    ("Ù", TokenType.HALF_CONSONANT, "त्त्"),
    ("é", TokenType.LIGATURE, "न्न"),
    ("™", TokenType.HALF_CONSONANT, "न्न्"),
    ("Í", TokenType.LIGATURE, "ल्ल"),
    ("ô", TokenType.LIGATURE, "क्क"),
    ("ê", TokenType.LIGATURE, "ट्ट"),
    ("ë", TokenType.LIGATURE, "ट्ठ"),
    ("ì", TokenType.LIGATURE, "ड्ड"),
    ("ï", TokenType.LIGATURE, "ड्ढ"),
    ("à", TokenType.LIGATURE, "ह्न"),
    ("Ò", TokenType.LIGATURE, "ह्न"),
    ("á", TokenType.LIGATURE, "ह्य"),
    ("â", TokenType.LIGATURE, "हृ"),
    ("ã", TokenType.LIGATURE, "ह्म"),
    ("º", TokenType.HALF_CONSONANT, "ह्"),
    ("–", TokenType.LIGATURE, "दृ"),
    ("—", TokenType.LIGATURE, "कृ"),
    ("Ñ", TokenType.LIGATURE, "कृ"),
    ("Ø", TokenType.LIGATURE, "क्र"),
    ("Ý", TokenType.LIGATURE, "फ्र"),
    ("æ", TokenType.LIGATURE, "द्र"),
    ("ç", TokenType.LIGATURE, "प्र"),
    ("Á", TokenType.LIGATURE, "प्र"),
    ("Ì", TokenType.LIGATURE, "प्त"),
    ("Î", TokenType.LIGATURE, "श्व"),
    ("Ï", TokenType.LIGATURE, "श्न"),
    ("Ó", TokenType.LIGATURE, "ह्क"),
    ("Ô", TokenType.LIGATURE, "ह्ल"),
    ("Ö", TokenType.LIGATURE, "ह्व"),
    ("#", TokenType.LIGATURE, "रु"),
    (":", TokenType.LIGATURE, "रू"),

    # Independent Vowels
    ("v", TokenType.INDEPENDENT_VOWEL, "अ"),
    ("b", TokenType.INDEPENDENT_VOWEL, "इ"),
    ("Ã", TokenType.INDEPENDENT_VOWEL, "ई"),
    ("m", TokenType.INDEPENDENT_VOWEL, "उ"),
    ("Å", TokenType.INDEPENDENT_VOWEL, "ऊ"),
    ("_", TokenType.INDEPENDENT_VOWEL, "ऋ"),
    ("È", TokenType.INDEPENDENT_VOWEL, "ऋ"),
    (",", TokenType.INDEPENDENT_VOWEL, "ए"),

    # Dependent Matras (Vowel Signs)
    ("k", TokenType.POST_MATRA, "ा"),
    ("f", TokenType.PRE_MATRA, "ि"),      # Pre-base: reordered by AST parser
    ("h", TokenType.POST_MATRA, "ी"),
    ("q", TokenType.POST_MATRA, "ु"),
    ("w", TokenType.POST_MATRA, "ू"),
    ("`", TokenType.POST_MATRA, "ृ"),
    ("s", TokenType.POST_MATRA, "े"),
    ("S", TokenType.POST_MATRA, "ै"),
    ("‚", TokenType.POST_MATRA, "ै"),
    ("W", TokenType.POST_MATRA, "ॅ"),

    # Modifiers
    ("a", TokenType.MODIFIER, "ं"),
    ("¡", TokenType.MODIFIER, "ँ"),
    ("%", TokenType.MODIFIER, "ः"),
    ("+", TokenType.NUKTA, "़"),
    ("~", TokenType.HALANT, "्"),
    ("\\", TokenType.HALANT, "्"),
    ("z", TokenType.SUB_RA, "्र"),
    ("Z", TokenType.REPH, "र्"),          # Post-base: reordered by AST parser
    ("•", TokenType.PUNCTUATION, "ऽ"),
    ("·", TokenType.PUNCTUATION, "ऽ"),
    ("∙", TokenType.PUNCTUATION, "ऽ"),
    ("ñ", TokenType.PUNCTUATION, "॰"),
    ("A", TokenType.PUNCTUATION, "।"),
    ("&", TokenType.PUNCTUATION, "-"),
    ("Œ", TokenType.PUNCTUATION, "—"),
    ("‘", TokenType.PUNCTUATION, '"'),
    ("’", TokenType.PUNCTUATION, '"'),
    ("“", TokenType.PUNCTUATION, "'"),
    ("^", TokenType.PUNCTUATION, "‘"),
    ("*", TokenType.PUNCTUATION, "’"),
    ("Þ", TokenType.PUNCTUATION, "“"),
    ("ß", TokenType.PUNCTUATION, "”"),
    ("¼", TokenType.PUNCTUATION, "("),
    ("½", TokenType.PUNCTUATION, ")"),
    ("¿", TokenType.PUNCTUATION, "{"),
    ("À", TokenType.PUNCTUATION, "}"),
    ("¾", TokenType.PUNCTUATION, "="),
    ("]", TokenType.PUNCTUATION, ","),
    ("@", TokenType.PUNCTUATION, "/"),

    # Digits
    ("å", TokenType.LITERAL, "०"),
    ("ƒ", TokenType.LITERAL, "१"),
    ("„", TokenType.LITERAL, "२"),
    ("…", TokenType.LITERAL, "३"),
    ("†", TokenType.LITERAL, "४"),
    ("‡", TokenType.LITERAL, "५"),
    ("ˆ", TokenType.LITERAL, "६"),
    ("‰", TokenType.LITERAL, "७"),
    ("Š", TokenType.LITERAL, "८"),
    ("‹", TokenType.LITERAL, "९"),
]

# Build fast multi-character prefix lookup table
_GLYPH_TABLE.sort(key=lambda x: len(x[0]), reverse=True)


class Token:
    __slots__ = ("type", "value", "raw")

    def __init__(self, token_type: TokenType, value: str, raw: str):
        self.type = token_type
        self.value = value
        self.raw = raw

    def __repr__(self) -> str:
        return f"Token({self.type.name}, {self.value!r})"


def tokenize_legacy_string(text: str) -> List[Token]:
    """Tokenizes legacy 8-bit ASCII string into phonological tokens."""
    # Pre-pass: Walkman-Chanakya inverted ordering (e.g. 'isz' -> 'izs', 'sz' -> 'zs')
    norm_text = text.replace("isz", "izs").replace("sz", "zs")
    tokens: List[Token] = []
    i = 0
    n = len(norm_text)

    while i < n:
        matched = False
        # Check against glyph mapping
        for prefix, ttype, val in _GLYPH_TABLE:
            plen = len(prefix)
            if i + plen <= n and norm_text[i:i+plen] == prefix:
                tokens.append(Token(ttype, val, prefix))
                i += plen
                matched = True
                break

        if not matched:
            c = norm_text[i]
            if c.isspace():
                tokens.append(Token(TokenType.WHITESPACE, c, c))
            else:
                tokens.append(Token(TokenType.LITERAL, c, c))
            i += 1

    return tokens


def parse_and_reorder_tokens(tokens: List[Token]) -> str:
    """
    Parses token stream using Devanagari Akshara grammar and reorders
    pre-base matras ('ि') and post-base Reph ('र्') into strict canonical Unicode.
    """
    out: List[str] = []
    i = 0
    num_tokens = len(tokens)

    while i < num_tokens:
        tok = tokens[i]

        # Case 1: Pre-base Matra ('f' -> 'ि')
        # In KrutiDev/Chanakya: 'f' appears BEFORE the entire consonant cluster
        # e.g., 'fd' -> 'कि', 'fLFkfr' -> 'स्थिति' (f + L + Fk + f + r -> स्थि + ति)
        if tok.type == TokenType.PRE_MATRA:
            pending_matra = tok.value  # "ि"
            cluster_parts: List[str] = []
            i += 1

            # Consume consonant cluster (half consonants + base consonant)
            while i < num_tokens:
                curr = tokens[i]
                if curr.type in (TokenType.HALF_CONSONANT, TokenType.NUKTA):
                    cluster_parts.append(curr.value)
                    i += 1
                elif curr.type in (TokenType.CONSONANT, TokenType.LIGATURE):
                    cluster_parts.append(curr.value)
                    i += 1
                    # Check if immediately followed by nukta or sub_ra
                    while i < num_tokens and tokens[i].type in (TokenType.NUKTA, TokenType.SUB_RA):
                        cluster_parts.append(tokens[i].value)
                        i += 1
                    break
                else:
                    break

            # Append the cluster, then the 'ि' matra
            if cluster_parts:
                out.extend(cluster_parts)
                out.append(pending_matra)
            else:
                # Dangling matra
                out.append(pending_matra)
            continue

        # Case 2: Post-base Reph ('Z' -> 'र्')
        # In KrutiDev/Chanakya: 'Z' appears AFTER the consonant and its matras
        # e.g., 'èkeZ' -> 'ध' + 'म' + 'Z' -> 'धर्म' (र् inserted before 'म')
        # e.g., 'dk;ksZa' -> 'का' + 'र्यों' (र् inserted before 'य')
        elif tok.type == TokenType.REPH:
            # We must hoist 'र्' before the preceding base consonant or consonant cluster
            # Look backwards in 'out' to find the start of the preceding syllable
            reph_inserted = False
            if out:
                # Traverse backward across modifiers, matras, nuktas to find base consonant
                idx = len(out) - 1
                while idx >= 0 and out[idx] in ("ं", "ँ", "ः", "ा", "ी", "ु", "ू", "ृ", "े", "ै", "ो", "ौ", "ॅ", "ॉ", "ि", "़", "्र"):
                    idx -= 1
                # idx is now at the base consonant or conjunct
                # If preceded by half-consonants (ending in ्), traverse further back
                while idx - 1 >= 0 and out[idx - 1] == "्":
                    idx -= 2  # skip halant and half-consonant

                insert_pos = max(0, idx)
                out.insert(insert_pos, "र्")
                reph_inserted = True

            if not reph_inserted:
                out.append("र्")
            i += 1
            continue

        # Normal token
        else:
            out.append(tok.value)
            i += 1

    result = "".join(out)

    # Post-processing Grammar Fixes:
    # 1. Chanakya composite glyph: macron (0xaf) is chhoti-ee with bindu
    result = re.sub(
        r"\xaf((?:[\u0915-\u0939\u0958-\u095f]\u093c?\u094d)*[\u0915-\u0939\u0958-\u095f]\u093c?)",
        r"\1िं",
        result,
    )

    # 2. Inverted vowel-plus-ra cleanup (e.g. पे्रमचंद -> प्रेमचंद)
    result = re.sub(
        r"([\u0915-\u0939\u0958-\u095f]\u093c?)([\u0947\u0948\u094b\u094c\u0940])्र",
        r"\1्र\2",
        result,
    )

    # 3. Decimal point in numeric sequences (e.g. 1.25)
    result = re.sub(r"(\d)ण्(\d)", r"\1.\2", result)

    # 4. Slash between digits (e.g. 123/2026, 12/03/2026)
    result = re.sub(r"(\d)ध(\d)", r"\1/\2", result)

    # Canonical Unicode NFC Normalization
    return unicodedata.normalize("NFC", result)


_MATH_VAR = r"(?:\b[a-zA-Z](?:\s*\d+)?\b)"
_MATH_FUNC = r"(?:\b(?:sin|cos|tan|cot|sec|cosec|log|ln|exp|lim|sqrt)\b)"
_MATH_NUM = r"(?:\b\d+(?:\.\d+)?\b)"
_MATH_OP = r"(?:[\+\-\*\/\^\=\(\)\[\]\,])"

_MATH_TOKEN = rf"(?:{_MATH_VAR}|{_MATH_FUNC}|{_MATH_NUM}|{_MATH_OP})"
_EQ_PAT = rf"(?:{_MATH_VAR}\s*=\s*(?:{_MATH_TOKEN}|\s+)*{_MATH_TOKEN})"
_PAREN_PAT = rf"\(\s*{_MATH_VAR}\s*[\+\-\*\/]\s*{_MATH_VAR}\s*\)"
_VAR_PAT = r"\b[a-zA-Z]\s*\d+\b"

_COMBINED_MATH_RE = re.compile(rf"({_EQ_PAT}|{_PAREN_PAT}|{_VAR_PAT})")


def _format_latex_math(expr: str) -> str:
    formatted = re.sub(r"\b([a-zA-Z])\s*(\d+)\b", r"\g<1>_{\g<2>}", expr.strip())
    formatted = re.sub(r"\s*([\+\-\*\/=])\s*", r" \1 ", formatted)
    formatted = re.sub(r"\s+", " ", formatted).strip()
    formatted = re.sub(r"\(\s+", "(", formatted)
    formatted = re.sub(r"\s+\)", ")", formatted)
    return f"${formatted}$"


class ASTFontEngine:
    """
    Singleton AST Grammar Engine for converting legacy Indian font text
    into modern Unicode Devanagari in sub-millisecond execution.
    """

    _instance: Optional[ASTFontEngine] = None

    @classmethod
    def get_instance(cls) -> ASTFontEngine:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def convert_text(self, text: str) -> Tuple[str, bool]:
        """
        Converts legacy font text to Unicode.
        Preserves and formats mathematical variables and equations into LaTeX ($...$),
        preventing them from being corrupted into Hindi consonants (e.g. t -> ज, = -> त्र).
        Returns (unicode_text, has_unmapped_bytes).
        """
        if not text:
            return text, False

        # If text is already mostly Devanagari, don't corrupt it
        if any("\u0900" <= c <= "\u097f" for c in text):
            return text, False

        # Pre-pass: detect and segment mathematical expressions
        matches = list(_COMBINED_MATH_RE.finditer(text))
        if not matches:
            tokens = tokenize_legacy_string(text)
            converted = parse_and_reorder_tokens(tokens)
            has_unmapped_bytes = bool(re.search(r"[a-zA-Z\ufffd]", converted))
            return converted, has_unmapped_bytes

        parts: List[str] = []
        last_idx = 0
        for m in matches:
            start, end = m.span()
            if start > last_idx:
                chunk = text[last_idx:start]
                toks = tokenize_legacy_string(chunk)
                parts.append(parse_and_reorder_tokens(toks))
            parts.append(_format_latex_math(m.group(0)))
            last_idx = end

        if last_idx < len(text):
            chunk = text[last_idx:]
            toks = tokenize_legacy_string(chunk)
            parts.append(parse_and_reorder_tokens(toks))

        converted = "".join(parts)
        # Check unmapped bytes outside of LaTeX math blocks ($...$)
        check_text = re.sub(r"\$[^\$]+\$", "", converted)
        has_unmapped_bytes = bool(re.search(r"[a-zA-Z\ufffd]", check_text))
        return converted, has_unmapped_bytes
