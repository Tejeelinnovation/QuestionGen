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
            "image_label",
            "image_description",
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
    duration_seconds = serializers.ReadOnlyField()
    duration_formatted = serializers.ReadOnlyField()
    file_size_formatted = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    uploaded_by_role = serializers.SerializerMethodField()
    uploaded_by_email = serializers.SerializerMethodField()
    device_info = serializers.SerializerMethodField()

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
            "duration_seconds",
            "duration_formatted",
            "file_size_bytes",
            "file_size_formatted",
            "uploaded_by_name",
            "uploaded_by_role",
            "uploaded_by_email",
            "device_info",
            "error_message",
            "google_drive_file_id",
            "google_drive_url",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_queue_position(self, obj):
        return get_job_queue_position(obj)

    def get_file_size_formatted(self, obj) -> str:
        bytes_val = obj.file_size_bytes or 0
        if bytes_val <= 0 and obj.source_file:
            try:
                bytes_val = obj.source_file.size
            except Exception:
                bytes_val = 0
        if bytes_val <= 0:
            return ""
        if bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        return f"{bytes_val / (1024 * 1024):.1f} MB"

    def get_uploaded_by_name(self, obj) -> str:
        if obj.uploaded_by:
            full_name = obj.uploaded_by.get_full_name().strip()
            if full_name:
                return full_name
            return obj.uploaded_by.username or "Super Admin"
        return "Super Admin"

    def get_uploaded_by_role(self, obj) -> str:
        if obj.uploaded_by:
            if hasattr(obj.uploaded_by, "role") and obj.uploaded_by.role:
                return obj.uploaded_by.role
            if hasattr(obj.uploaded_by, "role_label"):
                return obj.uploaded_by.role_label
            if obj.uploaded_by.is_superuser:
                return "Super Admin"
            return "Teacher"
        return "Teacher"

    def get_uploaded_by_email(self, obj) -> str:
        return obj.uploaded_by.email if obj.uploaded_by else ""

    def get_device_info(self, obj) -> dict:
        meta = obj.metadata if isinstance(obj.metadata, dict) else {}
        device = meta.get("device")
        if isinstance(device, dict):
            return {
                "device_type": device.get("device_type", "Desktop"),
                "os": device.get("os", "Windows"),
                "browser": device.get("browser", "Chrome"),
            }
        device_type = meta.get("device_type", "Desktop")
        return {
            "device_type": device_type,
            "os": "Desktop",
            "browser": "Browser",
        }


class IngestionJobDetailSerializer(serializers.ModelSerializer):
    chapters = ExtractedChapterSerializer(many=True, read_only=True)
    progress_percentage = serializers.ReadOnlyField()
    items_count = serializers.SerializerMethodField()
    queue_position = serializers.SerializerMethodField()
    duration_seconds = serializers.ReadOnlyField()
    duration_formatted = serializers.ReadOnlyField()
    file_size_formatted = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    uploaded_by_role = serializers.SerializerMethodField()
    uploaded_by_email = serializers.SerializerMethodField()
    device_info = serializers.SerializerMethodField()

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
            "duration_seconds",
            "duration_formatted",
            "file_size_bytes",
            "file_size_formatted",
            "uploaded_by_name",
            "uploaded_by_role",
            "uploaded_by_email",
            "device_info",
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

    def get_file_size_formatted(self, obj) -> str:
        bytes_val = obj.file_size_bytes or 0
        if bytes_val <= 0 and obj.source_file:
            try:
                bytes_val = obj.source_file.size
            except Exception:
                bytes_val = 0
        if bytes_val <= 0:
            return ""
        if bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        return f"{bytes_val / (1024 * 1024):.1f} MB"

    def get_uploaded_by_name(self, obj) -> str:
        if obj.uploaded_by:
            full_name = obj.uploaded_by.get_full_name().strip()
            if full_name:
                return full_name
            return obj.uploaded_by.username or "Super Admin"
        return "Super Admin"

    def get_uploaded_by_role(self, obj) -> str:
        if obj.uploaded_by:
            if hasattr(obj.uploaded_by, "role") and obj.uploaded_by.role:
                return obj.uploaded_by.role
            if hasattr(obj.uploaded_by, "role_label"):
                return obj.uploaded_by.role_label
            if obj.uploaded_by.is_superuser:
                return "Super Admin"
            return "Teacher"
        return "Teacher"

    def get_uploaded_by_email(self, obj) -> str:
        return obj.uploaded_by.email if obj.uploaded_by else ""

    def get_device_info(self, obj) -> dict:
        meta = obj.metadata if isinstance(obj.metadata, dict) else {}
        device = meta.get("device")
        if isinstance(device, dict):
            return {
                "device_type": device.get("device_type", "Desktop"),
                "os": device.get("os", "Windows"),
                "browser": device.get("browser", "Chrome"),
            }
        device_type = meta.get("device_type", "Desktop")
        return {
            "device_type": device_type,
            "os": "Desktop",
            "browser": "Browser",
        }


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
