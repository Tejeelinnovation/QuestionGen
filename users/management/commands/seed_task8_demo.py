"""
Management command: seed_task8_demo

Provisions comprehensive demo data for Task 8 (QBM -> DEO -> Validator -> Approved Question Bank):
1. Greenwood High (Mode A: validation_workflow_enabled = True)
   - deo1 / password123 (Data Entry Operator)
   - validator1 / password123 (Validator)
   - dualuser1 / password123 (DEO & Validator Dual Role)
   - Demo questions in DRAFT, SUBMITTED, CORRECTION_REQUIRED, APPROVED, and REJECTED states
2. Oakridge Academy (Mode B: validation_workflow_enabled = False)
   - teacher_direct / password123 (Standard teacher question-generation flow without validation requirement)
   - Direct question bank questions

Usage:
    python manage.py seed_task8_demo
    python manage.py seed_task8_demo --clear
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from content.models import (
    Book,
    Chapter,
    Question,
    QuestionType,
    QuestionValidationHistory,
    QuestionVariant,
    Topic,
    ValidationAction,
    ValidationStatus,
)
from schools.models import School
from users.capability_defaults import (
    grant_deo_and_validator_defaults,
    grant_deo_defaults,
    grant_teacher_defaults,
    grant_validator_defaults,
)
from users.models import User


class Command(BaseCommand):
    help = "Seed demo users and questions for Task 8 QBM Validation Workflow (Mode A and Mode B)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete Task 8 demo users and questions before recreating them.",
        )

    def handle(self, *args, **options):
        clear = options["clear"]
        task8_usernames = ["deo1", "validator1", "dualuser1", "teacher_direct"]

        if clear:
            self.stdout.write("Clearing existing Task 8 demo users and seed data...")
            User.objects.filter(username__in=task8_usernames).delete()
            Question.objects.filter(source_reference__startswith="TASK8_DEMO").delete()

        with transaction.atomic():
            # ─────────────────────────────────────────────────────────────────
            # 1. School 1: Greenwood High (Mode A: Validation Enabled)
            # ─────────────────────────────────────────────────────────────────
            greenwood, _ = School.objects.get_or_create(
                name="Greenwood High School",
                defaults={
                    "config": {"curriculum": "CBSE", "board": "NCERT"},
                    "max_students": 1000,
                    "max_teachers": 100,
                    "question_bank_enabled": True,
                    "validation_workflow_enabled": True,
                },
            )
            greenwood.validation_workflow_enabled = True
            greenwood.question_bank_enabled = True
            greenwood.save()

            # ─────────────────────────────────────────────────────────────────
            # 2. School 2: Oakridge Academy (Mode B: Validation Disabled)
            # ─────────────────────────────────────────────────────────────────
            oakridge, _ = School.objects.get_or_create(
                name="Oakridge Academy",
                defaults={
                    "config": {"curriculum": "CBSE", "board": "CBSE"},
                    "max_students": 800,
                    "max_teachers": 80,
                    "question_bank_enabled": True,
                    "validation_workflow_enabled": False,
                },
            )
            oakridge.validation_workflow_enabled = False
            oakridge.question_bank_enabled = True
            oakridge.save()

            # ─────────────────────────────────────────────────────────────────
            # 3. Create Users for Greenwood High
            # ─────────────────────────────────────────────────────────────────
            # DEO 1
            deo1, _ = User.objects.get_or_create(
                username="deo1",
                defaults={
                    "email": "deo1@greenwood.edu",
                    "first_name": "Deepa",
                    "last_name": "Patel",
                    "mobile_number": "+919876543210",
                    "school": greenwood,
                    "role": "deo",
                },
            )
            deo1.set_password("password123")
            deo1.school = greenwood
            deo1.save()
            grant_deo_defaults(deo1)

            # Validator 1
            validator1, _ = User.objects.get_or_create(
                username="validator1",
                defaults={
                    "email": "validator1@greenwood.edu",
                    "first_name": "Vikram",
                    "last_name": "Sengupta",
                    "mobile_number": "+919876543211",
                    "school": greenwood,
                    "role": "validator",
                },
            )
            validator1.set_password("password123")
            validator1.school = greenwood
            validator1.save()
            grant_validator_defaults(validator1)

            # Dual-Role User (DEO & Validator)
            dualuser1, _ = User.objects.get_or_create(
                username="dualuser1",
                defaults={
                    "email": "dualuser1@greenwood.edu",
                    "first_name": "Devika",
                    "last_name": "Rao",
                    "mobile_number": "+919876543212",
                    "school": greenwood,
                    "role": "deo_validator",
                },
            )
            dualuser1.set_password("password123")
            dualuser1.school = greenwood
            dualuser1.save()
            grant_deo_and_validator_defaults(dualuser1)

            # ─────────────────────────────────────────────────────────────────
            # 4. Create User for Oakridge Academy (Mode B)
            # ─────────────────────────────────────────────────────────────────
            teacher_direct, _ = User.objects.get_or_create(
                username="teacher_direct",
                defaults={
                    "email": "teacher_direct@oakridge.edu",
                    "first_name": "Ananya",
                    "last_name": "Sharma",
                    "mobile_number": "+919876543213",
                    "school": oakridge,
                    "primary_subject": "Physics",
                    "role": "teacher",
                },
            )
            teacher_direct.set_password("password123")
            teacher_direct.school = oakridge
            teacher_direct.save()
            grant_teacher_defaults(teacher_direct)

            # ─────────────────────────────────────────────────────────────────
            # 5. Seed Curriculum Hierarchy (Board, Book, Chapter, Topics)
            # ─────────────────────────────────────────────────────────────────
            book, _ = Book.objects.get_or_create(
                board="CBSE",
                subject="Science",
                grade="Class 10",
                defaults={"title": "NCERT Class 10 Science", "publisher": "NCERT"},
            )

            chapter, _ = Chapter.objects.get_or_create(
                book=book,
                title="Light - Reflection and Refraction",
                defaults={"chapter_order": 10},
            )

            topic1, _ = Topic.objects.get_or_create(
                chapter=chapter,
                name="Spherical Mirrors",
            )
            topic2, _ = Topic.objects.get_or_create(
                chapter=chapter,
                name="Refraction through Lenses",
            )
            topic3, _ = Topic.objects.get_or_create(
                chapter=chapter,
                name="Lens Formula and Magnification",
            )

            # ─────────────────────────────────────────────────────────────────
            # 6. Seed Mode A Demo Questions (Greenwood High)
            # ─────────────────────────────────────────────────────────────────
            # Q1: DRAFT state
            q_draft, _ = Question.objects.get_or_create(
                source_reference="TASK8_DEMO_DRAFT_01",
                defaults={
                    "topic": topic1,
                    "school": greenwood,
                    "created_by": deo1,
                    "question_text": "A concave mirror produces three times magnified real image of an object placed at 10 cm in front of it. Where is the image located?",
                    "question_type": QuestionType.SHORT_ANSWER,
                    "difficulty": "MEDIUM",
                    "marks": 2.0,
                    "validation_status": ValidationStatus.DRAFT,
                    "revision": 1,
                    "correct_answer": "-30 cm",
                    "explanation": "m = -v/u => -3 = -v/(-10) => v = -30 cm.",
                },
            )
            q_draft.topics.set([topic1, topic3])

            # Q2: SUBMITTED state (Awaiting Validator Review)
            q_sub, _ = Question.objects.get_or_create(
                source_reference="TASK8_DEMO_SUBMITTED_01",
                defaults={
                    "topic": topic2,
                    "school": greenwood,
                    "created_by": deo1,
                    "question_text": "Which of the following materials cannot be used to make a lens?",
                    "question_type": QuestionType.MCQ,
                    "difficulty": "EASY",
                    "marks": 1.0,
                    "options": {"A": "Water", "B": "Glass", "C": "Plastic", "D": "Clay"},
                    "correct_answer": "D",
                    "explanation": "Clay is opaque and light cannot pass through it.",
                    "validation_status": ValidationStatus.SUBMITTED,
                    "revision": 1,
                },
            )
            q_sub.topics.set([topic2])
            QuestionValidationHistory.objects.get_or_create(
                question=q_sub,
                action=ValidationAction.SUBMIT,
                defaults={"actor": deo1, "revision": 1, "comment": "Submitted for review."},
            )

            # Q3: CORRECTION_REQUIRED state (Returned by Validator)
            q_corr, _ = Question.objects.get_or_create(
                source_reference="TASK8_DEMO_CORRECTION_01",
                defaults={
                    "topic": topic1,
                    "school": greenwood,
                    "created_by": deo1,
                    "question_text": "State the laws of reflection of light and draw a labelled diagram illustrating reflection from a plane mirror.",
                    "question_type": QuestionType.SHORT_ANSWER,
                    "difficulty": "MEDIUM",
                    "marks": 2.0,
                    "validation_status": ValidationStatus.CORRECTION_REQUIRED,
                    "revision": 1,
                    "correct_answer": "1. Incident ray, reflected ray, normal lie in same plane. 2. Angle i = Angle r.",
                    "explanation": "Standard geometrical optics law definition.",
                },
            )
            q_corr.topics.set([topic1])
            QuestionValidationHistory.objects.get_or_create(
                question=q_corr,
                action=ValidationAction.SEND_FOR_CORRECTION,
                defaults={
                    "actor": validator1,
                    "revision": 1,
                    "comment": "Please explicitly mention that the normal is at the point of incidence, and add diagram guidance.",
                },
            )

            # Q4: APPROVED state (Eligible for Exam Generation)
            q_app, _ = Question.objects.get_or_create(
                source_reference="TASK8_DEMO_APPROVED_01",
                defaults={
                    "topic": topic3,
                    "school": greenwood,
                    "created_by": deo1,
                    "question_text": "Find the focal length of a lens of power -2.0 D. What type of lens is this?",
                    "question_type": QuestionType.SHORT_ANSWER,
                    "difficulty": "MEDIUM",
                    "marks": 2.0,
                    "validation_status": ValidationStatus.APPROVED,
                    "revision": 2,
                    "correct_answer": "f = -0.5 m (-50 cm), Concave (diverging) lens.",
                    "explanation": "P = 1/f => f = 1/(-2.0) = -0.5 m. Negative sign indicates concave lens.",
                },
            )
            q_app.topics.set([topic2, topic3])
            # Add variant to approved question
            QuestionVariant.objects.get_or_create(
                parent_question=q_app,
                variant_type=QuestionType.MCQ,
                defaults={
                    "difficulty": "MEDIUM",
                    "marks": 1.0,
                    "question_text": "A lens has power -2.0 D. The focal length and nature of the lens are:",
                    "options": {
                        "A": "-0.5 m, convex",
                        "B": "-0.5 m, concave",
                        "C": "+0.5 m, concave",
                        "D": "+2.0 m, convex",
                    },
                    "correct_answer": "B",
                    "explanation": "f = 1/P = -0.5 m. Negative focal length indicates concave lens.",
                },
            )
            QuestionValidationHistory.objects.get_or_create(
                question=q_app,
                action=ValidationAction.APPROVE,
                defaults={
                    "actor": validator1,
                    "revision": 2,
                    "comment": "Approved into Greenwood High Question Bank after revision check.",
                },
            )

            # Q5: REJECTED state
            q_rej, _ = Question.objects.get_or_create(
                source_reference="TASK8_DEMO_REJECTED_01",
                defaults={
                    "topic": topic2,
                    "school": greenwood,
                    "created_by": deo1,
                    "question_text": "Light travels fast in glass.",
                    "question_type": QuestionType.ONE_WORD,
                    "difficulty": "EASY",
                    "marks": 1.0,
                    "validation_status": ValidationStatus.REJECTED,
                    "revision": 1,
                    "correct_answer": "False",
                },
            )
            q_rej.topics.set([topic2])
            QuestionValidationHistory.objects.get_or_create(
                question=q_rej,
                action=ValidationAction.REJECT,
                defaults={
                    "actor": validator1,
                    "revision": 1,
                    "comment": "Incomplete and ambiguous phrasing. Does not meet institutional curriculum assessment standards.",
                },
            )

            # ─────────────────────────────────────────────────────────────────
            # 7. Seed Mode B Demo Questions (Oakridge Academy)
            # ─────────────────────────────────────────────────────────────────
            q_mode_b, _ = Question.objects.get_or_create(
                source_reference="TASK8_DEMO_MODE_B_01",
                defaults={
                    "topic": topic1,
                    "school": oakridge,
                    "created_by": teacher_direct,
                    "question_text": "Define the principal focus of a concave mirror.",
                    "question_type": QuestionType.SHORT_ANSWER,
                    "difficulty": "EASY",
                    "marks": 1.0,
                    "validation_status": ValidationStatus.APPROVED,
                    "correct_answer": "The point on principal axis where rays parallel to axis converge after reflection.",
                },
            )
            q_mode_b.topics.set([topic1])

        self.stdout.write(self.style.SUCCESS("[OK] Successfully seeded Task 8 demo users and validation workflow questions!"))
        self.stdout.write(
            self.style.SUCCESS(
                "\nCredentials summary:\n"
                "  Mode A (Validation Enabled - Greenwood High):\n"
                "    • deo1 / password123 (Data Entry Operator)\n"
                "    • validator1 / password123 (Validator)\n"
                "    • dualuser1 / password123 (DEO & Validator Dual Role)\n"
                "  Mode B (Validation Disabled - Oakridge Academy):\n"
                "    • teacher_direct / password123 (Direct paper generation)\n"
            )
        )
