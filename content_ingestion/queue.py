"""
Background Task Queue for Document Ingestion.

Provides concurrency-controlled (concurrency=1), memory-safe asynchronous 
processing of IngestionJobs on resource-constrained servers (e.g. Render 512MB RAM free tier).
"""

from __future__ import annotations

import logging
import sys
import threading
import time
from typing import Optional

from django.db import transaction
from django.db.models import Q

from .models import IngestionJob, JobStatus

logger = logging.getLogger(__name__)


def get_job_queue_position(job: IngestionJob) -> Optional[int]:
    """
    Returns the 1-based position in the pending queue:
    - 0 if currently EXTRACTING (active).
    - 1, 2, 3... if PENDING (waiting in queue).
    - None if COMPLETED, FAILED, or UNKNOWN.
    """
    if job.status == JobStatus.EXTRACTING:
        return 0
    if job.status == JobStatus.PENDING:
        earlier_count = IngestionJob.objects.filter(
            Q(status=JobStatus.EXTRACTING) |
            Q(status=JobStatus.PENDING, created_at__lt=job.created_at)
        ).exclude(pk=job.pk).count()
        return earlier_count + 1
    return None


class IngestionQueueWorker:
    """
    Singleton-style background worker managing a single-threaded queue.
    Ensures strict concurrency = 1 so Render RAM stays flat (~120MB)
    and temporary files are cleared sequentially without disk exhaustion.
    """

    _lock = threading.Lock()
    _is_running = False

    @classmethod
    def is_running(cls) -> bool:
        with cls._lock:
            return cls._is_running

    @classmethod
    def trigger_worker(cls) -> bool:
        """
        Starts the background worker thread if not already active.
        Returns True if a new worker thread was spawned, False if already running.
        """
        # In Django test runner (running against SQLite in-memory), do not spawn detached thread
        if "test" in sys.argv:
            logger.debug("Skipping background worker thread in test mode.")
            return False

        with cls._lock:
            if cls._is_running:
                logger.debug("IngestionQueueWorker is already running. Task will be picked up.")
                return False

            cls._is_running = True
            worker_thread = threading.Thread(
                target=cls._worker_loop,
                daemon=True,
                name="IngestionQueueWorkerThread",
            )
            worker_thread.start()
            logger.info("IngestionQueueWorker started in background thread.")
            return True

    @classmethod
    def _worker_loop(cls):
        """
        Continuous loop processing one job at a time until the queue is completely drained.
        """
        from .services import IngestionService

        logger.info("IngestionQueueWorker loop initialized.")
        service = IngestionService()

        try:
            while True:
                # 1. Acquire next job to process (oldest unfinished job first)
                job = cls._acquire_next_job()
                if not job:
                    logger.info("Ingestion queue is empty. Worker loop stopping.")
                    break

                logger.info(f"Worker picked up IngestionJob #{job.pk} ('{job.title}').")

                # 2. Process job chunk by chunk until complete or failed
                try:
                    cls._process_job_chunks(job, service)
                except Exception as job_err:
                    logger.error(
                        f"Unhandled exception processing IngestionJob #{job.pk}: {job_err}",
                        exc_info=True,
                    )
                    job.status = JobStatus.FAILED
                    job.error_message = f"Worker error: {str(job_err)}"
                    job.save(update_fields=["status", "error_message"])

                # Brief pause between jobs to allow OS garbage collection & release memory
                time.sleep(0.5)

        finally:
            with cls._lock:
                cls._is_running = False
            logger.info("IngestionQueueWorker loop exited cleanly.")

    @classmethod
    def _acquire_next_job(cls) -> Optional[IngestionJob]:
        """
        Finds the next job to process:
        First prioritizes any interrupted EXTRACTING jobs, then oldest PENDING jobs.
        """
        # Check for interrupted extracting jobs first
        active_job = IngestionJob.objects.filter(status=JobStatus.EXTRACTING).order_by("created_at").first()
        if active_job:
            return active_job

        # Pick next pending job
        pending_job = IngestionJob.objects.filter(status=JobStatus.PENDING).order_by("created_at").first()
        return pending_job

    @classmethod
    def _process_job_chunks(cls, job: IngestionJob, service: IngestionService, chunk_size: int = 15):
        """
        Processes an individual job in batches of pages.
        Updates progress after each chunk and yields CPU so web server stays responsive.
        """
        while True:
            # If job was initialized but total_pages is 0, initialize it
            if job.total_pages == 0:
                service.initialize_job(job)
                job.refresh_from_db()
                if job.status == JobStatus.FAILED:
                    logger.warning(f"Job #{job.pk} failed during initialization.")
                    break

            # Process next chunk of pages
            chunk_result = service.process_chunk(job, chunk_size=chunk_size)
            job.refresh_from_db()

            if chunk_result.get("is_finished") or job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                logger.info(
                    f"Job #{job.pk} reached final status '{job.status}' "
                    f"({job.processed_pages}/{job.total_pages} pages)."
                )
                break

            # Sleep 200ms between chunks to keep CPU load low on Render free tier
            time.sleep(0.2)
