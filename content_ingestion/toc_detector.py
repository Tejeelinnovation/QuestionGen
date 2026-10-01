"""
Table of Contents (TOC) and Granularity Detector.

Analyzes the initial pages of a PDF to:
1. Detect document granularity: WHOLE_BOOK vs. CHAPTER vs. TOPIC.
2. Extract chapter names, numbers, and start/end page boundaries.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple
import pymupdf as fitz

from .models import GranularityDetected


class TocDetector:
    """
    Detects index/table-of-contents and document granularity.
    """

    TOC_KEYWORDS = re.compile(r"\b(contents|table of contents|index|curriculum)\b", re.IGNORECASE)
    CHAPTER_HEADING_PATTERN = re.compile(
        r"^(?:Chapter|Unit|Lesson)\s*([0-9IVXLCDM]+)[\.\:\s\-]+([^\n\r]+)",
        re.IGNORECASE,
    )
    # Pattern matching lines like "1. Real Numbers ...... 1" or "Chapter 2 Polynomials 25"
    TOC_LINE_PATTERN = re.compile(
        r"(?:Chapter\s*)?([0-9IVXLCDM]+)[\.\:\s\-]+([A-Za-z0-9\s\,\'\-]+?)\s*(?:\.{2,}|\s{2,}|\t+)\s*([0-9]+)",
        re.MULTILINE,
    )

    def analyze_document(self, doc: fitz.Document) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Analyzes the document and returns (granularity_string, table_of_contents_list).
        """
        total_pages = len(doc)
        if total_pages == 0:
            return GranularityDetected.UNKNOWN, []

        # 1. Search for explicit Table of Contents in the first 15 pages
        scan_limit = min(15, total_pages)
        toc_entries = []

        for p_idx in range(scan_limit):
            page_text = doc[p_idx].get_text("text")
            if self.TOC_KEYWORDS.search(page_text):
                # Found a potential TOC page
                matches = self.TOC_LINE_PATTERN.findall(page_text)
                for ch_num_str, title, page_str in matches:
                    try:
                        page_num = int(page_str)
                        toc_entries.append({
                            "chapter_number": self._parse_num(ch_num_str),
                            "title": title.strip(),
                            "start_page": page_num,
                            "end_page": page_num,  # Will adjust in post-processing
                        })
                    except ValueError:
                        continue

        # If explicit TOC lines were found
        if len(toc_entries) >= 2:
            toc_entries = self._normalize_page_ranges(toc_entries, total_pages)
            return GranularityDetected.WHOLE_BOOK, toc_entries

        # Fallback to single topic for very short documents
        if total_pages <= 5:
            return GranularityDetected.TOPIC, []

        # 2. Heuristic scan: Look for large "Chapter X" headings across all pages
        chapter_pages = []
        for p_idx in range(total_pages):
            page_text = doc[p_idx].get_text("text")
            first_few_lines = "\n".join(page_text.splitlines()[:10])
            heading_match = self.CHAPTER_HEADING_PATTERN.search(first_few_lines)
            if heading_match:
                ch_num_str, ch_title = heading_match.groups()
                chapter_pages.append({
                    "chapter_number": self._parse_num(ch_num_str),
                    "title": ch_title.strip()[:100],
                    "start_page": p_idx + 1,
                    "end_page": p_idx + 1,
                })

        if len(chapter_pages) >= 2:
            chapter_pages = self._normalize_page_ranges(chapter_pages, total_pages)
            return GranularityDetected.WHOLE_BOOK, chapter_pages

        if total_pages >= 15:
            # Multi-page document without multiple chapters detected is treated as a single Chapter
            return GranularityDetected.CHAPTER, [
                {"chapter_number": 1, "title": "Main Chapter", "start_page": 1, "end_page": total_pages}
            ]

        return GranularityDetected.TOPIC, []

    def _normalize_page_ranges(self, entries: List[Dict[str, Any]], total_pages: int) -> List[Dict[str, Any]]:
        """
        Sets end_page of chapter i to (start_page of chapter i+1 - 1).
        """
        for i in range(len(entries) - 1):
            next_start = entries[i + 1]["start_page"]
            entries[i]["end_page"] = max(entries[i]["start_page"], next_start - 1)
        if entries:
            entries[-1]["end_page"] = total_pages
        return entries

    def _parse_num(self, val: str) -> int:
        val = val.strip()
        if val.isdigit():
            return int(val)
        roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}
        return roman_map.get(val.upper(), 1)
