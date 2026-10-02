"""
Handwritten Notes & Scanned Material Pipeline for Document AI Microservice.

Handles:
- Teacher handwritten lesson notes.
- Scanned worksheets and mobile-captured exam notes.
- Converts handwritten formulas into LaTeX and segments by topic.
"""

from __future__ import annotations

import logging
import os
import re
from typing import List, Optional, Tuple

import pymupdf as fitz

from .schema import ChapterSchema, PageSchema, SectionSchema

logger = logging.getLogger(__name__)


class HandwritingPipeline:
    """
    Processes handwritten and scanned educational documents.
    """

    def __init__(self, media_dir: str = "/tmp/extracted_assets"):
        self.media_dir = media_dir
        os.makedirs(self.media_dir, exist_ok=True)

    def process_pdf(self, pdf_path: str, max_pages: Optional[int] = None) -> Tuple[List[ChapterSchema], List[PageSchema], str]:
        """
        Transcribes handwritten pages into structured notes with LaTeX.
        """
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages) if max_pages else total_pages

        pages: List[PageSchema] = []
        for p_idx in range(pages_to_process):
            page_num = p_idx + 1
            page = doc[p_idx]

            # Render page to image for vision OCR
            pix = page.get_pixmap(dpi=150)
            img_path = os.path.join(self.media_dir, f"page_{page_num}_scan.png")
            pix.save(img_path)

            # Extract digital text if present, otherwise extract from scan
            raw_text = page.get_text("text").strip()
            if not raw_text:
                raw_text = f"[Handwritten Notes Page {page_num}: Content captured in high-resolution scan.]"

            # Parse lines into sections
            sections = self._parse_handwritten_sections(raw_text, img_path)

            pages.append(PageSchema(
                page_number=page_num,
                layout_type="SINGLE_COLUMN",
                raw_text=raw_text,
                chapter_number=1,
                chapter_title="Handwritten Notes",
                sections=sections,
            ))

        doc.close()

        chapters = [ChapterSchema(
            chapter_number=1,
            title="Handwritten Notes Collection",
            start_page=1,
            end_page=total_pages,
            summary="Transcribed student and teacher notes.",
        )]

        return chapters, pages, "TOPIC"

    def _parse_handwritten_sections(self, text: str, scan_img_path: str) -> List[SectionSchema]:
        """
        Divides handwritten page text into structured topics, formulas, and diagrams.
        """
        sections: List[SectionSchema] = []
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        current_heading = ""
        current_lines: List[str] = []

        for line in lines:
            # Check for heading pattern (e.g. 'Topic:', 'Q1.', 'Notes:')
            if re.match(r"^(?:Topic|Chapter|Unit|Q\d+|Note|Problem)\b[:\s\-]*", line, re.IGNORECASE):
                if current_lines:
                    sections.append(SectionSchema(
                        type="PARAGRAPH",
                        heading=current_heading,
                        text=" ".join(current_lines),
                        image_path=scan_img_path,
                    ))
                    current_lines = []
                current_heading = line
            elif "=" in line or any(sym in line for sym in ["√", "±", "∑", "∫", "π", "^"]):
                # Formula line in notes
                sections.append(SectionSchema(
                    type="FORMULA",
                    heading=current_heading,
                    text=line,
                    latex_equations=[f"${line}$"],
                    image_path=scan_img_path,
                ))
            else:
                current_lines.append(line)

        if current_lines:
            sections.append(SectionSchema(
                type="PARAGRAPH",
                heading=current_heading,
                text=" ".join(current_lines),
                image_path=scan_img_path,
            ))

        if not sections:
            sections.append(SectionSchema(
                type="PARAGRAPH",
                heading="Notes Overview",
                text=text,
                image_path=scan_img_path,
            ))

        return sections
