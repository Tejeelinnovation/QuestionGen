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

import logging
import os
import threading
from django.conf import settings
from django.db import models, transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

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
            "diagram": getattr(q, "diagram", None) or (getattr(q, "metadata", {}).get("diagram") if hasattr(q, "metadata") and isinstance(q.metadata, dict) else None),
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
        papers = get_scoped_papers(request.user).annotate(
            version_count_annotated=models.Count("versions", distinct=True),
            delivery_count_annotated=models.Count("versions__deliveries", distinct=True),
        )
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

            # Fast Multimodal PDF Processing: Attach proxy URLs immediately (<5ms)
            # and archive to Google Drive asynchronously in a background thread.
            if paper.specifications and paper.specifications.get("source_mode") == "pdf":
                try:
                    from papers.services.pdf_harvester import PdfInspectionService
                    insp_id = paper.specifications.get("inspection_id")
                    selected_fig_ids = paper.specifications.get("selected_figure_ids", [])
                    cached_insp = PdfInspectionService.get_inspection_data(insp_id)
                    if cached_insp:
                        detected_map = {f["figure_id"]: f for f in cached_insp.get("detected_figures", [])}
                        high_res_map = cached_insp.get("high_res_images", {})
                        store_local = getattr(settings, "STORE_DIAGRAMS_LOCAL", settings.DEBUG)
                        if store_local:
                            disk_dir = os.path.join(settings.MEDIA_ROOT, "diagrams")
                            os.makedirs(disk_dir, exist_ok=True)

                        initial_diagrams = []
                        for fig_id in selected_fig_ids:
                            fig_meta = detected_map.get(fig_id, {})
                            raw_b = high_res_map.get(fig_id)
                            if raw_b and store_local:
                                try:
                                    with open(os.path.join(disk_dir, f"{fig_id}.png"), "wb") as df:
                                        df.write(raw_b)
                                except Exception as d_err:
                                    logger.warning(f"Failed to cache diagram {fig_id} on disk: {d_err}")

                            initial_diagrams.append({
                                "figure_id": fig_id,
                                "title": fig_meta.get("caption", f"Figure (Page {fig_meta.get('page_number', 1)})"),
                                "page_number": fig_meta.get("page_number", 1),
                                "thumbnail_b64": fig_meta.get("thumbnail_b64", ""),
                                "image_url": f"/api/papers/diagram-asset/{fig_id}/",
                                "drive_file_id": "",
                                "web_view_link": "",
                            })

                        paper.specifications["attached_diagrams"] = initial_diagrams
                        paper.specifications["extracted_text"] = cached_insp.get("full_text", "")
                        paper.specifications["pdf_filename"] = cached_insp.get("filename", "")
                        paper.specifications["word_count"] = cached_insp.get("word_count", 0)
                        paper.save(update_fields=["specifications"])

                        # Asynchronous non-blocking Google Drive archival
                        if selected_fig_ids and paper.specifications.get("contribute_to_bank", True):
                            def _bg_drive_upload(p_id, i_id, f_ids, p_title):
                                try:
                                    uploaded = PdfInspectionService.upload_selected_figures_to_drive(
                                        inspection_id=i_id,
                                        selected_figure_ids=f_ids,
                                        paper_title=p_title,
                                    )
                                    from papers.models import Paper
                                    p = Paper.objects.filter(id=p_id).first()
                                    if p and p.specifications:
                                        p.specifications["attached_diagrams"] = uploaded
                                        p.save(update_fields=["specifications"])
                                except Exception as bg_err:
                                    logger.warning(f"Background Google Drive upload error: {bg_err}")

                            transaction.on_commit(
                                lambda p_id=paper.id, i_id=insp_id, f_ids=selected_fig_ids, p_title=paper.title: (
                                    threading.Thread(
                                        target=_bg_drive_upload,
                                        args=(p_id, i_id, f_ids, p_title),
                                        daemon=True,
                                    ).start()
                                )
                            )

                except Exception as pdf_err:
                    logger.warning(f"Failed to process PDF attachments for paper #{paper.id}: {pdf_err}")

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

    def patch(self, request, pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)
        if not request.user.has_capability("CREATE_PAPER"):
            return Response(
                {"detail": "You do not have permission to modify papers."},
                status=status.HTTP_403_FORBIDDEN,
            )
        for field in ["title", "instructions", "duration_minutes", "total_question_count", "specifications"]:
            if field in request.data:
                setattr(paper, field, request.data[field])
        paper.save()
        return Response(PaperDetailSerializer(paper).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        if not request.user.has_capability("CREATE_PAPER") and paper.created_by != request.user and not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to delete this paper."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Validation: check if this paper has been assigned/delivered to any class or student
        delivery_qs = Delivery.objects.filter(paper_version__paper=paper)
        delivery_count = delivery_qs.count()
        if delivery_count > 0:
            return Response(
                {
                    "detail": (
                        f"Cannot delete paper: It has already been assigned or delivered "
                        f"({delivery_count} test delivery session(s) exist). "
                        "To protect student records and academic integrity, assigned papers cannot be deleted."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            log_action(
                user=request.user,
                action="paper.deleted",
                target=paper,
                metadata={
                    "paper_id": paper.id,
                    "title": paper.title,
                    "school_id": paper.school_id,
                },
            )
            paper.delete()

        return Response(
            {"detail": f"Paper '{paper.title}' (Paper #{paper.id}) was deleted successfully."},
            status=status.HTTP_200_OK,
        )



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

        # Multimodal Fast Path for Teacher-Uploaded PDF
        if paper.specifications and paper.specifications.get("source_mode") == "pdf":
            from generation.services.llm_generation import LLMQuestionGenerationService
            llm_service = LLMQuestionGenerationService()
            target_quantity = (
                data.get("total_question_count")
                or data.get("quantity")
                or paper.total_question_count
                or 5
            )
            mark_dist = data.get("mark_distribution") or []
            if mark_dist:
                target_quantity = sum(int(t.get("count", 0)) for t in mark_dist)

            llm_constraints = {
                "source_text": paper.specifications.get("extracted_text", ""),
                "attached_figures": paper.specifications.get("attached_diagrams", []),
                "difficulty": data.get("difficulty", "MEDIUM"),
                "question_type": data.get("question_type", "ANY"),
                "learner_level": data.get("learner_level", "INTERMEDIATE"),
                "marks_per_question": data.get("marks_per_question", 2.0),
                "quantity": target_quantity,
                "total_marks": data.get("total_marks"),
                "mark_distribution": mark_dist,
                "difficulty_distribution": data.get("difficulty_distribution", {}),
            }
            drafts = llm_service.generate_questions(chapter=paper.chapter, constraints=llm_constraints)
            formatted_questions = []
            for idx, d in enumerate(drafts):
                q_dict = d.to_dict()
                q_dict["id"] = idx + 1
                q_dict["question_type_display"] = q_dict.get("question_type")
                q_dict["difficulty_display"] = q_dict.get("difficulty")
                q_dict["learner_level_display"] = q_dict.get("learner_level")
                q_dict["topic_name"] = paper.title
                q_dict["chapter_title"] = paper.specifications.get("pdf_filename", "Custom Document")
                formatted_questions.append(q_dict)

            return Response(
                {
                    "paper_id": paper.id,
                    "chapter_id": paper.chapter_id,
                    "subjects": paper.subjects,
                    "duration_minutes": paper.duration_minutes,
                    "total_question_count": len(formatted_questions),
                    "count": len(formatted_questions),
                    "questions": formatted_questions,
                },
                status=status.HTTP_200_OK,
            )

        # Multi-source candidate pooling:
        # Include Global QBM questions + own school's private questions.
        # Strictly exclude other organizations' question banks.
        target_school = paper.school or getattr(request.user, "school", None)
        target_school_id = target_school.id if target_school else None
        scope_filter = Q(bank_source="GLOBAL")
        if target_school_id:
            scope_filter |= Q(school_id=target_school_id)

        qs = Question.objects.select_related(
            "topic", "topic__chapter", "topic__chapter__book"
        ).prefetch_related("variants", "topics").filter(
            scope_filter,
            is_active=True,
        )

        # Gate 2 — Validation (Task 8 PDF Section 13 & 14):
        # Where the school's validation workflow is enabled, candidate pool must be strictly APPROVED.
        if target_school and getattr(target_school, "validation_workflow_enabled", False):
            qs = qs.filter(validation_status="APPROVED")


        # Syllabus scoping
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

        serializer = CreateVersionSerializer(data=request.data, context={"request": request, "paper": paper})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        if "snapshot_data" in validated:
            snapshot = validated["snapshot_data"]
        else:
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
                q.id: q
                for q in Question.objects.select_related(
                    "topic", "topic__chapter", "topic__chapter__book"
                ).filter(id__in=explicit_qids, is_active=True)
            }
            missing = [qid for qid in explicit_qids if qid not in questions_by_id]
            if missing:
                return Response(
                    {"question_ids": f"Questions with IDs {missing} do not exist or are inactive."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if paper.school and getattr(paper.school, "validation_workflow_enabled", False):
                unapproved = [qid for qid in explicit_qids if questions_by_id[qid].validation_status != "APPROVED"]
                if unapproved:
                    return Response(
                        {"question_ids": f"Questions with IDs {unapproved} cannot be used because they are not yet Approved."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            resolved_questions = [questions_by_id[qid] for qid in explicit_qids]
            constraints_used = source_version.constraints_used.copy()
        else:
            # Reselect from the source version's constraints_used
            constraints_used = source_version.constraints_used.copy()
            source_qids = {item["question_id"] for item in source_version.question_snapshot}

            candidate_qs = Question.objects.select_related(
                "topic", "topic__chapter", "topic__chapter__book"
            ).filter(
                topic__chapter=paper.chapter,
                is_active=True,
            )

            if paper.school and getattr(paper.school, "validation_workflow_enabled", False):
                candidate_qs = candidate_qs.filter(validation_status="APPROVED")

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
                    target_class = data.get("target_class")
                    from schools.models import ClassSection, ClassSubjectTeacher  # noqa: PLC0415

                    teacher_classes = ClassSection.objects.filter(
                        Q(class_teacher=request.user) | Q(subject_teachers__teacher=request.user)
                    )
                    valid_scope = Q(created_by=request.user) | Q(class_section__in=teacher_classes)
                    if target_class and target_class.school_id == request.user.school_id:
                        valid_scope |= Q(class_section=target_class)
                    valid_students = students_qs.filter(school=request.user.school).filter(valid_scope)

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
                "diagram": q_data.get("diagram"),
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
        res_data = dict(serializer.data)

        # Enhance with academic sections and metadata from PaperPublishingService
        try:
            from .publishing import PaperPublishingService
            pub_service = PaperPublishingService()
            published = pub_service.generate_student_exam_paper(version)
            res_data["sections"] = published.get("sections", [])
            res_data["watermark"] = published.get("watermark", "")
            res_data["student_metadata_fields"] = published.get("student_metadata_fields", [])
        except Exception:
            pass

        return Response(res_data, status=status.HTTP_200_OK)


class PaperVersionAnswerKeyView(APIView):
    """
    GET /api/papers/{id}/versions/{version_id}/answer-key/

    Returns synchronized teacher answer key, model solutions, and marking scheme
    for the finalized paper version.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, version_pk):
        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        version = paper.versions.filter(pk=version_pk).first()
        if not version:
            return Response({"detail": "Paper version not found."}, status=status.HTTP_404_NOT_FOUND)

        from .publishing import PaperPublishingService
        service = PaperPublishingService()
        key_data = service.generate_teacher_answer_key(version)
        return Response(key_data, status=status.HTTP_200_OK)


class PaperVersionDocxExportView(APIView):
    """
    GET /api/papers/{id}/versions/{version_id}/export-docx/

    Downloads the finalized examination paper or teacher answer key as a
    formatted Microsoft Word (.docx) file.

    Query Parameters:
    - target: 'paper' (default) or 'answer-key'
    - lines_per_mark: integer (default: 2) - Universal blank answer lines per mark
    - overrides: JSON-encoded dictionary of {question_id: line_count}
    - line_style: 'dotted' (default) or 'solid'
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk, version_pk):
        import json
        from django.http import HttpResponse

        paper = get_scoped_papers(request.user).filter(pk=pk).first()
        if not paper:
            return Response({"detail": "Paper not found."}, status=status.HTTP_404_NOT_FOUND)

        version = paper.versions.filter(pk=version_pk).first()
        if not version:
            return Response({"detail": "Paper version not found."}, status=status.HTTP_404_NOT_FOUND)

        target = request.query_params.get("target", "paper").lower()
        try:
            lines_per_mark = int(request.query_params.get("lines_per_mark", 2))
        except (ValueError, TypeError):
            lines_per_mark = 2

        line_style = request.query_params.get("line_style", "dotted")

        # Parse overrides if passed
        raw_overrides = request.query_params.get("overrides", "{}")
        try:
            overrides = json.loads(raw_overrides) if isinstance(raw_overrides, str) else dict(raw_overrides)
        except Exception:
            overrides = {}

        from .docx_export import ExamPaperDocxService
        service = ExamPaperDocxService()

        safe_title = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in paper.title).strip("_") or "Exam"

        if target == "answer-key":
            buf = service.generate_answer_key(version)
            filename = f"{safe_title}_v{version.version_label}_Answer_Key.docx"
        else:
            buf = service.generate_student_paper(
                version=version,
                lines_per_mark=lines_per_mark,
                question_line_overrides=overrides,
                line_style=line_style,
            )
            filename = f"{safe_title}_v{version.version_label}_Question_Paper.docx"

        response = HttpResponse(
            buf.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["X-Filename"] = filename
        return response



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


# ---------------------------------------------------------------------------
# 11. Multimodal PDF Inspector (Fast Path for Teachers)
# ---------------------------------------------------------------------------

class PaperPdfInspectView(APIView):
    """
    POST /api/papers/inspect-pdf/
    Inspects teacher-uploaded PDF in-memory, extracting text, headings, and embedded figures.
    Returns thumbnails and inspection token for the frontend Figure Picker in 1-2 seconds.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if not request.user.has_capability("CREATE_PAPER"):
            return Response(
                {"detail": "You do not have the 'CREATE_PAPER' capability required for this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "No PDF file provided."}, status=status.HTTP_400_BAD_REQUEST)

        if not file_obj.name.lower().endswith(".pdf"):
            return Response({"detail": "Only PDF files are supported."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            file_bytes = file_obj.read()
            from papers.services.pdf_harvester import PdfInspectionService
            summary = PdfInspectionService.inspect_pdf(file_bytes=file_bytes, filename=file_obj.name)
            return Response(summary, status=status.HTTP_200_OK)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"PDF inspection error: {e}", exc_info=True)
            return Response(
                {"detail": f"Failed to inspect PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ---------------------------------------------------------------------------
# 16. Dedicated Diagram Asset Streaming View (Zero Broken Images)
# ---------------------------------------------------------------------------

class PaperDiagramAssetView(APIView):
    """
    GET /api/papers/diagram-asset/<figure_id>/

    Directly streams diagram image bytes with client caching headers.
    Completely bypasses Google Drive cross-origin third-party cookie restrictions,
    ensuring 100% reliable rendering in both Review Page and Printable Sheets.
    """
    permission_classes = [AllowAny]

    def get(self, request, figure_id):
        import base64
        import os
        from django.conf import settings
        from papers.services.pdf_harvester import PdfInspectionService
        from papers.models import Paper, PaperVersion

        store_local = getattr(settings, "STORE_DIAGRAMS_LOCAL", settings.DEBUG)
        disk_path = os.path.join(settings.MEDIA_ROOT, "diagrams", f"{figure_id}.png")

        # Level 1: Check persistent local disk cache (if local storage enabled)
        if store_local and os.path.exists(disk_path):
            try:
                with open(disk_path, "rb") as f:
                    img_bytes = f.read()
                if img_bytes:
                    response = HttpResponse(img_bytes, content_type="image/png")
                    response["Cache-Control"] = "public, max-age=86400, immutable"
                    response["Access-Control-Allow-Origin"] = "*"
                    return response
            except Exception:
                pass

        # Level 2: Check RAM inspection cache
        img_bytes = PdfInspectionService.get_figure_bytes(figure_id)
        if img_bytes:
            if store_local:
                try:
                    os.makedirs(os.path.dirname(disk_path), exist_ok=True)
                    with open(disk_path, "wb") as f:
                        f.write(img_bytes)
                except Exception:
                    pass
            response = HttpResponse(img_bytes, content_type="image/png")
            response["Cache-Control"] = "public, max-age=86400, immutable"
            response["Access-Control-Allow-Origin"] = "*"
            return response

        # Level 3: Look up Paper or PaperVersion record to get Google Drive File ID or Thumbnail Base64
        drive_file_id = ""
        thumb_b64 = ""

        paper = Paper.objects.filter(specifications__icontains=figure_id).first()
        if paper and paper.specifications:
            diagrams = paper.specifications.get("attached_diagrams") or []
            target_diag = next((d for d in diagrams if d.get("figure_id") == figure_id), None)
            if target_diag:
                drive_file_id = target_diag.get("drive_file_id") or ""
                thumb_b64 = target_diag.get("thumbnail_b64") or ""

        # If not in paper specifications, search PaperVersion question snapshots
        if not drive_file_id and not thumb_b64:
            p_ver = PaperVersion.objects.filter(question_snapshot__icontains=figure_id).first()
            if p_ver and p_ver.question_snapshot:
                for q in p_ver.question_snapshot:
                    d = q.get("diagram")
                    if d and d.get("figure_id") == figure_id:
                        drive_file_id = d.get("drive_file_id") or d.get("file_id") or ""
                        thumb_b64 = d.get("thumbnail_b64") or ""
                        break

        # Stream directly from Google Drive (cloud storage in production)
        if drive_file_id:
            try:
                from content_ingestion.storage.drive_client import GoogleDriveClient
                drive_client = GoogleDriveClient()
                if drive_client.is_configured:
                    img_bytes = drive_client.download_bytes(drive_file_id)
                    if img_bytes:
                        if store_local:
                            try:
                                os.makedirs(os.path.dirname(disk_path), exist_ok=True)
                                with open(disk_path, "wb") as f:
                                    f.write(img_bytes)
                            except Exception:
                                pass
                        response = HttpResponse(img_bytes, content_type="image/png")
                        response["Cache-Control"] = "public, max-age=86400, immutable"
                        response["Access-Control-Allow-Origin"] = "*"
                        return response
            except Exception as drive_err:
                logger.warning(f"Failed to fetch {figure_id} from Drive: {drive_err}")

        # Level 4: Base64 thumbnail fallback from stored metadata
        if thumb_b64:
            try:
                if "," in thumb_b64:
                    thumb_b64 = thumb_b64.split(",", 1)[1]
                thumb_bytes = base64.b64decode(thumb_b64)
                if thumb_bytes:
                    response = HttpResponse(thumb_bytes, content_type="image/jpeg")
                    response["Cache-Control"] = "public, max-age=86400, immutable"
                    response["Access-Control-Allow-Origin"] = "*"
                    return response
            except Exception:
                pass

        # Level 5: Check if figure_id itself might be a direct Google Drive file ID
        try:
            from content_ingestion.storage.drive_client import GoogleDriveClient
            drive_client = GoogleDriveClient()
            if drive_client.is_configured:
                img_bytes = drive_client.download_bytes(figure_id)
                if img_bytes:
                    response = HttpResponse(img_bytes, content_type="image/png")
                    response["Cache-Control"] = "public, max-age=86400, immutable"
                    response["Access-Control-Allow-Origin"] = "*"
                    return response
        except Exception:
            pass

        return HttpResponse(status=status.HTTP_404_NOT_FOUND)

