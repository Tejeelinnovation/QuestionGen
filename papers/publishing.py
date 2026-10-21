"""
Academic Paper Publishing & Teacher Answer Key Engine.

Compiles finalized PaperVersion snapshots into structured, publication-ready examination documents:
- Pedagogical Section Grouping: Section A (MCQs), Section B (Short Answer), Section C (Long Answer).
- Student Question Paper: Academic headers, instructions box, student details block, watermark.
- Teacher Answer Key & Marking Scheme: Mirror sections with model solutions, correct choices,
  and marks breakdowns.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional

from papers.models import PaperVersion


@dataclass
class FormattedExamQuestion:
    """A formatted question ready for publication/printing."""
    section: str
    section_question_number: int
    global_question_number: int
    question_id: int
    question_text: str
    question_type: str
    marks: float
    difficulty: str
    options: Optional[Dict[str, str]] = None
    correct_answer: str = ""
    source_reference: str = ""
    topic_name: str = ""

    def to_student_dict(self) -> Dict[str, Any]:
        """Student exam paper representation (omits correct answer & marking scheme)."""
        return {
            "section": self.section,
            "section_question_number": self.section_question_number,
            "question_number": self.global_question_number,
            "question_id": self.question_id,
            "question_text": self.question_text,
            "question_type": self.question_type,
            "marks": self.marks,
            "options": self.options,
        }

    def to_teacher_dict(self) -> Dict[str, Any]:
        """Teacher answer key & solution scheme representation."""
        correct_option_text = ""
        if self.question_type == "MCQ" and self.options and self.correct_answer in self.options:
            correct_option_text = self.options[self.correct_answer]

        return {
            "section": self.section,
            "section_question_number": self.section_question_number,
            "question_number": self.global_question_number,
            "question_id": self.question_id,
            "question_text": self.question_text,
            "question_type": self.question_type,
            "marks": self.marks,
            "difficulty": self.difficulty,
            "options": self.options,
            "correct_answer": self.correct_answer,
            "correct_option_text": correct_option_text,
            "source_reference": self.source_reference,
            "topic_name": self.topic_name,
        }


@dataclass
class ExamSection:
    """A curriculum section grouping questions by pedagogical type."""
    section_code: str  # "A" | "B" | "C"
    title: str
    instructions: str
    total_marks: float = 0.0
    questions: List[FormattedExamQuestion] = field(default_factory=list)

    def to_student_dict(self) -> Dict[str, Any]:
        return {
            "section_code": self.section_code,
            "title": self.title,
            "instructions": self.instructions,
            "total_marks": round(self.total_marks, 2),
            "question_count": len(self.questions),
            "questions": [q.to_student_dict() for q in self.questions],
        }

    def to_teacher_dict(self) -> Dict[str, Any]:
        return {
            "section_code": self.section_code,
            "title": self.title,
            "instructions": self.instructions,
            "total_marks": round(self.total_marks, 2),
            "question_count": len(self.questions),
            "questions": [q.to_teacher_dict() for q in self.questions],
        }


class PaperPublishingService:
    """
    Transforms an immutable PaperVersion question snapshot into publication-grade
    student question papers and synchronized teacher answer keys.
    """

    def compile_sections(self, version: PaperVersion) -> List[ExamSection]:
        """
        Group the version's question snapshot into standard academic exam sections:
        - Section A: Multiple Choice Questions (Objective)
        - Section B: Short Answer Questions (2-3 marks)
        - Section C: Long Answer Questions (4+ marks)
        """
        raw_items = version.question_snapshot or []

        sec_a = ExamSection(
            section_code="A",
            title="Section A — Multiple Choice Questions",
            instructions="All questions are compulsory. Choose the single best option.",
        )
        sec_b = ExamSection(
            section_code="B",
            title="Section B — Short Answer Questions",
            instructions="Answer all questions with necessary steps and formulas.",
        )
        sec_c = ExamSection(
            section_code="C",
            title="Section C — Long Answer & Analytical Questions",
            instructions="Provide detailed derivations, explanations, or step-by-step calculations.",
        )

        global_num = 1
        for item in raw_items:
            q_type = str(item.get("question_type", "")).upper()
            raw_marks = item.get("marks", 1.0)
            marks_val = float(raw_marks) if raw_marks is not None else 1.0

            if q_type == "MCQ":
                target_sec = sec_a
            elif q_type == "SHORT_ANSWER" or marks_val <= 3.0:
                target_sec = sec_b
            else:
                target_sec = sec_c

            q_obj = FormattedExamQuestion(
                section=target_sec.section_code,
                section_question_number=len(target_sec.questions) + 1,
                global_question_number=global_num,
                question_id=item.get("question_id") or global_num,
                question_text=str(item.get("question_text", "")),
                question_type=q_type,
                marks=marks_val,
                difficulty=str(item.get("difficulty", "MEDIUM")),
                options=item.get("options"),
                correct_answer=str(item.get("correct_answer", "")),
                source_reference=str(item.get("source_reference", "")),
                topic_name=str(item.get("topic_name", "")),
            )
            target_sec.questions.append(q_obj)
            target_sec.total_marks += marks_val
            global_num += 1

        # Return only sections that contain at least one question
        active_sections = [s for s in [sec_a, sec_b, sec_c] if len(s.questions) > 0]

        # If all questions fall in one section, re-label as general section
        if len(active_sections) == 1 and active_sections[0].section_code != "A":
            active_sections[0].title = "Questions"

        return active_sections

    def generate_student_exam_paper(self, version: PaperVersion) -> Dict[str, Any]:
        """
        Generate publication-ready student exam paper layout.
        """
        paper = version.paper
        school_name = paper.school.name if paper.school else "Academic Examination Board"
        sections = self.compile_sections(version)

        total_marks = float(version.total_marks) if version.total_marks else sum(s.total_marks for s in sections)

        return {
            "document_type": "STUDENT_QUESTION_PAPER",
            "paper_id": paper.id,
            "version_id": version.id,
            "version_label": version.version_label,
            "school_name": school_name,
            "title": paper.title,
            "subjects": paper.subjects,
            "duration_minutes": paper.duration_minutes,
            "total_marks": total_marks,
            "total_questions": sum(len(s.questions) for s in sections),
            "general_instructions": paper.instructions or "Read all questions carefully before attempting.",
            "watermark": school_name.upper(),
            "student_metadata_fields": [
                {"label": "Student Name", "blank_line": True},
                {"label": "Roll / GR Number", "blank_line": True},
                {"label": "Date of Examination", "blank_line": True},
                {"label": "Class & Section", "blank_line": True},
            ],
            "sections": [s.to_student_dict() for s in sections],
        }

    def generate_teacher_answer_key(self, version: PaperVersion) -> Dict[str, Any]:
        """
        Generate synchronized teacher answer key, model solutions, and marking scheme.
        """
        paper = version.paper
        school_name = paper.school.name if paper.school else "Academic Examination Board"
        sections = self.compile_sections(version)
        total_marks = float(version.total_marks) if version.total_marks else sum(s.total_marks for s in sections)

        return {
            "document_type": "TEACHER_ANSWER_KEY",
            "paper_id": paper.id,
            "version_id": version.id,
            "version_label": version.version_label,
            "school_name": school_name,
            "title": f"Answer Key & Marking Scheme: {paper.title}",
            "subjects": paper.subjects,
            "duration_minutes": paper.duration_minutes,
            "total_marks": total_marks,
            "total_questions": sum(len(s.questions) for s in sections),
            "watermark": "TEACHER CONFIDENTIAL",
            "sections": [s.to_teacher_dict() for s in sections],
        }
