"""
Ingestion Service.

Orchestrates document initialization, TOC detection, page chunking,
and atomic dataset item creation.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

import pymupdf as fitz
from django.conf import settings
from django.db import transaction

from .extractors.factory import get_extractor
from .models import (
    DocumentKind,
    ExtractedChapter,
    ExtractedItem,
    ExtractedPage,
    IngestionJob,
    ItemType,
    JobStatus,
)
from .storage.drive_client import GoogleDriveClient
from .toc_detector import TocDetector

logger = logging.getLogger(__name__)


class IngestionService:
    """
    Coordinates PDF ingestion and extraction workflow.
    """

    def __init__(self):
        self.toc_detector = TocDetector()
        self.drive_client = GoogleDriveClient()

    def initialize_job(self, job: IngestionJob) -> IngestionJob:
        """
        Inspects the uploaded PDF, detects total pages, granularity, and Table of Contents.
        """
        if not job.source_file or not os.path.exists(job.source_file.path):
            job.status = JobStatus.FAILED
            job.error_message = "Source file does not exist on disk."
            job.save(update_fields=["status", "error_message"])
            return job

        file_path = job.source_file.path
        job.file_size_bytes = os.path.getsize(file_path)

        try:
            doc = fitz.open(file_path)
            job.total_pages = len(doc)

            # Analyze document TOC and granularity
            granularity, toc_entries = self.toc_detector.analyze_document(doc)
            job.granularity = granularity
            job.table_of_contents = toc_entries

            # Create ExtractedChapter records with duplicate protection
            with transaction.atomic():
                job.chapters.all().delete()
                seen_numbers = set()
                for idx, entry in enumerate(toc_entries, start=1):
                    raw_num = entry.get("chapter_number")
                    ch_num = raw_num if (raw_num and raw_num not in seen_numbers) else (max(seen_numbers, default=0) + 1)
                    seen_numbers.add(ch_num)
                    ExtractedChapter.objects.create(
                        job=job,
                        chapter_number=ch_num,
                        title=entry["title"],
                        start_page=entry["start_page"],
                        end_page=entry["end_page"],
                    )

            # Cloud storage backup to Google Drive
            dest_name = f"{job.title.replace(' ', '_')}_{job.pk}.pdf"
            drive_info = self.drive_client.upload_file(file_path, dest_name)
            job.google_drive_file_id = drive_info.get("file_id", "")
            job.google_drive_url = drive_info.get("web_view_link", "")

            job.status = JobStatus.PENDING
            job.current_stage = f"Initialized. {job.total_pages} pages detected. Ready for extraction."
            job.save()

            doc.close()
            return job

        except Exception as e:
            logger.error(f"Failed to initialize IngestionJob #{job.pk}: {e}", exc_info=True)
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.save(update_fields=["status", "error_message"])
            return job

    def process_chunk(self, job: IngestionJob, chunk_size: int = 5) -> Dict[str, Any]:
        """
        Processes the next chunk of pages for an ingestion job.
        Safe for 512MB RAM servers and avoids web request timeouts.
        """
        if job.status == JobStatus.COMPLETED:
            return {
                "job_id": job.pk,
                "status": job.status,
                "processed_pages": job.processed_pages,
                "total_pages": job.total_pages,
                "progress_percentage": 100,
                "is_finished": True,
            }

        file_path = job.source_file.path if job.source_file else ""
        if not file_path or not os.path.exists(file_path):
            job.status = JobStatus.FAILED
            job.error_message = "Source file missing."
            job.save(update_fields=["status", "error_message"])
            return {"error": "Source file missing", "is_finished": True}

        # For digital textbooks, PyMuPDF is ultra-fast in-memory (<35MB RAM).
        # We can process 20 pages per batch to drastically reduce HTTP round-trips over the network.
        if job.document_kind == DocumentKind.TEXTBOOK and chunk_size < 20:
            chunk_size = 20

        doc = fitz.open(file_path)
        total_pages = len(doc)
        start_page = job.processed_pages + 1
        end_page = min(total_pages, start_page + chunk_size - 1)

        job.status = JobStatus.EXTRACTING
        job.save(update_fields=["status"])

        # Determine media extraction dir
        media_root = getattr(settings, "MEDIA_ROOT", "media")
        extracted_media_dir = os.path.join(str(media_root), "extracted_assets", f"job_{job.pk}")

        chapters = list(job.chapters.all())

        try:
            with transaction.atomic():
                # 1. Bulk find existing pages in this chunk to prevent N+1 queries
                existing_pages = {
                    p.page_number: p
                    for p in ExtractedPage.objects.filter(
                        job=job, page_number__gte=start_page, page_number__lte=end_page
                    )
                }

                # Single bulk delete of previous items for these pages if re-extracting
                if existing_pages:
                    ExtractedItem.objects.filter(page__in=existing_pages.values()).delete()

                pages_to_create = []
                pages_to_update = []
                page_data_map = {}

                for p_num in range(start_page, end_page + 1):
                    page_idx = p_num - 1
                    raw_text = doc[page_idx].get_text("text").strip()
                    has_text = len(raw_text) > 40

                    extractor = get_extractor(
                        document_kind=job.document_kind,
                        has_text_layer=has_text,
                        media_dir=extracted_media_dir,
                    )
                    extracted_data = extractor.extract_page(doc, p_num)

                    matched_chapter = None
                    for ch in chapters:
                        if ch.start_page <= p_num <= ch.end_page:
                            matched_chapter = ch
                            break

                    if p_num in existing_pages:
                        page_obj = existing_pages[p_num]
                        page_obj.chapter = matched_chapter
                        page_obj.layout_type = extracted_data.get("layout_type", "SINGLE_COLUMN")
                        page_obj.raw_text = extracted_data.get("raw_text", "")
                        page_obj.structured_content = extracted_data.get("sections", [])
                        pages_to_update.append(page_obj)
                    else:
                        page_obj = ExtractedPage(
                            job=job,
                            page_number=p_num,
                            chapter=matched_chapter,
                            layout_type=extracted_data.get("layout_type", "SINGLE_COLUMN"),
                            raw_text=extracted_data.get("raw_text", ""),
                            structured_content=extracted_data.get("sections", []),
                        )
                        pages_to_create.append(page_obj)

                    page_data_map[p_num] = (page_obj, matched_chapter, extracted_data.get("sections", []))

                # 2. Bulk save ExtractedPages in single queries
                if pages_to_update:
                    ExtractedPage.objects.bulk_update(
                        pages_to_update,
                        ["chapter", "layout_type", "raw_text", "structured_content"],
                    )
                if pages_to_create:
                    # PostgreSQL RETURNING id populates primary keys automatically
                    ExtractedPage.objects.bulk_create(pages_to_create)

                # 3. Prepare all ExtractedItem instances across all pages in the chunk
                items_to_create = []
                for p_num in range(start_page, end_page + 1):
                    page_obj, matched_chapter, sections = page_data_map[p_num]
                    for sec in sections:
                        raw_sec_type = sec.get("type", "PARAGRAPH")
                        sec_type = (
                            raw_sec_type
                            if raw_sec_type in ItemType.values
                            else ItemType.PARAGRAPH
                        )
                        items_to_create.append(
                            ExtractedItem(
                                job=job,
                                page=page_obj,
                                chapter=matched_chapter,
                                item_type=sec_type,
                                heading=sec.get("heading", ""),
                                content=sec.get("text", ""),
                                latex_equations=sec.get("latex_equations", []),
                                image_path=sec.get("image_path", ""),
                                image_caption=sec.get("image_caption", ""),
                                metadata=sec.get("metadata", {}),
                            )
                        )

                # 4. Single multi-row database write for all items
                if items_to_create:
                    ExtractedItem.objects.bulk_create(items_to_create, batch_size=500)

            # Update job progress
            job.processed_pages = end_page
            if job.processed_pages >= total_pages:
                job.status = JobStatus.COMPLETED
                job.current_stage = f"Completed! Successfully structured all {total_pages} pages."
            else:
                progress = job.progress_percentage
                job.current_stage = f"Processing: Pages {start_page}–{end_page} of {total_pages} ({progress}%)."

            job.save(update_fields=["processed_pages", "status", "current_stage"])
            doc.close()

            return {
                "job_id": job.pk,
                "status": job.status,
                "processed_pages": job.processed_pages,
                "total_pages": job.total_pages,
                "progress_percentage": job.progress_percentage,
                "current_stage": job.current_stage,
                "is_finished": job.status == JobStatus.COMPLETED,
            }

        except Exception as e:
            logger.error(f"Error processing chunk for job #{job.pk}: {e}", exc_info=True)
            job.status = JobStatus.FAILED
            job.error_message = f"Error on pages {start_page}–{end_page}: {str(e)}"
            job.save(update_fields=["status", "error_message"])
            doc.close()
            return {"error": str(e), "is_finished": True}
