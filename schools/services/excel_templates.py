"""
Excel Sample Template Generator for Student and Teacher Bulk Imports.
Uses openpyxl to generate styled workbooks with instructions and sample rows.
"""

from __future__ import annotations

import io
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


def _apply_header_style(cell, text: str):
    cell.value = text
    cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")  # Slate 800
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _apply_data_style(cell, value, is_center: bool = False):
    cell.value = value
    cell.font = Font(name="Calibri", size=10)
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )
    cell.border = thin_border
    cell.alignment = Alignment(
        horizontal="center" if is_center else "left",
        vertical="center",
    )


def generate_student_template() -> bytes:
    """
    Generates sample Excel workbook for Student import.
    Columns:
    - Student Name (Required)
    - GR Number (Required)
    - Roll Number (Required where applicable)
    - Standard (Required)
    - Division (Required)
    - Phone Number (Required)
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"

    # Ensure grid lines are visible
    ws.views.sheetView[0].showGridLines = True

    headers = [
        "Student Name",
        "GR Number",
        "Roll Number",
        "Standard",
        "Division",
        "Phone Number",
    ]

    # Write headers on row 1
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        _apply_header_style(cell, header)

    # Sample rows
    sample_data = [
        ("Aarav Sharma", "GR-2024-001", "1", "10", "A", "+919876543210"),
        ("Ananya Patel", "GR-2024-002", "2", "Standard 10", "A", "+919876543211"),
        ("Rohan Verma", "GR-2024-003", "1", "Std 9", "B", "9876543212"),
        ("Isha Kulkarni", "GR-2024-004", "2", "6th", "A", "+919876543213"),
        ("Vivaan Joshi", "GR-2024-005", "3", "VI", "A", "+919876543214"),
    ]

    for row_idx, row_data in enumerate(sample_data, 2):
        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            is_center = col_idx in {2, 3, 4, 5, 6}
            _apply_data_style(cell, val, is_center=is_center)

    # Auto-fit column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 5, 16)

    ws.row_dimensions[1].height = 28

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


def generate_teacher_template() -> bytes:
    """
    Generates sample Excel workbook for Teacher import.
    Columns:
    - Teacher Name (Required)
    - Teacher Mobile Number (Required)
    - Subject (Required)
    - Class Teacher (Optional / Class + division, e.g. Standard 6 — A)
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Teachers"

    ws.views.sheetView[0].showGridLines = True

    headers = [
        "Teacher Name",
        "Teacher Mobile Number",
        "Subject",
        "Class Teacher",
    ]

    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        _apply_header_style(cell, header)

    sample_data = [
        ("Dr. Rajesh Kumar", "+919876543201", "Mathematics", "Standard 10 — A"),
        ("Meera Sen", "+919876543202", "Science", "Std 9-B"),
        ("Amitabh Sen", "+919876543203", "Physics", "Class 10 A"),
        ("Sunita Deshmukh", "+919876543204", "English", "None"),
        ("Vikram Roy", "+919876543205", "Social Science", "6th — A"),
    ]

    for row_idx, row_data in enumerate(sample_data, 2):
        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            is_center = col_idx in {2, 4}
            _apply_data_style(cell, val, is_center=is_center)

    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 6, 20)

    ws.row_dimensions[1].height = 28

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
