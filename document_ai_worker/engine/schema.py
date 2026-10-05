"""
Pydantic data schemas for Document AI Microservice.
Ensures strict JSON input and output matching the Question Generation System schema.
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
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PageSchema(BaseModel):
    page_number: int
    layout_type: str = "SINGLE_COLUMN"
    raw_text: str = ""
    chapter_number: Optional[int] = None
    chapter_title: str = ""
    sections: List[SectionSchema] = Field(default_factory=list)


class ExtractionResponse(BaseModel):
    """
    Structured extraction result returned by the microservice.
    """
    job_id: int
    status: str = "COMPLETED"
    total_pages: int
    processed_pages: int
    granularity: str = "WHOLE_BOOK"
    table_of_contents: List[ChapterSchema] = Field(default_factory=list)
    pages: List[PageSchema] = Field(default_factory=list)
    error_message: Optional[str] = None
