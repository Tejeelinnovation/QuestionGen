"""
Views for the content app — read-only browsing.

All endpoints require authentication (IsAuthenticated from DRF global default).
No capability beyond being logged in is required — restriction on WHO can
BUILD a paper from the question bank happens in the papers app (Prompt 4).

Endpoints
---------
GET /api/books/
GET /api/chapters/?book_id=
GET /api/topics/?chapter_id=
GET /api/questions/?topic_id=&difficulty=&question_type=&learner_level=&marks=

Filtering for /api/questions/ is delegated entirely to
``content.filters.filter_questions`` — never add inline filter logic here.
"""

from rest_framework.generics import ListAPIView

from .filters import filter_questions
from .models import Book, Chapter, Question, Topic
from .serializers import (
    BookSerializer,
    ChapterSerializer,
    QuestionDetailSerializer,
    TopicSerializer,
)


class BookListView(ListAPIView):
    """
    GET /api/books/

    Returns all active books ordered by subject → grade → title.
    """

    serializer_class = BookSerializer

    def get_queryset(self):
        return Book.objects.filter(is_active=True).prefetch_related("chapters")


class ChapterListView(ListAPIView):
    """
    GET /api/chapters/?book_id=<id>

    Returns chapters for the given book, ordered by chapter_order.
    ``book_id`` is optional; without it, returns all chapters across books.
    """

    serializer_class = ChapterSerializer

    def get_queryset(self):
        qs = (
            Chapter.objects.select_related("book")
            .prefetch_related("topics")
            .filter(book__is_active=True)
            .order_by("chapter_order")
        )
        book_id = self.request.query_params.get("book_id")
        if book_id:
            qs = qs.filter(book_id=book_id)
        return qs


class TopicListView(ListAPIView):
    """
    GET /api/topics/?chapter_id=<id>

    Returns topics for the given chapter.
    ``chapter_id`` is optional; without it, returns all topics.
    """

    serializer_class = TopicSerializer

    def get_queryset(self):
        qs = Topic.objects.select_related(
            "chapter", "chapter__book"
        ).filter(chapter__book__is_active=True)

        chapter_id = self.request.query_params.get("chapter_id")
        if chapter_id:
            qs = qs.filter(chapter_id=chapter_id)
        return qs


class QuestionListView(ListAPIView):
    """
    GET /api/questions/?topic_id=&difficulty=&question_type=&learner_level=&marks=

    Filtering is AND-ed. All params are optional; omitting a param means
    "no constraint" on that dimension.

    Uses ``content.filters.filter_questions`` — the same function that
    Prompt 4 (paper-builder) will import and reuse.
    """

    serializer_class = QuestionDetailSerializer

    def get_queryset(self):
        qs = Question.objects.select_related(
            "topic", "topic__chapter", "topic__chapter__book"
        ).filter(is_active=True)

        return filter_questions(qs, self.request.query_params)
