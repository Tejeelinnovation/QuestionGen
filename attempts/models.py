"""
Attempts app models.

Hierarchy: Delivery -> Attempt -> Answer

Design Principles:
- An Attempt is tied to exactly one Delivery (which is tied to one immutable PaperVersion).
- Scoring reads question data from the PaperVersion's question_snapshot (NOT live Question rows).
- Only ONLINE mode deliveries produce attempts via this API.
- Objective scoring only for this phase: MCQ auto-graded; SHORT_ANSWER and LONG_ANSWER
  remain pending manual review until evaluated by a teacher.
- One attempt per student per delivery (unique_together).
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import TimestampedModel


class AttemptStatus(models.TextChoices):
    NOT_STARTED = "NOT_STARTED", _("Not Started")
    IN_PROGRESS = "IN_PROGRESS", _("In Progress")
    SUBMITTED = "SUBMITTED", _("Submitted")
    EVALUATED = "EVALUATED", _("Evaluated")


class Attempt(TimestampedModel):
    """
    A student's sitting of a delivered question paper.
    """

    delivery = models.ForeignKey(
        "papers.Delivery",
        on_delete=models.CASCADE,
        related_name="attempts",
        help_text="Delivery being sat by the student.",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attempts",
        help_text="Student taking this test.",
    )
    status = models.CharField(
        max_length=20,
        choices=AttemptStatus.choices,
        default=AttemptStatus.NOT_STARTED,
        db_index=True,
        help_text="NOT_STARTED | IN_PROGRESS | SUBMITTED | EVALUATED",
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student initiated the attempt.",
    )
    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the student submitted the attempt.",
    )
    score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Computed score awarded so far.",
    )
    max_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0.0,
        help_text="Maximum possible marks copied from PaperVersion total_marks.",
    )
    warning_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of proctoring warnings (e.g. tab switches, blur) recorded during exam.",
    )
    proctoring_logs = models.JSONField(
        default=list,
        blank=True,
        help_text="Detailed audit log of proctoring events during this attempt.",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Attempt"
        verbose_name_plural = "Attempts"
        unique_together = [("delivery", "student")]

    def __str__(self) -> str:
        return f"Attempt #{self.pk} — {self.student.username} on {self.delivery}"


class Answer(TimestampedModel):
    """
    Per-question response submitted by a student.
    """

    attempt = models.ForeignKey(
        Attempt,
        on_delete=models.CASCADE,
        related_name="answers",
        help_text="Parent attempt.",
    )
    question_id = models.IntegerField(
        help_text="ID of the question from the snapshot (not live FK).",
    )
    question_snapshot = models.JSONField(
        help_text="Snapshot copy of that specific question at delivery creation time.",
    )
    student_response = models.TextField(
        blank=True,
        default="",
        help_text="Student response (e.g. choice letter 'A' or text).",
    )
    is_correct = models.BooleanField(
        null=True,
        blank=True,
        help_text="True if correct, False if incorrect, null if pending manual review.",
    )
    marks_awarded = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Marks awarded for this answer.",
    )

    class Meta:
        ordering = ["id"]
        verbose_name = "Answer"
        verbose_name_plural = "Answers"
        unique_together = [("attempt", "question_id")]

    def __str__(self) -> str:
        return f"Answer #{self.pk} (Q{self.question_id}) on Attempt #{self.attempt_id}"
