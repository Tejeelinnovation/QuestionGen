"""
Serializers for the content app.

Read serializers include denormalised display fields (e.g. topic_name,
chapter_title) so API consumers don't need to make extra requests.

Write serializers are intentionally omitted from this phase — this prompt
is read-only browsing only.  When content management is introduced, write
serializers should be added as separate classes (not by making read
serializers writable) to avoid confusion.
"""

from rest_framework import serializers

from .models import (
    BankSource,
    Book,
    Chapter,
    Difficulty,
    LearnerLevel,
    Question,
    QuestionType,
    QuestionVariant,
    Topic,
)


# ---------------------------------------------------------------------------
# Book
# ---------------------------------------------------------------------------

class BookSerializer(serializers.ModelSerializer):
    chapter_count = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = [
            "id",
            "title",
            "board",
            "subject",
            "grade",
            "publisher",
            "is_active",
            "chapter_count",
            "created_at",
            "updated_at",
        ]

    def get_chapter_count(self, obj) -> int:
        # Avoids N+1 if the queryset is annotated; falls back to COUNT query.
        if hasattr(obj, "_chapter_count"):
            return obj._chapter_count
        return obj.chapters.count()


# ---------------------------------------------------------------------------
# Chapter
# ---------------------------------------------------------------------------

class ChapterSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source="book.title", read_only=True)
    book_subject = serializers.CharField(source="book.subject", read_only=True)
    book_grade = serializers.CharField(source="book.grade", read_only=True)
    topic_count = serializers.SerializerMethodField()

    class Meta:
        model = Chapter
        fields = [
            "id",
            "book",
            "book_title",
            "book_subject",
            "book_grade",
            "title",
            "chapter_order",
            "topic_count",
            "created_at",
            "updated_at",
        ]

    def get_topic_count(self, obj) -> int:
        return obj.topics.count()


# ---------------------------------------------------------------------------
# Topic
# ---------------------------------------------------------------------------

