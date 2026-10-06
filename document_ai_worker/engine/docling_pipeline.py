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
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import pymupdf as fitz
from PIL import Image

from .schema import ChapterSchema, PageSchema, SectionSchema

logger = logging.getLogger(__name__)


class DoclingLogInterceptor(logging.Handler):
    """
    Intercepts Docling and Tesseract log messages in real-time to track active page conversion.
    """
    def __init__(self, on_page_detected: Callable[[int], None]):
        super().__init__()
        self.on_page_detected = on_page_detected
        self.pattern = re.compile(r"page:\s*(\d+)", re.IGNORECASE)

    def emit(self, record: logging.LogRecord):
        try:
            msg = record.getMessage()
            match = self.pattern.search(msg)
            if match:
                # 0-indexed page in docling log, convert to 1-indexed
                page_idx = int(match.group(1)) + 1
                self.on_page_detected(page_idx)
        except Exception:
            pass


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

        # Setup real-time progress monitor during doc_converter.convert()
        latest_page = [0]
        stop_monitor = threading.Event()

        def update_latest_page(p_num: int):
            if p_num > latest_page[0]:
                latest_page[0] = min(p_num, pages_to_process)

        log_handler = DoclingLogInterceptor(update_latest_page)
        logging.getLogger().addHandler(log_handler)

        def progress_worker():
            start_time = time.time()
            last_sent_page = 0
            while not stop_monitor.wait(2.5):
                cur_p = latest_page[0]
                elapsed = time.time() - start_time
                if cur_p == 0:
                    # Initial warmup / model loading (~10-20s)
                    sim_p = min(max(1, int(elapsed / 7.0)), max(1, pages_to_process - 1))
                    if progress_callback:
                        progress_callback(
                            sim_p,
                            pages_to_process,
                            f"Docling AI warming up models & analyzing layout (page ~{sim_p} of {pages_to_process})...",
                        )
                elif cur_p > last_sent_page:
                    last_sent_page = cur_p
                    if progress_callback:
                        progress_callback(
                            cur_p,
                            pages_to_process,
                            f"Docling AI processing page {cur_p} of {pages_to_process} (DocLayNet & OCR)...",
                        )
                else:
                    if progress_callback and cur_p > 0:
                        progress_callback(
                            cur_p,
                            pages_to_process,
                            f"Docling AI processing page {cur_p} of {pages_to_process} (DocLayNet & OCR)...",
                        )

        monitor_thread = threading.Thread(target=progress_worker, daemon=True)
        monitor_thread.start()

        try:
            if max_pages:
                conv_res = doc_converter.convert(pdf_path, max_num_pages=max_pages)
            else:
                conv_res = doc_converter.convert(pdf_path)
        finally:
            stop_monitor.set()
            monitor_thread.join(timeout=1.0)
            try:
                logging.getLogger().removeHandler(log_handler)
            except Exception:
                pass

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
        from .page_router import PageRouter
        router = PageRouter()
        page_decisions = router.probe_document(fitz_doc)
        decisions_by_page = {d.page_num: d for d in page_decisions}

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
            consumed_item_ids = set()

            for item_idx, (item, level) in enumerate(items_on_page):
                if id(item) in consumed_item_ids:
                    continue

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
                            current_chapter_title = clean_text[:200]
                            chapters.append(ChapterSchema(
                                chapter_number=current_chapter_num,
                                title=current_chapter_title,
                                start_page=page_num,
                                end_page=page_num,
                            ))
                        except ValueError:
                            pass

                # If this item is a CAPTION following a DIAGRAM, attach it directly
                if "CAPTION" in label_str and sections and sections[-1].type == "DIAGRAM":
                    diag = sections[-1]
                    if not diag.image_caption or diag.image_caption.startswith("Figure "):
                        diag.image_caption = clean_text
                        fig_m = re.match(r"^\s*((?:Figure|Fig\.?|Image|Photo|Diagram|चित्र|आकृति|ग्राफ)\s*[\d\.\-\w]+)(?:[\s:\.\-—]+(.*))?$", clean_text, re.IGNORECASE)
                        if fig_m:
                            diag.image_label = fig_m.group(1).strip()
                            diag.heading = diag.image_label
                            if fig_m.group(2) and fig_m.group(2).strip():
                                diag.image_description = fig_m.group(2).strip()
                        else:
                            diag.image_description = clean_text
                    continue

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

                    # Comprehensive caption & description extraction
                    caption_candidates = []
                    if hasattr(item, "captions") and item.captions:
                        for cap_ref in item.captions:
                            try:
                                if hasattr(cap_ref, "text") and cap_ref.text:
                                    caption_candidates.append(cap_ref.text.strip())
                                elif hasattr(cap_ref, "resolve"):
                                    res = cap_ref.resolve(doc)
                                    if hasattr(res, "text") and res.text:
                                        caption_candidates.append(res.text.strip())
                            except Exception:
                                pass

                    if hasattr(item, "caption_text"):
                        try:
                            ct = item.caption_text(doc)
                            if ct and ct.strip():
                                caption_candidates.append(ct.strip())
                        except Exception:
                            pass

                    if clean_text:
                        caption_candidates.append(clean_text)

                    # Lookahead: Check if next item on the page is a caption
                    if item_idx + 1 < len(items_on_page):
                        next_item, _ = items_on_page[item_idx + 1]
                        next_label = str(getattr(next_item, "label", "")).upper()
                        next_txt = (getattr(next_item, "text", "") or "").strip()
                        if "CAPTION" in next_label or re.match(r"^\s*(?:Figure|Fig\.?|Image|Photo|Diagram|चित्र|आकृति|ग्राफ)\s*[\d\.\-\w]+", next_txt, re.IGNORECASE):
                            caption_candidates.append(next_txt)
                            consumed_item_ids.add(id(next_item))

                    description_candidates = []
                    if hasattr(item, "annotations") and item.annotations:
                        for ann in item.annotations:
                            try:
                                t = getattr(ann, "text", "") or getattr(ann, "description", "")
                                if t and t.strip():
                                    description_candidates.append(t.strip())
                            except Exception:
                                pass

                    chosen_caption = ""
                    for c in caption_candidates:
                        if c and c.strip():
                            chosen_caption = c.strip()
                            break

                    fig_pat = r"^\s*((?:Figure|Fig\.?|Image|Photo|Diagram|चित्र|आकृति|ग्राफ)\s*[\d\.\-\w]+)(?:[\s:\.\-—]+(.*))?$"
                    fig_match = re.match(fig_pat, chosen_caption, re.IGNORECASE) if chosen_caption else None

                    if fig_match:
                        image_label = fig_match.group(1).strip()
                        desc_text = (fig_match.group(2) or "").strip()
                        image_caption = chosen_caption
                        image_description = desc_text or ("\n".join(description_candidates) if description_candidates else chosen_caption)
                    else:
                        image_label = f"Figure {pic_idx}"
                        image_caption = chosen_caption or f"Figure {pic_idx}"
                        image_description = chosen_caption or ("\n".join(description_candidates) if description_candidates else "")

                    sections.append(SectionSchema(
                        type="DIAGRAM",
                        heading=image_label or image_caption[:60],
                        text=image_description or clean_text,
                        column_index=0,
                        image_path=direct_path,
                        image_data=img_data,
                        image_caption=image_caption,
                        image_label=image_label,
                        image_description=image_description,
                        metadata={"bbox": bbox, "image_label": image_label, "image_description": image_description},
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
                            heading=clean_text[:250],
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

            dec = decisions_by_page.get(page_num)
            p_kind = getattr(dec, "page_kind", "digital_text") if dec else "digital_text"
            p_engine = getattr(dec, "engine", "Docling AI (DocLayNet)") if dec else "Docling AI (DocLayNet)"
            p_reason = getattr(dec, "route_reason", "Docling layout and block analysis") if dec else "Docling layout and block analysis"
            p_script = getattr(dec, "detected_script", "latin") if dec else "latin"
            p_ocr_lang = getattr(dec, "ocr_language", None) if dec else None
            p_legacy = getattr(dec, "legacy_font_encoding", False) if dec else False
            p_review = getattr(dec, "needs_review", False) if dec else False
            p_quality = getattr(dec, "quality_score", 1.0) if dec else 1.0
            p_meta = dict(getattr(dec, "metadata", {})) if dec else {}

            p_flags: List[str] = []
            page_raw_text = "\n\n".join(page_text_pieces)

            if p_kind != "blank" and page_raw_text:
                from .text_cleaner import clean_page_text
                clean_res = clean_page_text(page_raw_text, fitz_page=fitz_page)
                page_raw_text = clean_res.text
                p_flags.extend(clean_res.flags)
                if clean_res.glued_words:
                    p_meta["glued_words"] = clean_res.glued_words
                p_quality = round(min(p_quality, clean_res.quality_score), 3)
                if p_quality < 0.70:
                    p_review = True

                for sec in sections:
                    if sec.type != "DIAGRAM" and sec.text:
                        sec.text = clean_page_text(sec.text).text

            if p_legacy:
                has_devanagari = any("\u0900" <= c <= "\u097f" for c in page_raw_text)
                if not has_devanagari:
                    p_review = True
                    p_quality = 0.50
                    p_meta["raw_text_unreliable"] = page_raw_text
                    p_reason = f"{p_reason}; OCR unavailable or pending; corrupted text quarantined to metadata"
                    page_raw_text = ""
                    for sec in sections:
                        if sec.type != "DIAGRAM":
                            sec.text = ""

            pages.append(PageSchema(
                page_number=page_num,
                layout_type="SINGLE_COLUMN",
                raw_text=page_raw_text,
                chapter_number=current_chapter_num,
                chapter_title=current_chapter_title,
                sections=sections,
                page_kind=p_kind,
                engine=p_engine,
                route_reason=p_reason,
                detected_script=p_script,
                ocr_language=p_ocr_lang,
                legacy_font_encoding=p_legacy,
                needs_review=p_review,
                quality_score=p_quality,
                quality_flags=p_flags,
                metadata=p_meta,
            ))

        fitz_doc.close()

        if not chapters:
            chapters = []
            granularity = "UNKNOWN"
        else:
            # Calculate chapter end pages
            for i in range(len(chapters) - 1):
                chapters[i].end_page = max(chapters[i].start_page, chapters[i + 1].start_page - 1)
            chapters[-1].end_page = len(pages)
            granularity = "WHOLE_BOOK" if len(chapters) > 1 else "CHAPTER"

        return chapters, pages, granularity
