"""
Views for the schools app.
"""

from __future__ import annotations

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
    """

    queryset = School.objects.all()
    serializer_class = SchoolSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), HasCapability("CREATE_SCHOOL")()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        school = serializer.save()
        log_action(
            self.request.user,
            "school.created",
            school,
            metadata={"name": school.name, "school_id": school.id},
        )

    def perform_update(self, serializer):
        school = serializer.save()
        log_action(
            self.request.user,
            "school.updated",
            school,
            metadata={"name": school.name, "school_id": school.id},
        )
