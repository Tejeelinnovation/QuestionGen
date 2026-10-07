"""
Unit tests for Pure Text Cleaning and Quality Gate Functions.
Tests drop caps merging, hyphenation rejoining, leaked symbol stripping,
short fragment dropping, and glued word handling with real examples.
"""

import unittest
from pathlib import Path
import pymupdf as fitz

from document_ai_worker.engine.text_cleaner import (
    clean_page_text,
    detect_glued_words,
    drop_short_fragments,
    merge_drop_caps,
    normalize_math_in_text,
    rebuild_text_from_pymupdf_words,
    rejoin_hyphenated_line_breaks,
    strip_leaked_symbol_glyphs,
)


class TextCleanerUnitTests(unittest.TestCase):
    """
    Validates text normalization functions against newspaper and textbook patterns.
    """

    def test_drop_caps_merging_real_newspaper_examples(self):
        # Real examples from newspaper lead articles
        s1 = "T he Congress party held a major plenary session today."
        cleaned1, count1 = merge_drop_caps(s1)
        self.assertEqual(cleaned1, "The Congress party held a major plenary session today.")
        self.assertEqual(count1, 1)

        s2 = "S amajwadi Party leaders gathered in Lucknow."
        cleaned2, count2 = merge_drop_caps(s2)
        self.assertEqual(cleaned2, "Samajwadi Party leaders gathered in Lucknow.")
        self.assertEqual(count2, 1)

        s3 = "B ombay High Court dismissed the petition."
        cleaned3, count3 = merge_drop_caps(s3)
        self.assertEqual(cleaned3, "Bombay High Court dismissed the petition.")
        self.assertEqual(count3, 1)

        s4 = "F ive people were rescued yesterday."
        cleaned4, count4 = merge_drop_caps(s4)
        self.assertEqual(cleaned4, "Five people were rescued yesterday.")
        self.assertEqual(count4, 1)

        s5 = "A ll students passed the examination."
        cleaned5, count5 = merge_drop_caps(s5)
        self.assertEqual(cleaned5, "All students passed the examination.")
        self.assertEqual(count5, 1)

    def test_drop_caps_preserves_valid_english_words(self):
        # Valid standalone 'A' and 'I' must NOT be merged
        s1 = "A cat sat on a mat."
        cleaned1, count1 = merge_drop_caps(s1)
        self.assertEqual(cleaned1, "A cat sat on a mat.")
        self.assertEqual(count1, 0)

        s2 = "I saw him yesterday at the station."
        cleaned2, count2 = merge_drop_caps(s2)
        self.assertEqual(cleaned2, "I saw him yesterday at the station.")
        self.assertEqual(count2, 0)

    def test_hyphenated_line_break_rejoining(self):
        # Line break hyphenation
        s1 = "The com-\nmand was given to the infantry."
        cleaned1, count1 = rejoin_hyphenated_line_breaks(s1)
        self.assertEqual(cleaned1, "The command was given to the infantry.")
        self.assertEqual(count1, 1)

        s2 = "India is an inter-\n  national destination for tourism."
        cleaned2, count2 = rejoin_hyphenated_line_breaks(s2)
        self.assertEqual(cleaned2, "India is an international destination for tourism.")
        self.assertEqual(count2, 1)

        # Inline hyphens must be preserved
        s3 = "This is a well-known scientific principle."
        cleaned3, count3 = rejoin_hyphenated_line_breaks(s3)
        self.assertEqual(cleaned3, "This is a well-known scientific principle.")
        self.assertEqual(count3, 0)

    def test_leaked_symbol_font_glyphs(self):
        # Real example: 'trianglertSouthern' -> 'Southern'
        s1 = "The trianglertSouthern Railway announced special trains."
        cleaned1, count1 = strip_leaked_symbol_glyphs(s1)
        self.assertEqual(cleaned1, "The Southern Railway announced special trains.")
        self.assertGreaterEqual(count1, 1)

        s2 = "squarebulletReport indicates strong GDP growth."
        cleaned2, count2 = strip_leaked_symbol_glyphs(s2)
        self.assertEqual(cleaned2, "Report indicates strong GDP growth.")
        self.assertGreaterEqual(count2, 1)

        # Standalone leaked glyph names
        s3 = "trianglert Key findings of the committee:"
        cleaned3, count3 = strip_leaked_symbol_glyphs(s3)
        self.assertEqual(cleaned3, "Key findings of the committee:")
        self.assertGreaterEqual(count3, 1)

        # Unicode PUA character leak (\uf0a7)
        s4 = "Item 1 \uf0a7 First observation"
        cleaned4, count4 = strip_leaked_symbol_glyphs(s4)
        self.assertEqual(cleaned4, "Item 1  First observation")
        self.assertGreaterEqual(count4, 1)

    def test_drop_short_fragments_preserves_numerals_and_labels(self):
        text = (
            "Chapter Summary\n"
            "q\n"  # isolated noise: drop
            "12\n"  # numeral: keep
            "Rs\n"  # currency label: keep
            "(a)\n"  # list bullet: keep
            "Dr\n"  # title label: keep
            "x#\n"  # isolated noise: drop
            "The dog is on the mat.\n"  # valid sentence with short words: keep intact
        )
        cleaned, count = drop_short_fragments(text)
        self.assertNotIn("\nq\n", cleaned)
        self.assertNotIn("\nx#\n", cleaned)
        self.assertIn("12", cleaned)
        self.assertIn("Rs", cleaned)
        self.assertIn("(a)", cleaned)
        self.assertIn("Dr", cleaned)
        self.assertIn("The dog is on the mat.", cleaned)
        self.assertEqual(count, 2)

    def test_glued_words_detection_real_example(self):
        # Real example: 'commandhas'
        text = "The army commandhas decided to conduct regular joint exercises."
        glued = detect_glued_words(text)
        self.assertIn("commandhas", glued)

        # Valid common words ending with 'is' or 'as' must NOT be flagged
        valid_text = "The basis of the analysis was clear whereas the crisis ended."
        glued_valid = detect_glued_words(valid_text)
        self.assertEqual(glued_valid, [])

    def test_rebuild_from_pymupdf_word_positions(self):
        # Create a test PDF with distinct words positioned on the page
        doc = fitz.open()
        p = doc.new_page(width=595, height=842)
        p.insert_text((72, 72), "The high command has issued instructions.")
        
        rebuilt = rebuild_text_from_pymupdf_words(p)
        self.assertIn("command", rebuilt)
        self.assertIn("has", rebuilt)
        doc.close()

    def test_normalize_math_in_text(self):
        sample = "माना समय t 1 पर स्थिति x 1 तथा समयांतराल (t 2 - t 1) में वेग v = (x 2 - x 1) / (t 2 - t 1) होगा।"
        norm, count = normalize_math_in_text(sample)
        self.assertGreaterEqual(count, 4)
        self.assertIn("$t_{1}$", norm)
        self.assertIn("$x_{1}$", norm)
        self.assertIn("$(t_{2} - t_{1})$", norm)
        self.assertIn("$v = (x_{2} - x_{1}) / (t_{2} - t_{1})$", norm)

    def test_clean_page_text_composite_pipeline(self):
        raw = (
            "T he Congress party held a briefing.\n"
            "trianglertSouthern delegates attended.\n"
            "The division com-\nmand was present.\n"
            "z\n"
            "1.\n"
            "The supreme commandhas taken note."
        )
        result = clean_page_text(raw)
        self.assertIn("The Congress", result.text)
        self.assertIn("Southern delegates", result.text)
        self.assertIn("command was", result.text)
        self.assertIn("1.", result.text)
        self.assertNotIn("\nz\n", result.text)
        self.assertIn("commandhas", result.glued_words)
        self.assertIn("drop_caps_merged", result.flags)
        self.assertIn("hyphens_rejoined", result.flags)
        self.assertIn("symbols_stripped", result.flags)
        self.assertIn("fragments_dropped", result.flags)
        self.assertIn("has_glued_words", result.flags)
        self.assertGreater(result.quality_score, 0.70)


if __name__ == "__main__":
    unittest.main()
