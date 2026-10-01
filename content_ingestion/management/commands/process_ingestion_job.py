"""
Management command to process pending Ingestion Jobs or test local PDF extraction.

Usage:
  python manage.py process_ingestion_job --job-id 1
  python manage.py process_ingestion_job --file "path/to/book.pdf" --title "Class 10 Math"
"""

from __future__ import annotations

import os
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from content_ingestion.models import DocumentKind, IngestionJob, JobStatus
from content_ingestion.services import IngestionService


class Command(BaseCommand):
    help = "Processes an IngestionJob chunk-by-chunk until completed."

    def add_arguments(self, parser):
        parser.add_argument("--job-id", type=int, help="ID of existing IngestionJob to process.")
        parser.add_argument("--file", type=str, help="Path to local PDF file to ingest from scratch.")
        parser.add_argument("--title", type=str, default="Local Test Document", help="Title for new job.")
        parser.add_argument("--subject", type=str, default="General", help="Subject.")
        parser.add_argument("--chunk-size", type=int, default=5, help="Number of pages per chunk.")

    def handle(self, *args, **options):
        job_id = options.get("job_id")
        file_path = options.get("file")
        chunk_size = options.get("chunk_size", 5)

        service = IngestionService()

        if file_path:
            if not os.path.exists(file_path):
                raise CommandError(f"File not found: {file_path}")

            self.stdout.write(f"Creating new IngestionJob for: {file_path}")
            job = IngestionJob.objects.create(
                title=options.get("title"),
                subject=options.get("subject"),
                document_kind=DocumentKind.TEXTBOOK,
            )
            with open(file_path, "rb") as f:
                job.source_file.save(os.path.basename(file_path), File(f), save=True)

            self.stdout.write("Initializing document structure & TOC...")
            service.initialize_job(job)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Job #{job.pk} initialized: {job.total_pages} pages, Granularity={job.granularity}, Chapters={job.chapters.count()}"
                )
            )
        elif job_id:
            try:
                job = IngestionJob.objects.get(pk=job_id)
            except IngestionJob.DoesNotExist:
                raise CommandError(f"Job #{job_id} does not exist.")
        else:
            raise CommandError("Please specify either --job-id <ID> or --file <PATH>")

        self.stdout.write(f"Starting chunked processing for Job #{job.pk} (Chunk size: {chunk_size})...")

        while job.status != JobStatus.COMPLETED and job.status != JobStatus.FAILED:
            result = service.process_chunk(job, chunk_size=chunk_size)
            job.refresh_from_db()
            self.stdout.write(
                f"Progress: [{job.processed_pages}/{job.total_pages}] ({job.progress_percentage}%) - {job.current_stage}"
            )
            if result.get("is_finished"):
                break

        if job.status == JobStatus.COMPLETED:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nSuccessfully finished Job #{job.pk}! Total items extracted: {job.items.count()}"
                )
            )
        else:
            self.stdout.write(
                self.style.ERROR(f"\nJob #{job.pk} ended with status: {job.status}. Error: {job.error_message}")
            )
