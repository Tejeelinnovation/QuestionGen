"""
Student Assessment Scorecard PDF Export Service.
Generates publication-grade, institutional PDF scorecards and evaluation
reports for individual student test attempts using ReportLab.
"""

from __future__ import annotations

import hashlib
import io
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .gradebook_export import compute_grade


def escape_pdf_text(text: Any) -> str:
    """Escapes HTML entities for safe inclusion in ReportLab Paragraph XML."""
    if text is None:
        return ""
    s = str(text)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Collapse multiple whitespace
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas that dynamically counts total pages and draws
    consistent running headers (page 2+) and footers across all pages.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: List[Dict[str, Any]] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        page_w, page_h = A4
        margin_x = 12 * mm

        # Running Header (Page 2 onwards)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 7.5)
            self.setFillColor(colors.HexColor("#1F4D3A"))
            header_title = getattr(self, "_header_paper_title", "Assessment Scorecard")
            self.drawString(margin_x, page_h - 10 * mm, header_title.upper())

            self.setFont("Helvetica", 7.5)
            self.setFillColor(colors.HexColor("#64748B"))
            student_tag = getattr(self, "_header_student_tag", "Student Report")
            self.drawRightString(page_w - margin_x, page_h - 10 * mm, student_tag)

            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.5)
            self.line(margin_x, page_h - 11.5 * mm, page_w - margin_x, page_h - 11.5 * mm)

        # Running Footer (All pages)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(margin_x, 14 * mm, page_w - margin_x, 14 * mm)

        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748B"))
        system_stamp = getattr(self, "_footer_system_stamp", "QuestionGen Examination System • Official Candidate Scorecard")
        self.drawString(margin_x, 9.5 * mm, system_stamp)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(page_w - margin_x, 9.5 * mm, page_str)

        self.restoreState()


