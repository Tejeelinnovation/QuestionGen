"""
Schools app models.

`School` is the multi-tenancy boundary — every user except Super Admins
belongs to exactly one School. All content (papers, questions, students)
is implicitly scoped within the school that owns it.
"""

from django.db import models


class School(models.Model):
    """
    Represents an educational institution / organisation.

    Acts as the primary tenant boundary: School Admins, Teachers, and
    Students all have a FK to their School. Super Admins have no School
    (school=None) and can see across all schools.
    """

    name = models.CharField(
        max_length=255,
        unique=True,
        help_text="Full legal / display name of the school.",
    )

    # Reserved for future school-level configuration (e.g. logo URL, timezone,
    # feature flags). Stored as JSON so schema changes don't require migrations.
    config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Arbitrary school-level configuration (feature flags, etc.).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "School"
        verbose_name_plural = "Schools"

    def __str__(self) -> str:
        return self.name
