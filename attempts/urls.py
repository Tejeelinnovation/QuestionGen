"""
URL configuration for the attempts app.
"""

from django.urls import path

from .views import (
    AttemptAnswerGradeView,
    AttemptAnswerSaveView,
    AttemptResultView,
    AttemptStartResumeView,
    AttemptSubmitView,
    DeliveryResultsView,
)

urlpatterns = [
    # Start or resume attempt: GET /api/deliveries/{id}/start/
    path("deliveries/<int:pk>/start/", AttemptStartResumeView.as_view(), name="delivery-start"),
    # Teacher roster results: GET /api/deliveries/{id}/results/
    path("deliveries/<int:pk>/results/", DeliveryResultsView.as_view(), name="delivery-results"),
    # Incremental answer save: PATCH /api/attempts/{id}/answers/{question_id}/
    path("attempts/<int:pk>/answers/<int:question_id>/", AttemptAnswerSaveView.as_view(), name="attempt-answer-save"),
    # Finalize / submit attempt: POST /api/attempts/{id}/submit/
    path("attempts/<int:pk>/submit/", AttemptSubmitView.as_view(), name="attempt-submit"),
    # View attempt result: GET /api/attempts/{id}/result/
    path("attempts/<int:pk>/result/", AttemptResultView.as_view(), name="attempt-result"),
    # Teacher manual grade: POST /api/attempts/{id}/answers/{question_id}/grade/
    path("attempts/<int:pk>/answers/<int:question_id>/grade/", AttemptAnswerGradeView.as_view(), name="attempt-answer-grade"),
]
