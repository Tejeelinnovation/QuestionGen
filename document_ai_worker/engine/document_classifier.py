"""
Evidence-Based Document Classifier for the Document AI Worker.

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
2. Evidence-based scoring using geometry, text signatures, mastheads, datelines,
   multilingual terms, script distribution, and structural layout cues.
3. Fail-safe: on error or ambiguous input, returns 'UNKNOWN' with low confidence.
   NEVER defaults to TEXTBOOK or NCERT.
4. Multilingual: supports English, Hindi (Devanagari), Gujarati, Sanskrit, and Marathi.
5. Gemini fallback: For confidence < 0.60, optionally asks Gemini Vision/Text with
   strict JSON schema, temperature 0, and disk cache by SHA256.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Multilingual Vocabulary and Pattern Dictionaries
# ---------------------------------------------------------------------------

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
    "પ્રશ્નપત્ર", "કુલ ગુણ", "સમય :", "સામાન્ય સૂચનાઓ",
    "प्रश्न-पत्र", "अधिकतम अंक", "कुल अंक", "सामान्य निर्देश", "अनुक्रमांक",
]

# Multilingual textbook and publisher markers
TEXTBOOK_KEYWORDS = [
    "table of contents", "contents", "national council of educational research",
    "ncert", "cbse", "textbook for class", "prescribed by", "foreword",
    "preface", "rationalised", "isbn", "all rights reserved",
    "reprint 202", "reprint 20", "rationalised 20", "not to be republished",
    # Hindi (Devanagari)
    "राष्ट्रीय शैक्षिक अनुसंधान और प्रशिक्षण परिषद्", "एनसीईआरटी", "सीबीएसई",
    "पाठ्यपुस्तक", "कक्षा", "पुनर्मुद्रण", "प्रस्तावना", "आमुख", "विषय-सूची",
    # Gujarati
    "ગુજરાત રાજ્ય શાળા પાઠ્યપુસ્તક મંડળ", "જીએસઈબી", "ધોરણ", "પ્રસ્તાવના", "અનુક્રમણિકા",
]

# Multilingual chapter terms
CHAPTER_TERMS = [
    # English
    "chapter", "unit", "lesson", "theme", "module", "section",
    # Hindi / Sanskrit / Marathi
    "अध्याय", "पाठ", "इकाई", "प्रकरण", "खंड", "गद्य-खंड", "काव्य-खंड", "विषय", "पाठः", "अध्यायः",
    # Gujarati
    "પ્રકરણ", "પાઠ", "એકમ", "વિભાગ",
]

# Multilingual pedagogy keywords (exercises, examples, activities)
PEDAGOGY_KEYWORDS = [
    # English
    "exercise", "solved example", "activity", "summary", "questions",
    "formula", "theorem", "lemma", "key terms", "points to remember",
    # Hindi
    "अभ्यास", "प्रश्नावली", "प्रश्नोत्तरी", "प्रश्न", "उत्तर", "गतिविधि", "उदाहरण", "सारंश",
    "महत्वपूर्ण बिंदु", "हल सहित उदाहरण",
    # Gujarati
    "સ્વાધ્યાય", "પ્રશ્નોત્તરી", "પ્રશ્નો", "ઉદાહરણ", "પ્રવૃત્તિ", "સારાંશ", "મુદ્દાઓ",
]

# NCERT Single Chapter standard file naming pattern:
# e.g. khat101.pdf (Hindi Class 11 Ch 1), khmh101.pdf (Math Class 10 Ch 1), kesy101.pdf (Sociology Ch 1)
NCERT_CHAPTER_FILE_REGEX = re.compile(r"^[a-z]{2,5}\d{1,2}(?:0[1-9]|[1-9]\d)\.pdf$", re.IGNORECASE)

# Running header pattern: e.g. "Author / Page" or "Title / 1" or "20 / BookTitle"
RUNNING_HEADER_REGEX = re.compile(r"^\s*([^\n/]{2,30})\s*/\s*(\d{1,3})\b", re.MULTILINE)
REVERSE_HEADER_REGEX = re.compile(r"^\s*(\d{1,3})\s*/\s*([^\n/]{2,30})\b", re.MULTILINE)


class DocumentClassificationResult:
    def __init__(self, kind: str, confidence: float, evidence: str):
        self.kind = kind
        self.confidence = round(confidence, 3)
        self.evidence = evidence

    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_kind": self.kind,
            "classification_confidence": self.confidence,
            "classification_evidence": self.evidence,
        }

    def __repr__(self):
        return f"<DocumentClassificationResult kind={self.kind} conf={self.confidence} evidence={self.evidence[:60]}...>"


# ---------------------------------------------------------------------------
# Script Detection Helper
# ---------------------------------------------------------------------------

def detect_script_distribution(text: str) -> Dict[str, float]:
    """
    Computes Unicode character ratios for Latin, Devanagari, and Gujarati.
    """
    if not text:
        return {"latin": 0.0, "devanagari": 0.0, "gujarati": 0.0, "other": 0.0}

    total = 0
    counts = {"latin": 0, "devanagari": 0, "gujarati": 0, "other": 0}

    for ch in text:
        if ch.isspace() or ch.isdigit():
            continue
        total += 1
        code = ord(ch)
        if (65 <= code <= 90) or (97 <= code <= 122) or (192 <= code <= 255):
            counts["latin"] += 1
        elif 0x0900 <= code <= 0x097F:
            counts["devanagari"] += 1
        elif 0x0A80 <= code <= 0x0AFF:
            counts["gujarati"] += 1
        else:
            counts["other"] += 1

    if total == 0:
        return {"latin": 0.0, "devanagari": 0.0, "gujarati": 0.0, "other": 0.0}

    return {k: round(v / total, 3) for k, v in counts.items()}


# ---------------------------------------------------------------------------
# Gemini Fallback Classifier
# ---------------------------------------------------------------------------

def classify_with_gemini_fallback(
    pdf_path: str,
    first_pages_text: str,
    last_page_text: str,
    total_pages: int,
) -> Optional[DocumentClassificationResult]:
    """
    Calls Gemini API with strict JSON schema when rule-based confidence is low (<0.60).
    Caches response locally by SHA-256 hash.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not gemini_key:
        return None

    # Calculate SHA256 of file
    try:
        hasher = hashlib.sha256()
        with open(pdf_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        file_hash = hasher.hexdigest()
    except Exception:
        return None

    cache_dir = Path(__file__).resolve().parent.parent / ".cache"
    cache_dir.mkdir(exist_ok=True)
    cache_file = cache_dir / f"gemini_class_{file_hash}.json"

    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return DocumentClassificationResult(
                    kind=data["kind"],
                    confidence=data["confidence"],
                    evidence=f"Gemini Vision/Text (cached): {data.get('reasoning', '')}",
                )
        except Exception:
            pass

    import requests

    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"

    prompt = (
        f"You are an expert document classifier. Classify this PDF document based on sample text and page count ({total_pages} pages).\n"
        f"Choose exactly one kind from:\n"
        f"- NEWSPAPER\n"
        f"- MAGAZINE\n"
        f"- WORKSHEET_OR_EXAM\n"
        f"- FULL_BOOK\n"
        f"- SINGLE_CHAPTER\n"
        f"- HANDWRITTEN_NOTES\n"
        f"- OTHER\n\n"
        f"--- SAMPLE TEXT FROM FIRST PAGES ---\n{first_pages_text[:2000]}\n\n"
        f"--- SAMPLE TEXT FROM LAST PAGE ---\n{last_page_text[:1000]}\n\n"
        f"Respond ONLY with a JSON object conforming to this schema:\n"
        f'{{"kind": "SINGLE_CHAPTER", "confidence": 0.90, "reasoning": "Brief 1-sentence reason"}}'
    )

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }

    try:
        res = requests.post(url, json=body, timeout=12)
        if res.status_code == 200:
            parsed = json.loads(res.json()["candidates"][0]["content"]["parts"][0]["text"])
            kind = parsed.get("kind", "UNKNOWN").upper()
            conf = float(parsed.get("confidence", 0.85))
            reasoning = parsed.get("reasoning", "Gemini classification")

            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump({"kind": kind, "confidence": conf, "reasoning": reasoning}, f)

            return DocumentClassificationResult(
                kind=kind,
                confidence=conf,
                evidence=f"Gemini Vision/Text: {reasoning}",
            )
    except Exception as err:
        logger.warning(f"[Classifier] Gemini fallback request error: {err}")

    return None


