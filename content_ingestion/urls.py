"""
URL configuration for content_ingestion app.
"""

from django.urls import path

from .views import (
    ExtractedItemListView,
    IngestionJobDetailView,
    IngestionJobExportJsonView,
    IngestionJobListCreateView,
    IngestionJobPagesListView,
    IngestionJobProcessChunkView,
)

urlpatterns = [
    # Jobs list and create: GET /api/ingest/jobs/, POST /api/ingest/jobs/
    path("jobs/", IngestionJobListCreateView.as_view(), name="job-list-create"),
    # Job detail & delete: GET /api/ingest/jobs/{id}/, DELETE /api/ingest/jobs/{id}/
    path("jobs/<int:pk>/", IngestionJobDetailView.as_view(), name="job-detail"),
    # Process next chunk of pages: POST /api/ingest/jobs/{id}/process-chunk/
    path("jobs/<int:pk>/process-chunk/", IngestionJobProcessChunkView.as_view(), name="job-process-chunk"),
    # List pages: GET /api/ingest/jobs/{id}/pages/
    path("jobs/<int:pk>/pages/", IngestionJobPagesListView.as_view(), name="job-pages"),
    # Export structured JSON: GET /api/ingest/jobs/{id}/export-json/
    path("jobs/<int:pk>/export-json/", IngestionJobExportJsonView.as_view(), name="job-export-json"),
    # Atomic dataset items search: GET /api/ingest/items/?item_type=FORMULA&job_id=1
    path("items/", ExtractedItemListView.as_view(), name="items-list"),
]
