"""
Pure, unit-tested text cleaning and normalization functions for Document AI.

Handles:
1. Drop caps merging ("T he Congress" -> "The Congress")
2. Hyphenated line break rejoining ("inter-\nnational" -> "international")
3. Leaked symbol-font glyph stripping ("trianglertSouthern" -> "Southern")
4. Dropping isolated short fragments (< 4 chars) while preserving numerals & labels
5. Rebuilding words from PyMuPDF word positions or non-destructive flagging of glued words
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


# Known leaked PostScript / TrueType glyph names from publisher typesetting fonts
LEAKED_GLYPH_NAMES = [
    "trianglert",
    "triangleleft",
    "triangleup",
    "triangledown",
    "trianglesmall",
    "squarebullet",
    "roundbullet",
    "diamondbullet",
    "squarebox",
    "checkbox",
    "arrowright",
    "arrowleft",
    "arrowup",
    "arrowdown",
    "bulletcircle",
    "bulletdisc",
    "hyphenbullet",
]

# Regex pattern for prefixed leaked glyphs (e.g. "trianglertSouthern" -> "Southern")
_PREFIXED_GLYPH_RE = re.compile(
    rf"\b({'|'.join(LEAKED_GLYPH_NAMES)})([A-Za-z0-9\u0900-\u097f\u0a80-\u0aff]+)\b",
    re.IGNORECASE,
)

# Regex pattern for standalone leaked glyphs
_STANDALONE_GLYPH_RE = re.compile(
    rf"\b({'|'.join(LEAKED_GLYPH_NAMES)})\b\s*",
    re.IGNORECASE,
)

# Valid labels, units, abbreviations, and list bullets that must NOT be dropped
VALID_SHORT_LABELS: Set[str] = {
    # Units
    "rs", "in", "cm", "mm", "m", "km", "g", "kg", "s", "ms", "hr", "min", "hz", "khz", "mhz", "v", "a", "w", "kw",
    # Titles & abbreviations
    "no", "no.", "dr", "dr.", "mr", "mr.", "ms", "ms.", "mrs", "mrs.", "prof", "vs", "vs.", "ex", "ex.", "fig", "fig.",
    "sec", "sec.", "art", "art.", "ch", "ch.", "vol", "vol.", "pp", "pp.", "pg", "pg.", "etc", "etc.", "al", "al.",
    # Roman numerals
    "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii",
    "i.", "ii.", "iii.", "iv.", "v.", "vi.", "vii.", "viii.", "ix.", "x.",
    # Common Indic abbreviations
    "सं.", "क्र.", "पृ.", "रु.", "कि.", "मी.", "डॉ.", "श्री", "श्रीमती",
}

# Common auxiliaries and prepositions that indicate glued words when suffix-attached
GLUED_SUFFIXES = [
    "has", "is", "was", "are", "were", "had", "have", "that", "with", "from", "for", "and", "the", "not", "this", "been",
]


@dataclass
class TextCleaningResult:
    text: str
    flags: List[str] = field(default_factory=list)
    glued_words: List[str] = field(default_factory=list)
    quality_score: float = 1.0
    garbage_rate: float = 0.0
    stats: Dict[str, int] = field(default_factory=dict)


def merge_drop_caps(text: str) -> Tuple[str, int]:
    """
    Merges newspaper / textbook drop caps where an initial uppercase letter
    is separated by whitespace from the rest of the word.
    
    Examples:
      - "T he Congress" -> "The Congress"
      - "S amajwadi Party" -> "Samajwadi Party"
      - "B ombay High Court" -> "Bombay High Court"
      - "F ive years" -> "Five years"
      - "A ll students" -> "All students"
      - "A cat sat" -> "A cat sat" (preserved: "A" before a valid word is not merged)
      - "I saw him" -> "I saw him" (preserved: "I" before a valid word is not merged)
    """
    if not text:
        return text, 0

    merge_count = 0

    def _replace_general(match: re.Match) -> str:
        nonlocal merge_count
        first = match.group(1)
        rest = match.group(2)
        merge_count += 1
        return f"{first}{rest}"

    # General pattern for uppercase letters B-H and J-Z followed by 2+ lowercase letters
    # (e.g. "T he", "S amajwadi", "B ombay", "C ongress")
    cleaned = re.sub(r"\b([B-HJ-Z])\s+([a-z]{2,})\b", _replace_general, text)

    # Special handling for 'A' and 'I' to avoid breaking valid English sentences ("A cat", "I saw")
    # Only merge 'A' or 'I' when followed by specific drop-cap suffixes that form words:
    # e.g. "A ll" -> "All", "A nd" -> "And", "I n" -> "In", "I f" -> "If", "I t" -> "It", "I s" -> "Is"
    def _replace_ai(match: re.Match) -> str:
        nonlocal merge_count
        first = match.group(1)
        rest = match.group(2)
        merge_count += 1
        return f"{first}{rest}"

    cleaned = re.sub(r"\b([AI])\s+(ll|nd|n|f|t|s|nto|ts)\b", _replace_ai, cleaned)

    return cleaned, merge_count


def rejoin_hyphenated_line_breaks(text: str) -> Tuple[str, int]:
    """
    Rejoins words split by a line-break hyphen.
    
    Example:
      - "com-\\nmand" -> "command"
      - "inter-\\n national" -> "international"
    
    Preserves:
      - "well-known" (inline hyphen)
      - "word - another" (dash with surrounding spaces)
    """
    if not text:
        return text, 0

    rejoin_count = 0

    def _replace_hyphen(match: re.Match) -> str:
        nonlocal rejoin_count
        rejoin_count += 1
        return f"{match.group(1)}{match.group(2)}"

    # Match word + hyphen at end of line + optional whitespace + newline + optional whitespace + continuation word
    pattern = re.compile(
        r"(\b[A-Za-z\u0900-\u097f\u0a80-\u0aff]+)[-\xad]\s*\n\s*([A-Za-z\u0900-\u097f\u0a80-\u0aff]+\b)"
    )
    cleaned = pattern.sub(_replace_hyphen, text)

    return cleaned, rejoin_count


def strip_leaked_symbol_glyphs(text: str) -> Tuple[str, int]:
    """
    Strips leaked typesetting glyph names (e.g. 'trianglert', 'squarebullet')
    and Unicode Private Use Area (PUA) dingbat codes.
    
    Examples:
      - "trianglertSouthern" -> "Southern"
      - "squarebulletReport" -> "Report"
      - "trianglert" -> ""
    """
    if not text:
        return text, 0

    strip_count = 0

    # 1. Strip prefixed glyph names (e.g. "trianglertSouthern" -> "Southern")
    def _replace_prefixed(match: re.Match) -> str:
        nonlocal strip_count
        strip_count += 1
        return match.group(2)

    cleaned = _PREFIXED_GLYPH_RE.sub(_replace_prefixed, text)

    # 2. Strip standalone leaked glyph names
    def _replace_standalone(match: re.Match) -> str:
        nonlocal strip_count
        strip_count += 1
        return ""

    cleaned = _STANDALONE_GLYPH_RE.sub(_replace_standalone, cleaned)

    # 3. Strip Private Use Area (PUA) symbol characters (\uf000 - \uf8ff)
    pua_count = len(re.findall(r"[\uf000-\uf8ff]", cleaned))
    if pua_count > 0:
        strip_count += pua_count
        cleaned = re.sub(r"[\uf000-\uf8ff]", "", cleaned)

    return cleaned, strip_count


def drop_short_fragments(text: str, min_chars: int = 4) -> Tuple[str, int]:
    """
    Drops isolated short unattached fragments (< 4 chars) such as printer marks
    or unattached single-glyph noise lines.
    
    Never drops numerals, roman numerals, question/list labels, or units.
    Does not drop words within flowing multi-word sentences.
    """
    if not text:
        return text, 0

    lines = text.split("\n")
    cleaned_lines = []
    dropped_count = 0

    bullet_re = re.compile(r"^(\([a-zA-Z0-9]+\)|\[[0-9]+\]|[0-9]+[\.\)]|[a-zA-Z][\.\)])$")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            cleaned_lines.append(line)
            continue

        # If line has multiple words or is long enough, keep it
        tokens = stripped.split()
        if len(tokens) > 1 or len(stripped) >= min_chars:
            cleaned_lines.append(line)
            continue

        # For single short tokens (< min_chars):
        # 1. Numerals and numbers (e.g. "12", "99", "1.2")
        if re.match(r"^[\d\.\,\-]+$", stripped):
            cleaned_lines.append(line)
            continue

        # 2. Valid bullets / list markers (e.g. "(a)", "1.", "[2]", "i.")
        if bullet_re.match(stripped):
            cleaned_lines.append(line)
            continue

        # 3. Valid labels, units, or roman numerals
        lower_token = stripped.lower()
        if lower_token in VALID_SHORT_LABELS:
            cleaned_lines.append(line)
            continue

        # Otherwise drop isolated 1-3 char noise
        dropped_count += 1

    return "\n".join(cleaned_lines), dropped_count


def rebuild_text_from_pymupdf_words(page: Any) -> str:
    """
    Reconstructs page text from PyMuPDF word bounding boxes.
    Guarantees that words with physical horizontal gaps are space-separated,
    solving glued words caused by missing space characters in PDF font streams.
    """
    try:
        words = page.get_text("words")
    except Exception:
        return page.get_text("text") or ""

    if not words:
        return ""

    # Group words by block_no, then line_no
    blocks: Dict[int, Dict[int, List[str]]] = {}
    for w in words:
        # Tuple format: (x0, y0, x1, y1, word_text, block_no, line_no, word_no)
        word_text = w[4]
        b_no = w[5]
        l_no = w[6]

        if b_no not in blocks:
            blocks[b_no] = {}
        if l_no not in blocks[b_no]:
            blocks[b_no][l_no] = []
        blocks[b_no][l_no].append(word_text)

    rebuilt_blocks: List[str] = []
    for b_no in sorted(blocks.keys()):
        b_lines = []
        for l_no in sorted(blocks[b_no].keys()):
            b_lines.append(" ".join(blocks[b_no][l_no]))
        rebuilt_blocks.append("\n".join(b_lines))

    return "\n\n".join(rebuilt_blocks)


def detect_glued_words(text: str) -> List[str]:
    """
    Identifies candidate glued words in text without destructive auto-correction.
    
    Detects patterns where common English auxiliary verbs or prepositions
    are concatenated to preceding words (e.g. 'commandhas', 'systemis', 'reportwas').
    """
    if not text:
        return []

    tokens = re.findall(r"\b[A-Za-z]{8,}\b", text)
    glued_candidates: List[str] = []

    # Valid English words ending with these letters that should not be flagged
    valid_exceptions = {
        "withhas", "whereas", "thomas", "canvas", "bias", "basis", "crisis", "analysis",
        "emphasis", "oasis", "paralysis", "thesis", "antithesis", "hypothesis", "synthesis",
        "genesis", "nemesis", "parenthesis", "debris", "axis", "praxis", "metropolis",
        "towards", "forward", "afterwards", "outwards", "inwards", "upwards", "downwards",
    }

    for token in tokens:
        lower = token.lower()
        if lower in valid_exceptions:
            continue

        for suffix in GLUED_SUFFIXES:
            if lower.endswith(suffix) and len(lower) > len(suffix) + 3:
                prefix = lower[:-len(suffix)]
                # Check that prefix looks like a distinct word (at least 4 chars)
                if len(prefix) >= 4 and not prefix.endswith(("e", "i", "u")):
                    glued_candidates.append(token)
                    break

    return list(dict.fromkeys(glued_candidates))  # Deduplicate preserving order


def clean_page_text(
    text: str,
    fitz_page: Optional[Any] = None,
) -> TextCleaningResult:
    """
    Complete text cleaning pipeline for an individual page:
    1. Rebuilds from PyMuPDF word positions if page object is available and glued words are detected.
    2. Merges drop caps ("T he" -> "The").
    3. Rejoins hyphenated line breaks ("inter-\\nnational" -> "international").
    4. Strips leaked symbol-font glyph names ("trianglertSouthern" -> "Southern").
    5. Drops isolated short fragments (< 4 chars) unless numerals or labels.
    6. Flags any remaining glued words non-destructively.
    7. Computes per-page quality score (0.0 - 1.0).
    """
    if not text:
        return TextCleaningResult(text="", flags=[], quality_score=1.0, garbage_rate=0.0)

    flags: List[str] = []
    stats: Dict[str, int] = {}
    current_text = text

    # Step 1: Rebuild from PyMuPDF word positions if glued words are suspected
    initial_glued = detect_glued_words(current_text)
    if initial_glued and fitz_page is not None:
        rebuilt = rebuild_text_from_pymupdf_words(fitz_page)
        if rebuilt and len(rebuilt) > 0.8 * len(current_text):
            current_text = rebuilt
            flags.append("rebuilt_from_word_positions")

    # Step 2: Merge drop caps
    current_text, dc_count = merge_drop_caps(current_text)
    if dc_count > 0:
        flags.append("drop_caps_merged")
        stats["drop_caps_merged"] = dc_count

    # Step 3: Rejoin hyphenated line breaks
    current_text, hb_count = rejoin_hyphenated_line_breaks(current_text)
    if hb_count > 0:
        flags.append("hyphens_rejoined")
        stats["hyphens_rejoined"] = hb_count

    # Step 4: Strip leaked symbol glyphs
    current_text, sym_count = strip_leaked_symbol_glyphs(current_text)
    if sym_count > 0:
        flags.append("symbols_stripped")
        stats["symbols_stripped"] = sym_count

    # Step 5: Drop short unattached fragments
    current_text, frag_count = drop_short_fragments(current_text)
    if frag_count > 0:
        flags.append("fragments_dropped")
        stats["fragments_dropped"] = frag_count

    # Step 6: Non-destructive glued words detection & flagging
    remaining_glued = detect_glued_words(current_text)
    if remaining_glued:
        flags.append("has_glued_words")
        stats["glued_words_count"] = len(remaining_glued)

    # Step 7: Quality score calculation
    from eval.run import compute_script_aware_garbage
    _, _, garbage_rate = compute_script_aware_garbage(current_text)

    # Base quality score
    quality_score = max(0.0, 1.0 - (garbage_rate * 2.5))

    # Apply penalty for remaining glued words or leaked symbols
    if remaining_glued:
        quality_score = max(0.0, quality_score - min(0.20, len(remaining_glued) * 0.05))

    quality_score = round(min(1.0, quality_score), 3)

    return TextCleaningResult(
        text=current_text,
        flags=flags,
        glued_words=remaining_glued,
        quality_score=quality_score,
        garbage_rate=round(garbage_rate, 4),
        stats=stats,
    )
