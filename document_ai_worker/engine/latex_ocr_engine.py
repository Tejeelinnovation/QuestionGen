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
from typing import Any, List, Optional, Tuple, Union

from PIL import Image

logger = logging.getLogger(__name__)


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
            from rapid_latex_ocr import LaTeXOCR
            self._model = LaTeXOCR()
            self._available = True
            logger.info("[LatexOCR] RapidLaTeXOCR ONNX engine loaded successfully.")
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
        Automatically detects TOPLEFT vs BOTTOMLEFT origin.
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

            # Auto-detect coordinate origin:
            # In TOPLEFT origin: t (top) < b (bottom) -> y_top = t, y_bot = b
            # In BOTTOMLEFT origin: t (top) > b (bottom) -> y_top = page_h - t, y_bot = page_h - b
            if t <= b:
                y_top = t
                y_bot = b
            else:
                y_top = page_h - t
                y_bot = page_h - b

            if y_top > y_bot:
                y_top, y_bot = y_bot, y_top

            # Add 4pt horizontal and 3pt vertical padding for radicals, integral signs, and fraction bars
            rect = fitz.Rect(
                max(0.0, x_left - 4.0),
                max(0.0, y_top - 3.0),
                min(page_w, x_right + 4.0),
                min(page_h, y_bot + 3.0),
            ) & fitz_page.rect

            if rect.width >= 10 and rect.height >= 6:
                pix = fitz_page.get_pixmap(clip=rect, dpi=dpi)
                res = self.extract_latex_from_image(pix.tobytes("png"))
                if res:
                    return res

            # Dual-origin fallback: in case coordinates were explicitly inverted
            inv_y_top = page_h - y_bot
            inv_y_bot = page_h - y_top
            if inv_y_top > inv_y_bot:
                inv_y_top, inv_y_bot = inv_y_bot, inv_y_top

            inv_rect = fitz.Rect(
                max(0.0, x_left - 4.0),
                max(0.0, inv_y_top - 3.0),
                min(page_w, x_right + 4.0),
                min(page_h, inv_y_bot + 3.0),
            ) & fitz_page.rect

            if inv_rect.width >= 10 and inv_rect.height >= 6:
                inv_pix = fitz_page.get_pixmap(clip=inv_rect, dpi=dpi)
                return self.extract_latex_from_image(inv_pix.tobytes("png"))

            return None

        except Exception as clip_err:
            logger.debug(f"[LatexOCR] Viewport clip error for bbox {bbox}: {clip_err}")
            return None
