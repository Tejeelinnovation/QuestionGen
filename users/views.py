"""
Views for the users app.

Endpoints
---------
POST   /api/auth/login/                     → LoginView
POST   /api/auth/logout/                    → LogoutView
GET    /api/auth/me/                        → MeView
GET    /api/users/                          → UserViewSet.list
POST   /api/users/                          → UserViewSet.create
PATCH  /api/users/{id}/                     → UserViewSet.partial_update
POST   /api/users/{id}/permissions/         → UserViewSet.grant_permission
DELETE /api/users/{id}/permissions/{cap}/   → UserViewSet.revoke_permission
"""

from __future__ import annotations

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.audit import log_action
from .models import Capability, CapabilityName, User, UserCapability
from .permissions import (
    HasCapability,
    IsWithinCreatedByScope,
    IsWithinSchoolScope,
    ScopedUserQuerysetMixin,
)
from .serializers import (
    CapabilityGrantSerializer,
    CreateUserSerializer,
    LoginSerializer,
    UpdateUserSerializer,
    UserSerializer,
)


# ---------------------------------------------------------------------------
# Auth views
# ---------------------------------------------------------------------------

class LoginView(APIView):
    """
    POST /api/auth/login/

    Body: { "username": "...", "password": "..." }
    Response: { "access": "...", "refresh": "..." }
    """

    permission_classes = []  # Public endpoint

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)

        log_action(user, "user.login", user, metadata={"username": user.username})

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    POST /api/auth/logout/

    Blacklists the provided refresh token (requires token_blacklist app).
    Body: { "refresh": "<refresh_token>" }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        log_action(request.user, "user.logout", request.user)
        return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)


