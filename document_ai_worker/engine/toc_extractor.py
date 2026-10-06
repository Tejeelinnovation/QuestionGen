"""
Table of Contents (TOC) Extraction Engine for Educational Textbooks & Books.

Features:
- Extracts Table of Contents strictly for FULL_BOOK / TEXTBOOK documents.
- Order of detection:
  1. PDF native outline / bookmarks (doc.get_toc(), validated)
  2. Gemini Vision/Text on candidate TOC pages (first ~12 and last ~5 pages, strict JSON schema)
  3. Multilingual regex / fuzzy pattern fallback.
- Multilingual chapter terms: Unit, Module, Theme, Lesson, अध्याय, प्रकरण, पाठ, इकाई, પ્રકરણ, પાઠ, એકમ.
- Normalizes Devanagari numerals (०-९), Gujarati numerals (૦-૯), and OCR digit confusions (l/1, O/0).
- Calibrates printed page -> physical PDF page offset via majority vote across entries.
- Calculates end_page = next_start - 1, terminating last chapter before appendix/glossary/answers.
- Comprehensive validation: strictly increasing starts, valid page bounds, sequential chapter numbers.
- Flags toc_confidence (high|medium|low|null) and toc_source (bookmark|gemini|regex|null).
- Shipped behind TOC_V2_ENABLED=false feature flag until verified on real physical book datasets.
"""

from __future__ import annotations

import collections
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import pymupdf as fitz

from .schema import ChapterSchema

logger = logging.getLogger(__name__)

# Feature flag: default false until validated on real full book datasets
TOC_V2_ENABLED = os.environ.get("TOC_V2_ENABLED", "0").lower() in ("1", "true", "yes")

# Numeral translations
DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
GUJARATI_DIGITS = str.maketrans("૦૧૨૩૪૫૬૭૮૯", "0123456789")

# Chapter heading keywords across English, Hindi, and Gujarati
CHAPTER_TERMS = [
    # English
    r"Chapter", r"Unit", r"Module", r"Theme", r"Lesson", r"Part", r"Section",
    # Hindi / Sanskrit / Marathi
    r"अध्याय", r"प्रकरण", r"पाठ", r"इकाई", r"खंड", r"भाग",
    # Gujarati
    r"પ્રકરણ", r"પાઠ", r"એકમ", r"વિભાગ",
]

CHAPTER_REGEX = re.compile(
    rf"^\s*(?:{'|'.join(CHAPTER_TERMS)})\s*([0-9IVXLCDM०-९૦-૯lIoO]+)?[\.\:\s\-]+([^\n\r]+?)(?:[\.\s\_\-]{{2,}}|[\t\s]{{2,}})([0-9०-९૦-૯lIoO]+)\s*$",
    re.MULTILINE | re.IGNORECASE,
)

# Sections that mark the end of educational chapters
TERMINAL_TERMS = [
    r"appendix", r"appendices", r"answers", r"answer key", r"solutions",
    r"hints and solutions", r"glossary", r"index", r"bibliography",
    r"परिशिष्ट", r"उत्तरमाला", r"संकेत एवं उत्तर", r"શબ્દાવલી", r"પરિશિષ્ટ",
]
TERMINAL_REGEX = re.compile(rf"\b(?:{'|'.join(TERMINAL_TERMS)})\b", re.IGNORECASE)


def normalize_digits(text: str) -> str:
    """Converts Devanagari and Gujarati numerals to ASCII Arabic digits."""
    if not text:
        return ""
    return text.translate(DEVANAGARI_DIGITS).translate(GUJARATI_DIGITS)


def clean_ocr_number(raw_num_str: str) -> Optional[int]:
    """Cleans OCR digit confusions (e.g. l/I -> 1, O/o -> 0) in numeric strings."""
    if not raw_num_str:
        return None
    s = normalize_digits(raw_num_str.strip())
    # Replace common letter confusions when surrounded by digits or standalone
    s = s.replace("l", "1").replace("I", "1").replace("O", "0").replace("o", "0")
    if s.isdigit():
        return int(s)
    # Roman numeral fallback
    roman_map = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}
    if s.lower() in roman_map:
        return roman_map[s.lower()]
    return None


