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


class DocumentChunkerTests(TestCase):
    """Tests for intelligent document chunking with LaTeX protection."""

    def setUp(self):
        from content_ingestion.chunker import DocumentChunker
        self.chunker = DocumentChunker(default_chunk_size=300, default_overlap=60, min_chunk_size=50)

    def test_short_text_single_chunk(self):
        text = "This is a brief textbook section about Newton's Laws."
        chunks = self.chunker.chunk_text(text)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0].text, text)
        self.assertEqual(chunks[0].total_chunks, 1)

    def test_sliding_window_overlap(self):
        long_text = (
            "Section 1: Thermodynamics.\n\n"
            "The first law of thermodynamics is an adaptation of the law of conservation of energy. "
            "It states that the total energy of an isolated system is constant. "
            "Energy can be transformed from one form to another, but can neither be created nor destroyed. "
            "Heat and work are mutually convertible in thermodynamic processes.\n\n"
            "Section 2: Second Law.\n\n"
            "The second law establishes the concept of entropy as a physical property of a thermodynamic system. "
            "It dictates that heat does not spontaneously flow from a colder body to a hotter body without external work."
        )
        chunks = self.chunker.chunk_text(long_text, chunk_size=200, chunk_overlap=50)
        self.assertGreater(len(chunks), 1)
        # Check that subsequent chunks have overlap
        self.assertGreater(chunks[1].overlap_chars, 0)

    def test_latex_formula_not_severed(self):
        # Place a formula right across the boundary
        formula = "$$\\int_{a}^{b} f(x) dx = F(b) - F(a)$$"
        text = (
            "Here is the Fundamental Theorem of Calculus: "
            + formula
            + ". This connects derivatives with definite integrals in real analysis."
        )
        chunks = self.chunker.chunk_text(text, chunk_size=70, chunk_overlap=20, preserve_latex=True)
        # Verify formula is whole in at least one chunk and never cut in half
        found_whole_formula = False
        for c in chunks:
            if formula in c.text:
                found_whole_formula = True
            # Never contains severed opening or closing
            if "$$" in c.text:
                self.assertEqual(c.text.count("$$") % 2, 0)
        self.assertTrue(found_whole_formula)


class TokenBudgetManagerTests(TestCase):
    """Tests for TokenBudgetManager and priority context fitting."""

    def setUp(self):
        from generation.token_budget import TokenBudgetManager
        self.manager = TokenBudgetManager()

    def test_latex_token_estimation_density(self):
        prose = "The velocity of the particle increases steadily over time."
        math_heavy = "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\cdot \\int_0^\\infty e^{-x^2} dx$$"
        prose_tokens = self.manager.estimate_tokens(prose)
        math_tokens = self.manager.estimate_tokens(math_heavy)
        self.assertGreater(prose_tokens, 0)
        self.assertGreater(math_tokens, 0)
        # Math formula should have higher token density per character
        math_density = math_tokens / len(math_heavy)
        prose_density = prose_tokens / len(prose)
        self.assertGreater(math_density, prose_density)

    def test_calculate_budget_reserves_output(self):
        report = self.manager.calculate_budget(
            model_name="gemini-2.0-flash",
            system_prompt="Generate test questions in JSON format.",
            target_question_count=5,
        )
        self.assertGreater(report.reserved_output_tokens, 1000)
        self.assertGreater(report.context_budget_available, 5000)
        self.assertFalse(report.is_truncated)

    def test_fit_educational_items_preserves_high_priority(self):
        items = [
            {"item_type": "PARAGRAPH", "content": "Narrative intro filler text " * 50},
            {"item_type": "FORMULA", "content": "$$E = mc^2$$"},
            {"item_type": "DEFINITION", "content": "Work is defined as force multiplied by displacement."},
            {"item_type": "PARAGRAPH", "content": "More background historical context " * 50},
        ]
        # Restrict budget so not all items fit
        fitted, report = self.manager.fit_educational_items(items, available_budget=80)
        self.assertTrue(report.is_truncated)
        fitted_types = [item["item_type"] for item in fitted]
        # FORMULA and DEFINITION must be preserved over long paragraphs
        self.assertIn("FORMULA", fitted_types)
        self.assertIn("DEFINITION", fitted_types)


