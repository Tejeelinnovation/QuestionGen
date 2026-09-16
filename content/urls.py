"""
URL configuration for the content app.

Mounted at /api/ in the root urls.py so paths resolve as:
    /api/books/
    /api/chapters/
    /api/topics/
    /api/questions/
"""

from django.urls import path

from .views import (
    BoardListView,
    BookListView,
    ChapterListView,
    QuestionDetailView,
    QuestionIngestView,
    QuestionListView,
    QuestionResubmitView,
    QuestionStatsView,
    QuestionValidateView,
    QuestionValidationHistorySerializer,
    QuestionValidatorMetadataView,
    QuestionVariantCreateView,
    TopicListView,
    ValidationHistoryView,
    ValidationQueueView,
)

urlpatterns = [
    path("boards/", BoardListView.as_view(), name="board-list"),
    path("books/", BookListView.as_view(), name="book-list"),
    path("chapters/", ChapterListView.as_view(), name="chapter-list"),
    path("topics/", TopicListView.as_view(), name="topic-list"),
    path("questions/", QuestionListView.as_view(), name="question-list"),
    path("questions/stats/", QuestionStatsView.as_view(), name="question-stats"),
    path("questions/validation-queue/", ValidationQueueView.as_view(), name="question-validation-queue"),
    path("questions/ingest/", QuestionIngestView.as_view(), name="question-ingest"),
    path("questions/<int:pk>/", QuestionDetailView.as_view(), name="question-detail"),
    path("questions/<int:pk>/variants/", QuestionVariantCreateView.as_view(), name="question-variant-create"),
    path("questions/<int:pk>/validate/", QuestionValidateView.as_view(), name="question-validate"),
    path("questions/<int:pk>/validator-metadata/", QuestionValidatorMetadataView.as_view(), name="question-validator-metadata"),
    path("questions/<int:pk>/resubmit/", QuestionResubmitView.as_view(), name="question-resubmit"),
    path("questions/<int:pk>/validation-history/", ValidationHistoryView.as_view(), name="question-validation-history"),
]
