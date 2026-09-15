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


def get_category_for_action(action: str) -> str:
    if not action:
        return "SYSTEM"
    if "proctoring" in action:
        return "PROCTORING"
    if action.startswith(("attempt.", "exam.", "answer.")):
        return "EXAMS"
    if action.startswith(("paper.", "version.", "delivery.", "blueprint.")):
        return "PAPERS"
    if action.startswith(("user.", "capability.")):
        return "USERS"
    return "SYSTEM"


class AuditLogListView(APIView):
    """
    GET /api/audit-logs/

    Provides Super Admin with unified system audit logs:
    - Proctoring warnings & cheating alerts
    - Student exam sittings (start, submission, scores)
    - Teacher paper creation and versioning
    - Role, session, and security changes
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
            qs = qs.filter(Q(action__in=["exam.proctoring_warning"]) | Q(action__icontains="proctoring"))
        elif category == "EXAMS":
            qs = qs.filter(Q(action__startswith="attempt.") | Q(action__startswith="exam.") | Q(action__startswith="answer."))
        elif category == "PAPERS":
            qs = qs.filter(Q(action__startswith="paper.") | Q(action__startswith="version.") | Q(action__startswith="delivery.") | Q(action__startswith="blueprint."))
        elif category == "USERS":
            qs = qs.filter(Q(action__startswith="user.") | Q(action__startswith="capability."))

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
            actor = None
            if log.user:
                role_val = getattr(log.user, "role", "USER")
                role_label = getattr(log.user, "get_role_display", None)
                if callable(role_label):
                    try:
                        role_label = role_label()
                    except Exception:
                        role_label = role_val
                else:
                    role_label = role_val

                actor = {
                    "id": log.user_id,
                    "username": log.user.username,
                    "first_name": getattr(log.user, "first_name", ""),
                    "last_name": getattr(log.user, "last_name", ""),
                    "role": role_val,
                    "role_label": role_label or role_val,
                }

            meta = log.metadata or {}
            ip_address = meta.get("ip") or meta.get("ip_address") or None
            item_category = get_category_for_action(log.action)
            iso_time = log.timestamp.isoformat()

            results.append({
                "id": log.id,
                "actor": actor,
                "action": log.action,
                "event_type": log.action,
                "category": item_category,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "timestamp": iso_time,
                "created_at": iso_time,
                "ip_address": ip_address,
                "metadata": meta,
            })

        if page is not None:
            return paginator.get_paginated_response(results)

        return Response({"results": results}, status=status.HTTP_200_OK)

