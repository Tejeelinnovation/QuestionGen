"""
Evidence-Based Document Classifier for Content Ingestion.

Classifies incoming PDFs into document kinds:
- NEWSPAPER
- MAGAZINE
- WORKSHEET_OR_EXAM
- FULL_BOOK
- SINGLE_CHAPTER
- NOTES / HANDWRITTEN_NOTES
- OTHER / UNKNOWN

Design Principles:
1. Teacher-provided metadata always overrides inference (confidence=1.0).
2. Evidence-based scoring using geometry, text signatures, mastheads, datelines, and TOC cues.
3. Fail-safe: on error or ambiguous input, returns 'UNKNOWN' with low confidence.
   NEVER defaults to TEXTBOOK or NCERT.
"""

import os
import re
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

NEWSPAPER_MASTHEADS = [
    "times of india", "hindustan times", "the hindu", "indian express",
    "dainik jagran", "divya bhaskar", "dainik bhaskar", "amar ujala",
    "navbharat times", "the telegraph", "deccan herald", "the tribune",
    "economic times", "financial express", "lokmat", "mint", "business standard",
    "the statesman", "deccan chronicle", "pioneer", "new indian express",
]

NEWSPAPER_KEYWORDS = [
    "epaper", "city edition", "late city", "vol.", "volume", "invitation price",
    "rni no", "regd no", "air surcharge", "bureau", "correspondent",
    "times nation", "times city", "editorial page", "op-ed", "sports desk",
    "pti", "ians", "reuters", "ani", "classifieds",
]

EXAM_KEYWORDS = [
    "time allowed", "maximum marks", "max marks", "general instructions",
    "question paper", "all questions are compulsory", "sample question paper",
    "marking scheme", "section a", "section b", "section c", "roll no",
]

TEXTBOOK_KEYWORDS = [
    "table of contents", "contents", "national council of educational research",
    "ncert", "cbse", "textbook for class", "prescribed by", "foreword",
    "preface", "rationalised", "isbn", "all rights reserved",
]

PEDAGOGY_KEYWORDS = [
    "exercise", "solved example", "activity", "summary", "questions",
    "formula", "theorem", "lemma",
]


class DocumentClassificationResult:
    def __init__(self, kind: str, confidence: float, evidence: str):
        self.kind = kind
        self.confidence = round(confidence, 3)
        self.evidence = evidence

    def to_dict(self) -> Dict[str, any]:
        return {
            "document_kind": self.kind,
            "classification_confidence": self.confidence,
            "classification_evidence": self.evidence,
        }

    def __repr__(self):
        return f"<DocumentClassificationResult kind={self.kind} conf={self.confidence} evidence={self.evidence[:60]}...>"


