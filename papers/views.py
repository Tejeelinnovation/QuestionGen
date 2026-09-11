"""
Views for the papers app.

Teacher Question Workflow Endpoints:
1.  POST /api/papers/                                      -> PaperListCreateView (create paper shell)
2.  POST /api/papers/{id}/select-questions/                -> PaperSelectQuestionsView (review candidate questions)
3.  POST /api/papers/{id}/versions/                        -> PaperVersionListCreateView (create immutable version)
4.  POST /api/papers/{id}/versions/{version_id}/clone/     -> PaperVersionCloneView (clone to new version)
5.  GET  /api/papers/                                      -> PaperListCreateView (scoped list)
6.  GET  /api/papers/{id}/                                 -> PaperDetailView (paper detail)
7.  GET  /api/papers/{id}/versions/                        -> PaperVersionListCreateView (list versions)
8.  GET  /api/papers/{id}/versions/{version_id}/           -> PaperVersionDetailView (version detail + snapshot)
9.  POST /api/papers/{id}/versions/{version_id}/finalize/  -> PaperVersionFinalizeView (explicit finalize step)
10. POST /api/papers/{id}/versions/{version_id}/deliver/   -> PaperVersionDeliverView (create delivery record)
11. GET  /api/papers/{id}/versions/{version_id}/print/     -> PaperVersionPrintView (structured print output)
12. GET  /api/deliveries/                                  -> DeliveryListView (scoped list)
13. GET  /api/deliveries/{id}/                             -> DeliveryDetailView (delivery detail)
"""

from __future__ import annotations

from typing import Any

from django.db import models, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from content.filters import filter_questions
from content.models import Question
from core.audit import log_action
from users.models import User
from .models import (
    Delivery,
    DeliveryMode,
    DeliveryStatus,
    Paper,
    PaperStatus,
    PaperVersion,
    VersionStatus,
    get_next_version_label,
)
from .selection import select_questions_for_quota, select_questions_for_specification
from .permissions import (
    CanAssignTest,
    CanCreatePaper,
    get_scoped_deliveries,
    get_scoped_papers,
)
from .serializers import (
    CloneVersionSerializer,
    CreateVersionSerializer,
    DeliveryCreateSerializer,
    DeliverySerializer,
    PaperCreateSerializer,
    PaperDetailSerializer,
    PaperListSerializer,
    PaperPrintSerializer,
    PaperVersionDetailSerializer,
    PaperVersionListSerializer,
    QuestionPreviewSerializer,
    SelectQuestionsRequestSerializer,
)


def _build_question_snapshot(questions: list[Question]) -> list[dict[str, Any]]:
    """Build the immutable question snapshot dictionary list with source fidelity."""
    snapshot = []
    for q in questions:
        subj = ""
        chap = ""
        top = ""
        if hasattr(q, "topic") and q.topic:
            top = q.topic.name
            if hasattr(q.topic, "chapter") and q.topic.chapter:
                chap = q.topic.chapter.title
                if hasattr(q.topic.chapter, "book") and q.topic.chapter.book:
                    subj = q.topic.chapter.book.subject
        snapshot.append({
            "question_id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "marks": float(q.marks),
            "difficulty": q.difficulty,
            "learner_level": q.learner_level,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "explanation": getattr(q, "explanation", "") or "",
            "bank_source": getattr(q, "bank_source", "GLOBAL"),
            "variant_id": getattr(q, "selected_variant_id", None),
            "subject": subj,
            "chapter_title": chap,
            "topic_name": top,
            "source_reference": q.source_reference,
        })
    return snapshot


# ---------------------------------------------------------------------------
# 1. Paper List & Create View
# ---------------------------------------------------------------------------

class PaperListCreateView(APIView):
    """
    GET  /api/papers/  -> Scoped list of papers
    POST /api/papers/  -> Create a new Paper shell
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        papers = get_scoped_papers(request.user)
        serializer = PaperListSerializer(papers, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        if not request.user.has_capability("CREATE_PAPER"):
            return Response(
                {"detail": "You do not have the 'CREATE_PAPER' capability required for this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PaperCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            paper = serializer.save(
                created_by=request.user,
                school=request.user.school,
            )
            log_action(
                user=request.user,
                action="paper.created",
                target=paper,
                metadata={
                    "title": paper.title,
                    "chapter_id": paper.chapter_id,
                    "subjects": paper.subjects,
                    "duration_minutes": paper.duration_minutes,
                    "total_question_count": paper.total_question_count,
                    "school_id": paper.school_id,
                },
            )

        return Response(
            PaperDetailSerializer(paper).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Paper Detail View
# ---------------------------------------------------------------------------

class PaperDetailView(APIView):
    """
    GET /api/papers/{id}/ -> Paper detail with versions list
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PaperDetailSerializer(paper)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 2. Select Questions (Review Candidate Questions)
# ---------------------------------------------------------------------------

