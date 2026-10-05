"""
Textbook Extraction Pipeline for the Document AI Microservice.

Handles:
- Table of Contents detection & chapter segmentation.
- Multi-column reading flow & layout analysis.
- Mathematical and chemical formula preservation in LaTeX.
- Figure / diagram extraction and nearest-caption pairing.
- Pedagogical block classification (Activity, Solved Example, Exercise, Definition, Summary).
"""

from __future__ import annotations

import base64
import logging
import math
import os
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

import pymupdf as fitz

from .schema import ChapterSchema, PageSchema, SectionSchema

logger = logging.getLogger(__name__)


class TextbookPipeline:
    """
    Parses digital educational textbooks into structured pedagogical data.
    """

    # Pedagogical classification patterns
    PATTERNS = {
        "ACTIVITY": re.compile(r"^\s*(Activity|Task|Experiment|Project|Lab Activity|Try This|Do It Yourself)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE),
        "SOLVED_EXAMPLE": re.compile(r"^\s*(Example|Solved Example|Illustration|Sample Problem)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE),
        "EXERCISE_QUESTION": re.compile(r"^\s*(Exercise|Question|Questions|In-Text Questions|Practice Problems|Check Your Progress)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE),
        "DEFINITION": re.compile(r"^\s*(Definition|Theorem|Lemma|Axiom|Law|Principle)\b[:\s\-]*([0-9\.]+)?", re.IGNORECASE),
        "SUMMARY": re.compile(r"^\s*(Summary|Points to Remember|What we have discussed|Key Takeaways|Chapter at a Glance)\b", re.IGNORECASE),
        "CAPTION": re.compile(r"^\s*(Fig|Figure|Diagram|Chart|Illustration|Photo)\b[:\s\.]*([0-9\.]+)?", re.IGNORECASE),
    }

    MATH_SYMBOLS = set("±√∑∫∏≠≤≥≈∞∝∠∆∇∈∉∩∪⊂⊃⊆⊇∀∃⇒⇔πθαβγδε")
    MATH_OPERATORS = re.compile(r"(\b[a-zA-Z0-9]+\s*[\+\-\*\/\=]\s*[a-zA-Z0-9]+)|([a-zA-Z]\^[0-9]+)|([a-zA-Z]_[0-9]+)|(\b[H|C|O|N|S|P|Na|Cl|Fe|Cu|Ca|Mg][0-9]*[A-Z][0-9]*\b)")

    def __init__(self, media_dir: str = "/tmp/extracted_assets"):
        self.media_dir = media_dir
        os.makedirs(self.media_dir, exist_ok=True)

    def process_pdf(
        self,
        pdf_path: str,
        max_pages: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        extract_images: bool = True,
        render_image_pixels: bool = True,
    ) -> Tuple[List[ChapterSchema], List[PageSchema], str]:
        """
        Executes full textbook extraction:
        1. Detects Table of Contents (TOC) & chapter ranges.
        2. Extracts each page preserving layout, columns, formulas, and diagrams.
        """
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages) if max_pages else total_pages

        if progress_callback:
            progress_callback(0, pages_to_process, f"Opened document ({pages_to_process} pages). Detecting TOC & structure...")

        # 1. Detect TOC & Chapters
        toc_entries, granularity = self._detect_toc(doc)

        # 2. Probe pages with PageRouter (Phase 2 per-page routing)
        from .page_router import PageRouter
        router = PageRouter()
        page_decisions = router.probe_document(doc)
        decisions_by_page = {d.page_num: d for d in page_decisions}

        # 3. Extract pages
        pages: List[PageSchema] = []
        for p_idx in range(pages_to_process):
            page_num = p_idx + 1
            decision = decisions_by_page.get(page_num)
            page_schema = self._extract_single_page(
                doc,
                page_num,
                toc_entries,
                decision=decision,
                extract_images=extract_images,
                render_image_pixels=render_image_pixels,
            )
            pages.append(page_schema)
            if progress_callback:
                progress_callback(page_num, pages_to_process, f"Extracting page {page_num} of {pages_to_process} (layout & LaTeX)...")

        doc.close()
        return toc_entries, pages, granularity

    def _detect_toc(self, doc: fitz.Document) -> Tuple[List[ChapterSchema], str]:
        """
        Extracts chapter boundaries from the document outline or initial pages.
        """
        chapters: List[ChapterSchema] = []

        # A. Try native PDF table of contents outline first
        outline = doc.get_toc()
        if outline:
            for item in outline:
                lvl, title, start_pg = item[0], item[1].strip(), item[2]
                if lvl == 1 and start_pg > 0:
                    ch_num = len(chapters) + 1
                    # Extract chapter number if present in title
                    num_match = re.search(r"\b(?:Chapter|Unit)?\s*([0-9]+)\b", title, re.IGNORECASE)
                    if num_match:
                        ch_num = int(num_match.group(1))

                    clean_title = title.strip()
                    chapters.append(ChapterSchema(
                        chapter_number=ch_num,
                        title=clean_title,
                        start_page=start_pg,
                        end_page=start_pg,  # Will compute end page below
                    ))

        # B. Fallback: Parse first 12 pages for TOC patterns
        if not chapters:
            chapters = self._parse_toc_from_text(doc)

        # Compute end_page boundaries
        total_pages = len(doc)
        if chapters:
            chapters.sort(key=lambda c: c.start_page)
            for i in range(len(chapters) - 1):
                next_start = chapters[i + 1].start_page
                chapters[i].end_page = max(chapters[i].start_page, next_start - 1)
            chapters[-1].end_page = total_pages
            granularity = "WHOLE_BOOK" if len(chapters) >= 2 else "CHAPTER"
        else:
            # No TOC found: do not fabricate dummy "Chapter 1"
            chapters = []
            granularity = "UNKNOWN"

        return chapters, granularity

    def _parse_toc_from_text(self, doc: fitz.Document) -> List[ChapterSchema]:
        """
        Detects table of contents entries from text scanning.
        """
        chapters: List[ChapterSchema] = []
        max_scan = min(len(doc), 12)
        pattern = re.compile(
            r"^(?:Chapter|Unit|Lesson)?\s*([0-9IVXLCDM]+)[\.\:\s\-]+([A-Za-z0-9\s\,\'\-]+?)(?:[\.\s\_\-]{2,}|[\t\s]{2,})([0-9]+)$",
            re.MULTILINE | re.IGNORECASE,
        )

        for p_idx in range(max_scan):
            text = doc[p_idx].get_text("text")
            for match in pattern.finditer(text):
                raw_num, title, pg_str = match.groups()
                try:
                    page_val = int(pg_str.strip())
                    clean_title = title.strip()
                    if 1 <= page_val <= len(doc) and len(clean_title) > 2:
                        ch_num = int(raw_num) if raw_num.isdigit() else (len(chapters) + 1)
                        chapters.append(ChapterSchema(
                            chapter_number=ch_num,
                            title=clean_title,
                            start_page=page_val,
                            end_page=page_val,
                        ))
                except ValueError:
                    continue

        return chapters

    def _extract_single_page(
        self,
        doc: fitz.Document,
        page_num: int,
        toc_entries: List[ChapterSchema],
        decision: Optional[Any] = None,
        extract_images: bool = True,
        render_image_pixels: bool = True,
    ) -> PageSchema:
        """
        Parses a single page preserving columns, LaTeX, diagrams, and activities.
        """
        page = doc[page_num - 1]
        width, height = page.rect.width, page.rect.height

        # 1. Match Chapter
        matched_chapter = None
        for ch in toc_entries:
            if ch.start_page <= page_num <= ch.end_page:
                matched_chapter = ch
                break

        # 2. Extract Embedded Images
        extracted_images = (
            self._extract_page_images(doc, page, page_num, render_image_pixels=render_image_pixels)
            if extract_images
            else []
        )

        # 3. Analyze Column Layout & Sort Blocks
        raw_blocks = page.get_text("blocks")
        text_blocks = [b for b in raw_blocks if b[6] == 0 and b[4].strip()]
        layout_type, sorted_blocks = self._sort_reading_order(text_blocks, width, height)

        # 4. Pedagogical & Formula Classification
        sections: List[SectionSchema] = []
        for b in sorted_blocks:
            x0, y0, x1, y1, text, block_no, col_idx = b
            clean_text = text.strip()
            if not clean_text:
                continue

            sec = self._classify_section(clean_text, col_idx, (x0, y0, x1, y1), extracted_images)
            sections.append(sec)

        # 5. Attach any unlinked images as standalone diagram sections
        for img in extracted_images:
            if not img.get("linked"):
                sections.append(SectionSchema(
                    type="DIAGRAM",
                    heading=img.get("caption", "Figure"),
                    text="",
                    column_index=0,
                    image_path=img.get("path", ""),
                    image_data=img.get("data", ""),
                    image_caption=img.get("caption", ""),
                    metadata={"bbox": img.get("bbox", [])},
                ))

        raw_text = "\n\n".join(b[4].strip() for b in text_blocks)

        # Phase 2 Per-Page Routing Fields
        p_kind = getattr(decision, "page_kind", "digital_text") if decision else "digital_text"
        p_engine = getattr(decision, "engine", "TextbookPipeline (Rule-Based Fallback)") if decision else "TextbookPipeline (Rule-Based Fallback)"
        p_reason = getattr(decision, "route_reason", "") if decision else ""
        p_script = getattr(decision, "detected_script", "latin") if decision else "latin"
        p_ocr_lang = getattr(decision, "ocr_language", None) if decision else None
        p_legacy = getattr(decision, "legacy_font_encoding", False) if decision else False
        p_review = getattr(decision, "needs_review", False) if decision else False
        p_quality = getattr(decision, "quality_score", 1.0) if decision else 1.0
        p_meta = dict(getattr(decision, "metadata", {})) if decision else {}

        # Handle full-page image / advertisement pages
        if p_kind == "image_only":
            raw_text = ""
            p_review = False
            p_quality = 1.0

        return PageSchema(
            page_number=page_num,
            layout_type=layout_type,
            raw_text=raw_text,
            chapter_number=matched_chapter.chapter_number if matched_chapter else None,
            chapter_title=matched_chapter.title if matched_chapter else "",
            sections=sections,
            page_kind=p_kind,
            engine=p_engine,
            route_reason=p_reason,
            detected_script=p_script,
            ocr_language=p_ocr_lang,
            legacy_font_encoding=p_legacy,
            needs_review=p_review,
            quality_score=p_quality,
            metadata=p_meta,
        )

    def _sort_reading_order(self, blocks: List[Tuple], width: float, height: float) -> Tuple[str, List[Tuple]]:
        """
        Sorts blocks in human reading order:
        - Top full-width banners
        - Left column (top to bottom)
        - Right column (top to bottom)
        - Bottom full-width footers
        """
        if not blocks:
            return "SINGLE_COLUMN", []

        mid_x = width / 2.0
        left_blocks, right_blocks, span_blocks = [], [], []

        for b in blocks:
            x0, y0, x1, y1, text, block_no = b[:6]
            block_w = x1 - x0

            # Headers (top 4%) and footers (bottom 4%)
            if y1 < height * 0.04 or y0 > height * 0.96 or block_w > width * 0.60:
                span_blocks.append((x0, y0, x1, y1, text, block_no, 0))
            elif x1 <= mid_x + (width * 0.06):
                left_blocks.append((x0, y0, x1, y1, text, block_no, 1))
            elif x0 >= mid_x - (width * 0.06):
                right_blocks.append((x0, y0, x1, y1, text, block_no, 2))
            else:
                span_blocks.append((x0, y0, x1, y1, text, block_no, 0))

        has_two_cols = len(left_blocks) >= 2 and len(right_blocks) >= 2
        if has_two_cols:
            layout_type = "HYBRID_COLUMN" if span_blocks else "TWO_COLUMN"
            left_blocks.sort(key=lambda x: x[1])
            right_blocks.sort(key=lambda x: x[1])
            span_blocks.sort(key=lambda x: x[1])
            sorted_blocks = span_blocks[:1] + left_blocks + right_blocks + span_blocks[1:]
            return layout_type, sorted_blocks

        # Default single column
        layout_type = "SINGLE_COLUMN"
        all_blocks = [(b[0], b[1], b[2], b[3], b[4], b[5], 0) for b in blocks]
        all_blocks.sort(key=lambda x: x[1])
        return layout_type, all_blocks

    def _classify_section(
        self,
        text: str,
        col_idx: int,
        bbox: Tuple[float, float, float, float],
        images: List[Dict[str, Any]],
    ) -> SectionSchema:
        """
        Classifies a text block into pedagogical item types and extracts LaTeX formulas.
        Pairs nearest image with caption if caption is detected.
        """
        # A. Check for matching caption
        cap_match = self.PATTERNS["CAPTION"].match(text)
        if cap_match:
            # Pair with spatially closest unlinked image
            best_img = self._find_closest_image(bbox, images)
            if best_img:
                best_img["linked"] = True
                best_img["caption"] = text
                return SectionSchema(
                    type="DIAGRAM",
                    heading=cap_match.group(0),
                    text=text,
                    column_index=col_idx,
                    image_path=best_img.get("path", ""),
                    image_data=best_img.get("data", ""),
                    image_caption=text,
                    metadata={"bbox": list(bbox)},
                )

        # B. Check for Pedagogical Types
        for p_type, regex in self.PATTERNS.items():
            if p_type == "CAPTION":
                continue
            match = regex.match(text)
            if match:
                heading = match.group(0)
                _, latex_formulas = self._detect_latex_formulas(text)
                return SectionSchema(
                    type=p_type,
                    heading=heading,
                    text=text,
                    column_index=col_idx,
                    latex_equations=latex_formulas,
                    metadata={"bbox": list(bbox)},
                )

        # C. Check if purely a formula block
        is_formula, latex_formulas = self._detect_latex_formulas(text)
        if is_formula and len(text.split()) <= 15:
            return SectionSchema(
                type="FORMULA",
                heading="",
                text=text,
                column_index=col_idx,
                latex_equations=latex_formulas,
                metadata={"bbox": list(bbox)},
            )

        # D. Default Paragraph
        return SectionSchema(
            type="PARAGRAPH",
            heading="",
            text=text,
            column_index=col_idx,
            latex_equations=latex_formulas,
            metadata={"bbox": list(bbox)},
        )

    def _detect_latex_formulas(self, text: str) -> Tuple[bool, List[str]]:
        """
        Converts mathematical & chemical expressions into LaTeX format ($...$).
        """
        # Exclude regular prose containing substantial Devanagari / Hindi characters
        devanagari_count = sum(1 for c in text if "\u0900" <= c <= "\u097f")
        if devanagari_count > 15:
            return False, []

        formulas = []
        has_symbol = any(c in self.MATH_SYMBOLS for c in text)
        has_operator = bool(self.MATH_OPERATORS.search(text))

        if not (has_symbol or has_operator):
            return False, []

        lines = [line.strip() for line in text.split("\n") if line.strip()]
        for line in lines:
            line_deva = sum(1 for c in line if "\u0900" <= c <= "\u097f")
            if line_deva > 10:
                continue
            if any(c in self.MATH_SYMBOLS for c in line) or "=" in line:
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
                formulas.append(f"${normalized}$")

        return bool(formulas), formulas

    def _extract_page_images(
        self,
        doc: fitz.Document,
        page: fitz.Page,
        page_num: int,
        render_image_pixels: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Extracts images on the page using visual viewport clipping.
        This captures full color, alpha masks, vector diagrams, and annotations
        without producing solid black rectangles.
        When render_image_pixels=False, extracts bounding boxes and metadata without
        heavy raster pixmap rendering.
        """
        images = []
        for img_idx, img_info in enumerate(page.get_images(full=True)):
            xref = img_info[0]
            try:
                rects = page.get_image_rects(xref)
                if not rects:
                    continue
                rect = rects[0]
                # Filter out tiny decoration icons (<35x35)
                if rect.width < 35 or rect.height < 35:
                    continue

                if not render_image_pixels:
                    images.append({
                        "path": "",
                        "filename": f"page_{page_num}_fig_{img_idx + 1}.png",
                        "data": "",
                        "bbox": list(rect),
                        "linked": False,
                        "caption": "",
                    })
                    continue

                # Visual viewport clipping directly from the page at 200 DPI
                clip_pix = page.get_pixmap(clip=rect, dpi=200)
                if clip_pix.n >= 5:
                    clip_pix = fitz.Pixmap(fitz.csRGB, clip_pix)
                image_bytes = clip_pix.tobytes("png")
                ext = "png"

                # If large image, compress to JPEG
                if len(image_bytes) > 250_000:
                    try:
                        compressed = clip_pix.tobytes("jpeg", jpg_quality=85)
                        if len(compressed) < len(image_bytes):
                            image_bytes = compressed
                            ext = "jpg"
                    except Exception:
                        pass

                b64_str = base64.b64encode(image_bytes).decode("utf-8")
                image_data_uri = f"data:image/{ext};base64,{b64_str}"

                filename = f"page_{page_num}_fig_{img_idx + 1}.{ext}"
                filepath = os.path.join(self.media_dir, filename)

                if not os.path.exists(filepath):
                    with open(filepath, "wb") as f:
                        f.write(image_bytes)

                images.append({
                    "path": filepath,
                    "filename": filename,
                    "data": image_data_uri,
                    "bbox": list(rect),
                    "linked": False,
                    "caption": "",
                })
            except Exception as err:
                logger.warning(f"Error rendering image {img_idx} on page {page_num}: {err}")
                continue

        return images

    def _find_closest_image(self, caption_bbox: Tuple[float, float, float, float], images: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Finds the unlinked image spatially closest to the caption.
        """
        unlinked = [img for img in images if not img.get("linked")]
        if not unlinked:
            return None

        cap_y = caption_bbox[1]  # Top Y of caption
        best_img = None
        min_dist = float("inf")

        for img in unlinked:
            img_y1 = img["bbox"][3]  # Bottom Y of image
            # Distance from bottom of image to top of caption
            dist = abs(cap_y - img_y1)
            if dist < min_dist:
                min_dist = dist
                best_img = img

        return best_img
