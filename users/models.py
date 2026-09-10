"""
Users app models.

Three models live here:
  - User          — the single user entity for all roles
  - Capability    — an atomic permission right (fixed set, stored in DB)
  - UserCapability — the many-to-many grant record (source of truth for authz)

DESIGN PRINCIPLE: There is NO separate model per role. "Role" (Super Admin /
School Admin / Teacher / Student) is only a computed display label derived from
which Capabilities a User has been granted.  All access-control decisions MUST
check UserCapability — never branch on a stored role field.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


# ---------------------------------------------------------------------------
# Capability choices — the complete, bounded set of atomic permissions.
# Additions must be documented in PROJECT_CONTEXT.md before landing.
# ---------------------------------------------------------------------------
class CapabilityName(models.TextChoices):
    CREATE_SCHOOL = "CREATE_SCHOOL", _("Create School")
    CREATE_SCHOOL_ADMIN = "CREATE_SCHOOL_ADMIN", _("Create School Admin")
    CREATE_TEACHER = "CREATE_TEACHER", _("Create Teacher")
    CREATE_STUDENT = "CREATE_STUDENT", _("Create Student")
    GENERATE_SELECT_QUESTIONS = "GENERATE_SELECT_QUESTIONS", _("Generate / Select Questions")
    CREATE_PAPER = "CREATE_PAPER", _("Create Paper")
    ASSIGN_TEST = "ASSIGN_TEST", _("Assign Test")
    ATTEMPT_TEST = "ATTEMPT_TEST", _("Attempt Test")
    VIEW_OWN_RESULT = "VIEW_OWN_RESULT", _("View Own Result")
    VIEW_SCHOOL_WIDE_CONTROLS = "VIEW_SCHOOL_WIDE_CONTROLS", _("View School-Wide Controls")


class Capability(models.Model):
    """
    Represents one atomic permission right in the system.

    Rows are pre-populated by a data migration; application code must never
    create new Capability rows at runtime — the set is intentionally fixed
    and bounded. This gives FK-level integrity in UserCapability and lets us
    query "who has capability X?" efficiently.
    """

    name = models.CharField(
        max_length=60,
        unique=True,
        choices=CapabilityName.choices,
        help_text="Identifier for this capability (must match CapabilityName choices).",
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Capability"
        verbose_name_plural = "Capabilities"

    def __str__(self) -> str:
        return self.get_name_display()


class User(AbstractUser):
    """
    Single User model for the entire system.

    Added fields
    ------------
    school     : FK to School; null for Super Admins who span all schools.
    created_by : Self-referencing FK tracking which user created this user.
                 Used for scope enforcement: a Teacher can only manage
                 students whose created_by chain leads back to them.

    Role is NEVER stored here.  To determine a user's display role, call
    ``user.role_label``.  To check whether a user can perform an action,
    call ``user.has_capability("CAPABILITY_NAME")``.
    """

    # Null = Super Admin (no school boundary).
    school = models.ForeignKey(
        "schools.School",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
        help_text="School this user belongs to. Null → Super Admin (no school boundary).",
    )

    # Tracks who created this user — used for hierarchical scope enforcement.
    created_by = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_users",
        help_text="User who created this account (for scope enforcement).",
    )

    # Explicit hierarchical role (Super Admin, School Admin, Teacher, Student)
    role = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Explicit hierarchical role: Super Admin, School Admin, Teacher, Student.",
    )

    mobile_number = models.CharField(
        max_length=15,
        default="+919876543210",
        help_text="Indian mobile number with +91 country code and 10 digits.",
    )

    objects = UserManager()

    class Meta(AbstractUser.Meta):
        verbose_name = "User"
        verbose_name_plural = "Users"

    # ------------------------------------------------------------------
    # Capability helpers
    # ------------------------------------------------------------------

    def has_capability(self, capability_name: str) -> bool:
        """
        Return True if this user has been granted the named capability.

        Parameters
        ----------
        capability_name:
            One of the ``CapabilityName`` string values, e.g.
            ``"CREATE_TEACHER"``.
        """
        return self.user_capabilities.filter(
            capability__name=capability_name
        ).exists()

    def get_capabilities(self):
        """Return QuerySet of Capability objects granted to this user."""
        return Capability.objects.filter(
            user_capabilities__user=self
        ).distinct()

    # ------------------------------------------------------------------
    # Role label — display & scope resolution
    # ------------------------------------------------------------------

    @property
    def role_label(self) -> str:
        """
        Role label resolved from explicit role field if set, or computed
        from capabilities if not set (legacy fallback).
        """
        if self.role:
            role_map = {
                "super_admin": "Super Admin",
                "school_admin": "School Admin",
                "teacher": "Teacher",
                "student": "Student",
                "Super Admin": "Super Admin",
                "School Admin": "School Admin",
                "Teacher": "Teacher",
                "Student": "Student",
            }
            return role_map.get(self.role, self.role)

        caps = set(
            self.user_capabilities.select_related("capability")
            .values_list("capability__name", flat=True)
        )

        if CapabilityName.CREATE_SCHOOL in caps:
            return "Super Admin"
        if CapabilityName.VIEW_SCHOOL_WIDE_CONTROLS in caps and self.school_id:
            return "School Admin"
        if CapabilityName.CREATE_STUDENT in caps and self.school_id:
            return "Teacher"
        if CapabilityName.ATTEMPT_TEST in caps:
            return "Student"
        return "Custom"


class UserCapability(models.Model):
    """
    Many-to-many grant record between a User and a Capability.

    This is the source of truth for authorisation.  Granting or revoking
    a capability is done by creating or deleting rows here.
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="user_capabilities",
    )
    capability = models.ForeignKey(
        Capability,
        on_delete=models.CASCADE,
        related_name="user_capabilities",
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="capabilities_granted",
        help_text="User who granted this capability; null for bootstrap/system grants.",
    )

    class Meta:
        unique_together = [("user", "capability")]
        ordering = ["capability__name"]
        verbose_name = "User Capability"
        verbose_name_plural = "User Capabilities"

    def __str__(self) -> str:
        return f"{self.user.username} → {self.capability.name}"
