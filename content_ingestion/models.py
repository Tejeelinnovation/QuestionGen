"""
Content Ingestion & Dataset Collection Models.

Hierarchy:
  IngestionJob -> ExtractedChapter -> ExtractedPage -> ExtractedItem

Design Principles:
- IngestionJob tracks the lifecycle of an uploaded document (Book, Chapter, Notes).
- Preserves raw layout details (multi-column, reading order) and mathematical notation in LaTeX.
- Atomic dataset records (ExtractedItem) allow downstream question-generation models
  to easily query definitions, formulas, activities, and exercises by topic/chapter.
- Non-destructive & fully traceable back to the source PDF and Google Drive storage.
"""

from typing import Optional

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimestampedModel


class DocumentKind(models.TextChoices):
    TEXTBOOK = "TEXTBOOK", _("Textbook")
    FULL_BOOK = "FULL_BOOK", _("Full Book")
    SINGLE_CHAPTER = "SINGLE_CHAPTER", _("Single Chapter")
    SINGLE_TOPIC = "SINGLE_TOPIC", _("Single Topic")
    WORKSHEET_OR_EXAM = "WORKSHEET_OR_EXAM", _("Worksheet or Exam")
    QUESTION_PAPER = "QUESTION_PAPER", _("Question Paper")
    NOTES = "NOTES", _("Notes")
    HANDWRITTEN_NOTES = "HANDWRITTEN_NOTES", _("Handwritten Notes")
    NEWSPAPER = "NEWSPAPER", _("Newspaper")
    MAGAZINE = "MAGAZINE", _("Magazine")
    OTHER = "OTHER", _("Other Material")
    UNKNOWN = "UNKNOWN", _("Unknown")


class GranularityDetected(models.TextChoices):
    UNKNOWN = "UNKNOWN", _("Unknown / Not Yet Detected")
    WHOLE_BOOK = "WHOLE_BOOK", _("Whole Book")
    CHAPTER = "CHAPTER", _("Single Chapter")
    TOPIC = "TOPIC", _("Single Topic / Notes")


class JobStatus(models.TextChoices):
    PENDING = "PENDING", _("Pending")
    PARSING = "PARSING", _("Parsing Layout & TOC")
    EXTRACTING = "EXTRACTING", _("Extracting Structured Content")
    COMPLETED = "COMPLETED", _("Completed")
    FAILED = "FAILED", _("Failed")


