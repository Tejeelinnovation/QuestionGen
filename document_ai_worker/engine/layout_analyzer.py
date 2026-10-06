"""
Layout Analyzer, Column Clustering, Newspaper Article Grouping, and Image Processing Engine.
"""

from __future__ import annotations

import hashlib
import io
import logging
import math
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import pymupdf as fitz
from PIL import Image

from .schema import ArticleSchema, SectionSchema

logger = logging.getLogger(__name__)


# ==============================================================================
# 1. Bounding Box Normalization & Crop Function
# ==============================================================================

def normalize_bbox(
    bbox: List[float] | Tuple[float, ...],
    page_width: float,
    page_height: float,
    origin: str = "top_left",
) -> List[float]:
    """
    Normalizes any bounding box to the standard [x0, y0, x1, y1] format
    with (0, 0) at the TOP-LEFT of the page in PDF points.
    Guarantees x0 <= x1 and y0 <= y1 within page bounds.
    """
    if not bbox or len(bbox) != 4:
        return [0.0, 0.0, 0.0, 0.0]

    b0, b1, b2, b3 = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])

    if origin == "bottom_left":
        # Convert bottom-left origin (e.g. Docling standard) to top-left origin
        x0 = min(b0, b2)
        x1 = max(b0, b2)
        y0 = page_height - max(b1, b3)
        y1 = page_height - min(b1, b3)
    else:
        # Already top-left origin
        x0 = min(b0, b2)
        x1 = max(b0, b2)
        y0 = min(b1, b3)
        y1 = max(b1, b3)

    # Clamp to page boundaries
    x0 = max(0.0, min(x0, page_width))
    x1 = max(0.0, min(x1, page_width))
    y0 = max(0.0, min(y0, page_height))
    y1 = max(0.0, min(y1, page_height))

    return [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)]


def crop_bbox_from_page(
    page: fitz.Page,
    bbox: List[float] | Tuple[float, ...],
    dpi: int = 200,
) -> fitz.Pixmap:
    """
    Crops a rectangular region from a PyMuPDF Page at full resolution.
    Assumes top-left normalized bbox: [x0, y0, x1, y1].
    """
    rect = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
    # Enforce minimum dimension of 2 points to avoid rendering crashes
    if rect.width < 2:
        rect.x1 = rect.x0 + 2
    if rect.height < 2:
        rect.y1 = rect.y0 + 2
    return page.get_pixmap(clip=rect, dpi=dpi)


# ==============================================================================
# 2. Column Clustering & Correct Reading Order
# ==============================================================================

