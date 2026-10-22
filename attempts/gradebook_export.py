"""
Classroom Gradebook Export Service.
Generates institutional, formatted Microsoft Excel (.xlsx) workbooks
for full delivery marks rosters with student details, separate MCQ and
descriptive score breakdowns, class performance statistics, and configurable sorting.
"""

from __future__ import annotations

import io
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from django.utils import timezone


def compute_grade(percentage: Optional[float]) -> str:
    """Returns CBSE/ICSE standard grade band based on percentage."""
    if percentage is None:
        return "—"
    if percentage >= 90.0:
        return "A+"
    if percentage >= 80.0:
        return "A"
    if percentage >= 70.0:
        return "B+"
    if percentage >= 60.0:
        return "B"
    if percentage >= 50.0:
        return "C"
    if percentage >= 33.0:
        return "D"
    return "F"


class GradebookExcelExportService:
    """
    Exports a Delivery's student roster into a formatted .xlsx gradebook spreadsheet.
    """

    # Color Palette Tokens
    COLOR_PRIMARY_HEADER = "1E3A2F"      # Deep Forest Green
    COLOR_TABLE_HEADER = "0F172A"        # Deep Slate 900
    COLOR_META_BG = "F1F5F9"             # Slate 100
    COLOR_CARD_BG = "F8FAFC"             # Slate 50
    COLOR_ZEBRA_ROW = "F8FAFC"           # Subtle alternating row
    COLOR_BORDER = "CBD5E1"              # Slate 300
    COLOR_BORDER_DARK = "64748B"         # Slate 500

    def __init__(self, delivery: Any, sort_by: str = "roll_number"):
        self.delivery = delivery
        self.sort_by = (sort_by or "roll_number").lower()

    def generate(self) -> bytes:
        wb = Workbook()
        ws = wb.active
        ws.title = "Gradebook"
        ws.views.sheetView[0].showGridLines = True

        # Extract Exam & Question Metadata
        paper_version = self.delivery.paper_version
        paper = paper_version.paper
        school = getattr(paper, "school", None) or getattr(self.delivery.target_class, "school", None)
        school_name = school.name if school else "INSTITUTIONAL EXAMINATION SYSTEM"

        snapshot = paper_version.question_snapshot or []
        total_mcq_max = sum(
            float(q.get("marks", 0))
            for q in snapshot
            if str(q.get("question_type", "")).upper() == "MCQ"
        )
        total_desc_max = sum(
            float(q.get("marks", 0))
            for q in snapshot
            if str(q.get("question_type", "")).upper() != "MCQ"
        )
        total_paper_max = float(paper_version.total_marks) or (total_mcq_max + total_desc_max)

        # Build Student Rows with full roster coverage
        student_records = self._build_student_records(
            snapshot=snapshot,
            total_mcq_max=total_mcq_max,
            total_desc_max=total_desc_max,
            total_paper_max=total_paper_max,
        )

        # Sort Records
        sorted_records = self._sort_records(student_records)

        # Compute Summary Statistics
        stats = self._compute_statistics(sorted_records, total_paper_max)

        # ── 1. RENDER TITLE BANNER ──
        ws.merge_cells("A1:L1")
        title_cell = ws["A1"]
        title_cell.value = f"{school_name.upper()} — OFFICIAL EXAMINATION GRADEBOOK"
        title_cell.font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
        title_cell.fill = PatternFill(start_color=self.COLOR_PRIMARY_HEADER, end_color=self.COLOR_PRIMARY_HEADER, fill_type="solid")
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 32

        # ── 2. METADATA CARDS (Rows 2 to 4) ──
        class_name = self.delivery.target_class.name if self.delivery.target_class else "All Assigned Divisions"
        subjects_str = " • ".join(paper.subjects) if hasattr(paper, "subjects") and paper.subjects else getattr(paper, "subject", "General")
        instructor_name = (
            self.delivery.created_by.get_full_name()
            if self.delivery.created_by and self.delivery.created_by.get_full_name()
            else (self.delivery.created_by.username if self.delivery.created_by else "Faculty")
        )
        now_str = timezone.now().strftime("%d %b %Y, %I:%M %p")

        meta_rows = [
            ("Exam Title:", f"{paper.title} (Version {paper_version.version_label})", "Target Class:", class_name),
            ("Subject:", subjects_str, "Maximum Marks:", f"{total_paper_max:g} Marks (MCQ: {total_mcq_max:g} | Descriptive: {total_desc_max:g})"),
            ("Instructor:", instructor_name, "Exported On:", now_str),
        ]

        bold_label_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
        value_font = Font(name="Calibri", size=10, color="0F172A")

        for r_idx, (l1, v1, l2, v2) in enumerate(meta_rows, start=2):
            ws.row_dimensions[r_idx].height = 20
            # Left block
            ws.cell(row=r_idx, column=1, value=l1).font = bold_label_font
            ws.merge_cells(start_row=r_idx, start_column=2, end_row=r_idx, end_column=5)
            val1_cell = ws.cell(row=r_idx, column=2, value=v1)
            val1_cell.font = value_font

            # Right block
            ws.cell(row=r_idx, column=7, value=l2).font = bold_label_font
            ws.merge_cells(start_row=r_idx, start_column=8, end_row=r_idx, end_column=12)
            val2_cell = ws.cell(row=r_idx, column=8, value=v2)
            val2_cell.font = value_font

        # ── 3. PERFORMANCE STATS CARDS (Rows 6 & 7) ──
        ws.row_dimensions[6].height = 18
        ws.row_dimensions[7].height = 24

        stat_boxes = [
            ("TOTAL ASSIGNED", str(stats["total_assigned"]), 1, 2),
            ("APPEARED / SITTED", str(stats["appeared"]), 3, 4),
            ("ABSENT", str(stats["absent"]), 5, 6),
            ("CLASS AVERAGE", f"{stats['class_avg_pct']:.1f}%", 7, 8),
            ("HIGHEST SCORE", f"{stats['highest_score']:.1f}", 9, 10),
            ("PASS PERCENTAGE", f"{stats['pass_pct']:.1f}%", 11, 12),
        ]

        box_label_font = Font(name="Calibri", size=9, bold=True, color="64748B")
        box_val_font = Font(name="Calibri", size=12, bold=True, color=self.COLOR_PRIMARY_HEADER)
        box_fill = PatternFill(start_color=self.COLOR_CARD_BG, end_color=self.COLOR_CARD_BG, fill_type="solid")
        box_border = Border(
            top=Side(style="thin", color=self.COLOR_BORDER),
            bottom=Side(style="thin", color=self.COLOR_BORDER),
            left=Side(style="thin", color=self.COLOR_BORDER),
            right=Side(style="thin", color=self.COLOR_BORDER),
        )

        for label, val_str, c_start, c_end in stat_boxes:
            ws.merge_cells(start_row=6, start_column=c_start, end_row=6, end_column=c_end)
            lbl_cell = ws.cell(row=6, column=c_start, value=label)
            lbl_cell.font = box_label_font
            lbl_cell.fill = box_fill
            lbl_cell.alignment = Alignment(horizontal="center", vertical="center")

            ws.merge_cells(start_row=7, start_column=c_start, end_row=7, end_column=c_end)
            val_cell = ws.cell(row=7, column=c_start, value=val_str)
            val_cell.font = box_val_font
            val_cell.fill = box_fill
            val_cell.alignment = Alignment(horizontal="center", vertical="center")

            for r in (6, 7):
                for c in range(c_start, c_end + 1):
                    ws.cell(row=r, column=c).border = box_border

        # ── 4. TABLE HEADERS (Row 9) ──
        headers = [
            ("S.No.", 8, "center"),
            ("Roll No.", 12, "center"),
            ("GR / Reg No.", 15, "center"),
            ("Student Name", 24, "left"),
            ("Status", 14, "center"),
            (f"MCQ Marks ({total_mcq_max:g})", 15, "right"),
            (f"Descriptive ({total_desc_max:g})", 15, "right"),
            (f"Total Marks ({total_paper_max:g})", 15, "right"),
            ("Max Marks", 12, "right"),
            ("Percentage", 12, "right"),
            ("Grade", 10, "center"),
            ("Remarks / Notes", 24, "left"),
        ]

        ws.row_dimensions[9].height = 26
        header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color=self.COLOR_TABLE_HEADER, end_color=self.COLOR_TABLE_HEADER, fill_type="solid")
        thin_cell_border = Border(
            left=Side(style="thin", color=self.COLOR_BORDER),
            right=Side(style="thin", color=self.COLOR_BORDER),
            top=Side(style="thin", color=self.COLOR_BORDER),
            bottom=Side(style="thin", color=self.COLOR_BORDER),
        )

        for col_idx, (h_title, _, h_align) in enumerate(headers, start=1):
            cell = ws.cell(row=9, column=col_idx, value=h_title)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal=h_align, vertical="center", wrap_text=True)
            cell.border = thin_cell_border

        # ── 5. DATA ROWS ──
        row_font = Font(name="Calibri", size=10, color="0F172A")
        zebra_fill = PatternFill(start_color=self.COLOR_ZEBRA_ROW, end_color=self.COLOR_ZEBRA_ROW, fill_type="solid")
        white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")

        current_row = 10
        for s_idx, rec in enumerate(sorted_records, start=1):
            ws.row_dimensions[current_row].height = 20
            is_zebra = (s_idx % 2 == 0)
            c_fill = zebra_fill if is_zebra else white_fill

            pct_val = (rec["percentage"] / 100.0) if rec["percentage"] is not None else None

            row_values = [
                (s_idx, "center", "@"),
                (rec["roll_number"] or "—", "center", "@"),
                (rec["gr_number"] or "—", "center", "@"),
                (rec["full_name"], "left", "@"),
                (rec["status_label"], "center", "@"),
                (rec["mcq_marks"], "right", "0.00" if rec["mcq_marks"] is not None else "@"),
                (rec["desc_marks"], "right", "0.00" if rec["desc_marks"] is not None else "@"),
                (rec["total_marks"], "right", "0.00" if rec["total_marks"] is not None else "@"),
                (total_paper_max, "right", "0.00"),
                (pct_val, "right", "0.0%" if pct_val is not None else "@"),
                (rec["grade"], "center", "@"),
                (rec["remarks"], "left", "@"),
            ]

            for col_idx, (v, h_align, num_fmt) in enumerate(row_values, start=1):
                cell = ws.cell(row=current_row, column=col_idx)
                cell.value = "—" if v is None else v
                cell.font = row_font
                cell.fill = c_fill
                cell.border = thin_cell_border
                cell.alignment = Alignment(horizontal=h_align, vertical="center")
                if v is not None and num_fmt != "@":
                    cell.number_format = num_fmt

            current_row += 1

        # ── 6. SUMMARY FOOTER ROW ──
        ws.row_dimensions[current_row].height = 22
        footer_border = Border(
            top=Side(style="thin", color=self.COLOR_BORDER_DARK),
            bottom=Side(style="double", color=self.COLOR_TABLE_HEADER),
            left=Side(style="thin", color=self.COLOR_BORDER),
            right=Side(style="thin", color=self.COLOR_BORDER),
        )
        footer_font = Font(name="Calibri", size=10, bold=True, color=self.COLOR_TABLE_HEADER)
        footer_fill = PatternFill(start_color=self.COLOR_META_BG, end_color=self.COLOR_META_BG, fill_type="solid")

        ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=5)
        f_lbl = ws.cell(row=current_row, column=1, value="CLASS AVERAGE")
        f_lbl.font = footer_font
        f_lbl.alignment = Alignment(horizontal="right", vertical="center")

        avg_mcq = stats["avg_mcq"]
        avg_desc = stats["avg_desc"]
        avg_total = stats["avg_total"]
        avg_pct = (stats["class_avg_pct"] / 100.0) if stats["appeared"] > 0 else None

        footer_values = {
            6: (avg_mcq, "0.00"),
            7: (avg_desc, "0.00"),
            8: (avg_total, "0.00"),
            9: (total_paper_max, "0.00"),
            10: (avg_pct, "0.0%"),
            11: (compute_grade(stats["class_avg_pct"]) if stats["appeared"] > 0 else "—", "@"),
            12: (f"{stats['passed_count']} Passed / {stats['appeared']} Appeared", "@"),
        }

        for col_idx in range(1, 13):
            cell = ws.cell(row=current_row, column=col_idx)
            cell.fill = footer_fill
            cell.border = footer_border
            if col_idx in footer_values:
                val, n_fmt = footer_values[col_idx]
                cell.value = val if val is not None else "—"
                cell.font = footer_font
                cell.alignment = Alignment(horizontal="right" if n_fmt != "@" else "center", vertical="center")
                if n_fmt != "@" and val is not None:
                    cell.number_format = n_fmt

        # ── 7. AUTO-FIT COLUMN WIDTHS ──
        for col_idx, (_, default_width, _) in enumerate(headers, start=1):
            col_letter = get_column_letter(col_idx)
            ws.column_dimensions[col_letter].width = max(default_width, 10)

        # ── 8. PAGE SETUP (Fit to Landscape A4) ──
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    def _build_student_records(
        self,
        snapshot: List[Dict[str, Any]],
        total_mcq_max: float,
        total_desc_max: float,
        total_paper_max: float,
    ) -> List[Dict[str, Any]]:
        """Compiles student attempt results for all assigned students."""
        assigned_students = list(
            self.delivery.assigned_students.select_related("class_section").all()
        )
        attempts = list(
            self.delivery.attempts.prefetch_related("answers").all()
        )
        attempts_by_student_id = {a.student_id: a for a in attempts}

        records = []
        for student in assigned_students:
            attempt = attempts_by_student_id.get(student.id)

            full_name = student.get_full_name().strip()
            if not full_name:
                full_name = student.username

            roll_no = getattr(student, "roll_number", "") or ""
            gr_no = getattr(student, "gr_number", "") or ""

            if not attempt:
                records.append({
                    "student": student,
                    "student_name": full_name,
                    "full_name": full_name,
                    "roll_number": roll_no,
                    "gr_number": gr_no,
                    "status_label": "Absent",
                    "status_code": "ABSENT",
                    "mcq_marks": None,
                    "desc_marks": None,
                    "total_marks": None,
                    "percentage": None,
                    "grade": "AB",
                    "remarks": "Absent / Not Appeared",
                    "has_appeared": False,
                })
                continue

            # Process attempt
            status = attempt.status  # NOT_STARTED | IN_PROGRESS | SUBMITTED | EVALUATED
            answers = list(attempt.answers.all())

            mcq_marks = 0.0
            desc_marks = 0.0
            has_desc = False
            desc_pending = False

            for ans in answers:
                q_snap = ans.question_snapshot or {}
                q_type = str(q_snap.get("question_type", "")).upper()
                awarded = float(ans.marks_awarded) if ans.marks_awarded is not None else None

                if q_type == "MCQ":
                    if awarded is not None:
                        mcq_marks += awarded
                else:
                    has_desc = True
                    if awarded is not None:
                        desc_marks += awarded
                    else:
                        desc_pending = True

            is_started = status in ["IN_PROGRESS", "SUBMITTED", "EVALUATED"]
            if not is_started:
                status_label = "Not Started"
                status_code = "NOT_STARTED"
                total_marks = None
                percentage = None
                grade = "—"
                remarks = "Registered (Not Started)"
                has_appeared = False
            else:
                has_appeared = True
                if attempt.score is not None:
                    total_marks = float(attempt.score)
                else:
                    total_marks = mcq_marks + desc_marks

                percentage = (total_marks / total_paper_max * 100.0) if total_paper_max > 0 else 0.0
                grade = compute_grade(percentage)

                if status == "EVALUATED":
                    status_label = "Evaluated"
                    status_code = "EVALUATED"
                    remarks = "Passed" if percentage >= 33.0 else "Needs Improvement"
                elif status == "SUBMITTED":
                    status_label = "Submitted"
                    status_code = "SUBMITTED"
                    remarks = "Pending Descriptive Review" if (has_desc and desc_pending) else "Submitted"
                else:
                    status_label = "In Progress"
                    status_code = "IN_PROGRESS"
                    remarks = "Exam In Progress"

            records.append({
                "student": student,
                "student_name": full_name,
                "full_name": full_name,
                "roll_number": roll_no,
                "gr_number": gr_no,
                "status_label": status_label,
                "status_code": status_code,
                "mcq_marks": mcq_marks if is_started else None,
                "desc_marks": desc_marks if is_started else None,
                "total_marks": total_marks,
                "percentage": percentage,
                "grade": grade,
                "remarks": remarks,
                "has_appeared": has_appeared,
            })

        return records

    def _sort_records(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sorts student records according to teacher's configured preference."""
        if self.sort_by == "name":
            return sorted(records, key=lambda r: (r["full_name"].lower(), r["student"].username.lower()))

        if self.sort_by == "score":
            # Highest score to lowest; absent/unattempted students at bottom
            def score_key(r):
                is_valid = (r["total_marks"] is not None)
                score_val = r["total_marks"] if is_valid else -1.0
                roll = r["roll_number"] or ""
                return (1 if is_valid else 0, score_val, self._roll_sort_tuple(roll))
            return sorted(records, key=score_key, reverse=True)

        # Default: Sort by Roll Number (natural alphanumeric sort)
        return sorted(records, key=lambda r: self._roll_sort_tuple(r["roll_number"]))

    @staticmethod
    def _roll_sort_tuple(roll_str: str) -> tuple:
        """Parses roll number string into natural sortable tuple."""
        clean = (roll_str or "").strip()
        if not clean:
            return (2, 0, "")
        match = re.match(r"^(\d+)", clean)
        if match:
            return (0, int(match.group(1)), clean)
        return (1, 0, clean.lower())

    def _compute_statistics(
        self, records: List[Dict[str, Any]], total_paper_max: float
    ) -> Dict[str, Any]:
        """Calculates cohort-level aggregations and KPIs."""
        total_assigned = len(records)
        appeared_records = [r for r in records if r["has_appeared"] and r["total_marks"] is not None]
        appeared_count = len(appeared_records)
        absent_count = total_assigned - appeared_count

        if appeared_count == 0:
            return {
                "total_assigned": total_assigned,
                "appeared": 0,
                "absent": absent_count,
                "class_avg_pct": 0.0,
                "highest_score": 0.0,
                "lowest_score": 0.0,
                "pass_pct": 0.0,
                "passed_count": 0,
                "avg_mcq": 0.0,
                "avg_desc": 0.0,
                "avg_total": 0.0,
            }

        scores = [r["total_marks"] for r in appeared_records]
        percentages = [r["percentage"] for r in appeared_records if r["percentage"] is not None]
        mcq_scores = [r["mcq_marks"] for r in appeared_records if r["mcq_marks"] is not None]
        desc_scores = [r["desc_marks"] for r in appeared_records if r["desc_marks"] is not None]

        passed_count = sum(1 for p in percentages if p >= 33.0)
        class_avg_pct = sum(percentages) / len(percentages) if percentages else 0.0

        return {
            "total_assigned": total_assigned,
            "appeared": appeared_count,
            "absent": absent_count,
            "class_avg_pct": class_avg_pct,
            "highest_score": max(scores) if scores else 0.0,
            "lowest_score": min(scores) if scores else 0.0,
            "pass_pct": (passed_count / appeared_count * 100.0) if appeared_count > 0 else 0.0,
            "passed_count": passed_count,
            "avg_mcq": sum(mcq_scores) / len(mcq_scores) if mcq_scores else 0.0,
            "avg_desc": sum(desc_scores) / len(desc_scores) if desc_scores else 0.0,
            "avg_total": sum(scores) / len(scores) if scores else 0.0,
        }