# ---------------------------------------------------------------------------
# Main Classification Function
# ---------------------------------------------------------------------------

def classify_document(
    pdf_path: str,
    user_document_kind: Optional[str] = None,
    doc_title: Optional[str] = None,
) -> DocumentClassificationResult:
    """
    Classifies a PDF using multi-modal evidence across English, Hindi, and Gujarati.
    Teacher-provided metadata always overrides inference (confidence=1.0).
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
        filename = os.path.basename(pdf_path)
        filename_lower = filename.lower()
        title_lower = (doc_title or "").lower()
        target_name = f"{filename_lower} {title_lower}"

        # Match known masthead in filename/title
        for masthead in NEWSPAPER_MASTHEADS:
            if masthead in target_name:
                scores["NEWSPAPER"] += 0.45
                evidence_items.append(f"Filename/title matched newspaper masthead '{masthead}'")
                break

        # Check NCERT / State board standard chapter naming convention (e.g. khat101.pdf, khmh101.pdf)
        is_ncert_chapter_file = bool(NCERT_CHAPTER_FILE_REGEX.match(filename))
        if is_ncert_chapter_file:
            scores["SINGLE_CHAPTER"] += 0.40
            evidence_items.append(f"Filename matches curriculum single-chapter convention ('{filename}')")

        # Check PDF metadata (Producer, Creator, Title)
        meta = doc.metadata or {}
        creator_producer = f"{meta.get('creator', '')} {meta.get('producer', '')}".lower()
        if any(tool in creator_producer for tool in ("newsgate", "woodwing", "quarkxpress", "panchayat")):
            scores["NEWSPAPER"] += 0.20
            evidence_items.append("PDF creation software indicates newspaper publishing workflow")

        # Sampling strategy: First 5 pages + middle page + last page
        sample_indices = list(range(min(5, total_pages)))
        if total_pages > 8:
            sample_indices.append(total_pages // 2)
        if total_pages > 5 and (total_pages - 1) not in sample_indices:
            sample_indices.append(total_pages - 1)

        total_text_chars = 0
        total_vector_fonts = 0
        total_images = 0
        has_broadsheet_dims = False
        text_samples: List[str] = []

        newspaper_keyword_hits = 0
        exam_keyword_hits = 0
        textbook_keyword_hits = 0
        pedagogy_keyword_hits = 0
        multilingual_chapter_hits = 0

        dateline_regex = re.compile(
            r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+[a-z]+\s+\d{1,2}(?:,\s*\d{4})?",
            re.IGNORECASE,
        )
        vol_issue_regex = re.compile(r"\b(?:vol\.?|volume|issue|no\.)\s*\d+", re.IGNORECASE)

        # Build multilingual chapter regex pattern
        ch_terms_pattern = "|".join(re.escape(t) for t in CHAPTER_TERMS)
        chapter_regex = re.compile(rf"^\s*(?:{ch_terms_pattern})\s*(\d+|[ivxlcdm]+|[०-९]+|[૦-૯]+)?\b", re.IGNORECASE | re.MULTILINE)

        has_dateline = False
        has_vol_issue = False
        has_running_headers = False
        has_chapter_opener_heading = False

        for s_idx, idx in enumerate(sample_indices):
            page = doc[idx]
            rect = page.rect
            width, height = rect.width, rect.height

            # Broadsheet or large newspaper dimensions
            if (width >= 700 and height >= 950) or (width >= 900 and height >= 1400):
                has_broadsheet_dims = True

            text = page.get_text("text") or ""
            text_lower = text.lower()
            text_samples.append(text)
            total_text_chars += len(text)

            fonts = page.get_fonts()
            total_vector_fonts += len(fonts)

            images = page.get_images()
            total_images += len(images)

            # Check dateline & vol/issue
            if dateline_regex.search(text):
                has_dateline = True
            if vol_issue_regex.search(text):
                has_vol_issue = True

            # Match mastheads on page 0
            if idx == 0:
                for masthead in NEWSPAPER_MASTHEADS:
                    if masthead in text_lower:
                        scores["NEWSPAPER"] += 0.50
                        evidence_items.append(f"Page 1 contains masthead '{masthead}'")
                        break
                if any(phrase in text_lower for phrase in ("largest english newspaper", "epaper", "city edition", "late city")):
                    scores["NEWSPAPER"] += 0.30
                    evidence_items.append("Explicit newspaper branding ('largest english newspaper' / 'epaper')")

                # Check for chapter-opener heading font size on page 1
                try:
                    p_dict = page.get_text("dict")
                    span_sizes = [
                        s["size"] for b in p_dict.get("blocks", []) if "lines" in b
                        for l in b["lines"] for s in l.get("spans", []) if s.get("text", "").strip()
                    ]
                    if span_sizes:
                        max_font = max(span_sizes)
                        median_font = sorted(span_sizes)[len(span_sizes) // 2]
                        if max_font >= 1.6 * median_font and max_font >= 16.0:
                            has_chapter_opener_heading = True
                except Exception:
                    pass

            # Running header / footer check
            if RUNNING_HEADER_REGEX.search(text) or REVERSE_HEADER_REGEX.search(text):
                has_running_headers = True

            # Keywords checks
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

            if chapter_regex.search(text):
                multilingual_chapter_hits += 1

        # Check native outline / TOC
        native_toc = doc.get_toc()
        has_multi_chapter_toc = len([item for item in native_toc if item[0] == 1]) >= 2 if native_toc else False

        doc.close()

        avg_chars_per_page = total_text_chars / max(len(sample_indices), 1)

        # -------------------------------------------------------------------
        # Multi-Modal Scoring
        # -------------------------------------------------------------------

        # 1. Newspaper scoring
        if has_broadsheet_dims:
            scores["NEWSPAPER"] += 0.40
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

        # 2. Exam / Worksheet scoring
        if exam_keyword_hits >= 2:
            scores["WORKSHEET_OR_EXAM"] += min(0.80, 0.35 + exam_keyword_hits * 0.10)
            evidence_items.append(f"Found {exam_keyword_hits} exam instruction/marks markers")
        if total_pages <= 5 and exam_keyword_hits >= 1:
            scores["WORKSHEET_OR_EXAM"] += 0.30

        # 3. Textbook / Single Chapter scoring
        if textbook_keyword_hits >= 1:
            scores["FULL_BOOK"] += min(0.50, textbook_keyword_hits * 0.20)
            scores["SINGLE_CHAPTER"] += min(0.40, textbook_keyword_hits * 0.20)
            evidence_items.append(f"Found {textbook_keyword_hits} textbook publication markers (NCERT/reprint/TOC)")

        if multilingual_chapter_hits >= 1:
            scores["SINGLE_CHAPTER"] += min(0.45, multilingual_chapter_hits * 0.25)
            evidence_items.append(f"Found multilingual chapter terms ({multilingual_chapter_hits} occurrences)")

        if has_chapter_opener_heading:
            scores["SINGLE_CHAPTER"] += 0.25
            evidence_items.append("Detected prominent chapter-opener title heading")

        if has_running_headers:
            scores["SINGLE_CHAPTER"] += 0.20
            scores["FULL_BOOK"] += 0.10
            evidence_items.append("Detected textbook running headers/footers with page/title division")

        if pedagogy_keyword_hits >= 2:
            scores["SINGLE_CHAPTER"] += 0.25
            scores["FULL_BOOK"] += 0.20
            evidence_items.append(f"Found {pedagogy_keyword_hits} educational pedagogy markers (exercises/activities)")

        # Page-count differentiation between Single Chapter and Full Book
        if 5 <= total_pages <= 45 and not has_multi_chapter_toc:
            # Typical single chapter length
            if scores["SINGLE_CHAPTER"] > 0.20 or scores["FULL_BOOK"] > 0.20:
                scores["SINGLE_CHAPTER"] += 0.35
                evidence_items.append(f"Document length ({total_pages} pages) matches standard single chapter unit")
        elif total_pages > 60:
            # Full book length
            scores["FULL_BOOK"] += 0.35
            evidence_items.append(f"Document length ({total_pages} pages) indicates full book / volume")

        if has_multi_chapter_toc:
            scores["FULL_BOOK"] += 0.45
            scores["SINGLE_CHAPTER"] -= 0.30
            evidence_items.append("PDF outline contains multi-chapter Table of Contents")

        # 4. Scanned Notes / Handwriting
        if avg_chars_per_page < 100 and total_images >= len(sample_indices) and total_vector_fonts == 0:
            scores["NOTES"] += 0.65
            evidence_items.append(f"Scanned bitmap pages with zero vector fonts (avg chars={avg_chars_per_page:.0f})")

        # Sort kinds by score
        sorted_kinds = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        top_kind, top_score = sorted_kinds[0]

        # Calculate rule-based confidence
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

        # 5. Gemini Fallback: If confidence is below 0.60, ask Gemini Vision/Text
        if confidence < 0.60:
            first_txt = "\n---\n".join(text_samples[:2])
            last_txt = text_samples[-1] if text_samples else ""
            gemini_res = classify_with_gemini_fallback(
                pdf_path=pdf_path,
                first_pages_text=first_txt,
                last_page_text=last_txt,
                total_pages=total_pages,
            )
            if gemini_res and gemini_res.confidence >= confidence:
                return gemini_res

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
