"""
Generation app package.

Defines the generation service boundary, LLM integration, token budgeting, and deduplication.
"""

from .duplicate_detector import DuplicateMatch, DuplicateQuestionDetector
from .interfaces import QuestionDraft, QuestionGenerationService
from .token_budget import TokenBudgetManager, TokenBudgetReport

default_app_config = "generation.apps.GenerationConfig"

__all__ = [
    "QuestionDraft",
    "QuestionGenerationService",
    "TokenBudgetManager",
    "TokenBudgetReport",
    "DuplicateQuestionDetector",
    "DuplicateMatch",
]
