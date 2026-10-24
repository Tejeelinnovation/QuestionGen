"""
Service module for isolated Demo Account sandbox launch.

Enables Super Administrators to provision and launch live demo personas
(Teacher, Student, School Admin, QBM) in isolated browser contexts without
session clashing, token blacklisting, or credential exposure.
"""

from __future__ import annotations

import logging
import secrets
from typing import Any

from django.core.cache import cache
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import transaction

from schools.models import ClassSection, ClassSubjectTeacher, School
from users.capability_defaults import (
    grant_deo_and_validator_defaults,
    grant_deo_defaults,
    grant_qbm_defaults,
    grant_school_admin_defaults,
    grant_student_defaults,
    grant_teacher_defaults,
    grant_validator_defaults,
)
from users.models import User

logger = logging.getLogger(__name__)

TICKET_SALT = "qgs-demo-launch-ticket"

DEMO_PERSONAS: dict[str, dict[str, Any]] = {
    "teacher": {
        "username": "teacher1",
        "email": "teacher1@greenwood.edu",
        "first_name": "Thomas",
        "last_name": "Teacher",
        "role": "Teacher",
        "mobile_number": "+919876543212",
        "primary_subject": "Mathematics",
        "redirect_url": "/dashboard/teacher",
    },
    "student": {
        "username": "student1",
        "email": "student1@greenwood.edu",
        "first_name": "Sam",
        "last_name": "Student",
        "role": "Student",
        "mobile_number": "+919876543213",
        "redirect_url": "/dashboard/student",
    },
    "school_admin": {
        "username": "schooladmin1",
        "email": "admin@greenwood.edu",
        "first_name": "Sarah",
        "last_name": "Admin",
        "role": "School Admin",
        "mobile_number": "+919876543211",
        "redirect_url": "/dashboard/school-admin",
    },
    "qbm": {
        "username": "qbm1",
        "email": "qbm1@system.local",
        "first_name": "Quinn",
        "last_name": "BankManager",
        "role": "QBM",
        "mobile_number": "+919876543219",
        "redirect_url": "/dashboard/qbm",
    },
    "deo": {
        "username": "deo1",
        "email": "deo1@greenwood.edu",
        "first_name": "Deepa",
        "last_name": "Patel",
        "role": "DEO",
        "mobile_number": "+919876543220",
        "redirect_url": "/dashboard/qbm",
    },
    "validator": {
        "username": "validator1",
        "email": "validator1@greenwood.edu",
        "first_name": "Vikram",
        "last_name": "Sengupta",
        "role": "Validator",
        "mobile_number": "+919876543221",
        "redirect_url": "/dashboard/qbm",
    },
    "dual": {
        "username": "dualuser1",
        "email": "dualuser1@greenwood.edu",
        "first_name": "Devika",
        "last_name": "Rao",
        "role": "DEO & Validator",
        "mobile_number": "+919876543222",
        "redirect_url": "/dashboard/qbm",
    },
}


def ensure_demo_school() -> School:
    """Ensure the standard demo school exists with Question Bank capability enabled."""
    school, created = School.objects.get_or_create(
        name="Greenwood High School",
        defaults={
            "config": {"curriculum": "CBSE", "board": "NCERT"},
            "question_bank_enabled": True,
            "max_students": 500,
            "max_teachers": 50,
        },
    )
    if not school.question_bank_enabled:
        school.question_bank_enabled = True
        school.save(update_fields=["question_bank_enabled"])
    return school


