"""
Service factory and resolver for Question Generation.

Provides a pluggable entry point to obtain the active QuestionGenerationService
implementation, determined by Django settings or environment configuration.
"""

from __future__ import annotations

from typing import Optional, Type

from django.conf import settings

from generation.interfaces import QuestionGenerationService
from generation.services.seeded_bank import SeededBankGenerationService

# Registry mapping backend identifiers to service classes
_BACKENDS: dict[str, Type[QuestionGenerationService]] = {
    "seeded_bank": SeededBankGenerationService,
}


def register_generation_service(
    name: str,
    service_class: Type[QuestionGenerationService],
) -> None:
    """
    Register a new question generation service backend.

    Allows plugging in custom backends (e.g. LLMRAGGenerationService)
    without modifying core codebase logic.
    """
    if not issubclass(service_class, QuestionGenerationService):
        raise TypeError(
            f"{service_class.__name__} must implement QuestionGenerationService interface."
        )
    _BACKENDS[name.lower().strip()] = service_class


def get_generation_service(
    backend_name: Optional[str] = None,
) -> QuestionGenerationService:
    """
    Resolve and instantiate the active QuestionGenerationService.

    Args:
        backend_name: Optional explicit backend name (e.g. 'seeded_bank').
            If omitted, reads settings.GENERATION_SERVICE_BACKEND.

    Returns:
        QuestionGenerationService: An instance of the configured service backend.

    Raises:
        ValueError: If the requested backend is not registered.
    """
    resolved_name = (
        backend_name
        or getattr(settings, "GENERATION_SERVICE_BACKEND", "seeded_bank")
        or "seeded_bank"
    ).lower().strip()

    service_cls = _BACKENDS.get(resolved_name)
    if not service_cls:
        available = ", ".join(repr(k) for k in _BACKENDS)
        raise ValueError(
            f"Unknown question generation backend: '{resolved_name}'. "
            f"Available backends: {available}."
        )

    return service_cls()
