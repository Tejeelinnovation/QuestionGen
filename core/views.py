"""
Views for the core app, including the Super Admin Audit & System Log API.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from django.conf import settings
from django.db.models import Q, TextField
from django.db.models.functions import Cast
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

        # Keyword search across username, action, target, and metadata
        search = request.query_params.get("search")
        if search:
            search_str = search.strip()
            qs = qs.annotate(
                metadata_text=Cast("metadata", TextField())
            ).filter(
                Q(user__username__icontains=search_str)
                | Q(user__first_name__icontains=search_str)
                | Q(user__last_name__icontains=search_str)
                | Q(action__icontains=search_str)
                | Q(target_type__icontains=search_str)
                | Q(metadata_text__icontains=search_str)
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


class HealthCheckView(APIView):
    """
    GET /api/health/
    GET /api/health/readiness/
    GET /api/health/?deep=true

    Liveness & Readiness probe endpoint for cloud orchestrators (Render, K8s, Docker).
    - Standard (Liveness): Quick database ping.
    - Deep (Readiness): Inspects DB latency, Cache read/write, Disk space, and AI backend.
    """

    permission_classes = []

    def get(self, request, *args, **kwargs):
        import os
        import shutil
        import sys
        import time
        from django.conf import settings
        from django.core.cache import cache
        from django.db import connection
        from django.utils import timezone

        is_deep = (
            request.query_params.get("deep", "").lower() in ("true", "1", "yes")
            or "readiness" in request.path
            or "readyz" in request.path
        )

        # 1. Database check & latency
        db_start = time.monotonic()
        db_ok = True
        db_error = None
        db_latency_ms = 0.0
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            db_latency_ms = round((time.monotonic() - db_start) * 1000.0, 2)
        except Exception as exc:
            db_ok = False
            db_error = str(exc)

        # Standard lightweight liveness probe
        if not is_deep:
            payload = {
                "status": "healthy" if db_ok else "unhealthy",
                "timestamp": timezone.now().isoformat(),
                "database": "connected" if db_ok else "disconnected",
            }
            if db_error:
                payload["error"] = db_error
            return Response(
                payload,
                status=status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # 2. Cache read/write roundtrip check
        cache_start = time.monotonic()
        cache_ok = True
        cache_error = None
        cache_latency_ms = 0.0
        try:
            cache_key = f"_health_probe_{int(time.time())}"
            cache.set(cache_key, "ok", 10)
            val = cache.get(cache_key)
            if val != "ok":
                cache_ok = False
                cache_error = "Cache roundtrip value mismatch"
            cache.delete(cache_key)
            cache_latency_ms = round((time.monotonic() - cache_start) * 1000.0, 2)
        except Exception as exc:
            cache_ok = False
            cache_error = str(exc)

        # 3. Storage & Disk free space
        media_root = getattr(settings, "MEDIA_ROOT", "media")
        disk_ok = True
        disk_free_gb = 0.0
        try:
            os.makedirs(media_root, exist_ok=True)
            usage = shutil.disk_usage(media_root)
            disk_free_gb = round(usage.free / (1024**3), 2)
            disk_writable = os.access(media_root, os.W_OK)
            if not disk_writable or disk_free_gb < 0.1:
                disk_ok = False
        except Exception:
            disk_ok = False

        # 4. AI & Generation Backend Status
        generation_backend = getattr(settings, "GENERATION_SERVICE_BACKEND", "seeded_bank")
        gemini_configured = bool(getattr(settings, "GEMINI_API_KEY", ""))

        overall_healthy = db_ok and cache_ok

        deep_payload = {
            "status": "healthy" if overall_healthy else "unhealthy",
            "timestamp": timezone.now().isoformat(),
            "components": {
                "database": {
                    "status": "connected" if db_ok else "disconnected",
                    "latency_ms": db_latency_ms,
                    "engine": connection.settings_dict.get("ENGINE", "").split(".")[-1],
                    "error": db_error,
                },
                "cache": {
                    "status": "connected" if cache_ok else "disconnected",
                    "latency_ms": cache_latency_ms,
                    "backend": settings.CACHES.get("default", {}).get("BACKEND", "").split(".")[-1],
                    "error": cache_error,
                },
                "storage": {
                    "status": "writable" if disk_ok else "degraded",
                    "free_disk_gb": disk_free_gb,
                    "media_root": str(media_root),
                },
                "generation_service": {
                    "backend": generation_backend,
                    "llm_key_configured": gemini_configured,
                },
            },
            "runtime": {
                "python": sys.version.split()[0],
                "django": settings.VERSION if hasattr(settings, "VERSION") else "5.x",
            },
        }

        return Response(
            deep_payload,
            status=status.HTTP_200_OK if overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class ApiRootView(APIView):
    """
    GET /
    Lightweight, unauthenticated greeting and service discovery endpoint.
    """

    permission_classes = []

    def get(self, request):
        return Response(
            {
                "name": "Question Generation System API",
                "version": "1.0.0",
                "status": "online",
                "endpoints": {
                    "health": "/api/health/",
                    "docs": "/api/docs/",
                    "schema": "/api/schema/",
                    "redoc": "/api/redoc/",
                    "admin": "/admin/",
                    "auth": "/api/auth/",
                    "users": "/api/users/",
                    "schools": "/api/schools/",
                    "content": "/api/",
                    "papers": "/api/",
                    "attempts": "/api/",
                },
            },
            status=status.HTTP_200_OK,
        )


class BenchmarkResultsView(APIView):
    """
    GET /api/benchmark-results/
    
    Provides Super Admin with local SLM empirical evaluation data:
    - Summary Leaderboard
    - Hardware operational parameters
    - 35 per-run metrics and generated question papers
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        has_superadmin = (
            user.is_superuser
            or getattr(user, "role", "") == "SUPER_ADMIN"
            or (hasattr(user, "has_capability") and user.has_capability("CREATE_SCHOOL"))
        )
        if not has_superadmin:
            return Response(
                {"detail": "Only Super Administrators can view local benchmark evaluation results."},
                status=status.HTTP_403_FORBIDDEN,
            )

        results_dir = settings.BASE_DIR / "benchmark_results"
        state_file = results_dir / "progress_state.json"
        
        if not results_dir.exists() or not state_file.exists():
            return Response({
                "available": False,
                "message": "No local SLM benchmark data found on this server."
            }, status=status.HTTP_200_OK)

        try:
            with open(state_file, "r", encoding="utf-8") as f:
                state_data = json.load(f)
        except Exception as e:
            return Response({
                "available": False,
                "error": f"Failed to load state file: {str(e)}"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        completed_runs = state_data.get("completed_runs", {})
        
        # Load individual generated papers
        runs = []
        for run_key, m in completed_runs.items():
            model_name = m.get("model", "")
            dataset_slug = m.get("dataset_slug", "")
            model_slug = model_name.replace(":", "_").replace(".", "_")
            paper_path = results_dir / model_slug / dataset_slug / "generated_paper.json"
            
            paper_info = {}
            if paper_path.exists():
                try:
                    with open(paper_path, "r", encoding="utf-8") as pf:
                        paper_info = json.load(pf)
                except Exception:
                    pass
            
            runs.append({
                "run_key": run_key,
                "model": model_name,
                "dataset_slug": dataset_slug,
                "subject": m.get("subject", ""),
                "client_wall_time_sec": m.get("client_wall_time_sec", 0.0),
                "eval_count": m.get("eval_count", 0),
                "prompt_eval_count": m.get("prompt_eval_count", 0),
                "eval_tokens_per_sec": m.get("eval_tokens_per_sec", 0.0),
                "vram_mb": m.get("vram_mb", 0),
                "is_valid_json": m.get("is_valid_json", False),
                "compliance_pct": m.get("compliance_pct", 0.0),
                "error": m.get("error"),
                "timestamp": m.get("timestamp"),
                "questions": paper_info.get("parsed_questions") or [],
                "raw_response": paper_info.get("raw_response") or "",
                "validation_error": paper_info.get("validation_error") or "",
            })

        # Calculate model summaries in a consistent order
        models = ["qwen2.5:3b", "llama3.2:3b", "qwen2.5-coder:7b", "qwen2.5:7b", "phi3.5:latest"]
        summary = []
        for mod in models:
            mod_runs = [r for r in runs if r["model"] == mod]
            total = len(mod_runs)
            valid = sum(1 for r in mod_runs if r["is_valid_json"])
            avg_tok_s = round(sum(r["eval_tokens_per_sec"] for r in mod_runs) / total, 1) if total else 0.0
            avg_lat = round(sum(r["client_wall_time_sec"] for r in mod_runs) / total, 1) if total else 0.0
            avg_comp = round(sum(r["compliance_pct"] for r in mod_runs) / total, 1) if total else 0.0
            peak_vram = max((r["vram_mb"] for r in mod_runs), default=0)
            
            summary.append({
                "model": mod,
                "total_runs": total,
                "valid_runs": valid,
                "json_success_pct": round(valid / total * 100, 1) if total else 0.0,
                "avg_tokens_per_sec": avg_tok_s,
                "avg_latency_sec": avg_lat,
                "avg_compliance_pct": avg_comp,
                "peak_vram_mb": peak_vram,
            })

        return Response({
            "available": True,
            "hardware": {
                "device": "ASUS TUF Gaming F15",
                "gpu": "NVIDIA GeForce GTX 1650 (4.0 GB VRAM)",
                "ram": "8.0 GB DDR4",
                "quantization": "4-bit (Q4_K_M)",
                "runtime": "Local Ollama Engine",
            },
            "last_updated": state_data.get("last_updated"),
            "summary": summary,
            "runs": runs,
        }, status=status.HTTP_200_OK)