def get_or_create_demo_user(role_key: str) -> User:
    """
    Safely retrieve or provision a demo user corresponding to the persona key.
    Ensures related academic structures (classes, subject mappings) exist so
    dashboards and exam workflows render cleanly without serializer errors.
    """
    cfg = DEMO_PERSONAS.get(role_key)
    if not cfg:
        raise ValueError(f"Unknown demo persona key: '{role_key}'")

    school = ensure_demo_school()

    with transaction.atomic():
        user, created = User.objects.get_or_create(
            username=cfg["username"],
            defaults={
                "email": cfg["email"],
                "first_name": cfg["first_name"],
                "last_name": cfg["last_name"],
                "role": cfg["role"],
                "mobile_number": cfg["mobile_number"],
                "school": None if role_key == "qbm" else school,
            },
        )

        if not created:
            user.first_name = cfg["first_name"]
            user.last_name = cfg["last_name"]
            user.role = cfg["role"]
            user.mobile_number = cfg["mobile_number"]
            if role_key != "qbm" and user.school != school:
                user.school = school
            user.save()

        # Persona-specific associations
        if role_key == "teacher":
            user.primary_subject = cfg["primary_subject"]
            user.save(update_fields=["primary_subject"])
            grant_teacher_defaults(user)

            # Ensure ClassSection 10-A exists and teacher is mapped
            class_10a, _ = ClassSection.objects.get_or_create(
                school=school,
                standard=10,
                section="A",
                defaults={
                    "max_students": 40,
                    "class_teacher": user,
                    "class_teacher_subject": "Mathematics",
                },
            )
            if class_10a.class_teacher != user:
                class_10a.class_teacher = user
                class_10a.class_teacher_subject = "Mathematics"
                class_10a.save()

            ClassSubjectTeacher.objects.get_or_create(
                class_section=class_10a,
                subject="Mathematics",
                defaults={"teacher": user},
            )
            ClassSubjectTeacher.objects.get_or_create(
                class_section=class_10a,
                subject="Science",
                defaults={"teacher": user},
            )

        elif role_key == "student":
            class_10a, _ = ClassSection.objects.get_or_create(
                school=school,
                standard=10,
                section="A",
                defaults={"max_students": 40},
            )
            user.class_section = class_10a
            user.save(update_fields=["class_section"])
            grant_student_defaults(user)

        elif role_key == "school_admin":
            grant_school_admin_defaults(user)

        elif role_key == "qbm":
            grant_qbm_defaults(user)

        elif role_key == "deo":
            grant_deo_defaults(user)

        elif role_key == "validator":
            grant_validator_defaults(user)

        elif role_key == "dual":
            grant_deo_and_validator_defaults(user)

    return user


def generate_demo_ticket(role_key: str) -> tuple[str, str, str]:
    """
    Generate an ephemeral cryptographic signed ticket for the requested demo persona.
    Valid for 60 seconds.
    Returns: (ticket, username, target_url)
    """
    role = role_key.lower().strip()
    if role not in DEMO_PERSONAS:
        raise ValueError(f"Invalid demo persona '{role}'. Expected one of: {list(DEMO_PERSONAS.keys())}")

    user = get_or_create_demo_user(role)
    signer = TimestampSigner(salt=TICKET_SALT)
    nonce = secrets.token_hex(8)
    payload = f"{user.id}:{role}:{nonce}"
    ticket = signer.sign(payload)
    target_url = DEMO_PERSONAS[role]["redirect_url"]

    logger.info("Generated demo launch ticket for user=%s role=%s nonce=%s", user.username, role, nonce)
    return ticket, user.username, target_url


def consume_demo_ticket(ticket: str) -> tuple[User, str]:
    """
    Validate and consume a signed demo launch ticket.
    Prevents replay within the validity window using a short cache lock.
    Returns: (User instance, redirect_url)
    """
    signer = TimestampSigner(salt=TICKET_SALT)
    try:
        payload = signer.unsign(ticket, max_age=60)
    except (BadSignature, SignatureExpired) as exc:
        raise ValueError("The demo launch link is invalid or has expired (valid for 60s). Please launch again from Super Admin.") from exc

    parts = payload.split(":")
    if len(parts) != 3:
        raise ValueError("Malformed demo launch ticket.")

    user_id_str, role, nonce = parts

    # Replay protection check
    cache_key = f"demo_ticket_consumed_{nonce}"
    if cache.get(cache_key):
        raise ValueError("This demo launch ticket has already been used. Please launch a fresh session from Super Admin.")
    cache.set(cache_key, True, timeout=120)

    try:
        user = User.objects.get(id=int(user_id_str))
    except (User.DoesNotExist, ValueError):
        raise ValueError("The requested demo account could not be found.")

    redirect_url = DEMO_PERSONAS.get(role, {}).get("redirect_url", "/dashboard/teacher")
    logger.info("Successfully consumed demo launch ticket for user=%s role=%s", user.username, role)
    return user, redirect_url
