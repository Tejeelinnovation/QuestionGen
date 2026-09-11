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
    QuestionVariantCreateView,
    TopicListView,
)

urlpatterns = [
    path("boards/", BoardListView.as_view(), name="board-list"),
    path("books/", BookListView.as_view(), name="book-list"),
    path("chapters/", ChapterListView.as_view(), name="chapter-list"),
    path("topics/", TopicListView.as_view(), name="topic-list"),
    path("questions/", QuestionListView.as_view(), name="question-list"),
    path("questions/ingest/", QuestionIngestView.as_view(), name="question-ingest"),
    path("questions/<int:pk>/", QuestionDetailView.as_view(), name="question-detail"),
    path("questions/<int:pk>/variants/", QuestionVariantCreateView.as_view(), name="question-variant-create"),
]
