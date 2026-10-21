"""
Request Correlation & Structured Observability Middleware.

Provides:
- Distributed request tracing via X-Request-ID header propagation or auto-generation.
- ContextVar storage for thread-safe logger injection across views and services.
- Real-time request latency tracking (X-Response-Time-Ms header).
- Structured access log emission for operational metrics.
"""

from __future__ import annotations

import contextvars
import logging
import time
import uuid
from typing import Callable, Optional

from django.http import HttpRequest, HttpResponse

logger = logging.getLogger("core.request")

# ContextVar for thread-safe / async-safe request ID access anywhere in the call stack
_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")


def get_current_request_id() -> str:
    """
    Retrieve the active request's correlation ID.
    Returns empty string if called outside an active HTTP request cycle.
    """
    return _request_id_ctx.get()


class RequestIdFilter(logging.Filter):
    """
    Logging filter that injects the active request_id into every LogRecord.
    Enables uniform correlation across application and framework logs.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_current_request_id() or "-"
        return True


class RequestCorrelationMiddleware:
    """
    Middleware that manages distributed trace correlation IDs and measures
    end-to-end request latency.
    """

    REQUEST_ID_HEADER = "HTTP_X_REQUEST_ID"
    RESPONSE_ID_HEADER = "X-Request-ID"
    RESPONSE_TIME_HEADER = "X-Response-Time-Ms"

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        start_time = time.monotonic()

        # 1. Resolve or generate correlation ID
        incoming_id = request.META.get(self.REQUEST_ID_HEADER, "").strip()
        if incoming_id and len(incoming_id) <= 64 and incoming_id.replace("-", "").isalnum():
            req_id = incoming_id
        else:
            req_id = uuid.uuid4().hex[:16]

        request.request_id = req_id
        token = _request_id_ctx.set(req_id)

        try:
            response = self.get_response(request)
        finally:
            _request_id_ctx.reset(token)

        # 2. Calculate execution duration
        duration_ms = round((time.monotonic() - start_time) * 1000.0, 2)

        # 3. Attach diagnostic headers to response
        response[self.RESPONSE_ID_HEADER] = req_id
        response[self.RESPONSE_TIME_HEADER] = str(duration_ms)

        # 4. Emit structured access log for production telemetry
        status_code = getattr(response, "status_code", 200)
        user_repr = "anonymous"
        if hasattr(request, "user") and request.user and request.user.is_authenticated:
            user_repr = f"user_{request.user.id}"

        log_level = logging.WARNING if status_code >= 400 else logging.INFO
        logger.log(
            log_level,
            f"{request.method} {request.path} {status_code} ({duration_ms}ms) [{req_id}] ({user_repr})",
            extra={
                "request_id": req_id,
                "method": request.method,
                "path": request.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "user": user_repr,
            },
        )

        return response
