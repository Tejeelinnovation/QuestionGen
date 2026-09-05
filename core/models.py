"""
Core app models.

Provides:
  - TimestampedModel  — abstract base with created_at / updated_at
  - AuditLog          — immutable audit trail for security-sensitive actions
"""

from django.db import models
from django.conf import settings


class TimestampedModel(models.Model):
    """
    Abstract base model that adds created_at / updated_at timestamps.

    All domain models should extend this so we get consistent audit fields
    without repeating the definition.
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class AuditLog(models.Model):
    """
    Append-only audit trail.

    Every security-sensitive action (user creation, capability grant/revoke,
    login, etc.) MUST write an entry here. Rows must never be updated or
    deleted — they are evidence.

    Fields
    ------
    user        : Who performed the action. Nullable so system-initiated
                  actions (e.g. bootstrap) can be recorded.
    action      : Short snake_case verb, e.g. "user.created",
                  "capability.granted", "capability.revoked", "user.login".
    target_type : Django content-type label of the affected object,
                  e.g. "users.user", "schools.school".
    target_id   : String representation of the affected object's PK.
    timestamp   : When the action occurred (set automatically).
    metadata    : Arbitrary JSON for extra context (old value, new value,
                  IP address, etc.).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
        help_text="User who performed the action; null for system actions.",
    )
    action = models.CharField(
        max_length=100,
        db_index=True,
        help_text='Short snake_case verb, e.g. "user.created".',
    )
    target_type = models.CharField(
        max_length=100,
        db_index=True,
        help_text='App-label.model-name, e.g. "users.user".',
    )
    target_id = models.CharField(
        max_length=255,
        db_index=True,
        help_text="String PK of the affected object.",
    )
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Arbitrary extra context (old/new values, IP, etc.).",
    )

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"
        # Composite index for common "show all actions on object X" query.
        indexes = [
            models.Index(fields=["target_type", "target_id"], name="auditlog_target_idx"),
        ]

    def __str__(self) -> str:
        actor = self.user_id or "system"
        return f"[{self.timestamp}] {actor} → {self.action} on {self.target_type}:{self.target_id}"