class TopicSerializer(serializers.ModelSerializer):
    chapter_title = serializers.CharField(source="chapter.title", read_only=True)
    chapter_order = serializers.IntegerField(source="chapter.chapter_order", read_only=True)
    book_title = serializers.CharField(source="chapter.book.title", read_only=True)
    book_subject = serializers.CharField(source="chapter.book.subject", read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Topic
        fields = [
            "id",
            "chapter",
            "chapter_title",
            "chapter_order",
            "book_title",
            "book_subject",
            "name",
            "question_count",
            "created_at",
            "updated_at",
        ]

    def get_question_count(self, obj) -> int:
        return obj.questions.filter(is_active=True).count()


# ---------------------------------------------------------------------------
# QuestionVariant
# ---------------------------------------------------------------------------

class QuestionVariantSerializer(serializers.ModelSerializer):
    variant_type_display = serializers.CharField(source="get_variant_type_display", read_only=True)
    difficulty_display = serializers.CharField(source="get_difficulty_display", read_only=True)

    class Meta:
        model = QuestionVariant
        fields = [
            "id",
            "parent_question",
            "variant_type",
            "variant_type_display",
            "marks",
            "difficulty",
            "difficulty_display",
            "question_text",
            "options",
            "correct_answer",
            "explanation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        parent = attrs.get("parent_question")
        difficulty = attrs.get("difficulty")
        if parent:
            if not difficulty:
                attrs["difficulty"] = parent.difficulty
            elif difficulty != parent.difficulty:
                raise serializers.ValidationError(
                    {"difficulty": f"Variant difficulty ({difficulty}) must match parent question difficulty ({parent.difficulty}). (AC-15)"}
                )
        return attrs


# ---------------------------------------------------------------------------
# Question — list (no correct_answer; keeps browsing safe before P4 auth)
# ---------------------------------------------------------------------------

class QuestionListSerializer(serializers.ModelSerializer):
    """
    Compact representation for list/filter responses.

    ``correct_answer`` and ``options`` are intentionally excluded here —
    the detail serializer exposes them.
    """

    topic_name = serializers.CharField(source="topic.name", read_only=True)
    chapter_title = serializers.CharField(source="topic.chapter.title", read_only=True)
    book_title = serializers.CharField(source="topic.chapter.book.title", read_only=True)
    book_board = serializers.CharField(source="topic.chapter.book.board", read_only=True)
    question_type_display = serializers.CharField(
        source="get_question_type_display", read_only=True
    )
    difficulty_display = serializers.CharField(source="get_difficulty_display", read_only=True)
    learner_level_display = serializers.CharField(
        source="get_learner_level_display", read_only=True
    )
    bank_source_display = serializers.CharField(
        source="get_bank_source_display", read_only=True
    )
    variants_count = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id",
            "topic",
            "topic_name",
            "chapter_title",
            "book_title",
            "book_board",
            "question_text",
            "question_type",
            "question_type_display",
            "marks",
            "difficulty",
            "difficulty_display",
            "learner_level",
            "learner_level_display",
            "bank_source",
            "bank_source_display",
            "school",
            "created_by",
            "variants_count",
            "source_reference",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def get_variants_count(self, obj) -> int:
        return obj.variants.count()


# ---------------------------------------------------------------------------
# Question — detail (full, including answer key & variants)
# ---------------------------------------------------------------------------

class QuestionDetailSerializer(QuestionListSerializer):
    """
    Full representation including options, correct_answer, explanation, and variants.

    Used for teacher-facing detail views. Do NOT use this serializer
    on student-facing endpoints during an active test attempt.
    """

    variants = QuestionVariantSerializer(many=True, read_only=True)

    class Meta(QuestionListSerializer.Meta):
        fields = QuestionListSerializer.Meta.fields + [
            "options",
            "correct_answer",
            "explanation",
            "variants",
        ]


# ---------------------------------------------------------------------------
# Question Ingestion (Write / Ingest)
# ---------------------------------------------------------------------------

class QuestionVariantInputSerializer(serializers.Serializer):
    variant_type = serializers.ChoiceField(choices=QuestionType.choices)
    marks = serializers.DecimalField(max_digits=5, decimal_places=2)
    question_text = serializers.CharField()
    options = serializers.JSONField(required=False, allow_null=True)
    correct_answer = serializers.CharField()
    explanation = serializers.CharField(required=False, allow_blank=True, default="")


class QuestionIngestSerializer(serializers.ModelSerializer):
    """
    Serializer for structured Question Ingestion workflow (AC-10, AC-13, AC-14, AC-15, AC-16).
    Supports single question creation with optional nested variants.
    Accepts an existing `topic` ID or creates curriculum hierarchy (board, book, chapter, topic) dynamically.
    """

    topic = serializers.PrimaryKeyRelatedField(
        queryset=Topic.objects.all(), required=False, allow_null=True
    )
    board = serializers.CharField(required=False, allow_blank=True, write_only=True)
    book_title = serializers.CharField(required=False, allow_blank=True, write_only=True)
    subject = serializers.CharField(required=False, allow_blank=True, write_only=True)
    grade = serializers.CharField(required=False, allow_blank=True, write_only=True)
    chapter_title = serializers.CharField(required=False, allow_blank=True, write_only=True)
    topic_name = serializers.CharField(required=False, allow_blank=True, write_only=True)

    learner_level = serializers.ChoiceField(
        choices=LearnerLevel.choices,
        default=LearnerLevel.INTERMEDIATE,
        required=False,
    )
    variants = QuestionVariantInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Question
        fields = [
            "id",
            "topic",
            "board",
            "book_title",
            "subject",
            "grade",
            "chapter_title",
            "topic_name",
            "question_text",
            "question_type",
            "marks",
            "difficulty",
            "learner_level",
            "bank_source",
            "school",
            "options",
            "correct_answer",
            "explanation",
            "source_reference",
            "variants",
        ]
        read_only_fields = ["id", "created_by"]

    def validate(self, attrs):
        if not attrs.get("topic") and not attrs.get("topic_name"):
            raise serializers.ValidationError(
                {"topic": "Either a valid topic ID or a custom topic_name must be provided."}
            )
        return attrs

    def create(self, validated_data):
        variants_data = validated_data.pop("variants", [])
        board = validated_data.pop("board", None) or "CBSE"
        book_title = validated_data.pop("book_title", None)
        subject = validated_data.pop("subject", None)
        grade = validated_data.pop("grade", None)
        chapter_title = validated_data.pop("chapter_title", None)
        topic_name = validated_data.pop("topic_name", None)

        if not validated_data.get("topic"):
            clean_subject = (subject or "General").strip()
            clean_grade = (grade or "Standard").strip()
            clean_book = (book_title or f"{clean_subject} ({clean_grade})").strip()
            clean_chapter = (chapter_title or "Chapter 1").strip()
            clean_topic = (topic_name or "General Topic").strip()

            book, _ = Book.objects.get_or_create(
                board=board.strip(),
                title=clean_book,
                subject=clean_subject,
                grade=clean_grade,
            )
            chapter, _ = Chapter.objects.get_or_create(
                book=book,
                title=clean_chapter,
                defaults={"chapter_order": book.chapters.count() + 1},
            )
            topic, _ = Topic.objects.get_or_create(
                chapter=chapter,
                name=clean_topic,
            )
            validated_data["topic"] = topic

        request = self.context.get("request")
        user = request.user if request else None

        if user and user.is_authenticated:
            validated_data["created_by"] = user

        question = Question.objects.create(**validated_data)

        for vdata in variants_data:
            QuestionVariant.objects.create(
                parent_question=question,
                variant_type=vdata["variant_type"],
                marks=vdata["marks"],
                difficulty=question.difficulty,  # Strictly enforce AC-15
                question_text=vdata["question_text"],
                options=vdata.get("options"),
                correct_answer=vdata["correct_answer"],
                explanation=vdata.get("explanation", ""),
            )

        return question
