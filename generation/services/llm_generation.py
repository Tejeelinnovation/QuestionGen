"""
LLM Question Generation Service with Multi-Provider Fallback and Duplicate Guard.

Fulfills QuestionGenerationService using live LLM generation:
- Primary Provider: Google Gemini Vision / Flash API (or configured LLM).
- Secondary / Offline Fallback: Gracefully falls back to SeededBankGenerationService
  if external API is offline, unconfigured, or rate-limited (HTTP 429).
- Context Window Safety: TokenBudgetManager ensures input context never causes output truncation.
- Deduplication Guard: DuplicateQuestionDetector prevents redundant questions.
"""

from __future__ import annotations

import json
import logging
import os
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional

import requests
from django.conf import settings

from content.models import Chapter
from generation.duplicate_detector import DuplicateQuestionDetector
from generation.interfaces import QuestionDraft, QuestionGenerationService
from generation.services.seeded_bank import SeededBankGenerationService
from generation.token_budget import TokenBudgetManager

logger = logging.getLogger(__name__)


SYSTEM_GENERATION_PROMPT = """
You are an expert curriculum assessment creator and psychometric question author for school examinations.
Generate high-quality academic questions strictly aligned to the provided chapter content and constraints.

OUTPUT REQUIREMENTS:
- Output MUST be valid, parseable JSON as an array of question objects (NO markdown code fences, NO preamble).
- For MCQ: 'options' must be a JSON dictionary with keys "A", "B", "C", "D". 'correct_answer' must be the key (e.g. "B") or exact answer text.
- For SHORT_ANSWER / LONG_ANSWER: 'options' must be null. 'correct_answer' must be the ideal model solution or key points.
- Formulas and math expressions MUST use LaTeX notation (e.g. $x^2 + 5x + 6 = 0$, \\frac{a}{b}, \\int_0^1 f(x)dx).
- Chemical equations MUST use standard notation or LaTeX (e.g. $\\ce{2H2 + O2 -> 2H2O}$).
- Tables (Financial / Statistical) should be formatted in clean Markdown table format within 'question_text'.
- When ATTACHED FIGURES are provided, you MUST construct diagram-based question(s) referencing the figure and include the 'diagram' field pointing to that figure.

JSON SCHEMA:
[
  {
    "question_text": "Clear, rigorous question stem",
    "question_type": "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER" | "DIAGRAM_BASED",
    "marks": 1.0,
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "learner_level": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
    "correct_answer": "Model solution or correct option letter",
    "options": {"A": "Option 1", "B": "Option 2", "C": "Option 3", "D": "Option 4"} or null,
    "source_reference": "Specific section, theorem, or page reference if available",
    "diagram": {
      "figure_id": "fig_id_here",
      "title": "Figure caption or title",
      "image_url": "URL if provided"
    } or null
  }
]
"""