class PaperSelectQuestionsView(APIView):
    """
    POST /api/papers/{id}/select-questions/

    Runs content.filters.filter_questions() to return candidate questions
    for the paper's chapter, allowing teacher review before version creation.
    Does NOT persist any record.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        if not request.user.has_capability("CREATE_PAPER") and not request.user.has_capability(
            "GENERATE_SELECT_QUESTIONS"
        ):
            return Response(
                {"detail": "You do not have permission to select questions for papers."},
                status=status.HTTP_403_FORBIDDEN,
            )

        req_serializer = SelectQuestionsRequestSerializer(data=request.data)
        req_serializer.is_valid(raise_exception=True)
        data = req_serializer.validated_data

        # Multi-source candidate pooling (AC-19, AC-20):
        # Include Global QBM questions + own school's private questions.
        # Strictly exclude other organizations' question banks.
        target_school_id = paper.school_id or getattr(request.user, "school_id", None)
        scope_filter = Q(bank_source="GLOBAL")
        if target_school_id:
            scope_filter |= Q(school_id=target_school_id)

        qs = Question.objects.select_related(
            "topic", "topic__chapter", "topic__chapter__book"
        ).prefetch_related("variants").filter(
            scope_filter,
            is_active=True,
        )

        # Syllabus scoping (AC-17)
        chapter_ids = data.get("chapter_ids")
        if chapter_ids:
            qs = qs.filter(topic__chapter_id__in=chapter_ids)
        elif paper.chapter_id:
            qs = qs.filter(topic__chapter=paper.chapter)

        subjects_filter = data.get("subjects") or paper.subjects
        if subjects_filter:
            qs = qs.filter(topic__chapter__book__subject__in=subjects_filter)

        topic_ids = data.get("topic_ids")
        if topic_ids:
            qs = qs.filter(topic_id__in=topic_ids)

        # Standard filters
        filter_params = {}
        if data.get("difficulty"):
            filter_params["difficulty"] = data["difficulty"]
        if data.get("question_type"):
            filter_params["question_type"] = data["question_type"]
        if data.get("learner_level"):
            filter_params["learner_level"] = data["learner_level"]
        if data.get("marks_per_question") is not None:
            filter_params["marks"] = data["marks_per_question"]

        qs = filter_questions(qs, filter_params)
        qs = qs.order_by("topic_id", "difficulty", "id")

        pool = list(qs)
        spec = dict(data)
        if paper.specifications:
            for k, v in paper.specifications.items():
                if k not in spec or spec[k] is None:
                    spec[k] = v
        if paper.total_question_count and not spec.get("total_question_count") and not spec.get("quantity"):
            spec["total_question_count"] = paper.total_question_count

        selected_questions, error_msg = select_questions_for_specification(pool, spec)
        if error_msg:
            return Response(
                {"detail": error_msg, "total_marks": [error_msg]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = QuestionPreviewSerializer(selected_questions, many=True)

        return Response(
            {
                "paper_id": paper.id,
                "chapter_id": paper.chapter_id,
                "subjects": paper.subjects,
                "duration_minutes": paper.duration_minutes,
                "total_question_count": paper.total_question_count,
                "count": len(serializer.data),
                "questions": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 3. Paper Version List & Create View
# ---------------------------------------------------------------------------

class PaperVersionListCreateView(APIView):
    """
    GET  /api/papers/{id}/versions/ -> List all versions of a paper
    POST /api/papers/{id}/versions/ -> Create an immutable PaperVersion with snapshot
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        versions = paper.versions.all()
        serializer = PaperVersionListSerializer(versions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        if not request.user.has_capability("CREATE_PAPER"):
            return Response(
                {"detail": "You do not have the 'CREATE_PAPER' capability required for this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CreateVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        resolved_questions = validated["resolved_questions"]
        snapshot = _build_question_snapshot(resolved_questions)

        # Determine version label
        version_label = validated.get("version_label") or get_next_version_label(paper)

        with transaction.atomic():
            version = PaperVersion(
                paper=paper,
                version_label=version_label,
                question_snapshot=snapshot,
                constraints_used=validated.get("constraints_used", {}),
                status=validated.get("status", VersionStatus.DRAFT),
            )
            version.save()

            log_action(
                user=request.user,
                action="version.created",
                target=version,
                metadata={
                    "paper_id": paper.id,
                    "version_label": version.version_label,
                    "total_marks": version.total_marks,
                    "question_count": len(snapshot),
                },
            )

        return Response(
            PaperVersionDetailSerializer(version).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# 7. Paper Version Detail View
# ---------------------------------------------------------------------------

class PaperVersionDetailView(APIView):
    """
    GET /api/papers/{id}/versions/{version_id}/ -> Full version detail including snapshot
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, version_pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        version = paper.versions.filter(pk=version_pk).first()
        if not version:
            return Response({"detail": "Paper version not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PaperVersionDetailSerializer(version)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 8. Explicit Finalize Step View
# ---------------------------------------------------------------------------

class PaperVersionFinalizeView(APIView):
    """
    POST /api/papers/{id}/versions/{version_id}/finalize/

    Explicitly marks a PaperVersion as FINALIZED, locking its snapshot
    and allowing delivery.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, version_pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        if not request.user.has_capability("CREATE_PAPER"):
            return Response(
                {"detail": "You do not have permission to finalize paper versions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        version = paper.versions.filter(pk=version_pk).first()
        if not version:
            return Response({"detail": "Paper version not found."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            version.status = VersionStatus.FINALIZED
            version.save()

            if paper.status == PaperStatus.DRAFT:
                paper.status = PaperStatus.FINALIZED
                paper.save()

            log_action(
                user=request.user,
                action="version.finalized",
                target=version,
                metadata={"version_id": version.id, "version_label": version.version_label},
            )

        return Response(
            PaperVersionDetailSerializer(version).data,
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 4. Clone Paper Version View
# ---------------------------------------------------------------------------

class PaperVersionCloneView(APIView):
    """
    POST /api/papers/{id}/versions/{version_id}/clone/

    Creates a new version (e.g. Version B/C) without mutating the source version.
    Accepts an explicit list of question_ids or reselects from the source
    version's constraints_used pool.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, version_pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        if not request.user.has_capability("CREATE_PAPER"):
            return Response(
                {"detail": "You do not have the 'CREATE_PAPER' capability required for this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        source_version = paper.versions.filter(pk=version_pk).first()
        if not source_version:
            return Response(
                {"detail": "Source paper version not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        clone_serializer = CloneVersionSerializer(data=request.data)
        clone_serializer.is_valid(raise_exception=True)
        data = clone_serializer.validated_data

        target_status = data.get("status", VersionStatus.DRAFT)
        explicit_qids = data.get("question_ids")

        if explicit_qids:
            questions_by_id = {
                q.id: q for q in Question.objects.filter(id__in=explicit_qids, is_active=True)
            }
            missing = [qid for qid in explicit_qids if qid not in questions_by_id]
            if missing:
                return Response(
                    {"question_ids": f"Questions with IDs {missing} do not exist or are inactive."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            resolved_questions = [questions_by_id[qid] for qid in explicit_qids]
            constraints_used = source_version.constraints_used.copy()
        else:
            # Reselect from the source version's constraints_used
            constraints_used = source_version.constraints_used.copy()
            source_qids = {item["question_id"] for item in source_version.question_snapshot}

            candidate_qs = Question.objects.select_related("topic", "topic__chapter").filter(
                topic__chapter=paper.chapter,
                is_active=True,
            )

            topic_ids = constraints_used.get("topic_ids")
            if topic_ids:
                candidate_qs = candidate_qs.filter(topic_id__in=topic_ids)

            filter_params = {}
            for k in ["difficulty", "question_type", "learner_level"]:
                if constraints_used.get(k):
                    filter_params[k] = constraints_used[k]
            if constraints_used.get("marks_per_question") is not None:
                filter_params["marks"] = constraints_used["marks_per_question"]

            candidate_qs = filter_questions(candidate_qs, filter_params)

            # Prioritize questions not in source version to produce a real alternate version
            fresh_candidates = [q for q in candidate_qs if q.id not in source_qids]
            quantity = constraints_used.get("quantity") or len(source_version.question_snapshot)

            if len(fresh_candidates) >= quantity:
                resolved_questions = fresh_candidates[:quantity]
            else:
                # Include existing candidates if not enough fresh ones
                combined = fresh_candidates + [q for q in candidate_qs if q.id in source_qids]
                resolved_questions = combined[:quantity]

            if not resolved_questions:
                return Response(
                    {"detail": "No eligible questions found to clone this version."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        snapshot = _build_question_snapshot(resolved_questions)
        next_label = get_next_version_label(paper)

        with transaction.atomic():
            new_version = PaperVersion(
                paper=paper,
                version_label=next_label,
                question_snapshot=snapshot,
                constraints_used=constraints_used,
                status=target_status,
            )
            new_version.save()

            log_action(
                user=request.user,
                action="version.cloned",
                target=new_version,
                metadata={
                    "source_version_id": source_version.id,
                    "source_version_label": source_version.version_label,
                    "new_version_id": new_version.id,
                    "new_version_label": new_version.version_label,
                    "paper_id": paper.id,
                },
            )

        return Response(
            PaperVersionDetailSerializer(new_version).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# 8. Deliver Paper Version View
# ---------------------------------------------------------------------------

class PaperVersionDeliverView(APIView):
    """
    POST /api/papers/{id}/versions/{version_id}/deliver/

    Creates a Delivery record (PRINT or ONLINE).
    Validation:
    - Version must be in FINALIZED status.
    - If ONLINE mode, student_ids must have at least one student.
    - Assigned students must be within teacher's scope (created_by=request.user).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, version_pk):
        if not request.user.has_capability("ASSIGN_TEST"):
            return Response(
                {"detail": "You do not have the 'ASSIGN_TEST' capability required for this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        version = paper.versions.filter(pk=version_pk).first()
        if not version:
            return Response({"detail": "Paper version not found."}, status=status.HTTP_404_NOT_FOUND)

        # Enforce finalized check
        if version.status == VersionStatus.DRAFT:
            return Response(
                {"detail": "Cannot deliver a PaperVersion with DRAFT status. Please finalize the version first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DeliveryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        mode = data["mode"]
        student_ids = data.get("student_ids", [])

        # Validate student scope
        assigned_students = []
        if mode == DeliveryMode.ONLINE:
            # Query candidate students
            students_qs = User.objects.filter(id__in=student_ids)

            # Scope enforcement:
            # Super Admin: any student
            # School Admin: within own school
            # Teacher: only students created_by request.user
            if request.user.school_id is not None:
                if request.user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS"):
                    valid_students = students_qs.filter(school=request.user.school)
                else:
                    valid_students = students_qs.filter(created_by=request.user)

                valid_ids = set(valid_students.values_list("id", flat=True))
                out_of_scope_ids = [sid for sid in student_ids if sid not in valid_ids]
                if out_of_scope_ids:
                    return Response(
                        {
                            "detail": (
                                f"Cannot assign test to students outside your scope: {out_of_scope_ids}."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                assigned_students = list(valid_students)
            else:
                assigned_students = list(students_qs)

        with transaction.atomic():
            delivery = Delivery.objects.create(
                paper_version=version,
                mode=mode,
                status=data.get("status", DeliveryStatus.ACTIVE),
                target_class=data.get("target_class"),
                available_from=data.get("available_from"),
                available_until=data.get("available_until"),
                created_by=request.user,
            )
            if assigned_students:
                delivery.assigned_students.set(assigned_students)

            log_action(
                user=request.user,
                action="delivery.created",
                target=delivery,
                metadata={
                    "delivery_id": delivery.id,
                    "paper_version_id": version.id,
                    "mode": delivery.mode,
                    "target_class_id": delivery.target_class_id,
                    "assigned_students_count": len(assigned_students),
                },
            )

        return Response(
            DeliverySerializer(delivery, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# 9. Print Representation View
# ---------------------------------------------------------------------------

class PaperVersionPrintView(APIView):
    """
    GET /api/papers/{id}/versions/{version_id}/print/

    Returns structured representation suitable for print/PDF rendering.
    Uses the exact same underlying question_snapshot.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, version_pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        version = paper.versions.filter(pk=version_pk).first()
        if not version:
            return Response({"detail": "Paper version not found."}, status=status.HTTP_404_NOT_FOUND)

        # Format questions for print
        formatted_questions = []
        for idx, q_data in enumerate(version.question_snapshot, start=1):
            formatted_questions.append({
                "question_number": idx,
                "question_id": q_data.get("question_id"),
                "question_text": q_data.get("question_text"),
                "question_type": q_data.get("question_type"),
                "marks": q_data.get("marks"),
                "options": q_data.get("options"),
            })

        school_name = ""
        if paper.school:
            school_name = paper.school.name
        elif getattr(request.user, "school", None) and request.user.school:
            school_name = request.user.school.name

        print_data = {
            "paper_id": paper.id,
            "title": paper.title,
            "school_name": school_name,
            "instructions": paper.instructions,
            "version_label": version.version_label,
            "duration_minutes": paper.duration_minutes,
            "total_question_count": paper.total_question_count or len(version.question_snapshot),
            "subjects": paper.subjects,
            "total_marks": version.total_marks,
            "question_count": len(version.question_snapshot),
            "questions": formatted_questions,
        }

        serializer = PaperPrintSerializer(print_data)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 10. Deliveries List & Detail Views
# ---------------------------------------------------------------------------

class DeliveryListView(APIView):
    """
    GET /api/deliveries/

    Scoped list:
    - Student sees only their own assigned deliveries.
    - Teacher sees deliveries they created.
    - School Admin sees school deliveries.
    - Super Admin sees all deliveries.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        deliveries = get_scoped_deliveries(request.user)
        serializer = DeliverySerializer(deliveries, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class DeliveryDetailView(APIView):
    """
    GET /api/deliveries/{id}/
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        delivery = get_scoped_deliveries(request.user).filter(pk=pk).first()
        if not delivery:
            return Response({"detail": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = DeliverySerializer(delivery, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)
