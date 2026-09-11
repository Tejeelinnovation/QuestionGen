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
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from core.audit import log_action
from core.pagination import StandardPageNumberPagination
from .models import Capability, CapabilityName, User, UserCapability
from .permissions import (
    HasCapability,
    IsWithinCreatedByScope,
    IsWithinSchoolScope,
    ScopedUserQuerysetMixin,
)
from .serializers import (
    CapabilityGrantSerializer,
    ChangePasswordSerializer,
    CreateUserSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
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
    GET   /api/auth/me/  → Returns user profile and capabilities.
    PATCH /api/auth/me/  → Self-update user profile (restricts sensitive fields).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        user = request.user
        restricted_fields = {
            "gr_number",
            "class_section",
            "roll_number",
            "email",
            "mobile_number",
            "role",
            "school",
            "capabilities",
            "is_superuser",
            "is_staff",
            "is_active",
        }

        # Check if user tried to alter locked administrative fields
        attempted_restricted = [f for f in restricted_fields if f in request.data]
        if not user.is_superuser and attempted_restricted:
            return Response(
                {
                    "detail": f"Editing locked administrative fields ({', '.join(attempted_restricted)}) is not permitted. Please contact your school administrator.",
                    "restricted_fields": attempted_restricted,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        allowed_fields = {"first_name", "last_name"}
        if user.role in ["TEACHER", "HOD"]:
            allowed_fields.add("primary_subject")

        updated_keys = []
        for key, value in request.data.items():
            if key in allowed_fields:
                setattr(user, key, value)
                updated_keys.append(key)

        user.save()
        log_action(user, "user.profile_updated", user, metadata={"updated_fields": updated_keys})
        serializer = UserSerializer(user, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    """
    POST /api/auth/change-password/

    Allows authenticated user to change their account password.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"current_password": "The current password entered is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data["new_password"])
        user.save()
        log_action(user, "user.password_changed", user)

        return Response(
            {"detail": "Your password has been changed successfully."},
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    """
    POST /api/auth/password-reset/request/

    Generates signed, secure password reset token for account recovery.
    """

    permission_classes = []

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            token = default_token_generator.make_token(user)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            reset_url = f"/reset-password?uid={uid}&token={token}"
            log_action(user, "user.password_reset_requested", user)

            return Response(
                {
                    "detail": "If an active account exists with this email address, password reset instructions have been dispatched.",
                    "uid": uid,
                    "token": token,
                    "reset_url": reset_url,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "detail": "If an active account exists with this email address, password reset instructions have been dispatched.",
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST /api/auth/password-reset/confirm/

    Confirms password reset using cryptographic token.
    """

    permission_classes = []

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid_str = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        new_password = serializer.validated_data["new_password"]

        try:
            user_id = force_str(urlsafe_base64_decode(uid_str))
            user = User.objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {"detail": "Invalid or expired password reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "Invalid or expired password reset token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()
        log_action(user, "user.password_reset_confirmed", user)

        return Response(
            {"detail": "Your password has been reset successfully. You may now log in."},
            status=status.HTTP_200_OK,
        )


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
    pagination_class = StandardPageNumberPagination

    def get_queryset(self):
        return self.get_scoped_queryset()

    def get_permissions(self):
        """
        Return appropriate permissions based on the current action.
        """
        if self.action in ("list", "stats"):
            return [IsAuthenticated()]

        if self.action == "create":
            # Permission class is dynamically selected in the create method
            # based on the requested profile, so we only require authentication here.
            return [IsAuthenticated()]

        if self.action in ("retrieve", "partial_update"):
            return [IsAuthenticated(), IsWithinSchoolScope(), IsWithinCreatedByScope()]

        if self.action in ("grant_permission", "revoke_permission"):
            return [IsAuthenticated()]

        return [IsAuthenticated()]

    # ------------------------------------------------------------------
    # list — GET /api/users/
    # ------------------------------------------------------------------

    def list(self, request):
        """Return users within the caller's scope with filtering, search, and pagination."""
        queryset = self.get_queryset()

        role = request.query_params.get("role")
        if role and role.upper() != "ALL":
            role_norm = role.strip().lower()
            if role_norm in ("super admin", "super_admin"):
                queryset = queryset.filter(
                    Q(role__in=["Super Admin", "super_admin"])
                    | Q(user_capabilities__capability__name=CapabilityName.CREATE_SCHOOL)
                )
            elif role_norm in ("school admin", "school_admin"):
                queryset = queryset.filter(
                    Q(role__in=["School Admin", "school_admin"])
                    | (
                        Q(user_capabilities__capability__name=CapabilityName.VIEW_SCHOOL_WIDE_CONTROLS)
                        & Q(school__isnull=False)
                    )
                )
            elif role_norm in ("teacher",):
                queryset = queryset.filter(
                    Q(role__in=["Teacher", "teacher"])
                    | (
                        Q(user_capabilities__capability__name=CapabilityName.CREATE_STUDENT)
                        & Q(school__isnull=False)
                        & ~Q(user_capabilities__capability__name=CapabilityName.VIEW_SCHOOL_WIDE_CONTROLS)
                    )
                )
            elif role_norm in ("student",):
                queryset = queryset.filter(
                    Q(role__in=["Student", "student"])
                    | Q(user_capabilities__capability__name=CapabilityName.ATTEMPT_TEST)
                )

        search = request.query_params.get("search")
        if search and search.strip():
            s = search.strip()
            queryset = queryset.filter(
                Q(username__icontains=s)
                | Q(first_name__icontains=s)
                | Q(last_name__icontains=s)
                | Q(email__icontains=s)
                | Q(school__name__icontains=s)
            )

        queryset = queryset.distinct().order_by("-date_joined", "id")

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = UserSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)

        serializer = UserSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    # ------------------------------------------------------------------
    # stats — GET /api/users/stats/
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Return user counts broken down by role within the caller's scope."""
        queryset = self.get_scoped_queryset()
        users = list(queryset)
        counts = {
            "total": len(users),
            "super_admin": sum(1 for u in users if u.role_label == "Super Admin"),
            "school_admin": sum(1 for u in users if u.role_label == "School Admin"),
            "teacher": sum(1 for u in users if u.role_label == "Teacher"),
            "student": sum(1 for u in users if u.role_label == "Student"),
            "qbm": sum(1 for u in users if u.role_label == "Question Bank Manager"),
        }
        return Response(counts)

    # ------------------------------------------------------------------
    # create — POST /api/users/
    # ------------------------------------------------------------------

    # Mapping: requested profile → required capability the CALLER must have
    _PROFILE_TO_REQUIRED_CAP = {
        "school_admin": CapabilityName.CREATE_SCHOOL_ADMIN,
        "teacher": CapabilityName.CREATE_TEACHER,
        "student": CapabilityName.CREATE_STUDENT,
        "qbm": CapabilityName.CREATE_SCHOOL,
    }

    def create(self, request):
        """
        Create a new user, enforcing capability gating.

        The caller must have the CREATE_* capability that matches the
        requested profile.  School Admins and Teachers are further
        constrained to create within their own school.
        """
        profile = request.data.get("profile")
        if profile == "school_admin":
            return Response(
                {
                    "detail": (
                        "School Admins cannot be created separately. "
                        "They must be created together when registering a School."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        required_cap = self._PROFILE_TO_REQUIRED_CAP.get(profile)

        if not required_cap:
            return Response(
                {"detail": f"Invalid or missing 'profile'. Choose from: {list(self._PROFILE_TO_REQUIRED_CAP)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Super Admin cannot directly create teachers (AC-21)
        if profile == "teacher":
            if request.user.school_id is None or not request.user.has_capability(CapabilityName.CREATE_TEACHER):
                return Response(
                    {
                        "detail": "Super Admins cannot directly create teachers. Teacher creation belongs to the School / Coaching Class."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Only Super Admins can create QBM accounts (AC-10)
        if profile == "qbm":
            if request.user.school_id is not None or not request.user.has_capability(CapabilityName.CREATE_SCHOOL):
                return Response(
                    {"detail": "Only Super Admins can provision Question Bank Manager accounts."},
                    status=status.HTTP_403_FORBIDDEN,
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
    # retrieve — GET /api/users/{id}/
    # ------------------------------------------------------------------

    def retrieve(self, request, pk=None):
        """Retrieve a scoped user profile."""
        user = self._get_scoped_user(request, pk)
        if isinstance(user, Response):
            return user
        for perm in [IsWithinSchoolScope(), IsWithinCreatedByScope()]:
            if not perm.has_object_permission(request, self, user):
                return Response({"detail": perm.message}, status=status.HTTP_403_FORBIDDEN)
        return Response(UserSerializer(user, context={"request": request}).data)

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

    # Role-based scope boundaries: maps each role to its strictly allowed capability set.
    ROLE_ALLOWED_CAPABILITIES = {
        "Super Admin": [cap.value for cap in CapabilityName if cap != CapabilityName.CREATE_TEACHER],
        "School Admin": [
            CapabilityName.CREATE_TEACHER,
            CapabilityName.CREATE_STUDENT,
            CapabilityName.VIEW_SCHOOL_WIDE_CONTROLS,
        ],
        "Teacher": [
            CapabilityName.CREATE_STUDENT,
            CapabilityName.GENERATE_SELECT_QUESTIONS,
            CapabilityName.CREATE_PAPER,
            CapabilityName.ASSIGN_TEST,
        ],
        "Student": [
            CapabilityName.ATTEMPT_TEST,
            CapabilityName.VIEW_OWN_RESULT,
        ],
        "Question Bank Manager": [
            CapabilityName.INGEST_GLOBAL_QUESTIONS,
            CapabilityName.GENERATE_SELECT_QUESTIONS,
        ],
    }

    def _check_permission_management_allowed(self, request_user, target_user) -> Response | None:
        """
        Enforce caller hierarchy for modifying capabilities:
        - Super Admin: can modify School Admin, Teacher, Student.
        - School Admin: can modify Teacher and Student within their own school.
        - Teacher and Student: cannot modify permissions for anyone.
        """
        is_super_admin = (
            request_user.is_superuser
            or request_user.has_capability("CREATE_SCHOOL")
            or request_user.has_capability("CREATE_SCHOOL_ADMIN")
        )
        if is_super_admin:
            return None

        is_school_admin = (
            request_user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS")
            and request_user.school_id is not None
        )
        if is_school_admin:
            if target_user.school_id != request_user.school_id:
                return Response(
                    {"detail": "You can only manage permissions for users in your own school."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if target_user.role_label not in ("Teacher", "Student"):
                return Response(
                    {"detail": "School Admins can only manage permissions for Teachers and Students."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return None

        return Response(
            {"detail": "You do not have permission to manage user capabilities."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ------------------------------------------------------------------
    # grant_permission — POST /api/users/{id}/permissions/
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="permissions")
    def grant_permission(self, request, pk=None):
        """
        Grant a capability to a user, enforcing role scope boundaries:
        - Super Admin can grant to School Admin (3 caps), Teacher (4 caps), Student (2 caps).
        - School Admin can grant to Teacher (4 caps), Student (2 caps) within their school.
        - Out-of-scope capabilities are strictly rejected with 400 Bad Request.
        """
        target_user = self._get_scoped_user(request, pk)
        if isinstance(target_user, Response):
            return target_user

        auth_error = self._check_permission_management_allowed(request.user, target_user)
        if auth_error is not None:
            return auth_error

        serializer = CapabilityGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cap_name = serializer.validated_data["capability_name"]
        target_role = target_user.role_label
        allowed_caps = self.ROLE_ALLOWED_CAPABILITIES.get(target_role, [])

        if cap_name not in allowed_caps:
            return Response(
                {
                    "detail": (
                        f"Capability '{cap_name}' is out of scope for role '{target_role}'. "
                        f"Allowed capabilities for {target_role}: {allowed_caps}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Question Bank capability gating (AC-11, AC-12):
        # Teacher cannot be granted GENERATE_SELECT_QUESTIONS if organization does not have it enabled.
        if cap_name == CapabilityName.GENERATE_SELECT_QUESTIONS and target_role == "Teacher":
            if not target_user.school or not getattr(target_user.school, "question_bank_enabled", False):
                return Response(
                    {
                        "detail": (
                            "Question Bank capability is not enabled for this organization. "
                            "Super Admin must enable Question Bank capability for the School / Coaching Class first."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

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
        """
        Revoke a capability from a user, enforcing role scope boundaries.
        """
        target_user = self._get_scoped_user(request, pk)
        if isinstance(target_user, Response):
            return target_user

        auth_error = self._check_permission_management_allowed(request.user, target_user)
        if auth_error is not None:
            return auth_error

        target_role = target_user.role_label
        allowed_caps = self.ROLE_ALLOWED_CAPABILITIES.get(target_role, [])

        if capability not in allowed_caps:
            return Response(
                {
                    "detail": (
                        f"Capability '{capability}' is out of scope for role '{target_role}'. "
                        f"Allowed capabilities for {target_role}: {allowed_caps}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

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