def cluster_columns(
    blocks: List[Dict[str, Any]],
    page_width: float,
    page_height: float,
    max_columns: int = 8,
) -> Tuple[int, str, List[Dict[str, Any]]]:
    """
    Clusters block x-positions into columns (1 to 8) and determines layout_type
    and correct top-to-bottom, column-by-column reading order.

    Returns:
        (column_count, layout_type, ordered_blocks)
    """
    if not blocks:
        return 1, "SINGLE_COLUMN", []

    # 1. Identify full-width spanning blocks (e.g. running masthead, banners, broad footers)
    # A block spanning > 65% of the page width is considered a spanning element
    spanning_threshold = page_width * 0.65
    column_candidates = []
    spanning_blocks = []

    for b in blocks:
        bbox = b.get("bbox", [0, 0, 0, 0])
        w = bbox[2] - bbox[0]
        if w >= spanning_threshold:
            b["column_index"] = 0  # 0 indicates full-width spanning
            spanning_blocks.append(b)
        else:
            column_candidates.append(b)

    if not column_candidates:
        # All blocks are spanning -> single column layout
        ordered = sorted(blocks, key=lambda x: x.get("bbox", [0, 0, 0, 0])[1])
        for b in ordered:
            b["column_index"] = 1
        return 1, "SINGLE_COLUMN", ordered

    # 2. Cluster x-positions of non-spanning blocks into columns
    # We examine block centers and left edges
    x_centers = sorted([(b["bbox"][0] + b["bbox"][2]) / 2 for b in column_candidates])

    # Find natural gutters / gaps between x-centers
    # A gutter gap is at least 3% of page width or 20 points
    min_gutter = max(20.0, page_width * 0.035)

    column_boundaries: List[float] = [0.0]
    last_x = x_centers[0]
    clusters: List[List[float]] = [[last_x]]

    for x in x_centers[1:]:
        if (x - last_x) >= min_gutter:
            clusters.append([x])
        else:
            clusters[-1].append(x)
        last_x = x

    # Cap at max_columns (1 to 8)
    col_count = max(1, min(len(clusters), max_columns))

    # Compute column boundary thresholds (midpoints between cluster centers)
    cluster_means = [sum(c) / len(c) for c in clusters[:col_count]]
    thresholds = []
    for i in range(len(cluster_means) - 1):
        thresholds.append((cluster_means[i] + cluster_means[i + 1]) / 2)

    # 3. Assign column_index to each column candidate
    for b in column_candidates:
        xc = (b["bbox"][0] + b["bbox"][2]) / 2
        col_idx = 1
        for thresh in thresholds:
            if xc > thresh:
                col_idx += 1
            else:
                break
        b["column_index"] = min(col_idx, col_count)

    # 4. Determine reading order:
    # Top headers (y1 < 0.15 * page_height and spanning) first
    # Then columns 1 .. col_count from left to right, sorted top-to-bottom within each column
    # Then bottom footers (y0 > 0.85 * page_height and spanning) last
    top_headers = [b for b in spanning_blocks if b["bbox"][3] <= page_height * 0.20]
    bottom_footers = [b for b in spanning_blocks if b["bbox"][1] >= page_height * 0.80]
    middle_spanning = [b for b in spanning_blocks if b not in top_headers and b not in bottom_footers]

    # Sort each group by vertical position y0
    top_headers.sort(key=lambda b: b["bbox"][1])
    bottom_footers.sort(key=lambda b: b["bbox"][1])
    middle_spanning.sort(key=lambda b: b["bbox"][1])

    # Sort column candidates: primary key is column_index, secondary key is y0
    col_blocks_ordered = []
    for col_i in range(1, col_count + 1):
        col_items = [b for b in column_candidates if b.get("column_index") == col_i]
        col_items.sort(key=lambda b: b["bbox"][1])
        col_blocks_ordered.extend(col_items)

    ordered = top_headers + middle_spanning + col_blocks_ordered + bottom_footers

    # 5. Determine layout_type string
    if col_count == 1:
        layout_type = "SINGLE_COLUMN"
    elif col_count == 2:
        layout_type = "TWO_COLUMN"
    elif col_count == 3:
        layout_type = "THREE_COLUMN"
    elif col_count > 3:
        layout_type = "MULTI_COLUMN"
    else:
        layout_type = "COMPLEX_GRID"

    return col_count, layout_type, ordered


# ==============================================================================
# 3. Newspaper Article Grouping (Headline + Byline + Body)
# ==============================================================================

CONTINUES_PATTERNS = [
    re.compile(r"(?:continued|contd|cont'?d|see)\s+(?:on\s+)?page\s+(\d+)", re.IGNORECASE),
    re.compile(r"turn\s+to\s+page\s+(\d+)", re.IGNORECASE),
    re.compile(r"p(?:age)?\s*(\d+)\s*(?:,\s*col|\s*$)", re.IGNORECASE),
]

BYLINE_PATTERNS = [
    re.compile(r"^(?:by\s+)([A-Z][a-zA-Z\s\.]+)", re.IGNORECASE),
    re.compile(r"^([A-Z][a-zA-Z\s]+(?:Krishnan|Sharma|Verma|Gupta|Singh|Choudhury|Times News Network|TNN|PTI|IANS|Reuters|AFP))", re.IGNORECASE),
    re.compile(r"^([A-Z\s]{3,30})\s*\|\s*(?:NEW DELHI|MUMBAI|DELHI|BENGALURU|CHENNAI|KOLKATA)", re.IGNORECASE),
]


