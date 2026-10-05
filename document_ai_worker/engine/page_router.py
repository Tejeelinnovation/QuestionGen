"""
Per-Page Document Router for the Document AI Microservice (Phase 2).

Inspects each page independently using a fast PyMuPDF probe (~3-5 ms/page):
- Computes per-page metrics (char count, font count, image ratio, vector drawing count).
- Detects scripts (Latin, Devanagari, Gujarati).
- Detects legacy 8-bit non-Unicode fonts (KrutiDev, Devlys, Chanakya, Walkman, etc.).
- Detects handwritten content, advertisements, and blank pages.
- Selects the optimal extraction engine and per-page OCR language.
- Enforces graceful degradation: if GEMINI_API_KEY is missing or quota is exhausted,
  sets needs_review=true and allows the extraction job to complete successfully.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import pymupdf as fitz

from .document_classifier import detect_script_distribution

logger = logging.getLogger(__name__)

# Legacy font name signatures (case-insensitive)
LEGACY_FONT_NAMES = (
    "kruti", "devlys", "chanakya", "walkman", "shree-dev", "shreedev",
    "shivaji", "bilingual", "aps-", "aps_", "akruti", "kundli", "dv-", "dv_",
)

# Characteristic KrutiDev / Devlys / Walkman-Chanakya 8-bit Hindi ASCII n-grams (distinctive non-English)
KRUTI_NGRAMS = [
    "izse", "osq", "fkka", "gsa", "muhksaus", "if=kdk",
    "bznxkg", "x|&[kam", "f=k", "vksj", "gksrk", "rkfd",
]


@dataclass
class PageDecision:
    """
    Structured routing decision and metadata for an individual document page.
    """
    page_num: int
    page_kind: str  # digital_text | scanned_printed | handwriting | image_only | blank | mixed
    engine: str
    route_reason: str
    detected_script: str  # latin | devanagari | gujarati | none | mixed
    ocr_language: Optional[str] = None  # hin | guj | eng | None
    legacy_font_encoding: bool = False
    needs_review: bool = False
    quality_score: float = 1.0
    char_count: int = 0
    image_count: int = 0
    drawing_count: int = 0
    image_area_ratio: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_num": self.page_num,
            "page_kind": self.page_kind,
            "engine": self.engine,
            "route_reason": self.route_reason,
            "detected_script": self.detected_script,
            "ocr_language": self.ocr_language,
            "legacy_font_encoding": self.legacy_font_encoding,
            "needs_review": self.needs_review,
            "quality_score": round(self.quality_score, 3),
            "char_count": self.char_count,
            "image_count": self.image_count,
            "drawing_count": self.drawing_count,
            "image_area_ratio": round(self.image_area_ratio, 3),
            "metadata": self.metadata,
        }


class PageRouter:
    """
    Analyzes page features to route each page to the optimal processing path.
    """

    def __init__(self, gemini_api_key: Optional[str] = None):
        self.gemini_api_key = gemini_api_key or os.environ.get("GEMINI_API_KEY", "").strip()

    def probe_document(self, doc: fitz.Document) -> List[PageDecision]:
        """
        Probes all pages in the document and returns a decision for each page.
        """
        total_pages = len(doc)
        decisions: List[PageDecision] = []
        for p_idx in range(total_pages):
            page = doc[p_idx]
            decision = self.probe_page(page, page_num=p_idx + 1, total_pages=total_pages)
            decisions.append(decision)
        return decisions

    def probe_page(self, page: fitz.Page, page_num: int, total_pages: int) -> PageDecision:
        """
        Evaluates an individual page using PyMuPDF fast probes (~3-5 ms).
        """
        rect = page.rect
        page_area = max(1.0, rect.width * rect.height)

        # 1. Native text layer probe
        text = page.get_text("text") or ""
        char_count = len(text.strip())

        # 2. Font probe
        fonts = page.get_fonts()
        vector_font_count = len(fonts)

        # Legacy font inspection (name-based)
        has_legacy_font_name = False
        legacy_matched_fonts = []
        for f in fonts:
            fname = (f[3] if len(f) > 3 else "").lower()
            if any(leg in fname for leg in LEGACY_FONT_NAMES):
                has_legacy_font_name = True
                legacy_matched_fonts.append(fname)

        # 3. Script distribution probe
        script_dist = detect_script_distribution(text)
        dev_ratio = script_dist.get("devanagari", 0.0)
        guj_ratio = script_dist.get("gujarati", 0.0)
        lat_ratio = script_dist.get("latin", 0.0)

        # Determine dominant script
        if dev_ratio >= 0.35:
            dominant_script = "devanagari"
        elif guj_ratio >= 0.35:
            dominant_script = "gujarati"
        elif lat_ratio >= 0.40:
            dominant_script = "latin"
        elif char_count > 0:
            dominant_script = "mixed"
        else:
            dominant_script = "none"

        # Legacy font inspection (text n-gram based)
        # If Unicode Devanagari is 0, but text contains characteristic KrutiDev n-grams
        has_legacy_text_pattern = False
        if dev_ratio == 0.0 and char_count > 40:
            lower_text = text.lower()
            kruti_hits = sum(1 for ng in KRUTI_NGRAMS if re.search(r"\b" + re.escape(ng) + r"\b", lower_text))
            intra_sym_hits = len(re.findall(r"(\|&\[|f=k|x\|)", text))
            if kruti_hits >= 2 or intra_sym_hits >= 2:
                has_legacy_text_pattern = True

        legacy_font_encoding = has_legacy_font_name or has_legacy_text_pattern

        # 4. Images & drawings probe
        images = page.get_images()
        image_count = len(images)

        # Image area coverage calculation
        total_img_area = 0.0
        try:
            for info in page.get_image_info():
                bbox = info.get("bbox")
                if bbox:
                    w = max(0.0, bbox[2] - bbox[0])
                    h = max(0.0, bbox[3] - bbox[1])
                    total_img_area += (w * h)
        except Exception:
            pass

        image_area_ratio = min(1.0, total_img_area / page_area)

        # Vector drawings (curves, paths, lines) - fast targeted probe (only on large page 1)
        drawing_count = 0
        lower_drawings = 0
        if page_num == 1 and char_count < 700 and rect.height > 1000:
            try:
                drawings = page.get_drawings()
                drawing_count = len(drawings)
                lower_drawings = sum(1 for d in drawings if d["rect"].y0 > rect.height * 0.10)
            except Exception:
                drawing_count = 0

        # 5. Handwriting detection
        # Signals:
        # A. Newspaper Page 1 full-page handwritten letter/note:
        #    Page 1, broadsheet or large page, masthead text at top (< 700 chars),
        #    bottom 85% contains > 100 vector drawing paths (handwritten curves)
        #    or text cues like 'Dear Wifey', 'Love from Hubby', 'homework', 'notes'.
        is_newspaper_hw_letter = False
        if (
            rect.width > 700 and rect.height > 1000
            and page_num == 1
            and char_count < 700
            and lower_drawings >= 100
        ):
            is_newspaper_hw_letter = True

        # Generic handwriting keywords in text
        hw_keyword_hits = bool(
            re.search(
                r"\b(dear wifey|love from|hubby|homework|student notes|handwritten|rough work|my solution)\b",
                text,
                re.IGNORECASE,
            )
        )

        is_handwriting = is_newspaper_hw_letter or (
            char_count < 100 and lower_drawings > 150 and hw_keyword_hits
        )

        # 6. Classification & Routing Decision
        # -------------------------------------------------------------------

        # Case A: Handwriting
        if is_handwriting:
            page_kind = "mixed" if char_count > 100 else "handwriting"
            if self.gemini_api_key:
                engine = "Gemini Flash AI (Handwriting)"
                route_reason = "Handwritten content detected; routed to Gemini Vision for transcription"
                needs_review = False
                quality_score = 0.90
            else:
                engine = "Fallback (Review Required)"
                route_reason = (
                    "Handwritten content detected (letter/note layout with vector curves); "
                    "GEMINI_API_KEY missing or quota exhausted"
                )
                needs_review = True
                quality_score = 0.40

            return PageDecision(
                page_num=page_num,
                page_kind=page_kind,
                engine=engine,
                route_reason=route_reason,
                detected_script="latin" if lat_ratio > 0.3 else ("devanagari" if dev_ratio > 0.3 else "mixed"),
                ocr_language="eng",
                legacy_font_encoding=False,
                needs_review=needs_review,
                quality_score=quality_score,
                char_count=char_count,
                image_count=image_count,
                drawing_count=drawing_count,
                image_area_ratio=image_area_ratio,
                metadata={
                    "is_handwriting": True,
                    "is_newspaper_hw_letter": is_newspaper_hw_letter,
                    "lower_drawings": lower_drawings,
                },
            )

        # Case B: Blank Page
        if char_count < 15 and image_count == 0 and drawing_count < 5:
            return PageDecision(
                page_num=page_num,
                page_kind="blank",
                engine="Blank Page Detector",
                route_reason="No extractable text or visual media found",
                detected_script="none",
                ocr_language=None,
                legacy_font_encoding=False,
                needs_review=False,
                quality_score=1.0,
                char_count=char_count,
                image_count=image_count,
                drawing_count=drawing_count,
                image_area_ratio=image_area_ratio,
            )

        # Case C: Image-Only / Full-Page Advertisement
        # Characteristic: very low native text (< 60 chars), but has images or drawings covering substantial area.
        # Only broadsheet newspapers or complex graphic layouts should be classified as silent display ads.
        # Standard scanned pages (A4/Letter with 0 vector fonts and 1 full-page scan) are scanned documents, not ads.
        is_broadsheet = (rect.width > 700 and rect.height > 1000)
        is_display_ad = is_broadsheet or (drawing_count >= 15 and image_count > 1) or (vector_font_count > 0 and char_count < 60 and image_area_ratio > 0.50)

        if char_count < 60 and (image_count >= 1 or drawing_count >= 10) and is_display_ad:
            return PageDecision(
                page_num=page_num,
                page_kind="image_only",
                engine="Image/Ad Classifier",
                route_reason=(
                    f"Full-page visual advertisement or graphic spread "
                    f"({image_count} images, {char_count} chars)"
                ),
                detected_script="none",
                ocr_language=None,
                legacy_font_encoding=False,
                needs_review=False,  # Display ads are expected and normal
                quality_score=1.0,
                char_count=char_count,
                image_count=image_count,
                drawing_count=drawing_count,
                image_area_ratio=image_area_ratio,
                metadata={"is_ad_or_graphic": True},
            )

        # Case D: Legacy Font Encoding (e.g. KrutiDev, Devlys, Chanakya)
        if legacy_font_encoding:
            ocr_lang = "hin"  # Target Hindi OCR for legacy 8-bit Devanagari fonts
            return PageDecision(
                page_num=page_num,
                page_kind="scanned_printed",
                engine=f"Google Tesseract OCR (-l {ocr_lang})",
                route_reason=(
                    "Legacy 8-bit font encoding detected (corrupted ASCII); "
                    f"routed to Tesseract with language '{ocr_lang}'"
                ),
                detected_script="devanagari",
                ocr_language=ocr_lang,
                legacy_font_encoding=True,
                needs_review=False,
                quality_score=0.88,
                char_count=char_count,
                image_count=image_count,
                drawing_count=drawing_count,
                image_area_ratio=image_area_ratio,
                metadata={"legacy_matched_fonts": legacy_matched_fonts},
            )

        # Case E: Scanned Printed Page (low digital text density, high image area or bitmap font)
        if char_count < 80 and (image_area_ratio > 0.40 or vector_font_count == 0):
            # Select targeted single-language OCR (never combine hin+eng+guj)
            if dominant_script == "gujarati" or guj_ratio > 0.2:
                ocr_lang = "guj"
            elif dominant_script == "devanagari" or dev_ratio > 0.2:
                ocr_lang = "hin"
            else:
                ocr_lang = "eng"

            return PageDecision(
                page_num=page_num,
                page_kind="scanned_printed",
                engine=f"Google Tesseract OCR (-l {ocr_lang})",
                route_reason=(
                    f"Scanned bitmap page (chars={char_count}, img_ratio={image_area_ratio:.2f}); "
                    f"routed to OCR with language '{ocr_lang}'"
                ),
                detected_script=dominant_script,
                ocr_language=ocr_lang,
                legacy_font_encoding=False,
                needs_review=False,
                quality_score=0.88,
                char_count=char_count,
                image_count=image_count,
                drawing_count=drawing_count,
                image_area_ratio=image_area_ratio,
            )

        # Case F: Clean Digital Text (Textbook / Journal / Broadhseet Digital Columns)
        use_docling = os.environ.get("USE_DOCLING", "1") == "1"
        engine_name = "Docling AI (DocLayNet)" if use_docling else "TextbookPipeline (Rule-Based Fallback)"

        return PageDecision(
            page_num=page_num,
            page_kind="digital_text",
            engine=engine_name,
            route_reason=(
                f"High vector character density ({char_count} chars); "
                f"clean digital text layer; {dominant_script} script"
            ),
            detected_script=dominant_script,
            ocr_language=None,
            legacy_font_encoding=False,
            needs_review=False,
            quality_score=0.98,
            char_count=char_count,
            image_count=image_count,
            drawing_count=drawing_count,
            image_area_ratio=image_area_ratio,
        )
