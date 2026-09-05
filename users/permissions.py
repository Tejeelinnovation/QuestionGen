"""
DRF permission classes for the Question Generation System.

All enforcement is capability-based.  Never branch on role labels here.

Classes
-------
HasCapability(capability_name)
    Factory that returns a DRF permission class requiring the requesting
    user to hold the named capability.

IsWithinSchoolScope
    Ensures that the requesting user's school matches the target object's
    school (used on object-level checks).

IsWithinCreatedByScope
    Ensures the requesting user is the direct ``created_by`` of the target
    user (for Teacher → Student management).

ScopedUserQuerysetMixin
    Mixin for ViewSets that filters the User queryset to only the users the
    caller is permitted to see, based on their capabilities and scope.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission, IsAuthenticated


# ---------------------------------------------------------------------------
# HasCapability — the primary gate for every action
# ---------------------------------------------------------------------------

def HasCapability(capability_name: str):
    """
    Return a DRF permission class that requires the named capability.

    Usage in a view::

        permission_classes = [IsAuthenticated, HasCapability("CREATE_TEACHER")]

    This is a factory function (not a class) so that the capability name is
    baked in at view-definition time, making the intent explicit and readable.
    """

    class _HasCapability(BasePermission):
        message = f"You do not have the '{capability_name}' capability required for this action."

        def has_permission(self, request, view) -> bool:
            if not request.user or not request.user.is_authenticated:
                return False
            return request.user.has_capability(capability_name)

    _HasCapability.__name__ = f"HasCapability_{capability_name}"
    _HasCapability.__qualname__ = f"HasCapability_{capability_name}"
    return _HasCapability


# ---------------------------------------------------------------------------
# Scope helpers — object-level checks
# ---------------------------------------------------------------------------

class IsWithinSchoolScope(BasePermission):
    """
    Object-level: request.user's school must match obj.school.

    Transparent to Super Admins (no school boundary → school is None).
    """

    message = "You do not have permission to act on users from a different school."

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # Super Admins have no school boundary.
        if user.school_id is None:
            return True
        # obj may be a User or any model with a .school FK.
        obj_school_id = getattr(obj, "school_id", None)
        return obj_school_id == user.school_id


class IsWithinCreatedByScope(BasePermission):
    """
    Object-level: request.user must be the direct ``created_by`` of obj.

    Used so Teachers can only act on students they personally created.
    Super Admins and School Admins bypass this check (they use school scope).
    """

    message = "You can only manage users that you created directly."

    def has_object_permission(self, request, view, obj) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # Super Admins (no school) bypass created_by scope.
        if user.school_id is None:
            return True
        # School Admins (VIEW_SCHOOL_WIDE_CONTROLS) act within school scope, not
        # created_by scope — they bypass this check too.
        if user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS"):
            return True
        # For teachers: check direct created_by link.
        return getattr(obj, "created_by_id", None) == user.pk


# ---------------------------------------------------------------------------
# ScopedUserQuerysetMixin
# ---------------------------------------------------------------------------

class ScopedUserQuerysetMixin:
    """
    ViewSet mixin that restricts the User queryset to the caller's scope.

    Rules (first match wins):
      1. No school (Super Admin) → sees all users.
      2. Has VIEW_SCHOOL_WIDE_CONTROLS → sees all users in own school.
      3. Has CREATE_STUDENT (Teacher) → sees only users they created_by.
      4. Otherwise → sees only themselves (e.g. a student viewing their own profile).

    Use this mixin in ViewSets like so::

        class UserViewSet(ScopedUserQuerysetMixin, ModelViewSet):
            ...
            def get_queryset(self):
                return self.get_scoped_queryset()
    """

    def get_scoped_queryset(self):
        from users.models import User  # noqa: PLC0415

        user = self.request.user
        base_qs = User.objects.select_related("school", "created_by").prefetch_related(
            "user_capabilities__capability"
        )

        # Super Admin — no school boundary.
        if user.school_id is None:
            return base_qs

        # School Admin — school-wide visibility.
        if user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS"):
            return base_qs.filter(school=user.school)

        # Teacher — only students they created.
        if user.has_capability("CREATE_STUDENT"):
            return base_qs.filter(created_by=user)

        # Default — own record only.
        return base_qs.filter(pk=user.pk)
