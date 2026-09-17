"""
Capability default grants.

Convenience functions that grant a standard capability set for each
conceptual user type.  The underlying system still supports arbitrary
custom grants — these functions are sugar, not policy.

IMPORTANT: These functions do NOT branch on a role field.  They simply
call the same ``UserCapability.objects.get_or_create()`` used everywhere
else, meaning a user can have any combination of capabilities regardless
of how they were originally set up.

Usage::

    from users.capability_defaults import grant_teacher_defaults
    from core.audit import log_action

    grant_teacher_defaults(user=new_teacher, granted_by=school_admin)
    log_action(school_admin, "capability.bulk_granted", new_teacher,
               metadata={"profile": "teacher"})
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from users.models import User


def _grant(user: "User", capability_name: str, granted_by: "User | None") -> None:
    """
    Internal helper — create a UserCapability row if it doesn't exist yet.
    Silently skips if already granted (idempotent).
    """
    # Late import to avoid circular issues when this module is imported early.
    from users.models import Capability, UserCapability  # noqa: PLC0415

    try:
        cap = Capability.objects.get(name=capability_name)
    except Capability.DoesNotExist:
        raise ValueError(
            f"Capability '{capability_name}' does not exist. "
            "Run the data migration to populate capabilities."
        )

    UserCapability.objects.get_or_create(
        user=user,
        capability=cap,
        defaults={"granted_by": granted_by},
    )


def grant_super_admin_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Grant Super Admin capabilities.

    Super Admin can create schools/coaching classes, students, and QBMs,
    but cannot directly create teachers. Teacher creation belongs to
    School / Coaching Class Admins.
    """
    from users.models import CapabilityName  # noqa: PLC0415

    for cap in CapabilityName.values:
        if cap == CapabilityName.CREATE_TEACHER:
            continue
        _grant(user, cap, granted_by)


def grant_school_admin_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Typical School Admin capability set.

    Grants: CREATE_TEACHER, CREATE_STUDENT, VIEW_SCHOOL_WIDE_CONTROLS
    """
    from users.models import CapabilityName  # noqa: PLC0415

    for cap in [
        CapabilityName.CREATE_TEACHER,
        CapabilityName.CREATE_STUDENT,
        CapabilityName.VIEW_SCHOOL_WIDE_CONTROLS,
    ]:
        _grant(user, cap, granted_by)


def grant_teacher_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Typical Teacher capability set.

    Grants: CREATE_STUDENT, CREATE_PAPER, ASSIGN_TEST.
    GENERATE_SELECT_QUESTIONS (Question Bank) is granted only if
    Question Bank capability is enabled for the organization.
    """
    from users.models import CapabilityName  # noqa: PLC0415

    caps = [
        CapabilityName.CREATE_STUDENT,
        CapabilityName.CREATE_PAPER,
        CapabilityName.ASSIGN_TEST,
    ]

    # Only include Question Bank capability if organization has it enabled
    if user.school and getattr(user.school, "question_bank_enabled", False):
        caps.append(CapabilityName.GENERATE_SELECT_QUESTIONS)

    for cap in caps:
        _grant(user, cap, granted_by)


def grant_student_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Typical Student capability set.

    Grants: ATTEMPT_TEST, VIEW_OWN_RESULT
    """
    from users.models import CapabilityName  # noqa: PLC0415

    for cap in [
        CapabilityName.ATTEMPT_TEST,
        CapabilityName.VIEW_OWN_RESULT,
    ]:
        _grant(user, cap, granted_by)


def grant_qbm_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Typical Question Bank Manager (QBM) capability set.

    Grants: INGEST_GLOBAL_QUESTIONS, GENERATE_SELECT_QUESTIONS
    """
    from users.models import CapabilityName  # noqa: PLC0415

    for cap in [
        CapabilityName.INGEST_GLOBAL_QUESTIONS,
        CapabilityName.GENERATE_SELECT_QUESTIONS,
        CapabilityName.DATA_ENTRY_OPERATOR,
        CapabilityName.VALIDATOR,
    ]:
        _grant(user, cap, granted_by)


def grant_deo_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Data Entry Operator (DEO) capability set.

    Grants: DATA_ENTRY_OPERATOR.
    GENERATE_SELECT_QUESTIONS is included if the school has question_bank_enabled.
    """
    from users.models import CapabilityName  # noqa: PLC0415

    caps = [CapabilityName.DATA_ENTRY_OPERATOR]
    if user.school and getattr(user.school, "question_bank_enabled", False):
        caps.append(CapabilityName.GENERATE_SELECT_QUESTIONS)

    for cap in caps:
        _grant(user, cap, granted_by)


def grant_validator_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Question Validator capability set.

    Grants: VALIDATOR.
    GENERATE_SELECT_QUESTIONS is included if the school has question_bank_enabled.
    """
    from users.models import CapabilityName  # noqa: PLC0415

    caps = [CapabilityName.VALIDATOR]
    if user.school and getattr(user.school, "question_bank_enabled", False):
        caps.append(CapabilityName.GENERATE_SELECT_QUESTIONS)

    for cap in caps:
        _grant(user, cap, granted_by)


def grant_deo_and_validator_defaults(user: "User", granted_by: "User | None" = None) -> None:
    """
    Dual-role DEO & Validator capability set for single-person assignment (PDF Section 5).

    Grants: DATA_ENTRY_OPERATOR, VALIDATOR.
    GENERATE_SELECT_QUESTIONS is included if the school has question_bank_enabled.
    """
    from users.models import CapabilityName  # noqa: PLC0415

    caps = [
        CapabilityName.DATA_ENTRY_OPERATOR,
        CapabilityName.VALIDATOR,
    ]
    if user.school and getattr(user.school, "question_bank_enabled", False):
        caps.append(CapabilityName.GENERATE_SELECT_QUESTIONS)

    for cap in caps:
        _grant(user, cap, granted_by)

