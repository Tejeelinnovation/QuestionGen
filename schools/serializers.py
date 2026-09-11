"""
Serializers for the schools app.
"""

from __future__ import annotations

from typing import Any
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import ClassSection, ClassSubjectTeacher, School

User = get_user_model()


class SchoolSerializer(serializers.ModelSerializer):
    """Serializer for School model representing tenant institutions."""

    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = [
            "id",
            "name",
            "max_students",
            "max_teachers",
            "question_bank_enabled",
            "student_count",
            "teacher_count",
            "config",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "student_count", "teacher_count", "created_at", "updated_at"]

    def validate_name(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise serializers.ValidationError("School name cannot be empty.")
        return trimmed

    def validate_max_students(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Student capacity quota must be at least 1.")
        return value

    def validate_max_teachers(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Teacher capacity quota must be at least 1.")
        return value

    def validate_config(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("School config must be a valid JSON object.")
        return value

    def get_student_count(self, obj: School) -> int:
        return obj.users.filter(role="Student").count()

    def get_teacher_count(self, obj: School) -> int:
        return obj.users.filter(role="Teacher").count()


class ClassSubjectTeacherSerializer(serializers.ModelSerializer):
    """Serializer for subject-to-teacher assignments within a class section."""

    teacher_username = serializers.CharField(source="teacher.username", read_only=True)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = ClassSubjectTeacher
        fields = [
            "id",
            "class_section",
            "subject",
            "teacher",
            "teacher_username",
            "teacher_name",
            "created_at",
        ]
        read_only_fields = ["id", "teacher_username", "teacher_name", "created_at"]

    def get_teacher_name(self, obj: ClassSubjectTeacher) -> str:
        full_name = f"{obj.teacher.first_name} {obj.teacher.last_name}".strip()
        return full_name or obj.teacher.username

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        teacher = attrs.get("teacher")
        class_section = attrs.get("class_section")
        if teacher and class_section:
            if teacher.school_id != class_section.school_id:
                raise serializers.ValidationError(
                    {"teacher": "Assigned teacher must belong to the same school as the class section."}
                )
            if teacher.role != "Teacher":
                raise serializers.ValidationError(
                    {"teacher": "Only faculty with the 'Teacher' role can be assigned to subjects."}
                )
        return attrs


class ClassSectionSerializer(serializers.ModelSerializer):
    """Read serializer for ClassSection with embedded teacher details and capacity metrics."""

    name = serializers.CharField(read_only=True)
    student_count = serializers.SerializerMethodField()
    enrolled_students_count = serializers.SerializerMethodField()
    class_teacher_username = serializers.CharField(
        source="class_teacher.username", read_only=True, default=None
    )
    class_teacher_name = serializers.SerializerMethodField()
    subject_teachers = ClassSubjectTeacherSerializer(many=True, read_only=True)

    class Meta:
        model = ClassSection
        fields = [
            "id",
            "school",
            "standard",
            "section",
            "name",
            "max_students",
            "student_count",
            "enrolled_students_count",
            "class_teacher",
            "class_teacher_username",
            "class_teacher_name",
            "class_teacher_subject",
            "subject_teachers",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "name",
            "student_count",
            "enrolled_students_count",
            "class_teacher_username",
            "class_teacher_name",
            "subject_teachers",
            "created_at",
            "updated_at",
        ]

    def get_student_count(self, obj: ClassSection) -> int:
        return obj.students.count()

    def get_enrolled_students_count(self, obj: ClassSection) -> int:
        return obj.students.count()

    def get_class_teacher_name(self, obj: ClassSection) -> str | None:
        if not obj.class_teacher:
            return None
        full_name = f"{obj.class_teacher.first_name} {obj.class_teacher.last_name}".strip()
        return full_name or obj.class_teacher.username


class ClassSectionCreateUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for creating and updating ClassSection divisions."""

    class Meta:
        model = ClassSection
        fields = [
            "id",
            "school",
            "standard",
            "section",
            "max_students",
            "class_teacher",
            "class_teacher_subject",
        ]
        read_only_fields = ["id"]

    def validate_standard(self, value: int) -> int:
        if value < 1 or value > 12:
            raise serializers.ValidationError("Standard must be between 1 and 12 (e.g. 8, 9, 10).")
        return value

    def validate_section(self, value: str) -> str:
        trimmed = value.strip().upper()
        if not trimmed:
            raise serializers.ValidationError("Division / section cannot be empty.")
        if len(trimmed) > 3:
            raise serializers.ValidationError("Section code is too long (e.g. 'A', 'B', up to 'J').")
        return trimmed

    def validate_max_students(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Class student capacity must be at least 1.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        school = attrs.get("school") or (self.instance.school if self.instance else None)
        class_teacher = attrs.get("class_teacher")

        if class_teacher and school:
            if class_teacher.school_id != school.id:
                raise serializers.ValidationError(
                    {"class_teacher": "The selected class teacher must belong to this school."}
                )
            if class_teacher.role != "Teacher":
                raise serializers.ValidationError(
                    {"class_teacher": "Only users with the Teacher role can be designated as Class Teacher."}
                )

        # Check unique_together within school
        standard = attrs.get("standard") or (self.instance.standard if self.instance else None)
        section = attrs.get("section") or (self.instance.section if self.instance else None)
        if school and standard and section:
            qs = ClassSection.objects.filter(school=school, standard=standard, section=section)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"section": f"Standard {standard} Section {section} already exists in this school."}
                )

        return attrs

