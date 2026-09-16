"""
Schools app models.

`School` is the multi-tenancy boundary — every user except Super Admins
belongs to exactly one School. All content (papers, questions, students)
is implicitly scoped within the school that owns it.
"""

from django.conf import settings
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

    # Super Admin configurable capacity limits
    max_students = models.PositiveIntegerField(
        default=500,
        help_text="Maximum student enrollment capacity permitted by Super Admin.",
    )
    max_teachers = models.PositiveIntegerField(
        default=50,
        help_text="Maximum teacher accounts capacity permitted by Super Admin.",
    )

    # Organization-level Question Bank capability configuration
    question_bank_enabled = models.BooleanField(
        default=False,
        help_text="Whether Question Bank capability is enabled for this organization by Super Admin.",
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


class ClassSection(models.Model):
    """
    Represents an academic class and section division within a school
    (e.g., Standard 8 Division A -> 'Class 8-A').
    """

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name="classes",
        help_text="School tenant owning this class division.",
    )
    standard = models.PositiveSmallIntegerField(
        help_text="Standard / Grade level (e.g. 8, 9, 10).",
    )
    section = models.CharField(
        max_length=5,
        help_text="Division or section letter (e.g. 'A', 'B', 'C', up to 'J').",
    )
    max_students = models.PositiveIntegerField(
        default=40,
        help_text="Maximum student capacity allowed in this division (set by School Admin).",
    )
    class_teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="managed_class",
        help_text="Main faculty instructor acting as the Class Teacher.",
    )
    class_teacher_subject = models.CharField(
        max_length=100,
        blank=True,
        default="General",
        help_text="Primary subject taught by the Class Teacher (e.g., Mathematics).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["standard", "section"]
        unique_together = ("school", "standard", "section")
        verbose_name = "Class Section"
        verbose_name_plural = "Class Sections"

    @property
    def name(self) -> str:
        return f"Class {self.standard}-{self.section}"

    def __str__(self) -> str:
        return f"{self.name} ({self.school.name})"


class ClassSubjectTeacher(models.Model):
    """
    Mapping between a ClassSection, an academic subject, and the assigned faculty teacher.
    """

    class_section = models.ForeignKey(
        ClassSection,
        on_delete=models.CASCADE,
        related_name="subject_teachers",
        help_text="Class division receiving instruction.",
    )
    subject = models.CharField(
        max_length=100,
        help_text="Subject name (e.g., Mathematics, Science, English, Social Science).",
    )
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teaching_assignments",
        help_text="Assigned faculty instructor for this subject.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["subject"]
        unique_together = ("class_section", "subject")
        verbose_name = "Class Subject Teacher"
        verbose_name_plural = "Class Subject Teachers"

    def __str__(self) -> str:
        return f"{self.class_section.name} — {self.subject} ({self.teacher.username})"

