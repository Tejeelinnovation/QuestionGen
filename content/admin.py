from django.contrib import admin

from .models import Book, Chapter, Question, Topic


# ---------------------------------------------------------------------------
# Topic inline (shown inside ChapterAdmin)
# ---------------------------------------------------------------------------

class TopicInline(admin.TabularInline):
    model = Topic
    extra = 0
    fields = ("name", "created_at")
    readonly_fields = ("created_at",)


# ---------------------------------------------------------------------------
# Chapter inline (shown inside BookAdmin)
# ---------------------------------------------------------------------------

class ChapterInline(admin.TabularInline):
    model = Chapter
    extra = 0
    fields = ("chapter_order", "title", "created_at")
    readonly_fields = ("created_at",)


# ---------------------------------------------------------------------------
# Book
# ---------------------------------------------------------------------------

@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "subject", "grade", "publisher", "is_active", "created_at")
    list_filter = ("subject", "grade", "is_active")
    search_fields = ("title", "subject", "publisher")
    readonly_fields = ("created_at", "updated_at")
    inlines = [ChapterInline]


# ---------------------------------------------------------------------------
# Chapter
# ---------------------------------------------------------------------------

@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ("title", "chapter_order", "book", "created_at")
    list_filter = ("book",)
    search_fields = ("title", "book__title")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("book", "chapter_order")
    inlines = [TopicInline]


# ---------------------------------------------------------------------------
# Topic
# ---------------------------------------------------------------------------

@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("name", "chapter", "created_at")
    list_filter = ("chapter__book",)
    search_fields = ("name", "chapter__title", "chapter__book__title")
    readonly_fields = ("created_at", "updated_at")


# ---------------------------------------------------------------------------
# Question
# ---------------------------------------------------------------------------

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = (
        "short_text",
        "topic",
        "question_type",
        "difficulty",
        "learner_level",
        "marks",
        "is_active",
    )
    list_filter = ("question_type", "difficulty", "learner_level", "is_active", "topic__chapter__book")
    search_fields = ("question_text", "topic__name", "topic__chapter__title")
    readonly_fields = ("created_at", "updated_at")
    list_per_page = 50

    @admin.display(description="Question (truncated)")
    def short_text(self, obj):
        text = obj.question_text
        return text[:80] + "…" if len(text) > 80 else text
