"""
IBM Docling Document Pipeline for Educational Textbooks & Complex Documents.

Combines:
- IBM Docling (DocLayNet for lightweight CNN layout analysis, reading order, and table parsing)
- Multi-Process Page Chunking across 4 vCPUs & 12 GB RAM for fast parallel execution
- Accurate legacy font detection avoiding false-positive triggers on standard typography
- Native PIL Picture Extraction with PyMuPDF High-DPI Visual Clipping fallback
- LaTeX formula detection
"""

from __future__ import annotations

import base64
import concurrent.futures
import logging
import os
import re
import tempfile
import threading
import time
import uuid
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


def _parse_docling_document(
    doc: Any,
    fitz_doc: Any,
    pages_to_process: int,
    media_dir: str,
    start_page_offset: int = 0,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    total_doc_pages: Optional[int] = None,
) -> Tuple[List[ChapterSchema], List[PageSchema]]:
    """
    Parses a converted Docling document model into application ChapterSchema and PageSchema.
    Supports global page number offsetting for parallel chunk processing.
    """
    from docling_core.types.doc import DocItemLabel, PictureItem, TableItem
    from .page_router import PageRouter
    from .text_cleaner import detect_caesar_shift, unshift_ncert_text, clean_page_text

    page_items_map: Dict[int, List[Any]] = {p: [] for p in range(1, pages_to_process + 1)}

    for item, level in doc.iterate_items():
        page_no = 1
        if hasattr(item, "prov") and item.prov:
            page_no = getattr(item.prov[0], "page_no", 1)
        elif hasattr(item, "page_no"):
            page_no = getattr(item.page_no, "page_no", 1)

        if 1 <= page_no <= pages_to_process:
            page_items_map[page_no].append((item, level))

    router = PageRouter()
    page_decisions = router.probe_document(fitz_doc)
    decisions_by_page = {d.page_num: d for d in page_decisions}

    chapters: List[ChapterSchema] = []
    pages: List[PageSchema] = []
    current_chapter_num = 1
    current_chapter_title = "Chapter 1"

    for page_num in range(1, pages_to_process + 1):
        global_page_num = page_num + start_page_offset
        if progress_callback:
            tot = total_doc_pages or pages_to_process
            progress_callback(
                global_page_num,
                tot,
                f"Structuring page {global_page_num} of {tot} with Docling AI...",
            )

        items_on_page = page_items_map.get(page_num, [])
        sections: List[SectionSchema] = []
        page_text_pieces: List[str] = []

        fitz_page = fitz_doc[page_num - 1] if page_num - 1 < len(fitz_doc) else None
        dec = decisions_by_page.get(page_num)
        p_legacy = getattr(dec, "legacy_font_encoding", False) if dec else False

        pic_idx = 0
        consumed_item_ids = set()

        for item_idx, (item, level) in enumerate(items_on_page):
            if id(item) in consumed_item_ids:
                continue

            label = getattr(item, "label", None)
            label_str = str(label.name if hasattr(label, "name") else label).upper()

            raw_text = getattr(item, "text", "") or ""
            clean_text = raw_text.strip()
            if detect_caesar_shift(clean_text):
                clean_text = unshift_ncert_text(clean_text)
            elif p_legacy and clean_text and not any("\u0900" <= c <= "\u097f" for c in clean_text):
                from .legacy_font_converter import remap_legacy_text
                r_txt, _ = remap_legacy_text(clean_text)
                if any("\u0900" <= c <= "\u097f" for c in r_txt):
                    clean_text = r_txt

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
                            start_page=global_page_num,
                            end_page=global_page_num,
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
                img_data = ""
                direct_path = ""

                # Method 1: Get PIL Image directly generated by Docling
                pil_img = None
                try:
                    if hasattr(item, "get_image"):
                        pil_img = item.get_image(doc)
                    elif hasattr(item, "image") and getattr(item.image, "pil_image", None):
                        pil_img = item.image.pil_image
                except Exception as img_err:
                    logger.debug(f"Docling direct image extraction error: {img_err}")

                # Ignore micro decorative icons, single dots, bullets (< 45x45 px)
                if pil_img is not None and (pil_img.width < 45 or pil_img.height < 45):
                    pil_img = None

                # Method 2: High-DPI Visual Viewport Clipping fallback from PDF page
                if pil_img is None and fitz_page and bbox and len(bbox) == 4:
                    try:
                        x0, y0, x1, y1 = bbox
                        page_h = fitz_page.rect.height
                        rect = fitz.Rect(min(x0, x1), min(page_h - max(y0, y1), min(y0, y1)), max(x0, x1), max(page_h - min(y0, y1), max(y0, y1)))
                        if rect.width >= 45 and rect.height >= 45:
                            candidate_filename = f"docling_p{global_page_num}_fig_{pic_idx + 1}.png"
                            candidate_path = os.path.join(media_dir, candidate_filename)
                            pix = fitz_page.get_pixmap(clip=rect, dpi=200)
                            pix.save(candidate_path)
                            if os.path.exists(candidate_path) and os.path.getsize(candidate_path) >= 400:
                                pic_idx += 1
                                direct_path = candidate_path
                                with open(candidate_path, "rb") as imf:
                                    b64 = base64.b64encode(imf.read()).decode("utf-8")
                                    img_data = f"data:image/png;base64,{b64}"
                            else:
                                if os.path.exists(candidate_path):
                                    os.remove(candidate_path)
                    except Exception as clip_err:
                        logger.debug(f"PyMuPDF visual clipping fallback error: {clip_err}")

                if pil_img is not None:
                    candidate_filename = f"docling_p{global_page_num}_fig_{pic_idx + 1}.png"
                    candidate_path = os.path.join(media_dir, candidate_filename)
                    pil_img.save(candidate_path, format="PNG")
                    if os.path.exists(candidate_path) and os.path.getsize(candidate_path) >= 400:
                        pic_idx += 1
                        direct_path = candidate_path
                        with open(candidate_path, "rb") as imf:
                            b64 = base64.b64encode(imf.read()).decode("utf-8")
                            img_data = f"data:image/png;base64,{b64}"
                    else:
                        if os.path.exists(candidate_path):
                            os.remove(candidate_path)

                if not direct_path and not img_data:
                    continue

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
            elif "FORMULA" in label_str or "EQUATION" in label_str or "MATH" in label_str:
                raw_formula = (clean_text or "").strip()
                # If Docling extracted generic category labels instead of math characters, clear it
                if raw_formula.lower() in ("formula", "equation", "math", "सूत्र", "चित्र", "figure", "table", "सारणी"):
                    latex_str = ""
                else:
                    latex_str = raw_formula

                # If digital text is empty or lacks LaTeX mathematical syntax, extract visually via RapidLaTeXOCR
                has_latex_tokens = any(sym in (latex_str or "") for sym in ("\\", "{", "^", "_", "=", "∫", "∑", "√", "±"))
                if not latex_str or not has_latex_tokens or len(latex_str.strip()) < 3:
                    try:
                        from .latex_ocr_engine import LatexOCREngine
                        ocr_engine = LatexOCREngine.get_instance()
                        if ocr_engine.is_available():
                            extracted_latex = None

                            # Method 1: High-fidelity native Docling image crop directly from document
                            formula_img = None
                            if hasattr(item, "get_image"):
                                try:
                                    formula_img = item.get_image(doc)
                                except Exception:
                                    pass
                            elif hasattr(item, "image") and getattr(item.image, "pil_image", None):
                                formula_img = item.image.pil_image

                            if formula_img is not None:
                                extracted_latex = ocr_engine.extract_latex_from_image(formula_img)

                            # Method 2: Origin-aware PyMuPDF high-DPI viewport clipping fallback
                            if not extracted_latex and fitz_page is not None and bbox and len(bbox) >= 4:
                                extracted_latex = ocr_engine.extract_latex_from_bbox(fitz_page, bbox)

                            if extracted_latex:
                                latex_str = extracted_latex
                    except Exception as ocr_err:
                        logger.debug(f"LatexOCR formula extraction error: {ocr_err}")

                display_formula = f"${latex_str}$" if (latex_str and not latex_str.startswith("$")) else latex_str
                formula_body = display_formula if (display_formula and display_formula.strip() not in ("$$", "$Formula$", "$formula$")) else ""
                sections.append(SectionSchema(
                    type="FORMULA",
                    heading="Formula",
                    text=formula_body,
                    column_index=0,
                    latex_equations=[latex_str] if (latex_str and latex_str.strip().lower() not in ("formula", "equation", "math")) else [],
                    metadata={"bbox": bbox},
                ))
                if formula_body:
                    page_text_pieces.append(formula_body)

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

        # Multi-span legacy font conversion fallback using PyMuPDF font spans
        if p_legacy and fitz_page is not None:
            from .legacy_font_converter import convert_page_spans_to_unicode, remap_legacy_text
            rebuilt_text, _ = convert_page_spans_to_unicode(fitz_page)
            if rebuilt_text and any("\u0900" <= c <= "\u097f" for c in rebuilt_text):
                page_raw_text = rebuilt_text
                p_flags.append("legacy_font_spans_remapped")
                p_meta["legacy_font_remapped"] = True
                for sec in sections:
                    if sec.type not in ("DIAGRAM", "FORMULA"):
                        if sec.text and not any("\u0900" <= c <= "\u097f" for c in sec.text):
                            r_sec, _ = remap_legacy_text(sec.text)
                            if any("\u0900" <= c <= "\u097f" for c in r_sec):
                                sec.text = r_sec
                        if sec.heading and not any("\u0900" <= c <= "\u097f" for c in sec.heading):
                            if sec.heading.lower() not in ("formula", "equation", "math", "table", "figure", "diagram"):
                                r_h, _ = remap_legacy_text(sec.heading)
                                if any("\u0900" <= c <= "\u097f" for c in r_h):
                                    sec.heading = r_h
                    elif sec.type == "DIAGRAM":
                        # Remap legacy font diagram labels, captions, and descriptions (e.g. lkj.kh 12.1 -> सारणी 12.1)
                        if sec.image_caption and not any("\u0900" <= c <= "\u097f" for c in sec.image_caption):
                            r_cap, _ = remap_legacy_text(sec.image_caption)
                            if any("\u0900" <= c <= "\u097f" for c in r_cap):
                                sec.image_caption = r_cap
                        if sec.image_label and not any("\u0900" <= c <= "\u097f" for c in sec.image_label):
                            r_lbl, _ = remap_legacy_text(sec.image_label)
                            if any("\u0900" <= c <= "\u097f" for c in r_lbl):
                                sec.image_label = r_lbl
                        if sec.image_description and not any("\u0900" <= c <= "\u097f" for c in sec.image_description):
                            r_desc, _ = remap_legacy_text(sec.image_description)
                            if any("\u0900" <= c <= "\u097f" for c in r_desc):
                                sec.image_description = r_desc
                        if sec.heading and not any("\u0900" <= c <= "\u097f" for c in sec.heading):
                            if not re.match(r"^Figure\s+\d+", sec.heading, re.IGNORECASE):
                                r_h, _ = remap_legacy_text(sec.heading)
                                if any("\u0900" <= c <= "\u097f" for c in r_h):
                                    sec.heading = r_h
                        if sec.text and not any("\u0900" <= c <= "\u097f" for c in sec.text):
                            r_txt, _ = remap_legacy_text(sec.text)
                            if any("\u0900" <= c <= "\u097f" for c in r_txt):
                                sec.text = r_txt

        # Quality scoring & rescue flag: never erase text, flag for AI rescue if needed
        if p_legacy:
            has_devanagari = any("\u0900" <= c <= "\u097f" for c in page_raw_text)
            if not has_devanagari or not page_raw_text.strip():
                p_review = True
                p_quality = 0.50
                p_flags.append("legacy_font_unresolved")
                p_reason = f"{p_reason}; Legacy font detected requiring visual AI rescue"

        pages.append(PageSchema(
            page_number=global_page_num,
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

    return chapters, pages


def _process_docling_chunk_worker(
    chunk_args: Tuple[int, str, int, int, str, bool, bool, List[str]]
) -> Tuple[int, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Independent worker process for parallel PDF chunk extraction.
    Runs in its own OS process utilizing ~2.5 GB RAM and 1 dedicated CPU core.
    """
    (
        chunk_idx,
        pdf_path,
        start_page,
        end_page,
        media_dir,
        do_ocr,
        enable_full_page,
        ocr_langs,
    ) = chunk_args

    t_worker_start = time.time()
    logger.info(
        f"[Process {chunk_idx + 1}] Worker started for pages {start_page}–{end_page} "
        f"({end_page - start_page + 1} pages, Core {chunk_idx + 1}, ~2.5 GB RAM, do_ocr={do_ocr})..."
    )

    # Limit torch & BLAS threads to 1 per worker so 4 processes map 1:1 to 4 CPU cores
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    try:
        import torch
        torch.set_num_threads(1)
        if hasattr(torch, "set_num_interop_threads"):
            torch.set_num_interop_threads(1)
    except Exception:
        pass

    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    # 1. Create slice PDF on disk for [start_page, end_page]
    src_doc = fitz.open(pdf_path)
    chunk_doc = fitz.open()
    chunk_doc.insert_pdf(src_doc, from_page=start_page - 1, to_page=end_page - 1)
    temp_dir = tempfile.gettempdir()
    chunk_pdf_path = os.path.join(temp_dir, f"chunk_{uuid.uuid4().hex[:8]}_p{start_page}_p{end_page}.pdf")
    chunk_doc.save(chunk_pdf_path)
    chunk_doc.close()
    src_doc.close()

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = do_ocr
    if do_ocr:
        try:
            from docling.datamodel.pipeline_options import TesseractCliOcrOptions
            pipeline_options.ocr_options = TesseractCliOcrOptions(
                force_full_page_ocr=enable_full_page,
                lang=ocr_langs,
            )
        except Exception:
            pass

    pipeline_options.generate_picture_images = True
    pipeline_options.images_scale = 1.0

    doc_converter = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )

    try:
        conv_res = doc_converter.convert(chunk_pdf_path)
        chunk_fitz_doc = fitz.open(chunk_pdf_path)
        pages_in_chunk = end_page - start_page + 1
        chunk_chapters, chunk_pages = _parse_docling_document(
            doc=conv_res.document,
            fitz_doc=chunk_fitz_doc,
            pages_to_process=pages_in_chunk,
            media_dir=media_dir,
            start_page_offset=start_page - 1,
        )
        chunk_fitz_doc.close()

        t_elapsed = round(time.time() - t_worker_start, 1)
        logger.info(
            f"[Process {chunk_idx + 1}] Worker completed pages {start_page}–{end_page} in {t_elapsed}s. "
            f"Extracted {len(chunk_pages)} pages."
        )

        return (
            chunk_idx,
            [ch.model_dump() for ch in chunk_chapters],
            [p.model_dump() for p in chunk_pages],
        )
    finally:
        if os.path.exists(chunk_pdf_path):
            try:
                os.remove(chunk_pdf_path)
            except Exception:
                pass


class DoclingPipeline:
    """
    Executes deep-learning Document AI extraction using IBM Docling.
    Supports multi-process chunking across 4 vCPUs and ~10-12 GB RAM for fast parallel execution.
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

        # 2. Inspect document to detect legacy non-Unicode fonts (Walkman-Chanakya, KrutiDev, DevLys, APS, etc.)
        # Excludes standard English typography fonts ending in 'Caps', 'Maps', 'PostScript'
        has_legacy_fonts = False
        LEGACY_FONT_KEYWORDS = (
            "chanakya", "kruti", "devlys", "walkman", "shree-dev", "shreedev", "shree",
            "shivaji", "bilingual", "akruti", "kundli", "aps-", "aps_", "apsdv", "dv-", "dv_"
        )
        try:
            for p_i in range(min(total_pages, 5)):
                for font_tuple in fitz_doc[p_i].get_fonts():
                    fname = (font_tuple[3] if len(font_tuple) > 3 else "").lower()
                    if any(k in fname for k in LEGACY_FONT_KEYWORDS) or ("aps" in fname and "caps" not in fname and "maps" not in fname and "gaps" not in fname):
                        has_legacy_fonts = True
                        break
                if has_legacy_fonts:
                    break
        except Exception as probe_err:
            logger.debug(f"Document font probe note: {probe_err}")

        force_ocr_env = os.environ.get("DOCLING_FORCE_FULL_PAGE_OCR", "").lower() in ("1", "true", "yes")

        # Probe if document has abundant digital text (> 120 chars/page)
        sample_chars = 0
        probe_pages = min(total_pages, 5)
        for p_i in range(probe_pages):
            sample_chars += len(fitz_doc[p_i].get_text())
        avg_chars_per_page = sample_chars / max(1, probe_pages)
        is_digital_pdf = avg_chars_per_page > 120

        # Run OCR ONLY if document is genuinely scanned/image-only or explicitly forced by env variable.
        # Digital PDFs with selectable text (including legacy fonts) bypass slow Tesseract OCR completely.
        # Any legacy fonts present are decoded in sub-milliseconds by our native converter in post-processing.
        do_ocr = force_ocr_env or (not is_digital_pdf)
        enable_full_page = force_ocr_env or (not is_digital_pdf)

        logger.info(
            f"Docling OCR Configuration: do_ocr={do_ocr}, force_full_page_ocr={enable_full_page} "
            f"(is_digital_pdf={is_digital_pdf}, avg_chars_per_page={avg_chars_per_page:.0f}, legacy_font_detected={has_legacy_fonts}, env_override={force_ocr_env})"
        )

        ocr_langs = ["hin", "eng"]
        env_langs = os.environ.get("TESSERACT_LANGS", "")
        if env_langs:
            ocr_langs = [l.strip() for l in env_langs.split(",") if l.strip()]

        # 3. Multi-Process Page Chunking across 4 vCPUs & ~10-12 GB RAM for documents > 15 pages
        max_workers_env = os.environ.get("DOCLING_MAX_WORKERS")
        if max_workers_env and max_workers_env.isdigit():
            num_workers = max(1, int(max_workers_env))
        else:
            num_workers = 4

        if pages_to_process > 15 and num_workers >= 2:
            base_chunk = pages_to_process // num_workers
            rem = pages_to_process % num_workers
            chunk_ranges: List[Tuple[int, int]] = []
            cur_p = 1
            for i in range(num_workers):
                c_len = base_chunk + (1 if i < rem else 0)
                if c_len <= 0:
                    break
                next_p = min(pages_to_process, cur_p + c_len - 1)
                chunk_ranges.append((cur_p, next_p))
                cur_p = next_p + 1

            logger.info(
                f"[Multi-Process AI] Multi-process chunking activated: {len(chunk_ranges)} chunks across {num_workers} processes "
                f"(Utilizing ~10-11 GB RAM on 4 vCPUs): {chunk_ranges}"
            )

            if progress_callback:
                progress_callback(
                    0,
                    pages_to_process,
                    f"Spawning {len(chunk_ranges)} parallel Docling AI processes across 4 cores (10-11 GB RAM active)...",
                )

            tasks = [
                (
                    idx,
                    pdf_path,
                    start_p,
                    end_p,
                    self.media_dir,
                    do_ocr,
                    enable_full_page,
                    ocr_langs,
                )
                for idx, (start_p, end_p) in enumerate(chunk_ranges)
            ]

            chunk_results: List[Optional[Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]]] = [None] * len(tasks)
            try:
                with concurrent.futures.ProcessPoolExecutor(max_workers=len(tasks)) as executor:
                    futures = {executor.submit(_process_docling_chunk_worker, t): t[0] for t in tasks}
                    completed_count = 0
                    for future in concurrent.futures.as_completed(futures):
                        c_idx, ch_dumps, p_dumps = future.result()
                        chunk_results[c_idx] = (ch_dumps, p_dumps)
                        completed_count += 1
                        if progress_callback:
                            est_p = min(pages_to_process, int((completed_count / len(tasks)) * pages_to_process))
                            progress_callback(
                                est_p,
                                pages_to_process,
                                f"Parallel Docling: {completed_count}/{len(tasks)} chunks processed ({est_p}/{pages_to_process} pages)...",
                            )

                # Merge chunk results in original page sequence
                all_pages: List[PageSchema] = []
                all_chapters: List[ChapterSchema] = []
                for res in chunk_results:
                    if res:
                        ch_dumps, p_dumps = res
                        for p_d in p_dumps:
                            all_pages.append(PageSchema.model_validate(p_d))
                        for ch_d in ch_dumps:
                            all_chapters.append(ChapterSchema.model_validate(ch_d))

                all_pages.sort(key=lambda p: p.page_number)
                fitz_doc.close()

                if not all_chapters:
                    all_chapters = []
                    granularity = "UNKNOWN"
                else:
                    unique_chapters = {}
                    for ch in all_chapters:
                        if ch.chapter_number not in unique_chapters:
                            unique_chapters[ch.chapter_number] = ch
                        elif ch.start_page < unique_chapters[ch.chapter_number].start_page:
                            unique_chapters[ch.chapter_number] = ch
                    all_chapters = sorted(unique_chapters.values(), key=lambda ch: ch.start_page)

                    for i in range(len(all_chapters) - 1):
                        all_chapters[i].end_page = max(all_chapters[i].start_page, all_chapters[i + 1].start_page - 1)
                    all_chapters[-1].end_page = len(all_pages)
                    granularity = "WHOLE_BOOK" if len(all_chapters) > 1 else "CHAPTER"

                    # Synchronize page chapter metadata with unified chapter ranges
                    for page in all_pages:
                        matching_ch = next(
                            (ch for ch in all_chapters if ch.start_page <= page.page_number <= ch.end_page),
                            None
                        )
                        if matching_ch:
                            page.chapter_number = matching_ch.chapter_number
                            page.chapter_title = matching_ch.title

                logger.info(f"[Multi-Process AI] Successfully merged {len(all_pages)} pages from {len(chunk_ranges)} chunks.")
                return all_chapters, all_pages, granularity

            except Exception as mp_err:
                logger.warning(f"Multi-process parallel chunking encountered note: {mp_err}. Falling back to standard pipeline...")

        # 4. Standard Single-Process Path (for documents <= 15 pages or fallback)
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = do_ocr

        if do_ocr:
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
        pipeline_options.images_scale = 1.0

        # Maximize CPU utilization on runner
        try:
            import torch
            num_cpus = min(4, os.cpu_count() or 4)
            torch.set_num_threads(num_cpus)
            if hasattr(torch, "set_num_interop_threads"):
                torch.set_num_interop_threads(num_cpus)
        except Exception:
            pass

        try:
            from docling.datamodel.pipeline_options import AcceleratorOptions, AcceleratorDevice
            pipeline_options.accelerator_options = AcceleratorOptions(
                num_threads=min(4, os.cpu_count() or 4),
                device=AcceleratorDevice.CPU,
            )
        except Exception:
            pass

        doc_converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )

        logger.info(f"Running Docling conversion on {pdf_path} (max_pages={pages_to_process})...")

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

        chapters, pages = _parse_docling_document(
            doc=doc,
            fitz_doc=fitz_doc,
            pages_to_process=pages_to_process,
            media_dir=self.media_dir,
            start_page_offset=0,
            progress_callback=progress_callback,
            total_doc_pages=pages_to_process,
        )

        fitz_doc.close()

        if not chapters:
            chapters = []
            granularity = "UNKNOWN"
        else:
            for i in range(len(chapters) - 1):
                chapters[i].end_page = max(chapters[i].start_page, chapters[i + 1].start_page - 1)
            chapters[-1].end_page = len(pages)
            granularity = "WHOLE_BOOK" if len(chapters) > 1 else "CHAPTER"

        return chapters, pages, granularity
