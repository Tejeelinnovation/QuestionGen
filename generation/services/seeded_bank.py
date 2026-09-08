"""
Seeded Bank Question Generation Service implementation.

Fulfills QuestionGenerationService using the pre-seeded question bank (content app).
Translates database Question rows into QuestionDraft objects, preserving the
exact current selection behavior through the new generation contract.
"""

from __future__ import annotations

from typing import Any

from content.filters import filter_questions
from content.models import Question
from generation.interfaces import QuestionDraft, QuestionGenerationService


class SeededBankGenerationService(QuestionGenerationService):
    """
    Concrete generation service wrapping the content app's filter_questions() logic.

    Demonstrates that the QuestionGenerationService interface is structurally sound
    and capable of serving real data without requiring any live AI/LLM API calls.
    """

    def generate_questions(
        self,
        chapter: Any,
        constraints: dict[str, Any],
    ) -> list[QuestionDraft]:
        """
        Query the active question bank for questions matching the chapter and constraints,
        returning them as QuestionDraft instances.
        """
        # Resolve chapter ID
        chapter_id: int
        if isinstance(chapter, int):
            chapter_id = chapter
        elif hasattr(chapter, "id"):
            chapter_id = int(chapter.id)
        elif isinstance(chapter, str) and chapter.isdigit():
            chapter_id = int(chapter)
        else:
            raise ValueError(f"Invalid chapter identifier: {chapter!r}")

        # Base query scoped to chapter and active status
        qs = Question.objects.select_related("topic", "topic__chapter").filter(
            topic__chapter_id=chapter_id,
            is_active=True,
        )

        # Topic filtering (supports both topic_id and topic_ids)
        topic_ids = constraints.get("topic_ids")
        if topic_ids and isinstance(topic_ids, (list, tuple, set)):
            qs = qs.filter(topic_id__in=topic_ids)
        elif constraints.get("topic_id"):
            qs = qs.filter(topic_id=constraints["topic_id"])

        # Delegate standard attribute filters to content.filters.filter_questions
        filter_params: dict[str, Any] = {}
        if constraints.get("difficulty"):
            filter_params["difficulty"] = constraints["difficulty"]
        if constraints.get("question_type"):
            filter_params["question_type"] = constraints["question_type"]
        if constraints.get("learner_level"):
            filter_params["learner_level"] = constraints["learner_level"]
        if constraints.get("marks") is not None:
            filter_params["marks"] = constraints["marks"]
        elif constraints.get("marks_per_question") is not None:
            filter_params["marks"] = constraints["marks_per_question"]

        qs = filter_questions(qs, filter_params)

        # Consistent ordering matching papers app
        qs = qs.order_by("topic_id", "difficulty", "id")

        # Quota or Quantity constraint
        total_marks = constraints.get("total_marks")
        quantity = constraints.get("quantity")

        if total_marks is not None:
            from papers.selection import select_questions_for_quota
            qty_int = None
            if quantity:
                try:
                    qty_int = int(quantity)
                except (ValueError, TypeError):
                    qty_int = None
            selected_questions, _ = select_questions_for_quota(
                list(qs),
                target_marks=float(total_marks),
                max_quantity=qty_int,
            )
            qs = selected_questions
        elif quantity:
            try:
                qty_int = int(quantity)
                if qty_int > 0:
                    qs = qs[:qty_int]
            except (ValueError, TypeError):
                pass

        # Materialize as QuestionDraft objects
        drafts: list[QuestionDraft] = [QuestionDraft.from_question(q) for q in qs]
        return drafts
