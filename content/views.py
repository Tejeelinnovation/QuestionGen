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
from .models import Book, Chapter, Question, QuestionVariant, Topic, QuestionValidationHistory
from .serializers import (
    BookSerializer,
    ChapterSerializer,
    QuestionDetailSerializer,
    QuestionIngestSerializer,
    QuestionListSerializer,
    QuestionResubmitSerializer,
    QuestionValidationActionSerializer,
    QuestionValidationHistorySerializer,
    QuestionVariantSerializer,
    TopicSerializer,
    ValidatorMetadataSerializer,
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

    Multi-Tenant Privacy Isolation:
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
            # School user sees GLOBAL questions + their own school's questions
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
        ).prefetch_related("variants", "topics")

        if user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL")):
            return qs
        elif user.school_id is not None:
            return qs.filter(Q(bank_source="GLOBAL") | Q(school_id=user.school_id))
        return qs.filter(bank_source="GLOBAL")

    def patch(self, request, *args, **kwargs):
        user = request.user
        is_super = user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL"))
        is_deo = user.has_capability("DATA_ENTRY_OPERATOR")
        is_validator = user.has_capability("VALIDATOR")

        # Validator-only users cannot directly modify question text, options, answers, or explanation
        if is_validator and not is_super and not is_deo:
            forbidden_fields = {"question_text", "options", "correct_answer", "explanation"}
            attempted = set(request.data.keys()).intersection(forbidden_fields)
            if attempted:
                return Response(
                    {
                        "detail": (
                            f"Validators are strictly prohibited from directly modifying question content ({', '.join(attempted)}). "
                            "Please document content issues in a comment and use 'Send for Correction/Review' or 'Reject'."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        return super().patch(request, *args, **kwargs)


class QuestionIngestView(APIView):
    """
    POST /api/questions/ingest/

    Structured Question Ingestion workflow.
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
    Variant difficulty automatically syncs to parent question difficulty.
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
        data["difficulty"] = question.difficulty  # Strict sync with parent difficulty

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


# ---------------------------------------------------------------------------
# Task 8: Validation Workflow Views
# ---------------------------------------------------------------------------

class QuestionValidateView(APIView):
    """
    POST /api/questions/<id>/validate/

    Performs Validator review action on submitted questions:
    - APPROVE: Transitions to APPROVED (comment optional). Question enters Approved Question Bank.
    - SEND_FOR_CORRECTION: Transitions to CORRECTION_REQUIRED (comment mandatory). Returns to DEO.
    - REJECT: Transitions to REJECTED (comment mandatory). Excluded from generation.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        user = request.user
        question = Question.objects.filter(pk=pk).first()
        if not question:
            return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

        is_super = user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL"))
        is_validator = user.has_capability("VALIDATOR")
        if not is_super and not is_validator:
            return Response(
                {"detail": "Only users with the 'VALIDATOR' capability can validate questions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Tenant isolation
        if not is_super:
            if question.bank_source != "GLOBAL" and question.school_id != user.school_id:
                return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = QuestionValidationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data["action"]
        comment = serializer.validated_data.get("comment", "")

        status_map = {
            "APPROVE": "APPROVED",
            "SEND_FOR_CORRECTION": "CORRECTION_REQUIRED",
            "REJECT": "REJECTED",
        }
        question.validation_status = status_map[action]
        question.save(update_fields=["validation_status", "updated_at"])

        # Persist audit record
        QuestionValidationHistory.objects.create(
            question=question,
            actor=user,
            action=action,
            comment=comment,
            revision=question.revision,
        )

        log_action(
            user,
            f"question.{action.lower()}",
            question,
            metadata={
                "question_id": question.id,
                "action": action,
                "comment": comment,
                "revision": question.revision,
                "validation_status": question.validation_status,
            },
        )

        return Response(
            QuestionDetailSerializer(question, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class QuestionValidatorMetadataView(APIView):
    """
    PATCH /api/questions/<id>/validator-metadata/

    Allows Validator to directly modify permitted metadata:
    - Topics: add, remove, change topic associations
    - Difficulty: change difficulty (automatically synchronised across all variants)
    - Marks: change marks on parent question
    - Variant marks: change marks on individual variants
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk=None):
        user = request.user
        question = Question.objects.filter(pk=pk).first()
        if not question:
            return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

        is_super = user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL"))
        is_validator = user.has_capability("VALIDATOR")
        if not is_super and not is_validator:
            return Response(
                {"detail": "Only users with the 'VALIDATOR' capability can edit question metadata."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Tenant isolation
        if not is_super:
            if question.bank_source != "GLOBAL" and question.school_id != user.school_id:
                return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ValidatorMetadataSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        changed_fields = {}

        # 1. Update topics
        if "topic_ids" in data:
            old_topics = list(question.topics.values_list("name", flat=True))
            new_topics_qs = Topic.objects.filter(id__in=data["topic_ids"])
            question.topics.set(new_topics_qs)
            if data["topic_ids"] and question.topic_id not in data["topic_ids"]:
                question.topic_id = data["topic_ids"][0]
                question.save(update_fields=["topic"])
            new_topics = list(new_topics_qs.values_list("name", flat=True))
            if set(old_topics) != set(new_topics):
                changed_fields["topics"] = {"old": old_topics, "new": new_topics}

        # 2. Update difficulty (cascades to all variants)
        if "difficulty" in data and data["difficulty"] != question.difficulty:
            old_diff = question.difficulty
            new_diff = data["difficulty"]
            question.difficulty = new_diff
            question.save(update_fields=["difficulty"])
            # Cascade to variants
            question.variants.all().update(difficulty=new_diff)
            changed_fields["difficulty"] = {"old": old_diff, "new": new_diff}

        # 3. Update parent marks
        if "marks" in data and float(data["marks"]) != float(question.marks):
            old_marks = float(question.marks)
            new_marks = float(data["marks"])
            question.marks = new_marks
            question.save(update_fields=["marks"])
            changed_fields["marks"] = {"old": old_marks, "new": new_marks}

        # 4. Update variant marks
        if "variant_marks" in data:
            variant_diffs = []
            for item in data["variant_marks"]:
                var = question.variants.filter(id=item["id"]).first()
                if var and float(var.marks) != float(item["marks"]):
                    old_v_marks = float(var.marks)
                    new_v_marks = float(item["marks"])
                    var.marks = new_v_marks
                    var.save(update_fields=["marks"])
                    variant_diffs.append({"id": var.id, "old": old_v_marks, "new": new_v_marks})
            if variant_diffs:
                changed_fields["variant_marks"] = variant_diffs

        if changed_fields:
            QuestionValidationHistory.objects.create(
                question=question,
                actor=user,
                action="METADATA_UPDATE",
                comment="Validator updated metadata",
                changed_fields=changed_fields,
                revision=question.revision,
            )
            log_action(
                user,
                "question.metadata_updated",
                question,
                metadata={"question_id": question.id, "changed_fields": changed_fields},
            )

        return Response(
            QuestionDetailSerializer(question, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class QuestionResubmitView(APIView):
    """
    POST /api/questions/<id>/resubmit/

    Allows DEO / Question Author to modify question content and resubmit for validation
    after receiving comments from a Validator:
    - Increments revision counter (revision += 1)
    - Transitions validation_status from CORRECTION_REQUIRED back to SUBMITTED
    - Persists RESUBMIT audit record with optional resubmission notes
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        user = request.user
        question = Question.objects.filter(pk=pk).first()
        if not question:
            return Response({"detail": "Question not found."}, status=status.HTTP_404_NOT_FOUND)

        is_super = user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL"))
        is_deo = user.has_capability("DATA_ENTRY_OPERATOR")
        is_creator = question.created_by_id == user.id

        if not (is_super or is_deo or is_creator):
            return Response(
                {"detail": "You do not have permission to resubmit this question."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = QuestionResubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Update question content fields
        for field in ["question_text", "options", "correct_answer", "explanation"]:
            if field in data:
                setattr(question, field, data[field])

        if "topic_ids" in data and data["topic_ids"]:
            question.topics.set(data["topic_ids"])
            if question.topic_id not in data["topic_ids"]:
                question.topic_id = data["topic_ids"][0]

        # Increment revision and transition back to SUBMITTED
        question.revision += 1
        question.validation_status = "SUBMITTED"
        question.save()

        comment = data.get("comment", "") or f"Resubmitted revision #{question.revision}"

        QuestionValidationHistory.objects.create(
            question=question,
            actor=user,
            action="RESUBMIT",
            comment=comment,
            revision=question.revision,
        )

        log_action(
            user,
            "question.resubmitted",
            question,
            metadata={
                "question_id": question.id,
                "revision": question.revision,
                "comment": comment,
            },
        )

        return Response(
            QuestionDetailSerializer(question, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class ValidationQueueView(ListAPIView):
    """
    GET /api/questions/validation-queue/

    Returns paginated queue of questions requiring validation:
    - Default status filter: SUBMITTED, UNDER_VALIDATION, CORRECTION_REQUIRED
    - Gated by VALIDATOR capability or Super Admin
    - Tenant scoped to user's school (or Global QBM)
    """

    serializer_class = QuestionDetailSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = QuestionPagination

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Question.objects.none()

        is_super = user.is_superuser or (user.school_id is None and user.has_capability("CREATE_SCHOOL"))
        is_validator = user.has_capability("VALIDATOR")

        if not is_super and not is_validator:
            return Question.objects.none()

        qs = Question.objects.select_related(
            "topic", "topic__chapter", "topic__chapter__book"
        ).prefetch_related("variants", "topics").filter(is_active=True)

        if not is_super:
            if user.school_id:
                qs = qs.filter(Q(bank_source="GLOBAL") | Q(school_id=user.school_id))
            else:
                qs = qs.filter(bank_source="GLOBAL")

        status_param = self.request.query_params.get("status")
        if status_param and status_param.upper() != "ALL":
            qs = qs.filter(validation_status=status_param.upper())
        else:
            # Default queue shows active validation stages
            qs = qs.filter(validation_status__in=["SUBMITTED", "UNDER_VALIDATION", "CORRECTION_REQUIRED"])

        return filter_questions(qs, self.request.query_params)


class ValidationHistoryView(ListAPIView):
    """
    GET /api/questions/<id>/validation-history/

    Returns full audit history of validation cycles for a question.
    """

    serializer_class = QuestionValidationHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        question_id = self.kwargs.get("pk")
        return QuestionValidationHistory.objects.filter(question_id=question_id).select_related("actor").order_by("-created_at", "-id")

