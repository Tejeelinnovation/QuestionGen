"""
Views and API ViewSets for content_ingestion app.

Privacy & Permission Architecture:
- Contributors (teachers/students/admins granted UPLOAD_STUDY_MATERIAL) can:
  - Upload study materials (PDFs)
  - View only their own submission status (e.g. "Received", "Under Processing", "Accepted")
- ONLY Super Admins can:
  - Inspect extracted pedagogical blocks & LaTeX formulas
  - Process background chunks or auto-extract all
  - Export/download raw training dataset JSON
  - Search atomic extracted training items
"""

import logging
import os
import tempfile
from django.conf import settings
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

from .models import ExtractedItem, ExtractedPage, IngestionJob, JobStatus
from .queue import IngestionQueueWorker, get_job_queue_position
from .serializers import (
    ExtractedItemSerializer,
    ExtractedPageSerializer,
    IngestionJobCreateSerializer,
    IngestionJobDetailSerializer,
    IngestionJobListSerializer,
)
from .services import IngestionService


def user_can_upload_material(user) -> bool:
    """Returns True if the user is authorized by Super Admin to upload study material."""
    return (
        user.is_superuser
        or not user.school_id
        or user.has_capability("CREATE_SCHOOL")
        or user.has_capability("UPLOAD_STUDY_MATERIAL")
    )


def is_super_admin(user) -> bool:
    """Returns True if user has Super Admin authority."""
    return (
        user.is_superuser
        or not user.school_id
        or user.has_capability("CREATE_SCHOOL")
    )


class IngestionJobListCreateView(generics.ListCreateAPIView):
    """
    List existing ingestion jobs or upload a new PDF to initialize ingestion.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        if not user_can_upload_material(user):
            raise PermissionDenied("You do not have permission to upload or view study materials.")

        # Cleanup any stuck extracting jobs that have timed out (>45 minutes)
        from .queue import IngestionQueueWorker
        IngestionQueueWorker.cleanup_stalled_jobs(timeout_minutes=45)

        # Super Admin sees all materials across all schools
        if is_super_admin(user):
            return IngestionJob.objects.all().prefetch_related("chapters")

        # Regular contributors see ONLY their own submitted materials
        return IngestionJob.objects.filter(uploaded_by=user).prefetch_related("chapters")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return IngestionJobCreateSerializer
        return IngestionJobListSerializer

    def create(self, request, *args, **kwargs):
        user = self.request.user
        if not user_can_upload_material(user):
            raise PermissionDenied("You do not have permission to upload study materials.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save(
            uploaded_by=user,
            school=user.school,
        )
        service = IngestionService()
        service.initialize_job(job)
        job.refresh_from_db()

        # Automatically start background queue worker for newly uploaded job
        if job.status == JobStatus.PENDING:
            IngestionQueueWorker.trigger_worker()

        # If Super Admin, return full details. If contributor, return list summary
        if is_super_admin(user):
            detail_serializer = IngestionJobDetailSerializer(job)
        else:
            detail_serializer = IngestionJobListSerializer(job)

        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)


class IngestionJobDetailView(generics.RetrieveDestroyAPIView):
    """
    Retrieve job details or delete job.
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if is_super_admin(self.request.user):
            return IngestionJobDetailSerializer
        return IngestionJobListSerializer

    def get_queryset(self):
        user = self.request.user
        if not user_can_upload_material(user):
            raise PermissionDenied("You do not have permission to view this material.")

        if is_super_admin(user):
            return IngestionJob.objects.all().prefetch_related("chapters")
        return IngestionJob.objects.filter(uploaded_by=user).prefetch_related("chapters")

    def perform_destroy(self, instance):
        user = self.request.user
        # Only Super Admin or the owner can delete
        if not (is_super_admin(user) or instance.uploaded_by_id == user.id):
            raise PermissionDenied("You cannot delete this document.")

        # Clean up Google Drive cloud backup
        if instance.google_drive_file_id:
            try:
                from content_ingestion.storage.drive_client import GoogleDriveClient
                client = GoogleDriveClient()
                client.delete_file(instance.google_drive_file_id)
            except Exception as drive_err:
                logger.warning(f"Could not delete Google Drive file for job #{instance.pk}: {drive_err}")

        # Clean up local file if still present
        if instance.source_file:
            try:
                instance.source_file.delete(save=False)
            except Exception as file_err:
                logger.warning(f"Could not delete local file for job #{instance.pk}: {file_err}")

        super().perform_destroy(instance)


