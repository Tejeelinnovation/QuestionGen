"""
IBM Docling Document Pipeline for Educational Textbooks & Complex Documents.

Combines:
- IBM Docling (DocLayNet for lightweight CNN layout analysis, reading order, and table parsing)
- Native PIL Picture Extraction with PyMuPDF High-DPI Visual Clipping fallback
- LaTeX formula detection
- Fast CPU-optimized execution (< 1-2s per page)
"""

from __future__ import annotations

import base64
import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

import pymupdf as fitz
from PIL import Image

from .schema import ChapterSchema, PageSchema, SectionSchema

logger = logging.getLogger(__name__)


class DoclingPipeline:
    """
    Executes lightweight, fast deep-learning Document AI extraction using IBM Docling.
    Runs in seconds on CPU without needing llama-server or external GPU processes.
    """

    def __init__(self, media_dir: str = "/tmp/extracted_assets"):
        self.media_dir = media_dir
        os.makedirs(self.media_dir, exist_ok=True)

    def process_pdf(
        self,
        pdf_path: str,
        max_pages: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> Tuple[List[ChapterSchema], List[PageSchema], str]:
        """
        Executes Docling extraction and parses the resulting DoclingDocument
        into ChapterSchema, PageSchema, and SectionSchema.
        """
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling_core.types.doc import DocItemLabel, PictureItem, TableItem

        # 1. Determine total pages
        fitz_doc = fitz.open(pdf_path)
        total_pages = len(fitz_doc)
        pages_to_process = min(total_pages, max_pages) if max_pages else total_pages

        if progress_callback:
            progress_callback(
                0,
                pages_to_process,
                f"Starting IBM Docling AI (DocLayNet Layout + Tables) for {pages_to_process} pages...",
            )

        # 2. Inspect document to detect legacy non-Unicode fonts (Walkman-Chanakya, KrutiDev, DevLys, etc.)
        has_legacy_fonts = False
        try:
            for p_i in range(min(total_pages, 5)):
                for font_tuple in fitz_doc[p_i].get_fonts():
                    fname = (font_tuple[3] if len(font_tuple) > 3 else "").lower()
                    if any(f in fname for f in ("chanakya", "kruti", "devlys", "walkman", "shree", "shivaji", "bilingual", "aps", "akruti", "kundli")):
                        has_legacy_fonts = True
                        break
                if has_legacy_fonts:
                    break
        except Exception as probe_err:
            logger.debug(f"Document font probe note: {probe_err}")

        force_ocr_env = os.environ.get("DOCLING_FORCE_FULL_PAGE_OCR", "").lower() in ("1", "true", "yes")
        enable_full_page = has_legacy_fonts or force_ocr_env

        logger.info(
            f"Docling OCR Configuration: do_ocr=True, force_full_page_ocr={enable_full_page} "
            f"(legacy_font_detected={has_legacy_fonts}, env_override={force_ocr_env})"
        )

        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = True

        # Configure Google Tesseract OCR for ultra-fast, lightweight C++ conversion (~0.5s per page)
        ocr_langs = ["hin", "eng"]
        env_langs = os.environ.get("TESSERACT_LANGS", "")
        if env_langs:
            ocr_langs = [l.strip() for l in env_langs.split(",") if l.strip()]

        try:
            from docling.datamodel.pipeline_options import TesseractCliOcrOptions
            pipeline_options.ocr_options = TesseractCliOcrOptions(
                force_full_page_ocr=enable_full_page,
                lang=ocr_langs,
            )
            logger.info(f"Initialized Google Tesseract CLI OCR (langs={ocr_langs}, force_full_page={enable_full_page})")
        except Exception as tesseract_err:
            logger.warning(f"TesseractCliOcrOptions not available: {tesseract_err}. Falling back to EasyOcrOptions...")
            try:
                from docling.datamodel.pipeline_options import EasyOcrOptions
                pipeline_options.ocr_options = EasyOcrOptions(
                    force_full_page_ocr=enable_full_page,
                    lang=["hi", "en"],
                    use_gpu=False,
                )
            except Exception as easy_err:
                logger.warning(f"EasyOCR fallback also failed: {easy_err}. Using default OCR.")

        pipeline_options.generate_picture_images = True
        pipeline_options.images_scale = 2.0  # Crisp 200+ DPI images for diagrams

        doc_converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )

        logger.info(f"Running Docling conversion on {pdf_path} (max_pages={pages_to_process})...")
        if max_pages:
            conv_res = doc_converter.convert(pdf_path, max_num_pages=max_pages)
        else:
            conv_res = doc_converter.convert(pdf_path)

        doc = conv_res.document
        logger.info("Docling document model parsing complete. Converting to application schema...")

        # 3. Organize items by page
        # Map page_number (1-indexed) -> list of Docling items
        page_items_map: Dict[int, List[Any]] = {p: [] for p in range(1, pages_to_process + 1)}

        for item, level in doc.iterate_items():
            page_no = 1
            if hasattr(item, "prov") and item.prov:
                page_no = getattr(item.prov[0], "page_no", 1)
            elif hasattr(item, "page_no"):
                page_no = getattr(item, "page_no", 1)

            if 1 <= page_no <= pages_to_process:
                page_items_map[page_no].append((item, level))

        # 4. Construct ChapterSchema and PageSchema
        chapters: List[ChapterSchema] = []
        pages: List[PageSchema] = []
        current_chapter_num = 1
        current_chapter_title = "Chapter 1"

        for page_num in range(1, pages_to_process + 1):
            if progress_callback:
                progress_callback(
                    page_num,
                    pages_to_process,
                    f"Structuring page {page_num} of {pages_to_process} with Docling AI...",
                )

            items_on_page = page_items_map.get(page_num, [])
            sections: List[SectionSchema] = []
            page_text_pieces: List[str] = []

            # Open PyMuPDF page as visual crop backup for diagrams
            fitz_page = fitz_doc[page_num - 1] if page_num - 1 < len(fitz_doc) else None

            pic_idx = 0
            for item, level in items_on_page:
                label = getattr(item, "label", None)
                label_str = str(label.name if hasattr(label, "name") else label).upper()

                raw_text = getattr(item, "text", "") or ""
                clean_text = raw_text.strip()

                bbox = []
                if hasattr(item, "prov") and item.prov:
                    prov_bbox = getattr(item.prov[0], "bbox", None)
                    if prov_bbox:
                        bbox = [
                            getattr(prov_bbox, "l", 0.0),
                            getattr(prov_bbox, "t", 0.0),
                            getattr(prov_bbox, "r", 0.0),
                            getattr(prov_bbox, "b", 0.0),
                        ]

                # Check for chapter title
                if "TITLE" in label_str or "HEADER" in label_str:
                    ch_match = re.search(r"(?:अध्याय|Chapter|Unit)\s*([0-9]+)", clean_text, re.IGNORECASE)
                    if ch_match:
                        try:
                            current_chapter_num = int(ch_match.group(1))
                            current_chapter_title = clean_text
                            chapters.append(ChapterSchema(
                                chapter_number=current_chapter_num,
                                title=clean_text,
                                start_page=page_num,
                                end_page=page_num,
                            ))
                        except ValueError:
                            pass

                # A. Picture / Diagram items
                if isinstance(item, PictureItem) or "PICTURE" in label_str:
                    pic_idx += 1
                    img_data = ""
                    direct_path = ""
                    image_filename = f"docling_p{page_num}_fig_{pic_idx}.png"
                    img_dest_path = os.path.join(self.media_dir, image_filename)

                    # Method 1: Get PIL Image directly generated by Docling
                    pil_img = None
                    try:
                        if hasattr(item, "get_image"):
                            pil_img = item.get_image(doc)
                        elif hasattr(item, "image") and getattr(item.image, "pil_image", None):
                            pil_img = item.image.pil_image
                    except Exception as img_err:
                        logger.debug(f"Docling direct image extraction error: {img_err}")

                    # Method 2: High-DPI Visual Viewport Clipping fallback from PDF page
                    if pil_img is None and fitz_page and bbox and len(bbox) == 4:
                        try:
                            # Docling uses bottom-left or top-left depending on coordinate space
                            x0, y0, x1, y1 = bbox
                            page_h = fitz_page.rect.height
                            rect = fitz.Rect(min(x0, x1), min(page_h - max(y0, y1), min(y0, y1)), max(x0, x1), max(page_h - min(y0, y1), max(y0, y1)))
                            if rect.width > 20 and rect.height > 20:
                                pix = fitz_page.get_pixmap(clip=rect, dpi=200)
                                pix.save(img_dest_path)
                                direct_path = img_dest_path
                                with open(img_dest_path, "rb") as imf:
                                    b64 = base64.b64encode(imf.read()).decode("utf-8")
                                    img_data = f"data:image/png;base64,{b64}"
                        except Exception as clip_err:
                            logger.debug(f"PyMuPDF visual clipping fallback error: {clip_err}")

                    if pil_img is not None:
                        pil_img.save(img_dest_path, format="PNG")
                        direct_path = img_dest_path
                        with open(img_dest_path, "rb") as imf:
                            b64 = base64.b64encode(imf.read()).decode("utf-8")
                            img_data = f"data:image/png;base64,{b64}"

                    caption = clean_text or getattr(item, "caption", "") or f"Figure {pic_idx}"
                    sections.append(SectionSchema(
                        type="DIAGRAM",
                        heading=caption[:60],
                        text=clean_text,
                        column_index=0,
                        image_path=direct_path,
                        image_data=img_data,
                        image_caption=caption,
                        metadata={"bbox": bbox},
                    ))

                # B. Table items
                elif isinstance(item, TableItem) or "TABLE" in label_str:
                    table_md = ""
                    try:
                        table_md = item.export_to_markdown()
                    except Exception:
                        table_md = clean_text

                    sections.append(SectionSchema(
                        type="PARAGRAPH",
                        heading=clean_text[:50] if clean_text else "Table",
                        text=table_md or clean_text,
                        column_index=0,
                        metadata={"bbox": bbox, "is_table": True},
                    ))
                    page_text_pieces.append(table_md or clean_text)

                # C. Formula items
                elif "FORMULA" in label_str or "EQUATION" in label_str:
                    latex_str = f"${clean_text}$" if not clean_text.startswith("$") else clean_text
                    sections.append(SectionSchema(
                        type="FORMULA",
                        heading="",
                        text=clean_text,
                        column_index=0,
                        latex_equations=[latex_str],
                        metadata={"bbox": bbox},
                    ))
                    page_text_pieces.append(clean_text)

                # D. Section Headers & Paragraphs
                elif "HEADER" in label_str or "TITLE" in label_str:
                    if clean_text:
                        sections.append(SectionSchema(
                            type="PARAGRAPH",
                            heading=clean_text,
                            text=clean_text,
                            column_index=0,
                            metadata={"bbox": bbox, "is_header": True},
                        ))
                        page_text_pieces.append(clean_text)

                else:
                    if not clean_text:
                        continue

                    # Pedagogical classification
                    p_type = "PARAGRAPH"
                    heading = ""
                    if re.match(r"^\s*(उदाहरण|Example|Solved Example)\b", clean_text, re.IGNORECASE):
                        p_type = "SOLVED_EXAMPLE"
                        heading = clean_text[:40]
                    elif re.match(r"^\s*(प्रश्नावली|अभ्यास|Exercise|Question)\b", clean_text, re.IGNORECASE):
                        p_type = "EXERCISE_QUESTION"
                        heading = clean_text[:40]
                    elif re.match(r"^\s*(परिभाषा|प्रमेय|Definition|Theorem)\b", clean_text, re.IGNORECASE):
                        p_type = "DEFINITION"
                        heading = clean_text[:40]
                    elif re.match(r"^\s*(सारांश|Summary)\b", clean_text, re.IGNORECASE):
                        p_type = "SUMMARY"
                        heading = clean_text[:40]

                    sections.append(SectionSchema(
                        type=p_type,
                        heading=heading,
                        text=clean_text,
                        column_index=0,
                        metadata={"bbox": bbox},
                    ))
                    page_text_pieces.append(clean_text)

            pages.append(PageSchema(
                page_number=page_num,
                layout_type="SINGLE_COLUMN",
                raw_text="\n\n".join(page_text_pieces),
                chapter_number=current_chapter_num,
                chapter_title=current_chapter_title,
                sections=sections,
            ))

        fitz_doc.close()

        if not chapters:
            chapters = [ChapterSchema(
                chapter_number=1,
                title="Extracted Document",
                start_page=1,
                end_page=len(pages),
                summary="Full document extracted via IBM Docling AI.",
            )]

        # Calculate chapter end pages
        for i in range(len(chapters) - 1):
            chapters[i].end_page = max(chapters[i].start_page, chapters[i + 1].start_page - 1)
        if chapters:
            chapters[-1].end_page = len(pages)

        granularity = "MULTI_CHAPTER" if len(chapters) > 1 else "SINGLE_CHAPTER"
        return chapters, pages, granularity