class DuplicateQuestionDetectorTests(TestCase):
    """Tests for DuplicateQuestionDetector similarity scoring and deduplication."""

    def setUp(self):
        from generation.duplicate_detector import DuplicateQuestionDetector
        self.detector = DuplicateQuestionDetector(default_threshold=0.80)

    def test_exact_normalized_match(self):
        q1 = "What is Newton's First Law of Motion?"
        q2 = "what is newton's first law of motion"
        match = self.detector.is_duplicate = self.detector.compare_questions(
            QuestionDraft(question_text=q1, question_type="SHORT_ANSWER", marks=2, difficulty="EASY", learner_level="BEGINNER", correct_answer="Law of inertia"),
            QuestionDraft(question_text=q2, question_type="SHORT_ANSWER", marks=2, difficulty="EASY", learner_level="BEGINNER", correct_answer="Law of inertia"),
        )
        self.assertTrue(match.is_duplicate)
        self.assertEqual(match.reason, "EXACT_NORMALIZED")
        self.assertEqual(match.similarity_score, 1.0)

    def test_paraphrased_similarity_detected(self):
        q1 = "Calculate the acceleration of a car having mass 1000 kg and force 5000 N."
        q2 = "Determine the acceleration of an automobile with mass 1000 kg and net force 5000 N."
        draft1 = QuestionDraft(question_text=q1, question_type="SHORT_ANSWER", marks=3, difficulty="MEDIUM", learner_level="INTERMEDIATE", correct_answer="5 m/s^2")
        draft2 = QuestionDraft(question_text=q2, question_type="SHORT_ANSWER", marks=3, difficulty="MEDIUM", learner_level="INTERMEDIATE", correct_answer="5 m/s^2")
        match = self.detector.compare_questions(draft1, draft2, threshold=0.75)
        self.assertTrue(match.is_duplicate)
        self.assertGreater(match.similarity_score, 0.75)

    def test_distinct_questions_not_flagged(self):
        q1 = "Explain the process of photosynthesis in green plants."
        q2 = "What are the stages of cellular respiration in human cells?"
        draft1 = QuestionDraft(question_text=q1, question_type="LONG_ANSWER", marks=5, difficulty="HARD", learner_level="ADVANCED", correct_answer="Chlorophyll...")
        draft2 = QuestionDraft(question_text=q2, question_type="LONG_ANSWER", marks=5, difficulty="HARD", learner_level="ADVANCED", correct_answer="Glycolysis...")
        match = self.detector.compare_questions(draft1, draft2)
        self.assertFalse(match.is_duplicate)
        self.assertLess(match.similarity_score, 0.50)

    def test_mcq_option_match_detection(self):
        draft1 = QuestionDraft(
            question_text="Which gas is released during photosynthesis?",
            question_type="MCQ",
            marks=1,
            difficulty="EASY",
            learner_level="BEGINNER",
            correct_answer="Oxygen",
            options={"A": "Nitrogen", "B": "Carbon Dioxide", "C": "Oxygen", "D": "Hydrogen"},
        )
        draft2 = QuestionDraft(
            question_text="Identify the gas liberated in photosynthetic reactions.",
            question_type="MCQ",
            marks=1,
            difficulty="EASY",
            learner_level="BEGINNER",
            correct_answer="Oxygen",
            options={"A": "Carbon Dioxide", "B": "Oxygen", "C": "Hydrogen", "D": "Nitrogen"},
        )
        match = self.detector.compare_questions(draft1, draft2)
        self.assertTrue(match.is_duplicate)
        self.assertEqual(match.reason, "MCQ_OPTION_MATCH")

    def test_batch_deduplication_filters_redundant(self):
        batch = [
            QuestionDraft(question_text="What is Ohm's law?", question_type="SHORT_ANSWER", marks=2, difficulty="EASY", learner_level="BEGINNER", correct_answer="V = IR"),
            QuestionDraft(question_text="State Ohm's law formula.", question_type="SHORT_ANSWER", marks=2, difficulty="EASY", learner_level="BEGINNER", correct_answer="V = IR"),
            QuestionDraft(question_text="Define electric current.", question_type="SHORT_ANSWER", marks=2, difficulty="EASY", learner_level="BEGINNER", correct_answer="I = Q/t"),
        ]
        unique, dups = self.detector.filter_batch_duplicates(batch, threshold=0.75)
        self.assertEqual(len(unique), 2)
        self.assertEqual(len(dups), 1)


