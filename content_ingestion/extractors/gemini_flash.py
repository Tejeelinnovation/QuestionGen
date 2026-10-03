"""
Gemini Flash Multimodal Vision Extractor.

Used for:
- Handwritten notes / messy teacher scripts.
- High-precision LaTeX formula extraction (complex math integrals, matrices, chemical bonds).
- Scanned PDF pages without digital text layers.
- Multi-column and newspaper-style layout flow.

Uses the free Gemini 2.0 / 1.5 Flash API tier (1,500 free requests per day).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, Dict

import pymupdf as fitz
import requests
from django.conf import settings

from .base import BaseExtractor
from .digital_parser import DigitalPdfExtractor

logger = logging.getLogger(__name__)


EXTRACTION_SYSTEM_PROMPT = """
You are a precise academic textbook and notes parsing engine for educational training datasets.
Extract all educational content from this page image into valid, raw JSON (no markdown formatting, no code fences).

CRITICAL REQUIREMENTS:
1. Column Reading Order: If the page has two columns, read Column 1 completely top-to-bottom, then Column 2 top-to-bottom. If there is a top headline or banner, read that first.
2. Math & Chemistry Formulas: Format all equations strictly in LaTeX notation enclosed in dollar signs (e.g. $E = mc^2$, $\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$, $\\text{H}_2\\text{SO}_4$).
3. Identify Pedagogical Types: Categorize each block into one of:
   - "PARAGRAPH": Regular explanation text.
   - "FORMULA": Mathematical or chemical equations.
   - "DIAGRAM": When an image, chart, or figure is present, extract its caption (e.g. "Figure 2.1: ...").
   - "ACTIVITY": Hands-on tasks, experiments, projects, or lab tasks.
   - "SOLVED_EXAMPLE": Step-by-step solved sample questions.
   - "EXERCISE_QUESTION": Textbook practice questions or test problems.
   - "DEFINITION": Formal theorems, laws, definitions, or bold term explanations.
   - "SUMMARY": Points to remember or key takeaways.

JSON SCHEMA EXPECTED:
{
  "layout_type": "SINGLE_COLUMN" | "TWO_COLUMN" | "HYBRID_COLUMN" | "COMPLEX_GRID",
  "raw_text": "Complete transcribed page text in natural reading order",
  "sections": [
    {
      "type": "PARAGRAPH | FORMULA | DIAGRAM | ACTIVITY | SOLVED_EXAMPLE | EXERCISE_QUESTION | DEFINITION | SUMMARY",
      "heading": "Optional section/sub-section or example heading",
      "text": "Extracted text for this block",
      "column_index": 1,
      "latex_equations": ["$latex formula here$"],
      "image_caption": "Caption text if type is DIAGRAM",
      "metadata": {}
    }
  ]
}
"""


class GeminiFlashExtractor(BaseExtractor):
    """
    Multimodal document extractor utilizing Gemini Flash Vision.
    """

    def __init__(self, api_key: str = "", model_name: str = "gemini-3.8-flash"):
        self.api_key = api_key or getattr(settings, "GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
        self.model_name = model_name or getattr(settings, "GEMINI_MODEL_NAME", "gemini-3.8-flash")
        self.fallback_extractor = DigitalPdfExtractor()

    def extract_page(self, doc: fitz.Document, page_number: int) -> Dict[str, Any]:
        """
        Renders the page to PNG and calls the Gemini Vision endpoint.
        Falls back to digital parser if API key is not configured.
        """
        if not self.api_key:
            logger.info("No GEMINI_API_KEY configured; falling back to DigitalPdfExtractor.")
            return self.fallback_extractor.extract_page(doc, page_number)

        page_idx = page_number - 1
        if page_idx < 0 or page_idx >= len(doc):
            return {"layout_type": "SINGLE_COLUMN", "raw_text": "", "sections": []}

        page = doc[page_idx]

        # Render page to PNG bytes (dpi=150 is optimal for speed, token limits, and crisp OCR)
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        b64_image = base64.b64encode(img_bytes).decode("utf-8")

        # Gemini REST API request payload
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": EXTRACTION_SYSTEM_PROMPT},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": b64_image,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json",
            },
        }

        try:
            response = requests.post(url, json=payload, timeout=30)
            if response.status_code != 200:
                logger.warning(
                    f"Gemini API returned status {response.status_code}: {response.text[:200]}. Falling back to DigitalPdfExtractor."
                )
                return self.fallback_extractor.extract_page(doc, page_number)

            res_json = response.json()
            content_text = (
                res_json.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )

            # Strip any residual code fences
            clean_json = content_text.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json[7:]
            if clean_json.startswith("```"):
                clean_json = clean_json[3:]
            if clean_json.endswith("```"):
                clean_json = clean_json[:-3]

            parsed = json.loads(clean_json.strip())
            return {
                "layout_type": parsed.get("layout_type", "SINGLE_COLUMN"),
                "raw_text": parsed.get("raw_text", ""),
                "sections": parsed.get("sections", []),
            }

        except Exception as e:
            logger.error(f"Error calling Gemini Vision API: {e}. Falling back to DigitalPdfExtractor.")
            return self.fallback_extractor.extract_page(doc, page_number)
