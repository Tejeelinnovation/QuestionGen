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


def is_valid_latex(s: str) -> bool:
    """
    Validates that an OCR-extracted LaTeX string is mathematically sound and
    not a runaway autoregressive Transformer hallucination loop (e.g. from Hindi text).
    """
    if not s or not s.strip():
        return False
    s = s.strip()

    # 1. Unescaped curly brace balance check (unescaped { must match })
    clean_braces = re.sub(r"\\(\{|\})", "", s)
    if clean_braces.count("{") != clean_braces.count("}"):
        return False

    # 2. Runaway repetitive hallucinations from ViT decoder loop
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
    if "{{{{{" in s or "}}}}}" in s:
        return False
    if re.search(r"(\\_\s*){4,}", s):
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

            # Clean LaTeX output: remove markdown wrappers or duplicate delimiters
            latex_clean = latex_res.strip().strip("$").strip()

            # Reject hallucinated / broken LaTeX outputs (e.g. from Hindi script inside math boxes)
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
