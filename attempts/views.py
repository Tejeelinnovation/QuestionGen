"""
Views for the attempts app.

Endpoints:
1. GET   /api/deliveries/{id}/start/                 -> AttemptStartResumeView
2. PATCH /api/attempts/{id}/answers/{question_id}/   -> AttemptAnswerSaveView
3. POST  /api/attempts/{id}/submit/                  -> AttemptSubmitView
4. GET   /api/attempts/{id}/result/                  -> AttemptResultView
5. GET   /api/deliveries/{id}/results/               -> DeliveryResultsView
6. POST  /api/attempts/{id}/answers/{question_id}/grade/ -> AttemptAnswerGradeView
"""

from __future__ import annotations

from typing import Any

from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import log_action
from papers.models import Delivery, DeliveryMode
from .models import Answer, Attempt, AttemptStatus
from .permissions import (
    CanAttemptTest,
    can_access_attempt_result,
    can_teacher_access_delivery_results,
)
from .serializers import (
    AnswerUpdateSerializer,
    AttemptStartResponseSerializer,
    AttemptSubmitResponseSerializer,
    DeliveryResultsRosterSerializer,
    ManualGradeSerializer,
    StudentAttemptResultSerializer,
    TeacherAttemptResultSerializer,
)


# ---------------------------------------------------------------------------
# 1. Start or Resume Attempt View
# ---------------------------------------------------------------------------

