"""
Token Budget Management and Dynamic Context Truncation Guard.

Prevents LLM API crashes, context window overflows, and premature response truncation
when feeding educational source text into question-generation models:
- Fast, formula-aware token estimation (~4 chars/token for prose, higher density for LaTeX/math).
- Dynamic budget partitioning: System prompt, Guaranteed Output headroom, and Context excerpt.
- Pedagogical Priority Pruning: Retains formulas, definitions, and solved examples while
  selectively compacting lower-priority background prose when over budget.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class ModelProfile:
    """Token boundaries for supported LLM backends."""
    name: str
    max_context_window: int = 8192
    max_output_tokens: int = 2048
    chars_per_token_prose: float = 4.0
    chars_per_token_latex: float = 2.0


DEFAULT_MODEL_PROFILES: Dict[str, ModelProfile] = {
    "gemini-3.5-flash-lite": ModelProfile("gemini-3.5-flash-lite", max_context_window=32768, max_output_tokens=4096),
    "gemini-3.5-flash": ModelProfile("gemini-3.5-flash", max_context_window=32768, max_output_tokens=4096),
    "gemini-2.0-flash": ModelProfile("gemini-2.0-flash", max_context_window=32768, max_output_tokens=4096),
    "gemini-1.5-flash": ModelProfile("gemini-1.5-flash", max_context_window=16384, max_output_tokens=3072),
    "gemini-3.8-flash": ModelProfile("gemini-3.8-flash", max_context_window=32768, max_output_tokens=4096),
    "gpt-4o-mini": ModelProfile("gpt-4o-mini", max_context_window=16384, max_output_tokens=4096),
    "claude-3-haiku": ModelProfile("claude-3-haiku", max_context_window=16384, max_output_tokens=4096),
    "default": ModelProfile("default", max_context_window=8192, max_output_tokens=2048),
}


@dataclass
class TokenBudgetReport:
    """Summary of token budget calculation and context utilization."""
    model_name: str
    total_context_window: int
    system_tokens: int
    reserved_output_tokens: int
    context_budget_available: int
    actual_context_tokens: int
    is_truncated: bool = False
    pruned_items_count: int = 0
    pruned_chars_count: int = 0
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_name": self.model_name,
            "total_context_window": self.total_context_window,
            "system_tokens": self.system_tokens,
            "reserved_output_tokens": self.reserved_output_tokens,
            "context_budget_available": self.context_budget_available,
            "actual_context_tokens": self.actual_context_tokens,
            "is_truncated": self.is_truncated,
            "pruned_items_count": self.pruned_items_count,
            "pruned_chars_count": self.pruned_chars_count,
        }


class TokenBudgetManager:
    """
    Orchestrates LLM context limits and guarantees safe output room for structured JSON responses.
    """

    LATEX_SPECIAL_CHARS = re.compile(r"[\$\\\{\}\_\^\&\=\+\-\*\/\<\>\[\]]")
    ESTIMATED_TOKENS_PER_QUESTION = 220  # Average tokens for MCQ / Short / Long question with rationale

    def __init__(self, profiles: Optional[Dict[str, ModelProfile]] = None):
        self.profiles = profiles or DEFAULT_MODEL_PROFILES

    def get_profile(self, model_name: str) -> ModelProfile:
        """Resolve model profile by name with fallback to default."""
        clean = (model_name or "").lower().strip()
        for key, prof in self.profiles.items():
            if key in clean:
                return prof
        return self.profiles["default"]

    def estimate_tokens(self, text: str, model_name: str = "default") -> int:
        """
        Calculates estimated token count for mixed prose and LaTeX/code.
        LaTeX commands and math symbols consume more tokens per character
        due to byte-pair and subword fragmentation.
        """
        if not text:
            return 0

        profile = self.get_profile(model_name)
        text_len = len(text)

        # Count mathematical and LaTeX syntax characters
        special_count = len(self.LATEX_SPECIAL_CHARS.findall(text))
        prose_count = max(0, text_len - special_count)

        # LaTeX characters are roughly twice as dense in tokens
        estimated = (prose_count / profile.chars_per_token_prose) + (
            special_count / profile.chars_per_token_latex
        )
        return max(1, math.ceil(estimated))

    def calculate_budget(
        self,
        model_name: str,
        system_prompt: str,
        target_question_count: int = 5,
        custom_max_window: Optional[int] = None,
        custom_output_tokens: Optional[int] = None,
    ) -> TokenBudgetReport:
        """
        Partition model token allowance into system, guaranteed output, and input context.
        """
        profile = self.get_profile(model_name)
        total_window = custom_max_window or profile.max_context_window

        # Calculate guaranteed output tokens needed for target question count
        needed_output = max(
            custom_output_tokens or 0,
            target_question_count * self.ESTIMATED_TOKENS_PER_QUESTION + 400,  # 400 token safety buffer for JSON envelope
        )
        # Cap output tokens to model max
        reserved_output = min(needed_output, profile.max_output_tokens)

        system_tokens = self.estimate_tokens(system_prompt, model_name)

        # Context budget is remaining space with a 5% margin for safety
        safety_margin = int(total_window * 0.05)
        context_budget = max(200, total_window - system_tokens - reserved_output - safety_margin)

        return TokenBudgetReport(
            model_name=profile.name,
            total_context_window=total_window,
            system_tokens=system_tokens,
            reserved_output_tokens=reserved_output,
            context_budget_available=context_budget,
            actual_context_tokens=0,
            is_truncated=False,
        )

    def fit_context_text(
        self,
        raw_text: str,
        max_tokens: int,
        model_name: str = "default",
        offset_ratio: float = 0.0,
    ) -> Tuple[str, bool]:
        """
        Fit a block of raw text within a maximum token count.
        Supports offset_ratio (0.0 to 1.0) for sliding context window allocation
        across sequential examination batches to ensure wide syllabus coverage.
        Truncates gracefully at sentence boundaries with a notice.
        """
        current_tokens = self.estimate_tokens(raw_text, model_name)
        if current_tokens <= max_tokens:
            return raw_text, False

        profile = self.get_profile(model_name)
        approx_max_chars = int(max_tokens * profile.chars_per_token_prose)

        total_chars = len(raw_text)
        max_start = max(0, total_chars - approx_max_chars)
        start_char = int(max_start * min(1.0, max(0.0, offset_ratio)))

        # Find clean start boundary if starting mid-text
        if start_char > 0:
            next_boundary = raw_text.find("\n\n", start_char)
            if next_boundary != -1 and next_boundary < start_char + 500:
                start_char = next_boundary + 2

        sliced = raw_text[start_char : start_char + approx_max_chars]
        # Find last sentence boundary
        last_period = max(sliced.rfind(". "), sliced.rfind("\n\n"), sliced.rfind(".\n"))
        if last_period > len(sliced) // 2:
            clean_slice = sliced[: last_period + 1].strip()
        else:
            clean_slice = sliced.rstrip()

        prefix_notice = "[... Context excerpt begins at mid-chapter section ...]\n\n" if start_char > 0 else ""
        suffix_notice = "\n\n[... Note: Subsequent context truncated due to token budget ...]" if (start_char + approx_max_chars) < total_chars else ""

        truncated_text = f"{prefix_notice}{clean_slice}{suffix_notice}"
        return truncated_text, True

    def fit_educational_items(
        self,
        items: List[Dict[str, Any]],
        available_budget: int,
        model_name: str = "default",
    ) -> Tuple[List[Dict[str, Any]], TokenBudgetReport]:
        """
        Prioritizes high-value educational items (Formulas, Definitions, Solved Examples)
        and prunes lower-priority prose when the combined text exceeds available tokens.

        Priority Ranking:
        Tier 1 (Highest): FORMULA, DEFINITION, SOLVED_EXAMPLE
        Tier 2 (Medium): SUMMARY, EXERCISE_QUESTION, DIAGRAM
        Tier 3 (Lower): PARAGRAPH, ACTIVITY, OTHER
        """
        priority_map = {
            "FORMULA": 1,
            "DEFINITION": 1,
            "SOLVED_EXAMPLE": 1,
            "SUMMARY": 2,
            "EXERCISE_QUESTION": 2,
            "DIAGRAM": 2,
            "PARAGRAPH": 3,
            "ACTIVITY": 3,
        }

        # Tag items with their priority and estimated tokens
        tagged_items = []
        for item in items:
            itype = str(item.get("item_type", "PARAGRAPH")).upper()
            content = str(item.get("content", "") or item.get("text", ""))
            tokens = self.estimate_tokens(content, model_name)
            prio = priority_map.get(itype, 3)
            tagged_items.append({
                "item": item,
                "priority": prio,
                "tokens": tokens,
                "content": content,
            })

        total_tokens = sum(ti["tokens"] for ti in tagged_items)
        if total_tokens <= available_budget:
            report = TokenBudgetReport(
                model_name=model_name,
                total_context_window=0,
                system_tokens=0,
                reserved_output_tokens=0,
                context_budget_available=available_budget,
                actual_context_tokens=total_tokens,
                is_truncated=False,
            )
            return [ti["item"] for ti in tagged_items], report

        # Over budget: Retain items by priority order while maintaining sequence
        accepted_indices = set()
        accumulated_tokens = 0
        pruned_items = 0
        pruned_chars = 0

        # Sort candidate indices by priority first, then original order
        sorted_indices = sorted(
            range(len(tagged_items)),
            key=lambda i: (tagged_items[i]["priority"], i),
        )

        for idx in sorted_indices:
            cost = tagged_items[idx]["tokens"]
            if accumulated_tokens + cost <= available_budget:
                accepted_indices.add(idx)
                accumulated_tokens += cost
            else:
                pruned_items += 1
                pruned_chars += len(tagged_items[idx]["content"])

        # Re-sort accepted items in their original chronological order
        final_items = [tagged_items[i]["item"] for i in sorted(accepted_indices)]

        report = TokenBudgetReport(
            model_name=model_name,
            total_context_window=0,
            system_tokens=0,
            reserved_output_tokens=0,
            context_budget_available=available_budget,
            actual_context_tokens=accumulated_tokens,
            is_truncated=True,
            pruned_items_count=pruned_items,
            pruned_chars_count=pruned_chars,
        )

        return final_items, report
