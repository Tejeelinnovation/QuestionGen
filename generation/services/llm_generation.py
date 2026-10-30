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
You are an expert curriculum assessment creator and psychometric question author for secondary and senior-secondary school examinations.
Generate high-quality academic questions strictly aligned to the provided chapter content and constraints.

SUBJECT-SPECIFIC RIGOR MANDATES:
1. CHEMISTRY:
   - All chemical formulas, ions, and reaction equations MUST be formatted in LaTeX notation (e.g. $\\text{MnO}_4^-$, $\\text{H}_2\\text{SO}_4$, $\\text{Fe}^{3+} + e^- \\rightarrow \\text{Fe}^{2+}$, $\\text{Cu}^{2+} + 2e^- \\rightarrow \\text{Cu}$, $\\text{Cr}_2\\text{O}_7^{2-}$).
   - Explicitly write oxidation numbers with signs (e.g. $+7, +2, -1, 0$).
   - For redox reactions and balancing questions, write full balanced chemical reactions with physical states ($s, l, g, aq$).
2. MATHEMATICS & PHYSICS:
   - Use rigorous LaTeX notation for formulas, fractions (\\frac{a}{b}), exponents, square roots (\\sqrt{x}), integrals (\\int), derivatives (\\frac{dy}{dx}), and vectors.
   - Include realistic numerical problem statements with given parameters, units, and clear target quantities.
3. ACCOUNTANCY & COMMERCE:
   - Accounting entries MUST use clean Markdown tables with columns: Date | Particulars | L.F. | Debit (Rs.) | Credit (Rs.).
   - Balance sheets and ledger accounts must present structured figures with realistic debit/credit balance.
   - Questions on depreciation, partnership, shares, or ratios must provide explicit numeric details and calculations.
4. BIOLOGY & LIFE SCIENCES:
   - Use standard scientific terminology, taxonomic hierarchies (Kingdom, Phylum, Class, Order, Family, Genus, Species), binomial nomenclature rules, and precise physiological mechanisms.
   - For diagram questions, ask students to identify anatomical structures, trace biochemical cycles, or distinguish cellular components.
5. COMPUTER SCIENCE & INFORMATICS:
   - Use formatted syntax blocks for code (Python/SQL/C++), boolean expressions, logic gate truth tables, and algorithm trace problems.
6. LANGUAGE & MEDIUM FIDELITY (HINDI, SANSKRIT, URDU, REGIONAL):
   - If the source textbook text is in Hindi, Sanskrit, or Urdu, formulate questions, options, and model solutions in that same language with accurate academic vocabulary.
7. MULTIPLE CHOICE QUESTIONS (MCQs):
   - Every MCQ MUST include exactly 4 distinct, plausible, academically rigorous options under keys "A", "B", "C", "D".
   - Distractors must test plausible student misconceptions or common calculation pitfalls.
   - STRICT PROHIBITION: NEVER use generic dummy placeholder options like "The inverse relation holds true", "None of the above statements are supported", or "Unverified assumption".
8. SHORT & LONG ANSWERS:
   - 'correct_answer' must contain the full model solution, key marking steps, and relevant equations.
9. DIAGRAM-BASED QUESTIONS:
   - When ATTACHED FIGURES are provided in the prompt, you MUST construct diagram-specific question(s) referencing the figure and include the exact 'diagram' object with 'figure_id', 'title', and 'image_url'.

OUTPUT REQUIREMENTS:
- Output MUST be valid, parseable JSON as an array of question objects (NO markdown code fences, NO introductory or concluding text).

