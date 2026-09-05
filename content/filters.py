"""
Reusable question filter function.

This module is the single source of truth for filtering Questions by the
standard set of query parameters.  It is imported by:

  - ``content/views.py``         (GET /api/questions/)
  - ``papers/`` app (Prompt 4)   (paper-builder question selection)

DO NOT duplicate this logic in another app.  Import it here.

Usage::

    from content.filters import filter_questions

    qs = Question.objects.filter(is_active=True)
    qs = filter_questions(qs, request.query_params)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from django.db.models import QuerySet


def filter_questions(queryset: "QuerySet", params: dict) -> "QuerySet":
    """
    Apply combinable AND filters to a Question queryset.

    Accepted keys in ``params``
    ---------------------------
    topic_id      : int   — filter to a single topic
    difficulty    : str   — EASY | MEDIUM | HARD
    question_type : str   — MCQ | SHORT_ANSWER | LONG_ANSWER
    learner_level : str   — BEGINNER | INTERMEDIATE | ADVANCED
    marks         : float — exact match on marks value

    All filters are AND-ed together.  Unrecognised keys are silently ignored.
    Empty or missing values skip that filter (i.e. "no constraint" semantics).

    Returns
    -------
    Filtered QuerySet (unevaluated).
    """
    topic_id = params.get("topic_id")
    if topic_id:
        queryset = queryset.filter(topic_id=topic_id)

    difficulty = params.get("difficulty")
    if difficulty:
        queryset = queryset.filter(difficulty=difficulty.upper())

    question_type = params.get("question_type")
    if question_type:
        queryset = queryset.filter(question_type=question_type.upper())

    learner_level = params.get("learner_level")
    if learner_level:
        queryset = queryset.filter(learner_level=learner_level.upper())

    marks = params.get("marks")
    if marks is not None and marks != "":
        try:
            queryset = queryset.filter(marks=marks)
        except (ValueError, TypeError):
            pass  # bad value → ignore this filter rather than crash

    return queryset
