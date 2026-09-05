"""
Permissions and scoping helpers for the attempts app.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework.permissions import BasePermission

if TYPE_CHECKING:
    from attempts.models import Attempt
    from papers.models import Delivery
    from users.models import User


class CanAttemptTest(BasePermission):
    """Requires the user to have the ATTEMPT_TEST capability."""

    message = "You do not have the 'ATTEMPT_TEST' capability required for this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_capability("ATTEMPT_TEST"))


def can_teacher_access_delivery_results(user: "User", delivery: "Delivery") -> bool:
    """
    Check if user has teacher/admin rights to view results for this delivery.
    """
    if not user or not user.is_authenticated:
        return False

    if user.school_id is None:
        return True

    if user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS") and delivery.paper_version.paper.school_id == user.school_id:
        return True

    if (user.has_capability("ASSIGN_TEST") or user.has_capability("CREATE_PAPER")) and delivery.created_by_id == user.id:
        return True

    return False


def can_access_attempt_result(user: "User", attempt: "Attempt") -> bool:
    """
    Check if caller can view this attempt's result:
    - Owning student
    - Teacher who created the delivery
    - School Admin of the school
    - Super Admin
    """
    if not user or not user.is_authenticated:
        return False

    if attempt.student_id == user.id:
        return True

    return can_teacher_access_delivery_results(user, attempt.delivery)