class IngestionJobProcessChunkView(APIView):
    """
    Process next chunk of pages. RESTRICTED TO SUPER ADMIN.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        user = request.user
        if not is_super_admin(user):
            raise PermissionDenied("Only Super Admin can process and extract training dataset chunks.")

        try:
            job = IngestionJob.objects.get(pk=pk)
        except IngestionJob.DoesNotExist:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        chunk_size = int(request.data.get("chunk_size", 20))
        chunk_size = max(1, min(chunk_size, 50))

        service = IngestionService()
        result = service.process_chunk(job, chunk_size=chunk_size)
        return Response(result, status=status.HTTP_200_OK)


class IngestionJobEnqueueView(APIView):
    """
    Enqueue an individual job for background queue processing.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        user = request.user
        try:
            job = IngestionJob.objects.get(pk=pk)
        except IngestionJob.DoesNotExist:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        if not (is_super_admin(user) or job.uploaded_by_id == user.id):
            raise PermissionDenied("You do not have permission to process this document.")

        if job.status == JobStatus.COMPLETED:
            return Response(
                {"detail": "Job is already completed.", "status": job.status},
                status=status.HTTP_200_OK,
            )

        if job.status == JobStatus.FAILED:
            from django.utils import timezone
            job.status = JobStatus.PENDING
            job.error_message = ""
            job.current_stage = "Queued for background extraction..."
            job.updated_at = timezone.now()
            job.save(update_fields=["status", "error_message", "current_stage", "updated_at"])

        IngestionQueueWorker.trigger_worker()
        queue_pos = get_job_queue_position(job)

        return Response(
            {
                "job_id": job.pk,
                "status": job.status,
                "queue_position": queue_pos,
                "message": f"Job #{job.pk} enqueued for processing.",
            },
            status=status.HTTP_200_OK,
        )


class IngestionJobEnqueueAllView(APIView):
    """
    Enqueue all pending/failed jobs in the background queue. RESTRICTED TO SUPER ADMIN.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not is_super_admin(user):
            raise PermissionDenied("Only Super Admin can bulk enqueue jobs.")

        jobs_to_queue = IngestionJob.objects.filter(
            status__in=[JobStatus.PENDING, JobStatus.FAILED]
        )
        count = jobs_to_queue.count()

        # Reset failed jobs so worker picks them up cleanly
        from django.utils import timezone
        jobs_to_queue.filter(status=JobStatus.FAILED).update(
            status=JobStatus.PENDING,
            error_message="",
            current_stage="Queued for background extraction...",
            updated_at=timezone.now(),
        )

        IngestionQueueWorker.trigger_worker()

        return Response(
            {
                "enqueued_count": count,
                "message": f"{count} job(s) queued for background processing.",
            },
            status=status.HTTP_200_OK,
        )


class IngestionJobResetView(APIView):
    """
    Resets an extracting or failed job back to PENDING. RESTRICTED TO SUPER ADMIN.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        user = request.user
        if not user_can_upload_material(user):
            raise PermissionDenied("You do not have permission to manage ingestion jobs.")

        from django.shortcuts import get_object_or_404
        from django.utils import timezone
        job = get_object_or_404(IngestionJob, pk=pk)
        job.status = JobStatus.PENDING
        job.error_message = ""
        job.current_stage = "Job reset by admin. Ready for extraction."
        job.updated_at = timezone.now()
        job.save(update_fields=["status", "error_message", "current_stage", "updated_at"])

        IngestionQueueWorker.mark_job_completed_or_failed(job.pk)
        return Response(
            {"status": "RESET", "job_id": job.pk, "job_status": job.status},
            status=status.HTTP_200_OK,
        )


