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

from .models import Book, Chapter, Question, Topic


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
# Question — list (no correct_answer; keeps browsing safe before P4 auth)
# ---------------------------------------------------------------------------

class QuestionListSerializer(serializers.ModelSerializer):
    """
    Compact representation for list/filter responses.

    ``correct_answer`` and ``options`` are intentionally excluded here —
    the detail serializer exposes them.  When the attempts app (P4) adds
    student-facing endpoints, it should use this serializer (or a subset)
    and never expose the answer to a student during an active attempt.
    """

    topic_name = serializers.CharField(source="topic.name", read_only=True)
    chapter_title = serializers.CharField(source="topic.chapter.title", read_only=True)
    book_title = serializers.CharField(source="topic.chapter.book.title", read_only=True)
    question_type_display = serializers.CharField(
        source="get_question_type_display", read_only=True
    )
    difficulty_display = serializers.CharField(source="get_difficulty_display", read_only=True)
    learner_level_display = serializers.CharField(
        source="get_learner_level_display", read_only=True
    )

    class Meta:
        model = Question
        fields = [
            "id",
            "topic",
            "topic_name",
            "chapter_title",
            "book_title",
            "question_text",
            "question_type",
            "question_type_display",
            "marks",
            "difficulty",
            "difficulty_display",
            "learner_level",
            "learner_level_display",
            "source_reference",
            "is_active",
            "created_at",
            "updated_at",
        ]


# ---------------------------------------------------------------------------
# Question — detail (full, including answer key)
# ---------------------------------------------------------------------------

class QuestionDetailSerializer(QuestionListSerializer):
    """
    Full representation including ``correct_answer`` and ``options``.

    Used for teacher-facing detail views.  Do NOT use this serializer
    on student-facing endpoints during an active test attempt.
    """

    class Meta(QuestionListSerializer.Meta):
        fields = QuestionListSerializer.Meta.fields + [
            "options",
            "correct_answer",
        ]
