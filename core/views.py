"""
Views for the core app, including the Super Admin Audit & System Log API.
"""

from __future__ import annotations

from typing import Any
from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AuditLog
from core.pagination import StandardPageNumberPagination


class AuditLogListView(APIView):
    """
    GET /api/audit-logs/

    Provides Super Admin with unified system audit logs:
    - Proctoring warnings & cheating alerts
    - Student exam sittings (start, submission, scores)
    - Teacher paper creation and versioning
    - Role and permission changes
    """

    permission_classes = [IsAuthenticated]
    pagination_class = StandardPageNumberPagination

    def get(self, request):
        if not (request.user.is_superuser or getattr(request.user, "role", "") == "SUPER_ADMIN"):
            return Response(
                {"detail": "Only Super Administrators can inspect system audit logs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = AuditLog.objects.select_related("user").order_by("-timestamp")

        # Category filtering
        category = request.query_params.get("category", "ALL").upper()
        if category == "PROCTORING":
            qs = qs.filter(action__in=["exam.proctoring_warning"])
        elif category == "EXAMS":
            qs = qs.filter(action__in=["attempt.started", "attempt.submitted", "exam.proctoring_warning", "answer.graded"])
        elif category == "PAPERS":
            qs = qs.filter(action__in=["paper.created", "version.created", "paper.cloned", "delivery.created"])
        elif category == "USERS":
            qs = qs.filter(action__in=["user.created", "user.profile_updated", "user.password_changed", "capability.granted", "capability.revoked"])

        # Specific action filter
        action_filter = request.query_params.get("action")
        if action_filter:
            qs = qs.filter(action=action_filter)

        # Keyword search across username, action, and target
        search = request.query_params.get("search")
        if search:
            search_str = search.strip()
            qs = qs.filter(
                Q(user__username__icontains=search_str)
                | Q(action__icontains=search_str)
                | Q(target_type__icontains=search_str)
                | Q(metadata__icontains=search_str)
            )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)

        results = []
        for log in (page if page is not None else qs[:100]):
            actor = {
                "id": log.user_id,
                "username": log.user.username if log.user else "System",
                "role": getattr(log.user, "role", "SYSTEM") if log.user else "SYSTEM",
            }
            results.append({
                "id": log.id,
                "actor": actor,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "timestamp": log.timestamp.isoformat(),
                "metadata": log.metadata or {},
            })

        if page is not None:
            return paginator.get_paginated_response(results)

        return Response({"results": results}, status=status.HTTP_200_OK)
