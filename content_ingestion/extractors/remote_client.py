"""
Remote Client for Standalone Document AI Microservice.

Dispatches extraction tasks to the decoupled FastAPI / Docker microservice
running in high-memory environments (e.g. Hugging Face Spaces 16GB free tier).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import requests
from django.conf import settings

from content_ingestion.models import IngestionJob, JobStatus

logger = logging.getLogger(__name__)


class RemoteAiMicroserviceExtractor:
    """
    Client connecting Django Ingestion Queue to the Standalone AI Microservice.
    """

    def __init__(self, service_url: Optional[str] = None):
        self.service_url = (
            service_url
            or getattr(settings, "DOCUMENT_AI_MICROSERVICE_URL", "")
            or ""
        ).rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(self.service_url)

    def health_check(self) -> bool:
        """
        Pings the microservice to verify it is awake and healthy.
        """
        if not self.is_configured:
            return False
        try:
            res = requests.get(f"{self.service_url}/health", timeout=5)
            return res.status_code == 200
        except Exception:
            return False

    def dispatch_extraction(self, job: IngestionJob, callback_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Dispatches a document to the remote microservice.
        """
        if not self.is_configured:
            raise ValueError("DOCUMENT_AI_MICROSERVICE_URL is not configured in settings.")

        # Determine download URL for the microservice
        pdf_url = job.google_drive_url
        if not pdf_url and job.source_file:
            # If server has public host
            pdf_url = getattr(settings, "BACKEND_BASE_URL", "").rstrip("/") + job.source_file.url

        payload = {
            "job_id": job.pk,
            "title": job.title,
            "document_kind": job.document_kind,
            "pdf_url": pdf_url,
            "callback_url": callback_url,
        }

        endpoint = f"{self.service_url}/extract"
        logger.info(f"Dispatching IngestionJob #{job.pk} to AI Microservice: {endpoint}")

        # Send request with a generous timeout for the initial dispatch
        res = requests.post(endpoint, json=payload, timeout=30)
        res.raise_for_status()
        return res.json()
