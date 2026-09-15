"""
Views for the content app — browsing and ingestion.

Endpoints
---------
GET    /api/boards/                           → BoardListView
GET    /api/books/?board=                     → BookListView
GET    /api/chapters/?book_id=                → ChapterListView
GET    /api/topics/?chapter_id=               → TopicListView
GET    /api/questions/?topic_id=&difficulty=&question_type=&learner_level=&marks=
                                              → QuestionListView
POST   /api/questions/ingest/                 → QuestionIngestView
GET    /api/questions/<id>/                   → QuestionDetailView
PATCH  /api/questions/<id>/                   → QuestionDetailView
DELETE /api/questions/<id>/                   → QuestionDetailView
POST   /api/questions/<id>/variants/          → QuestionVariantCreateView
"""

from __future__ import annotations

from django.db.models import Q
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import log_action
from core.pagination import StandardPageNumberPagination
from .filters import filter_questions
from .models import Book, Chapter, Question, QuestionVariant, Topic
from .serializers import (
    BookSerializer,
    ChapterSerializer,
    QuestionDetailSerializer,
    QuestionIngestSerializer,
    QuestionListSerializer,
    QuestionVariantSerializer,
    TopicSerializer,
)


class QuestionPagination(StandardPageNumberPagination):
    """
    Pagination class for Questions:
    - Default 10 items per page.
    - Customizable via ?page_size=.
    - Max 100 per page.
    - Activates when page, page_size, or paginate=true is present.
    - Returns unpaginated flat list when omitted, maintaining backward compatibility.
    """

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        paginate_param = request.query_params.get("paginate", "").lower()
        all_param = request.query_params.get("all", "").lower()
        if paginate_param in ("false", "0", "no") or all_param in ("true", "1", "yes"):
            return None

        has_page = "page" in request.query_params
        has_page_size = "page_size" in request.query_params
        is_explicit = paginate_param in ("true", "1", "yes")

        if has_page or has_page_size or is_explicit:
            return super().paginate_queryset(queryset, request, view=view)

        return None


class QuestionStatsView(APIView):
    """
    GET /api/questions/stats/

    Aggregated statistics for QBM and Admin dashboard cards:
    - total_questions
    - with_variants
    - boards_count
    - active_chapters
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)

        qs = Question.objects.filter(is_active=True)
        if user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL")):
            pass
        elif user.school_id is not None:
            qs = qs.filter(Q(bank_source="GLOBAL") | Q(school_id=user.school_id))
        else:
            qs = qs.filter(bank_source="GLOBAL")

        total_questions = qs.count()
        with_variants = qs.filter(variants__isnull=False).distinct().count()
        boards_count = Book.objects.filter(is_active=True).values("board").distinct().count() or len(INDIAN_BOARDS)
        active_chapters = Chapter.objects.filter(topics__questions__in=qs).distinct().count() or Chapter.objects.count()

        return Response({
            "total_questions": total_questions,
            "with_variants": with_variants,
            "boards_count": boards_count,
            "active_chapters": active_chapters,
        })


INDIAN_BOARDS = [
    "CBSE",
    "ICSE / ISC",
    "State Board - Maharashtra",
    "State Board - Karnataka",
    "State Board - Tamil Nadu",
    "State Board - Andhra Pradesh",
    "State Board - Telangana",
    "State Board - Uttar Pradesh",
    "State Board - Gujarat",
    "State Board - Rajasthan",
    "State Board - West Bengal",
    "State Board - Kerala",
    "State Board - Madhya Pradesh",
    "State Board - Bihar",
    "State Board - Punjab",
    "State Board - Haryana",
    "State Board - Odisha",
    "State Board - Assam",
    "State Board - Jharkhand",
    "State Board - Chhattisgarh",
    "State Board - Uttarakhand",
    "State Board - Himachal Pradesh",
    "State Board - Goa",
    "State Board - Jammu & Kashmir",
    "NIOS",
    "IB (International Baccalaureate)",
    "Cambridge (IGCSE)",
    "Other / State Board",
]


class BoardListView(APIView):
    """
    GET /api/boards/

    Returns comprehensive list of Indian educational boards and existing boards in the system.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        db_boards = list(
            Book.objects.filter(is_active=True)
            .values_list("board", flat=True)
            .distinct()
        )
        combined = list(INDIAN_BOARDS)
        for b in db_boards:
            if b and b not in combined:
                combined.append(b)
        return Response(combined)


class BookListView(ListAPIView):
    """
    GET /api/books/?board=

    Returns active books ordered by board → subject → grade → title.
    """

    serializer_class = BookSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Book.objects.filter(is_active=True).prefetch_related("chapters")
        board = self.request.query_params.get("board")
        if board:
            qs = qs.filter(board=board)
        return qs


