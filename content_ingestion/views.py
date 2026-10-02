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

from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ExtractedItem, ExtractedPage, IngestionJob
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