def extract_newspaper_articles(
    page_num: int,
    sections: List[SectionSchema],
) -> List[ArticleSchema]:
    """
    Groups headline, byline, and body sections into structured ArticleSchema objects.
    Applies ONLY to newspaper pages.
    """
    articles: List[ArticleSchema] = []
    current_headline = ""
    current_byline = ""
    current_body_parts: List[str] = []
    current_sec_indices: List[int] = []
    current_col = 1
    current_target_page: Optional[int] = None

    def _flush_article():
        nonlocal current_headline, current_byline, current_body_parts, current_sec_indices, current_col, current_target_page
        if current_headline or current_body_parts:
            full_body = "\n\n".join(current_body_parts).strip()
            headline_text = current_headline or (full_body[:60] + "..." if full_body else f"Article {len(articles) + 1}")
            h_slug = hashlib.sha256(f"p{page_num}_{headline_text}".encode()).hexdigest()[:8]
            art_id = f"art_p{page_num}_{h_slug}"

            # Compute enclosing bbox from member sections
            art_bbox = None
            for s_idx in current_sec_indices:
                s = sections[s_idx]
                sb = s.bbox or (s.metadata.get("bbox") if s.metadata else None)
                if sb and len(sb) >= 4:
                    if art_bbox is None:
                        art_bbox = [sb[0], sb[1], sb[2], sb[3]]
                    else:
                        art_bbox[0] = min(art_bbox[0], sb[0])
                        art_bbox[1] = min(art_bbox[1], sb[1])
                        art_bbox[2] = max(art_bbox[2], sb[2])
                        art_bbox[3] = max(art_bbox[3], sb[3])

            meta = {}
            if art_bbox:
                meta["bbox"] = art_bbox

            articles.append(ArticleSchema(
                article_id=art_id,
                headline=headline_text,
                byline=current_byline,
                body=full_body,
                column_index=current_col,
                page_number=page_num,
                continues_on_page=current_target_page,
                section_indices=list(current_sec_indices),
                metadata=meta,
            ))

        current_headline = ""
        current_byline = ""
        current_body_parts = []
        current_sec_indices = []
        current_target_page = None

    for idx, sec in enumerate(sections):
        if sec.type == "DIAGRAM":
            continue

        text = sec.text.strip()
        heading = sec.heading.strip()

        # Check for continuation notice
        for pat in CONTINUES_PATTERNS:
            m = pat.search(text) or (pat.search(heading) if heading else None)
            if m:
                try:
                    current_target_page = int(m.group(1))
                except ValueError:
                    pass

        # Check for byline pattern
        byline_match = None
        for bpat in BYLINE_PATTERNS:
            bm = bpat.match(text)
            if bm:
                byline_match = bm.group(0).strip()
                break

        # Check if section represents a new headline
        is_new_headline = False
        if heading and len(heading.split()) >= 2:
            is_new_headline = True
        elif text and 5 <= len(text) < 140 and (text.isupper() or len(text.split()) <= 10) and not text.endswith((".", ":", ";")):
            # Don't treat continuation notices or lines ending with page numbers as headlines
            if not any(pat.search(text) for pat in CONTINUES_PATTERNS) and (not current_headline or text.isupper()):
                is_new_headline = True

        # Flush active article if a new headline or byline is encountered
        if (byline_match or is_new_headline) and current_headline and current_body_parts:
            _flush_article()


        if is_new_headline and not current_headline:
            current_headline = heading or text
            current_col = sec.column_index
            current_sec_indices.append(idx)
            if heading and text and text != heading:
                current_body_parts.append(text)
        elif byline_match and not current_byline:
            current_byline = byline_match
            current_sec_indices.append(idx)
            rem = text[len(byline_match):].strip(" -|,\n")
            if rem:
                current_body_parts.append(rem)
        else:
            if text:
                current_body_parts.append(text)
                current_sec_indices.append(idx)

    # Flush last article on page
    _flush_article()

    return articles