class IngestionJob(TimestampedModel):
    """
    Represents an uploaded document ingestion task.
    """

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ingestion_jobs",
        help_text="User (teacher, admin) who uploaded the document.",
    )
    school = models.ForeignKey(
        "schools.School",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ingestion_jobs",
        help_text="School tenant owning this ingestion task.",
    )
    title = models.CharField(
        max_length=255,
        help_text="Document or textbook title (e.g. 'NCERT Class 10 Mathematics').",
    )
    subject = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        default=None,
        help_text="Academic subject (e.g. 'Mathematics', 'Science', 'Physics').",
    )
    standard = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        default=None,
        help_text="Grade / Standard level (e.g. 8, 9, 10, 11, 12).",
    )
    board = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        default=None,
        help_text="Educational board (e.g. 'NCERT', 'CBSE', 'GSEB').",
    )
    document_kind = models.CharField(
        max_length=30,
        choices=DocumentKind.choices,
        null=True,
        blank=True,
        default=None,
        db_index=True,
    )
    classification_confidence = models.FloatField(
        null=True,
        blank=True,
        default=None,
        help_text="Confidence score (0.0 to 1.0) of document classifier.",
    )
    classification_evidence = models.TextField(
        blank=True,
        default="",
        help_text="Diagnostic evidence strings explaining why this document kind was assigned.",
    )
    granularity = models.CharField(
        max_length=30,
        choices=GranularityDetected.choices,
        default=GranularityDetected.UNKNOWN,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=JobStatus.choices,
        default=JobStatus.PENDING,
        db_index=True,
    )
    total_pages = models.PositiveIntegerField(
        default=0,
        help_text="Total number of pages detected in the uploaded PDF.",
    )
    processed_pages = models.PositiveIntegerField(
        default=0,
        help_text="Number of pages successfully parsed and structured.",
    )
    current_stage = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Human-readable progress message (e.g. 'Extracting Chapter 2 (Page 45/180)').",
    )
    source_file = models.FileField(
        upload_to="ingestion_raw/%Y/%m/",
        null=True,
        blank=True,
        help_text="Temporary local upload path for processing.",
    )
    file_size_bytes = models.BigIntegerField(
        default=0,
        help_text="Uploaded PDF file size in bytes.",
    )
    google_drive_file_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Google Drive file ID for cloud backup.",
    )
    google_drive_url = models.URLField(
        max_length=500,
        blank=True,
        default="",
        help_text="Direct view / download link in Google Drive.",
    )
    error_message = models.TextField(
        blank=True,
        default="",
        help_text="Details of any parsing error if status == FAILED.",
    )
    table_of_contents = models.JSONField(
        default=list,
        blank=True,
        null=True,
        help_text="Detected TOC list: [{'chapter_number': 1, 'title': '...', 'start_page': 1, 'end_page': 25}].",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Arbitrary extra metadata (language, author, tags, etc.).",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Ingestion Job"
        verbose_name_plural = "Ingestion Jobs"

    def __str__(self) -> str:
        return f"IngestionJob #{self.pk}: {self.title} ({self.status}) [{self.processed_pages}/{self.total_pages}]"

    @property
    def progress_percentage(self) -> int:
        if not self.total_pages:
            return 0
        return int((self.processed_pages / self.total_pages) * 100)

    @property
    def duration_seconds(self) -> Optional[float]:
        """Returns total extraction time in seconds."""
        if self.metadata and isinstance(self.metadata, dict):
            sec = self.metadata.get("duration_seconds")
            if sec is not None:
                try:
                    return round(float(sec), 1)
                except (ValueError, TypeError):
                    pass
        if self.status in (JobStatus.COMPLETED, JobStatus.FAILED) and self.created_at and self.updated_at:
            delta = (self.updated_at - self.created_at).total_seconds()
            return round(max(0.0, delta), 1)
        return None

    @property
    def duration_formatted(self) -> str:
        """Returns human-readable duration, e.g. '2m 14s' or '45s'."""
        sec = self.duration_seconds
        if sec is None or sec <= 0:
            return ""
        total_sec = int(round(sec))
        mins = total_sec // 60
        rem_sec = total_sec % 60
        if mins > 0:
            return f"{mins}m {rem_sec:02d}s" if rem_sec > 0 else f"{mins}m"
        return f"{total_sec}s"

    @property
    def is_educational(self) -> bool:
        """Returns True if the document kind is standard educational study material."""
        if not self.document_kind:
            return True
        return self.document_kind not in (
            DocumentKind.NEWSPAPER,
            DocumentKind.MAGAZINE,
            DocumentKind.OTHER,
        )


class ExtractedChapter(TimestampedModel):
    """
    Represents a chapter identified in the document (from TOC or detected heading).
    """

    job = models.ForeignKey(
        IngestionJob,
        on_delete=models.CASCADE,
        related_name="chapters",
    )
    chapter_number = models.PositiveIntegerField(default=1)
    title = models.TextField(default="")
    start_page = models.PositiveIntegerField(default=1)
    end_page = models.PositiveIntegerField(default=1)
    summary = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["chapter_number"]
        verbose_name = "Extracted Chapter"
        verbose_name_plural = "Extracted Chapters"
        unique_together = [("job", "chapter_number")]

    def __str__(self) -> str:
        return f"Chapter {self.chapter_number}: {self.title} (Pages {self.start_page}-{self.end_page})"


class ExtractedPage(TimestampedModel):
    """
    Represents a single parsed page with layout and structured blocks.
    """

    job = models.ForeignKey(
        IngestionJob,
        on_delete=models.CASCADE,
        related_name="pages",
    )
    chapter = models.ForeignKey(
        ExtractedChapter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pages",
    )
    page_number = models.PositiveIntegerField()
    layout_type = models.CharField(
        max_length=50,
        default="SINGLE_COLUMN",
        help_text="SINGLE_COLUMN, TWO_COLUMN, HYBRID_COLUMN, COMPLEX_GRID",
    )
    raw_text = models.TextField(blank=True, default="")
    structured_content = models.JSONField(
        default=list,
        blank=True,
        help_text="Array of structured section objects (headings, paragraphs, formulas, diagrams, etc.).",
    )
    is_verified = models.BooleanField(
        default=False,
        help_text="Whether this page has been reviewed and approved by a human operator.",
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_pages",
    )

    class Meta:
        ordering = ["page_number"]
        verbose_name = "Extracted Page"
        verbose_name_plural = "Extracted Pages"
        unique_together = [("job", "page_number")]

    def __str__(self) -> str:
        return f"Job #{self.job_id} — Page {self.page_number} ({self.layout_type})"


class ItemType(models.TextChoices):
    PARAGRAPH = "PARAGRAPH", _("Paragraph / Body Text")
    FORMULA = "FORMULA", _("Mathematical / Chemical Formula")
    DIAGRAM = "DIAGRAM", _("Diagram / Image with Caption")
    ACTIVITY = "ACTIVITY", _("Activity / Experiment / Task")
    SOLVED_EXAMPLE = "SOLVED_EXAMPLE", _("Solved Example")
    EXERCISE_QUESTION = "EXERCISE_QUESTION", _("Exercise / Textbook Question")
    DEFINITION = "DEFINITION", _("Key Definition / Terminology")
    SUMMARY = "SUMMARY", _("Summary / Key Takeaway")


class ExtractedItem(TimestampedModel):
    """
    Atomic extracted pedagogical item for training question-generation models.
    """

    job = models.ForeignKey(
        IngestionJob,
        on_delete=models.CASCADE,
        related_name="items",
    )
    page = models.ForeignKey(
        ExtractedPage,
        on_delete=models.CASCADE,
        related_name="items",
    )
    chapter = models.ForeignKey(
        ExtractedChapter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
    )
    item_type = models.CharField(
        max_length=40,
        choices=ItemType.choices,
        db_index=True,
    )
    heading = models.TextField(blank=True, default="")
    content = models.TextField(help_text="Clean extracted text with LaTeX embedded.")
    latex_equations = models.JSONField(
        default=list,
        blank=True,
        help_text="List of isolated LaTeX formula strings found in this item.",
    )
    image_path = models.TextField(
        blank=True,
        default="",
        help_text="Local or media path of cropped figure.",
    )
    image_caption = models.TextField(
        blank=True,
        null=True,
        default="",
        help_text="Associated figure/diagram caption.",
    )
    image_label = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        default="",
        help_text="Figure/Diagram label or identifier (e.g. Figure 1.1, चित्र 2.1).",
    )
    image_description = models.TextField(
        blank=True,
        null=True,
        default="",
        help_text="Detailed description or context for the image.",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Contextual metadata (column, paragraph_idx, confidence, etc.).",
    )

    class Meta:
        ordering = ["page__page_number", "id"]
        verbose_name = "Extracted Item"
        verbose_name_plural = "Extracted Items"

    def __str__(self) -> str:
        return f"[{self.item_type}] Page {self.page.page_number}: {self.heading or self.content[:50]}..."


class GeminiResultCache(TimestampedModel):
    """
    Persisted cache for Gemini multimodal and text API responses in Neon PostgreSQL.
    Keyed by SHA256 of file_hash + page_number + prompt_version to ensure ephemeral runners
    never waste API quota or repeat identical calls across restarts.
    """

    cache_key = models.CharField(max_length=64, unique=True, db_index=True)
    file_hash = models.CharField(max_length=64, blank=True, db_index=True)
    page_number = models.PositiveIntegerField(default=1)
    prompt_version = models.CharField(max_length=32, default="v1")
    response_data = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Gemini Result Cache"
        verbose_name_plural = "Gemini Result Caches"

    def __str__(self) -> str:
        return f"GeminiCache {self.cache_key[:12]} (p{self.page_number}, {self.prompt_version})"

