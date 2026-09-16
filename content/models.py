"""
Content app models.

Hierarchy:  Book  →  Chapter  →  Topic  →  Question

Design notes
------------
- All models extend ``core.TimestampedModel`` for consistent created_at /
  updated_at without repetition.
- ``is_active`` flags on ``Book`` and ``Question`` allow soft-disable without
  deletion; the demo seeds only one active book and chapter but the schema is
  ready for more rows without any future migrations.
- ``question_type``, ``difficulty``, and ``learner_level`` use TextChoices so
  the valid strings are defined exactly once here and can be imported by
  ``content/filters.py`` and Prompt 4 (papers) without duplication.
- ``options`` (MCQ choices) is a nullable JSONField expected to hold a dict
  like ``{"A": "text", "B": "text", "C": "text", "D": "text"}``.
- ``correct_answer`` is a TextField: ``"A"`` for MCQ, a short phrase for
  SHORT_ANSWER, or a marking rubric for LONG_ANSWER.

EXACT CHOICE STRINGS (documented here because Prompt 4 depends on them):
  question_type : MCQ | SHORT_ANSWER | LONG_ANSWER
  difficulty    : EASY | MEDIUM | HARD
  learner_level : BEGINNER | INTERMEDIATE | ADVANCED
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimestampedModel


# ---------------------------------------------------------------------------
# Choice definitions — import these anywhere else; never hardcode the strings.
# ---------------------------------------------------------------------------

class QuestionType(models.TextChoices):
    MCQ = "MCQ", _("Multiple Choice")
    MSQ = "MSQ", _("Multiple Select")
    ONE_WORD = "ONE_WORD", _("One Word")
    FILL_IN_THE_BLANKS = "FILL_IN_THE_BLANKS", _("Fill in the Blanks")
    MATCH_THE_FOLLOWING = "MATCH_THE_FOLLOWING", _("Match the Following")
    DIAGRAM_BASED = "DIAGRAM_BASED", _("Diagram Based")
    COMPREHENSION_BASED = "COMPREHENSION_BASED", _("Comprehension Based")
    SHORT_ANSWER = "SHORT_ANSWER", _("Short Answer")
    LONG_ANSWER = "LONG_ANSWER", _("Long Answer")


class Difficulty(models.TextChoices):
    EASY = "EASY", _("Easy")
    MEDIUM = "MEDIUM", _("Medium")
    HARD = "HARD", _("Hard")


class LearnerLevel(models.TextChoices):
    BEGINNER = "BEGINNER", _("Beginner")
    INTERMEDIATE = "INTERMEDIATE", _("Intermediate")
    ADVANCED = "ADVANCED", _("Advanced")


class BankSource(models.TextChoices):
    GLOBAL = "GLOBAL", _("Global")
    ORGANIZATION = "ORGANIZATION", _("Organization")
    TEACHER = "TEACHER", _("Teacher")


# ---------------------------------------------------------------------------
# Book
# ---------------------------------------------------------------------------

class Book(TimestampedModel):
    """
    A textbook / curriculum book.

    The demo seeds exactly ONE book; the schema handles more rows without
    schema changes (add rows, not columns).
    """

    title = models.CharField(
        max_length=255,
        help_text="Full title of the book.",
    )
    board = models.CharField(
        max_length=100,
        default="CBSE",
        db_index=True,
        help_text='Educational board, e.g. "CBSE", "ICSE", "State Board".',
    )
    subject = models.CharField(
        max_length=100,
        help_text='Subject area, e.g. "Mathematics", "Physics".',
    )
    grade = models.CharField(
        max_length=50,
        help_text='Grade / level, e.g. "Class 10", "Grade 12".',
    )
    publisher = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Publisher name (optional).",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive books are hidden from browsing.",
    )

    class Meta:
        ordering = ["board", "subject", "grade", "title"]
        verbose_name = "Book"
        verbose_name_plural = "Books"
        unique_together = [("title", "subject", "grade", "board")]

    def __str__(self) -> str:
        return f"[{self.board}] {self.title} ({self.subject} — {self.grade})"


# ---------------------------------------------------------------------------
# Chapter
# ---------------------------------------------------------------------------

class Chapter(TimestampedModel):
    """A chapter within a Book, with an explicit ordering field."""

    book = models.ForeignKey(
        Book,
        on_delete=models.CASCADE,
        related_name="chapters",
    )
    title = models.CharField(max_length=255)
    chapter_order = models.PositiveIntegerField(
        help_text="1-based ordering of chapters within the book.",
    )

    class Meta:
        ordering = ["book", "chapter_order"]
        verbose_name = "Chapter"
        verbose_name_plural = "Chapters"
        unique_together = [("book", "chapter_order")]

    def __str__(self) -> str:
        return f"Ch.{self.chapter_order}: {self.title} ({self.book.title})"


# ---------------------------------------------------------------------------
# Topic
# ---------------------------------------------------------------------------

class Topic(TimestampedModel):
    """
    A topic within a Chapter.

    The demo seeds 5 topics under the single chapter; more can be added
    as plain rows.
    """

    chapter = models.ForeignKey(
        Chapter,
        on_delete=models.CASCADE,
        related_name="topics",
    )
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["chapter", "name"]
        verbose_name = "Topic"
        verbose_name_plural = "Topics"

    def __str__(self) -> str:
        return f"{self.name} ({self.chapter.title})"


# ---------------------------------------------------------------------------
# Question
# ---------------------------------------------------------------------------

class Question(TimestampedModel):
    """
    A single question in the question bank.

    The ``filter_questions()`` helper in ``content/filters.py`` is the
    canonical way to query this model with combined filters.  Prompt 4
    (papers) imports that helper directly — never duplicate the filter
    logic in another app.
    """

    topic = models.ForeignKey(
        Topic,
        on_delete=models.CASCADE,
        related_name="questions",
    )
    question_text = models.TextField(help_text="Full text of the question.")
    question_type = models.CharField(
        max_length=30,
        choices=QuestionType.choices,
        db_index=True,
        help_text="MCQ | MSQ | ONE_WORD | FILL_IN_THE_BLANKS | MATCH_THE_FOLLOWING | DIAGRAM_BASED | COMPREHENSION_BASED | SHORT_ANSWER | LONG_ANSWER",
    )
    marks = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Marks awarded for a correct answer.",
    )
    difficulty = models.CharField(
        max_length=10,
        choices=Difficulty.choices,
        db_index=True,
        help_text="EASY | MEDIUM | HARD",
    )
    learner_level = models.CharField(
        max_length=15,
        choices=LearnerLevel.choices,
        db_index=True,
        help_text="BEGINNER | INTERMEDIATE | ADVANCED",
    )
    bank_source = models.CharField(
        max_length=20,
        choices=BankSource.choices,
        default=BankSource.GLOBAL,
        db_index=True,
        help_text="GLOBAL | ORGANIZATION | TEACHER",
    )
    school = models.ForeignKey(
        "schools.School",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="questions",
        help_text="Organization owning this question. Null for GLOBAL bank questions.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_questions",
        help_text="User who created or ingested this question.",
    )
    options = models.JSONField(
        null=True,
        blank=True,
        help_text=(
            'MCQ/MSQ choices as a dict e.g. {"A": "...", "B": "...", ...} or structured items. '
            "Null for free-text questions."
        ),
    )
    correct_answer = models.TextField(
        help_text=(
            '"A" / "B" / etc. for MCQ; list/array string for MSQ; short phrase for SHORT_ANSWER; '
            "marking rubric for LONG_ANSWER."
        ),
    )
    explanation = models.TextField(
        blank=True,
        default="",
        help_text="Solution explanation, hints, or marking guidance.",
    )
    source_reference = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Page number, section, or exercise reference (optional).",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive questions are excluded from paper-builder queries.",
    )

    class Meta:
        ordering = ["topic", "difficulty", "question_type"]
        verbose_name = "Question"
        verbose_name_plural = "Questions"
        # Composite index covering the most common combined-filter query pattern.
        indexes = [
            models.Index(
                fields=["topic", "question_type", "difficulty", "learner_level"],
                name="question_filter_idx",
            ),
            models.Index(
                fields=["is_active", "difficulty"],
                name="question_active_diff_idx",
            ),
            models.Index(
                fields=["bank_source", "school"],
                name="question_tenant_idx",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"[{self.bank_source}][{self.question_type}/{self.difficulty}] "
            f"{self.question_text[:60]}{'…' if len(self.question_text) > 60 else ''}"
        )


# ---------------------------------------------------------------------------
# QuestionVariant
# ---------------------------------------------------------------------------

class QuestionVariant(TimestampedModel):
    """
    A variant of a parent question (e.g. 2-mark, 3-mark, 5-mark variation,
    or alternate format of the core concept).

    Variant difficulty must match parent question difficulty.
    """

    parent_question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name="variants",
        help_text="The parent question this variant belongs to.",
    )
    variant_type = models.CharField(
        max_length=30,
        choices=QuestionType.choices,
        db_index=True,
        help_text="MCQ | MSQ | ONE_WORD | FILL_IN_THE_BLANKS | MATCH_THE_FOLLOWING | DIAGRAM_BASED | COMPREHENSION_BASED | SHORT_ANSWER | LONG_ANSWER",
    )
    marks = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Marks for this variant (e.g. 2.00, 3.00, 5.00).",
    )
    difficulty = models.CharField(
        max_length=10,
        choices=Difficulty.choices,
        help_text="Must match parent question difficulty.",
    )
    question_text = models.TextField(help_text="Full text of the variant question.")
    options = models.JSONField(
        null=True,
        blank=True,
        help_text="Options for choice-based questions (dict or list).",
    )
    correct_answer = models.TextField(help_text="Answer or marking rubric for this variant.")
    explanation = models.TextField(
        blank=True,
        default="",
        help_text="Explanation, hints, or marking guidance for this variant.",
    )

    class Meta:
        ordering = ["parent_question", "marks"]
        verbose_name = "Question Variant"
        verbose_name_plural = "Question Variants"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.parent_question_id:
            parent_diff = self.parent_question.difficulty
            if not self.difficulty:
                self.difficulty = parent_diff
            elif self.difficulty != parent_diff:
                raise ValidationError(
                    {
                        "difficulty": (
                            f"Variant difficulty '{self.difficulty}' must match parent question "
                            f"difficulty '{parent_diff}'."
                        )
                    }
                )

    def save(self, *args, **kwargs):
        if self.parent_question_id:
            parent_diff = self.parent_question.difficulty
            if not self.difficulty:
                self.difficulty = parent_diff
            elif self.difficulty != parent_diff:
                from django.core.exceptions import ValidationError

                raise ValidationError(
                    f"Variant difficulty '{self.difficulty}' must match parent question difficulty '{parent_diff}'."
                )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Variant [{self.variant_type} - {self.marks}m] for Q#{self.parent_question_id}"