class StudentScorecardPdfService:
    """
    Service to compile an institutional-grade PDF Scorecard for a given student Attempt.
    """

    # Color Palette Tokens matching DESIGN_SYSTEM.md
    COLOR_FOREST = colors.HexColor("#1F4D3A")       # Primary Forest Green
    COLOR_FOREST_TINT = colors.HexColor("#ECFDF5")  # Soft Forest 50
    COLOR_FOREST_BORDER = colors.HexColor("#A7F3D0")# Forest 200
    COLOR_EMBER = colors.HexColor("#E8632C")        # Burnt Orange
    COLOR_EMBER_TINT = colors.HexColor("#FFF7ED")   # Amber 50
    COLOR_EMBER_BORDER = colors.HexColor("#FED7AA") # Amber 200
    COLOR_INK = colors.HexColor("#0F172A")          # Deep Slate 900
    COLOR_BODY = colors.HexColor("#334155")         # Slate 700
    COLOR_MUTED = colors.HexColor("#64748B")        # Slate 500
    COLOR_BG_CARD = colors.HexColor("#F8FAFC")      # Slate 50
    COLOR_BG_TABLE_HDR = colors.HexColor("#F1F5F9") # Slate 100
    COLOR_BORDER = colors.HexColor("#E2E8F0")       # Slate 200
    COLOR_BORDER_DARK = colors.HexColor("#CBD5E1")  # Slate 300

    def __init__(self, attempt: Any):
        self.attempt = attempt
        self.delivery = attempt.delivery
        self.paper_version = self.delivery.paper_version
        self.paper = self.paper_version.paper
        self.student = attempt.student

    def generate(self) -> bytes:
        buffer = io.BytesIO()

        # A4: 595.27 x 841.89 pt. 12mm margins = 34.0 pt margins -> Printable width = 527 pt
        margin = 12 * mm
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=margin,
            bottomMargin=margin,
        )

        printable_width = A4[0] - (2 * margin)

        # Build styles
        styles = self._build_styles()

        # Story flowables list
        story: List[Any] = []

        # 1. Header Section
        story.extend(self._build_header(styles, printable_width))
        story.append(Spacer(1, 4 * mm))

        # 2. Candidate & Assessment Meta Info Table
        story.append(self._build_meta_table(styles, printable_width))
        story.append(Spacer(1, 4.5 * mm))

        # 3. KPI Score & Performance Highlights
        story.append(self._build_kpi_hero(styles, printable_width))
        story.append(Spacer(1, 4.5 * mm))

        # 4. Section Score Breakdown
        story.append(self._build_section_summary(styles, printable_width))
        story.append(Spacer(1, 5 * mm))

        # 5. Itemized Question Evaluation Table
        story.extend(self._build_question_breakdown(styles, printable_width))
        story.append(Spacer(1, 6 * mm))

        # 6. Evaluation Remarks & Official Signatures
        story.append(self._build_signoff_section(styles, printable_width))

        # Build document with NumberedCanvas
        def make_canvas(*args, **kwargs):
            canv = NumberedCanvas(*args, **kwargs)
            canv._header_paper_title = f"{self.paper.title} — Official Scorecard"
            roll_str = f"Roll #{self.student.roll_number}" if getattr(self.student, "roll_number", None) else ""
            canv._header_student_tag = f"{self.student.get_full_name() or self.student.username} {roll_str}".strip()
            # Verification stamp
            hash_src = f"{self.attempt.id}:{self.student.id}:{self.attempt.score}:{self.attempt.submitted_at}"
            v_hash = hashlib.sha256(hash_src.encode("utf-8")).hexdigest()[:10].upper()
            canv._footer_system_stamp = (
                f"QuestionGen Examination System • Candidate Scorecard • Verification Code: QG-{v_hash}"
            )
            return canv

        doc.build(story, canvasmaker=make_canvas)

        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    def _build_styles(self) -> Dict[str, ParagraphStyle]:
        base_styles = getSampleStyleSheet()

        styles: Dict[str, ParagraphStyle] = {
            "SchoolTitle": ParagraphStyle(
                "SchoolTitle",
                fontName="Helvetica-Bold",
                fontSize=14,
                leading=17,
                textColor=self.COLOR_FOREST,
                alignment=0,
            ),
            "DocSubtitle": ParagraphStyle(
                "DocSubtitle",
                fontName="Helvetica-Bold",
                fontSize=8.5,
                leading=11,
                textColor=self.COLOR_MUTED,
                alignment=0,
            ),
            "MetaLabel": ParagraphStyle(
                "MetaLabel",
                fontName="Helvetica-Bold",
                fontSize=7.5,
                leading=9.5,
                textColor=self.COLOR_MUTED,
            ),
            "MetaValue": ParagraphStyle(
                "MetaValue",
                fontName="Helvetica",
                fontSize=8.5,
                leading=11,
                textColor=self.COLOR_INK,
            ),
            "KpiTitle": ParagraphStyle(
                "KpiTitle",
                fontName="Helvetica-Bold",
                fontSize=7,
                leading=8.5,
                textColor=self.COLOR_MUTED,
                alignment=1,
            ),
            "KpiValue": ParagraphStyle(
                "KpiValue",
                fontName="Helvetica-Bold",
                fontSize=18,
                leading=21,
                textColor=self.COLOR_FOREST,
                alignment=1,
            ),
            "KpiSub": ParagraphStyle(
                "KpiSub",
                fontName="Helvetica",
                fontSize=7,
                leading=8.5,
                textColor=self.COLOR_MUTED,
                alignment=1,
            ),
            "SectionHeading": ParagraphStyle(
                "SectionHeading",
                fontName="Helvetica-Bold",
                fontSize=10,
                leading=13,
                textColor=self.COLOR_INK,
            ),
            "TableHdr": ParagraphStyle(
                "TableHdr",
                fontName="Helvetica-Bold",
                fontSize=7.5,
                leading=9.5,
                textColor=self.COLOR_INK,
                alignment=0,
            ),
            "TableHdrCenter": ParagraphStyle(
                "TableHdrCenter",
                fontName="Helvetica-Bold",
                fontSize=7.5,
                leading=9.5,
                textColor=self.COLOR_INK,
                alignment=1,
            ),
            "QNum": ParagraphStyle(
                "QNum",
                fontName="Helvetica-Bold",
                fontSize=8,
                leading=10,
                textColor=self.COLOR_INK,
                alignment=1,
            ),
            "QType": ParagraphStyle(
                "QType",
                fontName="Helvetica",
                fontSize=7,
                leading=9,
                textColor=self.COLOR_MUTED,
                alignment=1,
            ),
            "QText": ParagraphStyle(
                "QText",
                fontName="Helvetica",
                fontSize=8,
                leading=11,
                textColor=self.COLOR_INK,
            ),
            "QAnswer": ParagraphStyle(
                "QAnswer",
                fontName="Helvetica",
                fontSize=7.5,
                leading=10,
                textColor=self.COLOR_BODY,
            ),
            "QKey": ParagraphStyle(
                "QKey",
                fontName="Helvetica-Bold",
                fontSize=7.5,
                leading=10,
                textColor=self.COLOR_FOREST,
            ),
            "MarksAwarded": ParagraphStyle(
                "MarksAwarded",
                fontName="Helvetica-Bold",
                fontSize=8,
                leading=10,
                textColor=self.COLOR_INK,
                alignment=1,
            ),
            "PillCorrect": ParagraphStyle(
                "PillCorrect",
                fontName="Helvetica-Bold",
                fontSize=6.5,
                leading=8,
                textColor=colors.HexColor("#166534"),
                alignment=1,
            ),
            "PillIncorrect": ParagraphStyle(
                "PillIncorrect",
                fontName="Helvetica-Bold",
                fontSize=6.5,
                leading=8,
                textColor=colors.HexColor("#991B1B"),
                alignment=1,
            ),
            "PillGraded": ParagraphStyle(
                "PillGraded",
                fontName="Helvetica-Bold",
                fontSize=6.5,
                leading=8,
                textColor=colors.HexColor("#1E40AF"),
                alignment=1,
            ),
            "RemarksText": ParagraphStyle(
                "RemarksText",
                fontName="Helvetica-Oblique",
                fontSize=8,
                leading=10.5,
                textColor=self.COLOR_BODY,
            ),
            "SignatureLabel": ParagraphStyle(
                "SignatureLabel",
                fontName="Helvetica",
                fontSize=7.5,
                leading=9.5,
                textColor=self.COLOR_MUTED,
                alignment=1,
            ),
        }
        return styles

    def _build_header(self, styles: Dict[str, ParagraphStyle], width: float) -> List[Any]:
        school = getattr(self.paper, "school", None) or getattr(self.delivery.target_class, "school", None)
        school_name = school.name if school else "INSTITUTIONAL EXAMINATION SYSTEM"

        title_p = Paragraph(f"<b>{escape_pdf_text(school_name).upper()}</b>", styles["SchoolTitle"])
        subtitle_p = Paragraph("OFFICIAL CANDIDATE SCORECARD &amp; ACADEMIC PERFORMANCE REPORT", styles["DocSubtitle"])

        # Timestamp on right
        now_str = timezone.now().strftime("%d %b %Y, %H:%M")
        meta_right = Paragraph(
            f"<font color='#64748B'>Generated:</font> <b>{now_str}</b><br/>"
            f"<font color='#64748B'>Attempt ID:</font> <b>#{self.attempt.id}</b>",
            styles["MetaValue"],
        )

        header_table = Table(
            [[[title_p, subtitle_p], meta_right]],
            colWidths=[width * 0.72, width * 0.28],
        )
        header_table.setStyle(
            TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ])
        )

        # Top Forest accent bar
        accent_bar = HRFlowable(
            width="100%",
            thickness=2.5,
            color=self.COLOR_FOREST,
            spaceBefore=3 * mm,
            spaceAfter=1 * mm,
        )

        return [header_table, accent_bar]

    def _build_meta_table(self, styles: Dict[str, ParagraphStyle], width: float) -> Table:
        full_name = self.student.get_full_name() or self.student.username
        roll_no = getattr(self.student, "roll_number", None) or "—"
        gr_no = getattr(self.student, "gr_number", None) or "—"

        class_sec = (
            getattr(self.student, "class_section", None)
            or getattr(self.delivery, "target_class", None)
        )
        class_name = class_sec.name if class_sec else "General Roster"

        paper_title = self.paper.title
        version_label = self.paper_version.version_label
        mode_label = self.delivery.mode
        exam_date = (
            self.attempt.submitted_at.strftime("%d %b %Y, %I:%M %p")
            if self.attempt.submitted_at
            else "In Progress / Draft"
        )

        col_w = width / 4.0
        data = [
            [
                Paragraph("CANDIDATE NAME", styles["MetaLabel"]),
                Paragraph("ROLL NUMBER", styles["MetaLabel"]),
                Paragraph("CLASS &amp; SECTION", styles["MetaLabel"]),
                Paragraph("REGISTRATION (GR)", styles["MetaLabel"]),
            ],
            [
                Paragraph(f"<b>{escape_pdf_text(full_name)}</b>", styles["MetaValue"]),
                Paragraph(f"<b>{escape_pdf_text(roll_no)}</b>", styles["MetaValue"]),
                Paragraph(f"<b>{escape_pdf_text(class_name)}</b>", styles["MetaValue"]),
                Paragraph(f"<b>{escape_pdf_text(gr_no)}</b>", styles["MetaValue"]),
            ],
            [
                Paragraph("EXAMINATION PAPER", styles["MetaLabel"]),
                Paragraph("VERSION &amp; MODE", styles["MetaLabel"]),
                Paragraph("SUBMITTED AT", styles["MetaLabel"]),
                Paragraph("EVALUATION STATUS", styles["MetaLabel"]),
            ],
            [
                Paragraph(f"<b>{escape_pdf_text(paper_title)}</b>", styles["MetaValue"]),
                Paragraph(f"<b>v{escape_pdf_text(version_label)} • {mode_label}</b>", styles["MetaValue"]),
                Paragraph(f"<b>{exam_date}</b>", styles["MetaValue"]),
                Paragraph(f"<b>{self.attempt.status}</b>", styles["MetaValue"]),
            ],
        ]

        table = Table(data, colWidths=[col_w] * 4)
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), self.COLOR_BG_CARD),
                ("BOX", (0, 0), (-1, -1), 0.75, self.COLOR_BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, self.COLOR_BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ])
        )
        return table

    def _build_kpi_hero(self, styles: Dict[str, ParagraphStyle], width: float) -> Table:
        score_val = float(self.attempt.score) if self.attempt.score is not None else 0.0
        max_score = float(self.attempt.max_score) if self.attempt.max_score else 0.0
        pct = (score_val / max_score * 100.0) if max_score > 0 else 0.0
        grade = compute_grade(pct)

        score_disp = f"{score_val:g}" if score_val % 1 == 0 else f"{score_val:.1f}"
        max_disp = f"{max_score:g}" if max_score % 1 == 0 else f"{max_score:.1f}"

        col_w = width / 4.0
        data = [
            [
                Paragraph("MARKS SCORED", styles["KpiTitle"]),
                Paragraph("PERCENTAGE", styles["KpiTitle"]),
                Paragraph("GRADE BAND", styles["KpiTitle"]),
                Paragraph("RESULT STATUS", styles["KpiTitle"]),
            ],
            [
                Paragraph(f"<b>{score_disp}</b> <font size='10' color='#64748B'>/ {max_disp}</font>", styles["KpiValue"]),
                Paragraph(f"<b>{pct:.1f}%</b>", styles["KpiValue"]),
                Paragraph(f"<b>{grade}</b>", styles["KpiValue"]),
                Paragraph(f"<b>{self.attempt.status}</b>", styles["KpiValue"]),
            ],
            [
                Paragraph("Total marks earned", styles["KpiSub"]),
                Paragraph("Academic performance", styles["KpiSub"]),
                Paragraph("CBSE/ICSE scale", styles["KpiSub"]),
                Paragraph("Verified &amp; Recorded", styles["KpiSub"]),
            ],
        ]

        table = Table(data, colWidths=[col_w] * 4)
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), self.COLOR_FOREST_TINT),
                ("BOX", (0, 0), (-1, -1), 1.0, self.COLOR_FOREST_BORDER),
                ("LINEBEFORE", (1, 0), (1, -1), 0.5, self.COLOR_FOREST_BORDER),
                ("LINEBEFORE", (2, 0), (2, -1), 0.5, self.COLOR_FOREST_BORDER),
                ("LINEBEFORE", (3, 0), (3, -1), 0.5, self.COLOR_FOREST_BORDER),
                ("TOPPADDING", (0, 0), (-1, 0), 4),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                ("TOPPADDING", (0, 1), (-1, 1), 1),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 1),
                ("TOPPADDING", (0, 2), (-1, 2), 1),
                ("BOTTOMPADDING", (0, 2), (-1, 2), 4),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ])
        )
        return table

    def _build_section_summary(self, styles: Dict[str, ParagraphStyle], width: float) -> Table:
        snapshot = self.paper_version.question_snapshot or []
        answers_map = {ans.question_id: ans for ans in self.attempt.answers.all()}

        mcq_max = 0.0
        mcq_earned = 0.0
        desc_max = 0.0
        desc_earned = 0.0

        for q in snapshot:
            qid = q.get("id")
            marks = float(q.get("marks", 0))
            is_mcq = str(q.get("question_type", "")).upper() == "MCQ"
            ans = answers_map.get(qid)
            awarded = float(ans.marks_awarded) if (ans and ans.marks_awarded is not None) else 0.0

            if is_mcq:
                mcq_max += marks
                mcq_earned += awarded
            else:
                desc_max += marks
                desc_earned += awarded

        mcq_pct = (mcq_earned / mcq_max * 100.0) if mcq_max > 0 else 0.0
        desc_pct = (desc_earned / desc_max * 100.0) if desc_max > 0 else 0.0

        w_col = width / 3.0
        data = [
            [
                Paragraph("<b>SECTION</b>", styles["TableHdr"]),
                Paragraph("<b>MARKS EARNED / TOTAL</b>", styles["TableHdrCenter"]),
                Paragraph("<b>ACCURACY %</b>", styles["TableHdrCenter"]),
            ],
            [
                Paragraph("Section A: Objective &amp; Multiple Choice (MCQ)", styles["MetaValue"]),
                Paragraph(f"<b>{mcq_earned:g} / {mcq_max:g} Marks</b>", styles["TableHdrCenter"]),
                Paragraph(f"<b>{mcq_pct:.1f}%</b>", styles["TableHdrCenter"]),
            ],
            [
                Paragraph("Section B: Short &amp; Long Answer Descriptive", styles["MetaValue"]),
                Paragraph(f"<b>{desc_earned:g} / {desc_max:g} Marks</b>", styles["TableHdrCenter"]),
                Paragraph(f"<b>{desc_pct:.1f}%</b>", styles["TableHdrCenter"]),
            ],
        ]

        table = Table(data, colWidths=[w_col * 1.5, w_col * 0.8, w_col * 0.7])
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_BG_TABLE_HDR),
                ("BOX", (0, 0), (-1, -1), 0.75, self.COLOR_BORDER_DARK),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, self.COLOR_BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ])
        )
        return table

    def _build_question_breakdown(self, styles: Dict[str, ParagraphStyle], width: float) -> List[Any]:
        items: List[Any] = []

        heading = Paragraph("<b>ITEMIZED QUESTION PERFORMANCE &amp; SOLUTIONS</b>", styles["SectionHeading"])
        items.append(heading)
        items.append(Spacer(1, 2 * mm))

        snapshot = self.paper_version.question_snapshot or []
        answers_map = {ans.question_id: ans for ans in self.attempt.answers.all()}

        # Table Column Widths: Q#, Type, Detail, Max, Score, Status
        # Total width: 28 + 48 + 325 + 36 + 42 + 48 = 527 pt
        col_w = [28, 48, width - (28 + 48 + 36 + 42 + 48), 36, 42, 48]

        table_rows = [
            [
                Paragraph("<b>Q#</b>", styles["TableHdrCenter"]),
                Paragraph("<b>TYPE</b>", styles["TableHdrCenter"]),
                Paragraph("<b>QUESTION, SUBMITTED RESPONSE &amp; OFFICIAL KEY</b>", styles["TableHdr"]),
                Paragraph("<b>MAX</b>", styles["TableHdrCenter"]),
                Paragraph("<b>SCORE</b>", styles["TableHdrCenter"]),
                Paragraph("<b>RESULT</b>", styles["TableHdrCenter"]),
            ]
        ]

        row_styles = [
            ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_BG_TABLE_HDR),
            ("BOX", (0, 0), (-1, -1), 0.75, self.COLOR_BORDER_DARK),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, self.COLOR_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]

        for idx, q in enumerate(snapshot, start=1):
            qid = q.get("id")
            q_type = str(q.get("question_type", "")).upper()
            q_text = escape_pdf_text(q.get("question_text", ""))
            max_m = float(q.get("marks", 1))

            ans = answers_map.get(qid)
            resp_str = escape_pdf_text(ans.student_response) if ans and ans.student_response else "No answer recorded"
            awarded = float(ans.marks_awarded) if (ans and ans.marks_awarded is not None) else None
            is_correct = ans.is_correct if ans else None

            # Reference answer
            correct_key = escape_pdf_text(q.get("correct_answer", ""))

            # Result Pill Style
            if is_correct is True:
                result_p = Paragraph("<font color='#166534'><b>CORRECT</b></font>", styles["PillCorrect"])
                pill_bg = colors.HexColor("#DCFCE7")
            elif is_correct is False:
                result_p = Paragraph("<font color='#991B1B'><b>INCORRECT</b></font>", styles["PillIncorrect"])
                pill_bg = colors.HexColor("#FEE2E2")
            else:
                result_p = Paragraph("<font color='#1E40AF'><b>GRADED</b></font>", styles["PillGraded"])
                pill_bg = colors.HexColor("#DBEAFE")

            score_text = f"{awarded:g}" if (awarded is not None and awarded % 1 == 0) else (f"{awarded:.1f}" if awarded is not None else "—")

            # Compose details block
            detail_flowables = [
                Paragraph(f"<b>Q{idx}.</b> {q_text}", styles["QText"]),
                Spacer(1, 1 * mm),
                Paragraph(
                    f"<font color='#64748B'>Your Answer:</font> <i>{resp_str}</i>",
                    styles["QAnswer"],
                ),
            ]
            if correct_key:
                detail_flowables.append(Spacer(1, 0.5 * mm))
                detail_flowables.append(
                    Paragraph(
                        f"<font color='#1F4D3A'><b>Official Solution:</b></font> <b>{correct_key}</b>",
                        styles["QKey"],
                    )
                )

            table_rows.append([
                Paragraph(f"Q{idx:02d}", styles["QNum"]),
                Paragraph(q_type, styles["QType"]),
                detail_flowables,
                Paragraph(f"{max_m:g}", styles["MarksAwarded"]),
                Paragraph(f"<b>{score_text}</b>", styles["MarksAwarded"]),
                result_p,
            ])

            # Alternating subtle row tint
            row_idx = len(table_rows) - 1
            if row_idx % 2 == 0:
                row_styles.append(("BACKGROUND", (0, row_idx), (-1, row_idx), self.COLOR_BG_CARD))

        q_table = Table(table_rows, colWidths=col_w, repeatRows=1)
        q_table.setStyle(TableStyle(row_styles))
        items.append(q_table)

        return items

    def _build_signoff_section(self, styles: Dict[str, ParagraphStyle], width: float) -> KeepTogether:
        # Evaluation remarks & Official Signature Lines
        w_col = width / 3.0

        teacher = self.delivery.created_by
        teacher_name = teacher.get_full_name() or teacher.username if teacher else "Faculty Evaluator"

        data = [
            [
                Paragraph("<b>EVALUATOR REMARKS</b>", styles["TableHdr"]),
                Paragraph("<b>SUBJECT TEACHER</b>", styles["SignatureLabel"]),
                Paragraph("<b>HEAD OF EXAMINATION</b>", styles["SignatureLabel"]),
            ],
            [
                Paragraph(
                    "Scorecard generated and verified under standard institutional assessment guidelines. "
                    "All MCQ responses evaluated systematically against the approved question key.",
                    styles["RemarksText"],
                ),
                Paragraph(
                    f"<br/><br/><br/>_______________________<br/><b>{escape_pdf_text(teacher_name)}</b><br/>Faculty Examiner",
                    styles["SignatureLabel"],
                ),
                Paragraph(
                    "<br/><br/><br/>_______________________<br/><b>Academic Director</b><br/>Institutional Seal",
                    styles["SignatureLabel"],
                ),
            ],
        ]

        table = Table(data, colWidths=[w_col * 1.4, w_col * 0.8, w_col * 0.8])
        table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), self.COLOR_BG_CARD),
                ("BOX", (0, 0), (-1, -1), 0.75, self.COLOR_BORDER),
                ("LINEBEFORE", (1, 0), (1, -1), 0.5, self.COLOR_BORDER),
                ("LINEBEFORE", (2, 0), (2, -1), 0.5, self.COLOR_BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ])
        )
        return KeepTogether([table])
