"""
Interfaces and data structures for the Question Generation Service.

Defines the boundary between question paper generation requests and the
underlying generator engine (pre-seeded bank, LLM prompt pipeline, RAG agent, etc.).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Any, Optional


@dataclass
class QuestionDraft:
    """
    A generated-but-not-yet-persisted candidate question.

    Mirrors the shape of ``content.models.Question`` core fields so that
    it can be reviewed by teachers in the UI, reordered, and persisted
    into ``Question`` without translation logic scattered across callers.
    """

    question_text: str
    question_type: str  # "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER"
    marks: Decimal | float
    difficulty: str  # "EASY" | "MEDIUM" | "HARD"
    learner_level: str  # "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
    correct_answer: str
    options: Optional[dict[str, str]] = None  # MCQ options, e.g. {"A": "...", "B": "..."}
    source_reference: str = ""
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    is_active: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """
        Convert draft to a dictionary suitable for API responses and JSON serialization.
        """
        data = asdict(self)
        if isinstance(data.get("marks"), Decimal):
            data["marks"] = float(data["marks"])
        return data

    @classmethod
    def from_question(cls, question: Any) -> "QuestionDraft":
        """
        Construct a QuestionDraft from an existing content.models.Question instance.
        """
        topic_name = None
        if hasattr(question, "topic") and question.topic:
            topic_name = question.topic.name

        return cls(
            question_text=question.question_text,
            question_type=question.question_type,
            marks=question.marks,
            difficulty=question.difficulty,
            learner_level=question.learner_level,
            correct_answer=question.correct_answer,
            options=question.options,
            source_reference=question.source_reference or "",
            topic_id=question.topic_id,
            topic_name=topic_name,
            is_active=question.is_active,
            metadata={
                "source": "seeded_bank",
                "original_question_id": question.id,
            },
        )


class QuestionGenerationService(ABC):
    """
    Abstract interface for question generation backends.

    Any generation backend (e.g. SeededBankGenerationService, LLMRAGGenerationService)
    must implement this contract.
    """

    @abstractmethod
    def generate_questions(
        self,
        chapter: Any,
        constraints: dict[str, Any],
    ) -> list[QuestionDraft]:
        """
        Generate or select candidate QuestionDraft items for a given chapter and constraints.

        Args:
            chapter: Either a Chapter model instance or integer chapter_id.
            constraints: Dictionary of constraint parameters. Standard keys mirror
                content.filters.filter_questions:
                  - topic_id (int) or topic_ids (list[int]): Topic filter
                  - difficulty (str): "EASY" | "MEDIUM" | "HARD"
                  - question_type (str): "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER"
                  - learner_level (str): "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
                  - marks (float | Decimal): Exact marks per question
                  - quantity (int): Maximum number of questions to select/generate
                Plus open-ended room for future LLM/RAG parameters without breaking the contract:
                  - source_text (str): Reference passage or text excerpt
                  - bloom_level (str): Bloom taxonomy cognitive level
                  - model_name (str): LLM model identifier
                  - temperature (float): Sampling temperature

        Returns:
            list[QuestionDraft]: Candidate question drafts ready for review.
        """
        pass
