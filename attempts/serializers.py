"""
Serializers for the attempts app.

Handles:
- Attempt start & resume (student exam sitting representation WITHOUT correct answers)
- Incremental answer saves
- Attempt submit response
- Student vs Teacher result representations
- Delivery results roster for teachers
- Manual evaluation / grading
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from .models import Answer, Attempt, AttemptStatus


class AttemptQuestionStudentSerializer(serializers.Serializer):
    """
    Representation of a question during an active sitting.
    STRICTLY EXCLUDES correct_answer.
    """

    question_id = serializers.IntegerField()
    question_text = serializers.CharField()
    question_type = serializers.CharField()
    marks = serializers.FloatField()
    options = serializers.JSONField(allow_null=True)
    student_response = serializers.CharField(allow_blank=True, default="")


class AttemptStartResponseSerializer(serializers.Serializer):
    """
    Response for GET /api/deliveries/{id}/start/
    """

    attempt_id = serializers.IntegerField(source="id")
    delivery_id = serializers.IntegerField()
    paper_title = serializers.CharField(source="delivery.paper_version.paper.title")
    instructions = serializers.CharField(source="delivery.paper_version.paper.instructions")
    version_label = serializers.CharField(source="delivery.paper_version.version_label")
    total_marks = serializers.DecimalField(source="max_score", max_digits=6, decimal_places=2)
    status = serializers.CharField()
    started_at = serializers.DateTimeField()
    questions = serializers.SerializerMethodField()

    def get_questions(self, obj: Attempt) -> list[dict[str, Any]]:
        # Map existing answers by question_id for student_response
        answers_by_qid = {a.question_id: a.student_response for a in obj.answers.all()}
        snapshot_list = obj.delivery.paper_version.question_snapshot

        questions = []
        for q in snapshot_list:
            qid = q.get("question_id")
            questions.append({
                "question_id": qid,
                "question_text": q.get("question_text"),
                "question_type": q.get("question_type"),
                "marks": float(q.get("marks", 0)),
                "options": q.get("options"),
                "student_response": answers_by_qid.get(qid, ""),
            })
        return questions


class AnswerUpdateSerializer(serializers.Serializer):
    student_response = serializers.CharField(
        allow_blank=True,
        required=True,
        help_text="Student's answer text or selected option key.",
    )


class AttemptSubmitResponseSerializer(serializers.ModelSerializer):
    paper_title = serializers.CharField(source="delivery.paper_version.paper.title", read_only=True)
    message = serializers.SerializerMethodField()

    class Meta:
        model = Attempt
        fields = [
            "id",
            "delivery",
            "paper_title",
            "status",
            "score",
            "max_score",
            "started_at",
            "submitted_at",
            "message",
        ]

    def get_message(self, obj: Attempt) -> str:
        if obj.status == AttemptStatus.EVALUATED:
            return "Attempt submitted and fully evaluated."
        return (
            "Attempt submitted successfully. Objective questions auto-graded; "
            "descriptive questions are pending manual review."
        )


class StudentAttemptResultSerializer(serializers.ModelSerializer):
    paper_title = serializers.CharField(source="delivery.paper_version.paper.title", read_only=True)
    answers = serializers.SerializerMethodField()

    class Meta:
        model = Attempt
        fields = [
            "id",
            "delivery",
            "paper_title",
            "status",
            "score",
            "max_score",
            "started_at",
            "submitted_at",
            "answers",
        ]

    def get_answers(self, obj: Attempt) -> list[dict[str, Any]]:
        results = []
        for ans in obj.answers.all().order_by("id"):
            snap = ans.question_snapshot
            q_type = snap.get("question_type")
            is_pending = q_type in ["SHORT_ANSWER", "LONG_ANSWER"] and ans.marks_awarded is None

            item: dict[str, Any] = {
                "question_id": ans.question_id,
                "question_text": snap.get("question_text"),
                "question_type": q_type,
                "max_marks": float(snap.get("marks", 0)),
                "student_response": ans.student_response,
                "is_correct": ans.is_correct,
                "marks_awarded": float(ans.marks_awarded) if ans.marks_awarded is not None else None,
                "pending_manual_review": is_pending,
            }
            # Include correct answer if evaluated or auto-graded
            if not is_pending:
                item["correct_answer"] = snap.get("correct_answer")
            results.append(item)
        return results


class TeacherAttemptResultSerializer(StudentAttemptResultSerializer):
    student_id = serializers.IntegerField(source="student.id", read_only=True)
    student_username = serializers.CharField(source="student.username", read_only=True)

    class Meta(StudentAttemptResultSerializer.Meta):
        fields = StudentAttemptResultSerializer.Meta.fields + [
            "student_id",
            "student_username",
        ]

    def get_answers(self, obj: Attempt) -> list[dict[str, Any]]:
        results = []
        for ans in obj.answers.all().order_by("id"):
            snap = ans.question_snapshot
            q_type = snap.get("question_type")
            needs_grading = q_type in ["SHORT_ANSWER", "LONG_ANSWER"] and ans.marks_awarded is None

            results.append({
                "answer_id": ans.id,
                "question_id": ans.question_id,
                "question_text": snap.get("question_text"),
                "question_type": q_type,
                "max_marks": float(snap.get("marks", 0)),
                "student_response": ans.student_response,
                "correct_answer": snap.get("correct_answer"),
                "options": snap.get("options"),
                "is_correct": ans.is_correct,
                "marks_awarded": float(ans.marks_awarded) if ans.marks_awarded is not None else None,
                "needs_grading": needs_grading,
            })
        return results


from decimal import Decimal

class ManualGradeSerializer(serializers.Serializer):
    marks_awarded = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.0"),
        required=True,
        help_text="Marks awarded to this response.",
    )
    is_correct = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether the answer is considered correct (optional).",
    )


class DeliveryResultsRosterSerializer(serializers.Serializer):
    delivery_id = serializers.IntegerField()
    paper_title = serializers.CharField()
    version_label = serializers.CharField()
    total_marks = serializers.IntegerField()
    total_students_assigned = serializers.IntegerField()
    attempts_count = serializers.IntegerField()
    submitted_count = serializers.IntegerField()
    evaluated_count = serializers.IntegerField()
    attempts = serializers.ListField(child=serializers.DictField())
