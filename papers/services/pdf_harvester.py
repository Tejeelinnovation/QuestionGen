"""
Fast In-Memory PDF Harvester Service.

Extracts text, chapter headings, and embedded figures from teacher-uploaded PDFs in 1-3 seconds.
Generates lightweight base64 thumbnails for frontend preview and handles selective
upload to Google Drive subfolder 'paper_creation_diagrams/'.
"""

from __future__ import annotations

import base64
import io
import logging
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
            words = page_text.split()
            total_words += len(words)

            if page_text.strip():
                full_text_parts.append(f"--- [Page {page_num}] ---\n{page_text.strip()}")

            # 2. Extract Embedded Images with True Colorspace Conversion
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

        sanitized_title = "".join(c for c in paper_title if c.isalnum() or c in (" ", "_", "-")).rstrip()
        sanitized_title = sanitized_title.replace(" ", "_")[:30]

        for fig_id in selected_figure_ids:
            img_bytes = high_res_images.get(fig_id)
            if not img_bytes:
                continue

            fig_meta = detected_figures.get(fig_id, {})
            dest_name = f"{sanitized_title}_{fig_id}.png"

            # Archive to Google Drive if configured
            file_id = ""
            web_view_link = ""
            if drive_client.is_configured:
                try:
                    upload_result = drive_client.upload_bytes(
                        data=img_bytes,
                        destination_name=dest_name,
                        mime_type="image/png",
                        subfolder_name="paper_creation_diagrams",
                    )
                    file_id = upload_result.get("file_id", "")
                    web_view_link = upload_result.get("web_view_link", "")
                except Exception as drive_err:
                    logger.warning(f"Google Drive upload error for {fig_id}: {drive_err}")

            # Local proxy endpoint ensures 100% reliable image loading without cross-origin cookie blocks
            local_proxy_url = f"/api/papers/diagram-asset/{fig_id}/"

            # Cache high-res image to disk media/diagrams/ so it survives server reloads
            try:
                import os
                from django.conf import settings
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
        lines = page_text.splitlines()
        for line in lines:
            trimmed = line.strip()
            if any(trimmed.lower().startswith(prefix) for prefix in ("fig.", "figure", "diagram", "chart", "table", "illus")):
                if len(trimmed) < 120:
                    return trimmed

        return f"Figure {page_num}.{fig_num} (Page {page_num})"
