"""
Student Assessment Scorecard & Official Statement of Marks PDF Service.
Generates authentic, board-grade examination marksheets and evaluation certificates
modeled on the official Gujarat Secondary and Higher Secondary Education Board (GSEB)
and national institutional examination standards.
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


def escape_pdf_text(text: Any) -> str:
    """
    Escapes HTML entities and standardizes mathematical & typographic symbols
    for crisp, compatible rendering in standard PDF fonts.
    """
    if text is None:
        return ""
    s = str(text)
    # Math & typography symbol normalization for high-compatibility PDF fonts
    replacements = {
        "≤": "<=",
        "≥": ">=",
        "≠": "!=",
        "±": "+/-",
        "×": "x",
        "÷": "/",
        "²": "^2",
        "³": "^3",
        "°": " deg",
        "π": "pi",
        "√": "sqrt",
        "—": "-",
        "–": "-",
        "•": "*",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
    }
    for orig, repl in replacements.items():
        s = s.replace(orig, repl)
    # Escape standard XML characters
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


# Number to Words Converter for official marksheet statements
ONES = [
    "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN",
    "EIGHTEEN", "NINETEEN"
]
TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]


def int_to_words(n: int) -> str:
    if n < 0:
        return "MINUS " + int_to_words(-n)
    if n < 20:
        return ONES[n]
    if n < 100:
        rem = n % 10
        return TENS[n // 10] + (" " + ONES[rem] if rem else "")
    if n < 1000:
        rem = n % 100
        return ONES[n // 100] + " HUNDRED" + (" AND " + int_to_words(rem) if rem else "")
    return str(n)


def marks_to_words(marks: float | Decimal | None) -> str:
    """Converts a numerical mark into official uppercase words, e.g. 4.0 -> 'FOUR', 8.5 -> 'EIGHT POINT FIVE'."""
    if marks is None:
        return "ZERO"
    m_f = round(float(marks), 2)
    int_p = int(m_f)
    dec_p = round((m_f - int_p) * 10)
    int_str = int_to_words(int_p)
    if dec_p > 0:
        dec_str = ONES[dec_p] if dec_p < 20 else str(dec_p)
        return f"{int_str} POINT {dec_str}"
    return int_str


def compute_board_grade(percentage: Optional[float]) -> tuple[str, str]:
    """
    Computes official Gujarat Board (GSEB) / CBSE standard grade band and classification.
    Uses encouraging, respectful terminology aligned with national education board standards.
    Returns (grade_code, result_status_description).
    """
    if percentage is None:
        return ("—", "UNDER EVALUATION")
    pct = round(percentage, 2)
    if pct >= 91.0:
        return ("A1", "QUALIFIED - FIRST CLASS WITH DISTINCTION (OUTSTANDING)")
    if pct >= 81.0:
        return ("A2", "QUALIFIED - FIRST CLASS WITH DISTINCTION (EXCELLENT)")
    if pct >= 71.0:
        return ("B1", "QUALIFIED - FIRST CLASS WITH DISTINCTION (VERY GOOD)")
    if pct >= 61.0:
        return ("B2", "QUALIFIED - FIRST CLASS (GOOD)")
    if pct >= 51.0:
        return ("C1", "QUALIFIED - SECOND CLASS (ABOVE AVERAGE)")
    if pct >= 41.0:
        return ("C2", "QUALIFIED - SECOND CLASS (AVERAGE)")
    if pct >= 33.0:
        return ("D", "QUALIFIED - PASS CLASS")
    return ("E1", "ELIGIBLE FOR IMPROVEMENT")


class OfficialBoardCanvas(canvas.Canvas):
    """
    Two-pass canvas drawing official state board double borders,
    running headers, page indices, and institutional watermark decorations.
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

        # ── 1. AUTHENTIC STATE BOARD DOUBLE BORDER (Clean vector hairlines, zero black boxes) ──
        margin_outer = 8 * mm
        self.setStrokeColor(colors.HexColor("#0F172A"))  # Deep Navy Slate Outer Frame
        self.setLineWidth(1.4)
        self.rect(margin_outer, margin_outer, page_w - (2 * margin_outer), page_h - (2 * margin_outer))

        margin_inner = 9.6 * mm
        self.setStrokeColor(colors.HexColor("#334155"))  # Slate Hairline Inner Frame
        self.setLineWidth(0.6)
        self.rect(margin_inner, margin_inner, page_w - (2 * margin_inner), page_h - (2 * margin_inner))

        # ── 2. RUNNING HEADER (Page 2 onwards) ──
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 7.5)
            self.setFillColor(colors.HexColor("#0F172A"))
            header_title = getattr(self, "_header_paper_title", "OFFICIAL STATEMENT OF MARKS")
            self.drawString(margin_inner + 3 * mm, page_h - margin_inner + 2.5 * mm, header_title.upper())

            self.setFont("Helvetica", 7.5)
            self.setFillColor(colors.HexColor("#475569"))
            student_tag = getattr(self, "_header_student_tag", "")
            self.drawRightString(page_w - margin_inner - 3 * mm, page_h - margin_inner + 2.5 * mm, student_tag)

        # ── 3. RUNNING FOOTER (All pages) ──
        self.setFont("Helvetica-Bold", 6.8)
        self.setFillColor(colors.HexColor("#475569"))
        footer_text = getattr(
            self,
            "_footer_system_stamp",
            "GUJARAT SECONDARY & HIGHER SECONDARY EDUCATION BOARD • OFFICIAL TRANSCRIPT",
        )
        self.drawString(margin_inner + 3 * mm, margin_inner - 4.5 * mm, footer_text)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.setFont("Helvetica", 6.8)
        self.drawRightString(page_w - margin_inner - 3 * mm, margin_inner - 4.5 * mm, page_str)

        self.restoreState()


