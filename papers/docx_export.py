"""
papers/docx_export.py

Professional Microsoft Word (.docx) Examination Paper and Answer Key Generator.
Supports:
- Institutional Exam Header (School name, Paper title, Version, Duration, Max marks).
- Instructions Banner and Candidate Identification Grid (Name, Roll No, Date, Invigilator).
- Standard Pedagogical Section Grouping (Section A: MCQs, Section B: Short, Section C: Long).
- Configurable Blank Writing Lines:
  - Universal baseline (e.g. N blank lines per mark).
  - Per-question individual overrides (teacher can give 10 lines to a 3-mark derivation and 4 to a 3-mark definition).
- Synchronized Teacher Answer Key with correct choices, model solutions, and topic tags.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import re
from typing import Any, Dict, List, Optional, Union

import docx
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Inches, Pt, RGBColor

from papers.models import PaperVersion
from papers.publishing import ExamSection, FormattedExamQuestion, PaperPublishingService

logger = logging.getLogger(__name__)


class ExamPaperDocxService:
    """
    Generates publication-ready Word (.docx) exam papers and answer keys.
    """

    COLOR_PRIMARY = RGBColor(30, 41, 59)      # Dark Navy #1E293B
    COLOR_INDIGO = RGBColor(67, 56, 202)      # Indigo #4338CA
    COLOR_MUTED = RGBColor(100, 116, 139)     # Slate Grey #64748B
    COLOR_LINE = RGBColor(160, 174, 192)      # Ruled line color #A0AEC0
    COLOR_CORRECT = RGBColor(21, 128, 61)     # Green #15803D

    def __init__(self):
        self.publishing_service = PaperPublishingService()

    @staticmethod
    def clean_paper_title(raw_title: Optional[str], subjects: Optional[List[str]] = None) -> str:
        """
        Normalize examination title, stripping underscores and raw OCR artifact tags.
        Matches frontend PrintablePaperSheet clean title logic.
        """
        if not raw_title or not str(raw_title).strip():
            return "EXAMINATION PAPER"
        formatted = str(raw_title).replace("_", " ").strip()
        if "---" in formatted or re.search(r"\[page\s*\d+\]", formatted, re.IGNORECASE):
            prefix = formatted.split(":")[0].strip()
            # If prefix is a raw textbook code like kech201, detect subject or fallback
            if re.match(r"^[a-zA-Z]{2,5}\d{1,5}$", prefix):
                prefix_l = prefix.lower()
                if prefix_l.startswith(("kech", "hech")):
                    return "Chemistry Exam Paper"
                elif prefix_l.startswith(("kepy", "hepy")):
                    return "Physics Exam Paper"
                elif prefix_l.startswith(("kebo", "hebo", "khbo")):
                    return "Biology Exam Paper"
                elif prefix_l.startswith(("kemh", "jemh", "hemh")):
                    return "Mathematics Exam Paper"
                elif prefix_l.startswith(("kecs", "hecs")):
                    return "Computer Science Exam Paper"
                elif prefix_l.startswith(("kesc", "jesc", "hesc")):
                    return "Science Exam Paper"
                elif prefix_l.startswith("khgy"):
                    return "Geography Exam Paper"
                elif prefix_l.startswith("khat"):
                    return "Hindi Exam Paper"
                elif prefix_l.startswith("khsk"):
                    return "Sanskrit Exam Paper"
                elif prefix_l.startswith("kesy"):
                    return "Sociology Exam Paper"
                elif subjects:
                    valid_s = [
                        s for s in subjects
                        if s and not re.match(r"^[a-zA-Z]{2,5}\d{1,5}$", s.strip()) and not s.lower().endswith(".pdf")
                    ]
                    if valid_s:
                        return f"{valid_s[0]} Exam Paper"
                return "Exam Paper"

            if prefix and "-" not in prefix:
                formatted = f"{prefix} Exam Paper"
            else:
                formatted = "Exam Paper"
        return formatted

    @classmethod
    def clean_academic_caption(cls, raw: Optional[str]) -> str:
        """
        Universally cleans diagram captions across all subjects (Chemistry, Physics, Biology,
        Math, History, Geography, Accounts, etc.) and all PDF sources (NCERT, state boards, teacher uploads).
        Calls PdfInspectionService.clean_academic_caption with robust regex fallback.
        """
        if not raw or not str(raw).strip():
            return ""
        try:
            from papers.services.pdf_harvester import PdfInspectionService
            cleaned = PdfInspectionService.clean_academic_caption(raw)
            if cleaned:
                return cleaned
        except Exception:
            pass

        # Standalone heuristic fallback
        text = str(raw).strip().replace("\u00a0", " ").replace("\u200b", "")
        font_fixes = [
            (r"3DpHU\s*FKURPDWRJUDpK[\\\/]?", "Paper Chromatography"),
            (r"&KURPDWRJUDpK[\\\/]?", "Chromatography"),
            (r"FKURPDWRJUDpK[\\\/]?", "Chromatography"),
            (r"3DpHU", "Paper"),
            (r"pDpHU", "Paper"),
            (r"sKDpHs", "Phases"),
            (r"['\u2018\u2019]?LIIHUHQWLDO\s*H\[WUDFWLRQ", "Differential Extraction"),
            (r"['\u2018\u2019]?LIIHUHQWLDO", "Differential"),
            (r"H\[WUDFWLRQ", "Extraction"),
            (r"\(\[WUDFWLRQ\s+RI\s+FRP", "(Extraction of Compound)"),
            (r"\bCfd\.?\s*([0-9])", r"Fig. \1"),
            (r"\bCfd\b", "Fig."),
            (r"[\(\[]?\)?ractional\b", "Fractional"),
            (r"\b6IMmLE\b", "Simple"),
            (r"\b6imple\b", "Simple"),
            (r"\bMolyibj\b", "Problem"),
            (r"\bMroblem\b", "Problem"),
            (r"[\(\[]?\b(?:S|s)timation\b", "Estimation"),
            (r":ater\b", "Water"),
            (r"\b7he\b", "The"),
            (r"\bVAmOURp\b", "Vapours"),
            (r"\bSubptance\b", "Substance"),
            (r"\bPotappium\b", "Potassium"),
            (r"\bABpORBED\b", "Absorbed"),
            (r"\bANHYDROUp\b", "Anhydrous"),
            (r"\bSolutionp\b", "Solutions"),
            (r"\bpolutionp\b", "solutions"),
            (r"\bDIpTILLATION\b", "Distillation"),
            (r"\bFLApK\b", "Flask"),
            (r"\bFIRpT\b", "First"),
            (r"\bFRACTIONp\b", "Fractions"),
            (r"\bTOm\b", "Top"),
        ]
        for pattern, repl in font_fixes:
            text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

        text = re.sub(r"^[\s\'\"\`\-\:\;\(\[\{]+", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:70].strip()

    def generate_student_paper(
        self,
        version: PaperVersion,
        lines_per_mark: int = 2,
        question_line_overrides: Optional[Dict[Union[str, int], int]] = None,
        line_style: str = "dotted",
    ) -> io.BytesIO:
        """
        Generate a student question paper Word (.docx) document with blank writing lines.
        """
        overrides = {str(k): int(v) for k, v in (question_line_overrides or {}).items()}
        sections = self.publishing_service.compile_sections(version)

        paper_title = self.clean_paper_title(
            getattr(version.paper, "title", "EXAMINATION PAPER"),
            subjects=getattr(version.paper, "subjects", []),
        )
        doc = docx.Document()
        self._configure_page_layout(doc, title=paper_title, is_answer_key=False)

        # 1. Institutional Header
        self._add_institutional_header(doc, version)

        # 2. Candidate Identification Box
        self._add_candidate_identification_table(doc)

        # 3. Candidate Instructions (if provided)
        self._add_instructions_box(doc, version)

        # 4. Sections & Questions Body
        for sec in sections:
            if not sec.questions:
                continue

            self._add_section_header(doc, sec)

            for q in sec.questions:
                # Calculate required blank lines for this question
                q_id_str = str(q.question_id)
                if q_id_str in overrides:
                    blank_lines = max(0, overrides[q_id_str])
                else:
                    if q.question_type == "MCQ":
                        blank_lines = 0
                    else:
                        blank_lines = max(0, int(round(q.marks * lines_per_mark)))

                self._add_student_question(doc, q, blank_lines=blank_lines, line_style=line_style)

        # 5. End of Paper Marker
        self._add_end_marker(doc, is_answer_key=False)

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf

    def generate_answer_key(self, version: PaperVersion) -> io.BytesIO:
        """
        Generate a synchronized Teacher Answer Key and Marking Scheme Word (.docx) document.
        """
        sections = self.publishing_service.compile_sections(version)

        paper_title = self.clean_paper_title(
            getattr(version.paper, "title", "EXAMINATION PAPER"),
            subjects=getattr(version.paper, "subjects", []),
        )
        doc = docx.Document()
        self._configure_page_layout(doc, title=f"{paper_title} — ANSWER KEY", is_answer_key=True)

        # 1. Answer Key Title Header
        self._add_answer_key_header(doc, version)

        # 2. Sections & Solutions Body
        for sec in sections:
            if not sec.questions:
                continue

            self._add_section_header(doc, sec, is_answer_key=True)

            for q in sec.questions:
                self._add_teacher_solution(doc, q)

        # 3. End Marker
        self._add_end_marker(doc, is_answer_key=True)

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf

    # ---------------------------------------------------------------------------
    # Internal Document Styling & Builder Helpers
    # ---------------------------------------------------------------------------

    def _configure_page_layout(
        self,
        doc: docx.Document,
        title: str = "EXAMINATION PAPER",
        is_answer_key: bool = False,
    ) -> None:
        """
        Set standard A4 page dimensions, margins (matching 14mm/12mm print PDF),
        and professional running headers and footers.
        """
        for section in doc.sections:
            # Exact A4 portrait (210mm x 297mm)
            section.page_width = Inches(8.27)
            section.page_height = Inches(11.69)
            # Match print PDF: 14mm top, 12mm bottom, 14mm sides
            section.top_margin = Inches(0.55)
            section.bottom_margin = Inches(0.50)
            section.left_margin = Inches(0.55)
            section.right_margin = Inches(0.55)
            section.header_distance = Inches(0.30)
            section.footer_distance = Inches(0.25)
            section.different_first_page_header_footer = True

            # First page header is blank (page 1 has large institutional banner)
            p_first_hdr = section.first_page_header.paragraphs[0]
            p_first_hdr.text = ""

            # Running Header on page 2+ (Title on left, System brand on right, bottom border)
            header = section.header
            p_hdr = header.paragraphs[0]
            p_hdr.text = ""
            r_left = p_hdr.add_run(title.upper())
            r_left.font.name = "Calibri"
            r_left.font.size = Pt(8)
            r_left.bold = True
            r_left.font.color.rgb = RGBColor(55, 65, 81)  # Slate #374151

            # Printable width is 8.27 - 0.55 - 0.55 = 7.17 inches
            p_hdr.paragraph_format.tab_stops.add_tab_stop(Inches(7.17), WD_TAB_ALIGNMENT.RIGHT)
            p_hdr.add_run("\t")

            r_right = p_hdr.add_run("Question Generation System")
            r_right.font.name = "Calibri"
            r_right.font.size = Pt(8)
            r_right.font.color.rgb = RGBColor(107, 114, 128)  # Slate #6B7280

            # Subtle bottom rule under header (0.5pt #D1D5DB)
            pPr_hdr = p_hdr._p.get_or_add_pPr()
            pBdr_hdr = parse_xml(
                f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="4" w:space="2" w:color="D1D5DB"/></w:pBdr>'
            )
            pPr_hdr.append(pBdr_hdr)

            # Running Footers on both page 1 and subsequent pages (Centered 'Page X of Y' with top rule)
            for ftr in [section.first_page_footer, section.footer]:
                p_ftr = ftr.paragraphs[0]
                p_ftr.text = ""
                p_ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER

                # Subtle top rule above footer (0.5pt #E5E7EB)
                pPr_ftr = p_ftr._p.get_or_add_pPr()
                pBdr_ftr = parse_xml(
                    f'<w:pBdr {nsdecls("w")}><w:top w:val="single" w:sz="4" w:space="2" w:color="E5E7EB"/></w:pBdr>'
                )
                pPr_ftr.append(pBdr_ftr)

                r_p1 = p_ftr.add_run("Page ")
                r_p1.font.name = "Calibri"
                r_p1.font.size = Pt(8)
                r_p1.font.color.rgb = RGBColor(107, 114, 128)

                fld_curr = parse_xml(f'<w:fldSimple {nsdecls("w")} w:instr="PAGE"/>')
                p_ftr._p.append(fld_curr)

                r_p2 = p_ftr.add_run(" of ")
                r_p2.font.name = "Calibri"
                r_p2.font.size = Pt(8)
                r_p2.font.color.rgb = RGBColor(107, 114, 128)

                fld_total = parse_xml(f'<w:fldSimple {nsdecls("w")} w:instr="NUMPAGES"/>')
                p_ftr._p.append(fld_total)

        # Normal text style
        normal_style = doc.styles["Normal"]
        normal_style.font.name = "Calibri"
        normal_style.font.size = Pt(11)
        normal_style.font.color.rgb = self.COLOR_PRIMARY

    def _add_institutional_header(self, doc: docx.Document, version: PaperVersion) -> None:
        """Add school name, examination title, metadata row, and subjects."""
        paper = version.paper
        school_name = getattr(paper.school, "name", "ACADEMIC INSTITUTION").upper() if paper.school else "ACADEMIC INSTITUTION"

        # School Name
        p_school = doc.add_paragraph()
        p_school.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_school.paragraph_format.space_before = Pt(0)
        p_school.paragraph_format.space_after = Pt(2)
        r_school = p_school.add_run(school_name)
        r_school.bold = True
        r_school.font.size = Pt(13)
        r_school.font.color.rgb = self.COLOR_PRIMARY

        # Paper Title (Cleaned)
        p_title = doc.add_paragraph()
        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_title.paragraph_format.space_before = Pt(0)
        p_title.paragraph_format.space_after = Pt(4)
        clean_title = self.clean_paper_title(paper.title, subjects=paper.subjects)
        r_title = p_title.add_run(clean_title.upper())
        r_title.bold = True
        r_title.font.size = Pt(16)
        r_title.font.color.rgb = self.COLOR_INDIGO

        # Metadata Row
        p_meta = doc.add_paragraph()
        p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_meta.paragraph_format.space_before = Pt(0)
        p_meta.paragraph_format.space_after = Pt(4)

        items = [
            f"VERSION: {version.version_label}",
            f"TOTAL MARKS: {float(version.total_marks or 0.0):g}",
        ]
        if paper.duration_minutes:
            items.append(f"TIME ALLOWED: {paper.duration_minutes} MIN")
        if version.question_snapshot:
            items.append(f"QUESTIONS: {len(version.question_snapshot)}")

        r_meta = p_meta.add_run("   |   ".join(items))
        r_meta.bold = True
        r_meta.font.size = Pt(9.5)
        r_meta.font.color.rgb = self.COLOR_MUTED

        # Filtered Subjects (matching PrintablePaperSheet logic)
        valid_subjects = [
            s.strip()
            for s in (paper.subjects or [])
            if s
            and not s.lower().endswith(".pdf")
            and "page" not in s.lower()
            and "---" not in s
            and not re.match(r"^[a-zA-Z]{2,5}\d{1,5}$", s.strip())
        ]
        if valid_subjects:
            p_sub = doc.add_paragraph()
            p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_sub.paragraph_format.space_before = Pt(0)
            p_sub.paragraph_format.space_after = Pt(8)
            lbl = "SUBJECT" if len(valid_subjects) == 1 else "SUBJECTS"
            r_sub = p_sub.add_run(f"{lbl}: {' • '.join(valid_subjects)}")
            r_sub.font.size = Pt(9)
            r_sub.font.color.rgb = self.COLOR_MUTED

    def _add_answer_key_header(self, doc: docx.Document, version: PaperVersion) -> None:
        """Header for Teacher Answer Key and Solution Scheme."""
        paper = version.paper
        school_name = getattr(paper.school, "name", "ACADEMIC INSTITUTION").upper() if paper.school else "ACADEMIC INSTITUTION"

        p_school = doc.add_paragraph()
        p_school.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_school.paragraph_format.space_after = Pt(2)
        r_school = p_school.add_run(school_name)
        r_school.bold = True
        r_school.font.size = Pt(12)
        r_school.font.color.rgb = self.COLOR_MUTED

        p_title = doc.add_paragraph()
        p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_title.paragraph_format.space_after = Pt(3)
        clean_title = self.clean_paper_title(paper.title, subjects=paper.subjects)
        r_title = p_title.add_run(f"{clean_title.upper()} — ANSWER KEY")
        r_title.bold = True
        r_title.font.size = Pt(16)
        r_title.font.color.rgb = self.COLOR_CORRECT

        p_sub = doc.add_paragraph()
        p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_sub.paragraph_format.space_after = Pt(10)
        r_sub = p_sub.add_run(f"OFFICIAL MARKING SCHEME & MODEL SOLUTIONS  |  VERSION {version.version_label}")
        r_sub.bold = True
        r_sub.font.size = Pt(9.5)
        r_sub.font.color.rgb = self.COLOR_PRIMARY

    def _add_candidate_identification_table(self, doc: docx.Document) -> None:
        """2x2 bordered grid for student identification details calibrated to A4 width."""
        table = doc.add_table(rows=2, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False

        # Calibrate to printable width: 8.27 in - 2 * 0.55 in = 7.17 in
        col_widths = [Inches(3.58), Inches(3.58)]
        for row in table.rows:
            for i, cell in enumerate(row.cells):
                cell.width = col_widths[i]

        cells = table.rows[0].cells
        self._format_meta_cell(cells[0], "STUDENT NAME:", "_" * 27)
        self._format_meta_cell(cells[1], "EXAMINATION DATE:", "_" * 22, align_right=True)

        cells_2 = table.rows[1].cells
        self._format_meta_cell(cells_2[0], "ROLL / ADMISSION ID:", "_" * 19)
        self._format_meta_cell(cells_2[1], "INVIGILATOR SIGNATURE:", "_" * 18, align_right=True)

        self._set_table_borders(table)
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def _format_meta_cell(self, cell, label: str, fill_line: str, align_right: bool = False) -> None:
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        if align_right:
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_label = p.add_run(f"{label} ")
        r_label.bold = True
        r_label.font.size = Pt(8.5)
        r_label.font.color.rgb = self.COLOR_PRIMARY
        r_line = p.add_run(fill_line)
        r_line.font.size = Pt(8.5)
        r_line.font.color.rgb = self.COLOR_MUTED

    def _set_table_borders(self, table) -> None:
        """Apply subtle borders around a docx table."""
        tblPr = table._tbl.tblPr
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>\n'
            f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>\n'
            f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>\n'
            f'  <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>\n'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

    def _add_instructions_box(self, doc: docx.Document, version: PaperVersion) -> None:
        instructions = (version.paper.instructions or "").strip()
        if not instructions:
            return

        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.rows[0].cells[0]
        cell.width = Inches(7.0)

        # Background color #F8FAFC
        tcPr = cell._tc.get_or_add_tcPr()
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F8FAFC"/>')
        tcPr.append(shd)

        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        r_prefix = p.add_run("GENERAL INSTRUCTIONS: ")
        r_prefix.bold = True
        r_prefix.font.size = Pt(8.5)
        r_prefix.font.color.rgb = self.COLOR_PRIMARY

        r_text = p.add_run(instructions)
        r_text.italic = True
        r_text.font.size = Pt(8.5)
        r_text.font.color.rgb = self.COLOR_PRIMARY

        self._set_table_borders(table)
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def _add_section_header(self, doc: docx.Document, sec: ExamSection, is_answer_key: bool = False) -> None:
        """
        Render a formal academic section banner matching the PDF layout:
        - Dual solid top & bottom borders.
        - High-contrast background shading (#F1F5F9).
        - Left cell: Section title & candidate instructions.
        - Right cell: Dynamic [X Questions • Y Marks] badge.
        """
        p_pre = doc.add_paragraph()
        p_pre.paragraph_format.space_before = Pt(10)
        p_pre.paragraph_format.space_after = Pt(0)
        p_pre.paragraph_format.keep_with_next = True

        tbl = doc.add_table(rows=1, cols=2)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False

        col_widths = [Inches(5.17), Inches(2.00)]
        row = tbl.rows[0]
        for i, cell in enumerate(row.cells):
            cell.width = col_widths[i]

        for cell in row.cells:
            tcPr = cell._tc.get_or_add_tcPr()
            tcPr.append(parse_xml(f'<w:shd {nsdecls("w")} w:fill="F1F5F9"/>'))
            mar = parse_xml(
                f'<w:tcMar {nsdecls("w")}>'
                f'  <w:top w:w="120" w:type="dxa"/>'
                f'  <w:left w:w="140" w:type="dxa"/>'
                f'  <w:bottom w:w="120" w:type="dxa"/>'
                f'  <w:right w:w="140" w:type="dxa"/>'
                f'</w:tcMar>'
            )
            tcPr.append(mar)

        border_color = "000000" if not is_answer_key else "15803D"
        tblPr = tbl._tbl.tblPr
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>\n'
            f'  <w:top w:val="single" w:sz="16" w:space="0" w:color="{border_color}"/>\n'
            f'  <w:bottom w:val="single" w:sz="16" w:space="0" w:color="{border_color}"/>\n'
            f'  <w:left w:val="none"/>\n'
            f'  <w:right w:val="none"/>\n'
            f'  <w:insideH w:val="none"/>\n'
            f'  <w:insideV w:val="none"/>\n'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))

        # Left cell: Title & instructions
        p_left = row.cells[0].paragraphs[0]
        p_left.paragraph_format.space_before = Pt(2)
        p_left.paragraph_format.space_after = Pt(1)
        p_left.paragraph_format.keep_with_next = True
        r_t = p_left.add_run(sec.title.upper())
        r_t.bold = True
        r_t.font.name = "Calibri"
        r_t.font.size = Pt(10)
        r_t.font.color.rgb = RGBColor(15, 23, 42) if not is_answer_key else self.COLOR_CORRECT

        if sec.instructions and not is_answer_key:
            p_inst = row.cells[0].add_paragraph()
            p_inst.paragraph_format.space_before = Pt(0)
            p_inst.paragraph_format.space_after = Pt(2)
            p_inst.paragraph_format.keep_with_next = True
            r_i = p_inst.add_run(sec.instructions)
            r_i.italic = True
            r_i.font.name = "Calibri"
            r_i.font.size = Pt(8.5)
            r_i.font.color.rgb = RGBColor(71, 85, 105)

        # Right cell: [X Questions • Y Marks]
        p_right = row.cells[1].paragraphs[0]
        p_right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_right.paragraph_format.space_before = Pt(2)
        p_right.paragraph_format.space_after = Pt(2)
        p_right.paragraph_format.keep_with_next = True
        q_label = "Question" if len(sec.questions) == 1 else "Questions"
        r_m = p_right.add_run(f"[{len(sec.questions)} {q_label} • {sec.total_marks:g} Marks]")
        r_m.bold = True
        r_m.font.name = "Calibri"
        r_m.font.size = Pt(8.5)
        r_m.font.color.rgb = RGBColor(15, 23, 42) if not is_answer_key else self.COLOR_CORRECT

        p_post = doc.add_paragraph()
        p_post.paragraph_format.space_before = Pt(0)
        p_post.paragraph_format.space_after = Pt(4)
        p_post.paragraph_format.keep_with_next = True

    def _is_rtl_text(self, text: str) -> bool:
        """Detect if text contains Arabic/Urdu/Persian script."""
        if not text:
            return False
        return bool(re.search(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]", text))

    def _set_paragraph_rtl(self, paragraph: docx.text.paragraph.Paragraph) -> None:
        """Enable right-to-left bidi rendering in Word."""
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        pPr = paragraph._p.get_or_add_pPr()
        if pPr.find(qn("w:bidi")) is None:
            pPr.append(parse_xml(f'<w:bidi {nsdecls("w")}/>'))

    def _set_run_rtl(self, run: docx.text.run.Run) -> None:
        """Enable right-to-left run bidi rendering in Word."""
        rPr = run._r.get_or_add_rPr()
        if rPr.find(qn("w:rtl")) is None:
            rPr.append(parse_xml(f'<w:rtl {nsdecls("w")}/>'))

    def _render_case_study_box(self, doc: docx.Document, passage: str, is_rtl: bool = False) -> None:
        """Render a dedicated, highlighted callout box for a shared case study / reading comprehension passage."""
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False

        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)

        left_color = "0284C7" if not is_rtl else "CBD5E1"
        right_color = "0284C7" if is_rtl else "CBD5E1"
        left_sz = "24" if not is_rtl else "6"
        right_sz = "24" if is_rtl else "6"

        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'  <w:left w:val="single" w:sz="{left_sz}" w:space="0" w:color="{left_color}"/>'
            f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'  <w:right w:val="single" w:sz="{right_sz}" w:space="0" w:color="{right_color}"/>'
            f'</w:tcBorders>'
        )
        cell._tc.get_or_add_tcPr().append(borders)
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F0F9FF"/>')
        cell._tc.get_or_add_tcPr().append(shd)

        mar = parse_xml(
            f'<w:tcMar {nsdecls("w")}>'
            f'  <w:top w:w="120" w:type="dxa"/>'
            f'  <w:left w:w="160" w:type="dxa"/>'
            f'  <w:bottom w:w="120" w:type="dxa"/>'
            f'  <w:right w:w="160" w:type="dxa"/>'
            f'</w:tcMar>'
        )
        cell._tc.get_or_add_tcPr().append(mar)

        cp = cell.paragraphs[0]
        if is_rtl:
            self._set_paragraph_rtl(cp)
        cp.paragraph_format.space_before = Pt(2)
        cp.paragraph_format.space_after = Pt(3)

        hdr_text = "مطالعہ عبارت / CASE STUDY PASSAGE:\n" if is_rtl else "CASE STUDY / COMPREHENSION PASSAGE:\n"
        r_hdr = cp.add_run(hdr_text)
        r_hdr.bold = True
        r_hdr.font.size = Pt(9.5)
        r_hdr.font.color.rgb = RGBColor(3, 105, 161)
        if is_rtl:
            self._set_run_rtl(r_hdr)

        r_txt = cp.add_run(passage.strip())
        r_txt.font.size = Pt(9.5)
        r_txt.italic = True
        r_txt.font.color.rgb = RGBColor(30, 41, 59)
        if is_rtl:
            self._set_run_rtl(r_txt)

    def _parse_content_blocks(self, text: str) -> List[Dict[str, Any]]:
        """
        Parses question text into structured blocks:
        - 'text': standard prose
        - 'code': fenced code block
        - 'table': markdown table
        """
        if not text:
            return []

        pattern = re.compile(
            r'(```[a-zA-Z0-9_-]*\r?\n[\s\S]*?```|'
            r'(?:^|\n)[ \t]*\|[^\n]+\|[ \t]*(?:\r?\n[ \t]*\|(?:\s*:?-+:?\s*\|)+)+(?:\r?\n[ \t]*\|[^\n]+\|[ \t]*)+)',
            re.MULTILINE,
        )

        parts = pattern.split(text)
        blocks: List[Dict[str, Any]] = []

        for part in parts:
            if not part:
                continue
            trimmed = part.strip()
            if not trimmed:
                continue

            if trimmed.startswith('```') and trimmed.endswith('```'):
                lines = trimmed.splitlines()
                first_line = lines[0][3:].strip()
                lang = first_line.lower() if first_line else ""
                code_lines = lines[1:-1] if len(lines) >= 2 else []
                code_content = "\n".join(code_lines)
                if lang in ('smiles', 'chemical'):
                    b_type = 'chemical'
                elif lang in ('cladogram', 'taxonomy', 'tree'):
                    b_type = 'cladogram'
                elif lang in ('map', 'mapwork'):
                    b_type = 'map'
                else:
                    b_type = 'code'

                blocks.append({
                    'type': b_type,
                    'lang': lang,
                    'content': code_content,
                })
                continue

            if trimmed.startswith('|') and '\n' in trimmed and re.search(r'\|(?:\s*:?-+:?\s*\|)+', trimmed):
                lines = [l.strip() for l in trimmed.splitlines() if l.strip()]
                if len(lines) >= 2:
                    def parse_row(line: str) -> List[str]:
                        line = line.strip()
                        if line.startswith('|'):
                            line = line[1:]
                        if line.endswith('|'):
                            line = line[:-1]
                        return [c.strip() for c in line.split('|')]

                    headers = parse_row(lines[0])
                    sep_idx = -1
                    for idx, l in enumerate(lines[1:], start=1):
                        clean = l.replace('|', '').replace('-', '').replace(':', '').replace(' ', '')
                        if clean == '':
                            sep_idx = idx
                            break

                    data_lines = lines[sep_idx + 1:] if sep_idx != -1 else lines[1:]
                    data_rows = [parse_row(dl) for dl in data_lines]
                    blocks.append({
                        'type': 'table',
                        'headers': headers,
                        'rows': data_rows,
                    })
                    continue

            # Check for two-column match rows inside text (e.g. Column I / Column II or (a)... (p)...)
            match_row_pattern = re.compile(
                r"^\s*(\([a-zA-Z0-9ivxLCDM]+\)|[a-zA-Z0-9ivxLCDM]+[\.\)])\s*(.+?)\s{2,}(\([a-zA-Z0-9ivxLCDM]+\)|[a-zA-Z0-9ivxLCDM]+[\.\)])\s*(.+)$"
            )
            hdr_pattern = re.compile(
                r"^\s*(?:Column|List|ستون|सूची)\s*([A-Za-z0-9IV]+|[I|1])\s{2,}(?:Column|List|ستون|सूची)\s*([A-Za-z0-9IV]+|[II|2])\s*$",
                re.IGNORECASE
            )

            lines = [l.rstrip() for l in trimmed.splitlines()]
            start_idx = None
            end_idx = None
            matched_count = 0

            for idx, l in enumerate(lines):
                if match_row_pattern.match(l.strip()):
                    matched_count += 1
                    if start_idx is None:
                        if idx > 0 and hdr_pattern.match(lines[idx - 1].strip()):
                            start_idx = idx - 1
                        else:
                            start_idx = idx
                    end_idx = idx + 1
                else:
                    if start_idx is not None and not (idx > 0 and hdr_pattern.match(lines[idx - 1].strip())):
                        break

            if matched_count >= 2 and start_idx is not None and end_idx is not None:
                before_txt = "\n".join(lines[:start_idx]).strip()
                if before_txt:
                    blocks.append({'type': 'text', 'content': before_txt})

                tbl_lines = [l.strip() for l in lines[start_idx:end_idx] if l.strip()]
                has_hdr = bool(hdr_pattern.match(tbl_lines[0]))
                headers = ["Column I", "Column II"]
                data_rows = []

                if has_hdr:
                    m_hdr = hdr_pattern.match(tbl_lines[0])
                    headers = [f"Column {m_hdr.group(1)}", f"Column {m_hdr.group(2)}"]
                    data_lines = tbl_lines[1:]
                else:
                    data_lines = tbl_lines

                for dl in data_lines:
                    m_row = match_row_pattern.match(dl)
                    if m_row:
                        data_rows.append([f"{m_row.group(1)} {m_row.group(2).strip()}", f"{m_row.group(3)} {m_row.group(4).strip()}"])
                    else:
                        data_rows.append([dl, ""])

                blocks.append({
                    'type': 'table',
                    'headers': headers,
                    'rows': data_rows,
                })

                after_txt = "\n".join(lines[end_idx:]).strip()
                if after_txt:
                    blocks.append({'type': 'text', 'content': after_txt})
                continue

            blocks.append({
                'type': 'text',
                'content': trimmed,
            })

        return blocks

    def _render_code_block(self, doc: docx.Document, code: str, lang: str = "") -> None:
        """Render a formatted, shaded code block callout container."""
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False

        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)

        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'  <w:left w:val="single" w:sz="18" w:space="0" w:color="4338CA"/>'
            f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>'
            f'</w:tcBorders>'
        )
        cell._tc.get_or_add_tcPr().append(borders)
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F8FAFC"/>')
        cell._tc.get_or_add_tcPr().append(shd)

        mar = parse_xml(
            f'<w:tcMar {nsdecls("w")}>'
            f'  <w:top w:w="120" w:type="dxa"/>'
            f'  <w:left w:w="160" w:type="dxa"/>'
            f'  <w:bottom w:w="120" w:type="dxa"/>'
            f'  <w:right w:w="160" w:type="dxa"/>'
            f'</w:tcMar>'
        )
        cell._tc.get_or_add_tcPr().append(mar)

        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(3)
        cp.paragraph_format.space_after = Pt(3)

        lines = code.split("\n")
        for i, line in enumerate(lines):
            r = cp.add_run(line)
            r.font.name = "Consolas"
            r.font.size = Pt(8.5)
            r.font.color.rgb = RGBColor(30, 41, 59)
            if i < len(lines) - 1:
                cp.add_run("\n")

    def _render_chemical_structure_box(self, doc: docx.Document, smiles: str) -> None:
        """Render a styled 2D chemical structure & molecular formula container."""
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False

        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)

        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="0284C7"/>'
            f'  <w:left w:val="single" w:sz="18" w:space="0" w:color="0284C7"/>'
            f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="0284C7"/>'
            f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="0284C7"/>'
            f'</w:tcBorders>'
        )
        cell._tc.get_or_add_tcPr().append(borders)
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F0F9FF"/>')
        cell._tc.get_or_add_tcPr().append(shd)

        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(3)
        cp.paragraph_format.space_after = Pt(3)
        r_hdr = cp.add_run("[2D CHEMICAL STRUCTURE & SKELETAL FORMULA]\n")
        r_hdr.bold = True
        r_hdr.font.size = Pt(8.5)
        r_hdr.font.color.rgb = RGBColor(2, 132, 199)

        r_body = cp.add_run(f"Molecular SMILES / Structure: {smiles.strip()}")
        r_body.font.name = "Consolas"
        r_body.font.size = Pt(9)
        r_body.font.color.rgb = RGBColor(15, 23, 42)

    def _render_cladogram_box(self, doc: docx.Document, text: str) -> None:
        """Render a biological taxonomic hierarchy and cladogram container."""
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False

        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)

        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="059669"/>'
            f'  <w:left w:val="single" w:sz="18" w:space="0" w:color="059669"/>'
            f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="059669"/>'
            f'  <w:right w:val="single" w:sz="6" w:space="0" w:color="059669"/>'
            f'</w:tcBorders>'
        )
        cell._tc.get_or_add_tcPr().append(borders)
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="ECFDF5"/>')
        cell._tc.get_or_add_tcPr().append(shd)

        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(3)
        cp.paragraph_format.space_after = Pt(3)
        r_hdr = cp.add_run("[TAXONOMIC HIERARCHY / BIOLOGICAL CLADOGRAM]\n")
        r_hdr.bold = True
        r_hdr.font.size = Pt(8.5)
        r_hdr.font.color.rgb = RGBColor(5, 150, 105)

        r_body = cp.add_run(text.strip())
        r_body.font.name = "Consolas"
        r_body.font.size = Pt(9)
        r_body.font.color.rgb = RGBColor(6, 78, 59)

    def _render_map_work_box(self, doc: docx.Document, text: str) -> None:
        """Render a geographic map work examination task container."""
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False

        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)

        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            f'  <w:left w:val="single" w:sz="18" w:space="0" w:color="000000"/>'
            f'  <w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            f'  <w:right w:val="single" w:sz="12" w:space="0" w:color="000000"/>'
            f'</w:tcBorders>'
        )
        cell._tc.get_or_add_tcPr().append(borders)
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="FAFAFA"/>')
        cell._tc.get_or_add_tcPr().append(shd)

        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(3)
        cp.paragraph_format.space_after = Pt(3)
        r_hdr = cp.add_run("SECTION MAP WORK [OUTLINE MAP — LAT 8°4'N TO 37°6'N | LONG 68°7'E TO 97°25'E]\n")
        r_hdr.bold = True
        r_hdr.font.size = Pt(9)
        r_hdr.font.color.rgb = RGBColor(0, 0, 0)

        lines = [l.strip() for l in text.strip().split("\n") if l.strip()] if text.strip() else [
            "(A) A major seaport on the western coast",
            "(B) An iron and steel plant in eastern India",
            "(C) A major wheat-producing region",
            "(D) A national park in north-eastern India",
            "(E) A nuclear power plant on the southern coast",
        ]
        for line in lines:
            cp.add_run(f"• {line}\n")
            r_ans = cp.add_run("   Identified Feature / Location: _____________________________________\n")
            r_ans.font.color.rgb = RGBColor(100, 116, 139)

    def _render_markdown_table(self, doc: docx.Document, headers: List[str], data_rows: List[List[str]]) -> None:
        """Render a styled tabular dataset (Accounting Journals, Ledgers, Data Tables)."""
        if not headers:
            return
        num_cols = len(headers)

        # Check if table represents an Accounting Journal or Ledger
        is_journal = any(re.search(r'debit|credit|l\.?f\.?', h, re.I) for h in headers)
        is_ledger = any(re.search(r'\b(dr|cr)\b', h, re.I) for h in headers)

        if is_journal:
            p_badge = doc.add_paragraph()
            p_badge.paragraph_format.space_before = Pt(4)
            p_badge.paragraph_format.space_after = Pt(1)
            r_b = p_badge.add_run("[FINANCIAL JOURNAL BOOK — 5-COLUMN FORMAT]")
            r_b.font.size = Pt(8)
            r_b.font.bold = True
            r_b.font.color.rgb = RGBColor(31, 77, 58)
        elif is_ledger:
            p_badge = doc.add_paragraph()
            p_badge.paragraph_format.space_before = Pt(4)
            p_badge.paragraph_format.space_after = Pt(1)
            r_b = p_badge.add_run("[T-ACCOUNT FINANCIAL LEDGER]")
            r_b.font.size = Pt(8)
            r_b.font.bold = True
            r_b.font.color.rgb = RGBColor(31, 77, 58)

        table = doc.add_table(rows=len(data_rows) + 1, cols=num_cols)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = True

        hdr_cells = table.rows[0].cells
        for i, h_text in enumerate(headers):
            cell = hdr_cells[i]
            is_amount = bool(re.search(r'debit|credit|amount|rs|balance|\(₹\)|\(rs\)', h_text, re.I))
            shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F1F5F9"/>')
            cell._tc.get_or_add_tcPr().append(shd)

            borders = parse_xml(
                f'<w:tcBorders {nsdecls("w")}>'
                f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="94A3B8"/>'
                f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
                f'  <w:bottom w:val="single" w:sz="12" w:space="0" w:color="475569"/>'
                f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
                f'</w:tcBorders>'
            )
            cell._tc.get_or_add_tcPr().append(borders)

            cp = cell.paragraphs[0]
            cp.paragraph_format.space_before = Pt(2)
            cp.paragraph_format.space_after = Pt(2)
            if is_amount:
                cp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            else:
                cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = cp.add_run(h_text)
            r.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(15, 23, 42)

        for r_idx, row_data in enumerate(data_rows, start=1):
            row_cells = table.rows[r_idx].cells
            is_total_row = any(re.search(r'total|balance\s*c\/d|balance\s*b\/d', cell_val, re.I) for cell_val in row_data)
            bg_color = "F8FAFC" if r_idx % 2 == 0 and not is_total_row else "FFFFFF"

            for c_idx in range(num_cols):
                cell = row_cells[c_idx]
                val = row_data[c_idx] if c_idx < len(row_data) else ""
                h_name = headers[c_idx] if c_idx < len(headers) else ""
                is_amount = bool(re.search(r'debit|credit|amount|rs|balance|\(₹\)|\(rs\)', h_name, re.I))

                if bg_color != "FFFFFF":
                    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg_color}"/>')
                    cell._tc.get_or_add_tcPr().append(shd)

                if is_total_row:
                    borders = parse_xml(
                        f'<w:tcBorders {nsdecls("w")}>'
                        f'  <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
                        f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
                        f'  <w:bottom w:val="double" w:sz="12" w:space="0" w:color="000000"/>'
                        f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
                        f'</w:tcBorders>'
                    )
                else:
                    borders = parse_xml(
                        f'<w:tcBorders {nsdecls("w")}>'
                        f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
                        f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
                        f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
                        f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>'
                        f'</w:tcBorders>'
                    )
                cell._tc.get_or_add_tcPr().append(borders)

                cp = cell.paragraphs[0]
                cp.paragraph_format.space_before = Pt(2)
                cp.paragraph_format.space_after = Pt(2)
                if is_amount:
                    cp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                r = cp.add_run(val)
                r.font.size = Pt(8.5)
                if is_total_row:
                    r.bold = True
                r.font.name = "Consolas" if any(c in val for c in ["0","1","2","3","4","5","6","7","8","9"]) else "Calibri"

    def _resolve_diagram_bytes(self, diagram: Dict[str, Any]) -> Optional[bytes]:
        """
        Universal 6-tier diagram image resolution:
        1. Fast in-memory inspection cache (PdfInspectionService)
        2. Local disk storage (settings.MEDIA_ROOT / diagrams)
        3. Base64 data URI in image_url
        4. Base64 thumbnail string in thumbnail_b64
        5. Cloud storage via GoogleDriveClient
        6. HTTP / HTTPS URL fetch via requests
        """
        if not diagram or not isinstance(diagram, dict):
            return None

        fig_id = str(diagram.get("figure_id") or diagram.get("id") or "").strip()
        img_url = str(diagram.get("image_url") or "").strip()

        # If figure_id was not explicitly provided, extract it from diagram-asset URL if possible
        if not fig_id and img_url:
            m = re.search(r'/api/papers/diagram-asset/([^/?#]+)', img_url)
            if m:
                fig_id = m.group(1).strip()

        # Tier 1: In-memory fast cache
        if fig_id:
            try:
                from papers.services.pdf_harvester import PdfInspectionService
                cached_bytes = PdfInspectionService.get_figure_bytes(fig_id)
                if cached_bytes:
                    return cached_bytes
            except Exception:
                pass

        # Tier 2: Local media disk storage
        try:
            from django.conf import settings
            if fig_id:
                local_path = os.path.join(settings.MEDIA_ROOT, "diagrams", f"{fig_id}.png")
                if os.path.exists(local_path):
                    with open(local_path, "rb") as lf:
                        return lf.read()

            if img_url:
                clean_url = img_url.split("?")[0].split("#")[0]
                if "/media/" in clean_url:
                    sub_path = clean_url.split("/media/", 1)[1].lstrip("/\\")
                    p = os.path.join(settings.MEDIA_ROOT, sub_path)
                    if os.path.exists(p):
                        with open(p, "rb") as f:
                            return f.read()

                if os.path.isabs(clean_url) and os.path.exists(clean_url):
                    with open(clean_url, "rb") as f:
                        return f.read()

                rel_p = os.path.join(settings.MEDIA_ROOT, clean_url.lstrip("/\\"))
                if os.path.exists(rel_p):
                    with open(rel_p, "rb") as f:
                        return f.read()
        except Exception:
            pass

        # Tier 3: Base64 data URI in image_url
        if img_url.startswith("data:image/"):
            try:
                b64_part = img_url.split(",", 1)[-1]
                return base64.b64decode(b64_part)
            except Exception:
                pass

        # Tier 4: Base64 thumbnail
        thumb_b64 = diagram.get("thumbnail_b64") or diagram.get("thumbnail")
        if thumb_b64 and isinstance(thumb_b64, str):
            try:
                if "," in thumb_b64:
                    thumb_b64 = thumb_b64.split(",", 1)[-1]
                return base64.b64decode(thumb_b64)
            except Exception:
                pass

        # Tier 5: Google Drive download
        drive_file_id = diagram.get("drive_file_id") or diagram.get("file_id")
        if drive_file_id:
            try:
                from content_ingestion.storage.drive_client import GoogleDriveClient
                drive_client = GoogleDriveClient()
                if drive_client.is_configured:
                    drive_bytes = drive_client.download_bytes(drive_file_id)
                    if drive_bytes:
                        return drive_bytes
            except Exception:
                pass

        # Tier 6: External / Remote HTTP(S) URL
        if img_url.startswith("http://") or img_url.startswith("https://"):
            try:
                import requests
                resp = requests.get(img_url, timeout=4)
                if resp.status_code == 200 and resp.content:
                    return resp.content
            except Exception:
                pass

        return None

    def _render_diagram(self, doc: docx.Document, diagram: Dict[str, Any]) -> None:
        """
        Render question diagram image and universally cleaned academic caption.
        Supports all sources: RAM cache, disk media, base64 data URI, thumbnail base64,
        Google Drive cloud storage, and HTTP(S) URLs.
        """
        if not diagram or not isinstance(diagram, dict):
            return

        img_bytes = self._resolve_diagram_bytes(diagram)
        raw_cap = diagram.get("title") or diagram.get("caption") or ""
        cap = self.clean_academic_caption(raw_cap)

        if img_bytes:
            try:
                # Sanitize and convert if necessary via Pillow to ensure python-docx compatibility
                try:
                    from PIL import Image
                    with Image.open(io.BytesIO(img_bytes)) as pil_img:
                        if pil_img.format not in ("PNG", "JPEG") or pil_img.mode in ("CMYK", "P"):
                            target_mode = "RGBA" if "A" in pil_img.mode else "RGB"
                            converted = pil_img.convert(target_mode)
                            c_buf = io.BytesIO()
                            converted.save(c_buf, format="PNG")
                            img_bytes = c_buf.getvalue()
                except Exception:
                    pass

                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(4)
                p_img.paragraph_format.space_after = Pt(2)
                p_img.paragraph_format.keep_with_next = True
                r_img = p_img.add_run()

                # Aspect-ratio aware sizing
                pic_kwargs = {"width": Inches(3.8)}
                try:
                    from PIL import Image
                    with Image.open(io.BytesIO(img_bytes)) as pil_img:
                        w_px, h_px = pil_img.size
                        if h_px > 0 and w_px > 0:
                            aspect = w_px / float(h_px)
                            if aspect < 0.75:  # Tall diagram
                                pic_kwargs = {"height": Inches(2.6)}
                            elif aspect > 2.5:  # Panoramic chart or timeline
                                pic_kwargs = {"width": Inches(4.5)}
                            else:
                                pic_kwargs = {"width": Inches(3.8)}
                except Exception:
                    pic_kwargs = {"width": Inches(3.8)}

                r_img.add_picture(io.BytesIO(img_bytes), **pic_kwargs)

                # Academic Caption
                if cap:
                    p_cap = doc.add_paragraph()
                    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_cap.paragraph_format.space_before = Pt(0)
                    p_cap.paragraph_format.space_after = Pt(4)
                    p_cap.paragraph_format.keep_with_next = True
                    r_cap = p_cap.add_run(cap)
                    r_cap.italic = True
                    r_cap.font.size = Pt(8.5)
                    r_cap.font.color.rgb = self.COLOR_MUTED
            except Exception as img_err:
                logger.debug(f"Could not embed diagram picture into DOCX: {img_err}")
                self._render_diagram_fallback(doc, cap)
        else:
            self._render_diagram_fallback(doc, cap)

    def _render_diagram_fallback(self, doc: docx.Document, caption: str) -> None:
        """Fallback callout when raw image bytes cannot be resolved."""
        callout = f"[Diagram: {caption}]" if caption else "[Diagram: Refer to attached visual figure]"
        p_cap = doc.add_paragraph()
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_cap.paragraph_format.space_before = Pt(2)
        p_cap.paragraph_format.space_after = Pt(4)
        p_cap.paragraph_format.keep_with_next = True
        r_cap = p_cap.add_run(callout)
        r_cap.italic = True
        r_cap.font.size = Pt(9)
        r_cap.font.color.rgb = self.COLOR_INDIGO

    def _render_question_content(
        self,
        doc: docx.Document,
        p_q: Any,
        question_text: str,
        marks_str: str,
        text_color: RGBColor,
        marks_color: RGBColor,
        is_rtl: bool = False,
    ) -> None:
        """Render question content with support for markdown tables, code blocks, and prose."""
        blocks = self._parse_content_blocks(question_text)
        if not blocks:
            r_text = p_q.add_run(question_text)
            r_text.font.size = Pt(10)
            r_text.font.color.rgb = text_color
            r_marks = p_q.add_run(marks_str)
            r_marks.bold = True
            r_marks.font.size = Pt(9)
            r_marks.font.color.rgb = marks_color
            return

        last_p = p_q
        first_block = blocks[0]

        if first_block["type"] == "text":
            r_text = p_q.add_run(first_block["content"])
            r_text.font.size = Pt(10)
            r_text.font.color.rgb = text_color
            if is_rtl:
                self._set_run_rtl(r_text)
            remaining_blocks = blocks[1:]
        else:
            remaining_blocks = blocks

        for block in remaining_blocks:
            if block["type"] == "table":
                self._render_markdown_table(doc, block["headers"], block["rows"])
                last_p = None
            elif block["type"] == "chemical":
                self._render_chemical_structure_box(doc, block["content"])
                last_p = None
            elif block["type"] == "cladogram":
                self._render_cladogram_box(doc, block["content"])
                last_p = None
            elif block["type"] == "map":
                self._render_map_work_box(doc, block["content"])
                last_p = None
            elif block["type"] == "code":
                self._render_code_block(doc, block["content"], block.get("lang", ""))
                last_p = None
            elif block["type"] == "text":
                p = doc.add_paragraph()
                if is_rtl:
                    self._set_paragraph_rtl(p)
                else:
                    p.paragraph_format.left_indent = Inches(0.25)
                p.paragraph_format.space_before = Pt(2)
                p.paragraph_format.space_after = Pt(3)
                r = p.add_run(block["content"])
                r.font.size = Pt(10)
                r.font.color.rgb = text_color
                if is_rtl:
                    self._set_run_rtl(r)
                last_p = p

        if last_p is not None:
            r_marks = last_p.add_run(marks_str)
            r_marks.bold = True
            r_marks.font.size = Pt(9)
            r_marks.font.color.rgb = marks_color
        else:
            p_m = doc.add_paragraph()
            p_m.paragraph_format.left_indent = Inches(0.25)
            p_m.paragraph_format.space_before = Pt(2)
            p_m.paragraph_format.space_after = Pt(3)
            r_marks = p_m.add_run(marks_str.strip())
            r_marks.bold = True
            r_marks.font.size = Pt(9)
            r_marks.font.color.rgb = marks_color

    def _add_student_question(
        self,
        doc: docx.Document,
        q: FormattedExamQuestion,
        blank_lines: int = 0,
        line_style: str = "dotted",
    ) -> None:
        """Render a single question and its options / blank answer lines."""
        p_q = doc.add_paragraph()
        p_q.paragraph_format.space_before = Pt(6)
        p_q.paragraph_format.space_after = Pt(3)
        p_q.paragraph_format.keep_with_next = True

        # Case Study / Shared Reading Comprehension Passage Callout
        if getattr(q, "case_study_passage", None):
            self._render_case_study_box(doc, q.case_study_passage, is_rtl=self._is_rtl_text(q.case_study_passage))

        is_rtl = self._is_rtl_text(q.question_text)
        if is_rtl:
            self._set_paragraph_rtl(p_q)

        # Question Number
        r_num = p_q.add_run(f"Q{q.global_question_number}.  ")
        r_num.bold = True
        r_num.font.size = Pt(10)
        r_num.font.color.rgb = self.COLOR_PRIMARY
        if is_rtl:
            self._set_run_rtl(r_num)

        # Question Text & Marks
        marks_str = f"  [{q.marks:g} {'Mark' if q.marks == 1 else 'Marks'}]"
        self._render_question_content(
            doc,
            p_q,
            q.question_text,
            marks_str,
            self.COLOR_PRIMARY,
            self.COLOR_INDIGO,
            is_rtl=is_rtl,
        )

        # Render Question Diagram if present
        if q.diagram and isinstance(q.diagram, dict):
            self._render_diagram(doc, q.diagram)

        # MCQ Options
        if q.options and isinstance(q.options, dict):
            # Check if any option is long (> 50 chars) to switch to 1-column layout
            is_long = any(len(str(v)) > 50 for v in q.options.values())
            num_cols = 1 if is_long else 2
            opts_table = doc.add_table(rows=0, cols=num_cols)
            opts_table.alignment = WD_TABLE_ALIGNMENT.CENTER
            opts_table.autofit = False

            # Printable width 7.17 in: 1 col = 6.9 in, 2 cols = 3.45 in each
            col_widths = [Inches(6.9)] if is_long else [Inches(3.45), Inches(3.45)]
            keys = sorted(q.options.keys())

            # Remove all borders for clean presentation matching PDF
            tblPr = opts_table._tbl.tblPr
            borders = parse_xml(
                f'<w:tblBorders {nsdecls("w")}>\n'
                f'  <w:top w:val="none"/>\n'
                f'  <w:bottom w:val="none"/>\n'
                f'  <w:left w:val="none"/>\n'
                f'  <w:right w:val="none"/>\n'
                f'  <w:insideH w:val="none"/>\n'
                f'  <w:insideV w:val="none"/>\n'
                f'</w:tblBorders>'
            )
            tblPr.append(borders)

            step = 1 if is_long else 2
            for i in range(0, len(keys), step):
                row = opts_table.add_row()
                for j, cell in enumerate(row.cells):
                    cell.width = col_widths[j]
                    idx = i + j
                    if idx < len(keys):
                        k = keys[idx]
                        v = q.options[k]
                        cp = cell.paragraphs[0]
                        cp.paragraph_format.space_before = Pt(1)
                        cp.paragraph_format.space_after = Pt(2)
                        if is_rtl:
                            self._set_paragraph_rtl(cp)
                        r_k = cp.add_run(f"({k}) ")
                        r_k.bold = True
                        r_k.font.size = Pt(9.5)
                        if is_rtl:
                            self._set_run_rtl(r_k)
                        r_v = cp.add_run(str(v))
                        r_v.font.size = Pt(9.5)
                        if is_rtl:
                            self._set_run_rtl(r_v)

        # Ruled Blank Answer Lines (Unbreakable native paragraph bottom borders)
        if blank_lines > 0:
            bdr_val = "single" if line_style == "solid" else ("dotted" if line_style == "dotted" else "dashed")
            for _ in range(blank_lines):
                p_line = doc.add_paragraph()
                p_line.paragraph_format.space_before = Pt(0)
                p_line.paragraph_format.space_after = Pt(13)
                p_line.paragraph_format.left_indent = Inches(0.25)

                pPr = p_line._p.get_or_add_pPr()
                pBdr = parse_xml(
                    f'<w:pBdr {nsdecls("w")}><w:bottom w:val="{bdr_val}" w:sz="4" w:space="1" w:color="CBD5E1"/></w:pBdr>'
                )
                pPr.append(pBdr)

    def _add_teacher_solution(self, doc: docx.Document, q: FormattedExamQuestion) -> None:
        """Render question with correct answer and model solutions for teacher."""
        p_q = doc.add_paragraph()
        p_q.paragraph_format.space_before = Pt(8)
        p_q.paragraph_format.space_after = Pt(2)
        p_q.paragraph_format.keep_with_next = True

        # Case Study / Shared Reading Comprehension Passage Callout
        if getattr(q, "case_study_passage", None):
            self._render_case_study_box(doc, q.case_study_passage, is_rtl=self._is_rtl_text(q.case_study_passage))

        is_rtl = self._is_rtl_text(q.question_text) or self._is_rtl_text(q.correct_answer)
        if is_rtl:
            self._set_paragraph_rtl(p_q)

        r_num = p_q.add_run(f"Q{q.global_question_number}.  ")
        r_num.bold = True
        r_num.font.size = Pt(10)
        if is_rtl:
            self._set_run_rtl(r_num)

        marks_str = f"  [{q.marks:g} {'Mark' if q.marks == 1 else 'Marks'}]"
        self._render_question_content(
            doc,
            p_q,
            q.question_text,
            marks_str,
            self.COLOR_PRIMARY,
            self.COLOR_MUTED,
            is_rtl=is_rtl,
        )

        # Render Question Diagram if present (Teacher Answer Key parity with Student Paper)
        if q.diagram and isinstance(q.diagram, dict):
            self._render_diagram(doc, q.diagram)

        # Correct Answer block
        p_ans = doc.add_paragraph()
        if is_rtl:
            self._set_paragraph_rtl(p_ans)
        else:
            p_ans.paragraph_format.left_indent = Inches(0.25)
        p_ans.paragraph_format.space_before = Pt(2)
        p_ans.paragraph_format.space_after = Pt(2)

        ans_label_str = "صحیح جواب / CORRECT ANSWER: " if is_rtl else "CORRECT ANSWER: "
        r_ans_label = p_ans.add_run(ans_label_str)
        r_ans_label.bold = True
        r_ans_label.font.size = Pt(9.5)
        r_ans_label.font.color.rgb = self.COLOR_CORRECT
        if is_rtl:
            self._set_run_rtl(r_ans_label)

        if q.question_type == "MCQ" and q.options:
            correct_key = q.correct_answer.strip().upper()
            opt_text = q.options.get(correct_key, "")
            r_ans_val = p_ans.add_run(f"Option ({correct_key}) — {opt_text}" if opt_text else f"Option ({correct_key})")
        else:
            r_ans_val = p_ans.add_run(q.correct_answer or "Descriptive solution evaluation per rubric.")

        r_ans_val.bold = True
        r_ans_val.font.size = Pt(9.5)
        r_ans_val.font.color.rgb = self.COLOR_CORRECT
        if is_rtl:
            self._set_run_rtl(r_ans_val)

        # Source / Topic info
        if q.topic_name or q.source_reference:
            p_ref = doc.add_paragraph()
            p_ref.paragraph_format.left_indent = Inches(0.25)
            p_ref.paragraph_format.space_before = Pt(0)
            p_ref.paragraph_format.space_after = Pt(4)
            ref_items = []
            if q.topic_name:
                ref_items.append(f"Topic: {q.topic_name}")
            if q.source_reference:
                ref_items.append(f"Reference: {q.source_reference}")
            r_ref = p_ref.add_run("   |   ".join(ref_items))
            r_ref.font.size = Pt(8.5)
            r_ref.font.color.rgb = self.COLOR_MUTED

    def _add_end_marker(self, doc: docx.Document, is_answer_key: bool = False) -> None:
        """Document terminator footer."""
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(16)
        p.paragraph_format.space_after = Pt(10)

        marker_text = (
            "*** END OF EXAMINATION PAPER • ALL THE BEST ***"
            if not is_answer_key
            else "*** END OF TEACHER ANSWER KEY & MARKING SCHEME ***"
        )
        r = p.add_run(marker_text)
        r.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = self.COLOR_MUTED