class LLMQuestionGenerationService(QuestionGenerationService):
    """
    AI-powered question generator with multi-provider resilience and deduplication.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        fallback_service: Optional[QuestionGenerationService] = None,
    ):
        self.api_key = (
            api_key
            or getattr(settings, "GEMINI_API_KEY", "")
            or os.getenv("GEMINI_API_KEY", "")
        )
        self.model_name = (
            model_name
            or getattr(settings, "GEMINI_MODEL_NAME", "gemini-flash-latest")
            or "gemini-flash-latest"
        )
        self.fallback_service = fallback_service or SeededBankGenerationService()
        self.budget_manager = TokenBudgetManager()
        self.duplicate_detector = DuplicateQuestionDetector()

    def generate_questions(
        self,
        chapter: Any,
        constraints: Dict[str, Any],
    ) -> List[QuestionDraft]:
        """
        Generate candidate questions using LLM with context budgeting, deduplication,
        and fallback to SeededBankGenerationService.
        """
        # Resolve chapter instance and ID
        chapter_instance, chapter_id = self._resolve_chapter(chapter)

        # 1. Check if LLM API is available. If no API key configured, route to appropriate fallback.
        if not self.api_key:
            if constraints.get("source_text"):
                logger.info("No LLM API key configured. Using heuristic generator for extracted source text.")
                return self._generate_from_source_text_fallback(chapter_instance, constraints)
            logger.info("No LLM API key configured. Routing request to SeededBankGenerationService fallback.")
            return self.fallback_service.generate_questions(chapter, constraints)

        # 2. Gather context material for the chapter
        target_quantity = int(constraints.get("quantity") or 5)
        context_text = self._assemble_chapter_context(chapter_instance, chapter_id, constraints)

        # 3. Calculate Token Budget
        budget_report = self.budget_manager.calculate_budget(
            model_name=self.model_name,
            system_prompt=SYSTEM_GENERATION_PROMPT,
            target_question_count=target_quantity,
        )

        # Safely fit context within available token budget
        fitted_context, was_truncated = self.budget_manager.fit_context_text(
            raw_text=context_text,
            max_tokens=budget_report.context_budget_available,
            model_name=self.model_name,
        )

        # 4. Formulate Prompt
        user_prompt = self._build_user_prompt(
            chapter_name=getattr(chapter_instance, "title", f"Chapter {chapter_id}"),
            constraints=constraints,
            context_text=fitted_context,
            quantity=target_quantity,
        )

        # 5. Execute LLM Call with Provider Routing & Fallback
        raw_response = self._call_llm_provider(user_prompt)
        if not raw_response:
            logger.warning(
                f"LLM generation failed for Chapter {chapter_id}. Engaging fallback."
            )
            if constraints.get("source_text"):
                return self._generate_from_source_text_fallback(chapter_instance, constraints)
            return self.fallback_service.generate_questions(chapter, constraints)

        # 6. Parse and Validate Questions
        parsed_drafts = self._parse_llm_response(raw_response, chapter_id, constraints)
        if not parsed_drafts:
            logger.warning(
                f"LLM generated unparseable response for Chapter {chapter_id}. Engaging fallback."
            )
            if constraints.get("source_text"):
                return self._generate_from_source_text_fallback(chapter_instance, constraints)
            return self.fallback_service.generate_questions(chapter, constraints)

        # 7. Deduplication Guard: Remove internal batch duplicates
        unique_drafts, batch_dups = self.duplicate_detector.filter_batch_duplicates(parsed_drafts)
        if batch_dups:
            logger.info(
                f"Deduplication Guard filtered {len(batch_dups)} duplicate questions from LLM batch."
            )

        # 8. Check against existing questions in bank to prevent repeating already-saved questions
        final_drafts: List[QuestionDraft] = []
        try:
            from content.models import Question
            existing_qs = Question.objects.filter(
                topic__chapter_id=chapter_id,
                is_active=True,
            ).only("question_text", "question_type", "options")[:100]

            for draft in unique_drafts:
                dup_match = self.duplicate_detector.check_against_existing(draft, existing_qs)
                if dup_match and dup_match.is_duplicate and dup_match.similarity_score >= 0.90:
                    logger.debug(f"Question matched existing bank question: {dup_match.matched_text[:60]}")
                    continue
                final_drafts.append(draft)
        except Exception as e:
            logger.debug(f"Skipping existing question DB collision check: {e}")
            final_drafts = unique_drafts

        # If deduplication left fewer items than desired, backfill from fallback bank or source text
        if len(final_drafts) < target_quantity:
            needed = target_quantity - len(final_drafts)
            logger.info(f"Backfilling {needed} questions.")
            fallback_constraints = dict(constraints)
            fallback_constraints["quantity"] = needed
            if constraints.get("source_text"):
                fallback_drafts = self._generate_from_source_text_fallback(chapter_instance, fallback_constraints)
            else:
                fallback_drafts = self.fallback_service.generate_questions(chapter, fallback_constraints)
            final_drafts.extend(fallback_drafts)

        return final_drafts[:target_quantity]

    def _resolve_chapter(self, chapter: Any) -> Tuple[Optional[Chapter], int]:
        """Extract Chapter model and integer ID safely."""
        if chapter is None:
            return None, 0
        if isinstance(chapter, Chapter):
            return chapter, chapter.id
        if isinstance(chapter, int):
            try:
                ch = Chapter.objects.filter(id=chapter).first()
                return ch, chapter
            except Exception:
                return None, chapter
        if isinstance(chapter, str) and chapter.isdigit():
            c_id = int(chapter)
            try:
                ch = Chapter.objects.filter(id=c_id).first()
                return ch, c_id
            except Exception:
                return None, c_id
        if hasattr(chapter, "id"):
            return None, int(chapter.id)
        raise ValueError(f"Invalid chapter reference: {chapter!r}")

    def _assemble_chapter_context(
        self,
        chapter_instance: Optional[Chapter],
        chapter_id: int,
        constraints: Dict[str, Any],
    ) -> str:
        """
        Gathers pedagogical text for the chapter:
        - If constraints['source_text'] is passed, uses that directly.
        - Otherwise inspects content_ingestion ExtractedItem entries for this chapter.
        - Otherwise summarizes topics from content.models.Topic.
        """
        explicit_source = constraints.get("source_text")
        if explicit_source and isinstance(explicit_source, str) and len(explicit_source.strip()) > 30:
            return explicit_source.strip()

        context_parts: List[str] = []

        # Try to pull parsed items from content_ingestion if available
        try:
            from content_ingestion.models import ExtractedItem
            items = ExtractedItem.objects.filter(chapter__job__title__icontains=getattr(chapter_instance, "title", ""))[:30]
            if items.exists():
                for item in items:
                    heading = f"### {item.heading}\n" if item.heading else ""
                    context_parts.append(f"{heading}[{item.item_type}] {item.content}")
        except Exception:
            pass

        # Also add topic names and chapter metadata
        if chapter_instance:
            context_parts.append(f"Chapter Title: {chapter_instance.title}")
            try:
                topics = list(chapter_instance.topics.values_list("name", flat=True))
                if topics:
                    context_parts.append("Key Syllabus Topics: " + ", ".join(topics))
            except Exception:
                pass

        return "\n\n".join(context_parts) if context_parts else f"Syllabus concepts for Chapter {chapter_id}."

    def _build_user_prompt(
        self,
        chapter_name: str,
        constraints: Dict[str, Any],
        context_text: str,
        quantity: int,
    ) -> str:
        """Construct the prompt sent to the LLM."""
        diff = constraints.get("difficulty", "ANY")
        qtype = constraints.get("question_type", "ANY")
        level = constraints.get("learner_level", "ANY")
        marks = constraints.get("marks") or constraints.get("marks_per_question", 1.0)
        bloom = constraints.get("bloom_level", "Apply/Understand")
        attached_figures = constraints.get("attached_figures") or []
        mark_distribution = constraints.get("mark_distribution") or []

        rubric_section = ""
        if mark_distribution:
            tier_lines = []
            for t in mark_distribution:
                t_marks = t.get("marks")
                t_count = t.get("count", 0)
                t_types = t.get("question_types") or [t.get("question_type", "ANY")]
                types_str = ", ".join(t_types) if isinstance(t_types, list) else str(t_types)
                tier_lines.append(f"- Tier [{t_marks} Mark(s)]: Exactly {t_count} question(s) | Allowed Formats: {types_str}")
            rubric_section = (
                "\nSTRUCTURED QUESTION FORMAT & MARK RUBRIC (CRITICAL MANDATE):\n"
                "You MUST generate the questions broken down into these exact mark tiers and formats:\n"
                + "\n".join(tier_lines)
                + f"\nGrand Total Questions to generate: {quantity}.\n"
            )

        figures_section = ""
        if attached_figures:
            fig_lines = []
            for fig in attached_figures:
                fig_lines.append(
                    f"- Figure ID: {fig.get('figure_id')} | Title: {fig.get('title')} | URL: {fig.get('image_url')}"
                )
            figures_section = (
                "\nATTACHED VISUAL FIGURES FOR SELECTIVE QUESTION ALLOCATION:\n"
                + "\n".join(fig_lines)
                + f"\nCRITICAL DIAGRAM ALLOCATION RULES:\n"
                + f"1. Allocate exactly one question per attached figure above (total {len(attached_figures)} diagram question(s)). Set question_type to 'DIAGRAM_BASED' and include the diagram attachment object.\n"
                + f"2. Assign each diagram question to the most suitable mark tier from the rubric above.\n"
                + f"3. ALL OTHER {max(0, quantity - len(attached_figures))} QUESTIONS MUST HAVE NO DIAGRAM (set 'diagram': null) and MUST be formulated purely from the chapter text, mathematical equations, tables, definitions, or conceptual problems.\n"
                + "4. DO NOT make all questions diagram-based! Balance the exam with pure text, LaTeX math, and conceptual questions.\n"
            )

        return f"""
