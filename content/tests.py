from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from content.models import (
    BankSource,
    Book,
    Chapter,
    Difficulty,
    LearnerLevel,
    Question,
    QuestionType,
    QuestionVariant,
    Topic,
)
from schools.models import School
from users.capability_defaults import (
    grant_qbm_defaults,
    grant_school_admin_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
)
from users.models import CapabilityName

User = get_user_model()


class QuestionBankTests(APITestCase):
    def setUp(self):
        # Create Super Admin
        self.super_admin = User.objects.create_user(
            username="superadmin",
            password="Password@123",
            role="Super Admin",
        )
        grant_super_admin_defaults(self.super_admin)

        # Create QBM
        self.qbm = User.objects.create_user(
            username="qbm_user",
            password="Password@123",
            role="Question Bank Manager",
        )
        grant_qbm_defaults(self.qbm)

        # Create Schools
        self.school_a = School.objects.create(
            name="Delhi Public School",
            question_bank_enabled=True,
        )
        self.school_b = School.objects.create(
            name="St Xavier High School",
            question_bank_enabled=False,  # QB disabled!
        )

        # Create Teachers
        self.teacher_a = User.objects.create_user(
            username="teacher_a",
            password="Password@123",
            role="Teacher",
            school=self.school_a,
        )
        grant_teacher_defaults(self.teacher_a)

        self.teacher_b = User.objects.create_user(
            username="teacher_b",
            password="Password@123",
            role="Teacher",
            school=self.school_b,
        )
        grant_teacher_defaults(self.teacher_b)

        # Create Book Hierarchy
        self.book = Book.objects.create(
            title="Mathematics Grade 10",
            board="CBSE",
            subject="Mathematics",
            grade="Class 10",
        )
        self.chapter = Chapter.objects.create(
            book=self.book,
            title="Quadratic Equations",
            chapter_order=1,
        )
        self.topic = Topic.objects.create(
            chapter=self.chapter,
            name="Roots of Quadratic Equation",
        )

    def test_qbm_can_ingest_global_question_with_variants(self):
        """AC-10, AC-16: QBM can ingest a GLOBAL question with multiple variants."""
        self.client.force_authenticate(user=self.qbm)
        payload = {
            "topic": self.topic.id,
            "question_text": "Find the roots of x^2 - 5x + 6 = 0.",
            "question_type": QuestionType.MCQ,
            "marks": "1.00",
            "difficulty": Difficulty.MEDIUM,
            "learner_level": LearnerLevel.INTERMEDIATE,
            "options": {"A": "2, 3", "B": "1, 6", "C": "-2, -3", "D": "0, 5"},
            "correct_answer": "A",
            "explanation": "Factoring gives (x-2)(x-3)=0, hence x=2,3.",
            "variants": [
                {
                    "variant_type": QuestionType.SHORT_ANSWER,
                    "marks": "2.00",
                    "question_text": "Solve x^2 - 5x + 6 = 0 using the quadratic formula.",
                    "correct_answer": "x = (5 ± √(25 - 24))/2 = 2, 3",
                    "explanation": "Apply x = (-b ± √(b^2 - 4ac)) / (2a)",
                },
                {
                    "variant_type": QuestionType.LONG_ANSWER,
                    "marks": "5.00",
                    "question_text": "Derive the solutions of x^2 - 5x + 6 = 0 graphically and algebraically.",
                    "correct_answer": "Roots at x=2, x=3.",
                    "explanation": "Parabola intersects x-axis at 2 and 3.",
                },
            ],
        }

        response = self.client.post("/api/questions/ingest/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["bank_source"], "GLOBAL")
        self.assertIsNone(response.data["school"])
        self.assertEqual(len(response.data["variants"]), 2)

        # Verify DB records
        q = Question.objects.get(id=response.data["id"])
        self.assertEqual(q.bank_source, BankSource.GLOBAL)
        self.assertEqual(q.variants.count(), 2)

        v1 = q.variants.first()
        # AC-15: Variant difficulty must match parent question difficulty
        self.assertEqual(v1.difficulty, q.difficulty)

    def test_variant_difficulty_strictly_enforced_ac15(self):
        """AC-15: Variant difficulty cannot differ from parent difficulty."""
        parent_q = Question.objects.create(
            topic=self.topic,
            question_text="Parent question",
            question_type=QuestionType.SHORT_ANSWER,
            marks=Decimal("2.00"),
            difficulty=Difficulty.HARD,
            learner_level=LearnerLevel.ADVANCED,
            correct_answer="Answer",
            bank_source=BankSource.GLOBAL,
        )

        # Attempt to save a variant with a mismatched difficulty should raise ValidationError
        variant = QuestionVariant(
            parent_question=parent_q,
            variant_type=QuestionType.MCQ,
            marks=Decimal("1.00"),
            difficulty=Difficulty.EASY,  # Does not match HARD
            question_text="Mismatched variant",
            correct_answer="A",
        )
        with self.assertRaises(ValidationError):
            variant.clean()

        with self.assertRaises(ValidationError):
            variant.save()

    def test_multi_tenant_privacy_isolation_ac13_ac14_ac20(self):
        """
        AC-13, AC-14, AC-20: Questions belonging to School A are NEVER visible to School B.
        Global questions are visible to all schools.
        """
        # 1. Global Question
        global_q = Question.objects.create(
            topic=self.topic,
            question_text="Global CBSE Question",
            question_type=QuestionType.MCQ,
            marks=Decimal("1.00"),
            difficulty=Difficulty.EASY,
            learner_level=LearnerLevel.BEGINNER,
            correct_answer="A",
            bank_source=BankSource.GLOBAL,
            school=None,
        )

        # 2. School A Private Question
        school_a_q = Question.objects.create(
            topic=self.topic,
            question_text="Secret School A Exam Question",
            question_type=QuestionType.LONG_ANSWER,
            marks=Decimal("5.00"),
            difficulty=Difficulty.HARD,
            learner_level=LearnerLevel.ADVANCED,
            correct_answer="Confidential Marking Scheme",
            bank_source=BankSource.ORGANIZATION,
            school=self.school_a,
            created_by=self.teacher_a,
        )

        # Teacher A queries /api/questions/ -> Should see BOTH global_q and school_a_q
        self.client.force_authenticate(user=self.teacher_a)
        res_a = self.client.get("/api/questions/")
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        ids_seen_by_a = [q["id"] for q in res_a.data]
        self.assertIn(global_q.id, ids_seen_by_a)
        self.assertIn(school_a_q.id, ids_seen_by_a)

        # Teacher B queries /api/questions/ -> Should see global_q, but NEVER school_a_q (AC-20)
        self.client.force_authenticate(user=self.teacher_b)
        res_b = self.client.get("/api/questions/")
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        ids_seen_by_b = [q["id"] for q in res_b.data]
        self.assertIn(global_q.id, ids_seen_by_b)
        self.assertNotIn(school_a_q.id, ids_seen_by_b)  # STRICT PRIVACY ISOLATION

        # Direct detail lookup by Teacher B for School A's question must return 404
        detail_res = self.client.get(f"/api/questions/{school_a_q.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_404_NOT_FOUND)

    def test_teacher_question_bank_enabled_gating_ac11_ac12(self):
        """AC-11, AC-12: Teacher can only ingest if school.question_bank_enabled is True."""
        # School A has question_bank_enabled = True -> Allowed
        self.client.force_authenticate(user=self.teacher_a)
        payload = {
            "topic": self.topic.id,
            "question_text": "Teacher A custom question",
            "question_type": QuestionType.SHORT_ANSWER,
            "marks": "2.00",
            "difficulty": Difficulty.EASY,
            "correct_answer": "Ans",
        }
        res_a = self.client.post("/api/questions/ingest/", payload, format="json")
        self.assertEqual(res_a.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_a.data["bank_source"], "ORGANIZATION")
        self.assertEqual(res_a.data["school"], self.school_a.id)

        # School B has question_bank_enabled = False -> Gated with 403
        self.client.force_authenticate(user=self.teacher_b)
        res_b = self.client.post("/api/questions/ingest/", payload, format="json")
        self.assertEqual(res_b.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Question bank is disabled", res_b.data["detail"])

    def test_qbm_ingest_with_custom_board_and_curriculum(self):
        """Verify QBM can ingest questions with a custom/state board and on-the-fly curriculum resolution."""
        self.client.force_authenticate(user=self.qbm)
        payload = {
            "board": "State Board - Maharashtra",
            "subject": "Mathematics",
            "grade": "Class 10",
            "chapter_title": "Similarity of Triangles",
            "topic_name": "Basic Proportionality Theorem",
            "question_text": "State and prove Basic Proportionality Theorem.",
            "question_type": QuestionType.LONG_ANSWER,
            "marks": "5.00",
            "difficulty": Difficulty.MEDIUM,
            "correct_answer": "Proof: In a triangle, a line drawn parallel...",
        }
        res = self.client.post("/api/questions/ingest/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["bank_source"], BankSource.GLOBAL)
        self.assertEqual(res.data["topic_name"], "Basic Proportionality Theorem")
        self.assertEqual(res.data["chapter_title"], "Similarity of Triangles")
        self.assertEqual(res.data["book_board"], "State Board - Maharashtra")

        # Check that Book, Chapter, and Topic were created in the database
        created_book = Book.objects.get(board="State Board - Maharashtra", subject="Mathematics", grade="Class 10")
        created_chapter = Chapter.objects.get(book=created_book, title="Similarity of Triangles")
        created_topic = Topic.objects.get(chapter=created_chapter, name="Basic Proportionality Theorem")
        self.assertEqual(res.data["topic"], created_topic.id)

