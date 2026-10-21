"""
Delivery Proctoring Analytics & Integrity Monitoring Service.

Analyzes exam sitting behaviors across students for an online delivery:
- Anomaly scoring: Tab switches, window focus loss, and fullscreen exits.
- Duration and speed anomaly detection: Flags improbably rapid test completions.
- Classroom-wide integrity risk roster for teachers and examination controllers.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.utils import timezone

from papers.models import Delivery
from .models import Attempt, AttemptStatus


@dataclass
class StudentProctoringProfile:
    """Summary of a single student's exam integrity metrics."""
    student_id: int
    student_name: str
    username: str
    roll_number: str
    warning_count: int
    risk_level: str  # "HIGH" | "MODERATE" | "CLEAN"
    duration_seconds: Optional[float]
    score: Optional[float]
    max_score: float
    flags: List[str]
    event_counts: Dict[str, int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "student_id": self.student_id,
            "student_name": self.student_name,
            "username": self.username,
            "roll_number": self.roll_number,
            "warning_count": self.warning_count,
            "risk_level": self.risk_level,
            "duration_seconds": self.duration_seconds,
            "score": self.score,
            "max_score": self.max_score,
            "flags": self.flags,
            "event_counts": self.event_counts,
        }


class ProctoringAnalyticsService:
    """
    Computes diagnostic integrity metrics and proctoring rosters for online examination deliveries.
    """

    def generate_delivery_report(self, delivery: Delivery) -> Dict[str, Any]:
        """
        Produce a comprehensive classroom proctoring report for a given delivery.
        """
        attempts = delivery.attempts.select_related("student").prefetch_related("answers")

        total_attempts = attempts.count()
        if total_attempts == 0:
            return {
                "delivery_id": delivery.id,
                "paper_title": delivery.paper_version.paper.title,
                "total_attempts": 0,
                "clean_attempts_count": 0,
                "flagged_attempts_count": 0,
                "classroom_integrity_score": 100.0,
                "anomaly_summary": {
                    "tab_switches": 0,
                    "window_blur": 0,
                    "fullscreen_exits": 0,
                    "speed_anomalies": 0,
                },
                "student_roster": [],
            }

        student_profiles: List[StudentProctoringProfile] = []
        tab_switches_total = 0
        window_blur_total = 0
        fullscreen_exits_total = 0
        speed_anomalies_total = 0

        paper_duration_sec = (delivery.paper_version.paper.duration_minutes or 60) * 60

        for att in attempts:
            flags: List[str] = []
            event_counts = {
                "tab_switch": 0,
                "window_blur": 0,
                "fullscreen_exit": 0,
                "other": 0,
            }

            logs = att.proctoring_logs if isinstance(att.proctoring_logs, list) else []
            for ev in logs:
                if isinstance(ev, dict):
                    action = str(ev.get("action") or ev.get("type", "")).lower()
                    if "tab" in action or "switch" in action:
                        event_counts["tab_switch"] += 1
                        tab_switches_total += 1
                    elif "blur" in action or "focus" in action:
                        event_counts["window_blur"] += 1
                        window_blur_total += 1
                    elif "fullscreen" in action:
                        event_counts["fullscreen_exit"] += 1
                        fullscreen_exits_total += 1
                    else:
                        event_counts["other"] += 1

            # Duration calculation
            dur_sec = None
            if att.started_at and att.submitted_at:
                dur_sec = round((att.submitted_at - att.started_at).total_seconds(), 1)
            elif att.started_at:
                dur_sec = round((timezone.now() - att.started_at).total_seconds(), 1)

            # Check speed anomaly: completed in < 10% of allowed duration with high score
            score_val = float(att.score) if att.score is not None else 0.0
            max_score_val = float(att.max_score) if att.max_score else 1.0
            pct_score = (score_val / max_score_val) * 100.0 if max_score_val > 0 else 0.0

            if dur_sec and dur_sec < max(60, paper_duration_sec * 0.12) and pct_score >= 80.0:
                flags.append("RAPID_COMPLETION_SUSPICIOUS")
                speed_anomalies_total += 1

            if att.warning_count >= 3 or event_counts["tab_switch"] >= 3:
                flags.append("FREQUENT_FOCUS_LOSS")

            if event_counts["fullscreen_exit"] >= 2:
                flags.append("PERSISTENT_FULLSCREEN_EXIT")

            # Determine risk tier
            if att.warning_count >= 3 or "RAPID_COMPLETION_SUSPICIOUS" in flags:
                risk = "HIGH"
            elif att.warning_count >= 1 or len(flags) > 0:
                risk = "MODERATE"
            else:
                risk = "CLEAN"

            student = att.student
            student_name = f"{student.first_name} {student.last_name}".strip() or student.username
            roll_number = getattr(student, "roll_number", "") or ""

            student_profiles.append(
                StudentProctoringProfile(
                    student_id=student.id,
                    student_name=student_name,
                    username=student.username,
                    roll_number=roll_number,
                    warning_count=att.warning_count,
                    risk_level=risk,
                    duration_seconds=dur_sec,
                    score=float(att.score) if att.score is not None else None,
                    max_score=max_score_val,
                    flags=flags,
                    event_counts=event_counts,
                )
            )

        clean_count = sum(1 for p in student_profiles if p.risk_level == "CLEAN")
        flagged_count = total_attempts - clean_count
        classroom_integrity = round((clean_count / total_attempts) * 100.0, 1)

        # Sort roster: HIGH risk first, then MODERATE, then CLEAN
        risk_rank = {"HIGH": 0, "MODERATE": 1, "CLEAN": 2}
        student_profiles.sort(key=lambda p: (risk_rank.get(p.risk_level, 3), -p.warning_count))

        return {
            "delivery_id": delivery.id,
            "paper_title": delivery.paper_version.paper.title,
            "total_attempts": total_attempts,
            "clean_attempts_count": clean_count,
            "flagged_attempts_count": flagged_count,
            "classroom_integrity_score": classroom_integrity,
            "anomaly_summary": {
                "tab_switches": tab_switches_total,
                "window_blur": window_blur_total,
                "fullscreen_exits": fullscreen_exits_total,
                "speed_anomalies": speed_anomalies_total,
            },
            "student_roster": [p.to_dict() for p in student_profiles],
        }
