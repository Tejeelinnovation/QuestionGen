"""
URL configuration for the attempts app.
"""

from django.urls import path

from .views import (
    AttemptAnswerGradeView,
    AttemptAnswerSaveView,
    AttemptProctoringWarningView,
    AttemptResultView,
    AttemptScorecardPdfView,
    AttemptStartResumeView,
    AttemptSubmitView,
    DeliveryBatchEvaluateView,
    DeliveryGradebookExportView,
    DeliveryProctoringReportView,
    DeliveryResultsView,
)

urlpatterns = [
    # Start or resume attempt: GET /api/deliveries/{id}/start/
    path("deliveries/<int:pk>/start/", AttemptStartResumeView.as_view(), name="delivery-start"),
    # Teacher roster results: GET /api/deliveries/{id}/results/
    path("deliveries/<int:pk>/results/", DeliveryResultsView.as_view(), name="delivery-results"),
    # Classroom Gradebook Excel export: GET /api/deliveries/{id}/export-gradebook/
    path("deliveries/<int:pk>/export-gradebook/", DeliveryGradebookExportView.as_view(), name="delivery-export-gradebook"),
    # Classroom proctoring analytics report: GET /api/deliveries/{id}/proctoring-report/
    path("deliveries/<int:pk>/proctoring-report/", DeliveryProctoringReportView.as_view(), name="delivery-proctoring-report"),
    # Batch evaluate and gradebook summary: POST /api/deliveries/{id}/batch-evaluate/
    path("deliveries/<int:pk>/batch-evaluate/", DeliveryBatchEvaluateView.as_view(), name="delivery-batch-evaluate"),
    # Incremental answer save: PATCH /api/attempts/{id}/answers/{question_id}/
    path("attempts/<int:pk>/answers/<int:question_id>/", AttemptAnswerSaveView.as_view(), name="attempt-answer-save"),
    # Finalize / submit attempt: POST /api/attempts/{id}/submit/
    path("attempts/<int:pk>/submit/", AttemptSubmitView.as_view(), name="attempt-submit"),
    # Anti-cheating proctoring warning: POST /api/attempts/{id}/proctoring-warning/
    path("attempts/<int:pk>/proctoring-warning/", AttemptProctoringWarningView.as_view(), name="attempt-proctoring-warning"),
    # View attempt result: GET /api/attempts/{id}/result/
    path("attempts/<int:pk>/result/", AttemptResultView.as_view(), name="attempt-result"),
    # Download student scorecard PDF: GET /api/attempts/{id}/download-scorecard/
    path("attempts/<int:pk>/download-scorecard/", AttemptScorecardPdfView.as_view(), name="attempt-download-scorecard"),
    # Teacher manual grade: POST /api/attempts/{id}/answers/{question_id}/grade/
    path("attempts/<int:pk>/answers/<int:question_id>/grade/", AttemptAnswerGradeView.as_view(), name="attempt-answer-grade"),
]
