"""
Shared Document Classifier Bridge for Content Ingestion.
Canonical shared implementation lives in:
document_ai_worker.engine.document_classifier
"""

from document_ai_worker.engine.document_classifier import (
    DocumentClassificationResult,
    classify_document,
    NEWSPAPER_MASTHEADS,
    NEWSPAPER_KEYWORDS,
    EXAM_KEYWORDS,
    TEXTBOOK_KEYWORDS,
    PEDAGOGY_KEYWORDS,
)

__all__ = [
    "DocumentClassificationResult",
    "classify_document",
    "NEWSPAPER_MASTHEADS",
    "NEWSPAPER_KEYWORDS",
    "EXAM_KEYWORDS",
    "TEXTBOOK_KEYWORDS",
    "PEDAGOGY_KEYWORDS",
]
