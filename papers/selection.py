"""
Question selection and mark quota solver.

Implements algorithm to assemble candidate questions satisfying target_marks quota
and max_quantity constraints from a filtered question pool.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

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
