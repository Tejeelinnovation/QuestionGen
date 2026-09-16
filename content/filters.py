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


from django.db.models import Case, IntegerField, Q, Value, When


def filter_questions(queryset: "QuerySet", params: dict) -> "QuerySet":
    """
    Apply combinable AND filters to a Question queryset.

    Accepted keys in ``params``
    ---------------------------
    topic_id      : int   — filter to a single topic
    board         : str   — filter by curriculum board (e.g. CBSE, ICSE)
    difficulty    : str   — EASY | MEDIUM | HARD
    question_type : str   — MCQ | SHORT_ANSWER | LONG_ANSWER etc.
    learner_level : str   — BEGINNER | INTERMEDIATE | ADVANCED
    marks         : float — exact match on marks value
    search / q    : str   — text search across question, topic, chapter, book
    ordering/sort : str   — sort key (newest, oldest, marks_desc, marks_asc,
                            difficulty_asc, difficulty_desc, text_asc)

    All filters are AND-ed together. Unrecognised keys are silently ignored.
    Empty, missing, or "ALL" values skip that filter.

    Returns
    -------
    Filtered QuerySet (unevaluated).
    """
    topic_ids = params.get("topic_ids")
    if topic_ids:
        if isinstance(topic_ids, str):
            topic_ids = [int(tid.strip()) for tid in topic_ids.split(",") if tid.strip().isdigit()]
        if isinstance(topic_ids, (list, tuple, set)):
            queryset = queryset.filter(Q(topics__id__in=topic_ids) | Q(topic_id__in=topic_ids)).distinct()
    elif params.get("topic_id"):
        t_id = params.get("topic_id")
        queryset = queryset.filter(Q(topics__id=t_id) | Q(topic_id=t_id)).distinct()

    validation_status = params.get("validation_status")
    if validation_status and validation_status.upper() != "ALL":
        queryset = queryset.filter(validation_status=validation_status.upper())

    board = params.get("board")
    if board and board.upper() != "ALL":
        queryset = queryset.filter(topic__chapter__book__board__iexact=board)

    difficulty = params.get("difficulty")
    if difficulty and difficulty.upper() != "ALL":
        queryset = queryset.filter(difficulty=difficulty.upper())

    question_type = params.get("question_type")
    if question_type and question_type.upper() != "ALL":
        queryset = queryset.filter(question_type=question_type.upper())

    learner_level = params.get("learner_level")
    if learner_level and learner_level.upper() != "ALL":
        queryset = queryset.filter(learner_level=learner_level.upper())

    marks = params.get("marks")
    if marks is not None and marks != "":
        try:
            queryset = queryset.filter(marks=marks)
        except (ValueError, TypeError):
            pass  # bad value → ignore this filter rather than crash

    search = params.get("search") or params.get("q")
    if search and search.strip():
        s = search.strip()
        queryset = queryset.filter(
            Q(question_text__icontains=s)
            | Q(topic__name__icontains=s)
            | Q(topic__chapter__title__icontains=s)
            | Q(topic__chapter__book__title__icontains=s)
        )

    # Ordering / Sorting
    ordering = params.get("ordering") or params.get("sort")
    if ordering:
        sort_key = ordering.strip().lower()
        if sort_key in ("newest", "-created_at"):
            queryset = queryset.order_by("-created_at", "-id")
        elif sort_key in ("oldest", "created_at"):
            queryset = queryset.order_by("created_at", "id")
        elif sort_key in ("marks_desc", "-marks"):
            queryset = queryset.order_by("-marks", "-created_at", "-id")
        elif sort_key in ("marks_asc", "marks"):
            queryset = queryset.order_by("marks", "-created_at", "-id")
        elif sort_key in ("difficulty_asc",):
            queryset = queryset.annotate(
                diff_weight=Case(
                    When(difficulty="EASY", then=Value(1)),
                    When(difficulty="MEDIUM", then=Value(2)),
                    When(difficulty="HARD", then=Value(3)),
                    default=Value(2),
                    output_field=IntegerField(),
                )
            ).order_by("diff_weight", "-created_at", "-id")
        elif sort_key in ("difficulty_desc",):
            queryset = queryset.annotate(
                diff_weight=Case(
                    When(difficulty="HARD", then=Value(1)),
                    When(difficulty="MEDIUM", then=Value(2)),
                    When(difficulty="EASY", then=Value(3)),
                    default=Value(2),
                    output_field=IntegerField(),
                )
            ).order_by("diff_weight", "-created_at", "-id")
        elif sort_key in ("text_asc", "question_text"):
            queryset = queryset.order_by("question_text", "-id")
        else:
            queryset = queryset.order_by("-created_at", "-id")
    else:
        queryset = queryset.order_by("-created_at", "-id")

    return queryset
