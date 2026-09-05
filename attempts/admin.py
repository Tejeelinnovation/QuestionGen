from django.contrib import admin

from .models import Answer, Attempt


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "delivery", "student", "status", "score", "max_score", "started_at", "submitted_at")
    list_filter = ("status", "delivery__mode")
    search_fields = ("student__username", "delivery__paper_version__paper__title")


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ("id", "attempt", "question_id", "is_correct", "marks_awarded")
    list_filter = ("is_correct",)
    search_fields = ("attempt__student__username",)
