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

from django.conf import settings
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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

        # Cleanup any stuck extracting jobs that have timed out (>2 minutes)
        from .queue import IngestionQueueWorker
        IngestionQueueWorker.cleanup_stalled_jobs(timeout_minutes=2)

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
            job.status = JobStatus.PENDING
            job.error_message = ""
            job.current_stage = "Queued for background extraction..."
            job.save(update_fields=["status", "error_message", "current_stage"])

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
        jobs_to_queue.filter(status=JobStatus.FAILED).update(
            status=JobStatus.PENDING,
            error_message="",
            current_stage="Queued for background extraction...",
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
        job = get_object_or_404(IngestionJob, pk=pk)
        job.status = JobStatus.PENDING
        job.error_message = ""
        job.current_stage = "Job reset by admin. Ready for extraction."
        job.save(update_fields=["status", "error_message", "current_stage"])

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
        provided_token = request.query_params.get("token") or request.headers.get("X-Ingestion-Secret", "")
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

        # 1. First check if source_file is available on server disk
        if job.source_file:
            try:
                if os.path.exists(job.source_file.path):
                    return FileResponse(
                        open(job.source_file.path, "rb"),
                        content_type="application/pdf",
                        filename=f"job_{job.pk}.pdf",
                    )
            except Exception:
                pass

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


class IngestionJobWebhookView(APIView):
    """
    Receives completed extraction results from the Standalone AI Microservice.
    Atomically updates ExtractedChapter, ExtractedPage, and ExtractedItem in the database.
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request, pk: int):
        from django.db import transaction
        from .models import ExtractedChapter, ExtractedItem, ExtractedPage, ItemType

        try:
            job = IngestionJob.objects.get(pk=pk)
        except IngestionJob.DoesNotExist:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        if data.get("status") == "FAILED":
            job.status = JobStatus.FAILED
            error_msg = data.get("error_message") or data.get("error") or "Microservice extraction failed."
            job.error_message = error_msg
            job.current_stage = f"Failed: {error_msg[:120]}"
            job.save(update_fields=["status", "error_message", "current_stage"])
            from .queue import IngestionQueueWorker
            IngestionQueueWorker.mark_job_completed_or_failed(job.pk)
            return Response({"status": "ERROR_RECORDED", "error": error_msg}, status=status.HTTP_200_OK)

        toc_entries = data.get("table_of_contents", [])
        pages_data = data.get("pages", [])
        total_pages = data.get("total_pages", len(pages_data))
        granularity = data.get("granularity", job.granularity)

        try:
            with transaction.atomic():
                job.total_pages = total_pages
                job.processed_pages = total_pages
                job.granularity = granularity
                job.table_of_contents = toc_entries

                # 1. Populate Chapters
                job.chapters.all().delete()
                chapter_map = {}
                for ch_data in toc_entries:
                    ch_num = ch_data.get("chapter_number", 1)
                    ch_obj = ExtractedChapter.objects.create(
                        job=job,
                        chapter_number=ch_num,
                        title=ch_data.get("title", f"Chapter {ch_num}"),
                        start_page=ch_data.get("start_page", 1),
                        end_page=ch_data.get("end_page", 1),
                        summary=ch_data.get("summary", ""),
                    )
                    chapter_map[ch_num] = ch_obj

                # 2. Populate Pages
                job.pages.all().delete()
                from .krutidev import krutidev_to_unicode
                from .storage.drive_client import GoogleDriveClient
                import base64

                drive_client = GoogleDriveClient()
                is_drive_active = drive_client.is_configured()

                pages_to_create = []
                for p_data in pages_data:
                    p_num = p_data.get("page_number", 1)
                    matched_ch = chapter_map.get(p_data.get("chapter_number"))
                    raw_sections = [s if isinstance(s, dict) else s.model_dump() for s in p_data.get("sections", [])]

                    # Process sections: convert KrutiDev and upload diagrams directly to Google Drive
                    processed_sections = []
                    for s_idx, sec_dict in enumerate(raw_sections, start=1):
                        heading = krutidev_to_unicode(sec_dict.get("heading", ""))
                        text_val = krutidev_to_unicode(sec_dict.get("text", ""))
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
                                raw_bytes = base64.b64decode(encoded)
                                img_filename = f"job_{job.pk}_p{p_num}_fig_{s_idx}.{ext}"

                                if is_drive_active:
                                    drive_res = drive_client.upload_bytes(raw_bytes, destination_name=img_filename, mime_type=mime)
                                    image_path = drive_res.get("direct_url") or drive_res.get("web_view_link") or image_data
                                else:
                                    image_path = image_data
                            except Exception as img_err:
                                logger.warning(f"Could not upload image to Drive: {img_err}")
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
                            raw_text=krutidev_to_unicode(p_data.get("raw_text", "")),
                            structured_content=processed_sections,
                        )
                    )

                created_pages = ExtractedPage.objects.bulk_create(pages_to_create)

                # 3. Populate Items
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

                job.status = JobStatus.COMPLETED
                job.current_stage = f"Completed via AI Microservice! Structured all {total_pages} pages."
                job.save()

            # Release from queue worker tracking
            from .queue import IngestionQueueWorker
            IngestionQueueWorker.mark_job_completed_or_failed(job.pk)

            # Render ephemeral disk cleanup
            if job.google_drive_file_id and job.source_file:
                try:
                    job.source_file.delete(save=False)
                except Exception:
                    pass

            return Response({"status": "SUCCESS", "job_id": job.pk}, status=status.HTTP_200_OK)

        except Exception as e:
            from .queue import IngestionQueueWorker
            IngestionQueueWorker.mark_job_completed_or_failed(job.pk)

            job.status = JobStatus.FAILED
            job.error_message = f"Failed to save webhook payload: {str(e)}"
            job.save(update_fields=["status", "error_message"])
            return Response({"status": "ERROR", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