# ==============================================================================
# 4. Image Processing, Deduplication, and Classification
# ==============================================================================

def compute_dhash(image: Image.Image, hash_size: int = 8) -> str:
    """
    Computes a 64-bit difference hash (dHash) for perceptual image deduplication.
    Compares pixel luminance differences horizontally.
    """
    try:
        resized = image.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
        pixels = list(resized.tobytes())
        diff = []
        for row in range(hash_size):
            row_start = row * (hash_size + 1)
            for col in range(hash_size):
                p_left = pixels[row_start + col]
                p_right = pixels[row_start + col + 1]
                diff.append("1" if p_left > p_right else "0")
        # Convert binary string to hexadecimal
        decimal = int("".join(diff), 2)
        return f"{decimal:016x}"
    except Exception:
        return ""


def hamming_distance(h1: str, h2: str) -> int:
    """Calculates the bitwise Hamming distance between two hex hashes."""
    if not h1 or not h2 or len(h1) != len(h2):
        return 64
    try:
        val1 = int(h1, 16)
        val2 = int(h2, 16)
        return bin(val1 ^ val2).count("1")
    except ValueError:
        return 64


def classify_image_heuristic(
    pil_img: Image.Image,
    bbox: List[float],
    page_width: float,
    page_height: float,
) -> str:
    """
    Classifies image into one of:
    photo | ad | logo | face_grid | diagram | chart | table_image
    using cheap, fast visual heuristics (size, aspect ratio, color entropy).
    """
    w, h = pil_img.size
    aspect_ratio = w / max(h, 1)

    # 1. Logos & small icons
    if w <= 120 and h <= 120:
        return "logo"

    # 2. Ads (full-width banners or massive graphic regions)
    if aspect_ratio >= 4.0 or aspect_ratio <= 0.22:
        return "ad"
    if (w * h) >= (page_width * page_height * 0.40):
        return "ad"

    # 3. Analyze color distribution and edge entropy
    try:
        # Convert to greyscale to inspect pixel variance
        grey = pil_img.convert("L")
        extrema = grey.getextrema()
        if extrema[0] == extrema[1]:
            # Solid color
            return "ad"

        # Check color saturation (diagram vs photo)
        rgb = pil_img.convert("RGB")
        colors = rgb.getcolors(maxcolors=256)
        is_few_colors = colors is not None and len(colors) < 64

        if is_few_colors:
            # Low color palette with grid structure -> chart or diagram
            if aspect_ratio > 1.2:
                return "chart"
            return "diagram"

        # Multi-color photographic content
        if 0.65 <= aspect_ratio <= 1.5 and 150 <= w <= 800:
            return "photo"

        if aspect_ratio > 2.0 and w > 400:
            return "ad"

        return "photo"
    except Exception:
        return "diagram"


def find_nearest_caption(
    img_bbox: List[float],
    text_blocks: List[Dict[str, Any]],
    max_distance: float = 45.0,
) -> str:
    """
    Finds caption text near an image bounding box (immediately above or below).
    Strips generic 'Figure N' prefixes.
    """
    best_dist = float("inf")
    best_caption = ""

    img_x0, img_y0, img_x1, img_y1 = img_bbox

    for b in text_blocks:
        b_bbox = b.get("bbox", [0, 0, 0, 0])
        text = b.get("text", "").strip()
        if not text:
            continue

        # Check if text is directly below image
        dist_below = b_bbox[1] - img_y1
        if 0 <= dist_below <= max_distance:
            if dist_below < best_dist:
                best_dist = dist_below
                best_caption = text

        # Check if text is directly above image
        dist_above = img_y0 - b_bbox[3]
        if 0 <= dist_above <= max_distance:
            if dist_above < best_dist:
                best_dist = dist_above
                best_caption = text

    # Remove generic "Figure N" or "Fig N" prefixes
    cleaned_caption = re.sub(r"^(?:Figure|Fig\.?)\s*\d+[:\.\-]?\s*", "", best_caption, flags=re.IGNORECASE).strip()
    return cleaned_caption or best_caption
