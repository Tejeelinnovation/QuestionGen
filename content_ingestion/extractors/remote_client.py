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
    Client connecting Django Ingestion Queue to the Standalone AI Microservice
    or GitHub Actions On-Demand 16GB RAM runner.
    """

    def __init__(self, service_url: Optional[str] = None):
        self.service_url = (
            service_url
            or getattr(settings, "DOCUMENT_AI_MICROSERVICE_URL", "")
            or ""
        ).rstrip("/")
        self.github_token = getattr(settings, "GITHUB_DISPATCH_TOKEN", "").strip()
        self.github_repo = getattr(settings, "GITHUB_DISPATCH_REPO", "queraai/QuestionGen").strip()

    @property
    def is_configured(self) -> bool:
        """
        True if either a direct microservice URL is set or a GitHub dispatch token is configured.
        """
        return bool(self.service_url or (self.github_token and self.github_repo))

    @property
    def mode(self) -> str:
        if self.service_url:
            return "DIRECT_URL"
        if self.github_token and self.github_repo:
            return "GITHUB_ACTIONS"
        return "UNCONFIGURED"

    def health_check(self) -> bool:
        """
        Pings the microservice or verifies GitHub dispatch readiness.
        """
        if not self.is_configured:
            return False
        if self.mode == "DIRECT_URL":
            try:
                res = requests.get(f"{self.service_url}/health", timeout=5)
                return res.status_code == 200
            except Exception:
                return False
        elif self.mode == "GITHUB_ACTIONS":
            # GitHub is always up
            return bool(self.github_token)
        return False

    def dispatch_extraction(self, job: IngestionJob, callback_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Dispatches a document to GitHub Actions (16GB runner) or the remote microservice.
        """
        if not self.is_configured:
            raise ValueError("Neither DOCUMENT_AI_MICROSERVICE_URL nor GITHUB_DISPATCH_TOKEN is configured.")

        # Determine download URL for the runner
        # 1. Prefer direct Django source-pdf stream with token so runner receives the genuine PDF binary
        backend_base = getattr(settings, "BACKEND_BASE_URL", "").rstrip("/")
        webhook_secret = getattr(settings, "INGESTION_WEBHOOK_SECRET", "")

        pdf_url = ""
        if backend_base and backend_base.startswith("http"):
            pdf_url = f"{backend_base}/api/ingest/jobs/{job.pk}/source-pdf/"
            if webhook_secret:
                pdf_url += f"?token={webhook_secret}"
        elif job.google_drive_url:
            pdf_url = job.google_drive_url
        elif job.source_file:
            pdf_url = f"{backend_base}{job.source_file.url}"

        if not pdf_url:
            raise ValueError(f"Job #{job.pk} has no accessible PDF URL or Google Drive link for the runner.")

        # 1. Dispatch to GitHub Actions (16GB RAM Runner)
        if self.mode == "GITHUB_ACTIONS":
            if (
                not callback_url
                or not callback_url.startswith("http")
                or ("localhost" in callback_url and not getattr(settings, "DEBUG", False))
                or ("127.0.0.1" in callback_url and not getattr(settings, "DEBUG", False))
            ):
                raise ValueError(
                    "BACKEND_BASE_URL is not set to your live HTTPS Render domain. "
                    "GitHub Actions running in the cloud cannot deliver results back to 'localhost' or an empty address. "
                    "Please add BACKEND_BASE_URL=https://<your-render-app>.onrender.com to your Render Environment variables."
                )

            dispatch_url = f"https://api.github.com/repos/{self.github_repo}/dispatches"
            headers = {
                "Authorization": f"Bearer {self.github_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "Django-Document-AI-Dispatcher",
            }
            payload = {
                "event_type": "extract_document",
                "client_payload": {
                    "job_id": job.pk,
                    "title": job.title,
                    "document_kind": job.document_kind,
                    "pdf_url": pdf_url,
                    "callback_url": callback_url,
                },
            }
            logger.info(f"Triggering GitHub Actions runner on {self.github_repo} for Job #{job.pk}...")
            res = requests.post(dispatch_url, json=payload, headers=headers, timeout=20)
            if res.status_code not in (200, 204):
                logger.error(f"GitHub dispatch failed ({res.status_code}): {res.text}")
                res.raise_for_status()

            job.current_stage = "Launched 16GB RAM GitHub Actions runner in cloud..."
            job.save(update_fields=["current_stage"])
            return {"status": "DISPATCHED_TO_GITHUB_ACTIONS", "repo": self.github_repo, "job_id": job.pk}

        # 2. Dispatch to Direct Microservice URL
        payload = {
            "job_id": job.pk,
            "title": job.title,
            "document_kind": job.document_kind,
            "pdf_url": pdf_url,
            "callback_url": callback_url,
        }
        endpoint = f"{self.service_url}/extract"
        logger.info(f"Dispatching IngestionJob #{job.pk} to AI Microservice: {endpoint}")
        res = requests.post(endpoint, json=payload, timeout=30)
        res.raise_for_status()
        return res.json()