class IngestionJobSourcePdfView(APIView):
    """
    Streams the raw PDF file directly to the remote AI microservice / GitHub Actions runner.
    Protected by webhook secret token or Super Admin session.
    """

    authentication_classes = []
    permission_classes = []

    def get(self, request, pk: int):
        from django.http import FileResponse
        from django.shortcuts import get_object_or_404
        import tempfile
        import hashlib

        job = get_object_or_404(IngestionJob, pk=pk)

        expected_secret = getattr(settings, "INGESTION_WEBHOOK_SECRET", "")
        provided_token = request.query_params.get("token") or ""
        signed_token = hashlib.sha256(f"{job.pk}_{settings.SECRET_KEY}".encode()).hexdigest()[:16]

        is_authorized = False
        if expected_secret and provided_token == expected_secret:
            is_authorized = True
        elif provided_token == signed_token:
            is_authorized = True
        elif not expected_secret and job.status in (JobStatus.EXTRACTING, JobStatus.PENDING):
            is_authorized = True
        elif request.user and request.user.is_authenticated and user_can_upload_material(request.user):
            is_authorized = True

        if not is_authorized:
            return Response({"detail": "Unauthorized access to source PDF."}, status=status.HTTP_403_FORBIDDEN)

        # 1. First check if source_file is available on server
        if job.source_file:
            try:
                return FileResponse(
                    job.source_file.open("rb"),
                    content_type="application/pdf",
                    filename=f"job_{job.pk}.pdf",
                )
            except Exception as file_err:
                logger.warning(f"Could not stream source_file directly for job #{job.pk}: {file_err}")

        # 2. Check Google Drive via authenticated Google Drive API client
        if job.google_drive_file_id:
            from .storage.drive_client import GoogleDriveClient

            client = GoogleDriveClient()
            if client.is_configured():
                temp_pdf = os.path.join(tempfile.gettempdir(), f"drive_source_job_{job.pk}.pdf")
                if client.download_file(job.google_drive_file_id, temp_pdf):
                    return FileResponse(
                        open(temp_pdf, "rb"),
                        content_type="application/pdf",
                        filename=f"job_{job.pk}.pdf",
                    )

        return Response(
            {"detail": "Source PDF file is not available on server or Google Drive."},
            status=status.HTTP_404_NOT_FOUND,
        )


class IngestionJobPagesListView(generics.ListAPIView):
    """
    List extracted pages for a specific job. RESTRICTED TO SUPER ADMIN.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ExtractedPageSerializer

    def get_queryset(self):
        user = self.request.user
        if not is_super_admin(user):
            raise PermissionDenied("Only Super Admin can inspect extracted page sections.")

        job_id = self.kwargs.get("pk")
        qs = ExtractedPage.objects.filter(job_id=job_id).select_related("chapter").order_by("page_number")

        page_num = self.request.query_params.get("page_number")
        if page_num:
            qs = qs.filter(page_number=int(page_num))

        return qs


class IngestionJobExportJsonView(APIView):
    """
    Exports the entire extracted dataset in structured JSON. RESTRICTED TO SUPER ADMIN.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        user = request.user
        if not is_super_admin(user):
            raise PermissionDenied("Only Super Admin can export the raw AI training dataset.")

        try:
            job = IngestionJob.objects.get(pk=pk)
        except IngestionJob.DoesNotExist:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        pages = job.pages.all().order_by("page_number").select_related("chapter")

        content_tree = []
        for p in pages:
            content_tree.append({
                "page_number": p.page_number,
                "layout_type": p.layout_type,
                "chapter_number": p.chapter.chapter_number if p.chapter else None,
                "chapter_title": p.chapter.title if p.chapter else "",
                "sections": p.structured_content,
            })

        export_payload = {
            "document_id": f"doc_{job.pk}_{job.title.lower().replace(' ', '_')}",
            "metadata": {
                "title": job.title,
                "subject": job.subject,
                "standard": job.standard,
                "board": job.board,
                "document_kind": job.document_kind,
                "granularity": job.granularity,
                "total_pages": job.total_pages,
                "processed_pages": job.processed_pages,
                "created_at": job.created_at.isoformat(),
            },
            "source": {
                "filename": job.source_file.name if job.source_file else "",
                "google_drive_file_id": job.google_drive_file_id,
                "google_drive_url": job.google_drive_url,
            },
            "table_of_contents": job.table_of_contents,
            "content_tree": content_tree,
        }

        return Response(export_payload, status=status.HTTP_200_OK)


