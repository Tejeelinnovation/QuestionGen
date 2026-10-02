"""
Management command to run the ingestion task queue worker.

Usage:
    python manage.py run_ingestion_worker
    python manage.py run_ingestion_worker --once
"""

import sys
import time
from django.core.management.base import BaseCommand
from content_ingestion.models import IngestionJob, JobStatus
from content_ingestion.queue import IngestionQueueWorker


class Command(BaseCommand):
    help = "Runs the background document ingestion queue worker."

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Drain the current queue once and exit instead of listening continuously.",
        )
        parser.add_argument(
            "--poll-interval",
            type=int,
            default=5,
            help="Seconds to sleep when queue is empty before checking again (default: 5).",
        )

    def handle(self, *args, **options):
        once = options["once"]
        poll_interval = options["poll_interval"]

        self.stdout.write(self.style.SUCCESS("Starting Ingestion Queue Worker..."))

        try:
            while True:
                pending_count = IngestionJob.objects.filter(
                    status__in=[JobStatus.PENDING, JobStatus.EXTRACTING]
                ).count()

                if pending_count > 0:
                    self.stdout.write(f"Found {pending_count} pending/extracting job(s). Running worker...")
                    # Trigger worker loop directly in foreground of this command
                    from content_ingestion.services import IngestionService
                    service = IngestionService()

                    while True:
                        job = IngestionQueueWorker._acquire_next_job()
                        if not job:
                            break
                        self.stdout.write(f"Processing Job #{job.pk}: '{job.title}'...")
                        IngestionQueueWorker._process_job_chunks(job, service)
                        self.stdout.write(self.style.SUCCESS(f"Finished Job #{job.pk} ({job.status})."))

                if once:
                    self.stdout.write(self.style.SUCCESS("Queue drained. Exiting (--once)."))
                    break

                time.sleep(poll_interval)

        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("\nWorker stopped by operator."))
            sys.exit(0)