class ChapterListView(ListAPIView):
    """
    GET /api/chapters/?book_id=<id>

    Returns chapters for the given book, ordered by chapter_order.
    """

    serializer_class = ChapterSerializer
    permission_classes = [IsAuthenticated]

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
    """

    serializer_class = TopicSerializer
    permission_classes = [IsAuthenticated]

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

    Multi-Tenant Privacy Isolation (AC-13, AC-14, AC-20):
    - Super Admin: sees all questions.
    - QBM: sees GLOBAL questions.
    - School users: see GLOBAL questions + their own school's private questions.
      Questions belonging to other schools are strictly filtered out.
    """

    serializer_class = QuestionDetailSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = QuestionPagination

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Question.objects.none()

        qs = Question.objects.select_related(
            "topic", "topic__chapter", "topic__chapter__book"
        ).prefetch_related("variants").filter(is_active=True)

        # Tenant isolation
        if user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL")):
            # Super Admin
            pass
        elif user.school_id is not None:
            # School user sees GLOBAL questions + their own school's questions (AC-13, AC-14)
            qs = qs.filter(Q(bank_source="GLOBAL") | Q(school_id=user.school_id))
        else:
            # QBM or standalone user sees GLOBAL questions only
            qs = qs.filter(bank_source="GLOBAL")

        return filter_questions(qs, self.request.query_params)


class QuestionDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET    /api/questions/<id>/
    PATCH  /api/questions/<id>/
    DELETE /api/questions/<id>/

    Detailed question representation including variants and answer keys.
    Multi-tenant isolation enforced.
    """

    serializer_class = QuestionDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Question.objects.none()

        qs = Question.objects.select_related(
            "topic", "topic__chapter", "topic__chapter__book"
        ).prefetch_related("variants")

        if user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL")):
            return qs
        elif user.school_id is not None:
            return qs.filter(Q(bank_source="GLOBAL") | Q(school_id=user.school_id))
        return qs.filter(bank_source="GLOBAL")


class QuestionIngestView(APIView):
    """
    POST /api/questions/ingest/

    Structured Question Ingestion workflow (AC-10, AC-13, AC-14, AC-15, AC-16).
    - QBM: creates GLOBAL questions. Gated by INGEST_GLOBAL_QUESTIONS capability.
    - Super Admin: creates GLOBAL questions.
    - Teacher: creates ORGANIZATION / TEACHER questions if school has question_bank_enabled.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data.copy()

        is_super_admin = user.is_superuser or (
            user.school_id is None and user.has_capability("CREATE_SCHOOL")
        )
        is_qbm = user.has_capability("INGEST_GLOBAL_QUESTIONS")

        if is_super_admin or is_qbm:
            data["bank_source"] = "GLOBAL"
            data["school"] = None
        elif user.school_id is not None:
            school = getattr(user, "school", None)
            if not school or not getattr(school, "question_bank_enabled", False):
                return Response(
                    {"detail": "Question bank is disabled for your school / coaching class."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not user.has_capability("GENERATE_SELECT_QUESTIONS"):
                return Response(
                    {"detail": "You do not have permission to ingest questions."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            data["bank_source"] = data.get("bank_source") or "ORGANIZATION"
            if data["bank_source"] not in ("ORGANIZATION", "TEACHER"):
                data["bank_source"] = "ORGANIZATION"
            data["school"] = user.school_id
        else:
            return Response(
                {"detail": "You do not have permission to ingest questions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = QuestionIngestSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        question = serializer.save()

        log_action(
            user,
            "question.ingested",
            question,
            metadata={
                "question_id": question.id,
                "bank_source": question.bank_source,
                "topic_id": question.topic_id,
                "variants_count": question.variants.count(),
            },
        )

        return Response(
            QuestionDetailSerializer(question, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class QuestionVariantCreateView(APIView):
    """
    POST /api/questions/<id>/variants/

    Add a variant to an existing question.
    Enforces AC-15: Variant difficulty automatically syncs to parent question difficulty.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        user = request.user
        question = Question.objects.filter(pk=pk).first()
        if not question:
            return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

        if question.bank_source == "GLOBAL":
            if not (user.is_superuser or user.has_capability("INGEST_GLOBAL_QUESTIONS")):
                return Response(
                    {"detail": "Only Super Admin or QBM can add variants to global questions."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        else:
            if question.school_id != user.school_id:
                return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)
            if not getattr(user.school, "question_bank_enabled", False) or not user.has_capability("GENERATE_SELECT_QUESTIONS"):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data.copy()
        data["parent_question"] = question.id
        data["difficulty"] = question.difficulty  # AC-15 strict sync

        serializer = QuestionVariantSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        variant = serializer.save()

        log_action(
            user,
            "question_variant.created",
            variant,
            metadata={
                "variant_id": variant.id,
                "parent_question_id": question.id,
                "difficulty": variant.difficulty,
                "marks": float(variant.marks),
            },
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

