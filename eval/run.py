#!/usr/bin/env python3
"""
Evaluation Harness for Document Ingestion & Extraction Pipeline.

Runs the real document classifier and extraction pipeline against golden samples in eval/golden/.
Measures:
  - Document-type classification accuracy & confidence
  - TOC Precision & Recall
  - Chapter page-range accuracy
  - Per-page garbage rate
  - Empty-page count
  - Image count under 60px (width < 60 or height < 60)
  - Needs-review rate
  - Runtime per document

Saves results to eval/results/<timestamp>.json.
Compares against previous runs and exits non-zero if any metric regresses beyond eval/thresholds.json.
Reports confusion matrix and newspaper baseline.
"""

from __future__ import annotations

import argparse
import difflib
import glob
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Configure paths
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "document_ai_worker"))

# Suppress noisy logs during eval run
logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
logger = logging.getLogger("eval_harness")

import pymupdf as fitz
from document_ai_worker.engine.document_classifier import classify_document, DocumentClassificationResult
from document_ai_worker.engine.textbook_pipeline import TextbookPipeline


# ---------------------------------------------------------------------------
# Metric Calculations
# ---------------------------------------------------------------------------

def compute_garbage_metrics(text: str) -> Tuple[int, int, float]:
    """
    Measures character corruption and unprintable noise.
    Returns (total_chars, garbage_chars, garbage_rate).
    """
    if not text:
        return 0, 0, 0.0

    total = len(text)
    garbage = 0

    # Explicit broken tokens
    garbage += text.count("\ufffd") * 3
    garbage += len(re.findall(r"cid:\d+", text)) * 5

    for ch in text:
        code = ord(ch)
        # Standard ASCII printable & common whitespace
        if 32 <= code <= 126 or ch in ("\n", "\t", "\r"):
            continue
        # Latin-1 Supplement (accented characters, common symbols)
        if 160 <= code <= 255:
            continue
        # Devanagari (Hindi, Sanskrit, Marathi)
        if 0x0900 <= code <= 0x097F:
            continue
        # Gujarati
        if 0x0A80 <= code <= 0x0AFF:
            continue
        # General Punctuation (curly quotes, dashes, bullets)
        if 0x2000 <= code <= 0x206F:
            continue
        # Mathematical Operators
        if 0x2200 <= code <= 0x22FF:
            continue

        # Out-of-alphabet or control characters
        if code < 32 or (127 <= code < 160):
            garbage += 2
        elif not ch.isalnum() and not ch.isspace():
            garbage += 1

    rate = min(1.0, garbage / max(total, 1))
    return total, garbage, rate


def compute_tiny_images(doc: fitz.Document) -> int:
    """
    Counts embedded images where width < 60px or height < 60px.
    """
    tiny_count = 0
    seen_xrefs = set()
    for p_idx in range(len(doc)):
        try:
            image_list = doc.get_page_images(p_idx)
            for img in image_list:
                xref = img[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)
                w, h = img[2], img[3]
                if w < 60 or h < 60:
                    tiny_count += 1
        except Exception:
            pass
    return tiny_count


def match_chapters(
    extracted_chapters: List[Dict[str, Any]],
    expected_chapters: List[Dict[str, Any]],
    total_pages: int,
) -> Tuple[float, float, float]:
    """
    Calculates (precision, recall, page_range_accuracy).
    """
    if not expected_chapters and not extracted_chapters:
        return 1.0, 1.0, 1.0

    if not expected_chapters and extracted_chapters:
        # False positives (hallucinated TOC)
        return 0.0, 1.0, 0.0

    if expected_chapters and not extracted_chapters:
        # Missed TOC
        return 0.0, 0.0, 0.0

    # Both have chapters: perform fuzzy title and number matching
    matched_expected = set()
    matched_extracted = set()
    range_accuracies = []

    for ext_idx, ext in enumerate(extracted_chapters):
        ext_title = str(ext.get("title", "")).lower().strip()
        ext_num = ext.get("number") or ext.get("chapter_number")
        ext_start = ext.get("start_page", 1)
        ext_end = ext.get("end_page", total_pages)

        best_match_idx = -1
        best_score = 0.0

        for exp_idx, exp in enumerate(expected_chapters):
            if exp_idx in matched_expected:
                continue
            exp_title = str(exp.get("title", "")).lower().strip()
            exp_num = exp.get("number")

            num_match = (ext_num is not None and exp_num is not None and int(ext_num) == int(exp_num))
            title_sim = difflib.SequenceMatcher(None, ext_title, exp_title).ratio()

            score = title_sim + (0.5 if num_match else 0.0)
            if score > best_score and (title_sim >= 0.55 or num_match):
                best_score = score
                best_match_idx = exp_idx

        if best_match_idx >= 0:
            matched_expected.add(best_match_idx)
            matched_extracted.add(ext_idx)
            exp = expected_chapters[best_match_idx]
            exp_start = exp.get("start_page", 1)
            exp_end = exp.get("end_page", total_pages)

            # Page range match error normalized to document length
            err = (abs(ext_start - exp_start) + abs(ext_end - exp_end)) / max(total_pages, 1)
            range_acc = max(0.0, 1.0 - err)
            range_accuracies.append(range_acc)

    tp = len(matched_expected)
    precision = tp / max(len(extracted_chapters), 1)
    recall = tp / max(len(expected_chapters), 1)
    avg_range_acc = sum(range_accuracies) / max(len(range_accuracies), 1) if range_accuracies else 0.0

    return precision, recall, avg_range_acc