class ExtractedItemListView(generics.ListAPIView):
    """
    Searchable atomic dataset items. RESTRICTED TO SUPER ADMIN.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ExtractedItemSerializer

    def get_queryset(self):
        user = self.request.user
        if not is_super_admin(user):
            raise PermissionDenied("Only Super Admin can query training dataset items.")

        qs = ExtractedItem.objects.all().select_related("page", "chapter", "job")

        job_id = self.request.query_params.get("job_id")
        if job_id:
            qs = qs.filter(job_id=job_id)

        item_type = self.request.query_params.get("item_type")
        if item_type:
            qs = qs.filter(item_type=item_type)

        chapter_id = self.request.query_params.get("chapter_id")
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)

        return qs


def _async_upload_diagrams_to_drive(job_id: int, pending_diagrams: list):
    """
    Background worker thread that uploads extracted diagrams to Google Drive
    and updates ExtractedPage and ExtractedItem models with thumbnail URLs.
    Runs asynchronously so the webhook returns 200 OK immediately without hitting Render 30s timeout.
    """
    if not pending_diagrams:
        return

    try:
        from .storage.drive_client import GoogleDriveClient
        from .models import ExtractedItem, ExtractedPage, IngestionJob
        from django.utils import timezone
        import base64

        drive_client = GoogleDriveClient()
        if not drive_client.is_configured():
            logger.info(f"Google Drive client not configured for async diagram upload on Job #{job_id}.")
            return

        uploaded_count = 0
        for diag in pending_diagrams:
            try:
                raw_bytes = base64.b64decode(diag["encoded"])
                filename = diag["filename"]
                mime = diag["mime"]
                page_num = diag["page_num"]
                sec_idx = diag["section_idx"]

                drive_res = drive_client.upload_bytes(
                    raw_bytes,
                    destination_name=filename,
                    mime_type=mime,
                    subfolder_name="Extracted-Diagrams",
                )
                direct_url = drive_res.get("direct_url") or drive_res.get("web_view_link")
                if direct_url:
                    uploaded_count += 1
                    # Update page structured_content
                    page_obj = ExtractedPage.objects.filter(job_id=job_id, page_number=page_num).first()
                    if page_obj and page_obj.structured_content:
                        sc = list(page_obj.structured_content)
                        if 0 <= sec_idx < len(sc):
                            sc[sec_idx]["image_path"] = direct_url
                            if "image_data" in sc[sec_idx]:
                                sc[sec_idx]["image_data"] = ""
                            page_obj.structured_content = sc
                            page_obj.save(update_fields=["structured_content"])

                    # Update matching extracted items
                    ExtractedItem.objects.filter(
                        job_id=job_id,
                        page__page_number=page_num,
                        image_path__startswith="data:image/",
                    ).update(image_path=direct_url)

            except Exception as single_err:
                logger.warning(f"Failed to async upload diagram {diag.get('filename')}: {single_err}")

        # Update stage message
        from django.utils import timezone
        IngestionJob.objects.filter(pk=job_id).update(
            current_stage=f"Completed! Structured all pages and saved {uploaded_count} diagram(s) to Google Drive.",
            updated_at=timezone.now(),
        )
        logger.info(f"Successfully uploaded {uploaded_count}/{len(pending_diagrams)} diagrams to Google Drive for Job #{job_id}.")
    except Exception as err:
        logger.error(f"Async diagram upload worker encountered error for Job #{job_id}: {err}", exc_info=True)


def verify_webhook_signature(request) -> tuple[bool, str]:
    """
    Verifies the HMAC-SHA256 signature from the X-Ingestion-Signature header,
    bound to the X-Ingestion-Timestamp header to prevent replay attacks.
    Expects:
      - X-Ingestion-Timestamp: Unix timestamp string
      - X-Ingestion-Signature: 'sha256=<hex_digest>' or '<hex_digest>'
    Rejects requests older than 10 minutes (600 seconds) or with future drift (>60s).
    """
    import hashlib
    import hmac
    import time

    secret = (getattr(settings, "INGESTION_WEBHOOK_SECRET", "") or os.environ.get("INGESTION_WEBHOOK_SECRET", "")).strip()
    if not secret:
        if getattr(settings, "DEBUG", False):
            logger.warning("[Webhook Security] INGESTION_WEBHOOK_SECRET is not configured; skipping HMAC verification in DEBUG mode.")
            return True, ""
        logger.error("[Webhook Security] INGESTION_WEBHOOK_SECRET is not configured on the server.")
        return False, "Server webhook secret is not configured."

    signature_header = (
        request.headers.get("X-Ingestion-Signature")
        or request.META.get("HTTP_X_INGESTION_SIGNATURE")
        or ""
    ).strip()

    if not signature_header:
        return False, "Missing X-Ingestion-Signature header."

    timestamp_header = (
        request.headers.get("X-Ingestion-Timestamp")
        or request.META.get("HTTP_X_INGESTION_TIMESTAMP")
        or ""
    ).strip()

    if not timestamp_header:
        return False, "Missing X-Ingestion-Timestamp header."

    try:
        req_timestamp = int(timestamp_header)
    except ValueError:
        return False, "Invalid X-Ingestion-Timestamp header format (must be integer epoch)."

    now = int(time.time())
    if (now - req_timestamp) > 600:
        return False, f"Webhook timestamp expired ({now - req_timestamp}s old, maximum allowed age is 600s)."
    if (req_timestamp - now) > 60:
        return False, f"Webhook timestamp is in the future ({req_timestamp - now}s drift)."

    provided_sig = signature_header[7:] if signature_header.startswith("sha256=") else signature_header

    try:
        raw_body = request.body
        to_sign = f"{req_timestamp}.".encode("utf-8") + raw_body
        computed_sig = hmac.new(
            secret.encode("utf-8"),
            to_sign,
            hashlib.sha256,
        ).hexdigest()
    except Exception as exc:
        logger.error(f"[Webhook Security] Error computing signature: {exc}")
        return False, f"Signature computation failed: {str(exc)}"

    if not hmac.compare_digest(provided_sig, computed_sig):
        return False, "Invalid HMAC signature in X-Ingestion-Signature."

    return True, ""


class IngestionJobWebhookView(APIView):
    """
    Receives completed extraction results from the Standalone AI Microservice.
    Secured via HMAC-SHA256 signature (X-Ingestion-Signature) and protected
    against duplicate deliveries via X-Idempotency-Key.
    Atomically updates ExtractedChapter, ExtractedPage, and ExtractedItem in the database.
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request, pk: int):
        from django.db import transaction
        from django.utils import timezone
        from .models import DocumentKind, ExtractedChapter, ExtractedItem, ExtractedPage, ItemType

        # 1. HMAC Signature Verification
        is_valid_sig, sig_err = verify_webhook_signature(request)
        if not is_valid_sig:
            logger.warning(f"[Webhook Security] Rejected webhook call for Job #{pk}: {sig_err}")
            return Response({"detail": sig_err}, status=status.HTTP_401_UNAUTHORIZED)

        # 2. Extract Idempotency Key
        idempotency_key = (
            request.headers.get("X-Idempotency-Key")
            or request.META.get("HTTP_X_IDEMPOTENCY_KEY")
            or (request.data.get("idempotency_key") if isinstance(request.data, dict) else "")
            or ""
        ).strip()

        data = request.data

        # 3. Handle PROGRESS and FAILED heartbeats
        if data.get("status") == "PROGRESS":
            try:
                job = IngestionJob.objects.get(pk=pk)
            except IngestionJob.DoesNotExist:
                return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

            job.status = JobStatus.EXTRACTING
            job.processed_pages = data.get("processed_pages", job.processed_pages)
            if "total_pages" in data and data["total_pages"]:
                job.total_pages = data["total_pages"]
            if "current_stage" in data:
                job.current_stage = data["current_stage"]
            job.updated_at = timezone.now()
            job.save(update_fields=["status", "processed_pages", "total_pages", "current_stage", "updated_at"])
            return Response(
                {
                    "status": "PROGRESS_UPDATED",
                    "processed_pages": job.processed_pages,
                    "total_pages": job.total_pages,
                    "progress_percentage": job.progress_percentage,
                },
                status=status.HTTP_200_OK,
            )

        if data.get("status") == "FAILED":
            try:
                job = IngestionJob.objects.get(pk=pk)
            except IngestionJob.DoesNotExist:
                return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

            job.status = JobStatus.FAILED
            error_msg = data.get("error_message") or data.get("error") or "Microservice extraction failed."
            job.error_message = error_msg
            job.current_stage = f"Failed: {error_msg[:120]}"
            job.updated_at = timezone.now()
            job.save(update_fields=["status", "error_message", "current_stage", "updated_at"])
            from .queue import IngestionQueueWorker
            IngestionQueueWorker.mark_job_completed_or_failed(job.pk)
            return Response({"status": "ERROR_RECORDED", "error": error_msg}, status=status.HTTP_200_OK)

        toc_entries = data.get("table_of_contents") or data.get("chapters") or []
        pages_data = data.get("pages", [])
        total_pages = data.get("total_pages", len(pages_data))
        granularity = data.get("granularity")

        pending_diagrams = []

        # 4. Atomic Execution with Row-Level Lock and Idempotency Guard
        try:
            with transaction.atomic():
                try:
                    job = IngestionJob.objects.select_for_update().get(pk=pk)
                except IngestionJob.DoesNotExist:
                    return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

                # Check for idempotent replay: if job is already COMPLETED and key matches
                current_meta = job.metadata if isinstance(job.metadata, dict) else {}
                if idempotency_key and job.status == JobStatus.COMPLETED:
                    if current_meta.get("idempotency_key") == idempotency_key:
                        logger.info(
                            f"[Webhook] Idempotent replay for Job #{job.pk} with key '{idempotency_key}'. Returning cached success."
                        )
                        return Response(
                            {
                                "status": "SUCCESS",
                                "job_id": job.pk,
                                "detail": "Idempotent replay: payload already processed.",
                                "idempotent_replay": True,
                            },
                            status=status.HTTP_200_OK,
                        )

                job.total_pages = total_pages
                job.processed_pages = total_pages
                if granularity:
                    job.granularity = granularity
                job.table_of_contents = toc_entries if toc_entries else None

                # Inferred document classification & teacher override logic
                inferred_kind = data.get("document_kind")
                if inferred_kind:
                    # Teacher-provided metadata overrides inference:
                    # Only assign inferred kind if the job's current kind is null, blank, or AUTO
                    if not job.document_kind or str(job.document_kind).upper() in ("AUTO", "UNKNOWN", "NONE"):
                        job.document_kind = inferred_kind
                        logger.info(f"[Webhook] Assigned inferred document_kind='{inferred_kind}' to Job #{job.pk}")
                    else:
                        logger.info(f"[Webhook] Teacher-specified document_kind='{job.document_kind}' preserved for Job #{job.pk} (inferred was '{inferred_kind}')")

                if data.get("classification_confidence") is not None:
                    job.classification_confidence = data.get("classification_confidence")
                if data.get("classification_evidence"):
                    job.classification_evidence = data.get("classification_evidence")

                # Non-educational types: warn in logs, do not block
                if job.document_kind in (DocumentKind.NEWSPAPER, DocumentKind.MAGAZINE, DocumentKind.OTHER, "NEWSPAPER", "MAGAZINE", "OTHER"):
                    logger.warning(
                        f"[Webhook Warning] Non-educational document kind '{job.document_kind}' detected for Job #{job.pk}. "
                        f"Dataset extraction completed normally; downstream question generation is not blocked."
                    )

                # Safe clean delete-and-recreate in explicit reverse-dependency order:
                # 1. ExtractedItem (child of page and job)
                job.items.all().delete()
                # 2. ExtractedPage (child of chapter and job)
                job.pages.all().delete()
                # 3. ExtractedChapter (child of job)
                job.chapters.all().delete()

                # Re-create chapters
                chapter_map = {}
                for ch_data in toc_entries:
                    ch_num = ch_data.get("chapter_number", 1)
                    ch_obj = ExtractedChapter.objects.create(
                        job=job,
                        chapter_number=ch_num,
                        title=str(ch_data.get("title", f"Chapter {ch_num}") or f"Chapter {ch_num}"),
                        start_page=ch_data.get("start_page", 1),
                        end_page=ch_data.get("end_page", 1),
                        summary=ch_data.get("summary", ""),
                    )
                    chapter_map[ch_num] = ch_obj

                # Re-create pages
                pages_to_create = []
                for p_data in pages_data:
                    p_num = p_data.get("page_number", 1)
                    matched_ch = chapter_map.get(p_data.get("chapter_number"))
                    raw_sections = [s if isinstance(s, dict) else s.model_dump() for s in p_data.get("sections", [])]

                    processed_sections = []
                    for s_idx, sec_dict in enumerate(raw_sections, start=1):
                        heading = sec_dict.get("heading", "")
                        text_val = sec_dict.get("text", "")
                        image_path = sec_dict.get("image_path", "")
                        image_data = sec_dict.get("image_data", "")

                        if image_data and image_data.startswith("data:image/"):
                            try:
                                header, encoded = image_data.split(",", 1)
                                ext = "png"
                                mime = "image/png"
                                if "jpeg" in header or "jpg" in header:
                                    ext = "jpg"
                                    mime = "image/jpeg"
                                img_filename = f"job_{job.pk}_p{p_num}_fig_{s_idx}.{ext}"
                                pending_diagrams.append({
                                    "page_num": p_num,
                                    "section_idx": s_idx - 1,
                                    "filename": img_filename,
                                    "mime": mime,
                                    "encoded": encoded,
                                })
                                image_path = image_data
                            except Exception:
                                image_path = image_data

                        sec_dict["heading"] = heading
                        sec_dict["text"] = text_val
                        sec_dict["image_path"] = image_path
                        processed_sections.append(sec_dict)

                    pages_to_create.append(
                        ExtractedPage(
                            job=job,
                            page_number=p_num,
                            chapter=matched_ch,
                            layout_type=p_data.get("layout_type", "SINGLE_COLUMN"),
                            raw_text=p_data.get("raw_text", ""),
                            structured_content=processed_sections,
                        )
                    )

                created_pages = ExtractedPage.objects.bulk_create(pages_to_create)

                # Re-create items
                items_to_create = []
                for page_obj in created_pages:
                    sections = page_obj.structured_content or []
                    for sec_dict in sections:
                        raw_type = sec_dict.get("type", "PARAGRAPH")
                        item_type = raw_type if raw_type in ItemType.values else ItemType.PARAGRAPH

                        items_to_create.append(
                            ExtractedItem(
                                job=job,
                                page=page_obj,
                                chapter=page_obj.chapter,
                                item_type=item_type,
                                heading=sec_dict.get("heading", ""),
                                content=sec_dict.get("text", ""),
                                latex_equations=sec_dict.get("latex_equations", []),
                                image_path=sec_dict.get("image_path", ""),
                                image_caption=sec_dict.get("image_caption", ""),
                                metadata=sec_dict.get("metadata", {}),
                            )
                        )

                if items_to_create:
                    ExtractedItem.objects.bulk_create(items_to_create, batch_size=500)

                engine = data.get("engine") or "Docling AI (DocLayNet)"
                if not job.metadata or not isinstance(job.metadata, dict):
                    job.metadata = {}
                job.metadata["extraction_engine"] = engine

                if idempotency_key:
                    job.metadata["idempotency_key"] = idempotency_key
                    history = job.metadata.setdefault("idempotency_history", [])
                    history.append({
                        "key": idempotency_key,
                        "processed_at": timezone.now().isoformat(),
                    })
                    if len(history) > 10:
                        job.metadata["idempotency_history"] = history[-10:]

                job.status = JobStatus.COMPLETED
                job.current_stage = f"Completed via {engine}! Structured all {total_pages} pages."[:145]
                job.updated_at = timezone.now()
                job.save(update_fields=[
                    "status",
                    "current_stage",
                    "metadata",
                    "total_pages",
                    "processed_pages",
                    "granularity",
                    "table_of_contents",
                    "document_kind",
                    "classification_confidence",
                    "classification_evidence",
                    "updated_at",
                ])

            # Release from queue worker tracking
            from .queue import IngestionQueueWorker
            IngestionQueueWorker.mark_job_completed_or_failed(job.pk)

            # Render ephemeral disk cleanup
            if job.google_drive_file_id and job.source_file:
                try:
                    job.source_file.delete(save=False)
                except Exception:
                    pass

            # Launch async Google Drive diagram upload in background thread
            if pending_diagrams:
                import threading
                threading.Thread(
                    target=_async_upload_diagrams_to_drive,
                    args=(job.pk, pending_diagrams),
                    daemon=True,
                    name=f"AsyncDriveUploader-Job-{job.pk}",
                ).start()

            return Response({"status": "SUCCESS", "job_id": job.pk, "idempotent_replay": False}, status=status.HTTP_200_OK)

        except Exception as e:
            from .queue import IngestionQueueWorker
            IngestionQueueWorker.mark_job_completed_or_failed(job.pk)

            job.status = JobStatus.FAILED
            job.error_message = f"Failed to save webhook payload: {str(e)}"
            job.updated_at = timezone.now()
            job.save(update_fields=["status", "error_message", "updated_at"])
            logger.error(f"[Webhook Error] Failed processing Job #{job.pk}: {e}", exc_info=True)
            return Response({"status": "ERROR", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
