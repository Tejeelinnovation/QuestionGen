"""
Serializers for content_ingestion app.
"""

from rest_framework import serializers

from .models import ExtractedChapter, ExtractedItem, ExtractedPage, IngestionJob


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
        ]

    def get_items_count(self, obj) -> int:
        if obj.structured_content and isinstance(obj.structured_content, list):
            return len(obj.structured_content)
        return 0


class IngestionJobListSerializer(serializers.ModelSerializer):
    progress_percentage = serializers.ReadOnlyField()

    class Meta:
        model = IngestionJob
        fields = [
            "id",
            "title",
            "subject",
            "standard",
            "board",
            "document_kind",
            "granularity",
            "status",
            "total_pages",
            "processed_pages",
            "progress_percentage",
            "current_stage",
            "google_drive_url",
            "created_at",
            "updated_at",
        ]


class IngestionJobDetailSerializer(serializers.ModelSerializer):
    chapters = ExtractedChapterSerializer(many=True, read_only=True)
    progress_percentage = serializers.ReadOnlyField()
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = IngestionJob
        fields = [
            "id",
            "title",
            "subject",
            "standard",
            "board",
            "document_kind",
            "granularity",
            "status",
            "total_pages",
            "processed_pages",
            "progress_percentage",
            "current_stage",
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


class IngestionJobCreateSerializer(serializers.ModelSerializer):
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
