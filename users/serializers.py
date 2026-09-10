"""
Serializers for the users app.
"""

from __future__ import annotations

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from schools.models import ClassSection, School
from .models import Capability, CapabilityName, User, UserCapability


# ---------------------------------------------------------------------------
# Auth serializers
# ---------------------------------------------------------------------------

class LoginSerializer(serializers.Serializer):
    """Validates username + password and returns the authenticated user."""

    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            username=attrs["username"],
            password=attrs["password"],
        )
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        attrs["user"] = user
        return attrs


# ---------------------------------------------------------------------------
# User serializers
# ---------------------------------------------------------------------------

import re

def validate_indian_mobile(value: str) -> str:
    cleaned = str(value).strip().replace(" ", "").replace("-", "")
    if not re.match(r"^\+91[0-9]{10}$", cleaned):
        raise serializers.ValidationError(
            "Mobile number must start with +91 followed by a valid 10-digit number (e.g. +919876543210)."
        )
    return cleaned


class CapabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Capability
        fields = ["name", "display_name"]

    display_name = serializers.CharField(source="get_name_display", read_only=True)


class UserSerializer(serializers.ModelSerializer):
    """Full user representation including capabilities list and role label."""

    capabilities = serializers.SerializerMethodField()
    role_label = serializers.CharField(read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True, default=None)
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=None
    )
    class_section_name = serializers.CharField(
        source="class_section.name", read_only=True, default=None
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "mobile_number",
            "first_name",
            "last_name",
            "school",
            "school_name",
            "class_section",
            "class_section_name",
            "primary_subject",
            "created_by",
            "created_by_username",
            "role",
            "role_label",
            "capabilities",
            "is_active",
            "date_joined",
        ]
        read_only_fields = fields

    def get_capabilities(self, obj):
        caps = obj.user_capabilities.select_related("capability").all()
        return [
            {"name": uc.capability.name, "display_name": uc.capability.get_name_display()}
            for uc in caps
        ]


class CreateUserSerializer(serializers.ModelSerializer):
    """
    Input serializer for user creation with mandatory capability gating.
    Requires password, username, email, mobile_number, and a target capability profile.
    """

    email = serializers.EmailField(
        required=True,
        allow_blank=False,
        error_messages={
            "required": "Email address is compulsory.",
            "blank": "Email address cannot be empty.",
        },
    )
    mobile_number = serializers.CharField(
        required=True,
        allow_blank=False,
        validators=[validate_indian_mobile],
        error_messages={
            "required": "Mobile number is compulsory.",
            "blank": "Mobile number cannot be empty.",
        },
    )
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    profile = serializers.ChoiceField(
        choices=["school_admin", "teacher", "student"],
        write_only=True,
        help_text=(
            "Desired capability profile for the new user. "
            "Grants a standard default set — additional grants can be added separately."
        ),
    )
    school = serializers.PrimaryKeyRelatedField(
        queryset=School.objects.all(),
        required=False,
        allow_null=True,
    )
    class_section = serializers.PrimaryKeyRelatedField(
        queryset=ClassSection.objects.all(),
        required=False,
        allow_null=True,
    )
    primary_subject = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "mobile_number",
            "first_name",
            "last_name",
            "password",
            "school",
            "class_section",
            "primary_subject",
            "profile",
        ]

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        profile = attrs.get("profile")
        school = attrs.get("school")

        # School Admins, Teachers, Students MUST belong to a school.
        if profile in ("school_admin", "teacher", "student") and not school:
            raise serializers.ValidationError(
                {"school": "A school must be specified for this user type."}
            )

        # Capacity Quota Enforcement
        if school and profile == "teacher":
            current_teachers = school.users.filter(role="Teacher").count()
            if current_teachers >= school.max_teachers:
                raise serializers.ValidationError(
                    {
                        "school": (
                            f"Teacher capacity limit ({school.max_teachers}) reached for {school.name}. "
                            f"Currently {current_teachers} teachers are registered. "
                            "Contact Super Admin to increase institution quota."
                        )
                    }
                )

        if school and profile == "student":
            current_students = school.users.filter(role="Student").count()
            if current_students >= school.max_students:
                raise serializers.ValidationError(
                    {
                        "school": (
                            f"Student enrollment limit ({school.max_students}) reached for {school.name}. "
                            f"Currently {current_students} students are enrolled. "
                            "Contact Super Admin to increase institution quota."
                        )
                    }
                )

            class_section = attrs.get("class_section")
            if class_section:
                if class_section.school_id != school.id:
                    raise serializers.ValidationError(
                        {"class_section": "The selected class section does not belong to this school."}
                    )
                enrolled = class_section.students.filter(role="Student").count()
                if enrolled >= class_section.max_students:
                    raise serializers.ValidationError(
                        {
                            "class_section": (
                                f"Class division '{class_section.name}' has reached its maximum capacity "
                                f"of {class_section.max_students} students (currently {enrolled} enrolled)."
                            )
                        }
                    )

        return attrs

    def create(self, validated_data):
        profile = validated_data.pop("profile")
        password = validated_data.pop("password")
        validated_data.setdefault("is_active", True)

        role_map = {
            "school_admin": "School Admin",
            "teacher": "Teacher",
            "student": "Student",
        }
        user = User(role=role_map.get(profile, profile), **validated_data)
        user.set_password(password)
        user.save()

        # Grant default capabilities based on requested profile.
        from users.capability_defaults import (  # noqa: PLC0415
            grant_school_admin_defaults,
            grant_student_defaults,
            grant_teacher_defaults,
        )

        granted_by = self.context.get("request").user if self.context.get("request") else None
        dispatch = {
            "school_admin": grant_school_admin_defaults,
            "teacher": grant_teacher_defaults,
            "student": grant_student_defaults,
        }
        dispatch[profile](user, granted_by=granted_by)

        return user


class UpdateUserSerializer(serializers.ModelSerializer):
    """
    Partial-update serializer — only allows safe field edits.
    Capability changes go through the dedicated grant/revoke endpoints.
    """

    email = serializers.EmailField(required=False, allow_blank=False)
    mobile_number = serializers.CharField(
        required=False,
        allow_blank=False,
        validators=[validate_indian_mobile],
    )
    class_section = serializers.PrimaryKeyRelatedField(
        queryset=ClassSection.objects.all(),
        required=False,
        allow_null=True,
    )
    primary_subject = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = User
        fields = [
            "email",
            "mobile_number",
            "first_name",
            "last_name",
            "class_section",
            "primary_subject",
            "is_active",
        ]

    def validate(self, attrs):
        class_section = attrs.get("class_section")
        if class_section and self.instance:
            if self.instance.school_id and class_section.school_id != self.instance.school_id:
                raise serializers.ValidationError(
                    {"class_section": "Class division must belong to the student's school."}
                )
            if self.instance.class_section_id != class_section.id:
                enrolled = class_section.students.filter(role="Student").count()
                if enrolled >= class_section.max_students:
                    raise serializers.ValidationError(
                        {
                            "class_section": (
                                f"Class division '{class_section.name}' has reached its maximum capacity "
                                f"of {class_section.max_students} students."
                            )
                        }
                    )
        return attrs


class CapabilityGrantSerializer(serializers.Serializer):
    """Body for POST /api/users/{id}/permissions/ (grant capability)."""

    capability_name = serializers.ChoiceField(choices=CapabilityName.choices)

    def validate_capability_name(self, value):
        if not Capability.objects.filter(name=value).exists():
            raise serializers.ValidationError(
                f"'{value}' is not a recognised capability."
            )
        return value
