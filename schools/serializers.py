"""
Serializers for the schools app.
"""

from __future__ import annotations

from rest_framework import serializers
from .models import School


class SchoolSerializer(serializers.ModelSerializer):
    """Serializer for School model representing tenant institutions."""

    class Meta:
        model = School
        fields = ["id", "name", "config", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError("School name cannot be empty.")
        return trimmed

    def validate_config(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("School config must be a valid JSON object.")
        return value