class AttemptStartResumeView(APIView):
    """
    GET /api/deliveries/{id}/start/

    Student starts (or resumes) an attempt for an ONLINE delivery they are assigned to.
    - Mode must be ONLINE (PRINT mode returns 400).
    - Checks availability window (available_from / available_until).
    - Checks student membership in assigned_students.
    - Idempotent: returns existing in-progress attempt if already started.
    - Blocks starting if attempt was already SUBMITTED or EVALUATED.
    """

    permission_classes = [IsAuthenticated, CanAttemptTest]

    def get(self, request, pk):
        cache_key = f"delivery_start_meta_{pk}"
        delivery_meta = cache.get(cache_key)

        if delivery_meta is None:
            delivery = Delivery.objects.select_related(
                "paper_version", "paper_version__paper"
            ).filter(pk=pk).first()

            if not delivery:
                return Response({"detail": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)

            assigned_student_ids = set(delivery.assigned_students.values_list("id", flat=True))
            delivery_meta = {
                "delivery": delivery,
                "assigned_student_ids": assigned_student_ids,
            }
            cache.set(cache_key, delivery_meta, timeout=120)
        else:
            delivery = delivery_meta["delivery"]
            assigned_student_ids = delivery_meta["assigned_student_ids"]

        if delivery.mode != DeliveryMode.ONLINE:
            return Response(
                {"detail": "Attempts can only be started for ONLINE deliveries."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if delivery.status == "CLOSED":
            return Response(
                {"detail": "This delivery is closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check assigned students via in-memory set (0 queries)
        if request.user.id not in assigned_student_ids:
            return Response(
                {"detail": "You are not assigned to this test."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Time window check
        now = timezone.now()
        if delivery.available_from and now < delivery.available_from:
            return Response(
                {"detail": "This test is not available yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if delivery.available_until and now > delivery.available_until:
            return Response(
                {"detail": "This test has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Existing attempt check with relations prefetched for fast serialization
        attempt = (
            Attempt.objects.select_related("delivery__paper_version__paper")
            .prefetch_related("answers")
            .filter(delivery=delivery, student=request.user)
            .first()
        )
        if attempt:
            if attempt.status in [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]:
                return Response(
                    {
                        "detail": "You have already submitted this test.",
                        "attempt_id": attempt.id,
                        "status": attempt.status,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if attempt.warning_count >= 5:
                if attempt.status == AttemptStatus.IN_PROGRESS:
                    attempt.status = AttemptStatus.SUBMITTED
                    attempt.submitted_at = now
                    attempt.save(update_fields=["status", "submitted_at", "updated_at"])
                return Response(
                    {
                        "detail": "This test has been locked due to proctoring violations.",
                        "attempt_id": attempt.id,
                        "status": attempt.status,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Resume existing in-progress attempt
            serializer = AttemptStartResponseSerializer(attempt)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Fresh attempt creation
        snapshot_questions = delivery.paper_version.question_snapshot
        if not snapshot_questions:
            return Response(
                {"detail": "No questions available in this test version."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            attempt = Attempt.objects.create(
                delivery=delivery,
                student=request.user,
                status=AttemptStatus.IN_PROGRESS,
                started_at=now,
                max_score=delivery.paper_version.total_marks,
            )

            # Create blank answers from snapshot
            answers_to_create = [
                Answer(
                    attempt=attempt,
                    question_id=q["question_id"],
                    question_snapshot=q,
                    student_response="",
                )
                for q in snapshot_questions
            ]
            Answer.objects.bulk_create(answers_to_create)
            attempt._prefetched_objects_cache = {"answers": answers_to_create}

            log_action(
                user=request.user,
                action="attempt.started",
                target=attempt,
                metadata={
                    "attempt_id": attempt.id,
                    "delivery_id": delivery.id,
                    "paper_id": delivery.paper_version.paper_id,
                },
            )

        serializer = AttemptStartResponseSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_200_OK)


@receiver(post_save, sender=Delivery)
def _invalidate_delivery_cache(sender, instance, **kwargs):
    cache.delete(f"delivery_start_meta_{instance.pk}")


@receiver(m2m_changed)
def _invalidate_delivery_students_cache(sender, instance, **kwargs):
    if isinstance(instance, Delivery):
        cache.delete(f"delivery_start_meta_{instance.pk}")


# ---------------------------------------------------------------------------
# 2. Incremental Answer Save View
# ---------------------------------------------------------------------------

class AttemptAnswerSaveView(APIView):
    """
    PATCH /api/attempts/{id}/answers/{question_id}/

    Save/update a single question's student response during an in-progress attempt.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, question_id):
        attempt = Attempt.objects.select_related("delivery").filter(pk=pk).first()
        if not attempt:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        # Only the owning student can save answers
        if attempt.student_id != request.user.id:
            return Response(
                {"detail": "You cannot modify answers for another student's attempt."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if attempt.status != AttemptStatus.IN_PROGRESS:
            return Response(
                {"detail": "Cannot modify answers on a submitted or evaluated attempt."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if attempt.warning_count >= 5:
            return Response(
                {"detail": "Proctoring violation limit reached. This attempt has been locked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Availability window check
        now = timezone.now()
        if attempt.delivery.available_until and now > attempt.delivery.available_until:
            return Response(
                {"detail": "Delivery time window has closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        answer = attempt.answers.filter(question_id=question_id).first()
        if not answer:
            return Response(
                {"detail": f"Question {question_id} not found in this attempt."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AnswerUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answer.student_response = serializer.validated_data["student_response"]
        answer.save()

        return Response(
            {
                "attempt_id": attempt.id,
                "question_id": question_id,
                "student_response": answer.student_response,
                "updated_at": answer.updated_at,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 3. Submit Attempt View
# ---------------------------------------------------------------------------

class AttemptSubmitView(APIView):
    """
    POST /api/attempts/{id}/submit/

    Finalizes an in-progress attempt:
    - Auto-grades MCQ answers against the snapshot correct_answer.
    - Sets SHORT/LONG answers to pending review.
    - Computes total score so far.
    - Prevents double-submission.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        attempt = Attempt.objects.select_related(
            "delivery", "delivery__paper_version", "delivery__paper_version__paper"
        ).filter(pk=pk).first()

        if not attempt:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        if attempt.student_id != request.user.id:
            return Response(
                {"detail": "You cannot submit an attempt that does not belong to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if attempt.status in [AttemptStatus.SUBMITTED, AttemptStatus.EVALUATED]:
            return Response(
                {"detail": "Attempt has already been submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Auto-grade and finalize
        with transaction.atomic():
            answers = list(attempt.answers.all())
            has_pending = False
            running_score = 0.0

            for ans in answers:
                snap = ans.question_snapshot
                q_type = snap.get("question_type")
                q_marks = float(snap.get("marks", 0))

                if q_type == "MCQ":
                    student_choice = ans.student_response.strip().upper()
                    correct_choice = str(snap.get("correct_answer", "")).strip().upper()

                    if student_choice and student_choice == correct_choice:
                        ans.is_correct = True
                        ans.marks_awarded = q_marks
                        running_score += q_marks
                    else:
                        ans.is_correct = False
                        ans.marks_awarded = 0.0
                    ans.save()
                else:
                    # SHORT_ANSWER or LONG_ANSWER -> pending manual review
                    ans.is_correct = None
                    ans.marks_awarded = None
                    ans.save()
                    has_pending = True

            attempt.score = running_score
            attempt.submitted_at = timezone.now()
            attempt.status = (
                AttemptStatus.SUBMITTED if has_pending else AttemptStatus.EVALUATED
            )
            attempt.save()

            log_action(
                user=request.user,
                action="attempt.submitted",
                target=attempt,
                metadata={
                    "attempt_id": attempt.id,
                    "score": float(attempt.score),
                    "status": attempt.status,
                },
            )

        serializer = AttemptSubmitResponseSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 4. View Attempt Result
# ---------------------------------------------------------------------------

class AttemptResultView(APIView):
    """
    GET /api/attempts/{id}/result/

    View attempt results:
    - Student sees their own result.
    - Teacher sees results for deliveries they created.
    - Super Admin / School Admin see within their scope.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        attempt = (
            Attempt.objects.select_related(
                "student",
                "delivery",
                "delivery__paper_version",
                "delivery__paper_version__paper",
            )
            .prefetch_related("answers")
            .filter(pk=pk)
            .first()
        )

        if not attempt:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_access_attempt_result(request.user, attempt):
            return Response(
                {"detail": "You do not have permission to view this test result."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if attempt.status == AttemptStatus.IN_PROGRESS:
            return Response(
                {"detail": "Test is still in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Differentiate student vs teacher response
        if attempt.student_id == request.user.id and request.user.school_id is not None and not request.user.has_capability("VIEW_SCHOOL_WIDE_CONTROLS"):
            serializer = StudentAttemptResultSerializer(attempt)
        else:
            serializer = TeacherAttemptResultSerializer(attempt)

        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 5. Delivery Results Roster View (Teacher)
# ---------------------------------------------------------------------------

class DeliveryResultsView(APIView):
    """
    GET /api/deliveries/{id}/results/

    Teacher roster view: list all students' attempts and scores for a given delivery.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        delivery = (
            Delivery.objects.select_related(
                "paper_version", "paper_version__paper"
            )
            .prefetch_related("assigned_students", "attempts", "attempts__student")
            .filter(pk=pk)
            .first()
        )

        if not delivery:
            return Response({"detail": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_teacher_access_delivery_results(request.user, delivery):
            return Response(
                {"detail": "You do not have permission to view results for this delivery."},
                status=status.HTTP_403_FORBIDDEN,
            )

        attempts = delivery.attempts.select_related("student").all()
        submitted_count = attempts.filter(status=AttemptStatus.SUBMITTED).count()
        evaluated_count = attempts.filter(status=AttemptStatus.EVALUATED).count()

        attempt_list = [
            {
                "attempt_id": a.id,
                "student_id": a.student.id,
                "student_username": a.student.username,
                "status": a.status,
                "score": float(a.score) if a.score is not None else None,
                "max_score": float(a.max_score),
                "submitted_at": a.submitted_at,
            }
            for a in attempts
        ]

        roster_data = {
            "delivery_id": delivery.id,
            "paper_title": delivery.paper_version.paper.title,
            "version_label": delivery.paper_version.version_label,
            "total_marks": delivery.paper_version.total_marks,
            "total_students_assigned": delivery.assigned_students.count(),
            "attempts_count": attempts.count(),
            "submitted_count": submitted_count,
            "evaluated_count": evaluated_count,
            "attempts": attempt_list,
        }

        serializer = DeliveryResultsRosterSerializer(roster_data)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 6. Manual Grade View (Teacher)
# ---------------------------------------------------------------------------

class AttemptAnswerGradeView(APIView):
    """
    POST /api/attempts/{id}/answers/{question_id}/grade/

    Teacher manually grades a SHORT_ANSWER or LONG_ANSWER response:
    - Updates marks_awarded and is_correct.
    - Recalculates parent Attempt total score.
    - Sets status = EVALUATED if all questions have been graded.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, question_id):
        attempt = (
            Attempt.objects.select_related(
                "delivery", "delivery__paper_version", "delivery__paper_version__paper"
            )
            .filter(pk=pk)
            .first()
        )

        if not attempt:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_teacher_access_delivery_results(request.user, attempt.delivery):
            return Response(
                {"detail": "You do not have permission to grade this attempt."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if attempt.status == AttemptStatus.IN_PROGRESS:
            return Response(
                {"detail": "Cannot grade an attempt that is still in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        answer = attempt.answers.filter(question_id=question_id).first()
        if not answer:
            return Response(
                {"detail": f"Question {question_id} not found in this attempt."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ManualGradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        max_marks = float(answer.question_snapshot.get("marks", 0))
        marks_awarded = float(data["marks_awarded"])

        if marks_awarded > max_marks:
            return Response(
                {
                    "marks_awarded": (
                        f"Marks awarded ({marks_awarded}) cannot exceed maximum question marks ({max_marks})."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_correct = data.get("is_correct")
        if is_correct is None:
            is_correct = marks_awarded > 0

        with transaction.atomic():
            answer.marks_awarded = marks_awarded
            answer.is_correct = is_correct
            answer.save()

            # Recalculate parent score
            graded_answers = attempt.answers.all()
            new_score = sum(
                float(a.marks_awarded)
                for a in graded_answers
                if a.marks_awarded is not None
            )
            attempt.score = new_score

            # Check if all answers are graded
            all_graded = not graded_answers.filter(marks_awarded__isnull=True).exists()
            if all_graded:
                attempt.status = AttemptStatus.EVALUATED
            attempt.save()

            log_action(
                user=request.user,
                action="answer.graded",
                target=answer,
                metadata={
                    "attempt_id": attempt.id,
                    "question_id": question_id,
                    "marks_awarded": marks_awarded,
                    "attempt_status": attempt.status,
                    "attempt_score": float(attempt.score),
                },
            )

        return Response(
            {
                "attempt_id": attempt.id,
                "question_id": question_id,
                "marks_awarded": float(answer.marks_awarded),
                "is_correct": answer.is_correct,
                "attempt_score": float(attempt.score),
                "attempt_status": attempt.status,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 7. Record Proctoring Warning View
# ---------------------------------------------------------------------------

class AttemptProctoringWarningView(APIView):
    """
    POST /api/attempts/{id}/proctoring-warning/

    Logs an anti-cheating proctoring warning during an active test:
    - Verifies attempt belongs to authenticated student and is IN_PROGRESS.
    - Records event_type (e.g. TAB_SWITCH, WINDOW_BLUR, FULLSCREEN_EXIT).
    - Increments warning_count and logs audit trail.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        attempt = Attempt.objects.select_related(
            "student", "delivery", "delivery__paper_version", "delivery__paper_version__paper"
        ).filter(pk=pk).first()

        if not attempt:
            return Response({"detail": "Attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        if attempt.student_id != request.user.id and not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to record proctoring events for this attempt."},
                status=status.HTTP_403_FORBIDDEN,
            )

        event_type = request.data.get("event_type", "TAB_SWITCH")
        details = request.data.get("details", "Student switched tab or window lost focus.")

        attempt.warning_count += 1
        log_entry = {
            "timestamp": timezone.now().isoformat(),
            "warning_number": attempt.warning_count,
            "event_type": event_type,
            "details": details,
        }
        current_logs = list(attempt.proctoring_logs or [])
        current_logs.append(log_entry)
        attempt.proctoring_logs = current_logs

        auto_submitted = False
        if attempt.warning_count >= 5 and attempt.status == AttemptStatus.IN_PROGRESS:
            answers = list(attempt.answers.all())
            has_pending = False
            running_score = 0.0

            for ans in answers:
                snap = ans.question_snapshot
                q_type = snap.get("question_type")
                q_marks = float(snap.get("marks", 0))

                if q_type == "MCQ":
                    student_choice = ans.student_response.strip().upper()
                    correct_choice = str(snap.get("correct_answer", "")).strip().upper()

                    if student_choice and student_choice == correct_choice:
                        ans.is_correct = True
                        ans.marks_awarded = q_marks
                        running_score += q_marks
                    else:
                        ans.is_correct = False
                        ans.marks_awarded = 0.0
                    ans.save()
                else:
                    ans.is_correct = None
                    ans.marks_awarded = None
                    ans.save()
                    has_pending = True

            attempt.score = running_score
            attempt.submitted_at = timezone.now()
            attempt.status = (
                AttemptStatus.SUBMITTED if has_pending else AttemptStatus.EVALUATED
            )
            auto_submitted = True

        attempt.save()

        # Write immutable audit log entry for Super Admin
        log_action(
            user=request.user,
            action="exam.proctoring_warning",
            target=attempt,
            metadata={
                "attempt_id": attempt.id,
                "student_id": attempt.student_id,
                "student_username": attempt.student.username,
                "delivery_id": attempt.delivery_id,
                "paper_title": getattr(attempt.delivery.paper_version.paper, "title", ""),
                "warning_count": attempt.warning_count,
                "event_type": event_type,
                "details": details,
                "auto_submitted": auto_submitted,
            },
        )

        return Response(
            {
                "attempt_id": attempt.id,
                "warning_count": attempt.warning_count,
                "event_type": event_type,
                "details": details,
                "auto_submitted": auto_submitted,
                "status": attempt.status,
                "message": f"Proctoring warning recorded (#{attempt.warning_count}).",
            },
            status=status.HTTP_200_OK,
        )
