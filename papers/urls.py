"""
URL configuration for the papers app.
"""

from django.urls import path

from .views import (
    DeliveryDetailView,
    DeliveryListView,
    PaperDetailView,
    PaperListCreateView,
    PaperSelectQuestionsView,
    PaperVersionCloneView,
    PaperVersionDeliverView,
    PaperVersionDetailView,
    PaperVersionFinalizeView,
    PaperVersionListCreateView,
    PaperVersionPrintView,
    PaperVersionAnswerKeyView,
    PaperVersionDocxExportView,
)

urlpatterns = [
    # Paper shell list & create: GET /api/papers/, POST /api/papers/
    path("papers/", PaperListCreateView.as_view(), name="paper-list-create"),
    # Paper detail: GET /api/papers/{id}/
    path("papers/<int:pk>/", PaperDetailView.as_view(), name="paper-detail"),
    # Select candidate questions: POST /api/papers/{id}/select-questions/
    path("papers/<int:pk>/select-questions/", PaperSelectQuestionsView.as_view(), name="paper-select-questions"),
    # Paper versions: GET /api/papers/{id}/versions/, POST /api/papers/{id}/versions/
    path("papers/<int:pk>/versions/", PaperVersionListCreateView.as_view(), name="paper-version-list-create"),
    # Version detail: GET /api/papers/{id}/versions/{version_id}/
    path("papers/<int:pk>/versions/<int:version_pk>/", PaperVersionDetailView.as_view(), name="paper-version-detail"),
    # Finalize version: POST /api/papers/{id}/versions/{version_id}/finalize/
    path("papers/<int:pk>/versions/<int:version_pk>/finalize/", PaperVersionFinalizeView.as_view(), name="paper-version-finalize"),
    # Clone version: POST /api/papers/{id}/versions/{version_id}/clone/
    path("papers/<int:pk>/versions/<int:version_pk>/clone/", PaperVersionCloneView.as_view(), name="paper-version-clone"),
    # Deliver version: POST /api/papers/{id}/versions/{version_id}/deliver/
    path("papers/<int:pk>/versions/<int:version_pk>/deliver/", PaperVersionDeliverView.as_view(), name="paper-version-deliver"),
    # Print layout: GET /api/papers/{id}/versions/{version_id}/print/
    path("papers/<int:pk>/versions/<int:version_pk>/print/", PaperVersionPrintView.as_view(), name="paper-version-print"),
    # Teacher Answer Key & Solution Scheme: GET /api/papers/{id}/versions/{version_id}/answer-key/
    path("papers/<int:pk>/versions/<int:version_pk>/answer-key/", PaperVersionAnswerKeyView.as_view(), name="paper-version-answer-key"),
    # Microsoft Word (.docx) Export: GET /api/papers/{id}/versions/{version_id}/export-docx/
    path("papers/<int:pk>/versions/<int:version_pk>/export-docx/", PaperVersionDocxExportView.as_view(), name="paper-version-export-docx"),
    # Deliveries: GET /api/deliveries/, GET /api/deliveries/{id}/
    path("deliveries/", DeliveryListView.as_view(), name="delivery-list"),
    path("deliveries/<int:pk>/", DeliveryDetailView.as_view(), name="delivery-detail"),
]
