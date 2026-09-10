"""
Views for the schools app.
"""

from __future__ import annotations

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_action
from users.permissions import HasCapability
from .models import School
from .serializers import SchoolSerializer


class SchoolViewSet(viewsets.ModelViewSet):
    """
    ViewSet for listing, creating, and updating Schools.

    - list / retrieve: Any authenticated user can view schools (e.g. for dropdowns).
    - create / update / delete: Requires CREATE_SCHOOL capability (Super Admin).
    - create: Supports atomic provisioning of an initial School Administrator via optional `admin` payload.
    """

    queryset = School.objects.all()
    serializer_class = SchoolSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), HasCapability("CREATE_SCHOOL")()]
        return [IsAuthenticated()]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        admin_data = request.data.get("admin")
        if not admin_data:
            return Response(
                {
                    "admin": [
                        "School Administrator details are required. School and School Admin must be created together."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school = serializer.save()

        from users.serializers import CreateUserSerializer, UserSerializer  # noqa: PLC0415
        admin_payload = {
            **admin_data,
            "school": school.id,
            "profile": "school_admin",
        }
        admin_serializer = CreateUserSerializer(
            data=admin_payload, context={"request": request}
        )
        admin_serializer.is_valid(raise_exception=True)
        created_admin = admin_serializer.save(created_by=request.user)
        log_action(
            request.user,
            "user.created",
            created_admin,
            metadata={
                "username": created_admin.username,
                "role": "School Admin",
                "school_id": school.id,
            },
        )

        log_action(
            request.user,
            "school.created",
            school,
            metadata={"name": school.name, "school_id": school.id},
        )
        headers = self.get_success_headers(serializer.data)
        response_data = serializer.data
        response_data["admin"] = UserSerializer(created_admin, context={"request": request}).data
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        school = serializer.save()
        log_action(
            self.request.user,
            "school.updated",
            school,
            metadata={"name": school.name, "school_id": school.id},
        )
