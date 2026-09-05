"""
Audit logging helper.

Usage::

    from core.audit import log_action

    log_action(
        user=request.user,          # or None for system actions
        action="user.created",
        target=new_user,            # any model instance
        metadata={"email": new_user.email},
    )

This function is the single entry point for writing AuditLog rows.
Call it from views/services — never from model .save() to avoid recursion.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from django.db import models as django_models

logger = logging.getLogger(__name__)


def log_action(
    user: "django_models.Model | None",
    action: str,
    target: "django_models.Model",
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Write an AuditLog entry.

    Parameters
    ----------
    user:
        The user performing the action. Pass ``None`` for system/bootstrap
        actions (e.g. management commands).
    action:
        Short snake_case verb string, e.g. ``"user.created"``,
        ``"capability.granted"``, ``"capability.revoked"``.
    target:
        The Django model instance being acted upon.
    metadata:
        Optional dict of extra context. Anything JSON-serialisable is fine.
    """
    # Import here to avoid circular imports at module load time.
    from core.models import AuditLog  # noqa: PLC0415

    app_label = target._meta.app_label
    model_name = target._meta.model_name
    target_type = f"{app_label}.{model_name}"
    target_id = str(target.pk)

    try:
        AuditLog.objects.create(
            user=user,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata or {},
        )
    except Exception:  # pragma: no cover — don't let audit failure break the request
        logger.exception(
            "Failed to write AuditLog: action=%s target=%s:%s",
            action,
            target_type,
            target_id,
        )