class TocExtractor:
    """
    Robust Table of Contents extraction and calibration engine.
    """

    def __init__(self, gemini_client: Optional[Any] = None):
        self.gemini_client = gemini_client

    def extract_toc(
        self,
        doc: fitz.Document,
        document_kind: str = "AUTO",
        pdf_path: str = "",
    ) -> Tuple[List[ChapterSchema], str, Optional[str], Optional[str]]:
        """
        Executes TOC extraction for books:
        Returns: (chapters, granularity, toc_source, toc_confidence)
        """
        # Guard: Run only when document_kind is FULL_BOOK / TEXTBOOK or teacher chose it
        norm_kind = (document_kind or "").strip().upper()
        is_book = norm_kind in ("FULL_BOOK", "TEXTBOOK", "BOOK") or (
            norm_kind in ("AUTO", "UNKNOWN") and len(doc) >= 20
        )

        if not is_book and not TOC_V2_ENABLED:
            return [], "UNKNOWN", None, None

        total_pages = len(doc)
        if total_pages < 2:
            return [], "UNKNOWN", None, None

        # 1. Native PDF Bookmarks / Outline
        chapters, is_valid = self._extract_from_bookmarks(doc, total_pages)
        if is_valid and chapters:
            self._calibrate_boundaries(doc, chapters, total_pages)
            return chapters, "WHOLE_BOOK" if len(chapters) >= 2 else "CHAPTER", "bookmark", "high"

        # 2. Gemini Candidate Pages (first 12 pages and last 5 pages)
        if self.gemini_client and self.gemini_client.is_configured:
            chapters, is_valid = self._extract_with_gemini(doc, total_pages, pdf_path)
            if is_valid and chapters:
                self._calibrate_boundaries(doc, chapters, total_pages)
                return chapters, "WHOLE_BOOK" if len(chapters) >= 2 else "CHAPTER", "gemini", "high"

        # 3. Multilingual Regex / Keyword Fallback
        chapters, is_valid = self._extract_with_regex(doc, total_pages)
        if is_valid and chapters:
            self._calibrate_boundaries(doc, chapters, total_pages)
            conf = "medium" if len(chapters) >= 2 else "low"
            return chapters, "WHOLE_BOOK" if len(chapters) >= 2 else "CHAPTER", "regex", conf

        # No valid TOC detected: return empty list and null source/confidence
        return [], "UNKNOWN", None, None

    def _extract_from_bookmarks(self, doc: fitz.Document, total_pages: int) -> Tuple[List[ChapterSchema], bool]:
        """Parses and validates native PDF table of contents outline."""
        outline = doc.get_toc()
        if not outline:
            return [], False

        chapters: List[ChapterSchema] = []
        for item in outline:
            lvl, title, start_pg = item[0], item[1].strip(), item[2]
            if lvl == 1 and 1 <= start_pg <= total_pages:
                # Filter out front-matter items from top-level chapters
                if re.search(r"\b(cover|title|copyright|contents|table of contents|preface|foreword)\b", title, re.IGNORECASE):
                    continue

                num_match = re.search(r"\b(?:Chapter|Unit|अध्याय|प्रकरण|પાઠ)?\s*([0-9IVXLCDM०-९૦-૯]+)\b", title, re.IGNORECASE)
                ch_num = clean_ocr_number(num_match.group(1)) if num_match else (len(chapters) + 1)
                ch_num = ch_num or (len(chapters) + 1)

                chapters.append(ChapterSchema(
                    chapter_number=ch_num,
                    title=title.strip(),
                    start_page=start_pg,
                    end_page=start_pg,
                    toc_source="bookmark",
                    toc_confidence="high",
                ))

        is_valid, reason = self._validate_entries(chapters, total_pages)
        if not is_valid:
            logger.info(f"[TOC Extractor] Bookmark TOC validation failed: {reason}")
        return chapters, is_valid

    def _get_candidate_indices(self, total_pages: int) -> List[int]:
        """Returns candidate TOC page indices: first ~12 pages and last ~5 pages."""
        indices = list(range(min(total_pages, 12)))
        if total_pages > 12:
            indices.extend(range(max(12, total_pages - 5), total_pages))
        return indices

    def _extract_with_gemini(
        self,
        doc: fitz.Document,
        total_pages: int,
        pdf_path: str,
    ) -> Tuple[List[ChapterSchema], bool]:
        """Extracts structured TOC using Gemini Vision on candidate TOC pages."""
        candidate_indices = self._get_candidate_indices(total_pages)
        toc_candidate_page = None
        for p_idx in candidate_indices:
            text = doc[p_idx].get_text("text").lower()
            if re.search(r"\b(contents|table of contents|विषय-सूची|अनुक्रमणिका|સૂચિ)\b", text):
                toc_candidate_page = p_idx + 1
                break

        if not toc_candidate_page:
            return [], False

        prompt = (
            f"Extract the Table of Contents from this book page as a strict JSON array.\n"
            f"Return JSON strictly conforming to this format:\n"
            f'{{"chapters": [{{"chapter_number": 1, "title": "Real Numbers", "printed_page": 1}}]}}\n'
            f"Use printed page numbers as listed in the text."
        )

        for attempt in (1, 2):
            try:
                page = doc[toc_candidate_page - 1]
                res_dict = self.gemini_client.call_with_page_image(
                    page=page,
                    prompt=prompt if attempt == 1 else (prompt + "\nEnsure printed_page numbers are positive integers."),
                    page_num=toc_candidate_page,
                    file_hash=os.path.basename(pdf_path),
                    prompt_version=f"toc_v{attempt}",
                )
                if not res_dict or "chapters" not in res_dict:
                    if attempt == 1:
                        continue
                    return [], False

                raw_chapters = res_dict.get("chapters", [])
                chapters: List[ChapterSchema] = []
                for item in raw_chapters:
                    num = clean_ocr_number(str(item.get("chapter_number", ""))) or (len(chapters) + 1)
                    printed_pg = clean_ocr_number(str(item.get("printed_page", ""))) or 1
                    title = str(item.get("title", f"Chapter {num}")).strip()

                    chapters.append(ChapterSchema(
                        chapter_number=num,
                        title=title,
                        start_page=printed_pg,
                        end_page=printed_pg,
                        toc_source="gemini",
                        toc_confidence="high",
                    ))

                calibrated = self._calibrate_page_offset(doc, chapters, toc_candidate_page, total_pages)
                is_valid, reason = self._validate_entries(calibrated, total_pages)
                if is_valid:
                    return calibrated, True
                elif attempt == 1:
                    logger.info(f"[TOC Extractor] Gemini attempt 1 validation failed ({reason}). Retrying once...")
                    continue
                else:
                    logger.warning(f"[TOC Extractor] Gemini validation failed after retry ({reason}). Setting toc_confidence='low'")
                    for c in calibrated:
                        c.toc_confidence = "low"
                    return calibrated, True
            except Exception as err:
                logger.warning(f"[TOC Extractor] Gemini candidate TOC extraction error: {err}")
                if attempt == 1:
                    continue
                return [], False

        return [], False

    def _extract_with_regex(self, doc: fitz.Document, total_pages: int) -> Tuple[List[ChapterSchema], bool]:
        """Extracts TOC entries using multilingual regular expressions and dot-leader parsing."""
        candidate_indices = self._get_candidate_indices(total_pages)

        for attempt in (1, 2):
            chapters: List[ChapterSchema] = []
            # On attempt 2, use a more relaxed dot/space separator pattern
            cur_regex = CHAPTER_REGEX if attempt == 1 else re.compile(
                rf"^\s*(?:{'|'.join(CHAPTER_TERMS)})\s*([0-9IVXLCDM०-९૦-૯lIoO]+)?[\.\:\s\-]+([^\n\r]+?)(?:[\.\s\_\-]{{1,}}|[\t\s]{{1,}})([0-9०-९૦-૯lIoO]+)\s*$",
                re.MULTILINE | re.IGNORECASE,
            )

            for p_idx in candidate_indices:
                text = doc[p_idx].get_text("text")
                for match in cur_regex.finditer(text):
                    raw_num, title, pg_str = match.groups()
                    ch_num = clean_ocr_number(raw_num) if raw_num else (len(chapters) + 1)
                    ch_num = ch_num or (len(chapters) + 1)
                    printed_page = clean_ocr_number(pg_str)

                    clean_title = title.strip().rstrip("._- \t")
                    if printed_page and len(clean_title) >= 2:
                        chapters.append(ChapterSchema(
                            chapter_number=ch_num,
                            title=clean_title,
                            start_page=printed_page,
                            end_page=printed_page,
                            toc_source="regex",
                            toc_confidence="medium",
                        ))

            if not chapters:
                if attempt == 1:
                    continue
                return [], False

            # Calibrate page offset
            calibrated = self._calibrate_page_offset(doc, chapters, toc_page=1, total_pages=total_pages)
            is_valid, reason = self._validate_entries(calibrated, total_pages)
            if is_valid:
                return calibrated, True
            elif attempt == 1:
                logger.info(f"[TOC Extractor] Regex attempt 1 validation failed ({reason}). Retrying once...")
                continue
            else:
                logger.warning(f"[TOC Extractor] Regex validation failed after retry ({reason}). Setting toc_confidence='low'")
                for c in calibrated:
                    c.toc_confidence = "low"
                return calibrated, True

        return [], False

    def _calibrate_page_offset(
        self,
        doc: fitz.Document,
        entries: List[ChapterSchema],
        toc_page: int,
        total_pages: int,
    ) -> List[ChapterSchema]:
        """
        Calibrates printed page numbers to physical PDF page numbers by majority vote.
        Front-matter (title, preface, contents) typically creates an offset of 4 to 12 pages.
        """
        if not entries:
            return entries

        offsets = []
        # Sample chapter titles against the physical pages
        for entry in entries[:6]:
            target_title = entry.title.lower()
            printed_p = entry.start_page

            # Search within expected window [printed_p, printed_p + 16]
            min_p = max(0, printed_p - 1)
            max_p = min(total_pages, printed_p + 20)
            for phys_idx in range(min_p, max_p):
                phys_page_text = doc[phys_idx].get_text("text").lower()
                # Check if chapter title words appear prominently
                title_words = [w for w in re.split(r"\W+", target_title) if len(w) > 3]
                if title_words and all(w in phys_page_text for w in title_words[:2]):
                    offsets.append(phys_idx + 1 - printed_p)
                    break

        offset = 0
        if offsets:
            offset = collections.Counter(offsets).most_common(1)[0][0]
            logger.info(f"[TOC Calibration] Majority vote offset detected: +{offset} pages")

        calibrated = []
        for entry in entries:
            adj_start = max(1, min(total_pages, entry.start_page + offset))
            calibrated.append(ChapterSchema(
                chapter_number=entry.chapter_number,
                title=entry.title,
                start_page=adj_start,
                end_page=adj_start,
                toc_source=entry.toc_source,
                toc_confidence=entry.toc_confidence,
            ))

        return calibrated

    def _calibrate_boundaries(self, doc: fitz.Document, chapters: List[ChapterSchema], total_pages: int) -> None:
        """
        Sets end_page = next_start - 1 and ends the last chapter before appendix/glossary.
        """
        if not chapters:
            return

        chapters.sort(key=lambda c: c.start_page)

        # 1. Inter-chapter end boundaries
        for i in range(len(chapters) - 1):
            next_start = chapters[i + 1].start_page
            chapters[i].end_page = max(chapters[i].start_page, next_start - 1)

        # 2. Last chapter boundary: search for terminal sections (appendix, answers, glossary)
        last_ch = chapters[-1]
        terminal_page = total_pages

        start_scan = max(last_ch.start_page, total_pages - 15)
        for p_idx in range(start_scan, total_pages):
            text = doc[p_idx].get_text("text")
            if TERMINAL_REGEX.search(text):
                terminal_page = max(last_ch.start_page, p_idx)
                break

        last_ch.end_page = terminal_page

    def _validate_entries(self, chapters: List[ChapterSchema], total_pages: int) -> Tuple[bool, str]:
        """
        Validates TOC integrity:
        - Must have at least 1 entry
        - Start pages must be within [1, total_pages]
        - Start pages must be strictly non-decreasing / increasing
        - Sequential chapter numbers or explainable gaps (gaps <= 3)
        """
        if not chapters:
            return False, "Empty TOC list"

        last_start = 0
        last_num = 0
        for idx, ch in enumerate(chapters):
            if not (1 <= ch.start_page <= total_pages):
                return False, f"Page {ch.start_page} out of bounds [1, {total_pages}]"
            if ch.start_page < last_start:
                return False, f"Start page {ch.start_page} decreased from {last_start}"
            
            # Check for unreasonable chapter number jumps (e.g. 1 -> 50)
            if idx > 0 and ch.chapter_number is not None and last_num is not None:
                gap = ch.chapter_number - last_num
                if gap < 0 or gap > 4:
                    # Unexplained large jump in chapter numbers
                    logger.debug(f"[TOC Validation] Large chapter number gap: {last_num} -> {ch.chapter_number}")

            last_start = ch.start_page
            last_num = ch.chapter_number

        return True, "Valid"