class StudentScorecardPdfService:
    """
    Compiles an official, state-board style Statement of Marks and Certificate
    for a student's examination attempt.
    """

    # Official State Board Color Palette (High-contrast, institutional, zero startup gradients)
    COLOR_PRIMARY_NAVY = colors.HexColor("#0F172A")    # Deep Board Slate / Navy
    COLOR_BORDER_FRAME = colors.HexColor("#1E293B")    # Slate 800
    COLOR_BORDER_GRID = colors.HexColor("#64748B")     # Slate 500
    COLOR_BORDER_LIGHT = colors.HexColor("#94A3B8")    # Slate 400
    COLOR_BG_HEADER = colors.HexColor("#F1F5F9")      # Board Grey Tint
    COLOR_BG_ZEBRA = colors.HexColor("#F8FAFC")       # Subtle alternating row
    COLOR_PASS = colors.HexColor("#0F5132")           # Formal Dark Green
    COLOR_FAIL = colors.HexColor("#842029")           # Formal Dark Red

    def __init__(self, attempt: Any):
        self.attempt = attempt
        self.delivery = attempt.delivery
        self.paper_version = self.delivery.paper_version
        self.paper = self.paper_version.paper
        self.student = attempt.student

    def generate(self) -> bytes:
        buffer = io.BytesIO()

        # Margins: 14mm to ensure flowables stay well within the double border frame
        margin = 13.5 * mm
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=margin,
            bottomMargin=margin,
        )

        printable_width = A4[0] - (2 * margin)

        styles = self._build_styles()
        story: List[Any] = []

        # 1. State Board Official Header
        story.extend(self._build_board_header(styles, printable_width))
        story.append(Spacer(1, 2.5 * mm))

        # 2. Candidate & Institutional Index Grid (Framed Board Table)
        story.append(self._build_candidate_grid(styles, printable_width))
        story.append(Spacer(1, 3.5 * mm))

        # 3. Board Performance Summary Box (Tabular Statement)
        story.append(self._build_summary_statement(styles, printable_width))
        story.append(Spacer(1, 4 * mm))

        # 4. Itemized Statement of Marks & Question-by-Question Evaluation Table
        story.extend(self._build_statement_of_marks_table(styles, printable_width))
        story.append(Spacer(1, 4 * mm))

        # 5. Grading Legend & Statutory Regulations
        story.append(self._build_grading_scale_box(styles, printable_width))
        story.append(Spacer(1, 4 * mm))

        # 6. Official Signatures & Institutional Seal Block
        story.append(self._build_official_signatures(styles, printable_width))

        # Build with OfficialBoardCanvas
        def make_canvas(*args, **kwargs):
            canv = OfficialBoardCanvas(*args, **kwargs)
            canv._header_paper_title = f"{self.paper.title} — STATEMENT OF MARKS"
            roll_str = f"Roll #{self.student.roll_number}" if getattr(self.student, "roll_number", None) else ""
            canv._header_student_tag = f"{self.student.get_full_name() or self.student.username} {roll_str}".strip()

            hash_src = f"{self.attempt.id}:{self.student.id}:{self.attempt.score}:{self.attempt.submitted_at}"
            v_hash = hashlib.sha256(hash_src.encode("utf-8")).hexdigest()[:12].upper()
            school = getattr(self.paper, "school", None) or getattr(self.delivery.target_class, "school", None)
            school_abbr = "".join(w[0] for w in (school.name if school else "GSEB").split() if w.isalnum())[:5].upper()
            canv._footer_system_stamp = (
                f"GOVERNMENT OF GUJARAT • {school_abbr} STATUTORY EXAMINATION RECORD • CERT. ID: {school_abbr}-{v_hash}"
            )
            return canv

        doc.build(story, canvasmaker=make_canvas)

        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    def _build_styles(self) -> Dict[str, ParagraphStyle]:
        styles: Dict[str, ParagraphStyle] = {
            "BoardTitle": ParagraphStyle(
                "BoardTitle",
                fontName="Helvetica-Bold",
                fontSize=12.5,
                leading=15,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,  # Center
            ),
            "BoardSubTitle": ParagraphStyle(
                "BoardSubTitle",
                fontName="Helvetica-Bold",
                fontSize=9.5,
                leading=12,
                textColor=colors.HexColor("#1E293B"),
                alignment=1,
            ),
            "GujaratiSub": ParagraphStyle(
                "GujaratiSub",
                fontName="Helvetica",
                fontSize=7.5,
                leading=10,
                textColor=colors.HexColor("#475569"),
                alignment=1,
            ),
            "CertificateType": ParagraphStyle(
                "CertificateType",
                fontName="Helvetica-Bold",
                fontSize=8.5,
                leading=11,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,
            ),
            "GridHeader": ParagraphStyle(
                "GridHeader",
                fontName="Helvetica-Bold",
                fontSize=6.5,
                leading=8.5,
                textColor=colors.HexColor("#334155"),
                alignment=0,
            ),
            "GridHeaderCenter": ParagraphStyle(
                "GridHeaderCenter",
                fontName="Helvetica-Bold",
                fontSize=6.5,
                leading=8.5,
                textColor=colors.HexColor("#334155"),
                alignment=1,
            ),
            "GridValue": ParagraphStyle(
                "GridValue",
                fontName="Helvetica-Bold",
                fontSize=8,
                leading=10.5,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=0,
            ),
            "GridValueCenter": ParagraphStyle(
                "GridValueCenter",
                fontName="Helvetica-Bold",
                fontSize=8,
                leading=10.5,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,
            ),
            "TableHdr": ParagraphStyle(
                "TableHdr",
                fontName="Helvetica-Bold",
                fontSize=6.8,
                leading=8.5,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=0,
            ),
            "TableHdrCenter": ParagraphStyle(
                "TableHdrCenter",
                fontName="Helvetica-Bold",
                fontSize=6.8,
                leading=8.5,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,
            ),
            "CellText": ParagraphStyle(
                "CellText",
                fontName="Helvetica",
                fontSize=7.5,
                leading=9.5,
                textColor=colors.HexColor("#0F172A"),
            ),
            "CellTextBold": ParagraphStyle(
                "CellTextBold",
                fontName="Helvetica-Bold",
                fontSize=7.5,
                leading=9.5,
                textColor=colors.HexColor("#0F172A"),
                alignment=1,
            ),
            "QNum": ParagraphStyle(
                "QNum",
                fontName="Helvetica-Bold",
                fontSize=7.5,
                leading=9.5,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,
            ),
            "QType": ParagraphStyle(
                "QType",
                fontName="Helvetica",
                fontSize=6.5,
                leading=8.5,
                textColor=colors.HexColor("#475569"),
                alignment=1,
            ),
            "QText": ParagraphStyle(
                "QText",
                fontName="Helvetica",
                fontSize=7.2,
                leading=9.5,
                textColor=colors.HexColor("#0F172A"),
            ),
            "QAnswerAttempted": ParagraphStyle(
                "QAnswerAttempted",
                fontName="Helvetica",
                fontSize=7,
                leading=9,
                textColor=colors.HexColor("#0F172A"),
            ),
            "QAnswerUnattempted": ParagraphStyle(
                "QAnswerUnattempted",
                fontName="Helvetica-Oblique",
                fontSize=7,
                leading=9,
                textColor=colors.HexColor("#64748B"),
            ),
            "QKey": ParagraphStyle(
                "QKey",
                fontName="Helvetica",
                fontSize=6.8,
                leading=8.8,
                textColor=colors.HexColor("#334155"),
            ),
            "StatutoryNotice": ParagraphStyle(
                "StatutoryNotice",
                fontName="Helvetica",
                fontSize=6.2,
                leading=8,
                textColor=colors.HexColor("#475569"),
                alignment=1,
            ),
            "SignTitle": ParagraphStyle(
                "SignTitle",
                fontName="Helvetica-Bold",
                fontSize=7,
                leading=9,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,
            ),
            "SignSub": ParagraphStyle(
                "SignSub",
                fontName="Helvetica",
                fontSize=6.5,
                leading=8.5,
                textColor=colors.HexColor("#475569"),
                alignment=1,
            ),
            "SealTitle": ParagraphStyle(
                "SealTitle",
                fontName="Helvetica-Bold",
                fontSize=7,
                leading=9,
                textColor=self.COLOR_PRIMARY_NAVY,
                alignment=1,
            ),
            "SealSub": ParagraphStyle(
                "SealSub",
                fontName="Helvetica",
                fontSize=6,
                leading=8,
                textColor=colors.HexColor("#475569"),
                alignment=1,
            ),
            "BoardSubTitleSmall": ParagraphStyle(
                "BoardSubTitleSmall",
                fontName="Helvetica-Bold",
                fontSize=6.8,
                leading=8.8,
                textColor=colors.HexColor("#334155"),
                alignment=1,
            ),
        }
        return styles

    def _build_board_header(self, styles: Dict[str, ParagraphStyle], width: float) -> List[Any]:
        school = getattr(self.paper, "school", None) or getattr(self.delivery.target_class, "school", None)
        school_name = school.name if school else "GUJARAT SECONDARY & HIGHER SECONDARY EDUCATION BOARD"

        # Emblem / Header representation
        items = [
            Paragraph(f"<b>{escape_pdf_text(school_name).upper()}</b>", styles["BoardTitle"]),
            Spacer(1, 0.8 * mm),
            Paragraph("<b>STATEMENT OF MARKS &amp; ACADEMIC PERFORMANCE CERTIFICATE</b>", styles["BoardSubTitle"]),
            Spacer(1, 0.5 * mm),
            Paragraph("STATE EXAMINATION BOARD • OFFICIAL ACADEMIC EVALUATION RECORD", styles["BoardSubTitleSmall"]),
            Spacer(1, 0.8 * mm),
            Paragraph(
                "<b>SECONDARY / SENIOR SECONDARY SUMMATIVE EXAMINATION — ACADEMIC SESSION 2025–2026</b>",
                styles["CertificateType"],
            ),
            Spacer(1, 1.2 * mm),
            HRFlowable(
                width="100%",
                thickness=1.2,
                color=self.COLOR_PRIMARY_NAVY,
                spaceBefore=1,
                spaceAfter=1,
            ),
        ]
        return items

    def _build_candidate_grid(self, styles: Dict[str, ParagraphStyle], width: float) -> Table:
        """
        Builds the standard framed state board candidate information grid:
        Seat No, Centre, School Index, GR No, Candidate Name, Class, Paper Name, Date.
        """
        full_name = (self.student.get_full_name() or self.student.username).upper()
        roll_no = getattr(self.student, "roll_number", None) or str(self.student.id)
        gr_no = getattr(self.student, "gr_number", None) or f"GR-{self.student.id:04d}"

        class_sec = (
            getattr(self.student, "class_section", None)
            or getattr(self.delivery, "target_class", None)
        )
        class_name = class_sec.name.upper() if class_sec else "CLASS X - GENERAL"

        paper_title = self.paper.title.upper()
        version_label = self.paper_version.version_label
        mode_label = self.delivery.mode.upper()
        exam_date = (
            self.attempt.submitted_at.strftime("%d-%b-%Y").upper()
            if self.attempt.submitted_at
            else timezone.now().strftime("%d-%b-%Y").upper()
        )

        col_w = [width * 0.20, width * 0.16, width * 0.20, width * 0.24, width * 0.20]

        data = [
            # Row 1: Labels
            [
                Paragraph("SEAT / ROLL NO.", styles["GridHeaderCenter"]),
                Paragraph("CENTRE CODE", styles["GridHeaderCenter"]),
                Paragraph("SCHOOL INDEX", styles["GridHeaderCenter"]),
                Paragraph("REGISTRATION NO. (G.R.)", styles["GridHeaderCenter"]),
                Paragraph("CANDIDATE TYPE", styles["GridHeaderCenter"]),
            ],
            # Row 2: Values
            [
                Paragraph(f"<b>{escape_pdf_text(roll_no)}</b>", styles["GridValueCenter"]),
                Paragraph("<b>012</b>", styles["GridValueCenter"]),
                Paragraph("<b>54.012</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{escape_pdf_text(gr_no)}</b>", styles["GridValueCenter"]),
                Paragraph("<b>REGULAR</b>", styles["GridValueCenter"]),
            ],
            # Row 3: Name & Class
            [
                Paragraph("CANDIDATE'S FULL NAME (SURNAME FIRST)", styles["GridHeader"]),
                "", "",  # Spanned
                Paragraph("CLASS &amp; DIVISION", styles["GridHeaderCenter"]),
                Paragraph("EXAM MEDIUM", styles["GridHeaderCenter"]),
            ],
            # Row 4: Name Values
            [
                Paragraph(f"<b>{escape_pdf_text(full_name)}</b>", styles["GridValue"]),
                "", "",
                Paragraph(f"<b>{escape_pdf_text(class_name)}</b>", styles["GridValueCenter"]),
                Paragraph("<b>ENGLISH</b>", styles["GridValueCenter"]),
            ],
            # Row 5: Examination Paper
            [
                Paragraph("SUBJECT / EXAMINATION PAPER", styles["GridHeader"]),
                "", "",
                Paragraph("DELIVERY / VERSION", styles["GridHeaderCenter"]),
                Paragraph("DATE OF EXAM", styles["GridHeaderCenter"]),
            ],
            # Row 6: Paper Values
            [
                Paragraph(f"<b>{escape_pdf_text(paper_title)}</b>", styles["GridValue"]),
                "", "",
                Paragraph(f"<b>v{version_label} • {mode_label}</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{exam_date}</b>", styles["GridValueCenter"]),
            ],
        ]

        table = Table(data, colWidths=col_w)
        table.setStyle(
            TableStyle([
                # Outer and inner border
                ("BOX", (0, 0), (-1, -1), 1.0, self.COLOR_BORDER_FRAME),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, self.COLOR_BORDER_GRID),
                # Spans for Candidate Full Name and Paper Title
                ("SPAN", (0, 2), (2, 2)),
                ("SPAN", (0, 3), (2, 3)),
                ("SPAN", (0, 4), (2, 4)),
                ("SPAN", (0, 5), (2, 5)),
                # Headers background
                ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_BG_HEADER),
                ("BACKGROUND", (0, 2), (-1, 2), self.COLOR_BG_HEADER),
                ("BACKGROUND", (0, 4), (-1, 4), self.COLOR_BG_HEADER),
                # Compact padding
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        return table

    def _build_summary_statement(self, styles: Dict[str, ParagraphStyle], width: float) -> Table:
        """
        Builds the board summary statement table:
        Grand Total, Minimum Passing, Total Scored, Percentage, Grade, and Classification.
        """
        score_val = float(self.attempt.score) if self.attempt.score is not None else 0.0
        max_score = float(self.attempt.max_score) if self.attempt.max_score else 0.0
        min_pass = round(max_score * 0.33, 2)
        pct = (score_val / max_score * 100.0) if max_score > 0 else 0.0

        grade_code, result_classification = compute_board_grade(pct)

        words_scored = marks_to_words(score_val)
        words_max = marks_to_words(max_score)

        col_w = [width * 0.20, width * 0.16, width * 0.16, width * 0.16, width * 0.12, width * 0.20]

        data = [
            [
                Paragraph("TOTAL MARKS OBTAINED", styles["GridHeaderCenter"]),
                Paragraph("MAXIMUM MARKS", styles["GridHeaderCenter"]),
                Paragraph("MIN. PASS (33%)", styles["GridHeaderCenter"]),
                Paragraph("PERCENTAGE", styles["GridHeaderCenter"]),
                Paragraph("GRADE", styles["GridHeaderCenter"]),
                Paragraph("EXAMINATION STATUS", styles["GridHeaderCenter"]),
            ],
            [
                Paragraph(f"<b>{score_val:g}</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{max_score:g}</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{min_pass:g}</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{pct:.2f}%</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{grade_code}</b>", styles["GridValueCenter"]),
                Paragraph(f"<b>{'QUALIFIED' if score_val >= min_pass else 'ELIGIBLE FOR IMPROVEMENT'}</b>", styles["GridValueCenter"]),
            ],
            [
                Paragraph(
                    f"<b>TOTAL MARKS IN WORDS :</b> {words_scored} OUT OF {words_max}",
                    styles["CellTextBold"],
                ),
                "", "", "", "", "",
            ],
            [
                Paragraph(
                    f"<b>FINAL CLASSIFICATION :</b> {result_classification}",
                    styles["CellTextBold"],
                ),
                "", "", "", "", "",
            ],
        ]

        table = Table(data, colWidths=col_w)
        table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 1.0, self.COLOR_BORDER_FRAME),
                ("INNERGRID", (0, 0), (-1, 1), 0.5, self.COLOR_BORDER_GRID),
                ("SPAN", (0, 2), (-1, 2)),
                ("SPAN", (0, 3), (-1, 3)),
                ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_BG_HEADER),
                ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F8FAFC")),
                ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#F1F5F9")),
                ("LINEBELOW", (0, 1), (-1, 1), 0.75, self.COLOR_BORDER_FRAME),
                ("LINEBELOW", (0, 2), (-1, 2), 0.5, self.COLOR_BORDER_GRID),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        return table

    def _build_statement_of_marks_table(self, styles: Dict[str, ParagraphStyle], width: float) -> List[Any]:
        """
        Builds the board statement table of itemized question performance.
        Accurately maps student responses using question_id (fixing the unattempted bug!).
        """
        items: List[Any] = []

        # Table Column Widths calculated dynamically to match printable width exactly (Sum = width):
        # Sr.(26), Question Detail(width - 216), Type(32), Max(28), Min(28), Obtained(48), In Words(54)
        col_w = [26, max(210.0, width - 216), 32, 28, 28, 48, 54]

        table_rows = [
            [
                Paragraph("<b>SR.</b>", styles["TableHdrCenter"]),
                Paragraph("<b>QUESTION SPECIFICATION &amp; CANDIDATE RESPONSE</b>", styles["TableHdr"]),
                Paragraph("<b>TYPE</b>", styles["TableHdrCenter"]),
                Paragraph("<b>MAX</b>", styles["TableHdrCenter"]),
                Paragraph("<b>MIN</b>", styles["TableHdrCenter"]),
                Paragraph("<b>OBTAINED</b>", styles["TableHdrCenter"]),
                Paragraph("<b>IN WORDS</b>", styles["TableHdrCenter"]),
            ]
        ]

        row_styles = [
            ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_BG_HEADER),
            ("BOX", (0, 0), (-1, -1), 1.0, self.COLOR_BORDER_FRAME),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, self.COLOR_BORDER_GRID),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]

        # ── BULLETPROOF ANSWER RETRIEVAL (Fixes the unattempted bug) ──
        # 1. Map by question_id integer
        answers_list = list(self.attempt.answers.all().order_by("id"))
        answers_by_qid: Dict[int, Any] = {}
        for ans in answers_list:
            if ans.question_id is not None:
                answers_by_qid[int(ans.question_id)] = ans

        snapshot = self.paper_version.question_snapshot or []

        # If snapshot is empty, fallback to the answers' snapshots
        if not snapshot and answers_list:
            snapshot = [ans.question_snapshot for ans in answers_list if ans.question_snapshot]

        total_max_marks = 0.0
        total_scored_marks = 0.0

        for idx, q in enumerate(snapshot, start=1):
            # Extract question_id supporting both 'question_id' and 'id'
            raw_qid = q.get("question_id") or q.get("id")
            qid_int = int(raw_qid) if raw_qid is not None else None

            # Look up answer by question_id or by positional index
            ans = None
            if qid_int is not None and qid_int in answers_by_qid:
                ans = answers_by_qid[qid_int]
            elif idx - 1 < len(answers_list):
                ans = answers_list[idx - 1]

            q_type = str(q.get("question_type", "")).upper()
            q_text = escape_pdf_text(q.get("question_text", ""))
            max_m = float(q.get("marks", 1))
            min_m = round(max_m * 0.33, 2)
            total_max_marks += max_m

            # Options dictionary for MCQs
            options = q.get("options")
            if not isinstance(options, dict) and ans and isinstance(ans.question_snapshot.get("options"), dict):
                options = ans.question_snapshot.get("options")

            # Check if student attempted the question
            student_resp_raw = (ans.student_response if ans else "") or ""
            student_resp_clean = str(student_resp_raw).strip()
            has_attempted = len(student_resp_clean) > 0

            # Format student response text
            if has_attempted:
                # If MCQ choice matches an option letter
                if isinstance(options, dict) and student_resp_clean in options:
                    opt_val = escape_pdf_text(options[student_resp_clean])
                    resp_display = f"Option ({student_resp_clean}) : {opt_val}"
                else:
                    resp_display = escape_pdf_text(student_resp_clean)
            else:
                resp_display = "Not Attempted"

            # Official Correct Key
            correct_key_raw = q.get("correct_answer") or (ans.question_snapshot.get("correct_answer") if ans else "")
            if isinstance(options, dict) and str(correct_key_raw) in options:
                opt_key_val = escape_pdf_text(options[str(correct_key_raw)])
                key_display = f"Option ({correct_key_raw}) : {opt_key_val}"
            else:
                key_display = escape_pdf_text(str(correct_key_raw or "—"))

            # Awarded marks
            awarded = float(ans.marks_awarded) if (ans and ans.marks_awarded is not None) else None

            if awarded is not None:
                total_scored_marks += awarded
                score_str = f"{awarded:g}" if awarded % 1 == 0 else f"{awarded:.1f}"
                words_str = marks_to_words(awarded)
            elif not has_attempted:
                score_str = "0"
                words_str = "ZERO"
            else:
                score_str = "—"
                words_str = "PENDING"

            resp_style = styles["QAnswerAttempted"] if has_attempted else styles["QAnswerUnattempted"]

            detail_elements = [
                Paragraph(f"<b>Q{idx:02d}.</b> {q_text}", styles["QText"]),
                Spacer(1, 0.8 * mm),
                Paragraph(
                    f"<b>Candidate's Response:</b> {resp_display}",
                    resp_style,
                ),
            ]
            if key_display and key_display != "—":
                detail_elements.append(Spacer(1, 0.4 * mm))
                detail_elements.append(
                    Paragraph(
                        f"<b>Reference Key:</b> {key_display}",
                        styles["QKey"],
                    )
                )

            type_short = "MCQ" if "MCQ" in q_type else ("SHORT" if "SHORT" in q_type else "LONG")

            table_rows.append([
                Paragraph(f"{idx:02d}", styles["QNum"]),
                detail_elements,
                Paragraph(type_short, styles["QType"]),
                Paragraph(f"{max_m:g}", styles["CellTextBold"]),
                Paragraph(f"{min_m:g}", styles["CellText"]),
                Paragraph(f"<b>{score_str}</b>", styles["CellTextBold"]),
                Paragraph(words_str, styles["CellText"]),
            ])

            row_i = len(table_rows) - 1
            if row_i % 2 == 0:
                row_styles.append(("BACKGROUND", (0, row_i), (-1, row_i), self.COLOR_BG_ZEBRA))

        # ── GRAND TOTAL ROW ──
        total_min_pass = round(total_max_marks * 0.33, 2)
        total_words = marks_to_words(total_scored_marks)

        table_rows.append([
            Paragraph("<b>GRAND TOTAL STATEMENT OF MARKS</b>", styles["CellTextBold"]),
            "",
            Paragraph("—", styles["QType"]),
            Paragraph(f"<b>{total_max_marks:g}</b>", styles["CellTextBold"]),
            Paragraph(f"<b>{total_min_pass:g}</b>", styles["CellTextBold"]),
            Paragraph(f"<b>{total_scored_marks:g}</b>", styles["CellTextBold"]),
            Paragraph(f"<b>{total_words}</b>", styles["CellTextBold"]),
        ])
        last_idx = len(table_rows) - 1
        row_styles.append(("SPAN", (0, last_idx), (1, last_idx)))
        row_styles.append(("BACKGROUND", (0, last_idx), (-1, last_idx), self.COLOR_BG_HEADER))
        row_styles.append(("LINEABOVE", (0, last_idx), (-1, last_idx), 1.0, self.COLOR_BORDER_FRAME))
        row_styles.append(("LEFTPADDING", (0, last_idx), (1, last_idx), 6))

        q_table = Table(table_rows, colWidths=col_w, repeatRows=1)
        q_table.setStyle(TableStyle(row_styles))
        items.append(q_table)

        return items

    def _build_grading_scale_box(self, styles: Dict[str, ParagraphStyle], width: float) -> Table:
        """
        Builds Gujarat State Board grading scale reference table.
        """
        data = [
            [
                Paragraph("<b>GSEB / CBSE STATUTORY GRADING SCALE REFERENCE :</b>", styles["GridHeader"]),
            ],
            [
                Paragraph(
                    "<b>A1:</b> 91–100% (Outstanding) &nbsp;|&nbsp; "
                    "<b>A2:</b> 81–90% (Excellent) &nbsp;|&nbsp; "
                    "<b>B1:</b> 71–80% (Very Good) &nbsp;|&nbsp; "
                    "<b>B2:</b> 61–70% (Good) &nbsp;|&nbsp; "
                    "<b>C1:</b> 51–60% (Above Average) &nbsp;|&nbsp; "
                    "<b>C2:</b> 41–50% (Average) &nbsp;|&nbsp; "
                    "<b>D:</b> 33–40% (Pass Standard) &nbsp;|&nbsp; "
                    "<b>E1:</b> Below 33% (Eligible for Improvement)",
                    styles["StatutoryNotice"],
                ),
            ],
        ]
        table = Table(data, colWidths=[width])
        table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.6, self.COLOR_BORDER_LIGHT),
                ("BACKGROUND", (0, 0), (-1, -1), self.COLOR_BG_ZEBRA),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ])
        )
        return table

    def _build_official_signatures(self, styles: Dict[str, ParagraphStyle], width: float) -> KeepTogether:
        """
        Builds the formal board signature blocks and circular seal box.
        """
        w_col = width / 3.0
        teacher = self.delivery.created_by
        teacher_name = (teacher.get_full_name() or teacher.username if teacher else "FACULTY EXAMINER").upper()
        now_date = timezone.now().strftime("%d-%b-%Y").upper()

        seal_inner = Table(
            [
                [Paragraph("<b>OFFICIAL BOARD SEAL</b>", styles["SealTitle"])],
                [Paragraph("GOVT. RECOGNIZED", styles["SealSub"])],
                [Paragraph("EXAMINATION DIVISION", styles["SealSub"])],
            ],
            colWidths=[w_col * 0.76],
        )
        seal_inner.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.8, self.COLOR_BORDER_FRAME),
                ("BACKGROUND", (0, 0), (-1, -1), self.COLOR_BG_HEADER),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ])
        )

        data = [
            [
                Paragraph("<b>PREPARED &amp; CHECKED BY</b>", styles["SignTitle"]),
                Paragraph("<b>INSTITUTIONAL SEAL</b>", styles["SignTitle"]),
                Paragraph("<b>CONTROLLER OF EXAMINATIONS</b>", styles["SignTitle"]),
            ],
            [
                Paragraph(
                    f"<br/><br/><br/>____________________________<br/>"
                    f"<b>{escape_pdf_text(teacher_name)}</b><br/>"
                    f"Faculty Examiner / Scrutinizer<br/>"
                    f"Date: {now_date}",
                    styles["SignSub"],
                ),
                seal_inner,
                Paragraph(
                    "<br/><br/><br/>____________________________<br/>"
                    "<b>HEAD OF INSTITUTION</b><br/>"
                    "Secretary / Principal<br/>"
                    "Official Authority",
                    styles["SignSub"],
                ),
            ],
            [
                Paragraph(
                    "<b>IMPORTANT STATUTORY NOTICE:</b> This statement of marks is issued under the authority "
                    "of the Examination Regulations. Any alteration, erasure, or unauthorized tampering renders "
                    "this transcript completely null and void. Candidates must retain this document for official records.",
                    styles["StatutoryNotice"],
                ),
                "", "",
            ],
        ]

        table = Table(data, colWidths=[w_col, w_col, w_col])
        table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.75, self.COLOR_BORDER_FRAME),
                ("LINEBEFORE", (1, 0), (1, 1), 0.5, self.COLOR_BORDER_GRID),
                ("LINEBEFORE", (2, 0), (2, 1), 0.5, self.COLOR_BORDER_GRID),
                ("SPAN", (0, 2), (-1, 2)),
                ("BACKGROUND", (0, 0), (-1, 0), self.COLOR_BG_HEADER),
                ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F1F5F9")),
                ("LINEABOVE", (0, 2), (-1, 2), 0.5, self.COLOR_BORDER_FRAME),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        return KeepTogether([table])


def build_attempt_scorecard_pdf(attempt: Any) -> bytes:
    """Convenience helper function to generate the official scorecard PDF for an Attempt."""
    service = StudentScorecardPdfService(attempt=attempt)
    return service.generate()

