"""
Serializers for content_ingestion app.
"""

from django.conf import settings
from rest_framework import serializers

from .models import ExtractedChapter, ExtractedItem, ExtractedPage, IngestionJob
from .queue import get_job_queue_position


class ExtractedChapterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExtractedChapter
        fields = [
            "id",
            "chapter_number",
            "title",
            "start_page",
            "end_page",
            "summary",
            "metadata",
        ]


class ExtractedItemSerializer(serializers.ModelSerializer):
    page_number = serializers.IntegerField(source="page.page_number", read_only=True)
    chapter_title = serializers.CharField(source="chapter.title", read_only=True, default="")

    class Meta:
        model = ExtractedItem
        fields = [
            "id",
            "item_type",
            "heading",
            "content",
            "latex_equations",
            "image_path",
            "image_caption",
            "page_number",
            "chapter_title",
            "metadata",
            "created_at",
        ]


class ExtractedPageSerializer(serializers.ModelSerializer):
    items_count = serializers.SerializerMethodField()
    chapter_title = serializers.CharField(source="chapter.title", read_only=True, default="")
    needs_review = serializers.SerializerMethodField()
    quality_score = serializers.SerializerMethodField()
    legacy_font_encoding = serializers.SerializerMethodField()
    legacy_review_marker = serializers.SerializerMethodField()

    class Meta:
        model = ExtractedPage
        fields = [
            "id",
            "page_number",
            "layout_type",
            "raw_text",
            "structured_content",
            "chapter",
            "chapter_title",
            "is_verified",
            "items_count",
            "needs_review",
            "quality_score",
            "legacy_font_encoding",
            "legacy_review_marker",
        ]

    def get_items_count(self, obj) -> int:
        if obj.structured_content and isinstance(obj.structured_content, list):
            return len(obj.structured_content)
        return 0

    def get_legacy_font_encoding(self, obj) -> bool:
        if obj.structured_content and isinstance(obj.structured_content, list):
            for sec in obj.structured_content:
                if isinstance(sec, dict):
                    meta = sec.get("metadata", {})
                    if meta.get("legacy_font_encoding") or meta.get("converted_from_legacy_font"):
                        return True
        return False

    def get_legacy_review_marker(self, obj) -> str:
        if self.get_legacy_font_encoding(obj):
            return "converted from old font, please verify"
        return ""

    def get_needs_review(self, obj) -> bool:
        if obj.is_verified:
            return False
        # Check LEGACY_REVIEW_REQUIRED config
        if getattr(settings, "LEGACY_REVIEW_REQUIRED", True) and self.get_legacy_font_encoding(obj):
            return True
        # Check structured content metadata
        if obj.structured_content and isinstance(obj.structured_content, list):
            for sec in obj.structured_content:
                if isinstance(sec, dict) and sec.get("metadata", {}).get("needs_review"):
                    return True
        if not obj.raw_text.strip() and obj.layout_type not in ("IMAGE_ONLY", "FULL_PAGE_IMAGE"):
            return True
        return False

    def get_quality_score(self, obj) -> float:
        if obj.structured_content and isinstance(obj.structured_content, list):
            for sec in obj.structured_content:
                if isinstance(sec, dict) and "quality_score" in sec.get("metadata", {}):
                    return round(float(sec["metadata"]["quality_score"]), 2)
        return 1.0 if obj.is_verified else 0.88



class IngestionJobListSerializer(serializers.ModelSerializer):
    progress_percentage = serializers.ReadOnlyField()
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model = IngestionJob
        fields = [
            "id",
            "title",
            "subject",
            "standard",
            "board",
            "document_kind",
            "classification_confidence",
            "classification_evidence",
            "granularity",
            "status",
            "total_pages",
            "processed_pages",
            "progress_percentage",
            "current_stage",
            "queue_position",
            "error_message",
            "google_drive_file_id",
            "google_drive_url",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_queue_position(self, obj):
        return get_job_queue_position(obj)


class IngestionJobDetailSerializer(serializers.ModelSerializer):
    chapters = ExtractedChapterSerializer(many=True, read_only=True)
    progress_percentage = serializers.ReadOnlyField()
    items_count = serializers.SerializerMethodField()
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model = IngestionJob
        fields = [
            "id",
            "title",
            "subject",
            "standard",
            "board",
            "document_kind",
            "classification_confidence",
            "classification_evidence",
            "granularity",
            "status",
            "total_pages",
            "processed_pages",
            "progress_percentage",
            "current_stage",
            "queue_position",
            "google_drive_file_id",
            "google_drive_url",
            "error_message",
            "table_of_contents",
            "chapters",
            "items_count",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_items_count(self, obj) -> int:
        return obj.items.count()

    def get_queue_position(self, obj):
        return get_job_queue_position(obj)


class IngestionJobCreateSerializer(serializers.ModelSerializer):
    standard = serializers.IntegerField(required=False, allow_null=True)
    board = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    subject = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    document_kind = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = IngestionJob
        fields = [
            "id",
            "title",
            "subject",
            "standard",
            "board",
            "document_kind",
            "source_file",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def to_internal_value(self, data):
        # Support dict, QueryDict, or multi-part structures
        if hasattr(data, "dict"):
            clean_data = data.dict()
        elif hasattr(data, "copy"):
            clean_data = data.copy()
        else:
            clean_data = dict(data)

        for field in ("standard", "board", "subject", "document_kind"):
            if field in clean_data:
                val = clean_data[field]
                if val in ("", "null", "None", "undefined", None):
                    clean_data[field] = None
                elif field == "document_kind" and str(val).strip().upper() == "AUTO":
                    clean_data[field] = None

        return super().to_internal_value(clean_data)
