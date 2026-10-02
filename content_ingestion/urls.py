"""
URL configuration for content_ingestion app.
"""

from django.urls import path

from .views import (
    ExtractedItemListView,
    IngestionJobDetailView,
    IngestionJobEnqueueAllView,
    IngestionJobEnqueueView,
    IngestionJobExportJsonView,
    IngestionJobListCreateView,
    IngestionJobPagesListView,
    IngestionJobProcessChunkView,
    IngestionJobResetView,
    IngestionJobSourcePdfView,
    IngestionJobWebhookView,
)

urlpatterns = [
    # Jobs list and create: GET /api/ingest/jobs/, POST /api/ingest/jobs/
    path("jobs/", IngestionJobListCreateView.as_view(), name="job-list-create"),
    # Bulk enqueue all pending/failed jobs: POST /api/ingest/jobs/enqueue-all/
    path("jobs/enqueue-all/", IngestionJobEnqueueAllView.as_view(), name="job-enqueue-all"),
    # Job detail & delete: GET /api/ingest/jobs/{id}/, DELETE /api/ingest/jobs/{id}/
    path("jobs/<int:pk>/", IngestionJobDetailView.as_view(), name="job-detail"),
    # Reset job back to PENDING: POST /api/ingest/jobs/{id}/reset/
    path("jobs/<int:pk>/reset/", IngestionJobResetView.as_view(), name="job-reset"),
    # Stream raw source PDF for remote runner: GET /api/ingest/jobs/{id}/source-pdf/
    path("jobs/<int:pk>/source-pdf/", IngestionJobSourcePdfView.as_view(), name="job-source-pdf"),
    # Webhook receiver for Standalone AI Microservice: POST /api/ingest/jobs/{id}/webhook/
    path("jobs/<int:pk>/webhook/", IngestionJobWebhookView.as_view(), name="job-webhook"),
    # Enqueue specific job for background queue: POST /api/ingest/jobs/{id}/enqueue/
    path("jobs/<int:pk>/enqueue/", IngestionJobEnqueueView.as_view(), name="job-enqueue"),
    # Process next chunk of pages: POST /api/ingest/jobs/{id}/process-chunk/
    path("jobs/<int:pk>/process-chunk/", IngestionJobProcessChunkView.as_view(), name="job-process-chunk"),
    # List pages: GET /api/ingest/jobs/{id}/pages/
    path("jobs/<int:pk>/pages/", IngestionJobPagesListView.as_view(), name="job-pages"),
    # Export structured JSON: GET /api/ingest/jobs/{id}/export-json/
    path("jobs/<int:pk>/export-json/", IngestionJobExportJsonView.as_view(), name="job-export-json"),
    # Atomic dataset items search: GET /api/ingest/items/?item_type=FORMULA&job_id=1
    path("items/", ExtractedItemListView.as_view(), name="items-list"),
]
