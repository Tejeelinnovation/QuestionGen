from django.contrib import admin

from .models import Delivery, Paper, PaperVersion


@admin.register(Paper)
class PaperAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "chapter", "created_by", "school", "status", "created_at")
    list_filter = ("status", "school", "chapter")
    search_fields = ("title", "instructions", "created_by__username")


@admin.register(PaperVersion)
class PaperVersionAdmin(admin.ModelAdmin):
    list_display = ("id", "paper", "version_label", "total_marks", "status", "created_at")
    list_filter = ("status", "paper__school")
    search_fields = ("paper__title", "version_label")


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = ("id", "paper_version", "mode", "status", "available_from", "available_until", "created_at")
    list_filter = ("mode", "status")
    search_fields = ("paper_version__paper__title",)
