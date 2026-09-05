"""
Unit tests for the generation app: interfaces, SeededBankGenerationService, and factory.
"""

from decimal import Decimal
from django.test import TestCase, override_settings

from content.models import Book, Chapter, Question, Topic
from generation.factory import get_generation_service, register_generation_service
from generation.interfaces import QuestionDraft, QuestionGenerationService
from generation.services.seeded_bank import SeededBankGenerationService


class QuestionDraftTests(TestCase):
    """Test QuestionDraft dataclass functionality."""

    def test_draft_instantiation_and_to_dict(self):
        draft = QuestionDraft(
            question_text="What is 2 + 2?",
            question_type="MCQ",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            correct_answer="4",
            options={"A": "3", "B": "4"},
            source_reference="Page 10",
            topic_id=1,
            topic_name="Basic Arithmetic",
        )

        self.assertEqual(draft.question_text, "What is 2 + 2?")
        self.assertEqual(draft.question_type, "MCQ")
        self.assertEqual(draft.difficulty, "EASY")
        self.assertTrue(draft.is_active)

        data = draft.to_dict()
        self.assertIsInstance(data["marks"], float)
        self.assertEqual(data["marks"], 2.0)
        self.assertEqual(data["correct_answer"], "4")
        self.assertEqual(data["options"], {"A": "3", "B": "4"})

    def test_draft_from_question_model(self):
        book = Book.objects.create(title="Math Grade 10", subject="Mathematics", grade="10")
        chapter = Chapter.objects.create(book=book, title="Algebra", chapter_order=1)
        topic = Topic.objects.create(chapter=chapter, name="Quadratic Equations")
        q = Question.objects.create(
            topic=topic,
            question_text="Solve x^2 - 4 = 0",
            question_type="SHORT_ANSWER",
            marks=Decimal("3.00"),
            difficulty="MEDIUM",
            learner_level="INTERMEDIATE",
            correct_answer="x = ±2",
            source_reference="Exercise 4.1",
        )

        draft = QuestionDraft.from_question(q)
        self.assertEqual(draft.question_text, "Solve x^2 - 4 = 0")
        self.assertEqual(draft.question_type, "SHORT_ANSWER")
        self.assertEqual(draft.marks, Decimal("3.00"))
        self.assertEqual(draft.topic_id, topic.id)
        self.assertEqual(draft.topic_name, "Quadratic Equations")
        self.assertEqual(draft.metadata.get("original_question_id"), q.id)


class SeededBankGenerationServiceTests(TestCase):
    """Test SeededBankGenerationService execution."""

    @classmethod
    def setUpTestData(cls):
        cls.book = Book.objects.create(title="Math Class 10", subject="Math", grade="10")
        cls.chapter = Chapter.objects.create(book=cls.book, title="Real Numbers", chapter_order=1)
        cls.topic1 = Topic.objects.create(chapter=cls.chapter, name="Euclid Division")
        cls.topic2 = Topic.objects.create(chapter=cls.chapter, name="Fundamental Theorem")

        cls.q1 = Question.objects.create(
            topic=cls.topic1,
            question_text="State Euclid's Division Lemma.",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            correct_answer="a = bq + r",
        )
        cls.q2 = Question.objects.create(
            topic=cls.topic1,
            question_text="Which of the following is an irrational number?",
            question_type="MCQ",
            marks=Decimal("1.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            options={"A": "2", "B": "sqrt(3)", "C": "4", "D": "0.5"},
            correct_answer="B",
        )
        cls.q3 = Question.objects.create(
            topic=cls.topic2,
            question_text="Find the HCF of 96 and 404.",
            question_type="SHORT_ANSWER",
            marks=Decimal("3.00"),
            difficulty="MEDIUM",
            learner_level="INTERMEDIATE",
            correct_answer="4",
        )

    def setUp(self):
        self.service = SeededBankGenerationService()

    def test_generate_all_for_chapter(self):
        drafts = self.service.generate_questions(self.chapter, {})
        self.assertEqual(len(drafts), 3)
        self.assertTrue(all(isinstance(d, QuestionDraft) for d in drafts))

    def test_generate_by_chapter_id_integer(self):
        drafts = self.service.generate_questions(self.chapter.id, {})
        self.assertEqual(len(drafts), 3)

    def test_generate_with_difficulty_and_type_constraints(self):
        drafts = self.service.generate_questions(
            self.chapter,
            {"difficulty": "EASY", "question_type": "MCQ"},
        )
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0].question_text, self.q2.question_text)
        self.assertEqual(drafts[0].question_type, "MCQ")

    def test_generate_with_topic_constraint(self):
        drafts = self.service.generate_questions(
            self.chapter,
            {"topic_id": self.topic2.id},
        )
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0].question_text, self.q3.question_text)

    def test_generate_with_quantity_constraint(self):
        drafts = self.service.generate_questions(
            self.chapter,
            {"quantity": 2},
        )
        self.assertEqual(len(drafts), 2)

    def test_invalid_chapter_raises_value_error(self):
        with self.assertRaises(ValueError):
            self.service.generate_questions(None, {})


class GenerationFactoryTests(TestCase):
    """Test get_generation_service factory and resolver."""

    def test_default_factory_returns_seeded_bank(self):
        service = get_generation_service()
        self.assertIsInstance(service, SeededBankGenerationService)

    @override_settings(GENERATION_SERVICE_BACKEND="seeded_bank")
    def test_factory_with_explicit_setting(self):
        service = get_generation_service()
        self.assertIsInstance(service, SeededBankGenerationService)

    def test_factory_with_unknown_backend_raises_value_error(self):
        with self.assertRaises(ValueError):
            get_generation_service("non_existent_engine")

    def test_custom_backend_registration(self):
        class MockLLMService(QuestionGenerationService):
            def generate_questions(self, chapter, constraints):
                return [
                    QuestionDraft(
                        question_text="AI Generated Question",
                        question_type="SHORT_ANSWER",
                        marks=Decimal("2.0"),
                        difficulty="MEDIUM",
                        learner_level="INTERMEDIATE",
                        correct_answer="AI Answer",
                    )
                ]

        register_generation_service("mock_llm", MockLLMService)
        service = get_generation_service("mock_llm")
        self.assertIsInstance(service, MockLLMService)
        drafts = service.generate_questions(1, {})
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0].question_text, "AI Generated Question")