CHAPTER: {chapter_name}
TARGET QUANTITY: {quantity} questions

CONSTRAINTS:
- Question Type: {qtype}
- Difficulty: {diff}
- Learner Level: {level}
- Marks per Question: {marks}
- Cognitive Level (Bloom Taxonomy): {bloom}
{rubric_section}
{figures_section}
SOURCE CHAPTER MATERIAL:
---
{context_text}
---

Generate exactly {quantity} questions strictly conforming to the JSON schema. Return ONLY valid JSON array.
"""

    def _call_llm_provider(self, user_prompt: str) -> Optional[str]:
        """
        Executes request against the primary LLM provider (Gemini Flash API).
        Implements timeout protection and status handling.
        """
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"
            f"?key={self.api_key}"
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": SYSTEM_GENERATION_PROMPT},
                        {"text": user_prompt},
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        }

        try:
            resp = requests.post(url, json=payload, timeout=25)
            if resp.status_code == 200:
                res_data = resp.json()
                text = (
                    res_data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                return text
            elif resp.status_code == 429:
                logger.warning("Gemini API rate limit exceeded (HTTP 429). Triggering fallback.")
                return None
            else:
                logger.warning(f"Gemini API returned status {resp.status_code}: {resp.text[:150]}")
                return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error calling LLM API: {e}")
            return None

    def _parse_llm_response(
        self,
        raw_text: str,
        chapter_id: int,
        constraints: Dict[str, Any],
    ) -> List[QuestionDraft]:
        """
        Clean, repair, and convert LLM JSON output into valid QuestionDraft objects.
        """
        clean = raw_text.strip()
        # Remove markdown code fences if present
        if clean.startswith("```json"):
            clean = clean[7:]
        if clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        try:
            data = json.loads(clean)
        except json.JSONDecodeError as e:
            logger.warning(f"Direct JSON parse failed: {e}. Attempting regex array extraction.")
            match = re.search(r"\[\s*\{.*\}\s*\]", clean, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(0))
                except Exception:
                    return []
            else:
                return []

        if not isinstance(data, list):
            if isinstance(data, dict) and "questions" in data and isinstance(data["questions"], list):
                data = data["questions"]
            else:
                return []

        default_diff = constraints.get("difficulty") or "MEDIUM"
        default_type = constraints.get("question_type") or "MCQ"
        default_level = constraints.get("learner_level") or "INTERMEDIATE"
        default_marks = constraints.get("marks") or constraints.get("marks_per_question") or 1.0

        drafts: List[QuestionDraft] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            q_text = str(item.get("question_text", "")).strip()
            if not q_text or len(q_text) < 5:
                continue

            q_type = str(item.get("question_type") or default_type).upper()
            if q_type not in ("MCQ", "SHORT_ANSWER", "LONG_ANSWER", "DIAGRAM_BASED"):
                q_type = default_type

            # Handle diagram attachment if present
            diag_obj = item.get("diagram")
            diagram_dict = None
            if isinstance(diag_obj, dict) and (diag_obj.get("image_url") or diag_obj.get("figure_id") or diag_obj.get("title")):
                diagram_dict = {
                    "figure_id": str(diag_obj.get("figure_id", "")),
                    "title": str(diag_obj.get("title", "")),
                    "image_url": str(diag_obj.get("image_url", "")),
                    "drive_file_id": str(diag_obj.get("drive_file_id", "")),
                }
                if q_type != "MCQ":
                    q_type = "DIAGRAM_BASED"

            # Handle options for MCQ
            options = item.get("options")
            if q_type == "MCQ":
                if not isinstance(options, dict) or len(options) < 2:
                    # Provide default options if LLM hallucinated empty options
                    options = {"A": "True", "B": "False"}
            else:
                options = None

            marks_val = item.get("marks")
            try:
                marks = Decimal(str(marks_val)) if marks_val is not None else Decimal(str(default_marks))
            except Exception:
                marks = Decimal(str(default_marks))

            correct_ans = str(item.get("correct_answer") or "See explanation").strip()

            drafts.append(
                QuestionDraft(
                    question_text=q_text,
                    question_type=q_type,
                    marks=marks,
                    difficulty=str(item.get("difficulty") or default_diff).upper(),
                    learner_level=str(item.get("learner_level") or default_level).upper(),
                    correct_answer=correct_ans,
                    options=options,
                    source_reference=str(item.get("source_reference") or ""),
                    topic_id=constraints.get("topic_id"),
                    topic_name=None,
                    is_active=True,
                    diagram=diagram_dict,
                    metadata={
                        "source": "llm_pipeline",
                        "model": self.model_name,
                        "chapter_id": chapter_id,
                    },
                )
            )

        return drafts

    def _generate_from_source_text_fallback(
        self,
        chapter_instance: Optional[Chapter],
        constraints: Dict[str, Any],
    ) -> List[QuestionDraft]:
        """
        Rubric-aware heuristic generator from raw source text and attached figures.
        Guarantees that teachers with custom PDFs receive working exam questions matching
        their exact mark distribution and format constraints even when external LLMs are busy.
        """
        source_text = constraints.get("source_text", "").strip()
        attached_figures = list(constraints.get("attached_figures") or [])
        target_quantity = int(constraints.get("quantity") or 5)
        default_diff = constraints.get("difficulty") or "MEDIUM"
        default_marks = constraints.get("marks") or constraints.get("marks_per_question") or 2.0
        mark_distribution = constraints.get("mark_distribution") or []

        drafts: List[QuestionDraft] = []
        fig_cursor = 0

        # Extract pedagogical sentences from chapter text
        lines = [line.strip() for line in source_text.splitlines() if len(line.strip()) > 35]
        pedagogical_sentences = [
            line for line in lines
            if not line.startswith("---") and not line.lower().startswith("chapter")
        ]
        if not pedagogical_sentences:
            pedagogical_sentences = [
                "Fundamental principles, governing laws, and core mathematical models.",
                "Experimental observations and foundational empirical equations.",
                "Structural analysis, classification taxonomies, and functional mechanics.",
            ]
        sentence_idx = 0

        # Case A: Teacher configured a structured mark rubric distribution
        if mark_distribution:
            for tier in mark_distribution:
                tier_marks = Decimal(str(tier.get("marks", 1.0)))
                tier_count = int(tier.get("count", 0))
                allowed_types = tier.get("question_types") or ["MCQ" if tier_marks == 1 else "SHORT_ANSWER"]
                if isinstance(allowed_types, str):
                    allowed_types = [allowed_types]

                for q_i in range(tier_count):
                    q_type = allowed_types[q_i % len(allowed_types)]
                    sentence = pedagogical_sentences[sentence_idx % len(pedagogical_sentences)]
                    sentence_idx += 1

                    # Allocate attached figures selectively (at most 1 figure per slot)
                    fig_to_attach = None
                    if fig_cursor < len(attached_figures) and (
                        q_type == "DIAGRAM_BASED"
                        or tier_marks >= Decimal("3.0")
                        or (tier_marks == Decimal("1.0") and q_type == "MCQ" and len(attached_figures) > 1)
                    ):
                        fig_to_attach = attached_figures[fig_cursor]
                        fig_cursor += 1

                    if fig_to_attach:
                        fig_title = fig_to_attach.get("title") or "the illustrated figure"
                        fig_url = fig_to_attach.get("image_url") or f"/api/papers/diagram-asset/{fig_to_attach.get('figure_id')}/"
                        drafts.append(
                            QuestionDraft(
                                question_text=f"Study the illustration of {fig_title} shown below. (a) Identify the key functional components labeled in the diagram. (b) Explain the primary mechanism demonstrated.",
                                question_type="DIAGRAM_BASED",
                                marks=tier_marks,
                                difficulty=default_diff,
                                learner_level="INTERMEDIATE",
                                correct_answer=f"Detailed analysis of {fig_title}: Labeling points ({float(tier_marks)*0.4:.1f} marks), functional explanation ({float(tier_marks)*0.6:.1f} marks).",
                                options=None,
                                source_reference=f"Page {fig_to_attach.get('page_number', 1)}",
                                diagram={
                                    "figure_id": fig_to_attach.get("figure_id"),
                                    "title": fig_title,
                                    "image_url": fig_url,
                                    "drive_file_id": fig_to_attach.get("drive_file_id"),
                                },
                                metadata={"source": "diagram_harvester_fallback"},
                            )
                        )
                    elif q_type == "MCQ":
                        drafts.append(
                            QuestionDraft(
                                question_text=f"Based on the chapter excerpt, which of the following statements is correct regarding: '{sentence[:90]}...'?",
                                question_type="MCQ",
                                marks=tier_marks,
                                difficulty=default_diff,
                                learner_level="BEGINNER",
                                correct_answer="A",
                                options={
                                    "A": sentence[:110],
                                    "B": "The inverse relation holds true under baseline conditions.",
                                    "C": "It is an unverified assumption without empirical basis.",
                                    "D": "None of the above statements are supported.",
                                },
                                source_reference="Extracted Chapter Text",
                                metadata={"source": "text_concept_fallback"},
                            )
                        )
                    elif q_type == "FILL_IN_BLANKS":
                        words = [w for w in sentence.split() if len(w) > 4]
                        key_word = words[0] if words else "concept"
                        blank_text = sentence.replace(key_word, "__________", 1)
                        drafts.append(
                            QuestionDraft(
                                question_text=f"Fill in the blank with the appropriate academic term: \"{blank_text[:140]}\"",
                                question_type="FILL_IN_BLANKS",
                                marks=tier_marks,
                                difficulty=default_diff,
                                learner_level="BEGINNER",
                                correct_answer=key_word,
                                options=None,
                                source_reference="Extracted Chapter Text",
                                metadata={"source": "text_concept_fallback"},
                            )
                        )
                    elif q_type == "LONG_ANSWER":
                        drafts.append(
                            QuestionDraft(
                                question_text=f"Provide a comprehensive, step-by-step analytical derivation and evaluation of: '{sentence[:120]}'. Include all governing equations and underlying assumptions.",
                                question_type="LONG_ANSWER",
                                marks=tier_marks,
                                difficulty=default_diff,
                                learner_level="ADVANCED",
                                correct_answer=f"Comprehensive evaluation of {sentence[:80]}: Detailed theoretical framework, governing equations, derivations, and contextual significance.",
                                options=None,
                                source_reference="Extracted Chapter Text",
                                metadata={"source": "text_concept_fallback"},
                            )
                        )
                    else:  # SHORT_ANSWER
                        drafts.append(
                            QuestionDraft(
                                question_text=f"Explain the significance of the following concept in detail: '{sentence[:120]}'.",
                                question_type="SHORT_ANSWER",
                                marks=tier_marks,
                                difficulty=default_diff,
                                learner_level="INTERMEDIATE",
                                correct_answer=f"Expected model explanation covering definitions, principles, and applications of: {sentence[:100]}.",
                                options=None,
                                source_reference="Extracted Chapter Text",
                                metadata={"source": "text_concept_fallback"},
                            )
                        )
            return drafts

        # Case B: Standard quantity without explicit rubric
        for fig in attached_figures[:2]:
            fig_title = fig.get("title") or "the given diagram"
            fig_url = fig.get("image_url") or f"/api/papers/diagram-asset/{fig.get('figure_id')}/"
            drafts.append(
                QuestionDraft(
                    question_text=f"Study the illustration of {fig_title} shown below. (a) Identify the key functional components labeled in the diagram. (b) Explain the primary mechanism demonstrated.",
                    question_type="DIAGRAM_BASED",
                    marks=Decimal("5.0"),
                    difficulty="MEDIUM",
                    learner_level="INTERMEDIATE",
                    correct_answer=f"Detailed analysis of {fig_title}: Labeling points (2 marks), functional mechanism explanation (3 marks).",
                    options=None,
                    source_reference=f"Page {fig.get('page_number', 1)}",
                    diagram={
                        "figure_id": fig.get("figure_id"),
                        "title": fig_title,
                        "image_url": fig_url,
                        "drive_file_id": fig.get("drive_file_id"),
                    },
                    metadata={"source": "diagram_harvester_fallback"},
                )
            )
            if len(drafts) >= target_quantity:
                return drafts

        while len(drafts) < target_quantity and sentence_idx < len(pedagogical_sentences):
            sentence = pedagogical_sentences[sentence_idx]
            sentence_idx += 1

            if len(drafts) % 2 == 0:
                drafts.append(
                    QuestionDraft(
                        question_text=f"Based on the chapter excerpt, which of the following statements is correct regarding: '{sentence[:90]}...'?",
                        question_type="MCQ",
                        marks=Decimal("1.0"),
                        difficulty=default_diff,
                        learner_level="BEGINNER",
                        correct_answer="A",
                        options={
                            "A": sentence[:110],
                            "B": "The inverse relation holds true under baseline conditions.",
                            "C": "It is an unverified assumption without empirical basis.",
                            "D": "None of the above statements are supported.",
                        },
                        source_reference="Extracted Chapter Text",
                        metadata={"source": "text_concept_fallback"},
                    )
                )
            else:
                drafts.append(
                    QuestionDraft(
                        question_text=f"Explain the significance of the following concept in detail: '{sentence[:120]}'.",
                        question_type="SHORT_ANSWER",
                        marks=Decimal(str(default_marks)),
                        difficulty=default_diff,
                        learner_level="INTERMEDIATE",
                        correct_answer=f"Expected model explanation covering definitions, principles, and applications of: {sentence[:100]}.",
                        options=None,
                        source_reference="Extracted Chapter Text",
                        metadata={"source": "text_concept_fallback"},
                    )
                )

        return drafts

        # 3. If text was very short, pad with foundational questions
        while len(drafts) < target_quantity:
            drafts.append(
                QuestionDraft(
                    question_text=f"State and explain the fundamental principles outlined in this chapter section (Item #{len(drafts) + 1}).",
                    question_type="SHORT_ANSWER",
                    marks=Decimal("2.0"),
                    difficulty=default_diff,
                    learner_level="INTERMEDIATE",
                    correct_answer="Accurate definition of core terms and supporting analytical explanation.",
                    options=None,
                    metadata={"source": "baseline_pad"},
                )
            )

        return drafts[:target_quantity]
