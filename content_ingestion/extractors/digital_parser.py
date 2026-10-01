"""
Digital PDF Extractor using PyMuPDF (fitz).

Provides fast, lightweight, zero-API-cost document extraction with:
- Multi-column reading order detection (Single, Two-column, Hybrid layouts).
- Pedagogical block classification (Activity, Solved Example, Exercise, Definition, Summary).
- Mathematical and chemical formula detection and LaTeX conversion.
- Image extraction and automatic nearest-caption association.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Tuple
import pymupdf as fitz


class DigitalPdfExtractor:
    """
    Extracts structured content from digitally generated / typed PDFs.
    """

    # Regex patterns for pedagogical block classification
    ACTIVITY_PATTERN = re.compile(r"^\s*(Activity|Task|Experiment|Project|Lab Activity)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE)
    EXAMPLE_PATTERN = re.compile(r"^\s*(Example|Solved Example|Illustration|Sample Problem)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE)
    EXERCISE_PATTERN = re.compile(r"^\s*(Exercise|Question|Questions|In-Text Questions|Practice Problems)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE)
    DEFINITION_PATTERN = re.compile(r"^\s*(Definition|Theorem|Lemma|Axiom|Law|Principle)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE)
    SUMMARY_PATTERN = re.compile(r"^\s*(Summary|Points to Remember|What we have discussed|Key Takeaways|Chapter at a Glance)\b", re.IGNORECASE)
    CAPTION_PATTERN = re.compile(r"^\s*(Fig|Figure|Diagram|Chart|Illustration)\b[:\s\.]*([0-9\.]+)?", re.IGNORECASE)

    # Mathematical / Chemical formula cues
    MATH_SYMBOLS = set("±√∑∫∏≠≤≥≈∞∝∠∆∇∈∉∩∪⊂⊃⊆⊇∀∃⇒⇔πθαβγδε")
    MATH_OPERATORS = re.compile(r"(\b[a-zA-Z0-9]+\s*[\+\-\*\/\=]\s*[a-zA-Z0-9]+)|([a-zA-Z]\^[0-9]+)|([a-zA-Z]_[0-9]+)|(\b[H|C|O|N|S|P|Na|Cl|Fe|Cu|Ca|Mg][0-9]*[A-Z][0-9]*\b)")

    def __init__(self, media_output_dir: str = ""):
        self.media_output_dir = media_output_dir

    def extract_page(self, doc: fitz.Document, page_number: int) -> Dict[str, Any]:
        """
        Extract structured content from a page (page_number is 1-indexed).
        """
        page_idx = page_number - 1
        if page_idx < 0 or page_idx >= len(doc):
            return {
                "layout_type": "SINGLE_COLUMN",
                "raw_text": "",
                "sections": [],
            }

        page = doc[page_idx]
        page_rect = page.rect
        width, height = page_rect.width, page_rect.height

        # 1. Extract raw text blocks: (x0, y0, x1, y1, text, block_no, block_type)
        # block_type == 0 is text, block_type == 1 is image
        raw_blocks = page.get_text("blocks")
        text_blocks = [b for b in raw_blocks if b[6] == 0 and b[4].strip()]
        raw_full_text = "\n\n".join(b[4].strip() for b in text_blocks)

        # 2. Extract embedded images on this page
        extracted_images = self._extract_images(doc, page, page_number)

        # 3. Analyze Column Layout & Sort Blocks in Natural Reading Order
        layout_type, sorted_blocks = self._analyze_layout_and_sort(text_blocks, width, height)

        # 4. Parse Blocks into Structured Pedagogical Sections
        sections = []
        for block in sorted_blocks:
            x0, y0, x1, y1, text, block_no, col_idx = block
            clean_text = text.strip()
            if not clean_text:
                continue

            # Classify block type
            section = self._classify_block(clean_text, col_idx, (x0, y0, x1, y1), extracted_images)
            sections.append(section)

        # Append any unlinked diagrams as standalone sections
        for img in extracted_images:
            if not img.get("linked_to_caption", False):
                sections.append({
                    "type": "DIAGRAM",
                    "heading": "",
                    "text": "",
                    "column_index": 0,
                    "latex_equations": [],
                    "image_path": img.get("file_path", ""),
                    "image_caption": img.get("caption", ""),
                    "metadata": {"bbox": img.get("bbox", [])},
                })

        return {
            "layout_type": layout_type,
            "raw_text": raw_full_text,
            "sections": sections,
        }

    def _analyze_layout_and_sort(
        self,
        blocks: List[Tuple],
        page_width: float,
        page_height: float,
    ) -> Tuple[str, List[Tuple]]:
        """
        Determines reading order (multi-column vs single column vs hybrid).
        Returns (layout_type, sorted_blocks_with_column_index).
        """
        if not blocks:
            return "SINGLE_COLUMN", []

        mid_x = page_width / 2.0
        col_gutter = page_width * 0.08  # Gutter margin around middle

        # Classify each block by horizontal position
        left_blocks = []
        right_blocks = []
        span_blocks = []

        for b in blocks:
            x0, y0, x1, y1, text, block_no, btype = b
            # Ignore running headers (top 4%) and footers (bottom 4%) from column classification
            if y1 < page_height * 0.04 or y0 > page_height * 0.96:
                span_blocks.append((x0, y0, x1, y1, text, block_no, 0))
                continue

            block_width = x1 - x0
            # If block spans more than 60% of page width, it's a full-width block
            if block_width > page_width * 0.60:
                span_blocks.append((x0, y0, x1, y1, text, block_no, 0))
            elif x1 <= mid_x + col_gutter:
                left_blocks.append((x0, y0, x1, y1, text, block_no, 1))
            elif x0 >= mid_x - col_gutter:
                right_blocks.append((x0, y0, x1, y1, text, block_no, 2))
            else:
                span_blocks.append((x0, y0, x1, y1, text, block_no, 0))

        # Layout detection logic:
        # If substantial blocks exist in both left and right columns:
        has_two_columns = len(left_blocks) >= 2 and len(right_blocks) >= 2

        if has_two_columns:
            if span_blocks:
                layout_type = "HYBRID_COLUMN"
            else:
                layout_type = "TWO_COLUMN"

            # Sort:
            # 1. Top full-width blocks (above columns)
            # 2. Left column blocks (top-to-bottom)
            # 3. Right column blocks (top-to-bottom)
            # 4. Bottom full-width blocks (below columns)
            top_y_cols = min(
                min([b[1] for b in left_blocks], default=page_height),
                min([b[1] for b in right_blocks], default=page_height),
            )
            bottom_y_cols = max(
                max([b[3] for b in left_blocks], default=0),
                max([b[3] for b in right_blocks], default=0),
            )

            top_span = [b for b in span_blocks if b[1] <= top_y_cols]
            bottom_span = [b for b in span_blocks if b[1] > top_y_cols]

            top_span.sort(key=lambda x: x[1])
            left_blocks.sort(key=lambda x: x[1])
            right_blocks.sort(key=lambda x: x[1])
            bottom_span.sort(key=lambda x: x[1])

            sorted_blocks = top_span + left_blocks + right_blocks + bottom_span
            return layout_type, sorted_blocks

        # Default Single Column: Sort primarily by vertical Y position
        layout_type = "SINGLE_COLUMN"
        all_blocks = [(b[0], b[1], b[2], b[3], b[4], b[5], 0) for b in blocks]
        all_blocks.sort(key=lambda x: x[1])
        return layout_type, all_blocks

    def _classify_block(
        self,
        text: str,
        col_idx: int,
        bbox: Tuple[float, float, float, float],
        images: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Classifies a text block into pedagogical item types and extracts LaTeX formulas.
        """
        # Check for matching image caption
        caption_match = self.CAPTION_PATTERN.match(text)
        if caption_match:
            # Associate with closest image
            for img in images:
                if not img.get("linked_to_caption", False):
                    img["caption"] = text
                    img["linked_to_caption"] = True
                    return {
                        "type": "DIAGRAM",
                        "heading": caption_match.group(0),
                        "text": text,
                        "column_index": col_idx,
                        "latex_equations": [],
                        "image_path": img.get("file_path", ""),
                        "image_caption": text,
                        "metadata": {"bbox": list(bbox)},
                    }

        # Check for Pedagogical Types
        if self.ACTIVITY_PATTERN.match(text):
            item_type = "ACTIVITY"
            heading = self.ACTIVITY_PATTERN.match(text).group(0)
        elif self.EXAMPLE_PATTERN.match(text):
            item_type = "SOLVED_EXAMPLE"
            heading = self.EXAMPLE_PATTERN.match(text).group(0)
        elif self.EXERCISE_PATTERN.match(text):
            item_type = "EXERCISE_QUESTION"
            heading = self.EXERCISE_PATTERN.match(text).group(0)
        elif self.DEFINITION_PATTERN.match(text):
            item_type = "DEFINITION"
            heading = self.DEFINITION_PATTERN.match(text).group(0)
        elif self.SUMMARY_PATTERN.match(text):
            item_type = "SUMMARY"
            heading = self.SUMMARY_PATTERN.match(text).group(0)
        else:
            # Check if this is primarily a mathematical or chemical formula block
            is_formula, latex_list = self._detect_and_convert_formulas(text)
            if is_formula and len(text.split()) <= 15:
                return {
                    "type": "FORMULA",
                    "heading": "",
                    "text": text,
                    "column_index": col_idx,
                    "latex_equations": latex_list,
                    "image_path": "",
                    "image_caption": "",
                    "metadata": {"bbox": list(bbox)},
                }
            item_type = "PARAGRAPH"
            heading = ""

        # Extract inline equations even in standard paragraphs
        _, latex_list = self._detect_and_convert_formulas(text)

        return {
            "type": item_type,
            "heading": heading,
            "text": text,
            "column_index": col_idx,
            "latex_equations": latex_list,
            "image_path": "",
            "image_caption": "",
            "metadata": {"bbox": list(bbox)},
        }

    def _detect_and_convert_formulas(self, text: str) -> Tuple[bool, List[str]]:
        """
        Detects math/chemistry notation in text and generates LaTeX strings.
        """
        latex_equations = []
        has_symbol = any(c in self.MATH_SYMBOLS for c in text)
        has_operator_match = bool(self.MATH_OPERATORS.search(text))

        if not (has_symbol or has_operator_match):
            return False, []

        lines = [line.strip() for line in text.split("\n") if line.strip()]
        for line in lines:
            if any(c in self.MATH_SYMBOLS for c in line) or "=" in line:
                # Basic normalization into standard LaTeX equation syntax
                normalized = line
                normalized = normalized.replace("√", r"\sqrt")
                normalized = normalized.replace("±", r"\pm ")
                normalized = normalized.replace("≤", r"\le ")
                normalized = normalized.replace("≥", r"\ge ")
                normalized = normalized.replace("≠", r"\ne ")
                normalized = normalized.replace("π", r"\pi ")
                normalized = normalized.replace("θ", r"\theta ")
                normalized = normalized.replace("α", r"\alpha ")
                normalized = normalized.replace("β", r"\beta ")
                normalized = normalized.replace("×", r"\times ")
                normalized = normalized.replace("÷", r"\div ")
                latex_equations.append(f"${normalized}$")

        return True, latex_equations

    def _extract_images(self, doc: fitz.Document, page: fitz.Page, page_num: int) -> List[Dict[str, Any]]:
        """
        Finds embedded images on the page and optionally saves them to media directory.
        """
        images = []
        image_list = page.get_images(full=True)
        if not image_list or not self.media_output_dir:
            return images

        os.makedirs(self.media_output_dir, exist_ok=True)

        for img_idx, img_info in enumerate(image_list):
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]

                filename = f"page_{page_num}_img_{img_idx + 1}.{image_ext}"
                filepath = os.path.join(self.media_output_dir, filename)

                # Only write if file doesn't exist
                if not os.path.exists(filepath):
                    with open(filepath, "wb") as f:
                        f.write(image_bytes)

                images.append({
                    "file_path": filepath,
                    "filename": filename,
                    "caption": "",
                    "linked_to_caption": False,
                })
            except Exception:
                continue

        return images
