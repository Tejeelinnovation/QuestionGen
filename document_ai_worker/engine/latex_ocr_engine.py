"""
Lightweight Local Math Formula OCR Engine powered by RapidLaTeXOCR (ONNX Runtime).
Converts cropped formula images into clean, precise LaTeX equations on CPU in ~60-90ms.

Features:
- CPU-friendly ONNX Runtime inference (no GPU required).
- Lazy singleton initialization: loads model once per worker process.
- Direct PyMuPDF viewport clipping integration with whitespace padding.
- Graceful degradation: falls back cleanly if dependencies are absent.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any, List, Optional, Tuple, Union

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def sanitize_latex(s: str) -> str:
    """
    Cleans OCR-extracted formula strings by stripping trailing equation numbers,
    fixing mismatched delimiter brackets, and removing runaway tokens.
    Applicable across all academic subjects (Math, Physics, Chemistry, Economics, etc.).
    """
    if not s or not s.strip():
        return ""

    cleaned = s.strip()

    # 1. Remove outer math wrappers if doubled ($$...$$ or $...$)
    if cleaned.startswith("$$") and cleaned.endswith("$$") and len(cleaned) > 4:
        cleaned = cleaned[2:-2].strip()
    elif cleaned.startswith("$") and cleaned.endswith("$") and len(cleaned) > 2:
        cleaned = cleaned[1:-1].strip()

    # 2. Strip trailing equation labels/numbers captured at the end of formulas
    # Examples: \mathrm{qquad(7.3)}\right), \qquad(7.3), (7.3), (7.4\right), \quad (12.1)
    cleaned = re.sub(r"\\mathrm\{[q\s]*quad\s*\([0-9\.]+\)\s*\}\s*\\right\)?\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\\qquad\s*\([0-9\.]+\s*\\right\)?\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\\quad\s*\([0-9\.]+\s*\\right\)?\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\\qquad\s*\([0-9\.]+\)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\\quad\s*\([0-9\.]+\)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\([0-9\.]+\s*\\right\)\s*$", "", cleaned)
    cleaned = re.sub(r"\s+\([0-9\.]+\)\s*$", "", cleaned)

    # 3. Fix OCR pipe symbol mistaken for closing square bracket in chemical complexes
    cleaned = re.sub(r"\|(\s*\\?(?:left)?\s*\()", r"]\1", cleaned)
    cleaned = re.sub(r"\|(?=\s*[+\-=→\\])", "]", cleaned)

    # 4. Remove trailing orphaned \right. outside \end{array} or at end
    cleaned = re.sub(r"\\right\.\s*$", "", cleaned)
    cleaned = re.sub(r"\\end\{array\}\s*\\right\.", r"\\end{array}", cleaned)

    # 5. Fix orphaned \right) when preceded by regular unclosed (
    cleaned = re.sub(r"\(([^()\\]*)\\right\)", r"(\1)", cleaned)

    # 6. Degrade \left[ / \right] to [ / ] to avoid cell scope errors in arrays/tables
    cleaned = cleaned.replace(r"\left[", "[").replace(r"\right]", "]")

    # 7. In \begin{array}{c}, fix \& and & column count mismatch
    cleaned = cleaned.replace(r"\&", "&")
    if r"\begin{array}{c}" in cleaned and "&" in cleaned:
        cleaned = cleaned.replace(r"\begin{array}{c}", r"\begin{array}{ll}")

    # 8. Normalize unicode reaction arrows, operators, and dashes
    cleaned = cleaned.replace("→", r"\rightarrow ").replace("⇌", r"\rightleftharpoons ")
    cleaned = cleaned.replace("–", "-").replace("—", "-")

    # 9. Truncate autoregressive ViT hallucination loops (e.g. repeated _{\cfrac{\alpha}{\alpha}})
    hallucination_match = re.search(r"[_^]?\{?\\c?frac\{(\\[a-zA-Z]+)\}\{\1\}", cleaned)
    if hallucination_match:
        cleaned = cleaned[:hallucination_match.start()].strip()

    # 10. Clean orphaned \end{...} when no matching \begin{...} exists in string
    for env in ("array", "matrix", "pmatrix", "bmatrix", "vmatrix", "cases", "align", "aligned"):
        if f"\\end{{{env}}}" in cleaned and f"\\begin{{{env}}}" not in cleaned:
            cleaned = cleaned.replace(f"\\end{{{env}}}", "")

    # 11. Safe delimiter balancing: if \left and \right counts are unequal, degrade to plain delimiters
    left_count = len(re.findall(r"\\left(?![a-zA-Z])", cleaned))
    right_count = len(re.findall(r"\\right(?![a-zA-Z])", cleaned))
    if left_count != right_count:
        cleaned = re.sub(r"\\left([(\[{|])", r"\1", cleaned)
        cleaned = re.sub(r"\\right([)\]}|.])", r"\1", cleaned)

    # 12. Balance curly braces if truncation left open braces
    while cleaned.count("{") > cleaned.count("}"):
        cleaned += "}"
    while cleaned.count("}") > cleaned.count("{") and cleaned.endswith("}"):
        cleaned = cleaned[:-1].strip()

    return cleaned.strip()


def is_valid_latex(s: str) -> bool:
    """
    Validates that an OCR-extracted LaTeX string is mathematically sound across all subjects
    and not an OCR hallucination loop or a swallowed English prose paragraph.
    """
    if not s or not s.strip():
        return False
    s = s.strip()

    # 1. Reject if string contains multiple lines of regular English prose
    prose_words = {
        "removal", "addition", "reaction", "substance", "element", "because", "identify",
        "undergoing", "problem", "solution", "calculate", "compound", "determine", "consider",
        "following", "example", "exercise", "between", "according", "definition",
        "simultaneous", "apparent", "observed", "therefore", "oxidised", "reduced"
    }
    words = [w.lower() for w in re.findall(r"\b[a-zA-Z]{3,}\b", s)]
    prose_match_count = sum(1 for w in words if w in prose_words)
    if prose_match_count >= 3 or (len(words) > 12 and prose_match_count >= 2):
        return False

    # 2. Unescaped curly brace balance check (unescaped { must match })
    # Use negative lookbehind (?<!\\) so LaTeX newlines like \\{ are not misidentified as escaped braces \{
    clean_braces = re.sub(r"(?<!\\)\\(\{|\})", "", s)
    if clean_braces.count("{") != clean_braces.count("}"):
        return False

    # 3. Delimiter balance check (\left must match \right)
    left_count = len(re.findall(r"\\left(?![a-zA-Z])", s))
    right_count = len(re.findall(r"\\right(?![a-zA-Z])", s))
    if left_count != right_count:
        return False

    # 4. Runaway repetitive hallucinations from ViT decoder loop
    if s.count(r"\tilde") > 4:
        return False
    if s.count(r"\mp") > 4:
        return False
    if s.count(r"\lambda") > 5:
        return False
    if s.count("~") > 6:
        return False
    if s.count(r"\Gamma") > 5:
        return False
    if s.count(r"\Psi") > 5:
        return False
    if s.count(r"\Omega") > 3:
        return False
    if s.count(r"\mathfrak") > 4:
        return False
    if "{{{{{" in s or "}}}}}" in s:
        return False
    if re.search(r"(\\_\s*){4,}", s):
        return False

    # 5. Environment balance check: reject if any \end{env} exists without matching \begin{env}
    end_envs = re.findall(r"\\end\{([a-zA-Z*]+)\}", s)
    begin_envs = re.findall(r"\\begin\{([a-zA-Z*]+)\}", s)
    for env in set(end_envs):
        if end_envs.count(env) > begin_envs.count(env):
            return False

    # 6. Reject repeating fraction hallucination loops (e.g. \cfrac{\alpha}{\alpha})
    if len(re.findall(r"\\c?frac\{(\\[a-zA-Z]+)\}\{\1\}", s)) >= 2:
        return False

    return True


class LatexOCREngine:
    """
    Singleton wrapper for RapidLaTeXOCR ONNX engine.
    Extracts LaTeX equations from cropped mathematical bounding boxes.
    """

    _instance: Optional[LatexOCREngine] = None

    @classmethod
    def get_instance(cls) -> LatexOCREngine:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self._model = None
        self._initialized = False
        self._available = False

    def is_available(self) -> bool:
        """Checks if RapidLaTeXOCR is installed and can be initialized."""
        if not self._initialized:
            self._lazy_init()
        return self._available

    def _lazy_init(self) -> None:
        """Loads ONNX model weights on first invocation."""
        if self._initialized:
            return

        self._initialized = True
        try:
            import os
            # Avoid CPU thread thrashing across parallel worker processes
            os.environ["OMP_NUM_THREADS"] = "1"
            os.environ["ORT_INTRA_OP_NUM_THREADS"] = "1"

            from rapid_latex_ocr import LaTeXOCR
            self._model = LaTeXOCR()
            self._available = True
            logger.info("[LatexOCR] RapidLaTeXOCR ONNX engine loaded successfully (thread limit=1).")
        except ImportError as imp_err:
            logger.info(f"[LatexOCR] rapid_latex_ocr import notice ({imp_err}). Formula extraction will use digital text fallback.")
            self._available = False
        except Exception as init_err:
            logger.warning(f"[LatexOCR] Failed to initialize RapidLaTeXOCR: {init_err}", exc_info=True)
            self._available = False

    def extract_latex_from_image(self, img: Union[Image.Image, bytes]) -> Optional[str]:
        """
        Converts a PIL Image or image bytes containing a mathematical formula into LaTeX.
        Returns clean LaTeX string without surrounding dollar signs.
        """
        if not self.is_available() or self._model is None:
            return None

        try:
            pil_img: Image.Image
            if isinstance(img, bytes):
                pil_img = Image.open(io.BytesIO(img)).convert("RGB")
            elif isinstance(img, Image.Image):
                pil_img = img.convert("RGB")
            else:
                return None

            # Skip microscopic artifacts or empty chips
            if pil_img.width < 10 or pil_img.height < 8:
                return None

            import numpy as np

            # Pad with 6px white margin to improve tokenization accuracy
            padded = Image.new("RGB", (pil_img.width + 12, pil_img.height + 12), (255, 255, 255))
            padded.paste(pil_img, (6, 6))

            # Run ONNX inference
            # RapidLaTeXOCR expects numpy.ndarray, bytes, or file path (not PIL.Image.Image)
            img_arr = np.array(padded)
            try:
                raw_res = self._model(img_arr)
            except Exception as model_err:
                # Secondary fallback using PNG byte buffer
                logger.debug(f"[LatexOCR] Numpy array call fallback to bytes: {model_err}")
                buf = io.BytesIO()
                padded.save(buf, format="PNG")
                raw_res = self._model(buf.getvalue())

            # RapidLaTeXOCR returns (latex_str, elapse) or just latex_str
            latex_res = ""
            if isinstance(raw_res, tuple) and len(raw_res) >= 1:
                latex_res = str(raw_res[0] or "").strip()
            elif isinstance(raw_res, str):
                latex_res = raw_res.strip()

            if not latex_res:
                return None

            # Clean LaTeX output: remove markdown wrappers, trailing equation numbers, and balance brackets
            latex_clean = sanitize_latex(latex_res)

            # Reject hallucinated / broken LaTeX outputs (e.g. from text or non-math crops)
            if not is_valid_latex(latex_clean):
                logger.debug(f"[LatexOCR] Rejected hallucinated/invalid LaTeX: {latex_clean[:50]}...")
                return None

            return latex_clean if latex_clean else None

        except Exception as ocr_err:
            logger.warning(f"[LatexOCR] Inference error on formula crop: {ocr_err}")
            return None

    def extract_latex_from_bbox(
        self,
        fitz_page: Any,
        bbox: List[float],
        dpi: int = 200,
    ) -> Optional[str]:
        """
        Clips a formula bounding box directly from a PyMuPDF page and extracts LaTeX.
        bbox format: [x0, y0, x1, y1] (Docling coordinates or standard PDF coordinates).
        Uses bottom-left origin coordinate mapping.
        """
        if not self.is_available() or fitz_page is None or not bbox or len(bbox) < 4:
            return None

        try:
            import pymupdf as fitz

            l, t, r, b = bbox[:4]
            page_h = fitz_page.rect.height
            page_w = fitz_page.rect.width

            x_left = min(l, r)
            x_right = max(l, r)
            bbox_w = x_right - x_left
            bbox_h = abs(t - b)

            # Skip microscopic fragments or misclassified full-page blocks/tables
            if bbox_w < 12 or bbox_h < 6:
                return None
            if bbox_h > 140 or (bbox_w > 340 and bbox_h > 90):
                return None

            # Docling coordinates are origin-bottom-left (t > b)
            if t <= b:
                y_top = t
                y_bot = b
            else:
                y_top = page_h - t
                y_bot = page_h - b

            if y_top > y_bot:
                y_top, y_bot = y_bot, y_top

            # Add 4pt horizontal and 3pt vertical padding
            rect = fitz.Rect(
                max(0.0, x_left - 4.0),
                max(0.0, y_top - 3.0),
                min(page_w, x_right + 4.0),
                min(page_h, y_bot + 3.0),
            ) & fitz_page.rect

            if rect.width >= 10 and rect.height >= 6:
                pix = fitz_page.get_pixmap(clip=rect, dpi=dpi)
                return self.extract_latex_from_image(pix.tobytes("png"))

            return None

        except Exception as clip_err:
            logger.debug(f"[LatexOCR] Viewport clip error for bbox {bbox}: {clip_err}")
            return None