def classify_document(
    pdf_path: str,
    user_document_kind: Optional[str] = None,
    doc_title: Optional[str] = None,
) -> DocumentClassificationResult:
    """
    Classifies a PDF using multi-modal evidence.
    If user_document_kind is specified (not AUTO/empty/None), honors user choice.
    """
    # 1. Teacher-provided metadata overrides inference
    cleaned_user_kind = (user_document_kind or "").strip().upper()
    if cleaned_user_kind and cleaned_user_kind not in ("AUTO", "UNKNOWN", "NONE"):
        logger.info(f"[Classifier] Teacher override: '{cleaned_user_kind}'")
        return DocumentClassificationResult(
            kind=cleaned_user_kind,
            confidence=1.0,
            evidence=f"Teacher specified metadata: {cleaned_user_kind}",
        )

    # 2. Safety check on file
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        return DocumentClassificationResult(
            kind="UNKNOWN",
            confidence=0.0,
            evidence="File does not exist or is empty.",
        )

    import pymupdf as fitz

    try:
        doc = fitz.open(pdf_path)
    except Exception as err:
        logger.warning(f"[Classifier] Failed to open PDF '{pdf_path}': {err}")
        return DocumentClassificationResult(
            kind="UNKNOWN",
            confidence=0.0,
            evidence=f"PDF open error: {str(err)}",
        )

    try:
        total_pages = len(doc)
        if total_pages == 0:
            doc.close()
            return DocumentClassificationResult(
                kind="UNKNOWN",
                confidence=0.0,
                evidence="PDF has 0 pages.",
            )

        evidence_items: List[str] = []
        scores: Dict[str, float] = {
            "NEWSPAPER": 0.0,
            "MAGAZINE": 0.0,
            "WORKSHEET_OR_EXAM": 0.0,
            "FULL_BOOK": 0.0,
            "SINGLE_CHAPTER": 0.0,
            "NOTES": 0.0,
            "OTHER": 0.0,
        }

        # Inspect filename and title
        filename_lower = os.path.basename(pdf_path).lower()
        title_lower = (doc_title or "").lower()
        target_name = f"{filename_lower} {title_lower}"

        for masthead in NEWSPAPER_MASTHEADS:
            if masthead in target_name:
                scores["NEWSPAPER"] += 0.45
                evidence_items.append(f"Filename/title matched newspaper masthead '{masthead}'")
                break

        meta = doc.metadata or {}
        creator_producer = f"{meta.get('creator', '')} {meta.get('producer', '')}".lower()
        if any(tool in creator_producer for tool in ("newsgate", "woodwing", "quarkxpress", "indesign", "panchayat")):
            scores["NEWSPAPER"] += 0.2
            evidence_items.append(f"PDF creation software indicates publishing workflow ({creator_producer[:30]})")

        sample_indices = list(range(min(5, total_pages)))
        if total_pages > 8:
            sample_indices.append(total_pages // 2)

        total_text_chars = 0
        total_vector_fonts = 0
        total_images = 0
        has_broadsheet_dims = False

        newspaper_keyword_hits = 0
        exam_keyword_hits = 0
        textbook_keyword_hits = 0
        pedagogy_keyword_hits = 0
        chapter_headings_found: List[str] = []

        dateline_regex = re.compile(
            r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+[a-z]+\s+\d{1,2}(?:,\s*\d{4})?",
            re.IGNORECASE,
        )
        vol_issue_regex = re.compile(r"\b(?:vol\.?|volume|issue|no\.)\s*\d+", re.IGNORECASE)
        chapter_regex = re.compile(r"^\s*(?:chapter|unit|lesson)\s+(\d+|[ivxlcdm]+)\b", re.IGNORECASE | re.MULTILINE)
        has_dateline = False
        has_vol_issue = False

        for idx in sample_indices:
            page = doc[idx]
            rect = page.rect
            width, height = rect.width, rect.height

            if (width >= 700 and height >= 950) or (width >= 900 and height >= 1400):
                has_broadsheet_dims = True

            text = page.get_text("text") or ""
            text_lower = text.lower()
            total_text_chars += len(text)

            fonts = page.get_fonts()
            total_vector_fonts += len(fonts)

            images = page.get_images()
            total_images += len(images)

            if dateline_regex.search(text):
                has_dateline = True
            if vol_issue_regex.search(text):
                has_vol_issue = True

            if idx == 0:
                for masthead in NEWSPAPER_MASTHEADS:
                    if masthead in text_lower:
                        scores["NEWSPAPER"] += 0.5
                        evidence_items.append(f"Page 1 contains masthead '{masthead}'")
                        break
                if "india’s largest english newspaper" in text_lower or "largest english newspaper" in text_lower or "epaper" in text_lower:
                    scores["NEWSPAPER"] += 0.3
                    evidence_items.append("Explicit newspaper branding ('largest english newspaper' / 'epaper')")

            for kw in NEWSPAPER_KEYWORDS:
                if kw in text_lower:
                    newspaper_keyword_hits += 1

            for kw in EXAM_KEYWORDS:
                if kw in text_lower:
                    exam_keyword_hits += 1

            for kw in TEXTBOOK_KEYWORDS:
                if kw in text_lower:
                    textbook_keyword_hits += 1

            for kw in PEDAGOGY_KEYWORDS:
                if kw in text_lower:
                    pedagogy_keyword_hits += 1

            ch_matches = chapter_regex.findall(text)
            if ch_matches:
                chapter_headings_found.extend(ch_matches)

        doc.close()

        avg_chars_per_page = total_text_chars / max(len(sample_indices), 1)

        if has_broadsheet_dims:
            scores["NEWSPAPER"] += 0.35
            evidence_items.append("Broadsheet page dimensions (large print layout)")

        if has_dateline:
            scores["NEWSPAPER"] += 0.25
            evidence_items.append("Found newspaper dateline (Day, Month Date format)")

        if has_vol_issue:
            scores["NEWSPAPER"] += 0.15
            scores["MAGAZINE"] += 0.10
            evidence_items.append("Found volume/issue publication stamp")

        if newspaper_keyword_hits >= 2:
            scores["NEWSPAPER"] += min(0.35, newspaper_keyword_hits * 0.08)
            evidence_items.append(f"Found {newspaper_keyword_hits} newspaper keywords (edition/reporters/sections)")

        if exam_keyword_hits >= 2:
            scores["WORKSHEET_OR_EXAM"] += min(0.8, 0.3 + exam_keyword_hits * 0.1)
            evidence_items.append(f"Found {exam_keyword_hits} exam instruction/marks markers")

        if textbook_keyword_hits >= 1:
            scores["FULL_BOOK"] += min(0.6, textbook_keyword_hits * 0.2)
            evidence_items.append(f"Found {textbook_keyword_hits} textbook publication markers (NCERT/TOC/CBSE)")

        if len(set(chapter_headings_found)) >= 2:
            scores["FULL_BOOK"] += 0.4
            evidence_items.append(f"Found {len(set(chapter_headings_found))} distinct chapter headers")
        elif len(set(chapter_headings_found)) == 1:
            scores["SINGLE_CHAPTER"] += 0.35
            evidence_items.append("Found single chapter header")

        if pedagogy_keyword_hits >= 3:
            scores["FULL_BOOK"] += 0.2
            scores["SINGLE_CHAPTER"] += 0.2
            evidence_items.append(f"Found {pedagogy_keyword_hits} educational pedagogy markers (exercise/activity/formula)")

        if avg_chars_per_page < 100 and total_images >= len(sample_indices) and total_vector_fonts == 0:
            scores["NOTES"] += 0.65
            evidence_items.append(f"Scanned bitmap pages with zero vector fonts (avg chars={avg_chars_per_page:.0f})")

        sorted_kinds = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        top_kind, top_score = sorted_kinds[0]

        if top_score >= 0.45:
            confidence = min(0.98, max(0.60, top_score))
            assigned_kind = top_kind
        elif top_score >= 0.25:
            confidence = round(top_score, 2)
            assigned_kind = top_kind
        else:
            assigned_kind = "UNKNOWN"
            confidence = 0.20
            evidence_items.append("Insufficient distinct domain markers detected")

        evidence_str = "; ".join(evidence_items) if evidence_items else "No strong markers detected."
        logger.info(f"[Classifier] Result: {assigned_kind} (conf={confidence:.2f}, evidence={evidence_str})")

        return DocumentClassificationResult(
            kind=assigned_kind,
            confidence=confidence,
            evidence=evidence_str,
        )

    except Exception as exc:
        logger.warning(f"[Classifier] Probe encountered unexpected error: {exc}", exc_info=True)
        return DocumentClassificationResult(
            kind="UNKNOWN",
            confidence=0.10,
            evidence=f"Classifier error: {str(exc)}",
        )