class LLMQuestionGenerationServiceTests(TestCase):
    """Tests for LLMQuestionGenerationService with provider routing and fallback."""

    @classmethod
    def setUpTestData(cls):
        cls.book = Book.objects.create(title="Physics 12", subject="Physics", grade="12")
        cls.chapter = Chapter.objects.create(book=cls.book, title="Current Electricity", chapter_order=1)
        cls.topic = Topic.objects.create(chapter=cls.chapter, name="Resistance")
        cls.q1 = Question.objects.create(
            topic=cls.topic,
            question_text="What is electrical resistance?",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            correct_answer="Opposition to current",
        )

    def test_factory_resolves_llm_service(self):
        service = get_generation_service("llm")
        from generation.services.llm_generation import LLMQuestionGenerationService
        self.assertIsInstance(service, LLMQuestionGenerationService)

    def test_service_falls_back_when_no_api_key(self):
        from generation.services.llm_generation import LLMQuestionGenerationService
        service = LLMQuestionGenerationService(api_key="")
        drafts = service.generate_questions(self.chapter, {"quantity": 1})
        self.assertEqual(len(drafts), 1)
        # Should gracefully return question from SeededBankGenerationService
        self.assertEqual(drafts[0].question_text, "What is electrical resistance?")
        self.assertEqual(drafts[0].metadata.get("source"), "seeded_bank")

    def test_response_parsing_valid_json(self):
        from generation.services.llm_generation import LLMQuestionGenerationService
        service = LLMQuestionGenerationService(api_key="mock_key")
        mock_json = """
        [
          {
            "question_text": "What is the SI unit of electric potential?",
            "question_type": "MCQ",
            "marks": 1.0,
            "difficulty": "EASY",
            "learner_level": "BEGINNER",
            "correct_answer": "Volt",
            "options": {"A": "Ampere", "B": "Volt", "C": "Ohm", "D": "Watt"},
            "source_reference": "NCERT Page 42"
          }
        ]
        """
        drafts = service._parse_llm_response(mock_json, self.chapter.id, {})
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0].question_text, "What is the SI unit of electric potential?")
        self.assertEqual(drafts[0].question_type, "MCQ")
        self.assertEqual(drafts[0].marks, Decimal("1.0"))
        self.assertEqual(drafts[0].options["B"], "Volt")
        self.assertEqual(drafts[0].metadata["source"], "llm_pipeline")

    def test_robust_latex_json_repair_colliding_escapes(self):
        from generation.services.llm_generation import LLMQuestionGenerationService
        # Raw JSON from LLM containing single backslashes for commands that collide with JSON escapes:
        # \text (\t), \frac (\f), \rightarrow (\r), \beta (\b), \neq (\n)
        raw_json = (
            r'[{"question_text": "Calculate $\frac{a}{b}$ where $\text{Output} = 5$ '
            r'and $\rightarrow$ denotes transition with $\beta = 1$ and $\neq 0$.", '
            r'"question_type": "SHORT_ANSWER", "marks": 2.0}]'
        )
        data = LLMQuestionGenerationService._robust_latex_json_repair(raw_json)
        self.assertIsNotNone(data)
        self.assertEqual(len(data), 1)
        q = data[0]["question_text"]
        # Verify backslashes are preserved intact and not converted to control characters
        self.assertIn(r"\text", q)
        self.assertIn(r"\frac", q)
        self.assertIn(r"\rightarrow", q)
        self.assertIn(r"\beta", q)
        self.assertIn(r"\neq", q)
        self.assertNotIn("\x09", q)  # No tab character
        self.assertNotIn("\x0c", q)  # No form feed
        self.assertNotIn("\x0d", q)  # No carriage return
        self.assertNotIn("\x08", q)  # No backspace

    def test_robust_latex_json_repair_trailing_commas_and_truncated(self):
        from generation.services.llm_generation import LLMQuestionGenerationService
        # Trailing comma
        comma_json = r'[{"question_text": "Solve $\alpha + \beta = 0$", "marks": 2.0,},]'
        data = LLMQuestionGenerationService._robust_latex_json_repair(comma_json)
        self.assertIsNotNone(data)
        self.assertEqual(len(data), 1)

        # Truncated JSON array
        trunc_json = (
            r'[{"question_text": "Question 1", "marks": 1.0}, '
            r'{"question_text": "Question 2", "marks": 2.0}, '
            r'{"question_text": "Question 3", "marks": '
        )
        data_trunc = LLMQuestionGenerationService._robust_latex_json_repair(trunc_json)
        self.assertIsNotNone(data_trunc)
        self.assertEqual(len(data_trunc), 2)

    def test_clean_latex_string_matrix_row_breaks(self):
        from generation.services.llm_generation import LLMQuestionGenerationService
        # In a pmatrix, a single \ between cells should be healed to \\
        matrix_input = r"$\begin{pmatrix} 1 & 2 \ 3 & 4 \end{pmatrix}$"
        healed = LLMQuestionGenerationService._clean_latex_string(matrix_input)
        self.assertIn(r"\\", healed)

    def test_sliding_context_window_offset(self):
        from generation.token_budget import TokenBudgetManager
        manager = TokenBudgetManager()
        # Large body of text with distinct sections
        part1 = "Part One: Foundational principles and definitions of motion. " * 30
        part2 = "Part Two: Dynamics of circular motion and centripetal force. " * 30
        part3 = "Part Three: Planetary gravitation and Kepler's laws. " * 30
        full_text = f"{part1}\n\n{part2}\n\n{part3}"

        slice_start, is_trunc_start = manager.fit_context_text(full_text, max_tokens=100, offset_ratio=0.0)
        self.assertTrue(is_trunc_start)
        self.assertIn("Part One", slice_start)
        self.assertNotIn("Part Three", slice_start)

        slice_end, is_trunc_end = manager.fit_context_text(full_text, max_tokens=100, offset_ratio=0.95)
        self.assertTrue(is_trunc_end)
        self.assertIn("Part Three", slice_end)
        self.assertIn("[... Context excerpt begins at mid-chapter section ...]", slice_end)

    def test_inter_batch_prompt_diversity_injection(self):
        from generation.services.llm_generation import LLMQuestionGenerationService
        service = LLMQuestionGenerationService(api_key="dummy_key")
        prev_qs = [
            "[1m MCQ]: What is the SI unit of electric charge?",
            "[2m SHORT_ANSWER]: State Coulomb's law and write its mathematical equation.",
        ]
        prompt = service._build_user_prompt(
            chapter_name="Electrostatics",
            constraints={"question_type": "MCQ", "marks": 1.0},
            context_text="Electric charges and fields overview...",
            quantity=5,
            previously_generated=prev_qs,
        )
        self.assertIn("PREVIOUSLY GENERATED QUESTIONS IN THIS EXAMINATION", prompt)
        self.assertIn("What is the SI unit of electric charge?", prompt)
        self.assertIn("State Coulomb's law", prompt)
        self.assertIn("CRITICAL INTER-BATCH DIVERSITY & NON-REPETITION MANDATE", prompt)
        self.assertIn("STRICT NO-REPETITION", prompt)

    def test_inter_batch_realtime_deduplication(self):
        from unittest.mock import patch
        from generation.services.llm_generation import LLMQuestionGenerationService
        service = LLMQuestionGenerationService(api_key="dummy_key")

        # Mock LLM provider to return identical question for batch 1 and batch 2
        batch1_resp = '[{"question_text": "What is electric flux?", "question_type": "SHORT_ANSWER", "marks": 2.0}]'
        batch2_resp = '[{"question_text": "Define electric flux in a closed surface.", "question_type": "SHORT_ANSWER", "marks": 2.0}]'

        with patch.object(service, "_call_llm_provider", side_effect=[batch1_resp, batch2_resp]):
            # Two batches of 1 question each
            constraints = {
                "quantity": 2,
                "mark_distribution": [
                    {"marks": 2.0, "count": 1, "question_types": ["SHORT_ANSWER"]},
                    {"marks": 2.0, "count": 1, "question_types": ["SHORT_ANSWER"]},
                ],
                "source_text": "Electric flux is the measure of the electric field through a given surface.",
            }
            drafts = service.generate_questions(self.chapter, constraints)
            # Second batch draft should be caught by inter-batch deduplication, leaving 1 accepted from LLM
            # and backfilled to guarantee target quantity of 2
            self.assertEqual(len(drafts), 2)
            # Confirm batch 1 question exists
            self.assertTrue(any("electric flux" in d.question_text.lower() for d in drafts))

