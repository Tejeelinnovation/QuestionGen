"""
Intelligent Assessment Auto-Evaluation and Scoring Engine.

Features:
- Robust MCQ Grading: Matches choice letter (A/B/C/D) or choice text string against options.
- Numerical Tolerance Grading: Auto-evaluates numerical and physics/math calculations
  with configurable relative and absolute error tolerance (e.g. ±1%).
- Negative Marking Support: Configurable penalty deduction for incorrect objective responses.
- Short Answer Canonical Matching: Case-insensitive normalized phrase matching for 1-3 word answers.
- Pedagogical Feedback: Injects evaluation rationale into answer results.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple


@dataclass
class GradingResult:
    """Outcome of automated answer grading."""
    is_correct: Optional[bool]
    marks_awarded: Optional[Decimal]
    feedback: str = ""
    matched_rule: str = "MANUAL_PENDING"  # "MCQ_LETTER" | "MCQ_TEXT" | "NUMERICAL" | "CANONICAL_TEXT" | "MANUAL_PENDING"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_correct": self.is_correct,
            "marks_awarded": float(self.marks_awarded) if self.marks_awarded is not None else None,
            "feedback": self.feedback,
            "matched_rule": self.matched_rule,
        }


class ExamEvaluationEngine:
    """
    Evaluates student exam responses against question snapshots with tolerance and negative marking.
    """

    NUMERICAL_REGEX = re.compile(r"[-+]?(?:\d*\.\d+|\d+)")

    def __init__(
        self,
        default_numerical_rel_tol: float = 0.015,
        default_numerical_abs_tol: float = 0.05,
    ):
        self.rel_tol = default_numerical_rel_tol
        self.abs_tol = default_numerical_abs_tol

    def evaluate_answer(
        self,
        question_snapshot: Dict[str, Any],
        student_response: str,
        negative_marking_penalty: float = 0.0,
    ) -> GradingResult:
        """
        Evaluate a student response against question snapshot specifications.
        """
        q_type = str(question_snapshot.get("question_type", "")).upper()
        raw_marks = question_snapshot.get("marks", 1.0)
        max_marks = Decimal(str(raw_marks)) if raw_marks is not None else Decimal("1.0")
        correct_answer = str(question_snapshot.get("correct_answer", "")).strip()
        response_clean = (student_response or "").strip()

        # Unanswered question
        if not response_clean:
            if q_type == "MCQ":
                return GradingResult(
                    is_correct=False,
                    marks_awarded=Decimal("0.00"),
                    feedback="Unanswered",
                    matched_rule="UNANSWERED",
                )
            return GradingResult(
                is_correct=None,
                marks_awarded=None,
                feedback="Pending teacher evaluation",
                matched_rule="MANUAL_PENDING",
            )

        # 1. Multiple Choice Questions (MCQ)
        if q_type == "MCQ":
            return self._evaluate_mcq(
                question_snapshot=question_snapshot,
                student_response=response_clean,
                max_marks=max_marks,
                penalty=negative_marking_penalty,
            )

        # 2. Short Answer Questions (Check for numerical or canonical phrase)
        if q_type == "SHORT_ANSWER":
            # Check if correct answer is numerical
            num_result = self._try_numerical_evaluation(correct_answer, response_clean, max_marks)
            if num_result is not None:
                return num_result

            # Check if canonical exact phrase match
            text_result = self._try_canonical_text_evaluation(correct_answer, response_clean, max_marks)
            if text_result is not None:
                return text_result

            # Ambiguous/long short answer -> Teacher review required
            return GradingResult(
                is_correct=None,
                marks_awarded=None,
                feedback="Pending teacher evaluation",
                matched_rule="MANUAL_PENDING",
            )

        # 3. Long Answer Questions -> Always teacher rubric review
        return GradingResult(
            is_correct=None,
            marks_awarded=None,
            feedback="Subjective question pending teacher manual grading",
            matched_rule="MANUAL_PENDING",
        )

    def _evaluate_mcq(
        self,
        question_snapshot: Dict[str, Any],
        student_response: str,
        max_marks: Decimal,
        penalty: float = 0.0,
    ) -> GradingResult:
        """
        Evaluate MCQ choices supporting both choice key (e.g. 'A') and choice text.
        """
        options: Dict[str, str] = question_snapshot.get("options") or {}
        correct_raw = str(question_snapshot.get("correct_answer", "")).strip()

        student_norm = student_response.strip().upper()
        correct_norm = correct_raw.upper()

        # Step A: Direct Key Match (e.g. 'B' == 'B')
        if student_norm == correct_norm:
            return GradingResult(
                is_correct=True,
                marks_awarded=max_marks,
                feedback="Correct choice selected",
                matched_rule="MCQ_LETTER",
            )

        # Step B: Text match against the correct option's body text
        # Find which key corresponds to correct_raw if correct_raw was a key
        correct_text = ""
        if correct_raw in options:
            correct_text = str(options[correct_raw]).strip().lower()
        elif correct_norm in options:
            correct_text = str(options[correct_norm]).strip().lower()

        # Check if student submitted full text matching the correct choice
        if correct_text and student_response.strip().lower() == correct_text:
            return GradingResult(
                is_correct=True,
                marks_awarded=max_marks,
                feedback="Correct option text matched",
                matched_rule="MCQ_TEXT",
            )

        # Step C: If correct_raw was the text itself, check if student submitted the key pointing to it
        if not correct_text:
            for opt_key, opt_val in options.items():
                if str(opt_val).strip().lower() == correct_raw.lower():
                    if student_norm == opt_key.upper():
                        return GradingResult(
                            is_correct=True,
                            marks_awarded=max_marks,
                            feedback="Correct option key matched",
                            matched_rule="MCQ_KEY_FROM_TEXT",
                        )

        # Incorrect MCQ
        deduction = Decimal(str(abs(penalty))) if penalty > 0 else Decimal("0.00")
        awarded = Decimal("0.00") if penalty <= 0 else -deduction

        return GradingResult(
            is_correct=False,
            marks_awarded=awarded,
            feedback=f"Incorrect choice. Expected '{correct_raw}'" + (f" (-{deduction} penalty applied)" if penalty > 0 else ""),
            matched_rule="MCQ_INCORRECT",
        )

    def _try_numerical_evaluation(
        self,
        correct_str: str,
        student_str: str,
        max_marks: Decimal,
    ) -> Optional[GradingResult]:
        """
        Attempt to extract and compare floating-point numbers with tolerance.
        """
        # Find number in correct_str
        correct_matches = self.NUMERICAL_REGEX.findall(correct_str.replace(",", ""))
        student_matches = self.NUMERICAL_REGEX.findall(student_str.replace(",", ""))

        if not correct_matches or not student_matches:
            return None

        # If correct answer is solely or predominantly a single number
        try:
            expected_val = float(correct_matches[0])
            actual_val = float(student_matches[0])
        except (ValueError, IndexError):
            return None

        # Check closeness
        if math.isclose(expected_val, actual_val, rel_tol=self.rel_tol, abs_tol=self.abs_tol):
            return GradingResult(
                is_correct=True,
                marks_awarded=max_marks,
                feedback=f"Correct numerical solution: {actual_val}",
                matched_rule="NUMERICAL",
            )

        # If student answer has an obvious different number
        if len(student_matches) == 1 and len(correct_matches) == 1:
            return GradingResult(
                is_correct=False,
                marks_awarded=Decimal("0.00"),
                feedback=f"Numerical mismatch. Expected {expected_val}, got {actual_val}",
                matched_rule="NUMERICAL_INCORRECT",
            )

        return None

    def _try_canonical_text_evaluation(
        self,
        correct_str: str,
        student_str: str,
        max_marks: Decimal,
    ) -> Optional[GradingResult]:
        """
        Case-insensitive normalized comparison for concise 1-3 word canonical answers.
        """
        norm_correct = re.sub(r"[^\w\s]", "", correct_str.lower()).strip()
        norm_student = re.sub(r"[^\w\s]", "", student_str.lower()).strip()

        words_correct = norm_correct.split()
        if not (1 <= len(words_correct) <= 3):
            return None

        if norm_correct == norm_student:
            return GradingResult(
                is_correct=True,
                marks_awarded=max_marks,
                feedback="Exact canonical answer matched",
                matched_rule="CANONICAL_TEXT",
            )

        return None
