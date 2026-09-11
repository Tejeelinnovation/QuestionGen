"""
Question selection and mark quota solver.

Implements algorithm to assemble candidate questions satisfying target_marks quota
and max_quantity constraints from a filtered question pool.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from content.models import Question


def select_questions_for_quota(
    questions: list[Question],
    target_marks: float | None = None,
    max_quantity: int | None = None,
) -> tuple[list[Question], str | None]:
    """
    Select candidate questions from a filtered question pool satisfying target_marks
    quota and max_quantity constraints.

    Returns:
        tuple (selected_questions, error_message)
        If error_message is not None, selection could not be satisfied.
    """
    if not questions:
        return [], None

    # If no target_marks specified, just apply max_quantity if given
    if target_marks is None or target_marks <= 0:
        if max_quantity is not None and max_quantity > 0:
            return questions[:max_quantity], None
        return questions, None

    # target_marks is requested
    target_units = int(round(float(target_marks) * 2))
    pool_units = sum(int(round(float(q.marks) * 2)) for q in questions)
    target_display = int(target_marks) if float(target_marks).is_integer() else target_marks

    if pool_units < target_units:
        pool_marks = pool_units / 2.0
        pool_marks_display = int(pool_marks) if pool_marks.is_integer() else pool_marks
        return [], (
            f"The matching question pool only contains {len(questions)} questions worth "
            f"{pool_marks_display} marks, which cannot meet your target of {target_display} marks. "
            f"Please reduce the target total marks or broaden your criteria."
        )

    # Group and interleave questions across topics to ensure balanced syllabus coverage
    topics: dict[int, list[Question]] = {}
    for q in questions:
        topics.setdefault(q.topic_id, []).append(q)

    interleaved: list[Question] = []
    max_len = max(len(v) for v in topics.values()) if topics else 0
    for i in range(max_len):
        for t_qs in topics.values():
            if i < len(t_qs):
                interleaved.append(t_qs[i])

    # DP knapsack: map accumulated units -> list of selected questions
    # Prioritize minimal question count to leave headroom for max_quantity
    dp: dict[int, list[Question]] = {0: []}
    for q in interleaved:
        q_units = int(round(float(q.marks) * 2))
        new_dp = dict(dp)
        for s_val, s_items in dp.items():
            nxt = s_val + q_units
            if nxt <= target_units:
                if max_quantity is not None and max_quantity > 0 and len(s_items) + 1 > max_quantity:
                    continue
                if nxt not in new_dp or len(s_items) + 1 < len(new_dp[nxt]):
                    new_dp[nxt] = s_items + [q]
        dp = new_dp

    if target_units in dp:
        selected = dp[target_units]
        # Sort deterministically by topic_id, difficulty, id
        selected.sort(key=lambda x: (x.topic_id, x.difficulty, x.id))
        return selected, None

    # If target_units not reached, check if it was prevented by max_quantity
    if max_quantity is not None and max_quantity > 0:
        dp_no_cap: dict[int, list[Question]] = {0: []}
        for q in interleaved:
            q_units = int(round(float(q.marks) * 2))
            new_dp = dict(dp_no_cap)
            for s_val, s_items in dp_no_cap.items():
                nxt = s_val + q_units
                if nxt <= target_units:
                    if nxt not in new_dp or len(s_items) + 1 < len(new_dp[nxt]):
                        new_dp[nxt] = s_items + [q]
            dp_no_cap = new_dp
        if target_units in dp_no_cap:
            min_needed = len(dp_no_cap[target_units])
            return [], (
                f"Assembling {target_display} marks requires at least {min_needed} questions, "
                f"but max quantity is capped at {max_quantity}. "
                f"Please increase max quantity or reduce target marks."
            )

    # Could not form exact target
    achievable = sorted(dp.keys())
    if achievable:
        closest = min(achievable, key=lambda x: abs(x - target_units))
        closest_marks = closest / 2.0
        closest_display = int(closest_marks) if closest_marks.is_integer() else closest_marks
        return [], (
            f"Cannot assemble questions to total exactly {target_display} marks from the matching pool. "
            f"The closest possible total is {closest_display} marks."
        )

    return [], (
        f"Cannot assemble questions to meet {target_display} marks with the selected constraints."
    )


def select_questions_for_specification(
    pool: list[Question],
    spec: dict[str, Any],
) -> tuple[list[Question], str | None]:
    """
    Select candidate questions satisfying a blueprint specification.
    Supports:
    - Multi-subject breakdown (e.g. Physics, Chemistry, Math marks/counts quotas, AC-17)
    - Difficulty distribution (e.g. Easy/Medium/Hard percentages or counts)
    - Fallback to total marks & max quantity knapsack solver (AC-18)
    """
    if not pool:
        return [], None

    # 1. Multi-Subject Breakdown (AC-17)
    subject_breakdown = spec.get("subject_breakdown")
    if subject_breakdown and isinstance(subject_breakdown, list):
        # Group pool by subject
        by_subject: dict[str, list[Question]] = {}
        for q in pool:
            subj = ""
            if hasattr(q, "topic") and q.topic and hasattr(q.topic, "chapter") and q.topic.chapter:
                if hasattr(q.topic.chapter, "book") and q.topic.chapter.book:
                    subj = q.topic.chapter.book.subject
                if not subj:
                    subj = q.topic.chapter.title
            subj_key = subj.strip().lower() if subj else "general"
            by_subject.setdefault(subj_key, []).append(q)

        all_selected: list[Question] = []
        for s_spec in subject_breakdown:
            target_subj = (s_spec.get("subject") or "").strip().lower()
            s_marks = s_spec.get("marks")
            s_count = s_spec.get("count") or s_spec.get("quantity")

            # Match candidates for this subject
            s_pool = by_subject.get(target_subj, [])
            if not s_pool:
                # Try partial matching
                for k, v in by_subject.items():
                    if target_subj in k or k in target_subj:
                        s_pool = v
                        break

            if not s_pool:
                return [], f"No questions available in question bank for subject '{s_spec.get('subject')}'."

            selected_subj, err = select_questions_for_quota(
                s_pool,
                target_marks=float(s_marks) if s_marks is not None else None,
                max_quantity=int(s_count) if s_count is not None else None,
            )
            if err:
                return [], f"[{s_spec.get('subject')}] {err}"
            all_selected.extend(selected_subj)

        all_selected.sort(key=lambda x: (x.topic_id, x.difficulty, x.id))
        return all_selected, None

    # 2. Difficulty Distribution
    diff_dist = spec.get("difficulty_distribution")
    if diff_dist and isinstance(diff_dist, dict):
        total_target_count = spec.get("total_question_count") or spec.get("quantity")
        by_diff: dict[str, list[Question]] = {}
        for q in pool:
            by_diff.setdefault(q.difficulty, []).append(q)

        all_selected = []
        # Check if values are percentages (sum ~= 100) or explicit counts
        vals = [float(v) for v in diff_dist.values() if v]
        is_percentage = sum(vals) <= 100 and any(v > 10 for v in vals) and total_target_count

        for diff, quota in diff_dist.items():
            diff_upper = diff.upper()
            d_pool = by_diff.get(diff_upper, [])
            if is_percentage and total_target_count:
                count_needed = int(round(float(total_target_count) * (float(quota) / 100.0)))
            else:
                count_needed = int(quota)

            if count_needed > 0:
                if len(d_pool) < count_needed:
                    return [], (
                        f"Requested {count_needed} {diff_upper} questions, but only {len(d_pool)} are available."
                    )
                all_selected.extend(d_pool[:count_needed])

        if all_selected:
            all_selected.sort(key=lambda x: (x.topic_id, x.difficulty, x.id))
            return all_selected, None

    # 3. Standard Marks / Quantity Quota (AC-18)
    target_marks = spec.get("total_marks")
    max_quantity = spec.get("total_question_count") or spec.get("quantity")
    if target_marks is not None or max_quantity is not None:
        return select_questions_for_quota(
            pool,
            target_marks=float(target_marks) if target_marks is not None else None,
            max_quantity=int(max_quantity) if max_quantity is not None else None,
        )

    return pool, None

