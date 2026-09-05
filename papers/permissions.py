"""
Permissions and scoping helpers for the papers app.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework.permissions import BasePermission

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from users.models import User


class CanCreatePaper(BasePermission):
    """Requires the user to have the CREATE_PAPER capability."""

    message = "You do not have the 'CREATE_PAPER' capability required for this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_capability("CREATE_PAPER"))


class CanAssignTest(BasePermission):
    """Requires the user to have the ASSIGN_TEST capability."""

    message = "You do not have the 'ASSIGN_TEST' capability required for this action."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.has_capability("ASSIGN_TEST"))


def get_scoped_papers(user: "User") -> "QuerySet":
    """
    Return the QuerySet of Paper objects accessible to the given user.

    - Super Admin: sees all papers across all schools.
    - School Admin (VIEW_SCHOOL_WIDE_CONTROLS): sees all papers in their school.
    - Teacher (CREATE_PAPER): sees only papers they created.
    - Student / others: cannot see any papers.
    """
    from .models import Paper  # noqa: PLC0415

    base_qs = Paper.objects.select_related("chapter", "created_by", "school")

    if not user or not user.is_authenticated:
        return Paper.objects.none()

    if user.school_id is None:
        return base_qs

    if user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS"):
        return base_qs.filter(school=user.school)

    if user.has_capability("CREATE_PAPER"):
        return base_qs.filter(created_by=user)

    return Paper.objects.none()


def get_scoped_deliveries(user: "User") -> "QuerySet":
    """
    Return the QuerySet of Delivery objects accessible to the given user.

    - Super Admin: sees all deliveries.
    - School Admin (VIEW_SCHOOL_WIDE_CONTROLS): sees deliveries within their school.
    - Teacher (ASSIGN_TEST / CREATE_PAPER): sees deliveries they created.
    - Student: sees ONLY deliveries where they are in assigned_students.
    """
    from .models import Delivery  # noqa: PLC0415

    base_qs = Delivery.objects.select_related(
        "paper_version",
        "paper_version__paper",
        "paper_version__paper__chapter",
        "created_by",
    ).prefetch_related("assigned_students")

    if not user or not user.is_authenticated:
        return Delivery.objects.none()

    if user.school_id is None:
        return base_qs

    if user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS"):
        return base_qs.filter(paper_version__paper__school=user.school)

    if user.has_capability("ASSIGN_TEST") or user.has_capability("CREATE_PAPER"):
        return base_qs.filter(created_by=user)

    if user.has_capability("ATTEMPT_TEST"):
        return base_qs.filter(assigned_students=user)

    return Delivery.objects.none()
