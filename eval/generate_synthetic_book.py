"""
Utility to generate synthetic textbook PDFs with front matter and Table of Contents
for verifying Phase 7 TOC extraction and offset calibration.
"""

import os
import pymupdf as fitz


def create_synthetic_textbook_pdf(output_path: str) -> str:
    """
    Generates an 18-page synthetic textbook with 4 pages of front-matter,
    a Table of Contents page, 3 numbered chapters, and an Appendix.
    Offset between printed page and physical page is exactly +4.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = fitz.open()

    pages_content = [
        # Page 1 (Front matter 1)
        ("Modern Physics for Secondary Schools\nNational Educational Curriculum Board\n2026 Edition", "Cover & Title"),
        # Page 2 (Front matter 2)
        ("Preface\n\nThis textbook introduces foundational physical concepts, mechanics, and gravitation for secondary students. Written in accordance with national pedagogical guidelines.", "Preface"),
        # Page 3 (Front matter 3)
        ("Acknowledgements\n\nWe express gratitude to the review council and subject matter contributors across institutions for their feedback.", "Acknowledgements"),
        # Page 4 (Front matter 4 - Contents)
        (
            "Contents\n\n"
            "Chapter 1. Motion and Kinematics .................... 1\n"
            "Chapter 2. Laws of Force and Gravity ................ 5\n"
            "Chapter 3. Work, Energy and Power ................... 9\n"
            "Appendix: Answers to Selected Problems .............. 13\n",
            "Table of Contents",
        ),
        # Page 5 (Printed Page 1, Physical Page 5)
        ("Chapter 1. Motion and Kinematics\n\n1.1 Introduction to Motion\nMotion is the change in position of an object over time with respect to a reference frame.\nPrinted Page 1", "Chapter 1 Page 1"),
        # Page 6 (Printed Page 2, Physical Page 6)
        ("1.2 Speed and Velocity\nVelocity is the directional speed of an object in motion as an indication of its rate of change in position.\nPrinted Page 2", "Chapter 1 Page 2"),
        # Page 7 (Printed Page 3, Physical Page 7)
        ("1.3 Acceleration and Free Fall\nAcceleration is the rate of change of the velocity of an object with respect to time.\nPrinted Page 3", "Chapter 1 Page 3"),
        # Page 8 (Printed Page 4, Physical Page 8)
        ("1.4 Kinematics Exercises\nQuestions and problems on uniform acceleration in one dimension.\nPrinted Page 4", "Chapter 1 Page 4"),
        # Page 9 (Printed Page 5, Physical Page 9)
        ("Chapter 2. Laws of Force and Gravity\n\n2.1 Newton's First Law\nAn object at rest remains at rest, and an object in motion remains in motion unless acted upon by a net external force.\nPrinted Page 5", "Chapter 2 Page 5"),
        # Page 10 (Printed Page 6, Physical Page 10)
        ("2.2 Newton's Second Law and Force\nForce equals mass times acceleration (F = ma).\nPrinted Page 6", "Chapter 2 Page 6"),
        # Page 11 (Printed Page 7, Physical Page 11)
        ("2.3 Gravitational Attraction\nEvery particle attracts every other particle in the universe with a force proportional to the product of their masses.\nPrinted Page 7", "Chapter 2 Page 7"),
        # Page 12 (Printed Page 8, Physical Page 12)
        ("2.4 Gravity Exercises\nProblems on planetary motion and circular orbits.\nPrinted Page 8", "Chapter 2 Page 8"),
        # Page 13 (Printed Page 9, Physical Page 13)
        ("Chapter 3. Work, Energy and Power\n\n3.1 Concept of Work\nWork is done when a force that is applied to an object results in a displacement in the direction of the force.\nPrinted Page 9", "Chapter 3 Page 9"),
        # Page 14 (Printed Page 10, Physical Page 14)
        ("3.2 Kinetic and Potential Energy\nKinetic energy is energy due to motion. Potential energy is energy stored in a system.\nPrinted Page 10", "Chapter 3 Page 10"),
        # Page 15 (Printed Page 11, Physical Page 15)
        ("3.3 Conservation of Energy\nEnergy can neither be created nor destroyed, only transformed from one form to another.\nPrinted Page 11", "Chapter 3 Page 11"),
        # Page 16 (Printed Page 12, Physical Page 16)
        ("3.4 Work and Energy Exercises\nPractice questions and numerical calculations.\nPrinted Page 12", "Chapter 3 Page 12"),
        # Page 17 (Printed Page 13, Physical Page 17)
        ("Appendix: Answers to Selected Problems\n\nChapter 1 Solutions:\n1. 15 m/s\n2. 9.8 m/s^2\n3. 45 meters\nPrinted Page 13", "Appendix Page 1"),
        # Page 18 (Printed Page 14, Physical Page 18)
        ("Appendix Continued: Answers to Selected Problems\n\nChapter 2 Solutions:\n1. 50 N\n2. 120 kg m/s\n3. 980 Joules\nPrinted Page 14", "Appendix Page 2"),
    ]

    for text, header in pages_content:
        page = doc.new_page(width=595, height=842)  # A4 standard size
        rect = fitz.Rect(50, 50, 545, 792)
        page.insert_textbox(rect, text, fontsize=12, fontname="helv")

    doc.save(output_path)
    doc.close()
    return output_path


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "synthetic", "synthetic_textbook_with_toc.pdf")
    create_synthetic_textbook_pdf(out)
    print(f"Generated synthetic textbook at: {out}")
