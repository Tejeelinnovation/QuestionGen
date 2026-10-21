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
- Formulas and math expressions MUST use LaTeX notation (e.g. $x^2 + 5x + 6 = 0$ or \\frac{a}{b}).

JSON SCHEMA:
[
  {
    "question_text": "Clear, rigorous question stem",
    "question_type": "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER",
    "marks": 1.0,
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "learner_level": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
    "correct_answer": "Model solution or correct option letter",
    "options": {"A": "Option 1", "B": "Option 2", "C": "Option 3", "D": "Option 4"} or null,
    "source_reference": "Specific section, theorem, or page reference if available"
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
            or getattr(settings, "GEMINI_MODEL_NAME", "gemini-2.0-flash")
            or "gemini-2.0-flash"
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

        # 1. Check if LLM API is available. If no API key configured, route to fallback immediately.
        if not self.api_key:
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
                f"LLM generation failed for Chapter {chapter_id}. Engaging SeededBankGenerationService fallback."
            )
            return self.fallback_service.generate_questions(chapter, constraints)

        # 6. Parse and Validate Questions
        parsed_drafts = self._parse_llm_response(raw_response, chapter_id, constraints)
        if not parsed_drafts:
            logger.warning(
                f"LLM generated unparseable response for Chapter {chapter_id}. Engaging fallback."
            )
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

        # If deduplication left fewer items than desired, backfill from fallback bank
        if len(final_drafts) < target_quantity:
            needed = target_quantity - len(final_drafts)
            logger.info(f"Backfilling {needed} questions from SeededBankGenerationService.")
            fallback_constraints = dict(constraints)
            fallback_constraints["quantity"] = needed
            fallback_drafts = self.fallback_service.generate_questions(chapter, fallback_constraints)
            final_drafts.extend(fallback_drafts)

        return final_drafts[:target_quantity]

    def _resolve_chapter(self, chapter: Any) -> Tuple[Optional[Chapter], int]:
        """Extract Chapter model and integer ID safely."""
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

        return f"""
CHAPTER: {chapter_name}
TARGET QUANTITY: {quantity} questions

CONSTRAINTS:
- Question Type: {qtype}
- Difficulty: {diff}
- Learner Level: {level}
- Marks per Question: {marks}
- Cognitive Level (Bloom Taxonomy): {bloom}

SOURCE CHAPTER MATERIAL:
---
{context_text}
---

Generate exactly {quantity} questions strictly conforming to the JSON schema. Return ONLY valid JSON.
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
            if q_type not in ("MCQ", "SHORT_ANSWER", "LONG_ANSWER"):
                q_type = default_type

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
                    metadata={
                        "source": "llm_pipeline",
                        "model": self.model_name,
                        "chapter_id": chapter_id,
                    },
                )
            )

        return drafts
