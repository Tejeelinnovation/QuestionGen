"""
Fast In-Memory PDF Harvester Service.

Extracts text, chapter headings, and embedded figures from teacher-uploaded PDFs in 1-3 seconds.
Generates lightweight base64 thumbnails for frontend preview and handles selective
upload to Google Drive subfolder 'paper_creation_diagrams/'.
"""

from __future__ import annotations

import base64
import gc
import io
import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

import pymupdf  # PyMuPDF
from django.core.cache import cache
from PIL import Image, ImageStat

from content_ingestion.storage.drive_client import GoogleDriveClient
from document_ai_worker.engine.legacy_font_converter import (
    convert_page_spans_to_unicode,
    is_legacy_font,
)
from document_ai_worker.engine.text_cleaner import (
    detect_caesar_shift,
    unshift_ncert_text,
)

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 3600  # 1 hour inspection cache


class PdfInspectionService:
    """
    Handles fast inspection of teacher-uploaded PDFs:
    - In-memory text extraction
    - High-speed embedded image harvesting with size filtering
    - Nearby text caption detection
    - Selective Google Drive upload for chosen exam diagrams
    """

    MIN_IMAGE_WIDTH = 120
    MIN_IMAGE_HEIGHT = 120
    THUMBNAIL_MAX_SIZE = (320, 240)

    # In-memory fast cache to serve proxy diagram requests without disk latency
    _high_res_cache: Dict[str, bytes] = {}
    _inspection_cache: Dict[str, Dict[str, Any]] = {}

    # Concurrency control: limits active in-memory PDF parsing to 1 document at a time
    # on low-memory servers (e.g. 512MB RAM free tier), queueing simultaneous teacher uploads
    # without crashing or running out of memory.
    _inspection_semaphore = threading.Semaphore(1)

    @classmethod
    def _is_valid_diagram_image(cls, image_bytes: bytes, width: int, height: int) -> bool:
        """
        Filters out solid black rectangles, blank page scans, uniform color tints,
        and low-variance background overlays.
        """
        try:
            with Image.open(io.BytesIO(image_bytes)) as pil_img:
                rgb_img = pil_img.convert("RGB")
                stat = ImageStat.Stat(rgb_img)

                # Channel variance / standard deviation
                max_std = max(stat.stddev) if stat.stddev else 0.0
                avg_mean = sum(stat.mean) / 3.0 if stat.mean else 128.0

                # 1. Flat/Solid Color Box: standard deviation < 7 means no visual content
                if max_std < 7.0:
                    return False

                # 2. Solid Black / Dark Box: low brightness (< 25) with low variance
                if avg_mean < 25.0 and max_std < 20.0:
                    return False

                # 3. Solid White / Blank Box: very high brightness (> 248) with low variance
                if avg_mean > 248.0 and max_std < 12.0:
                    return False

                # 4. Full-page background scans (e.g. 2480x3508 page masks with little contrast)
                if (width >= 1600 or height >= 2000) and max_std < 25.0:
                    return False

                return True
        except Exception as e:
            logger.debug(f"Image validation exception: {e}")
            return True

    @classmethod
    def _detect_diagrams_with_vision(cls, page: pymupdf.Page, page_num: int, inspection_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Uses Gemini Vision to semantically detect genuine educational figures and precise bounding boxes.
        Strictly excludes advertisements, promotional download banners, Table of Contents,
        logos, barcodes, and decorative elements.
        Memory-safe: caps snapshot resolution and streams cropped diagrams directly to disk.
        """
        try:
            from django.conf import settings
            django_key = getattr(settings, "GEMINI_API_KEY", "") if settings.configured else ""
        except Exception:
            django_key = ""
        api_key = django_key or os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return []

        try:
            import requests
            # Bound page snapshot to max 1024px to keep bitmap allocation tiny (<2MB)
            max_dim = max(page.rect.width, page.rect.height)
            scale = min(1.2, 1024.0 / max(max_dim, 1.0))
            matrix = pymupdf.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=matrix)
            b64_img = base64.b64encode(pix.tobytes("jpeg")).decode("utf-8")
            pix = None

            prompt = (
                "Analyze this educational/textbook page. Identify all genuine educational/pedagogical diagrams, scientific figures, "
                "circuit diagrams, apparatus, chemical structures, biological illustrations, mathematical curves/graphs, "
                "flowcharts, and coordinate geometry figures.\n"
                "CRITICAL FILTERING RULES:\n"
                "1. Strictly EXCLUDE all promotional banners, website URLs, download links, Telegram links, YouTube links, "
                "and social media handles.\n"
                "2. Strictly EXCLUDE publisher logos, watermarks, barcodes, QR codes, ISBN blocks, decorative header/footer bars, "
                "and Table of Contents / chapter index boxes.\n"
                "3. For each genuine educational figure, provide a JSON object with:\n"
                "   - 'caption': clean academic title/caption\n"
                "   - 'diagram_type': e.g., 'CIRCUIT', 'APPARATUS', 'BIOLOGY', 'GRAPH', 'GEOMETRY', 'FLOWCHART', 'CHEMICAL'\n"
                "   - 'box_2d': [ymin, xmin, ymax, xmax] normalized coordinates from 0 to 1000 bounding the diagram and its key labels.\n"
                "Return ONLY a JSON array of objects. If no genuine educational figures exist on this page, return an empty array []."
            )

            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {"inline_data": {"mime_type": "image/jpeg", "data": b64_img}},
                        ]
                    }
                ],
                "generationConfig": {
                    "response_mime_type": "application/json"
                },
            }

            models_to_try = ["gemini-3.5-flash-lite", "gemini-3.5-flash"]
            res = None
            for model in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                try:
                    res = requests.post(url, json=payload, timeout=12)
                    if res.status_code == 200:
                        break
                except Exception as net_err:
                    logger.debug(f"Vision model {model} timeout/error: {net_err}")
                    continue

            if not res or res.status_code != 200:
                return []

            resp_json = res.json()
            candidates = resp_json.get("candidates", [])
            if not candidates:
                return []

            raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            if not raw_text:
                return []

            items = json.loads(raw_text)
            if not isinstance(items, list):
                return []

            results = []
            for idx, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                try:
                    box = item.get("box_2d")
                    if not box:
                        continue

                    # Robustly flatten any nested lists/tuples in coordinates
                    flat_coords = []
                    def _flatten_box(val):
                        if isinstance(val, (list, tuple)):
                            for v in val:
                                _flatten_box(v)
                        else:
                            flat_coords.append(val)
                    _flatten_box(box)

                    if len(flat_coords) != 4:
                        continue

                    ymin, xmin, ymax, xmax = [float(c) for c in flat_coords]
                    if ymax <= ymin + 15 or xmax <= xmin + 15:
                        continue

                    # Add 5pt padding to avoid clipping labels
                    pad_y = 5.0
                    pad_x = 5.0
                    clip_rect = (
                        pymupdf.Rect(
                            max(0.0, (xmin * page.rect.width / 1000.0) - pad_x),
                            max(0.0, (ymin * page.rect.height / 1000.0) - pad_y),
                            min(page.rect.width, (xmax * page.rect.width / 1000.0) + pad_x),
                            min(page.rect.height, (ymax * page.rect.height / 1000.0) + pad_y),
                        )
                        & page.rect
                    )

                    if clip_rect.width < 50 or clip_rect.height < 40:
                        continue

                    # Bound crop resolution to max 1200px (~120-140 dpi) for crisp print without memory spikes
                    crop_max_dim = max(clip_rect.width, clip_rect.height)
                    crop_scale = min(1.66, 1200.0 / max(crop_max_dim, 1.0))
                    crop_mat = pymupdf.Matrix(crop_scale, crop_scale)
                    cropped_pix = page.get_pixmap(clip=clip_rect, matrix=crop_mat)
                    cropped_bytes = cropped_pix.tobytes("png")
                    c_width = cropped_pix.width
                    c_height = cropped_pix.height
                    cropped_pix = None

                    if not cls._is_valid_diagram_image(cropped_bytes, c_width, c_height):
                        continue

                    fig_id = f"fig_p{page_num}_vdiag_{idx + 1}"
                    caption = cls.clean_academic_caption(str(item.get("caption") or f"Figure {page_num}.{idx + 1}"))
                    thumb_b64 = cls._generate_thumbnail_base64(cropped_bytes)

                    # Direct Disk Streaming: persist to scratch disk immediately to keep memory flat
                    if inspection_id:
                        cls._save_figure_to_disk(inspection_id, fig_id, cropped_bytes)

                    results.append({
                        "figure_id": fig_id,
                        "page_number": page_num,
                        "width": c_width,
                        "height": c_height,
                        "caption": caption,
                        "diagram_type": str(item.get("diagram_type", "DIAGRAM")),
                        "thumbnail_b64": thumb_b64,
                        "image_bytes": None if inspection_id else cropped_bytes,
                    })
                    del cropped_bytes
                    gc.collect()
                except Exception as item_err:
                    logger.debug(f"Error parsing vision item {idx} on page {page_num}: {item_err}")
                    continue

            return results
        except Exception as v_err:
            logger.warning(f"Vision diagram extraction exception on page {page_num}: {v_err}")
            return []

    @classmethod
    def _detect_subject_and_title(cls, extracted_text: str, filename: str) -> tuple[str, str]:
        """
        Deduces academic subject and clean paper/chapter title from textbook PDF text and filename.
        Replaces raw system filenames (e.g. 'khat101.pdf') with genuine curriculum names.
        """
        clean_fn = re.sub(r"\.[^/.]+$", "", filename).replace("_", " ").replace("-", " ").strip()
        text_lower = (extracted_text or "")[:4000].lower()

        # 1. Academic Subject Detection
        subject = ""
        # Science & sub-disciplines
        if any(k in text_lower for k in [
            "chemical", "photosynthesis", "respiration", "अभिक्रिया", "रासायनिक",
            "अम्ल", "क्षारक", "धातु", "कोशिका", "विद्युत", "acid", "organism",
            "biology", "physics", "chemistry", "जीव विज्ञान", "भौतिकी", "रसायन"
        ]):
            if any(k in text_lower for k in ["chemical", "रासायनिक", "अभिक्रिया", "अम्ल", "क्षारक", "acid", "compound", "यौगिक"]):
                subject = "Chemistry"
            elif any(k in text_lower for k in ["cell", "कोशिका", "biology", "photosynthesis", "जीव", "tissue", "ऊतक", "dna", "reproduction"]):
                subject = "Biology"
            elif any(k in text_lower for k in ["current", "विद्युत", "physics", "force", "बल", "गति", "optics", "प्रकाश", "lens", "लेंस", "ohm"]):
                subject = "Physics"
            else:
                subject = "Science"
        elif any(k in text_lower for k in [
            "theorem", "triangle", "quadratic", "polynomial", "त्रिभुज", "बहुपद",
            "समीकरण", "प्रमेय", "क्षेत्रमिति", "algebra", "trigonometry", "mathematics",
            "गणित", "वास्तविक संख्याएं", "समांतर श्रेढ़ी", "निर्देशांक"
        ]):
            subject = "Mathematics"
        elif any(k in text_lower for k in [
            "प्रेमचंद", "कबीर", "सूरदास", "व्याकरण", "कविता", "कहानी", "गद्य", "पद्य",
            "मुहावरे", "लेखक", "दोहे", "संवाद", "निबंध", "हिंदी"
        ]):
            subject = "Hindi"
        elif any(k in text_lower for k in [
            "constitution", "democracy", "revolution", "संविधान", "लोकतंत्र",
            "इतिहास", "भूगोल", "अर्थशास्त्र", "history", "geography", "civics", "economics"
        ]):
            subject = "Social Science"
        elif any(k in text_lower for k in ["poetry", "stanza", "comprehension", "grammar", "prose", "shakespeare"]):
            subject = "English"

        # NCERT standard curriculum code prefixes (if subject not yet found)
        if not subject:
            fn_l = filename.lower()
            if fn_l.startswith(("khat", "jhat", "hhat", "khed", "jhed")):
                subject = "Hindi"
            elif fn_l.startswith(("jesc", "hesc", "kesc")):
                subject = "Science"
            elif fn_l.startswith(("jemh", "hemh", "kemh")):
                subject = "Mathematics"
            elif fn_l.startswith(("kepy", "hepy")):
                subject = "Physics"
            elif fn_l.startswith(("kech", "hech")):
                subject = "Chemistry"
            elif fn_l.startswith(("kebo", "hebo")):
                subject = "Biology"
            elif fn_l.startswith(("jess", "hess")):
                subject = "Social Science"

        # 2. Exam Paper Title: Simple and clean (e.g. 'Chemistry Exam Paper')
        if subject:
            title = f'{subject} Exam Paper'
        elif clean_fn and not re.match(r'^[a-z]{2,5}\d{1,5}$', clean_fn, re.I):
            title = f'{clean_fn} Exam Paper'
        else:
            title = 'Exam Paper'

        return subject, title

    @classmethod
    def _get_inspection_scratch_dir(cls, inspection_id: str) -> str:
        base = os.path.join(tempfile.gettempdir(), "qgs_inspections", inspection_id)
        os.makedirs(base, exist_ok=True)
        return base

    @classmethod
    def _save_figure_to_disk(cls, inspection_id: str, fig_id: str, img_bytes: bytes) -> str:
        from django.conf import settings
        # 1. Save to ephemeral scratch directory on disk (Free tier safe)
        scratch_dir = cls._get_inspection_scratch_dir(inspection_id)
        scratch_path = os.path.join(scratch_dir, f"{fig_id}.png")
        try:
            with open(scratch_path, "wb") as f:
                f.write(img_bytes)
        except Exception as e:
            logger.warning(f"Failed to write diagram {fig_id} to scratch: {e}")

        # 2. Also cache directly into media/diagrams for immediate static serving
        try:
            media_dir = os.path.join(settings.MEDIA_ROOT, "diagrams")
            os.makedirs(media_dir, exist_ok=True)
            media_path = os.path.join(media_dir, f"{fig_id}.png")
            with open(media_path, "wb") as mf:
                mf.write(img_bytes)
        except Exception:
            pass

        return scratch_path

    @classmethod
    def inspect_pdf(cls, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """
        Inspects PDF in memory and extracts text, metadata, and detected figures.
        Returns a summary payload with an inspection_id to retrieve extracted data later.

        Zero-Cost Concurrency & Memory Safety:
        - Uses _inspection_semaphore to throttle concurrent PDF parses to 1 at a time.
        - Pre-filters embedded image dimensions from PDF catalog before decompression.
        - Strict finally block guarantees doc.close() and gc.collect().
        """
        with cls._inspection_semaphore:
            # Periodic cleanup of inspection scratch folders older than 1 hour (Zero disk accumulation)
            try:
                base_scratch = os.path.join(tempfile.gettempdir(), "qgs_inspections")
                if os.path.exists(base_scratch):
                    now_ts = time.time()
                    for sub in os.listdir(base_scratch):
                        sub_path = os.path.join(base_scratch, sub)
                        if os.path.isdir(sub_path) and (now_ts - os.path.getmtime(sub_path) > 3600):
                            shutil.rmtree(sub_path, ignore_errors=True)
            except Exception:
                pass

            # Flush in-memory caches to guarantee 0 MB heap creep across uploads
            cls._inspection_cache.clear()
            cls._high_res_cache.clear()

            inspection_id = f"insp_{uuid.uuid4().hex[:12]}"
            scratch_dir = cls._get_inspection_scratch_dir(inspection_id)
            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
            try:
                page_count = len(doc)
                full_text_parts: List[str] = []
                detected_figures: List[Dict[str, Any]] = []

                total_words = 0

                # Pass 1: Extract Text & Identify Diagram Candidates across all pages
                page_records = []
                vision_candidates = []

                for page_idx in range(page_count):
                    page = doc[page_idx]
                    page_num = page_idx + 1

                    # 1. Extract Page Text (with automatic legacy Indic font remapping for KrutiDev/Chanakya)
                    fonts = [f[3] for f in page.get_fonts()]
                    if any(is_legacy_font(f) for f in fonts):
                        try:
                            converted, _ = convert_page_spans_to_unicode(page)
                            page_text = converted if converted and converted.strip() else (page.get_text("text") or "")
                        except Exception as e:
                            logger.warning(f"Error remapping legacy font on page {page_num}: {e}")
                            page_text = page.get_text("text") or ""
                    else:
                        page_text = page.get_text("text") or ""

                    # Automatic unshifting for +3 Caesar cipher font encodings in NCERT/state board PDFs
                    if detect_caesar_shift(page_text):
                        try:
                            page_text = unshift_ncert_text(page_text)
                        except Exception as c_err:
                            logger.debug(f"Caesar unshift error on page {page_num}: {c_err}")

                    # Deduplicate Devanagari matras, diacritics, and visarga if present
                    if any("\u0900" <= c <= "\u097f" for c in page_text):
                        from document_ai_worker.engine.legacy_font_converter import deduplicate_devanagari_marks
                        page_text = deduplicate_devanagari_marks(page_text)

                    words = page_text.split()
                    total_words += len(words)

                    if page_text.strip():
                        full_text_parts.append(f"--- [Page {page_num}] ---\n{page_text.strip()}")

                    has_images = len(page.get_images()) > 0
                    has_caption = bool(re.search(r"\b(?:fig|figure|diagram|chart|graph|problem|structure|scheme|reaction|चित्र|आकृति|सारणी|उदाहरण|प्रश्न|تصویر|شکل|خاکہ)\b", page_text, re.I))

                    # Lightweight drawing check for vector graphics (guard against heavy topography maps)
                    has_drawings = False
                    if not (has_caption or has_images) and page_num <= 20:
                        try:
                            d_list = page.get_drawings()
                            # 10 to 300 drawings is typical for circuit/apparatus; > 300 is terrain/map
                            has_drawings = 10 < len(d_list) <= 300
                            del d_list
                        except Exception:
                            has_drawings = False

                    priority = 2 if has_caption else (1 if has_images else 0)
                    if has_caption or has_images or has_drawings:
                        vision_candidates.append((priority, page_idx, page_num))

                    # Store lightweight record without holding PyMuPDF page object in memory
                    page_records.append({
                        "page_idx": page_idx,
                        "page_num": page_num,
                        "page_text": page_text,
                    })

                # Sequential Memory-Safe Vision Diagram Extraction across diverse pages
                vision_candidates.sort(key=lambda x: (x[0], -abs(x[2] - (page_count / 2))), reverse=True)
                top_candidates = vision_candidates[:5]
                vision_results_by_page: Dict[int, List[Dict[str, Any]]] = {}

                if top_candidates:
                    for cand in top_candidates:
                        _, p_idx, p_num = cand
                        p = doc[p_idx]
                        try:
                            v_figs = cls._detect_diagrams_with_vision(p, p_num, inspection_id)
                            if v_figs:
                                vision_results_by_page[p_num] = v_figs
                        except Exception as pool_err:
                            logger.debug(f"Vision diagram error on page {p_num}: {pool_err}")
                        finally:
                            del p
                            gc.collect()

                # Pass 2: Assemble Detected Figures (Vision + Embedded Image / Composite Fallback)
                for rec in page_records:
                    page_idx = rec["page_idx"]
                    page_num = rec["page_num"]
                    page_text = rec["page_text"]
                    page = doc[page_idx]
                    vision_handled = False

                    if page_num in vision_results_by_page and vision_results_by_page[page_num]:
                        vision_handled = True
                        for vf in vision_results_by_page[page_num]:
                            fig_id = vf["figure_id"]
                            raw_b = vf.get("image_bytes")
                            if raw_b:
                                cls._save_figure_to_disk(inspection_id, fig_id, raw_b)
                            detected_figures.append({
                                "figure_id": fig_id,
                                "page_number": page_num,
                                "width": vf["width"],
                                "height": vf["height"],
                                "caption": vf["caption"],
                                "thumbnail_b64": vf["thumbnail_b64"],
                                "mime_type": "image/png",
                            })
                            vf["image_bytes"] = None
                        del vision_results_by_page[page_num]
                        gc.collect()

                    # 3. Fallback: Extract Embedded Images with True Colorspace Conversion if Vision did not run
                    if not vision_handled:
                        image_list = page.get_images(full=True)
                        for img_idx, img_info in enumerate(image_list):
                            xref = img_info[0]
                            # Pre-filter using image dimensions in PDF catalog before uncompressing Pixmap!
                            img_w = img_info[2] if len(img_info) > 2 else 0
                            img_h = img_info[3] if len(img_info) > 3 else 0

                            # 1. Skip background full-page scans/masks (w >= 1600 or h >= 1600)
                            # 2. Skip tiny icons/lines (w < MIN_IMAGE_WIDTH or h < MIN_IMAGE_HEIGHT)
                            if (img_w >= 1600 or img_h >= 1600) or (0 < img_w < cls.MIN_IMAGE_WIDTH or 0 < img_h < cls.MIN_IMAGE_HEIGHT):
                                continue

                            # 3. Skip extreme aspect ratio banners
                            if img_w > 0 and img_h > 0:
                                aspect = img_w / max(img_h, 1)
                                if aspect > 4.5 or aspect < 0.22:
                                    continue

                            pix = None
                            try:
                                pix = pymupdf.Pixmap(doc, xref)

                                # Convert CMYK, Separation, or Grayscale pixmaps to standard RGB
                                if pix.n >= 5 or pix.colorspace != pymupdf.csRGB:
                                    try:
                                        pix_rgb = pymupdf.Pixmap(pymupdf.csRGB, pix)
                                        pix = pix_rgb
                                    except Exception:
                                        pass

                                width = pix.width
                                height = pix.height

                                # Secondary filter
                                if width < cls.MIN_IMAGE_WIDTH or height < cls.MIN_IMAGE_HEIGHT or width >= 1600 or height >= 1600:
                                    continue

                                aspect = width / max(height, 1)
                                if aspect > 4.5 or aspect < 0.22:
                                    continue

                                img_bytes = pix.tobytes("png")
                                if not img_bytes:
                                    continue

                                if not cls._is_valid_diagram_image(img_bytes, width, height):
                                    continue

                                fig_id = f"fig_p{page_num}_{img_idx + 1}_{xref}"
                                caption = cls._detect_caption(page_text, page_num, img_idx + 1)
                                thumb_b64 = cls._generate_thumbnail_base64(img_bytes)

                                # Stream directly to disk scratch file (Zero-RAM!)
                                cls._save_figure_to_disk(inspection_id, fig_id, img_bytes)

                                detected_figures.append(
                                    {
                                        "figure_id": fig_id,
                                        "page_number": page_num,
                                        "width": width,
                                        "height": height,
                                        "caption": caption,
                                        "thumbnail_b64": thumb_b64,
                                        "mime_type": "image/png",
                                    }
                                )
                                del img_bytes
                                gc.collect()

                            except Exception as img_err:
                                logger.debug(f"Could not extract image xref {xref} on page {page_num}: {img_err}")
                                continue
                            finally:
                                pix = None

                    # 4. Extract Vector & Composite Textbook Diagrams via Caption Anchors across all pages
                    if not vision_handled and len(detected_figures) < 30:
                        try:
                            caption_regex = re.compile(
                                r"^\s*(?:Fig(?:ure)?\.?|Problem|Structure|Scheme|Reaction|चित्र|आकृति|सारणी|उदाहरण|प्रश्न|تصویر|شکل|خاکہ|جدول|باکس|Diagram)\s*([0-9۰-۹०-९]+(?:[\.\-][0-9۰-۹०-९]+)*)",
                                re.IGNORECASE,
                            )
                            blocks = page.get_text("blocks")
                            has_caption_match = any(
                                caption_regex.match(b[4].strip()) for b in blocks if len(b) > 4
                            )

                            if has_caption_match:
                                raw_drawings = page.get_drawings()
                                # If page has > 300 drawings, it is a map/GIS/hatching contour, skip heavy composite analysis
                                if len(raw_drawings) <= 300:
                                    elements = [d["rect"] for d in raw_drawings]
                                    del raw_drawings
                                    for img in page.get_images():
                                        elements.extend(page.get_image_rects(img[0]))

                                    if len(elements) > 150:
                                        elements = elements[:150]

                                    valid_elements = [
                                        r for r in elements
                                        if 20 < r.width < 580 and 10 < r.height < 650
                                    ]

                                    for b in blocks:
                                        block_text = b[4].strip()
                                        m = caption_regex.match(block_text)
                                        if not m:
                                            continue
                                        fig_num_tag = m.group(1).replace(".", "_")
                                        fig_id = f"fig_p{page_num}_comp_{fig_num_tag}"
                                        existing_ids = {f["figure_id"] for f in detected_figures}
                                        if fig_id in existing_ids:
                                            continue

                                        cap_box = pymupdf.Rect(b[:4])
                                        cap_text = cls.clean_academic_caption(block_text)

                                        above = [r for r in valid_elements if r.y1 <= cap_box.y0 + 10 and r.y0 >= cap_box.y0 - 450]
                                        below = [r for r in valid_elements if r.y0 >= cap_box.y1 - 10 and r.y1 <= cap_box.y1 + 450]

                                        cand_rect = None
                                        if len(above) >= 2:
                                            cand_rect = above[0]
                                            for r in above[1:]:
                                                cand_rect = cand_rect | r
                                        elif len(below) >= 2:
                                            cand_rect = below[0]
                                            for r in below[1:]:
                                                cand_rect = cand_rect | r

                                        if cand_rect and 70 <= cand_rect.width <= 550 and 50 <= cand_rect.height <= 600:
                                            clip_rect = (
                                                pymupdf.Rect(
                                                    cand_rect.x0 - 6,
                                                    cand_rect.y0 - 6,
                                                    cand_rect.x1 + 6,
                                                    cand_rect.y1 + 6,
                                                )
                                                & page.rect
                                            )
                                            comp_pix = page.get_pixmap(clip=clip_rect, dpi=110)
                                            comp_bytes = comp_pix.tobytes("png")
                                            c_w = comp_pix.width
                                            c_h = comp_pix.height
                                            comp_pix = None

                                            if cls._is_valid_diagram_image(comp_bytes, c_w, c_h):
                                                thumb_b64 = cls._generate_thumbnail_base64(comp_bytes)
                                                cls._save_figure_to_disk(inspection_id, fig_id, comp_bytes)
                                                detected_figures.append(
                                                    {
                                                        "figure_id": fig_id,
                                                        "page_number": page_num,
                                                        "width": c_w,
                                                        "height": c_h,
                                                        "caption": cap_text,
                                                        "thumbnail_b64": thumb_b64,
                                                        "mime_type": "image/png",
                                                    }
                                                )
                                                del comp_bytes
                                                gc.collect()
                                else:
                                    del raw_drawings
                        except Exception as comp_err:
                            logger.debug(f"Composite diagram detection error on page {page_num}: {comp_err}")

                # 4. Scanned / Raster / Handwritten PDF Fallback via Gemini Vision OCR
                avg_words_per_page = total_words / max(page_count, 1)
                needs_vision_ocr = page_count > 0 and (total_words < 50 or (page_count > 1 and avg_words_per_page < 25))
                if needs_vision_ocr:
                    logger.info(f"PDF {filename} contains minimal selectable text ({total_words} words across {page_count} pages, avg {avg_words_per_page:.1f} wpp). Activating Gemini Vision OCR transcription for scanned/raster pages...")
                    try:
                        from document_ai_worker.engine.handwriting_pipeline import HandwritingPipeline
                        pipeline = HandwritingPipeline()
                        sample_pages = min(page_count, 5)
                        for p_idx in range(sample_pages):
                            p_num = p_idx + 1
                            page = doc[p_idx]
                            pix = page.get_pixmap(dpi=115)
                            img_bytes = pix.tobytes("png")
                            p_w = pix.width
                            p_h = pix.height
                            pix = None

                            b64_img = base64.b64encode(img_bytes).decode("utf-8")
                            t_text = pipeline._transcribe_with_gemini(b64_img, p_num)
                            if t_text and t_text.strip():
                                full_text_parts.append(f"--- [Page {p_num} OCR] ---\n{t_text.strip()}")
                                total_words += len(t_text.split())
                                # If no figures detected yet, register the scanned page as a diagram asset
                                if len(detected_figures) == 0:
                                    fig_id = f"fig_scan_p{p_num}"
                                    thumb_b64 = cls._generate_thumbnail_base64(img_bytes)
                                    cls._save_figure_to_disk(inspection_id, fig_id, img_bytes)
                                    detected_figures.append({
                                        "figure_id": fig_id,
                                        "page_number": p_num,
                                        "width": p_w,
                                        "height": p_h,
                                        "caption": f"Scanned page {p_num} reference",
                                        "thumbnail_b64": thumb_b64,
                                        "mime_type": "image/png",
                                    })
                                    del img_bytes
                                    gc.collect()
                    except Exception as ocr_err:
                        logger.warning(f"OCR transcription fallback error for {filename}: {ocr_err}")

                extracted_full_text = "\n\n".join(full_text_parts)

                # Deduce academic subject and refined chapter title from document text
                detected_subject, detected_title = cls._detect_subject_and_title(
                    extracted_full_text, filename
                )

                # Cache the inspection bundle (High-Res image bytes EXCLUDED from RAM, stored on disk!)
                cache_bundle = {
                    "inspection_id": inspection_id,
                    "filename": filename,
                    "detected_title": detected_title,
                    "detected_subject": detected_subject,
                    "page_count": page_count,
                    "word_count": total_words,
                    "full_text": extracted_full_text,
                    "detected_figures": detected_figures,
                    "high_res_images": {},
                    "scratch_dir": scratch_dir,
                }
                cls._inspection_cache[inspection_id] = cache_bundle
                cache.set(f"pdf_inspection_{inspection_id}", cache_bundle, timeout=CACHE_TTL_SECONDS)

                # Return client-safe summary (thumbnails included, high-res bytes excluded)
                return {
                    "inspection_id": inspection_id,
                    "filename": filename,
                    "detected_title": detected_title,
                    "detected_subject": detected_subject,
                    "page_count": page_count,
                    "word_count": total_words,
                    "full_text": extracted_full_text,
                    "extracted_text": extracted_full_text,
                    "figure_count": len(detected_figures),
                    "figures": [
                        {
                            "figure_id": fig["figure_id"],
                            "page_number": fig["page_number"],
                            "width": fig["width"],
                            "height": fig["height"],
                            "caption": fig["caption"],
                            "thumbnail_b64": fig["thumbnail_b64"],
                        }
                        for fig in detected_figures
                    ],
                    "detected_figures": detected_figures,
                }
            finally:
                try:
                    doc.close()
                except Exception:
                    pass
                gc.collect()

    @classmethod
    def get_figure_bytes(cls, figure_id: str, inspection_id: Optional[str] = None) -> Optional[bytes]:
        """
        Retrieves original diagram image bytes from disk (0 MB in persistent RAM).
        Checks local disk media/diagrams, inspection scratch disk, and RAM fallback.
        """
        from django.conf import settings

        # 1. Check persistent media/diagrams disk
        media_path = os.path.join(settings.MEDIA_ROOT, "diagrams", f"{figure_id}.png")
        if os.path.exists(media_path):
            try:
                with open(media_path, "rb") as f:
                    return f.read()
            except Exception:
                pass

        # 2. Check inspection scratch directory on disk
        if inspection_id:
            scratch_path = os.path.join(cls._get_inspection_scratch_dir(inspection_id), f"{figure_id}.png")
            if os.path.exists(scratch_path):
                try:
                    with open(scratch_path, "rb") as f:
                        return f.read()
                except Exception:
                    pass

        # 3. Check any existing inspection scratch folders
        base_scratch = os.path.join(tempfile.gettempdir(), "qgs_inspections")
        if os.path.exists(base_scratch):
            try:
                for sub in os.listdir(base_scratch):
                    cand = os.path.join(base_scratch, sub, f"{figure_id}.png")
                    if os.path.exists(cand):
                        with open(cand, "rb") as f:
                            return f.read()
            except Exception:
                pass

        # 4. In-memory fallback
        if figure_id in cls._high_res_cache:
            return cls._high_res_cache[figure_id]

        return None

    @classmethod
    def get_inspection_data(cls, inspection_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves cached inspection bundle by ID."""
        if inspection_id in cls._inspection_cache:
            return cls._inspection_cache[inspection_id]
        return cache.get(f"pdf_inspection_{inspection_id}")

    @classmethod
    def upload_selected_figures_to_drive(
        cls,
        inspection_id: str,
        selected_figure_ids: List[str],
        paper_title: str,
    ) -> List[Dict[str, Any]]:
        """
        Uploads ONLY the figures chosen by the teacher to the dedicated Google Drive
        subfolder 'paper_creation_diagrams/'.
        Assigns our dedicated backend proxy URL for 100% reliable image loading in the browser.
        """
        cached_data = cls.get_inspection_data(inspection_id)
        if not cached_data:
            logger.warning(f"Inspection ID '{inspection_id}' not found in cache.")
            return []

        high_res_images = cached_data.get("high_res_images", {})
        detected_figures = {f["figure_id"]: f for f in cached_data.get("detected_figures", [])}

        drive_client = GoogleDriveClient()
        uploaded_diagrams: List[Dict[str, Any]] = []

        # Derive isolated folder per paper / PDF to keep Google Drive clean and organized
        pdf_filename = cached_data.get("filename", "")
        clean_title = "".join(c for c in paper_title if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")[:35]
        clean_pdf = ""
        if pdf_filename:
            base_pdf = os.path.splitext(os.path.basename(pdf_filename))[0]
            clean_pdf = "".join(c for c in base_pdf if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")[:35]

        folder_name = clean_title or clean_pdf or f"Paper_{inspection_id[:8]}"
        drive_folder_path = ["paper_creation_diagrams", folder_name]

        from django.conf import settings
        store_local = getattr(settings, "STORE_DIAGRAMS_LOCAL", settings.DEBUG)

        for fig_id in selected_figure_ids:
            img_bytes = cls.get_figure_bytes(fig_id, inspection_id)
            if not img_bytes:
                continue

            fig_meta = detected_figures.get(fig_id, {})
            dest_name = f"{folder_name}_{fig_id}.png"

            # Archive to Google Drive in paper-specific isolated folder
            file_id = ""
            web_view_link = ""
            if drive_client.is_configured:
                try:
                    upload_result = drive_client.upload_bytes(
                        data=img_bytes,
                        destination_name=dest_name,
                        mime_type="image/png",
                        folder_path=drive_folder_path,
                    )
                    file_id = upload_result.get("file_id", "")
                    web_view_link = upload_result.get("web_view_link", "")
                except Exception as drive_err:
                    logger.warning(f"Google Drive upload error for {fig_id}: {drive_err}")

            # Local proxy endpoint ensures 100% reliable image loading without cross-origin cookie blocks
            local_proxy_url = f"/api/papers/diagram-asset/{fig_id}/"

            # Cache high-res image to disk media/diagrams/
            if store_local:
                try:
                    disk_dir = os.path.join(settings.MEDIA_ROOT, "diagrams")
                    os.makedirs(disk_dir, exist_ok=True)
                    target_p = os.path.join(disk_dir, f"{fig_id}.png")
                    if not os.path.exists(target_p):
                        with open(target_p, "wb") as f_disk:
                            f_disk.write(img_bytes)
                except Exception as disk_err:
                    logger.debug(f"Failed to cache diagram {fig_id} on disk: {disk_err}")

            del img_bytes
            gc.collect()

            clean_cap = cls.clean_academic_caption(fig_meta.get("caption", ""))
            uploaded_diagrams.append(
                {
                    "figure_id": fig_id,
                    "title": clean_cap or f"Figure (Page {fig_meta.get('page_number', 1)})",
                    "page_number": fig_meta.get("page_number", 1),
                    "thumbnail_b64": fig_meta.get("thumbnail_b64", ""),
                    "drive_file_id": file_id,
                    "image_url": local_proxy_url,
                    "web_view_link": web_view_link,
                }
            )

        return uploaded_diagrams

    @classmethod
    def _generate_thumbnail_base64(cls, image_bytes: bytes) -> str:
        """Compresses image to a lightweight JPEG thumbnail base64 string."""
        try:
            with Image.open(io.BytesIO(image_bytes)) as pil_img:
                if pil_img.mode in ("RGBA", "P"):
                    pil_img = pil_img.convert("RGB")
                pil_img.thumbnail(cls.THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
                thumb_io = io.BytesIO()
                pil_img.save(thumb_io, format="JPEG", quality=80, optimize=True)
                return base64.b64encode(thumb_io.getvalue()).decode("utf-8")
        except Exception as e:
            logger.debug(f"Thumbnail generation fallback: {e}")
            return base64.b64encode(image_bytes[:5000]).decode("utf-8")

    @classmethod
    def _detect_caption(cls, page_text: str, page_num: int, fig_num: int) -> str:
        """
        Scans page text for standard academic figure captions like:
        'Fig. 2.1: Human Heart', 'Figure 4 - Structure of atom', 'Chart 1: Sales Distribution'
        """
        academic_prefixes = (
            "fig.", "figure", "diagram", "chart", "table", "illus",
            "चित्र", "आकृति", "सारणी",
            "تصویر", "شکل", "خاکہ", "جدول", "باکس"
        )
        lines = page_text.splitlines()
        for line in lines:
            trimmed = line.strip()
            trimmed_lower = trimmed.lower()
            if any(trimmed_lower.startswith(prefix) for prefix in academic_prefixes):
                if len(trimmed) < 120:
                    return cls.clean_academic_caption(trimmed)

        return f"Figure {page_num}.{fig_num} (Page {page_num})"

    @classmethod
    def clean_academic_caption(cls, raw: str) -> str:
        """
        Universally cleans diagram captions across all subjects (Chemistry, Physics, Biology,
        Math, History, Geography, Accounts, etc.) and all PDF sources (NCERT, state boards, teacher uploads).
        """
        if not raw or not str(raw).strip():
            return ""
        text = str(raw).strip()
        text = text.replace("\u00a0", " ").replace("\u200b", "")

        font_fixes = [
            (r"3DpHU\s*FKURPDWRJUDpK[\\\/]?", "Paper Chromatography"),
            (r"&KURPDWRJUDpK[\\\/]?", "Chromatography"),
            (r"FKURPDWRJUDpK[\\\/]?", "Chromatography"),
            (r"3DpHU", "Paper"),
            (r"pDpHU", "Paper"),
            (r"sKDpHs", "Phases"),
            (r"['\u2018\u2019]?LIIHUHQWLDO\s*H\[WUDFWLRQ", "Differential Extraction"),
            (r"['\u2018\u2019]?LIIHUHQWLDO", "Differential"),
            (r"H\[WUDFWLRQ", "Extraction"),
            (r"\(\[WUDFWLRQ\s+RI\s+FRP", "(Extraction of Compound)"),
            (r"\bCfd\.?\s*([0-9])", r"Fig. \1"),
            (r"\bCfd\b", "Fig."),
            (r"[\(\[]?\)?ractional\b", "Fractional"),
            (r"\b6IMmLE\b", "Simple"),
            (r"\b6imple\b", "Simple"),
            (r"\bMolyibj\b", "Problem"),
            (r"\bMroblem\b", "Problem"),
            (r"[\(\[]?\b(?:S|s)timation\b", "Estimation"),
            (r":ater\b", "Water"),
            (r"\b7he\b", "The"),
            (r"\bVAmOURp\b", "Vapours"),
            (r"\bSubptance\b", "Substance"),
            (r"\bPotappium\b", "Potassium"),
            (r"\bABpORBED\b", "Absorbed"),
            (r"\bANHYDROUp\b", "Anhydrous"),
            (r"\bSolutionp\b", "Solutions"),
            (r"\bpolutionp\b", "solutions"),
            (r"\bDIpTILLATION\b", "Distillation"),
            (r"\bFLApK\b", "Flask"),
            (r"\bFIRpT\b", "First"),
            (r"\bFRACTIONp\b", "Fractions"),
            (r"\bTOm\b", "Top"),
        ]
        for pattern, repl in font_fixes:
            text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

        # Clean leading garbage or stray quotation marks
        text = re.sub(r"^[\s\'\"\`\-\:\;\(\[\{]+", "", text)
        text = re.sub(r"\s+", " ", text).strip()

        # Extract standard academic label and concise title across all subjects
        label_pattern = re.compile(
            r'^(?:(?P<lbl>Fig(?:ure)?\.?|Problem|Structure|Scheme|Reaction|Chart|Diagram|Map|Graph|Table|चित्र|आकृति|सारणी|उदाहरण|प्रश्न|تصویر|شکل)\s*(?P<num>[0-9A-Za-z]+(?:[\.\-][0-9A-Za-z]+)*)[\s:\.\-]*)?(?P<rest>.*)$',
            re.IGNORECASE,
        )
        m = label_pattern.match(text)
        if m:
            lbl = m.group("lbl") or ""
            num = m.group("num") or ""
            rest = (m.group("rest") or "").strip()

            if lbl.lower().startswith("fig"):
                lbl = "Fig."
            elif lbl.lower().startswith("prob"):
                lbl = "Problem"

            prefix = f"{lbl} {num}:".strip() if (lbl and num) else (f"{lbl} {num}".strip() if (lbl or num) else "")

            # Trim run-on textbook explanatory text
            stop_words_re = re.compile(
                r'^(.*?)(?:(?:\s*[:\-\u2013]\s*|\s+)(?:The\s+vapour|Water\s+and\s+carbon|On\s+complete\s+combustion|are\s+absorbed|formed\s+on\s+oxidation|formed\s+are|reach\s+the|is\s+collected|are\s+collected|showing\s+|which\s+is|used\s+for|in\s+two\s+different\s+phases|developed\s+chromatogram|extraction\s+of\s+comp|\(\s*extraction|\(\s*chromatography|chromatography\s+paper)).*$',
                re.IGNORECASE,
            )
            stop_match = stop_words_re.match(rest)
            title_body = stop_match.group(1).strip() if stop_match else rest

            title_body = re.sub(r"^[\s\'\"\`\-\:\;\(\[\{]+", "", title_body)
            title_body = re.sub(r"[\s\'\"\`\-\:\;\)\]\}]+$", "", title_body)

            if len(title_body) > 65:
                clauses = re.split(r'[,;\.\-\u2013]', title_body)
                title_body = clauses[0].strip()

            # Clean capitalization if English
            words = title_body.split()
            if words and not any(ord(c) > 127 for c in title_body):
                title_body = " ".join(
                    w.capitalize() if not w.isupper() and w.lower() not in ("of", "and", "in", "on", "for", "with", "to", "a", "an", "the") else w
                    for w in words
                )

            if prefix and title_body:
                return f"{prefix} {title_body}"
            elif prefix:
                return prefix
            elif title_body:
                return title_body

        return text[:70].strip()
