"""
Pydantic data schemas for Document AI Microservice.
Ensures strict JSON input and output matching the Question Generation System schema.

================================================================================
COORDINATE NORMALIZATION STANDARD (BBOX)
================================================================================
All bounding boxes throughout this schema and worker engine are normalized to:
    [x0, y0, x1, y1]
in standard PDF points (1/72 inch).
Origin (0, 0) is at the TOP-LEFT corner of the PDF page:
    - x0: distance from left edge to left boundary of box
    - y0: distance from top edge to top boundary of box
    - x1: distance from left edge to right boundary of box
    - y1: distance from top edge to bottom boundary of box
Invariant: x0 <= x1 and y0 <= y1.
When converting from PDF coordinate systems with bottom-left origin (e.g. Docling):
    top_y0 = page_height - bottom_y1
    top_y1 = page_height - bottom_y0
================================================================================
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExtractionRequest(BaseModel):
    """
    Payload sent by Django to request document extraction.
    """
    job_id: int
    title: str = "Document"
    document_kind: str = Field(default="AUTO", description="AUTO, TEXTBOOK, NEWSPAPER, etc.")
    pdf_url: Optional[str] = Field(default=None, description="Public or Google Drive download URL")
    callback_url: Optional[str] = Field(default=None, description="Django webhook URL to post results to")
    max_pages: Optional[int] = Field(default=None, description="Optional limit on pages to parse")


class ChapterSchema(BaseModel):
    chapter_number: int
    title: str
    start_page: int
    end_page: int
    summary: str = ""


class ArticleSchema(BaseModel):
    """
    For newspapers: groups headline, byline, and body into a structured article unit.
    """
    article_id: str = Field(description="Deterministic stable article ID (e.g. art_p1_3a8b)")
    headline: str = Field(default="", description="Article headline / title")
    byline: str = Field(default="", description="Author / reporter byline or bureau dateline")
    body: str = Field(default="", description="Complete body text of the article")
    column_index: int = Field(default=1, description="Primary column index (1-based)")
    page_number: int = Field(default=1, description="Page number where article begins")
    continues_on_page: Optional[int] = Field(default=None, description="Target page number if story continues")
    section_indices: List[int] = Field(default_factory=list, description="Indices of component sections in PageSchema")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional article metadata")


class SectionSchema(BaseModel):
    type: str = Field(
        default="PARAGRAPH",
        description="PARAGRAPH | FORMULA | DIAGRAM | ACTIVITY | SOLVED_EXAMPLE | EXERCISE_QUESTION | DEFINITION | SUMMARY",
    )
    heading: str = ""
    text: str = ""
    column_index: int = 1
    latex_equations: List[str] = Field(default_factory=list)
    image_path: str = ""
    image_data: Optional[str] = ""
    image_caption: str = ""
    image_classification: Optional[str] = Field(
        default=None,
        description="photo | ad | logo | face_grid | diagram | chart | table_image",
    )
    image_hash: str = Field(default="", description="SHA-256 hash of image bytes")
    perceptual_hash: str = Field(default="", description="dHash perceptual difference hash")
    bbox: Optional[List[float]] = Field(
        default=None,
        description="Normalized [x0, y0, x1, y1] with top-left origin in PDF points",
    )
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PageSchema(BaseModel):
    page_number: int
    layout_type: str = "SINGLE_COLUMN"
    column_count: int = Field(default=1, description="Number of detected columns on page (1 to 8)")
    raw_text: str = ""
    chapter_number: Optional[int] = None
    chapter_title: str = ""
    sections: List[SectionSchema] = Field(default_factory=list)
    articles: List[ArticleSchema] = Field(
        default_factory=list,
        description="Grouped newspaper articles (newspapers only)",
    )
    page_kind: str = Field(
        default="digital_text",
        description="digital_text | scanned_printed | handwriting | image_only | blank | mixed",
    )
    engine: str = Field(default="", description="Extraction engine used for this page")
    route_reason: str = Field(default="", description="Reason for the routing decision")
    detected_script: str = Field(default="latin", description="Primary detected script (latin, devanagari, gujarati, none)")
    ocr_language: Optional[str] = Field(default=None, description="Per-page OCR language code (e.g. hin, guj, eng)")
    legacy_font_encoding: bool = Field(default=False, description="True if legacy 8-bit font encoding was detected")
    needs_review: bool = Field(default=False, description="True if page requires human teacher review")
    quality_score: float = Field(default=1.0, description="Quality confidence score for the extracted page (0.0 - 1.0)")
    quality_flags: List[str] = Field(default_factory=list, description="Per-page quality flags and anomaly markers")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional per-page metadata")


class ExtractionResponse(BaseModel):
    """
    Structured extraction result returned by the microservice.
    """
    schema_version: str = "1.2.0"
    job_id: int
    status: str = "COMPLETED"
    total_pages: int
    processed_pages: int
    granularity: str = "WHOLE_BOOK"
    table_of_contents: List[ChapterSchema] = Field(default_factory=list)
    pages: List[PageSchema] = Field(default_factory=list)
    error_message: Optional[str] = None
