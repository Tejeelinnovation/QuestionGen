"""
Unit tests for Phase 7: Table of Contents (TOC) Extraction Engine.
Validates:
- Numeral normalization (Devanagari, Gujarati, OCR digit confusions).
- Multilingual chapter keyword parsing (English, Hindi, Gujarati).
- Majority vote printed-to-physical page offset calibration.
- Boundary calculation (end = next_start - 1; terminating before appendix/answers).
- toc_source and toc_confidence metadata.
- Validation and safe fallback (no placeholders on failure).
"""

import os
import unittest
import pymupdf as fitz

from document_ai_worker.engine.toc_extractor import (
    TocExtractor,
    clean_ocr_number,
    normalize_digits,
    CHAPTER_REGEX,
    TERMINAL_REGEX,
)


class TestTocV2Engine(unittest.TestCase):

    def setUp(self):
        self.synthetic_pdf_path = os.path.join(
            os.path.dirname(__file__), "synthetic", "synthetic_textbook_with_toc.pdf"
        )
        if not os.path.exists(self.synthetic_pdf_path):
            from eval.generate_synthetic_book import create_synthetic_textbook_pdf
            create_synthetic_textbook_pdf(self.synthetic_pdf_path)

    def test_numeral_normalization_and_ocr_confusions(self):
        """Test conversion of Devanagari, Gujarati, and OCR character confusions."""
        # Devanagari digits
        self.assertEqual(normalize_digits("अध्याय १२"), "अध्याय 12")
        self.assertEqual(clean_ocr_number("१५"), 15)

        # Gujarati digits
        self.assertEqual(normalize_digits("પ્રકરણ ૪"), "પ્રકરણ 4")
        self.assertEqual(clean_ocr_number("૨૩"), 23)

        # OCR confusions: l/I -> 1, O/o -> 0
        self.assertEqual(clean_ocr_number("lO"), 10)
        self.assertEqual(clean_ocr_number("l2"), 12)
        self.assertEqual(clean_ocr_number("IO5"), 105)
        self.assertEqual(clean_ocr_number("o"), 0)

        # Roman numerals
        self.assertEqual(clean_ocr_number("iv"), 4)
        self.assertEqual(clean_ocr_number("ix"), 9)

    def test_multilingual_chapter_keyword_matching(self):
        """Test that English, Hindi, and Gujarati chapter terms are matched."""
        samples = [
            ("Chapter 1. Motion .................... 10", 1, "Motion", 10),
            ("Unit 2: Thermodynamics ............... 25", 2, "Thermodynamics", 25),
            ("अध्याय ३. हमारे आस-पास के पदार्थ ........ ४२", 3, "हमारे आस-पास के पदार्थ", 42),
            ("પ્રકરણ 1. રાસાયણિક પ્રક્રિયાઓ .......... 15", 1, "રાસાયણિક પ્રક્રિયાઓ", 15),
        ]
        for line, expected_num, expected_title, expected_page in samples:
            match = CHAPTER_REGEX.search(line)
            self.assertIsNotNone(match, f"Failed to match: {line}")
            raw_num, title, pg_str = match.groups()
            ch_num = clean_ocr_number(raw_num)
            clean_title = title.strip().rstrip("._- \t")
            ch_page = clean_ocr_number(pg_str)
            self.assertEqual(ch_num, expected_num)
            self.assertEqual(clean_title, expected_title)
            self.assertEqual(ch_page, expected_page)

    def test_synthetic_textbook_toc_extraction_and_offset_calibration(self):
        """
        Verify that TocExtractor extracts all 3 chapters from the synthetic textbook,
        correctly calculates the +4 page offset, and terminates before the appendix.
        """
        doc = fitz.open(self.synthetic_pdf_path)
        extractor = TocExtractor()

        chapters, granularity, source, confidence = extractor.extract_toc(
            doc, document_kind="FULL_BOOK", pdf_path=self.synthetic_pdf_path
        )

        self.assertEqual(granularity, "WHOLE_BOOK")
        self.assertEqual(source, "regex")
        self.assertIn(confidence, ("high", "medium"))
        self.assertEqual(len(chapters), 3)

        # Chapter 1: printed page 1 -> physical PDF page 5
        self.assertEqual(chapters[0].chapter_number, 1)
        self.assertIn("Motion", chapters[0].title)
        self.assertEqual(chapters[0].start_page, 5)
        self.assertEqual(chapters[0].end_page, 8)  # Next chapter starts on 9, so 9 - 1 = 8

        # Chapter 2: printed page 5 -> physical PDF page 9
        self.assertEqual(chapters[1].chapter_number, 2)
        self.assertIn("Gravity", chapters[1].title)
        self.assertEqual(chapters[1].start_page, 9)
        self.assertEqual(chapters[1].end_page, 12)  # Next chapter starts on 13, so 13 - 1 = 12

        # Chapter 3: printed page 9 -> physical PDF page 13
        self.assertEqual(chapters[2].chapter_number, 3)
        self.assertIn("Work", chapters[2].title)
        self.assertEqual(chapters[2].start_page, 13)
        # Ends before Appendix (which starts on physical page 17) -> end_page should be 16
        self.assertEqual(chapters[2].end_page, 16)

        doc.close()

    def test_terminal_terms_detection(self):
        """Test detection of appendix, answers, and glossary terms."""
        self.assertIsNotNone(TERMINAL_REGEX.search("Appendix: Answers to Selected Problems"))
        self.assertIsNotNone(TERMINAL_REGEX.search("Hints and Solutions"))
        self.assertIsNotNone(TERMINAL_REGEX.search("उत्तरमाला (Solutions)"))
        self.assertIsNotNone(TERMINAL_REGEX.search("પરિશિષ્ટ (Appendix)"))

    def test_non_book_and_no_toc_returns_null(self):
        """
        Documents without a TOC must return an empty list with null source and null confidence.
        Never fabricate dummy or placeholder chapters.
        """
        # Create a single-page document without TOC
        doc = fitz.open()
        p = doc.new_page(width=595, height=842)
        p.insert_text((50, 50), "Single worksheet question paper without contents.")

        extractor = TocExtractor()
        chapters, granularity, source, confidence = extractor.extract_toc(
            doc, document_kind="WORKSHEET", pdf_path="test.pdf"
        )

        self.assertEqual(chapters, [])
        self.assertEqual(granularity, "UNKNOWN")
        self.assertIsNone(source)
        self.assertIsNone(confidence)

        doc.close()


if __name__ == "__main__":
    unittest.main()
