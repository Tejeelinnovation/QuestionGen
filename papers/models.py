"""
Papers app models.

Hierarchy: Paper -> PaperVersion -> Delivery

Design Principles:
- A PaperVersion, once created, is IMMUTABLE once finalized.
- Each version stores its OWN snapshot of question IDs + metadata at creation time
  (so results remain reproducible even if a Question is edited/disabled later).
- Total marks is a derived/stored value calculated and stored on save.
- Print and Online deliveries originate from the same persisted PaperVersion.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimestampedModel


class PaperStatus(models.TextChoices):
    DRAFT = "DRAFT", _("Draft")
    FINALIZED = "FINALIZED", _("Finalized")


class VersionStatus(models.TextChoices):
    DRAFT = "DRAFT", _("Draft")
    FINALIZED = "FINALIZED", _("Finalized")


class DeliveryMode(models.TextChoices):
    PRINT = "PRINT", _("Print")
    ONLINE = "ONLINE", _("Online")


class DeliveryStatus(models.TextChoices):
    DRAFT = "DRAFT", _("Draft")
    ACTIVE = "ACTIVE", _("Active")
    CLOSED = "CLOSED", _("Closed")


def get_next_version_label(paper: Paper) -> str:
    """
    Generate sequential alphabetical version labels: A, B, ..., Z, AA, AB, etc.
    """
    existing_labels = set(paper.versions.values_list("version_label", flat=True))
    idx = 0
    while True:
        # Convert index to base-26 column letters
        label = ""
        n = idx
        while True:
            label = chr(ord("A") + (n % 26)) + label
            n = n // 26 - 1
            if n < 0:
                break
        if label not in existing_labels:
            return label
        idx += 1


class Paper(TimestampedModel):
    """
    A Question Paper shell / container.
    """

    title = models.CharField(
        max_length=255,
        help_text="Title of the paper (e.g. 'Class 10 Real Numbers Unit Test').",
    )
    instructions = models.TextField(
        blank=True,
        default="",
        help_text="General instructions displayed to students.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="papers",
        help_text="User who created this paper.",
    )
    school = models.ForeignKey(
        "schools.School",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="papers",
        help_text="School this paper belongs to (inherited from creator for scoping).",
    )
    chapter = models.ForeignKey(
        "content.Chapter",
        on_delete=models.CASCADE,
        related_name="papers",
        help_text="The curriculum chapter this paper covers.",
    )
    status = models.CharField(
        max_length=20,
        choices=PaperStatus.choices,
        default=PaperStatus.DRAFT,
        db_index=True,
        help_text="DRAFT | FINALIZED",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Paper"
        verbose_name_plural = "Papers"

    def __str__(self) -> str:
        return f"{self.title} ({self.get_status_display()})"


class PaperVersion(TimestampedModel):
    """
    An immutable version snapshot of a Paper.
    """

    paper = models.ForeignKey(
        Paper,
        on_delete=models.CASCADE,
        related_name="versions",
        help_text="The parent Paper container.",
    )
    version_label = models.CharField(
        max_length=10,
        help_text='Auto-incremented version label, e.g. "A", "B", "C".',
    )
    question_snapshot = models.JSONField(
        default=list,
        help_text=(
            "Ordered list of question dicts captured at creation time: "
            "[{question_id, question_text, question_type, marks, difficulty, options, correct_answer}]."
        ),
    )
    total_marks = models.PositiveIntegerField(
        default=0,
        help_text="Stored total marks, computed from question_snapshot at save time.",
    )
    constraints_used = models.JSONField(
        default=dict,
        blank=True,
        help_text="The filters and constraints that produced this version (for traceability).",
    )
    status = models.CharField(
        max_length=20,
        choices=VersionStatus.choices,
        default=VersionStatus.DRAFT,
        db_index=True,
        help_text="DRAFT | FINALIZED",
    )

    class Meta:
        ordering = ["paper", "version_label"]
        verbose_name = "Paper Version"
        verbose_name_plural = "Paper Versions"
        unique_together = [("paper", "version_label")]

    def __str__(self) -> str:
        return f"{self.paper.title} — Version {self.version_label} ({self.total_marks} marks)"

    def clean(self) -> None:
        super().clean()
        if self.pk:
            original = PaperVersion.objects.filter(pk=self.pk).first()
            if original and original.status == VersionStatus.FINALIZED:
                if original.question_snapshot != self.question_snapshot:
                    raise ValidationError(
                        "Cannot modify question_snapshot of a finalized PaperVersion."
                    )

    def save(self, *args: Any, **kwargs: Any) -> None:
        # Recompute total_marks from question_snapshot
        if self.question_snapshot:
            self.total_marks = int(
                round(sum(float(q.get("marks", 0)) for q in self.question_snapshot))
            )
        else:
            self.total_marks = 0

        self.full_clean()
        super().save(*args, **kwargs)


class Delivery(TimestampedModel):
    """
    A delivery record configuring how a PaperVersion is given to students.
    Supports both PRINT and ONLINE modes.
    """

    paper_version = models.ForeignKey(
        PaperVersion,
        on_delete=models.CASCADE,
        related_name="deliveries",
        help_text="The specific PaperVersion being delivered.",
    )
    mode = models.CharField(
        max_length=20,
        choices=DeliveryMode.choices,
        db_index=True,
        help_text="PRINT | ONLINE",
    )
    assigned_students = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="assigned_deliveries",
        help_text="Students assigned to this test (required for ONLINE mode).",
    )
    status = models.CharField(
        max_length=20,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.ACTIVE,
        db_index=True,
        help_text="DRAFT | ACTIVE | CLOSED",
    )
    available_from = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Start of the availability window (optional).",
    )
    available_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="End of the availability window (optional).",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_deliveries",
        help_text="The user (teacher/admin) who created this delivery.",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Delivery"
        verbose_name_plural = "Deliveries"

    def __str__(self) -> str:
        return (
            f"Delivery #{self.pk} ({self.mode}) — "
            f"{self.paper_version.paper.title} [v{self.paper_version.version_label}]"
        )
