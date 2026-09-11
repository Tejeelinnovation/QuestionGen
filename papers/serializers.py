"""
Serializers for the papers app.

Separate read and write serializers:
- PaperListSerializer / PaperDetailSerializer / PaperCreateSerializer
- SelectQuestionsRequestSerializer / QuestionPreviewSerializer
- CreateVersionSerializer / PaperVersionListSerializer / PaperVersionDetailSerializer / CloneVersionSerializer
- DeliveryCreateSerializer / DeliverySerializer
- PaperPrintSerializer
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from content.models import Chapter, Difficulty, LearnerLevel, Question, QuestionType
from users.models import User
from .models import (
    Delivery,
    DeliveryMode,
    DeliveryStatus,
    Paper,
    PaperStatus,
    PaperVersion,
    VersionStatus,
)


# ---------------------------------------------------------------------------
# Paper Serializers
# ---------------------------------------------------------------------------

class PaperListSerializer(serializers.ModelSerializer):
    chapter_title = serializers.SerializerMethodField()
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True, default=None)
    version_count = serializers.SerializerMethodField()

    class Meta:
        model = Paper
        fields = [
            "id",
            "title",
            "instructions",
            "chapter",
            "chapter_title",
            "subjects",
            "duration_minutes",
            "total_question_count",
            "specifications",
            "created_by",
            "created_by_username",
            "school",
            "school_name",
            "status",
            "version_count",
            "created_at",
            "updated_at",
        ]

    def get_chapter_title(self, obj: Paper) -> str | None:
        return obj.chapter.title if obj.chapter else None

    def get_version_count(self, obj: Paper) -> int:
        return obj.versions.count()


class PaperCreateSerializer(serializers.ModelSerializer):
    chapter = serializers.PrimaryKeyRelatedField(
        queryset=Chapter.objects.all(), required=False, allow_null=True
    )
    subjects = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    duration_minutes = serializers.IntegerField(
        required=False, default=60, min_value=1
    )
    total_question_count = serializers.IntegerField(
        required=False, default=0, min_value=0
    )
    specifications = serializers.JSONField(
        required=False, default=dict
    )

    class Meta:
        model = Paper
        fields = [
            "id",
            "title",
            "instructions",
            "chapter",
            "subjects",
            "duration_minutes",
            "total_question_count",
            "specifications",
        ]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        chapter = attrs.get("chapter")
        subjects = attrs.get("subjects")
        if not chapter and not subjects:
            raise serializers.ValidationError(
                "Either a chapter or a list of subjects must be specified for the paper."
            )
        if chapter and not chapter.book.is_active:
            raise serializers.ValidationError("Cannot create a paper for an inactive book.")
        return attrs


class PaperDetailSerializer(PaperListSerializer):
    versions = serializers.SerializerMethodField()

    class Meta(PaperListSerializer.Meta):
        fields = PaperListSerializer.Meta.fields + ["versions"]

    def get_versions(self, obj: Paper) -> list[dict[str, Any]]:
        return [
            {
                "id": v.id,
                "version_label": v.version_label,
                "total_marks": v.total_marks,
                "question_count": len(v.question_snapshot),
                "status": v.status,
                "created_at": v.created_at,
            }
            for v in obj.versions.all()
        ]


# ---------------------------------------------------------------------------
# Select Questions (Preview) Serializers
# ---------------------------------------------------------------------------

class SelectQuestionsRequestSerializer(serializers.Serializer):
    topic_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
        help_text="Optional list of topic IDs to filter candidate questions.",
    )
    chapter_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
        help_text="Optional list of chapter IDs for multi-chapter/subject filtering.",
    )
    subjects = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
        help_text="Optional list of subjects for multi-subject filtering.",
    )
    subject_breakdown = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
        help_text="Optional list of subject quotas: [{'subject': 'Physics', 'marks': 25, 'count': 10}].",
    )
    difficulty_distribution = serializers.DictField(
        required=False,
        default=dict,
        help_text="Optional distribution of difficulty: {'EASY': 40, 'MEDIUM': 40, 'HARD': 20}.",
    )
    difficulty = serializers.ChoiceField(
        choices=Difficulty.choices,
        required=False,
        allow_null=True,
        help_text="EASY | MEDIUM | HARD",
    )
    question_type = serializers.ChoiceField(
        choices=QuestionType.choices,
        required=False,
        allow_null=True,
        help_text="MCQ | SHORT_ANSWER | LONG_ANSWER",
    )
    learner_level = serializers.ChoiceField(
        choices=LearnerLevel.choices,
        required=False,
        allow_null=True,
        help_text="BEGINNER | INTERMEDIATE | ADVANCED",
    )
    marks_per_question = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        help_text="Exact marks per question filter.",
    )
    total_marks = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
        help_text="Target total marks constraint.",
    )
    quantity = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
        help_text="Maximum number of candidate questions to select.",
    )
    total_question_count = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
        help_text="Target total question count (AC-18).",
    )
    duration_minutes = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
        help_text="Exam duration in minutes (AC-18).",
    )
    mark_distribution = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_null=True,
        help_text="Custom rubric tiers: [{'marks': 1, 'count': 5, 'question_types': ['MCQ']}, ...]",
    )



class QuestionPreviewSerializer(serializers.ModelSerializer):
    """
    Serializer used for Question Review / Preview before saving a version.
    """

    topic_name = serializers.CharField(source="topic.name", read_only=True)
    chapter_title = serializers.CharField(source="topic.chapter.title", read_only=True)
    subject = serializers.CharField(source="topic.chapter.book.subject", read_only=True, default="")
    question_type_display = serializers.CharField(source="get_question_type_display", read_only=True)
    difficulty_display = serializers.CharField(source="get_difficulty_display", read_only=True)
    learner_level_display = serializers.CharField(source="get_learner_level_display", read_only=True)
    variants_count = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id",
            "topic",
            "topic_name",
            "chapter_title",
            "subject",
            "question_text",
            "question_type",
            "question_type_display",
            "marks",
            "difficulty",
            "difficulty_display",
            "learner_level",
            "learner_level_display",
            "bank_source",
            "variants_count",
            "options",
            "correct_answer",
            "explanation",
            "source_reference",
        ]

    def get_variants_count(self, obj: Question) -> int:
        if hasattr(obj, "variants"):
            return obj.variants.count()
        return 0


# ---------------------------------------------------------------------------
# Paper Version Serializers
# ---------------------------------------------------------------------------

class CreateVersionSerializer(serializers.Serializer):
    question_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
        help_text="Ordered list of question IDs to snapshot into this version.",
    )
    constraints_used = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Filter parameters used to generate/select these questions.",
    )
    status = serializers.ChoiceField(
        choices=VersionStatus.choices,
        required=False,
        default=VersionStatus.DRAFT,
    )
    version_label = serializers.CharField(
        max_length=10,
        required=False,
        allow_blank=True,
    )

    def validate_question_ids(self, value: list[int]) -> list[int]:
        if not value:
            raise serializers.ValidationError("Cannot create a version with zero questions.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        question_ids = attrs["question_ids"]
        constraints = attrs.get("constraints_used", {})

        # Fetch questions preserving order
        questions_by_id = {
            q.id: q for q in Question.objects.filter(id__in=question_ids, is_active=True)
        }

        missing_ids = [qid for qid in question_ids if qid not in questions_by_id]
        if missing_ids:
            raise serializers.ValidationError(
                {"question_ids": f"Questions with IDs {missing_ids} do not exist or are inactive."}
            )

        # Calculate sum of marks
        total_sum = sum(float(questions_by_id[qid].marks) for qid in question_ids)

        # Check total_marks constraint if provided in constraints_used
        total_marks_constraint = constraints.get("total_marks")
        if total_marks_constraint is not None:
            try:
                expected_total = float(total_marks_constraint)
                if round(total_sum, 2) != round(expected_total, 2):
                    raise serializers.ValidationError(
                        {
                            "total_marks": (
                                f"Sum of question marks ({total_sum}) does not match "
                                f"the stated total_marks constraint ({expected_total})."
                            )
                        }
                    )
            except (ValueError, TypeError):
                pass

        attrs["resolved_questions"] = [questions_by_id[qid] for qid in question_ids]
        return attrs


class CloneVersionSerializer(serializers.Serializer):
    question_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=False,
        help_text="Optional explicit ordered question IDs. If omitted, reselects from constraints_used pool.",
    )
    status = serializers.ChoiceField(
        choices=VersionStatus.choices,
        required=False,
        default=VersionStatus.DRAFT,
    )


class PaperVersionListSerializer(serializers.ModelSerializer):
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = PaperVersion
        fields = [
            "id",
            "paper",
            "version_label",
            "total_marks",
            "question_count",
            "status",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj: PaperVersion) -> int:
        return len(obj.question_snapshot)


class PaperVersionDetailSerializer(serializers.ModelSerializer):
    paper_title = serializers.CharField(source="paper.title", read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = PaperVersion
        fields = [
            "id",
            "paper",
            "paper_title",
            "version_label",
            "question_snapshot",
            "total_marks",
            "question_count",
            "constraints_used",
            "status",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj: PaperVersion) -> int:
        return len(obj.question_snapshot)


# ---------------------------------------------------------------------------
# Delivery Serializers
# ---------------------------------------------------------------------------

class DeliveryCreateSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=DeliveryMode.choices)
    class_section_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Optional ClassSection ID to assign all enrolled students at once.",
    )
    student_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=list,
        help_text="List of User IDs for students (required for ONLINE mode unless class_section_id is given).",
    )
    status = serializers.ChoiceField(
        choices=DeliveryStatus.choices,
        required=False,
        default=DeliveryStatus.ACTIVE,
    )
    available_from = serializers.DateTimeField(required=False, allow_null=True)
    available_until = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        mode = attrs.get("mode")
        student_ids = attrs.get("student_ids", [])
        class_section_id = attrs.get("class_section_id")

        if class_section_id:
            from schools.models import ClassSection  # noqa: PLC0415
            cs = ClassSection.objects.filter(id=class_section_id).first()
            if not cs:
                raise serializers.ValidationError({"class_section_id": "Specified class section division does not exist."})
            class_student_ids = list(cs.students.filter(role="Student").values_list("id", flat=True))
            student_ids = list(set(student_ids + class_student_ids))
            attrs["student_ids"] = student_ids
            attrs["target_class"] = cs

        if mode == DeliveryMode.ONLINE and not student_ids:
            raise serializers.ValidationError(
                {"student_ids": "At least one student or an enrolled class division must be assigned for ONLINE delivery."}
            )

        avail_from = attrs.get("available_from")
        avail_until = attrs.get("available_until")
        if avail_from and avail_until and avail_from > avail_until:
            raise serializers.ValidationError(
                {"available_until": "available_until must be after available_from."}
            )

        return attrs


class DeliverySerializer(serializers.ModelSerializer):
    paper_id = serializers.IntegerField(source="paper_version.paper.id", read_only=True)
    paper_title = serializers.CharField(source="paper_version.paper.title", read_only=True)
    version_label = serializers.CharField(source="paper_version.version_label", read_only=True)
    total_marks = serializers.IntegerField(source="paper_version.total_marks", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    target_class_name = serializers.CharField(source="target_class.name", read_only=True, default=None)
    assigned_students_count = serializers.SerializerMethodField()
    assigned_students_details = serializers.SerializerMethodField()
    my_attempt = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = [
            "id",
            "paper_version",
            "paper_id",
            "paper_title",
            "version_label",
            "total_marks",
            "mode",
            "status",
            "target_class",
            "target_class_name",
            "assigned_students",
            "assigned_students_count",
            "assigned_students_details",
            "my_attempt",
            "available_from",
            "available_until",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]

    def get_assigned_students_count(self, obj: Delivery) -> int:
        return obj.assigned_students.count()

    def get_assigned_students_details(self, obj: Delivery) -> list[dict[str, Any]]:
        return [
            {"id": s.id, "username": s.username, "email": s.email}
            for s in obj.assigned_students.all()
        ]

    def get_my_attempt(self, obj: Delivery) -> dict[str, Any] | None:
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return None
        attempt = obj.attempts.filter(student=request.user).first()
        if not attempt:
            return None
        return {
            "id": attempt.id,
            "status": attempt.status,
            "score": float(attempt.score) if attempt.score is not None else 0.0,
            "max_score": float(attempt.max_score) if attempt.max_score is not None else float(obj.paper_version.total_marks),
        }


# ---------------------------------------------------------------------------
# Print Representation Serializer
# ---------------------------------------------------------------------------

class PaperPrintSerializer(serializers.Serializer):
    """
    Returns structured representation suitable for print/PDF rendering.
    Uses the exact same underlying question_snapshot.
    """

    paper_id = serializers.IntegerField()
    title = serializers.CharField()
    school_name = serializers.CharField(required=False, allow_blank=True, default="")
    instructions = serializers.CharField(required=False, allow_blank=True, default="")
    version_label = serializers.CharField()
    duration_minutes = serializers.IntegerField(default=60)
    total_question_count = serializers.IntegerField(default=0)
    subjects = serializers.ListField(child=serializers.CharField(), default=list)
    total_marks = serializers.IntegerField()
    question_count = serializers.IntegerField()
    questions = serializers.ListField(child=serializers.DictField())
