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
    diagram: Optional[Dict[str, Any]] = None

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
            "diagram": self.diagram,
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
            "diagram": self.diagram,
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
        - Section A: Multiple Choice Questions (1 mark)
        - Section B: Very Short Answer Questions (2 marks)
        - Section C: Short Answer Questions (3 marks)
        - Section D: Long Answer & Analytical Questions (4+ marks)
        Dynamic section codes (A, B, C...) and question range instructions are applied.
        """
        raw_items = version.question_snapshot or []
        if not raw_items:
            return []

        # Sort / bucket questions logically so questions of the same type/mark are grouped together
        buckets: Dict[str, Dict[str, Any]] = {
            "mcq": {
                "base_title": "Section {code} — Multiple Choice Questions",
                "items": [],
            },
            "vsa": {
                "base_title": "Section {code} — Very Short Answer Questions (2 Marks Each)",
                "items": [],
            },
            "sa": {
                "base_title": "Section {code} — Short Answer Questions (3 Marks Each)",
                "items": [],
            },
            "la": {
                "base_title": "Section {code} — Long Answer & Analytical Questions",
                "items": [],
            },
        }

        for item in raw_items:
            q_type = str(item.get("question_type", "")).upper()
            raw_marks = item.get("marks", 1.0)
            marks_val = float(raw_marks) if raw_marks is not None else 1.0

            if q_type == "MCQ" or (marks_val <= 1.0 and item.get("options")):
                buckets["mcq"]["items"].append(item)
            elif marks_val <= 2.0 and q_type != "LONG_ANSWER":
                buckets["vsa"]["items"].append(item)
            elif marks_val <= 3.5 and q_type != "LONG_ANSWER":
                buckets["sa"]["items"].append(item)
            else:
                buckets["la"]["items"].append(item)

        # Assemble active sections
        active_sections: List[ExamSection] = []
        section_codes = ["A", "B", "C", "D", "E"]
        code_idx = 0
        global_num = 1

        for key, b_info in buckets.items():
            b_items = b_info["items"]
            if not b_items:
                continue

            sec_code = section_codes[code_idx] if code_idx < len(section_codes) else chr(65 + code_idx)
            code_idx += 1

            start_q = global_num
            end_q = global_num + len(b_items) - 1

            sec_title = b_info["base_title"].format(code=sec_code)

            # Dynamic question range instructions matching formal academic standards
            if key == "mcq":
                if start_q == end_q:
                    inst = f"Question {start_q} carries 1 mark. Select the single best option."
                else:
                    inst = f"Questions {start_q} to {end_q} carry 1 mark each. All questions are compulsory. Select the single best option."
            elif key == "vsa":
                if start_q == end_q:
                    inst = f"Question {start_q} carries 2 marks. Answer concisely in 30–50 words with balanced equations/steps where applicable."
                else:
                    inst = f"Questions {start_q} to {end_q} carry 2 marks each. Answer concisely in 30–50 words with balanced equations/steps where applicable."
            elif key == "sa":
                if start_q == end_q:
                    inst = f"Question {start_q} carries 3 marks. Show step-by-step working and units where applicable."
                else:
                    inst = f"Questions {start_q} to {end_q} carry 3 marks each. Answer in 50–80 words with step-by-step working and units."
            else:
                avg_m = sum(float(it.get("marks", 5.0) or 5.0) for it in b_items) / len(b_items)
                if start_q == end_q:
                    inst = f"Question {start_q} carries {round(avg_m)} marks. Provide detailed derivations, explanations, or labelled diagrams."
                else:
                    inst = f"Questions {start_q} to {end_q} carry {round(avg_m)} marks each. Provide detailed derivations, explanations, or labelled diagrams."

            sec = ExamSection(
                section_code=sec_code,
                title=sec_title,
                instructions=inst,
                total_marks=0.0,
                questions=[],
            )

            for sec_idx, item in enumerate(b_items, start=1):
                raw_m = item.get("marks", 1.0)
                m_val = float(raw_m) if raw_m is not None else 1.0
                q_type = str(item.get("question_type", "")).upper()

                q_obj = FormattedExamQuestion(
                    section=sec_code,
                    section_question_number=sec_idx,
                    global_question_number=global_num,
                    question_id=item.get("question_id") or global_num,
                    question_text=str(item.get("question_text", "")),
                    question_type=q_type,
                    marks=m_val,
                    difficulty=str(item.get("difficulty", "MEDIUM")),
                    options=item.get("options"),
                    correct_answer=str(item.get("correct_answer", "")),
                    source_reference=str(item.get("source_reference", "")),
                    topic_name=str(item.get("topic_name", "")),
                    diagram=item.get("diagram"),
                )
                sec.questions.append(q_obj)
                sec.total_marks += m_val
                global_num += 1

            active_sections.append(sec)

        # If all questions fall into one single section, keep code clean
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
