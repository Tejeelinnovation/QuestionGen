"""
Fast In-Memory PDF Harvester Service.

Extracts text, chapter headings, and embedded figures from teacher-uploaded PDFs in 1-3 seconds.
Generates lightweight base64 thumbnails for frontend preview and handles selective
upload to Google Drive subfolder 'paper_creation_diagrams/'.
"""

from __future__ import annotations

import base64
import io
import json
import os
import logging
import re
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
    def _detect_diagrams_with_vision(cls, page: pymupdf.Page, page_num: int) -> List[Dict[str, Any]]:
        """
        Uses Gemini Vision to semantically detect genuine educational figures and precise bounding boxes.
        Strictly excludes advertisements, promotional download banners, Table of Contents,
        logos, barcodes, and decorative elements.
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
            pix = page.get_pixmap(dpi=130)
            b64_img = base64.b64encode(pix.tobytes("jpeg")).decode("utf-8")

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
                    res = requests.post(url, json=payload, timeout=20)
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

                    cropped_pix = page.get_pixmap(clip=clip_rect, dpi=200)
                    cropped_bytes = cropped_pix.tobytes("png")

                    if not cls._is_valid_diagram_image(cropped_bytes, cropped_pix.width, cropped_pix.height):
                        continue

                    fig_id = f"fig_p{page_num}_vdiag_{idx + 1}"
                    caption = str(item.get("caption") or f"Figure {page_num}.{idx + 1}")
                    thumb_b64 = cls._generate_thumbnail_base64(cropped_bytes)

                    results.append({
                        "figure_id": fig_id,
                        "page_number": page_num,
                        "width": cropped_pix.width,
                        "height": cropped_pix.height,
                        "caption": caption,
                        "diagram_type": str(item.get("diagram_type", "DIAGRAM")),
                        "thumbnail_b64": thumb_b64,
                        "image_bytes": cropped_bytes,
                    })
                except Exception as item_err:
                    logger.debug(f"Error parsing vision item {idx} on page {page_num}: {item_err}")
                    continue

            return results
        except Exception as v_err:
            logger.warning(f"Vision diagram extraction exception on page {page_num}: {v_err}")
            return []

    @classmethod
    def inspect_pdf(cls, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """
        Inspects PDF in memory and extracts text, metadata, and detected figures.
        Returns a summary payload with an inspection_id to retrieve extracted data later.
        """
        inspection_id = f"insp_{uuid.uuid4().hex[:12]}"
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")

        page_count = len(doc)
        full_text_parts: List[str] = []
        detected_figures: List[Dict[str, Any]] = []
        high_res_images: Dict[str, bytes] = {}

        total_words = 0

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

            # 2. Vision Diagram Detector (AI Visual Semantic Classifier)
            has_drawings = len(page.get_drawings()) > 10
            has_images = len(page.get_images()) > 0
            has_caption = bool(re.search(r"\b(?:fig|figure|diagram|chart|graph|चित्र|आकृति|सारणी|تصویر|شکل|خاکہ)\b", page_text, re.I))

            vision_handled = False
            max_vision_pages = 6 if total_words < 50 else 12
            if (has_drawings or has_images or has_caption) and page_num <= max_vision_pages and len(detected_figures) < 15:
                v_figs = cls._detect_diagrams_with_vision(page, page_num)
                if v_figs:
                    vision_handled = True
                    for vf in v_figs:
                        fig_id = vf["figure_id"]
                        detected_figures.append({
                            "figure_id": fig_id,
                            "page_number": page_num,
                            "width": vf["width"],
                            "height": vf["height"],
                            "caption": vf["caption"],
                            "thumbnail_b64": vf["thumbnail_b64"],
                            "mime_type": "image/png",
                        })
                        high_res_images[fig_id] = vf["image_bytes"]
                        cls._high_res_cache[fig_id] = vf["image_bytes"]

            # 3. Fallback: Extract Embedded Images with True Colorspace Conversion if Vision did not run
            if not vision_handled:
                image_list = page.get_images(full=True)
                for img_idx, img_info in enumerate(image_list):
                    xref = img_info[0]
                    try:
                        pix = pymupdf.Pixmap(doc, xref)

                        # Convert CMYK, Separation, or Grayscale pixmaps to standard RGB
                        if pix.n >= 5 or pix.colorspace != pymupdf.csRGB:
                            try:
                                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                            except Exception:
                                pass

                        width = pix.width
                        height = pix.height

                        # Filter out tiny icons, decorative lines, or logos
                        if width < cls.MIN_IMAGE_WIDTH or height < cls.MIN_IMAGE_HEIGHT:
                            continue

                        # Filter out extreme banner strips (aspect ratio > 4.5 or < 0.22)
                        aspect = width / max(height, 1)
                        if aspect > 4.5 or aspect < 0.22:
                            continue

                        img_bytes = pix.tobytes("png")
                        if not img_bytes:
                            continue

                        # Filter out solid black/blank/monochrome background boxes
                        if not cls._is_valid_diagram_image(img_bytes, width, height):
                            continue

                        # Generate unique ID for this figure
                        fig_id = f"fig_p{page_num}_{img_idx + 1}_{xref}"

                        # Detect nearby caption from page text
                        caption = cls._detect_caption(page_text, page_num, img_idx + 1)

                        # Create lightweight thumbnail for instant browser display
                        thumb_b64 = cls._generate_thumbnail_base64(img_bytes)

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

                        # Store original high-res bytes for instant proxy serving & Drive archival
                        high_res_images[fig_id] = img_bytes
                        cls._high_res_cache[fig_id] = img_bytes

                    except Exception as img_err:
                        logger.debug(f"Could not extract image xref {xref} on page {page_num}: {img_err}")
                        continue

            # 4. Extract Vector & Composite Textbook Diagrams via Caption Anchors (if not already handled by vision)
            if not vision_handled:
                # NCERT and textbook PDFs often draw diagrams using vector paths or composite gradient strips
                try:
                    caption_regex = re.compile(
                        r"^\s*(?:Fig(?:ure)?\.?|चित्र|आकृति|सारणी|تصویر|شکل|خاکہ|جدول|باکس|Diagram)\s*([0-9۰-۹०-९]+(?:[\.\-][0-9۰-۹०-९]+)*)",
                        re.IGNORECASE,
                    )
                    blocks = page.get_text("blocks")
                    for b in blocks:
                        block_text = b[4].strip()
                        m = caption_regex.match(block_text)
                        if m:
                            fig_num_tag = m.group(1).replace(".", "_")
                            fig_id = f"fig_p{page_num}_comp_{fig_num_tag}"
                            if fig_id in high_res_images:
                                continue
    
                            cap_box = pymupdf.Rect(b[:4])
                            cap_text = " ".join(block_text.split()[:25])
                            if detect_caesar_shift(cap_text):
                                try:
                                    cap_text = unshift_ncert_text(cap_text)
                                except Exception:
                                    pass
    
                            # Collect all drawing and image bounding rects on this page
                            elements = [d["rect"] for d in page.get_drawings()]
                            for img in page.get_images():
                                elements.extend(page.get_image_rects(img[0]))
    
                            valid_elements = [
                                r for r in elements
                                if 20 < r.width < 580 and 10 < r.height < 650
                            ]
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
    
                            if cand_rect and cand_rect.width >= 70 and cand_rect.height >= 50:
                                clip_rect = (
                                    pymupdf.Rect(
                                        cand_rect.x0 - 6,
                                        cand_rect.y0 - 6,
                                        cand_rect.x1 + 6,
                                        cand_rect.y1 + 6,
                                    )
                                    & page.rect
                                )
                                pix = page.get_pixmap(clip=clip_rect, dpi=180)
                                comp_bytes = pix.tobytes("png")
                                if cls._is_valid_diagram_image(comp_bytes, pix.width, pix.height):
                                    thumb_b64 = cls._generate_thumbnail_base64(comp_bytes)
                                    detected_figures.append(
                                        {
                                            "figure_id": fig_id,
                                            "page_number": page_num,
                                            "width": pix.width,
                                            "height": pix.height,
                                            "caption": cap_text,
                                            "thumbnail_b64": thumb_b64,
                                            "mime_type": "image/png",
                                        }
                                    )
                                    high_res_images[fig_id] = comp_bytes
                                    cls._high_res_cache[fig_id] = comp_bytes
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
                    pix = page.get_pixmap(dpi=120)
                    img_bytes = pix.tobytes("png")
                    b64_img = base64.b64encode(img_bytes).decode("utf-8")
                    t_text = pipeline._transcribe_with_gemini(b64_img, p_num)
                    if t_text and t_text.strip():
                        full_text_parts.append(f"--- [Page {p_num} OCR] ---\n{t_text.strip()}")
                        total_words += len(t_text.split())
                        # If no figures detected yet, register the scanned page as a diagram asset
                        if len(detected_figures) == 0:
                            fig_id = f"fig_scan_p{p_num}"
                            thumb_b64 = cls._generate_thumbnail_base64(img_bytes)
                            detected_figures.append({
                                "figure_id": fig_id,
                                "page_number": p_num,
                                "width": pix.width,
                                "height": pix.height,
                                "caption": f"Scanned page {p_num} reference",
                                "thumbnail_b64": thumb_b64,
                                "mime_type": "image/png",
                            })
                            high_res_images[fig_id] = img_bytes
                            cls._high_res_cache[fig_id] = img_bytes
            except Exception as ocr_err:
                logger.warning(f"OCR transcription fallback error for {filename}: {ocr_err}")

        extracted_full_text = "\n\n".join(full_text_parts)

        # Cache the inspection bundle
        cache_bundle = {
            "inspection_id": inspection_id,
            "filename": filename,
            "page_count": page_count,
            "word_count": total_words,
            "full_text": extracted_full_text,
            "detected_figures": detected_figures,
            "high_res_images": high_res_images,
        }
        cls._inspection_cache[inspection_id] = cache_bundle
        cache.set(f"pdf_inspection_{inspection_id}", cache_bundle, timeout=CACHE_TTL_SECONDS)

        # Return client-safe summary (thumbnails included, high-res bytes excluded)
        return {
            "inspection_id": inspection_id,
            "filename": filename,
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

    @classmethod
    def get_figure_bytes(cls, figure_id: str) -> Optional[bytes]:
        """
        Retrieves original high-res image bytes for a figure.
        Checks in-memory fast cache, Django cache, and fallback storage.
        """
        if figure_id in cls._high_res_cache:
            return cls._high_res_cache[figure_id]

        for insp_data in cls._inspection_cache.values():
            high_res = insp_data.get("high_res_images", {})
            if figure_id in high_res:
                cls._high_res_cache[figure_id] = high_res[figure_id]
                return high_res[figure_id]

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
            img_bytes = high_res_images.get(fig_id)
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

            # Cache high-res image to disk media/diagrams/ only if local storage is permitted (dev)
            if store_local:
                try:
                    disk_dir = os.path.join(settings.MEDIA_ROOT, "diagrams")
                    os.makedirs(disk_dir, exist_ok=True)
                    with open(os.path.join(disk_dir, f"{fig_id}.png"), "wb") as f_disk:
                        f_disk.write(img_bytes)
                except Exception as disk_err:
                    logger.debug(f"Failed to cache diagram {fig_id} on disk: {disk_err}")

            uploaded_diagrams.append(
                {
                    "figure_id": fig_id,
                    "title": fig_meta.get("caption", f"Figure (Page {fig_meta.get('page_number', 1)})"),
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
                    return trimmed

        return f"Figure {page_num}.{fig_num} (Page {page_num})"
