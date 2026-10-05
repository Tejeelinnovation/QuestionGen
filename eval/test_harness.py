"""
Unit tests for the Evaluation Harness itself (eval/run.py).
"""

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from eval.run import (
    EvalRunner,
    compute_script_aware_garbage,
    compute_garbage_metrics,
    compute_section_tiny_images,
    match_chapters,
)
from document_ai_worker.engine.schema import PageSchema, SectionSchema


class EvalHarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())
        self.golden_dir = self.temp_dir / "golden"
        self.results_dir = self.temp_dir / "results"
        self.thresholds_path = self.temp_dir / "thresholds.json"

        self.golden_dir.mkdir(parents=True)
        self.results_dir.mkdir(parents=True)

        thresholds = {
            "max_doc_type_accuracy_drop": 0.00,
            "max_toc_precision_drop": 0.05,
            "max_toc_recall_drop": 0.05,
            "max_page_range_accuracy_drop": 0.05,
            "max_garbage_rate_increase": 0.03,
            "max_empty_page_count_increase": 0,
            "max_tiny_image_count_increase": 5,
            "max_needs_review_rate_increase": 0.05,
            "max_runtime_increase_pct": 0.50,
        }
        with open(self.thresholds_path, "w", encoding="utf-8") as f:
            json.dump(thresholds, f)

        self.runner = EvalRunner(
            golden_dir=self.golden_dir,
            results_dir=self.results_dir,
            thresholds_path=self.thresholds_path,
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_compute_garbage_metrics_clean_english_hindi_gujarati(self):
        english_text = "This is a clean English sentence with standard punctuation."
        total, garbage, rate = compute_script_aware_garbage(english_text)
        self.assertEqual(garbage, 0)
        self.assertEqual(rate, 0.0)

        hindi_text = "यह एक स्वच्छ हिंदी वाक्य है जिसमें कोई त्रुटि नहीं है।"
        total_hi, garbage_hi, rate_hi = compute_script_aware_garbage(hindi_text)
        self.assertEqual(garbage_hi, 0)
        self.assertEqual(rate_hi, 0.0)

        gujarati_text = "આ એક સ્વચ્છ ગુજરાતી વાક્ય છે જેમાં કોઈ ભૂલ નથી."
        total_gu, garbage_gu, rate_gu = compute_script_aware_garbage(gujarati_text)
        self.assertEqual(garbage_gu, 0)
        self.assertEqual(rate_gu, 0.0)

    def test_compute_garbage_metrics_detects_corrupt_tokens_and_mixed_scripts(self):
        corrupt_text = "Valid text with \ufffd\ufffd and cid:123 \x00\x01\x02 binary gibberish and x|&[kaM."
        total, garbage, rate = compute_script_aware_garbage(corrupt_text)
        self.assertGreater(garbage, 0)
        self.assertGreater(rate, 0.15)

        # Mixed script corruption inside tokens (e.g. legacy font encoding errors)
        mixed_text = "यहाँ कुछ कaखbग खराब शब्द हैं।"
        _, garbage_mix, rate_mix = compute_script_aware_garbage(mixed_text)
        self.assertGreater(garbage_mix, 0)
        self.assertGreater(rate_mix, 0.05)

    def test_match_chapters_when_no_toc_expected(self):
        # Both clean: no TOC expected, none extracted -> returns None (n/a) and explicit message
        p, r, acc, status = match_chapters([], [], total_pages=10)
        self.assertIsNone(p)
        self.assertIsNone(r)
        self.assertIsNone(acc)
        self.assertEqual(status, "correct: no TOC produced")

        # Hallucinated chapters (false positive)
        p_fp, r_fp, acc_fp, status_fp = match_chapters(
            [{"title": "Chapter 1", "start_page": 1, "end_page": 10}],
            [],
            total_pages=10,
        )
        self.assertEqual(p_fp, 0.0)
        self.assertIsNone(r_fp)
        self.assertEqual(acc_fp, 0.0)
        self.assertIn("false positive", status_fp)

    def test_match_chapters_matching_fuzzy_titles_and_numbers(self):
        expected = [
            {"number": 1, "title": "Real Numbers", "start_page": 1, "end_page": 15},
            {"number": 2, "title": "Polynomials", "start_page": 16, "end_page": 30},
        ]
        extracted = [
            {"number": 1, "title": "1. Real Numbers", "start_page": 1, "end_page": 15},
            {"number": 2, "title": "Polynomials", "start_page": 17, "end_page": 30},
        ]
        p, r, acc, status = match_chapters(extracted, expected, total_pages=30)
        self.assertEqual(p, 1.0)
        self.assertEqual(r, 1.0)
        self.assertGreaterEqual(acc, 0.95)
        self.assertIn("2/2 chapters matched", status)

    def test_compute_section_tiny_images_inspects_output_sections_only(self):
        # Page with 1 valid diagram (200x200) and 1 tiny diagram (30x40)
        page1 = PageSchema(
            page_number=1,
            layout_type="SINGLE_COLUMN",
            raw_text="Sample text",
            sections=[
                SectionSchema(
                    type="DIAGRAM",
                    heading="Fig 1",
                    text="",
                    column_index=0,
                    metadata={"bbox": [10, 10, 210, 210]}, # 200 x 200
                ),
                SectionSchema(
                    type="DIAGRAM",
                    heading="Icon",
                    text="",
                    column_index=0,
                    metadata={"bbox": [50, 50, 80, 90]}, # 30 x 40 -> tiny!
                ),
                SectionSchema(
                    type="TEXT",
                    heading="Paragraph",
                    text="Clean paragraph",
                    column_index=0,
                    metadata={"bbox": [10, 10, 30, 30]}, # Text section, not a diagram
                ),
            ],
        )
        count = compute_section_tiny_images([page1])
        self.assertEqual(count, 1)

    def test_regression_check_detects_metric_degradation_and_exits_nonzero(self):
        # 1. Baseline run
        run_1 = {
            "timestamp": "20261001_120000",
            "samples": {
                "sample_a": {
                    "sample": "sample_a",
                    "status": "COMPLETED",
                    "doc_type_predicted": "NEWSPAPER",
                    "doc_type_expected": "NEWSPAPER",
                    "doc_type_correct": True,
                    "confidence": 0.95,
                    "toc_precision": None,
                    "toc_recall": None,
                    "expected_chapters_count": 0,
                    "extracted_chapters_count": 0,
                    "garbage_rate": 0.01,
                    "empty_page_count": 0,
                    "tiny_image_count": 2,
                    "needs_review_rate": 0.0,
                    "runtime_seconds": 2.0,
                }
            },
        }
        exit_code_1 = self.runner.save_and_check_regression(run_1)
        self.assertEqual(exit_code_1, 0)

        # 2. Regressed run (garbage rate increases from 0.01 to 0.12, exceeds tolerance 0.03)
        run_2 = {
            "timestamp": "20261001_130000",
            "samples": {
                "sample_a": {
                    "sample": "sample_a",
                    "status": "COMPLETED",
                    "doc_type_predicted": "NEWSPAPER",
                    "doc_type_expected": "NEWSPAPER",
                    "doc_type_correct": True,
                    "confidence": 0.95,
                    "toc_precision": None,
                    "toc_recall": None,
                    "expected_chapters_count": 0,
                    "extracted_chapters_count": 0,
                    "garbage_rate": 0.12,  # +0.11 increase
                    "empty_page_count": 0,
                    "tiny_image_count": 2,
                    "needs_review_rate": 0.0,
                    "runtime_seconds": 2.1,
                }
            },
        }
        exit_code_2 = self.runner.save_and_check_regression(run_2)
        self.assertEqual(exit_code_2, 1)

    def test_regression_check_passes_when_metrics_improve_or_within_tolerance(self):
        # 1. Baseline run
        run_1 = {
            "timestamp": "20261001_120000",
            "samples": {
                "sample_a": {
                    "sample": "sample_a",
                    "status": "COMPLETED",
                    "doc_type_predicted": "NEWSPAPER",
                    "doc_type_expected": "NEWSPAPER",
                    "doc_type_correct": True,
                    "confidence": 0.95,
                    "toc_precision": None,
                    "toc_recall": None,
                    "expected_chapters_count": 0,
                    "extracted_chapters_count": 0,
                    "garbage_rate": 0.05,
                    "empty_page_count": 0,
                    "tiny_image_count": 2,
                    "needs_review_rate": 0.0,
                    "runtime_seconds": 2.0,
                }
            },
        }
        self.runner.save_and_check_regression(run_1)

        # 2. Improved run (garbage rate dropped from 0.05 to 0.02)
        run_2 = {
            "timestamp": "20261001_130000",
            "samples": {
                "sample_a": {
                    "sample": "sample_a",
                    "status": "COMPLETED",
                    "doc_type_predicted": "NEWSPAPER",
                    "doc_type_expected": "NEWSPAPER",
                    "doc_type_correct": True,
                    "confidence": 0.98,
                    "toc_precision": None,
                    "toc_recall": None,
                    "expected_chapters_count": 0,
                    "extracted_chapters_count": 0,
                    "garbage_rate": 0.02,
                    "empty_page_count": 0,
                    "tiny_image_count": 2,
                    "needs_review_rate": 0.0,
                    "runtime_seconds": 1.9,
                }
            },
        }
        exit_code_2 = self.runner.save_and_check_regression(run_2)
        self.assertEqual(exit_code_2, 0)

    def test_classifier_renamed_golden_pdfs_sample_n(self):
        """
        Confirms that renaming golden PDFs to sample_N.pdf (stripping all filename cues)
        produces the exact same expected classification based purely on internal content.
        """
        from document_ai_worker.engine.document_classifier import classify_document

        samples = [
            (Path("eval/golden/newspaper_36p/sample.pdf"), "NEWSPAPER"),
            (Path("eval/golden/single_chapter/sample.pdf"), "SINGLE_CHAPTER"),
            (Path("eval/golden/hindi_gujarati_book/sample.pdf"), "SINGLE_CHAPTER"),
        ]

        for i, (orig_path, expected_kind) in enumerate(samples):
            if not orig_path.exists():
                continue
            renamed_path = self.temp_dir / f"sample_{i + 1}.pdf"
            shutil.copy(orig_path, renamed_path)

            res = classify_document(str(renamed_path))
            self.assertEqual(
                res.kind,
                expected_kind,
                f"Sample {orig_path} renamed to {renamed_path.name} failed! Got {res.kind}, expected {expected_kind}",
            )
            self.assertGreaterEqual(res.confidence, 0.75)
            self.assertLessEqual(res.confidence, 0.98)

    def test_page_router_newspaper_page_1_handwriting(self):
        """
        Confirms that newspaper page 1 with handwritten letter is classified as mixed/handwriting,
        and degrades gracefully to needs_review=True when GEMINI_API_KEY is absent.
        """
        import pymupdf as fitz
        from document_ai_worker.engine.page_router import PageRouter

        pdf_path = Path("eval/golden/newspaper_36p/sample.pdf")
        if not pdf_path.exists():
            return
        doc = fitz.open(str(pdf_path))
        p1 = doc[0]

        # Case 1: Without GEMINI_API_KEY
        router_no_key = PageRouter(gemini_api_key="")
        decision_no_key = router_no_key.probe_page(p1, page_num=1, total_pages=len(doc))
        self.assertIn(decision_no_key.page_kind, ("mixed", "handwriting"))
        self.assertTrue(decision_no_key.needs_review)
        self.assertEqual(decision_no_key.engine, "Fallback (Review Required)")

        # Case 2: With GEMINI_API_KEY
        router_with_key = PageRouter(gemini_api_key="mock_key_xyz")
        decision_with_key = router_with_key.probe_page(p1, page_num=1, total_pages=len(doc))
        self.assertIn(decision_with_key.page_kind, ("mixed", "handwriting"))
        self.assertFalse(decision_with_key.needs_review)
        self.assertEqual(decision_with_key.engine, "Gemini Flash AI (Handwriting)")
        doc.close()

    def test_page_router_newspaper_ad_pages_image_only(self):
        """
        Confirms that full-page graphic advertisements (e.g. p2 De Beers, p6 Tata Sierra)
        are tagged as image_only without triggering error reviews.
        """
        import pymupdf as fitz
        from document_ai_worker.engine.page_router import PageRouter

        pdf_path = Path("eval/golden/newspaper_36p/sample.pdf")
        if not pdf_path.exists():
            return
        doc = fitz.open(str(pdf_path))
        router = PageRouter()

        for page_idx in (1, 5, 8, 12, 35):  # 0-indexed: pages 2, 6, 9, 13, 36
            p = doc[page_idx]
            dec = router.probe_page(p, page_num=page_idx + 1, total_pages=len(doc))
            self.assertEqual(dec.page_kind, "image_only", f"Page {page_idx + 1} was not classified as image_only")
            self.assertFalse(dec.needs_review)
            self.assertEqual(dec.engine, "Image/Ad Classifier")
        doc.close()

    def test_page_router_legacy_font_detection(self):
        """
        Confirms that NCERT Hindi book with Walkman-Chanakya fonts is detected as
        legacy_font_encoding=True and routed to Tesseract (-l hin).
        """
        import pymupdf as fitz
        from document_ai_worker.engine.page_router import PageRouter

        pdf_path = Path("eval/golden/hindi_gujarati_book/sample.pdf")
        if not pdf_path.exists():
            return
        doc = fitz.open(str(pdf_path))
        router = PageRouter()
        # Page 3 contains body prose in Walkman-Chanakya
        p3 = doc[2]
        dec = router.probe_page(p3, page_num=3, total_pages=len(doc))
        self.assertTrue(dec.legacy_font_encoding)
        self.assertEqual(dec.ocr_language, "hin")
        self.assertEqual(dec.detected_script, "devanagari")
        doc.close()

    def test_schema_backward_compatibility(self):
        """
        Verifies that PageSchema and ExtractionResponse maintain backwards compatibility
        with default values and schema_version 1.1.0.
        """
        from document_ai_worker.engine.schema import PageSchema, ExtractionResponse

        page = PageSchema(page_number=1, raw_text="Hello world")
        self.assertEqual(page.page_kind, "digital_text")
        self.assertEqual(page.detected_script, "latin")
        self.assertFalse(page.legacy_font_encoding)
        self.assertFalse(page.needs_review)
        self.assertEqual(page.quality_score, 1.0)

        response = ExtractionResponse(
            job_id=101,
            total_pages=1,
            processed_pages=1,
            pages=[page],
        )
        self.assertEqual(response.schema_version, "1.1.0")
        self.assertEqual(len(response.pages), 1)

    def test_legacy_font_quarantine_corrupted_text(self):
        """
        Confirms that when a page has legacy_font_encoding=True and OCR is unavailable,
        the corrupted text layer is NOT saved as content. needs_review is set to True,
        raw_text is cleared, and the corrupted string is quarantined in metadata.raw_text_unreliable.
        """
        from document_ai_worker.engine.textbook_pipeline import TextbookPipeline

        pdf_path = Path("eval/golden/hindi_gujarati_book/sample.pdf")
        if not pdf_path.exists():
            return
        pipeline = TextbookPipeline(media_dir=str(self.temp_dir))
        _, pages, _ = pipeline.process_pdf(str(pdf_path), max_pages=3, render_image_pixels=False)

        # Page 3 is legacy Walkman-Chanakya
        p3 = pages[2]
        self.assertTrue(p3.legacy_font_encoding)
        self.assertTrue(p3.needs_review)
        self.assertEqual(p3.raw_text, "")
        self.assertIn("raw_text_unreliable", p3.metadata)
        self.assertIn("izsepan", p3.metadata["raw_text_unreliable"])

    def test_classifier_ambiguous_document_scores_below_threshold(self):
        """
        Confirms that a deliberately ambiguous 1-page document with generic corporate text
        and no domain markers scores below 0.60 (confidence <= 0.30, kind UNKNOWN).
        """
        import pymupdf as fitz
        from document_ai_worker.engine.document_classifier import classify_document

        ambig_path = self.temp_dir / "ambiguous_memo.pdf"
        doc = fitz.open()
        p = doc.new_page()
        p.insert_text((72, 72), "Project status meeting minutes. We discussed quarterly goals and team allocations.")
        doc.save(str(ambig_path))
        doc.close()

        res = classify_document(str(ambig_path))
        self.assertEqual(res.kind, "UNKNOWN")
        self.assertLess(res.confidence, 0.60)
        self.assertIn("Insufficient distinct domain markers", res.evidence)


if __name__ == "__main__":
    unittest.main()

