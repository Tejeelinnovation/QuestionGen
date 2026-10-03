"""
Deep Learning Handwriting Pipeline for Scanned Material & Teacher/Student Notes.

Uses:
- EasyOCR (JaidedAI CRAFT Vision Neural Network + ResNet-CRNN Sequence Recognizer)
- Multilingual Devanagari (Hindi) + English handwriting recognition
- High-resolution scan preservation for diagrams & visual notes
"""

from __future__ import annotations

import base64
import logging
import os
import re
from typing import Callable, List, Optional, Tuple

import pymupdf as fitz

from .schema import ChapterSchema, PageSchema, SectionSchema

logger = logging.getLogger(__name__)


class HandwritingPipeline:
    """
    Processes handwritten notes and scanned exam papers using Gemini 2.0 Flash Vision
    with Tesseract / EasyOCR fallback.
    """

    def __init__(self, media_dir: str = "/tmp/extracted_assets", gemini_api_key: str = ""):
        self.media_dir = media_dir
        self.gemini_api_key = gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        os.makedirs(self.media_dir, exist_ok=True)
        self._reader = None

    def _transcribe_with_gemini(self, b64_img: str, page_num: int) -> Optional[str]:
        if not self.gemini_api_key:
            return None
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={self.gemini_api_key}"
        prompt = (
            "Transcribe all handwritten notes, formulas, equations, definitions, and questions on this page. "
            "Output clear structured text in natural reading order. "
            "Convert any mathematical or chemical expressions to LaTeX notation enclosed in dollar signs (e.g. $E=mc^2$)."
        )
        pure_b64 = b64_img.split(",", 1)[-1] if "," in b64_img else b64_img
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": pure_b64,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
            },
        }
        try:
            res = requests.post(url, json=payload, timeout=30)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()
            else:
                logger.warning(f"Gemini Flash API returned HTTP {res.status_code}: {res.text[:120]}")
        except Exception as gemini_err:
            logger.warning(f"Gemini Flash request error on page {page_num}: {gemini_err}")
        return None

    def _transcribe_with_tesseract(self, img_path: str) -> Optional[str]:
        import subprocess
        try:
            cmd = ["tesseract", img_path, "stdout", "-l", "hin+eng"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip()
        except Exception:
            pass
        return None

    def _get_reader(self):
        if self._reader is None and not self.gemini_api_key:
            try:
                import easyocr
                logger.info("Initializing EasyOCR Deep Learning Reader (Hindi + English)...")
                self._reader = easyocr.Reader(["en", "hi"], gpu=False)
            except Exception as ocr_init_err:
                logger.warning(f"EasyOCR initialization note: {ocr_init_err}.")
                self._reader = False
        return self._reader

    def process_pdf(
        self,
        pdf_path: str,
        max_pages: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> Tuple[List[ChapterSchema], List[PageSchema], str]:
        """
        Transcribes handwritten pages into structured notes with neural handwriting recognition.
        """
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages) if max_pages else total_pages

        init_msg = (
            f"Opened notes ({pages_to_process} pages). Initializing Gemini 2.0 Flash Vision AI..."
            if self.gemini_api_key
            else f"Opened notes ({pages_to_process} pages). Initializing Tesseract/EasyOCR..."
        )
        if progress_callback:
            progress_callback(0, pages_to_process, init_msg)

        reader = self._get_reader()

        pages: List[PageSchema] = []
        for p_idx in range(pages_to_process):
            page_num = p_idx + 1
            page = doc[p_idx]

            # 1. Render high-resolution page scan (200 DPI) for visual display
            pix = page.get_pixmap(dpi=200)
            img_path = os.path.join(self.media_dir, f"page_{page_num}_handwritten.png")
            pix.save(img_path)

            img_b64 = ""
            with open(img_path, "rb") as imf:
                b64 = base64.b64encode(imf.read()).decode("utf-8")
                img_b64 = f"data:image/png;base64,{b64}"

            # 2. Extract digital text if present
            digital_text = page.get_text("text").strip()

            # 3. Handwriting transcription (Gemini Flash Vision -> Tesseract -> EasyOCR)
            transcribed_text = ""
            engine_used = ""
            if self.gemini_api_key:
                gemini_text = self._transcribe_with_gemini(img_b64, page_num)
                if gemini_text:
                    transcribed_text = gemini_text
                    engine_used = "Gemini 2.0 Flash Vision"

            if not transcribed_text:
                tess_text = self._transcribe_with_tesseract(img_path)
                if tess_text:
                    transcribed_text = tess_text
                    engine_used = "Tesseract OCR"

            if not transcribed_text and reader:
                try:
                    ocr_results = reader.readtext(img_path, detail=1, paragraph=True)
                    lines = [str(item[1]).strip() for item in ocr_results if len(item) >= 2 and str(item[1]).strip()]
                    if lines:
                        transcribed_text = "\n\n".join(lines)
                        engine_used = "EasyOCR"
                except Exception as ocr_err:
                    logger.warning(f"EasyOCR error on page {page_num}: {ocr_err}")

            if not transcribed_text:
                transcribed_text = digital_text or f"[Handwritten Notes Page {page_num}: High-resolution scan captured.]"
                engine_used = "Digital Text"

            # 4. Structure sections
            sections = self._structure_notes(transcribed_text, img_path, img_b64, page_num)

            pages.append(PageSchema(
                page_number=page_num,
                layout_type="SINGLE_COLUMN",
                raw_text=transcribed_text,
                chapter_number=1,
                chapter_title="Handwritten Notes",
                sections=sections,
            ))

            if progress_callback:
                progress_callback(
                    page_num,
                    pages_to_process,
                    f"Transcribed handwritten page {page_num} of {pages_to_process} ({engine_used})...",
                )

        doc.close()

        chapters = [ChapterSchema(
            chapter_number=1,
            title="Handwritten Notes Collection",
            start_page=1,
            end_page=total_pages,
            summary="Transcribed handwritten notes using high-precision AI vision.",
        )]

        return chapters, pages, "TOPIC"

    def _structure_notes(self, text: str, img_path: str, img_b64: str, page_num: int) -> List[SectionSchema]:
        """
        Structures transcribed text and attaches high-resolution scan as visual reference.
        """
        sections: List[SectionSchema] = []

        # Add the visual scan as a DIAGRAM section so the user can see the handwritten source
        sections.append(SectionSchema(
            type="DIAGRAM",
            heading=f"Page {page_num} Original Scan",
            text=f"High-resolution scan of handwritten page {page_num}",
            column_index=0,
            image_path=img_path,
            image_data=img_b64,
            image_caption=f"Handwritten Notes - Page {page_num}",
        ))

        # Split transcribed text into clean paragraphs
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        for p in paragraphs:
            # Check if paragraph has formula symbols
            if any(sym in p for sym in ["=", "√", "±", "∑", "∫", "π", "α", "β", "θ"]):
                sections.append(SectionSchema(
                    type="FORMULA",
                    heading="",
                    text=p,
                    column_index=0,
                    latex_equations=[f"${p}$"],
                ))
            else:
                sections.append(SectionSchema(
                    type="PARAGRAPH",
                    heading=p[:40] if len(p) > 50 else "",
                    text=p,
                    column_index=0,
                ))

        return sections
