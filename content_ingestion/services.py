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

    def ensure_source_file_available(self, job: IngestionJob) -> Optional[str]:
        """
        Ensures that the source PDF exists on the server's local storage.
        If the server restarted and the file is missing locally, automatically
        downloads it from the Google Drive cloud backup.
        """
        file_path = ""
        try:
            if job.source_file and hasattr(job.source_file, "path"):
                file_path = job.source_file.path
        except Exception:
            file_path = ""

        # 1. If file already exists and is non-empty on disk, return immediately
        if file_path and os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            return file_path

        # 2. Determine target path on server disk
        media_root = getattr(settings, "MEDIA_ROOT", "media")
        if not file_path:
            safe_title = "".join(c for c in job.title if c.isalnum() or c in (" ", "_", "-")).rstrip()
            safe_title = safe_title.replace(" ", "_") or "document"
            file_path = os.path.join(str(media_root), "ingestion_raw", f"{safe_title}_{job.pk}.pdf")

        # 3. Attempt to auto-restore from Google Drive cloud backup
        if job.google_drive_file_id:
            logger.info(
                f"Local PDF missing for Job #{job.pk}. Auto-restoring from Google Drive (ID: {job.google_drive_file_id})..."
            )
            # Update stage so UI (Mobile, Tablet, Desktop) informs user in real-time
            job.current_stage = "Restoring PDF from Google Drive cloud backup..."
            job.save(update_fields=["current_stage"])

            os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
            success = self.drive_client.download_file(job.google_drive_file_id, file_path)

            if success and os.path.exists(file_path):
                logger.info(f"Successfully restored Job #{job.pk} PDF from Google Drive to {file_path}")
                try:
                    rel_path = os.path.relpath(file_path, str(media_root)).replace("\\", "/")
                    if not job.source_file or not job.source_file.name or job.source_file.name != rel_path:
                        job.source_file.name = rel_path
                        job.file_size_bytes = os.path.getsize(file_path)
                        job.save(update_fields=["source_file", "file_size_bytes"])
                except Exception as e:
                    logger.warning(f"Could not update source_file.name for Job #{job.pk}: {e}")
                return file_path
            else:
                logger.error(f"Failed to restore Job #{job.pk} from Google Drive.")

        return None

    def _trigger_async_drive_backup(self, job_id: int, file_path: str, dest_name: str) -> None:
        """
        Uploads the source PDF to Google Drive asynchronously in a background daemon thread.
        Guarantees that large uploads (50MB+) do not block HTTP requests or trigger Gunicorn worker timeouts.
        """
        import threading

        def _worker():
            try:
                logger.info(f"[Drive-Backup] Starting async cloud backup for Job #{job_id} ({dest_name})...")
                drive_info = self.drive_client.upload_file(file_path, dest_name)
                file_id = drive_info.get("file_id", "")
                web_link = drive_info.get("web_view_link", "")
                if file_id:
                    IngestionJob.objects.filter(pk=job_id).update(
                        google_drive_file_id=file_id,
                        google_drive_url=web_link,
                    )
                    logger.info(f"[Drive-Backup] Successfully backed up Job #{job_id} to Google Drive (file_id: {file_id})")
            except Exception as e:
                logger.warning(f"[Drive-Backup] Async Google Drive backup failed for Job #{job_id}: {e}")

        thread = threading.Thread(
            target=_worker,
            name=f"DriveBackup-Job-{job_id}",
            daemon=True,
        )
        thread.start()

    def initialize_job(self, job: IngestionJob) -> IngestionJob:
        """
        Inspects the uploaded PDF, detects total pages, granularity, and Table of Contents.
        """
        file_path = self.ensure_source_file_available(job)
        if not file_path:
            job.status = JobStatus.FAILED
            job.error_message = "Source file does not exist on disk and could not be retrieved from Google Drive."
            job.save(update_fields=["status", "error_message"])
            return job

        MAX_FILE_SIZE_BYTES = int(os.environ.get("MAX_FILE_SIZE_BYTES", str(100 * 1024 * 1024)))  # 100 MB limit
        MAX_PAGES = int(os.environ.get("MAX_PAGES", "250"))  # 250 pages limit

        job.file_size_bytes = os.path.getsize(file_path)
        if job.file_size_bytes > MAX_FILE_SIZE_BYTES:
            size_mb = job.file_size_bytes / (1024 * 1024)
            job.status = JobStatus.FAILED
            job.error_message = f"Uploaded file ({size_mb:.1f} MB) exceeds maximum allowed size of 100 MB."
            job.current_stage = "Upload rejected: file size exceeds 100MB limit."
            job.save(update_fields=["status", "error_message", "current_stage", "file_size_bytes"])
            return job

        try:
            doc = fitz.open(file_path)
            job.total_pages = len(doc)
            if job.total_pages > MAX_PAGES:
                doc.close()
                job.status = JobStatus.FAILED
                job.error_message = (
                    f"Document has {job.total_pages} pages, which exceeds the limit of {MAX_PAGES} pages. "
                    "Please split large books into individual chapters for optimal processing."
                )
                job.current_stage = f"Document rejected: exceeds maximum length of {MAX_PAGES} pages."
                job.save(update_fields=["status", "error_message", "current_stage", "total_pages"])
                return job

            # Analyze document TOC and granularity
            granularity, toc_entries = self.toc_detector.analyze_document(doc)
            job.granularity = granularity
            job.table_of_contents = toc_entries if toc_entries else None

            # Evidence-based document classification (with teacher override)
            if not job.document_kind or str(job.document_kind).upper() in ("AUTO", "UNKNOWN", "NONE"):
                from .document_classifier import classify_document
                class_res = classify_document(file_path, user_document_kind=job.document_kind, doc_title=job.title)
                job.document_kind = class_res.kind
                job.classification_confidence = class_res.confidence
                job.classification_evidence = class_res.evidence
                logger.info(f"[IngestionService] Inferred Job #{job.pk} document_kind='{class_res.kind}' (conf={class_res.confidence})")
            else:
                logger.info(f"[IngestionService] Preserved teacher-specified document_kind='{job.document_kind}' for Job #{job.pk}")

            # Non-educational types: warn in logs, do not block
            if job.document_kind in (DocumentKind.NEWSPAPER, DocumentKind.MAGAZINE, DocumentKind.OTHER, "NEWSPAPER", "MAGAZINE", "OTHER"):
                logger.warning(
                    f"[IngestionService Warning] Non-educational document kind '{job.document_kind}' detected for Job #{job.pk}. "
                    f"Extraction will proceed normally without blocking."
                )

            # Create ExtractedChapter records with duplicate protection (only if TOC exists)
            with transaction.atomic():
                job.chapters.all().delete()
                seen_numbers = set()
                for idx, entry in enumerate(toc_entries or [], start=1):
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

            doc.close()

            job.status = JobStatus.PENDING
            job.current_stage = f"Initialized. {job.total_pages} pages detected. Ready for extraction."
            job.save()

            # Cloud storage backup to Google Drive (Non-blocking / Background thread)
            # Guarantees that large files (50MB+) do not block HTTP response or trigger Gunicorn timeouts
            import re
            clean_title = re.sub(r"[^\w\.-]", "_", job.title)[:60].strip("_") or "doc"
            dest_name = f"{clean_title}_{job.pk}.pdf"
            self._trigger_async_drive_backup(job.pk, file_path, dest_name)

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
        Automatically restores PDF from Google Drive if the server restarted.
        """
        if job.status == JobStatus.COMPLETED:
            return {
                "job_id": job.pk,
                "status": job.status,
                "processed_pages": job.processed_pages,
                "total_pages": job.total_pages,
                "progress_percentage": 100,
                "current_stage": job.current_stage,
                "is_finished": True,
            }

        file_path = self.ensure_source_file_available(job)
        if not file_path:
            job.status = JobStatus.FAILED
            job.error_message = "Source file missing on server and could not be restored from Google Drive."
            job.save(update_fields=["status", "error_message"])
            return {"error": job.error_message, "is_finished": True}

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
                                heading=sec.get("heading") or "",
                                content=(sec.get("text") or sec.get("image_description") or ""),
                                latex_equations=sec.get("latex_equations") or [],
                                image_path=sec.get("image_path") or "",
                                image_caption=sec.get("image_caption") or "",
                                image_label=sec.get("image_label") or "",
                                image_description=sec.get("image_description") or "",
                                metadata=sec.get("metadata") or {},
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

            # Disk Space Optimization:
            # Once extraction is 100% complete and verified backed up in Google Drive,
            # clean up the temporary PDF from server disk so Render/server storage never gets full!
            if job.status == JobStatus.COMPLETED and job.google_drive_file_id:
                try:
                    if file_path and os.path.exists(file_path):
                        os.remove(file_path)
                        logger.info(
                            f"Cleaned up temporary local PDF for completed Job #{job.pk} ({file_path}) to conserve server disk space."
                        )
                except Exception as cleanup_err:
                    logger.warning(f"Could not clean up temporary local file for Job #{job.pk}: {cleanup_err}")


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