# ---------------------------------------------------------------------------
# Evaluation Pipeline Runner
# ---------------------------------------------------------------------------

class EvalRunner:
    def __init__(self, golden_dir: Path, results_dir: Path, thresholds_path: Path):
        self.golden_dir = golden_dir
        self.results_dir = results_dir
        self.thresholds_path = thresholds_path
        self.thresholds = self._load_thresholds()

    def _load_thresholds(self) -> Dict[str, Any]:
        if self.thresholds_path.exists():
            with open(self.thresholds_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {
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

    def evaluate_sample(self, sample_dir: Path) -> Dict[str, Any]:
        """
        Runs the full evaluation pipeline for a single sample.
        """
        expected_file = sample_dir / "expected.json"
        if not expected_file.exists():
            return {"error": "Missing expected.json", "status": "INVALID"}

        with open(expected_file, "r", encoding="utf-8") as f:
            expected = json.load(f)

        # Find PDF file
        pdf_candidates = list(sample_dir.glob("*.pdf"))
        if not pdf_candidates:
            return {
                "sample": sample_dir.name,
                "status": "SKIPPED_NO_PDF",
                "notes": expected.get("notes", "Placeholder awaiting user-supplied PDF"),
                "expected": expected,
            }

        pdf_path = pdf_candidates[0]
        print(f"--> Evaluating {sample_dir.name} ({pdf_path.name})...", flush=True)
        start_time = time.time()

        # 1. Document Classification
        class_res = classify_document(str(pdf_path), user_document_kind="AUTO")
        exp_doc_type = expected.get("doc_type", "UNKNOWN")
        doc_type_correct = (class_res.kind.upper() == exp_doc_type.upper())

        # 2. Extract Document with Real Pipeline
        doc = fitz.open(str(pdf_path))
        total_pages = len(doc)

        pipeline = TextbookPipeline(media_dir=str(REPO_ROOT / "eval" / "temp_assets"))
        chapters_schema, pages_schema, granularity = pipeline.process_pdf(str(pdf_path), extract_images=False)

        runtime = time.time() - start_time

        # 3. Analyze TOC
        extracted_chapters = [
            {
                "number": c.chapter_number,
                "title": c.title,
                "start_page": c.start_page,
                "end_page": c.end_page,
            }
            for c in chapters_schema
        ]
        expected_chapters = expected.get("chapters", [])
        toc_prec, toc_rec, range_acc = match_chapters(extracted_chapters, expected_chapters, total_pages)

        # 4. Analyze Per-Page Garbage & Empty Pages
        empty_page_count = 0
        page_garbage_rates = []
        review_flagged_pages = 0

        for p_schema in pages_schema:
            raw = p_schema.raw_text or ""
            if not raw.strip():
                empty_page_count += 1
                review_flagged_pages += 1
                page_garbage_rates.append(1.0)
                continue

            _, _, g_rate = compute_garbage_metrics(raw)
            page_garbage_rates.append(g_rate)
            if g_rate > 0.20:
                review_flagged_pages += 1

        avg_garbage_rate = sum(page_garbage_rates) / max(len(page_garbage_rates), 1)

        # 5. Image Analysis (<60px)
        tiny_image_count = compute_tiny_images(doc)
        doc.close()

        # 6. Needs Review Rate
        if class_res.confidence < 0.60:
            review_flagged_pages += 1
        needs_review_rate = min(1.0, review_flagged_pages / max(total_pages, 1))

        return {
            "sample": sample_dir.name,
            "status": "COMPLETED",
            "pdf_name": pdf_path.name,
            "total_pages": total_pages,
            "doc_type_predicted": class_res.kind,
            "doc_type_expected": exp_doc_type,
            "doc_type_correct": doc_type_correct,
            "confidence": round(class_res.confidence, 3),
            "evidence": class_res.evidence,
            "has_toc_expected": expected.get("has_toc", False),
            "extracted_chapters_count": len(extracted_chapters),
            "expected_chapters_count": len(expected_chapters),
            "toc_precision": round(toc_prec, 3),
            "toc_recall": round(toc_rec, 3),
            "page_range_accuracy": round(range_acc, 3),
            "garbage_rate": round(avg_garbage_rate, 4),
            "empty_page_count": empty_page_count,
            "tiny_image_count": tiny_image_count,
            "needs_review_rate": round(needs_review_rate, 3),
            "runtime_seconds": round(runtime, 2),
            "granularity": granularity,
            "notes": expected.get("notes", ""),
        }

    def run_all(self, target_sample: Optional[str] = None) -> Dict[str, Any]:
        """
        Runs evaluation on all golden sample folders or a specific targeted sample.
        """
        sample_dirs = [d for d in self.golden_dir.iterdir() if d.is_dir()]
        sample_dirs.sort(key=lambda d: d.name)

        if target_sample:
            sample_dirs = [d for d in sample_dirs if d.name == target_sample]
            if not sample_dirs:
                raise ValueError(f"Sample directory '{target_sample}' not found in {self.golden_dir}")

        results: Dict[str, Any] = {}
        for s_dir in sample_dirs:
            res = self.evaluate_sample(s_dir)
            results[s_dir.name] = res

        # Generate Confusion Matrix
        confusion_matrix = self._compute_confusion_matrix(results)

        # Baseline extraction for newspaper
        newspaper_baseline = results.get("newspaper_36p")

        return {
            "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S"),
            "samples": results,
            "confusion_matrix": confusion_matrix,
            "newspaper_baseline": newspaper_baseline,
        }

    def _compute_confusion_matrix(self, results: Dict[str, Any]) -> Dict[str, Dict[str, int]]:
        matrix: Dict[str, Dict[str, int]] = {}
        for r in results.values():
            if r.get("status") != "COMPLETED":
                continue
            exp = r["doc_type_expected"]
            pred = r["doc_type_predicted"]
            if exp not in matrix:
                matrix[exp] = {}
            matrix[exp][pred] = matrix[exp].get(pred, 0) + 1
        return matrix

    def print_report(self, run_data: Dict[str, Any]) -> None:
        samples = run_data["samples"]

        print("\n" + "=" * 115)
        print("DOCUMENT INGESTION & EXTRACTION PIPELINE EVALUATION HARNESS")
        print("=" * 115)

        # Table Header
        header = (
            f"{'Sample Name':<22} | {'Doc-Type (Conf)':<20} | {'TOC P/R':<11} | {'Range Acc':<9} | "
            f"{'Garbage':<8} | {'Empty':<5} | {'<60px':<5} | {'Review':<7} | {'Runtime':<7}"
        )
        print(header)
        print("-" * 115)

        for name, r in samples.items():
            if r.get("status") == "SKIPPED_NO_PDF":
                print(f"{name:<22} | {'[NO PDF - PLACEHOLDER]':<20} | {'-':<11} | {'-':<9} | {'-':<8} | {'-':<5} | {'-':<5} | {'-':<7} | {'-':<7}")
                continue

            if r.get("status") != "COMPLETED":
                print(f"{name:<22} | {r.get('error', 'ERROR'):<20} | {'-':<11} | {'-':<9} | {'-':<8} | {'-':<5} | {'-':<5} | {'-':<7} | {'-':<7}")
                continue

            match_sym = "Y" if r["doc_type_correct"] else "N"
            doc_type_str = f"{match_sym} {r['doc_type_predicted'][:9]} ({r['confidence']:.2f})"
            toc_str = f"{r['toc_precision']:.2f}/{r['toc_recall']:.2f}"
            range_str = f"{r['page_range_accuracy'] * 100:.1f}%"
            garbage_str = f"{r['garbage_rate'] * 100:.2f}%"
            empty_str = str(r["empty_page_count"])
            tiny_str = str(r["tiny_image_count"])
            review_str = f"{r['needs_review_rate'] * 100:.1f}%"
            runtime_str = f"{r['runtime_seconds']:.1f}s"

            print(
                f"{name:<22} | {doc_type_str:<20} | {toc_str:<11} | {range_str:<9} | "
                f"{garbage_str:<8} | {empty_str:<5} | {tiny_str:<5} | {review_str:<7} | {runtime_str:<7}"
            )

        print("-" * 115)

        # Confusion Matrix
        cm = run_data.get("confusion_matrix", {})
        print("\n--- CONFUSION MATRIX (Expected vs Predicted) ---")
        if cm:
            all_preds = sorted({p for preds in cm.values() for p in preds.keys()})
            cm_header = f"{'Expected \\ Pred':<20} | " + " | ".join(f"{p:<12}" for p in all_preds)
            print(cm_header)
            print("-" * len(cm_header))
            for exp, preds in cm.items():
                row_str = f"{exp:<20} | " + " | ".join(f"{preds.get(p, 0):<12}" for p in all_preds)
                print(row_str)
        else:
            print("No completed samples to populate confusion matrix.")

        # Baseline Report for Newspaper
        nb = run_data.get("newspaper_baseline")
        if nb and nb.get("status") == "COMPLETED":
            print("\n" + "=" * 70)
            print("NEWSPAPER BASELINE REPORT (Times of India 36-page Broadsheet)")
            print("=" * 70)
            print(f"Sample Name:             {nb['sample']}")
            print(f"Total Pages:             {nb['total_pages']}")
            print(f"Predicted Kind:          {nb['doc_type_predicted']} (Expected: {nb['doc_type_expected']})")
            print(f"Classification Score:    {nb['confidence']} (Correct: {nb['doc_type_correct']})")
            print(f"Per-Page Garbage Rate:   {nb['garbage_rate'] * 100:.2f}%")
            print(f"Empty Page Count:        {nb['empty_page_count']}")
            print(f"Tiny Images (<60px):     {nb['tiny_image_count']}")
            print(f"Extracted TOC Entries:   {nb['extracted_chapters_count']} (Expected: {nb['expected_chapters_count']})")
            print(f"Needs-Review Rate:       {nb['needs_review_rate'] * 100:.1f}%")
            print(f"Total Extraction Time:   {nb['runtime_seconds']:.2f}s")
            print(f"Evidence:                {nb['evidence']}")
            print("=" * 70)

    def save_and_check_regression(self, run_data: Dict[str, Any]) -> int:
        """
        Saves run to eval/results/<timestamp>.json, compares against previous run,
        and returns exit code (0 = pass, 1 = regression failure).
        """
        self.results_dir.mkdir(parents=True, exist_ok=True)
        timestamp = run_data["timestamp"]
        current_file = self.results_dir / f"{timestamp}.json"

        # Find previous runs
        past_files = sorted(self.results_dir.glob("*.json"))
        # Exclude current file if it already exists
        past_files = [f for f in past_files if f.name != current_file.name]

        # Save current run
        with open(current_file, "w", encoding="utf-8") as f:
            json.dump(run_data, f, indent=2)
        try:
            rel_display = current_file.relative_to(REPO_ROOT)
        except ValueError:
            rel_display = current_file
        print(f"\n[Artifact Saved] Results written to {rel_display}")

        if not past_files:
            print("[Baseline Run] First recorded evaluation run. Regression baseline established.")
            return 0

        latest_prev_file = past_files[-1]
        print(f"[Regression Check] Comparing against previous run: {latest_prev_file.name}")
        with open(latest_prev_file, "r", encoding="utf-8") as f:
            prev_data = json.load(f)

        regressions: List[str] = []
        curr_samples = run_data["samples"]
        prev_samples = prev_data.get("samples", {})

        for name, curr in curr_samples.items():
            if curr.get("status") != "COMPLETED":
                continue
            prev = prev_samples.get(name)
            if not prev or prev.get("status") != "COMPLETED":
                continue

            # 1. Doc-type correctness regression
            if prev["doc_type_correct"] and not curr["doc_type_correct"]:
                regressions.append(
                    f"Sample '{name}': doc_type accuracy regressed from {prev['doc_type_predicted']} to {curr['doc_type_predicted']}"
                )

            # 2. TOC precision / recall drop
            toc_prec_drop = prev["toc_precision"] - curr["toc_precision"]
            if toc_prec_drop > self.thresholds.get("max_toc_precision_drop", 0.05):
                regressions.append(
                    f"Sample '{name}': TOC precision dropped by {toc_prec_drop:.3f} (tolerance: {self.thresholds['max_toc_precision_drop']})"
                )

            toc_rec_drop = prev["toc_recall"] - curr["toc_recall"]
            if toc_rec_drop > self.thresholds.get("max_toc_recall_drop", 0.05):
                regressions.append(
                    f"Sample '{name}': TOC recall dropped by {toc_rec_drop:.3f} (tolerance: {self.thresholds['max_toc_recall_drop']})"
                )

            # 3. Garbage rate increase
            garbage_inc = curr["garbage_rate"] - prev["garbage_rate"]
            if garbage_inc > self.thresholds.get("max_garbage_rate_increase", 0.03):
                regressions.append(
                    f"Sample '{name}': Garbage rate worsened by +{garbage_inc:.3f} (tolerance: +{self.thresholds['max_garbage_rate_increase']})"
                )

            # 4. Empty page count increase
            empty_inc = curr["empty_page_count"] - prev["empty_page_count"]
            if empty_inc > self.thresholds.get("max_empty_page_count_increase", 0):
                regressions.append(
                    f"Sample '{name}': Empty page count increased by +{empty_inc} (tolerance: +{self.thresholds['max_empty_page_count_increase']})"
                )

            # 5. Tiny image noise increase
            tiny_inc = curr["tiny_image_count"] - prev["tiny_image_count"]
            if tiny_inc > self.thresholds.get("max_tiny_image_count_increase", 5):
                regressions.append(
                    f"Sample '{name}': Tiny image count (<60px) increased by +{tiny_inc} (tolerance: +{self.thresholds['max_tiny_image_count_increase']})"
                )

            # 6. Needs review rate increase
            review_inc = curr["needs_review_rate"] - prev["needs_review_rate"]
            if review_inc > self.thresholds.get("max_needs_review_rate_increase", 0.05):
                regressions.append(
                    f"Sample '{name}': Needs-review rate worsened by +{review_inc:.3f} (tolerance: +{self.thresholds['max_needs_review_rate_increase']})"
                )

            # 7. Runtime regression
            prev_runtime = max(prev.get("runtime_seconds", 1.0), 0.5)
            runtime_ratio = (curr["runtime_seconds"] - prev_runtime) / prev_runtime
            if runtime_ratio > self.thresholds.get("max_runtime_increase_pct", 0.50):
                regressions.append(
                    f"Sample '{name}': Runtime increased by +{runtime_ratio * 100:.1f}% ({prev['runtime_seconds']}s -> {curr['runtime_seconds']}s)"
                )

        if regressions:
            print("\n" + "!" * 70)
            print("[REGRESSION DETECTED] The current run failed regression tolerances:")
            for reg in regressions:
                print(f"  [FAIL] {reg}")
            print("!" * 70)
            return 1

        print("\n[REGRESSION CHECK PASSED] All metrics within tolerances defined in eval/thresholds.json.")
        return 0


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Document Pipeline Evaluation Harness")
    parser.add_argument("--sample", type=str, default=None, help="Name of specific sample folder in eval/golden to run")
    parser.add_argument("--no-save", action="store_true", help="Do not save result to eval/results")
    args = parser.parse_args()

    golden_dir = REPO_ROOT / "eval" / "golden"
    results_dir = REPO_ROOT / "eval" / "results"
    thresholds_path = REPO_ROOT / "eval" / "thresholds.json"

    runner = EvalRunner(golden_dir=golden_dir, results_dir=results_dir, thresholds_path=thresholds_path)
    run_data = runner.run_all(target_sample=args.sample)
    runner.print_report(run_data)

    if args.no_save:
        print("\n[Notice] --no-save specified; skipping result persistence and regression comparison.")
        return 0

    exit_code = runner.save_and_check_regression(run_data)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
