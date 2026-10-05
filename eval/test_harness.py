"""
Unit tests for the Evaluation Harness itself (eval/run.py).
"""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import pymupdf as fitz
from eval.run import EvalRunner, compute_garbage_metrics, compute_tiny_images, match_chapters


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

    def test_compute_garbage_metrics_clean_english_and_hindi(self):
        english_text = "This is a clean English sentence with standard punctuation."
        total, garbage, rate = compute_garbage_metrics(english_text)
        self.assertEqual(garbage, 0)
        self.assertEqual(rate, 0.0)

        hindi_text = "यह एक स्वच्छ हिंदी वाक्य है जिसमें कोई त्रुटि नहीं है।"
        total_hi, garbage_hi, rate_hi = compute_garbage_metrics(hindi_text)
        self.assertEqual(garbage_hi, 0)
        self.assertEqual(rate_hi, 0.0)

    def test_compute_garbage_metrics_detects_corrupt_tokens(self):
        corrupt_text = "Valid text with \ufffd\ufffd and cid:123 \x00\x01\x02 binary gibberish."
        total, garbage, rate = compute_garbage_metrics(corrupt_text)
        self.assertGreater(garbage, 0)
        self.assertGreater(rate, 0.10)

    def test_match_chapters_when_no_toc_expected(self):
        # Both clean: no TOC expected, none extracted
        p, r, acc = match_chapters([], [], total_pages=10)
        self.assertEqual(p, 1.0)
        self.assertEqual(r, 1.0)
        self.assertEqual(acc, 1.0)

        # Hallucinated chapters (false positive)
        p_fp, r_fp, _ = match_chapters([{"title": "Chapter 1", "start_page": 1, "end_page": 10}], [], total_pages=10)
        self.assertEqual(p_fp, 0.0)

    def test_match_chapters_matching_fuzzy_titles_and_numbers(self):
        expected = [
            {"number": 1, "title": "Real Numbers", "start_page": 1, "end_page": 15},
            {"number": 2, "title": "Polynomials", "start_page": 16, "end_page": 30},
        ]
        extracted = [
            {"number": 1, "title": "1. Real Numbers", "start_page": 1, "end_page": 15},
            {"number": 2, "title": "Polynomials", "start_page": 17, "end_page": 30},
        ]
        p, r, acc = match_chapters(extracted, expected, total_pages=30)
        self.assertEqual(p, 1.0)
        self.assertEqual(r, 1.0)
        self.assertGreaterEqual(acc, 0.95)

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
                    "toc_precision": 1.0,
                    "toc_recall": 1.0,
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
                    "toc_precision": 1.0,
                    "toc_recall": 1.0,
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
                    "toc_precision": 1.0,
                    "toc_recall": 1.0,
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
                    "toc_precision": 1.0,
                    "toc_recall": 1.0,
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


if __name__ == "__main__":
    unittest.main()