JSON SCHEMA:
[
  {
    "question_text": "Clear, rigorous question stem with LaTeX equations where applicable",
    "question_type": "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER" | "DIAGRAM_BASED",
    "marks": 1.0,
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "learner_level": "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
    "correct_answer": "Model solution or correct option letter",
    "options": {"A": "Option 1", "B": "Option 2", "C": "Option 3", "D": "Option 4"} or null,
    "source_reference": "Specific section, theorem, equation, or page reference",
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
            or getattr(settings, "GEMINI_MODEL_NAME", "gemini-3.5-flash-lite")
            or "gemini-3.5-flash-lite"
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
        Generate candidate questions using LLM with sectional batching, context budgeting,
        deduplication, and multi-model fallback.
        """
        chapter_instance, chapter_id = self._resolve_chapter(chapter)

        # 1. Check if LLM API is available.
        if not self.api_key:
            if constraints.get("source_text"):
                logger.info("No LLM API key configured. Using heuristic generator for extracted source text.")
                return self._generate_from_source_text_fallback(chapter_instance, constraints)
            logger.info("No LLM API key configured. Routing request to SeededBankGenerationService fallback.")
            return self.fallback_service.generate_questions(chapter, constraints)

        # 2. Gather context material for the chapter
        target_quantity = int(constraints.get("quantity") or 5)
        context_text = self._assemble_chapter_context(chapter_instance, chapter_id, constraints)

        # 3. Plan Sectional Batches to avoid prompt timeouts and JSON output truncation
        batches = self._plan_batches(constraints, target_quantity)
        logger.info(f"Sectional Batching: Generating {target_quantity} questions across {len(batches)} batch(es).")

        all_parsed_drafts: List[QuestionDraft] = []
        for b_idx, b_spec in enumerate(batches):
            b_qty = b_spec["quantity"]
            b_constraints = b_spec["constraints"]

            # Calculate Token Budget for this specific batch
            budget_report = self.budget_manager.calculate_budget(
                model_name=self.model_name,
                system_prompt=SYSTEM_GENERATION_PROMPT,
                target_question_count=b_qty,
            )

            fitted_context, _ = self.budget_manager.fit_context_text(
                raw_text=context_text,
                max_tokens=budget_report.context_budget_available,
                model_name=self.model_name,
            )

            user_prompt = self._build_user_prompt(
                chapter_name=getattr(chapter_instance, "title", f"Chapter {chapter_id}"),
                constraints=b_constraints,
                context_text=fitted_context,
                quantity=b_qty,
            )

            raw_response = self._call_llm_provider(user_prompt)
            batch_drafts = []
            if raw_response:
                batch_drafts = self._parse_llm_response(raw_response, chapter_id, b_constraints)

            if not batch_drafts:
                logger.warning(
                    f"Batch {b_idx + 1}/{len(batches)} (qty {b_qty}) failed or returned empty. Using source fallback for batch."
                )
                if constraints.get("source_text"):
                    batch_drafts = self._generate_from_source_text_fallback(chapter_instance, b_constraints)
                else:
                    batch_drafts = self.fallback_service.generate_questions(chapter, b_constraints)

            all_parsed_drafts.extend(batch_drafts)

        if not all_parsed_drafts:
            logger.warning(f"All generation batches failed for Chapter {chapter_id}. Engaging complete fallback.")
            if constraints.get("source_text"):
                return self._generate_from_source_text_fallback(chapter_instance, constraints)
            return self.fallback_service.generate_questions(chapter, constraints)

        # 4. Deduplication Guard: Remove internal batch duplicates
        unique_drafts, batch_dups = self.duplicate_detector.filter_batch_duplicates(all_parsed_drafts)
        if batch_dups:
            logger.info(f"Deduplication Guard filtered {len(batch_dups)} duplicate questions.")

        # 5. Check against existing questions in DB
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
                    continue
                final_drafts.append(draft)
        except Exception as e:
            logger.debug(f"Skipping existing question DB collision check: {e}")
            final_drafts = unique_drafts

        return final_drafts

    def _plan_batches(self, constraints: Dict[str, Any], target_quantity: int) -> List[Dict[str, Any]]:
        """
        Splits generation requests into manageable batches (max 10 questions each)
        to prevent API timeouts, token truncation, and quality degradation.
        """
        mark_distribution = constraints.get("mark_distribution") or []
        attached_figures = list(constraints.get("attached_figures") or [])
        batches = []
        fig_cursor = 0

        if mark_distribution:
            for tier in mark_distribution:
                tier_marks = tier.get("marks", 1.0)
                tier_count = int(tier.get("count", 0))
                tier_types = tier.get("question_types") or [tier.get("question_type", "ANY")]
                if isinstance(tier_types, str):
                    tier_types = [tier_types]

                remaining = tier_count
                while remaining > 0:
                    chunk_size = min(remaining, 10)
                    remaining -= chunk_size

                    # Assign diagrams if diagram-based or high marks
                    assigned_figs = []
                    if fig_cursor < len(attached_figures) and (
                        "DIAGRAM_BASED" in tier_types or float(tier_marks) >= 3.0 or remaining == 0
                    ):
                        take_count = min(len(attached_figures) - fig_cursor, max(1, chunk_size // 2))
                        assigned_figs = attached_figures[fig_cursor : fig_cursor + take_count]
                        fig_cursor += take_count

                    sub_tier = {
                        "marks": tier_marks,
                        "count": chunk_size,
                        "question_types": tier_types,
                    }
                    b_constraints = dict(constraints)
                    b_constraints["quantity"] = chunk_size
                    b_constraints["mark_distribution"] = [sub_tier]
                    b_constraints["attached_figures"] = assigned_figs
                    b_constraints["marks"] = tier_marks
                    b_constraints["question_type"] = tier_types[0] if len(tier_types) == 1 else "ANY"

                    batches.append({"quantity": chunk_size, "constraints": b_constraints})
        else:
            remaining = target_quantity
            while remaining > 0:
                chunk_size = min(remaining, 10)
                remaining -= chunk_size

                assigned_figs = []
                if fig_cursor < len(attached_figures):
                    assigned_figs = [attached_figures[fig_cursor]]
                    fig_cursor += 1

                b_constraints = dict(constraints)
                b_constraints["quantity"] = chunk_size
                b_constraints["attached_figures"] = assigned_figs
                batches.append({"quantity": chunk_size, "constraints": b_constraints})

        return batches if batches else [{"quantity": target_quantity, "constraints": constraints}]

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
        Executes request against the primary LLM provider (Gemini API).
        Implements multi-model fallback, retry logic, and 60s timeout.
        """
        import time

        primary_model = self.model_name.replace("models/", "")
        # Automatically upgrade deprecated model aliases to active production models
        if primary_model in ("gemini-flash-latest", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"):
            primary_model = "gemini-3.5-flash-lite"
        models_to_try = [primary_model, "gemini-3.5-flash-lite", "gemini-3.5-flash"]
        seen = set()
        deduped_models = []
        for m in models_to_try:
            if m and m not in seen:
                seen.add(m)
                deduped_models.append(m)

        for model in deduped_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
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

            for attempt in range(3):
                try:
                    resp = requests.post(url, json=payload, timeout=120)
                    if resp.status_code == 200:
                        res_data = resp.json()
                        candidates = res_data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                return parts[0].get("text", "")
                    elif resp.status_code in (429, 503):
                        logger.warning(f"Demand throttle (HTTP {resp.status_code}) on model {model}. Retrying after backoff...")
                        time.sleep(3 * (attempt + 1))
                        continue
                    else:
                        logger.warning(f"Model {model} returned status {resp.status_code}: {resp.text[:120]}")
                        break
                except requests.exceptions.RequestException as e:
                    logger.warning(f"Network error on model {model} (attempt {attempt + 1}): {e}")
                    time.sleep(2 * (attempt + 1))

        return None

    @classmethod
    def _robust_latex_json_repair(cls, raw_str: str) -> Optional[Any]:
        """
        Repairs LLM-generated JSON strings containing mathematical/chemical LaTeX backslashes
        (e.g. \\text, \\frac, \\rightarrow, \\ce, \\uparrow) that violate strict JSON escape rules.
        """
        try:
            return json.loads(raw_str, strict=False)
        except Exception:
            pass

        # 1. Fix invalid unicode escapes: \u not followed by 4 hex digits
        s_fixed = re.sub(r'\\u(?![0-9a-fA-F]{4})', r'\\\\u', raw_str)

        # 2. Fix unescaped backslashes before characters not in standard JSON escapes
        s_fixed = re.sub(r'\\(?![/\"\\bfnrtu])', r'\\\\', s_fixed)

        # 3. Fix common LaTeX commands starting with JSON escape letters (\text, \frac, \rightarrow, etc.)
        latex_cmds = (
            r'(?:text|times|theta|to|tau|frac|rightarrow|right|rho|beta|left|alpha|ce|cdot|Delta|'
            r'omega|sigma|mu|lambda|pi|sqrt|infty|approx|pm|neq|leq|geq|uparrow|downarrow|over|sum|int|lim|partial)'
        )
        s_fixed = re.sub(r'(?<!\\)\\(' + latex_cmds + r')\b', r'\\\\\1', s_fixed)

        try:
            return json.loads(s_fixed, strict=False)
        except Exception:
            pass

        # 4. Tokenizer-level string backslash sanitizer
        out = []
        in_str = False
        i = 0
        while i < len(raw_str):
            c = raw_str[i]
            if c == '"' and (i == 0 or raw_str[i - 1] != '\\'):
                in_str = not in_str
                out.append(c)
                i += 1
            elif in_str and c == '\\':
                if i + 1 < len(raw_str):
                    nxt = raw_str[i + 1]
                    if nxt in ('"', '\\', '/'):
                        out.append(c)
                        out.append(nxt)
                        i += 2
                    elif nxt in ('b', 'f', 'n', 'r', 't'):
                        sub = raw_str[i + 1 : i + 15]
                        if re.match(r'^(?:text|times|theta|to|tau|frac|right|rho)\b', sub):
                            out.append('\\\\')
                            out.append(nxt)
                            i += 2
                        else:
                            out.append(c)
                            out.append(nxt)
                            i += 2
                    elif nxt == 'u' and i + 5 < len(raw_str) and re.match(r'^[0-9a-fA-F]{4}', raw_str[i + 2 : i + 6]):
                        out.append(c)
                        i += 1
                    else:
                        out.append('\\\\')
                        i += 1
                else:
                    out.append('\\\\')
                    i += 1
            else:
                out.append(c)
                i += 1

        try:
            return json.loads(''.join(out), strict=False)
        except Exception:
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

        data = self._robust_latex_json_repair(clean)
        if data is None:
            match = re.search(r"\[\s*\{.*\}\s*\]", clean, re.DOTALL)
            if match:
                data = self._robust_latex_json_repair(match.group(0))

        if not data:
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
        attached_figures = constraints.get("attached_figures") or []

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
                fig_id = str(diag_obj.get("figure_id", ""))
                matching_fig = next((f for f in attached_figures if f.get("figure_id") == fig_id), None) if attached_figures else None

                drive_id = str(diag_obj.get("drive_file_id", ""))
                if not drive_id and matching_fig:
                    drive_id = matching_fig.get("drive_file_id", "")

                img_url = str(diag_obj.get("image_url", ""))
                if (not img_url or img_url.startswith("http")) and matching_fig and matching_fig.get("image_url"):
                    img_url = matching_fig.get("image_url")
                elif not img_url and fig_id:
                    img_url = f"/api/papers/diagram-asset/{fig_id}/"

                thumb_b64 = str(diag_obj.get("thumbnail_b64", ""))
                if not thumb_b64 and matching_fig:
                    thumb_b64 = matching_fig.get("thumbnail_b64", "")

                diagram_dict = {
                    "figure_id": fig_id,
                    "title": str(diag_obj.get("title", "")),
                    "image_url": img_url,
                    "drive_file_id": drive_id,
                    "thumbnail_b64": thumb_b64,
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
                        other_sentences = [s for s in pedagogical_sentences if s != sentence]
                        dist1 = other_sentences[0][:110] if len(other_sentences) > 0 else "It represents an invariant constant across all states."
                        dist2 = other_sentences[1][:110] if len(other_sentences) > 1 else "It applies exclusively under standard reference conditions."
                        dist3 = other_sentences[2][:110] if len(other_sentences) > 2 else "It is strictly conserved during all transformations."
                        drafts.append(
                            QuestionDraft(
                                question_text=f"Which of the following statements accurately characterizes the principles discussed in the text regarding: '{sentence[:95]}...'?",
                                question_type="MCQ",
                                marks=tier_marks,
                                difficulty=default_diff,
                                learner_level="BEGINNER",
                                correct_answer="A",
                                options={
                                    "A": sentence[:110],
                                    "B": dist1,
                                    "C": dist2,
                                    "D": dist3,
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
                other_sentences = [s for s in pedagogical_sentences if s != sentence]
                dist1 = other_sentences[0][:110] if len(other_sentences) > 0 else "It represents an invariant constant across all states."
                dist2 = other_sentences[1][:110] if len(other_sentences) > 1 else "It applies exclusively under standard reference conditions."
                dist3 = other_sentences[2][:110] if len(other_sentences) > 2 else "It is strictly conserved during all transformations."
                drafts.append(
                    QuestionDraft(
                        question_text=f"Which of the following statements accurately characterizes the principles discussed in the text regarding: '{sentence[:95]}...'?",
                        question_type="MCQ",
                        marks=Decimal("1.0"),
                        difficulty=default_diff,
                        learner_level="BEGINNER",
                        correct_answer="A",
                        options={
                            "A": sentence[:110],
                            "B": dist1,
                            "C": dist2,
                            "D": dist3,
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