class MeView(APIView):
    """
    GET /api/auth/me/

    Returns the authenticated user's profile, capabilities, and role label.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# User ViewSet
# ---------------------------------------------------------------------------

class UserViewSet(ScopedUserQuerysetMixin, viewsets.GenericViewSet):
    """
    Handles user listing, creation, partial update, and capability management.

    Scope enforcement is applied at queryset level (ScopedUserQuerysetMixin)
    and at object level (IsWithinSchoolScope / IsWithinCreatedByScope).
    """

    serializer_class = UserSerializer

    def get_queryset(self):
        return self.get_scoped_queryset()

    def get_permissions(self):
        """
        Return appropriate permissions based on the current action.
        """
        if self.action == "list":
            return [IsAuthenticated()]

        if self.action == "create":
            # Permission class is dynamically selected in the create method
            # based on the requested profile, so we only require authentication here.
            return [IsAuthenticated()]

        if self.action == "partial_update":
            return [IsAuthenticated(), IsWithinSchoolScope(), IsWithinCreatedByScope()]

        if self.action == "grant_permission":
            return [IsAuthenticated(), HasCapability("CREATE_SCHOOL_ADMIN")()]

        if self.action == "revoke_permission":
            return [IsAuthenticated(), HasCapability("CREATE_SCHOOL_ADMIN")()]

        return [IsAuthenticated()]

    # ------------------------------------------------------------------
    # list — GET /api/users/
    # ------------------------------------------------------------------

    def list(self, request):
        """Return users within the caller's scope."""
        queryset = self.get_queryset()
        serializer = UserSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    # ------------------------------------------------------------------
    # create — POST /api/users/
    # ------------------------------------------------------------------

    # Mapping: requested profile → required capability the CALLER must have
    _PROFILE_TO_REQUIRED_CAP = {
        "school_admin": CapabilityName.CREATE_SCHOOL_ADMIN,
        "teacher": CapabilityName.CREATE_TEACHER,
        "student": CapabilityName.CREATE_STUDENT,
    }

    def create(self, request):
        """
        Create a new user, enforcing capability gating.

        The caller must have the CREATE_* capability that matches the
        requested profile.  School Admins and Teachers are further
        constrained to create within their own school.
        """
        profile = request.data.get("profile")
        required_cap = self._PROFILE_TO_REQUIRED_CAP.get(profile)

        if not required_cap:
            return Response(
                {"detail": f"Invalid or missing 'profile'. Choose from: {list(self._PROFILE_TO_REQUIRED_CAP)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Capability gate — enforced server-side regardless of UI.
        if not request.user.has_capability(required_cap):
            return Response(
                {"detail": f"You do not have the '{required_cap}' capability required to create this user type."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # School scope gate: non-Super-Admins can only create users in their own school.
        if request.user.school_id is not None:
            incoming_school = request.data.get("school")
            if str(incoming_school) != str(request.user.school_id):
                return Response(
                    {"detail": "You can only create users within your own school."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = CreateUserSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            user = serializer.save(created_by=request.user)
            log_action(
                request.user,
                "user.created",
                user,
                metadata={
                    "username": user.username,
                    "profile": profile,
                    "school_id": user.school_id,
                },
            )

        return Response(
            UserSerializer(user, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    # ------------------------------------------------------------------
    # partial_update — PATCH /api/users/{id}/
    # ------------------------------------------------------------------

    def partial_update(self, request, pk=None):
        """Update safe fields (email, name, is_active) on a scoped user."""
        user = self.get_queryset().filter(pk=pk).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Object-level scope checks.
        for perm in [IsWithinSchoolScope(), IsWithinCreatedByScope()]:
            if not perm.has_object_permission(request, self, user):
                return Response({"detail": perm.message}, status=status.HTTP_403_FORBIDDEN)

        serializer = UpdateUserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        log_action(
            request.user,
            "user.updated",
            user,
            metadata={"changed_fields": list(serializer.validated_data.keys())},
        )
        return Response(UserSerializer(user, context={"request": request}).data)

    # ------------------------------------------------------------------
    # grant_permission — POST /api/users/{id}/permissions/
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="permissions")
    def grant_permission(self, request, pk=None):
        """
        Grant a capability to a user.

        Caller must have CREATE_SCHOOL_ADMIN (i.e. be a Super Admin or a
        privileged admin).  School Admins are further scoped to their school.
        """
        target_user = self._get_scoped_user(request, pk)
        if isinstance(target_user, Response):
            return target_user

        # Object-level school scope.
        scope_check = IsWithinSchoolScope()
        if not scope_check.has_object_permission(request, self, target_user):
            return Response({"detail": scope_check.message}, status=status.HTTP_403_FORBIDDEN)

        serializer = CapabilityGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cap_name = serializer.validated_data["capability_name"]
        cap = Capability.objects.get(name=cap_name)

        uc, created = UserCapability.objects.get_or_create(
            user=target_user,
            capability=cap,
            defaults={"granted_by": request.user},
        )

        if created:
            log_action(
                request.user,
                "capability.granted",
                target_user,
                metadata={"capability": cap_name, "target_user_id": target_user.pk},
            )
            return Response(
                {"detail": f"'{cap_name}' granted to {target_user.username}."},
                status=status.HTTP_201_CREATED,
            )

        return Response(
            {"detail": f"'{cap_name}' was already granted to {target_user.username}."},
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # revoke_permission — DELETE /api/users/{id}/permissions/{capability}/
    # ------------------------------------------------------------------

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"permissions/(?P<capability>[A-Z_]+)",
    )
    def revoke_permission(self, request, pk=None, capability=None):
        """Revoke a capability from a user."""
        target_user = self._get_scoped_user(request, pk)
        if isinstance(target_user, Response):
            return target_user

        scope_check = IsWithinSchoolScope()
        if not scope_check.has_object_permission(request, self, target_user):
            return Response({"detail": scope_check.message}, status=status.HTTP_403_FORBIDDEN)

        deleted_count, _ = UserCapability.objects.filter(
            user=target_user,
            capability__name=capability,
        ).delete()

        if deleted_count == 0:
            return Response(
                {"detail": f"'{capability}' was not granted to {target_user.username}."},
                status=status.HTTP_404_NOT_FOUND,
            )

        log_action(
            request.user,
            "capability.revoked",
            target_user,
            metadata={"capability": capability, "target_user_id": target_user.pk},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_scoped_user(self, request, pk) -> "User | Response":
        """Retrieve a User from within the caller's scope or return 404."""
        user = self.get_queryset().filter(pk=pk).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return user
