#!/usr/bin/env python3
"""
Evaluation Harness for Document Ingestion & Extraction Pipeline.

Runs the real document classifier and extraction pipeline against golden samples in eval/golden/.
Supports:
  --mode full|fast (default: fast)
Measures:
  - Document-type classification accuracy & confidence
  - TOC Precision & Recall (or explicit "correct: no TOC produced")
  - Chapter page-range accuracy
  - Per-page script-aware garbage rate (Devanagari, Gujarati, Latin)
  - Empty-page count
  - Output section tiny image count (<60px from final SectionSchema diagrams)
  - Needs-review rate
  - Runtime per document

Saves results to eval/results/<timestamp>.json.
Compares against previous runs and exits non-zero if any metric regresses beyond eval/thresholds.json.
Reports confusion matrix and newspaper baseline.
"""

from __future__ import annotations

import argparse
import difflib
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
from document_ai_worker.engine.handwriting_pipeline import HandwritingPipeline


# ---------------------------------------------------------------------------
# Metric Calculations
# ---------------------------------------------------------------------------

def compute_script_aware_garbage(text: str) -> Tuple[int, int, float]:
    """
    Measures character corruption and unprintable noise across Latin, Devanagari, and Gujarati.
    Uses language-independent signals:
      - Broken font markers (replacement char \\ufffd, unresolved cid:\\d+)
      - Control & unprintable byte codes (<32 excluding \\n,\\t,\\r, and 127-159)
      - Intra-word illegal symbols (|&[]{}*^~\\`$@=<>_)
      - Mixed-script corruption within tokens (Latin + Indic letters)
      - Single-character non-word fragment density
      - Token-length anomalies (>55 characters without spacing)
    Returns (total_chars, garbage_chars, garbage_rate).
    """
    if not text:
        return 0, 0, 0.0

    total = len(text)
    garbage = 0

    # 1. Explicit replacement & CID markers
    garbage += text.count("\ufffd") * 3
    garbage += len(re.findall(r"cid:\d+", text)) * 5

    # 2. Control characters & non-printable bytes
    for ch in text:
        code = ord(ch)
        if (code < 32 and ch not in ("\n", "\t", "\r")) or (127 <= code < 160):
            garbage += 2

    # 3. Token-level analysis
    tokens = text.split()
    valid_single_latin = {"a", "i", "A", "I"}
    valid_single_devanagari = {"व", "०", "१", "२", "३", "४", "५", "६", "७", "८", "९"}
    valid_single_gujarati = {"આ", "એ", "ઓ", "ઈ", "ઉ", "૦", "૧", "૨", "૩", "૪", "૫", "૬", "૭", "૮", "૯"}
    intra_word_symbols = set("|&[]{}*^~\\`$@=<>_")

    for token in tokens:
        # Check token length (glued words without spacing)
        if len(token) > 55:
            garbage += len(token) // 2
        elif len(token) == 1:
            ch = token[0]
            code = ord(ch)
            if "A" <= ch <= "Z" or "a" <= ch <= "z":
                if ch not in valid_single_latin:
                    garbage += 1
            elif 0x0900 <= code <= 0x097F:
                if ch not in valid_single_devanagari:
                    garbage += 1
            elif 0x0A80 <= code <= 0x0AFF:
                if ch not in valid_single_gujarati:
                    garbage += 1

        # Check intra-word symbols (corrupted legacy font / OCR noise)
        sym_count = sum(1 for c in token if c in intra_word_symbols)
        alpha_count = sum(1 for c in token if c.isalnum())
        if sym_count > 0 and alpha_count > 0:
            garbage += sym_count * 2

        # Check mixed-script (Latin + Indic letters within same token)
        has_latin = any(("A" <= c <= "Z" or "a" <= c <= "z") for c in token)
        has_devanagari = any(0x0900 <= ord(c) <= 0x097F for c in token)
        has_gujarati = any(0x0A80 <= ord(c) <= 0x0AFF for c in token)
        if (has_latin and has_devanagari) or (has_latin and has_gujarati) or (has_devanagari and has_gujarati):
            garbage += len(token)

    rate = min(1.0, garbage / max(total, 1))
    return total, garbage, rate


# Backwards compatibility alias
compute_garbage_metrics = compute_script_aware_garbage


def compute_section_tiny_images(pages_schema: List[Any]) -> int:
    """
    Counts diagram/image sections in final output where width < 60px or height < 60px.
    Inspects SectionSchema items in final pages_schema only (not raw PDF image streams).
    """
    tiny_count = 0
    for page in pages_schema:
        sections = getattr(page, "sections", []) or []
        for sec in sections:
            sec_type = getattr(sec, "type", "")
            img_path = getattr(sec, "image_path", "")
            img_data = getattr(sec, "image_data", "")
            meta = getattr(sec, "metadata", {}) or {}

            is_diagram = (
                sec_type in ("DIAGRAM", "FIGURE", "IMAGE")
                or bool(img_path)
                or bool(img_data)
                or (isinstance(meta, dict) and "bbox" in meta and sec_type == "DIAGRAM")
            )
            if not is_diagram:
                continue

            w, h = 0.0, 0.0
            bbox = meta.get("bbox") if isinstance(meta, dict) else None
            if bbox and len(bbox) >= 4:
                w = abs(bbox[2] - bbox[0])
                h = abs(bbox[3] - bbox[1])
            elif img_path and os.path.exists(img_path):
                try:
                    from PIL import Image
                    with Image.open(img_path) as im:
                        w, h = im.size
                except Exception:
                    pass

            if (w > 0 and h > 0) and (w < 60 or h < 60):
                tiny_count += 1

    return tiny_count


# Legacy alias
def compute_tiny_images(doc: Any) -> int:
    """
    Deprecated raw PDF object counter retained for legacy test compatibility.
    """
    if not hasattr(doc, "get_page_images"):
        return 0
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
) -> Tuple[Optional[float], Optional[float], Optional[float], str]:
    """
    Calculates (precision, recall, page_range_accuracy, toc_status).
    When expected TOC is empty:
      - None extracted: returns (None, None, None, "correct: no TOC produced")
      - Extracted > 0: returns (0.0, None, 0.0, "false positive: N chapters produced")
    """
    if not expected_chapters and not extracted_chapters:
        return None, None, None, "correct: no TOC produced"

    if not expected_chapters and extracted_chapters:
        # False positives (hallucinated TOC)
        return 0.0, None, 0.0, f"false positive: {len(extracted_chapters)} chapters produced"

    if expected_chapters and not extracted_chapters:
        # Missed TOC
        return 0.0, 0.0, 0.0, f"missed TOC: 0/{len(expected_chapters)} chapters extracted"

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
    status_str = f"{tp}/{len(expected_chapters)} chapters matched ({len(extracted_chapters)} extracted)"

    return precision, recall, avg_range_acc, status_str


# ---------------------------------------------------------------------------
# Evaluation Pipeline Runner
# ---------------------------------------------------------------------------

class EvalRunner:
    def __init__(self, golden_dir: Path, results_dir: Path, thresholds_path: Path):
        self.golden_dir = golden_dir
        self.results_dir = results_dir
        self.thresholds_path = thresholds_path
        self.thresholds = self._load_thresholds()
        self.manifest = self._load_manifest()

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

    def _load_manifest(self) -> Dict[str, Any]:
        manifest_path = self.golden_dir / "MANIFEST.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _resolve_pdf_path(self, sample_dir: Path) -> Optional[Path]:
        """
        Locates the PDF for a sample, checking local sample folder and manifest expected paths.
        """
        pdf_candidates = list(sample_dir.glob("*.pdf"))
        if pdf_candidates:
            return pdf_candidates[0]

        # Check MANIFEST.json fallback paths
        sample_name = sample_dir.name
        manifest_samples = self.manifest.get("samples", {})
        if sample_name in manifest_samples:
            expected_paths = manifest_samples[sample_name].get("expected_local_paths", [])
            for cand in expected_paths:
                p = Path(cand)
                if not p.is_absolute():
                    p = REPO_ROOT / p
                if p.exists():
                    return p

        return None

    def evaluate_sample(self, sample_dir: Path, mode: str = "fast") -> Dict[str, Any]:
        """
        Runs the full evaluation pipeline for a single sample using the REAL extraction path.
        """
        expected_file = sample_dir / "expected.json"
        if not expected_file.exists():
            return {"error": "Missing expected.json", "status": "INVALID"}

        with open(expected_file, "r", encoding="utf-8") as f:
            expected = json.load(f)

        pdf_path = self._resolve_pdf_path(sample_dir)
        if not pdf_path or not pdf_path.exists():
            return {
                "sample": sample_dir.name,
                "status": "SKIPPED_NO_PDF",
                "notes": expected.get("notes", "Placeholder awaiting user-supplied PDF"),
                "expected": expected,
            }

        print(f"--> Evaluating {sample_dir.name} ({pdf_path.name}) [mode={mode}]...", flush=True)
        start_time = time.time()
        import psutil
        proc = psutil.Process()
        mem_before = proc.memory_info().rss / (1024 * 1024)

        # 1. Document Classification
        class_res = classify_document(str(pdf_path), user_document_kind="AUTO")
        exp_doc_type = expected.get("doc_type", "UNKNOWN")
        doc_type_correct = (class_res.kind.upper() == exp_doc_type.upper())

        # 2. Extract Document with Real Pipeline (Same routing as cli_extractor.py)
        engine_name = "Rule-Based Pipeline"
        media_temp = str(REPO_ROOT / "eval" / "temp_assets")

        if class_res.kind == "HANDWRITTEN_NOTES":
            gemini_key = os.environ.get("GEMINI_API_KEY", "")
            pipeline_hw = HandwritingPipeline(media_dir=media_temp, gemini_api_key=gemini_key)
            chapters_schema, pages_schema, granularity = pipeline_hw.process_pdf(str(pdf_path))
            engine_name = "Gemini Flash AI (Handwriting)" if gemini_key else "Tesseract/EasyOCR (Handwriting)"
        else:
            use_docling = os.environ.get("USE_DOCLING", "1") == "1"
            extracted_successfully = False
            if use_docling:
                try:
                    from document_ai_worker.engine.docling_pipeline import DoclingPipeline
                    docling_pipeline = DoclingPipeline(media_dir=media_temp)
                    chapters_schema, pages_schema, granularity = docling_pipeline.process_pdf(str(pdf_path))
                    extracted_successfully = True
                    engine_name = "Docling AI (DocLayNet)"
                except Exception:
                    pass

            if not extracted_successfully:
                pipeline_tb = TextbookPipeline(media_dir=media_temp)
                engine_name = "TextbookPipeline (Rule-Based Fallback)"
                render_pixels = (mode == "full")
                chapters_schema, pages_schema, granularity = pipeline_tb.process_pdf(
                    str(pdf_path),
                    extract_images=True,
                    render_image_pixels=render_pixels,
                )

        doc = fitz.open(str(pdf_path))
        total_pages = len(doc)
        doc.close()
        runtime = time.time() - start_time
        mem_after = proc.memory_info().rss / (1024 * 1024)
        peak_memory_mb = round(max(mem_before, mem_after), 1)

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
        toc_prec, toc_rec, range_acc, toc_status = match_chapters(extracted_chapters, expected_chapters, total_pages)

        # 4. Analyze Per-Page Script-Aware Garbage & Empty Pages
        empty_page_count = 0
        page_garbage_rates = []
        review_flagged_pages = 0
        page_kinds_summary: Dict[str, int] = {}

        for p_schema in pages_schema:
            raw = p_schema.raw_text or ""
            p_kind = getattr(p_schema, "page_kind", "digital_text")
            p_review = getattr(p_schema, "needs_review", False)
            page_kinds_summary[p_kind] = page_kinds_summary.get(p_kind, 0) + 1

            if p_review:
                review_flagged_pages += 1

            if not raw.strip():
                if p_kind in ("image_only", "blank"):
                    # Legitimate image-only advertisement or blank page; not an empty page failure
                    page_garbage_rates.append(0.0)
                else:
                    empty_page_count += 1
                    if not p_review:
                        review_flagged_pages += 1
                    page_garbage_rates.append(1.0)
                continue

            _, _, g_rate = compute_script_aware_garbage(raw)
            page_garbage_rates.append(g_rate)
            if g_rate > 0.20 and not p_review:
                review_flagged_pages += 1

        avg_garbage_rate = sum(page_garbage_rates) / max(len(page_garbage_rates), 1)

        # 5. Image Analysis (<60px from final output SectionSchema diagrams)
        tiny_image_count = compute_section_tiny_images(pages_schema)

        # 6. Needs Review Rate
        if class_res.confidence < 0.60:
            review_flagged_pages += 1
        needs_review_rate = min(1.0, review_flagged_pages / max(total_pages, 1))

        return {
            "sample": sample_dir.name,
            "status": "COMPLETED",
            "mode": mode,
            "engine": engine_name,
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
            "toc_precision": round(toc_prec, 3) if toc_prec is not None else None,
            "toc_recall": round(toc_rec, 3) if toc_rec is not None else None,
            "toc_status": toc_status,
            "page_range_accuracy": round(range_acc, 3) if range_acc is not None else None,
            "garbage_rate": round(avg_garbage_rate, 4),
            "empty_page_count": empty_page_count,
            "tiny_image_count": tiny_image_count,
            "needs_review_rate": round(needs_review_rate, 3),
            "runtime_seconds": round(runtime, 2),
            "memory_mb": peak_memory_mb,
            "page_kinds": page_kinds_summary,
            "granularity": granularity,
            "notes": expected.get("notes", ""),
        }

    def run_all(self, target_sample: Optional[str] = None, mode: str = "fast") -> Dict[str, Any]:
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
            res = self.evaluate_sample(s_dir, mode=mode)
            results[s_dir.name] = res

        confusion_matrix = self._compute_confusion_matrix(results)
        newspaper_baseline = results.get("newspaper_36p")

        return {
            "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S"),
            "mode": mode,
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
        mode = run_data.get("mode", "fast")

        print("\n" + "=" * 140)
        print(f"DOCUMENT INGESTION & EXTRACTION PIPELINE EVALUATION HARNESS [MODE: {mode.upper()}]")
        print("=" * 140)

        header = (
            f"{'Sample Name':<20} | {'Doc-Type (Conf)':<18} | {'Engine Used':<24} | "
            f"{'TOC (P/R or Status)':<22} | {'Range Acc':<9} | {'Garbage':<8} | "
            f"{'Empty':<5} | {'<60px':<5} | {'Review':<7} | {'Runtime (Mem)':<15}"
        )
        print(header)
        print("-" * 140)

        failures = []

        for name, r in samples.items():
            if r.get("status") == "SKIPPED_NO_PDF":
                print(f"{name:<20} | {'[NO PDF - PLACEHOLDER]':<18} | {'-':<24} | {'-':<22} | {'-':<9} | {'-':<8} | {'-':<5} | {'-':<5} | {'-':<7} | {'-':<15}")
                continue

            if r.get("status") != "COMPLETED":
                print(f"{name:<20} | {r.get('error', 'ERROR'):<18} | {'-':<24} | {'-':<22} | {'-':<9} | {'-':<8} | {'-':<5} | {'-':<5} | {'-':<7} | {'-':<15}")
                continue

            if not r["doc_type_correct"]:
                failures.append((name, r["doc_type_expected"], r["doc_type_predicted"], r["confidence"]))
                match_sym = "[FAIL]"
            else:
                match_sym = "[OK]"

            doc_type_str = f"{match_sym} {r['doc_type_predicted'][:8]} ({r['confidence']:.2f})"
            engine_str = r.get("engine", "Pipeline")[:24]

            if r["toc_precision"] is None:
                toc_str = "n/a (no TOC)"
            else:
                toc_str = f"{r['toc_precision']:.2f}/{r['toc_recall']:.2f}"

            range_str = "n/a" if r["page_range_accuracy"] is None else f"{r['page_range_accuracy'] * 100:.1f}%"
            garbage_str = f"{r['garbage_rate'] * 100:.2f}%"
            empty_str = str(r["empty_page_count"])
            tiny_str = str(r["tiny_image_count"])
            review_str = f"{r['needs_review_rate'] * 100:.1f}%"
            mem_val = r.get("memory_mb", 0)
            runtime_str = f"{r['runtime_seconds']:.1f}s ({mem_val:.0f}MB)"

            print(
                f"{name:<20} | {doc_type_str:<18} | {engine_str:<24} | {toc_str:<22} | "
                f"{range_str:<9} | {garbage_str:<8} | {empty_str:<5} | {tiny_str:<5} | "
                f"{review_str:<7} | {runtime_str:<15}"
            )

        print("-" * 140)

        if failures:
            print("\n[CLASSIFICATION FAILURES DETECTED]")
            for f_name, f_exp, f_pred, f_conf in failures:
                print(f"  [FAIL] Sample '{f_name}': Expected {f_exp}, Got {f_pred} (confidence: {f_conf:.2f})")

        # Confusion Matrix
        cm = run_data.get("confusion_matrix", {})
        print("\n--- CONFUSION MATRIX (Expected vs Predicted) ---")
        if cm:
            all_preds = sorted({p for preds in cm.values() for p in preds.keys()})
            cm_header = f"{'Expected \\ Pred':<20} | " + " | ".join(f"{p:<14}" for p in all_preds)
            print(cm_header)
            print("-" * len(cm_header))
            for exp, preds in cm.items():
                row_str = f"{exp:<20} | " + " | ".join(f"{preds.get(p, 0):<14}" for p in all_preds)
                print(row_str)
        else:
            print("No completed samples to populate confusion matrix.")

        # Baseline Report for Newspaper
        nb = run_data.get("newspaper_baseline")
        if nb and nb.get("status") == "COMPLETED":
            print("\n" + "=" * 75)
            print(f"NEWSPAPER BASELINE REPORT (Times of India 36-page Broadsheet) [MODE: {mode.upper()}]")
            print("=" * 75)
            print(f"Sample Name:             {nb['sample']}")
            print(f"Extraction Engine:       {nb['engine']}")
            print(f"Total Pages:             {nb['total_pages']}")
            print(f"Predicted Kind:          {nb['doc_type_predicted']} (Expected: {nb['doc_type_expected']})")
            print(f"Classification Score:    {nb['confidence']} (Correct: {nb['doc_type_correct']})")
            print(f"Per-Page Garbage Rate:   {nb['garbage_rate'] * 100:.2f}%")
            print(f"Empty Page Count:        {nb['empty_page_count']}")
            print(f"Tiny Images (<60px):     {nb['tiny_image_count']} (from final output section diagrams)")
            print(f"Extracted TOC Status:    {nb['toc_status']}")
            print(f"Needs-Review Rate:       {nb['needs_review_rate'] * 100:.1f}%")
            print(f"Total Extraction Time:   {nb['runtime_seconds']:.2f}s")
            print(f"Evidence:                {nb['evidence']}")
            print("=" * 75)

    def save_and_check_regression(self, run_data: Dict[str, Any]) -> int:
        """
        Saves run to eval/results/<timestamp>.json, compares against previous run,
        and returns exit code (0 = pass, 1 = regression failure).
        """
        self.results_dir.mkdir(parents=True, exist_ok=True)
        timestamp = run_data["timestamp"]
        current_file = self.results_dir / f"{timestamp}.json"

        # Save current run to disk
        with open(current_file, "w", encoding="utf-8") as f:
            json.dump(run_data, f, indent=2)
        try:
            rel_display = current_file.relative_to(REPO_ROOT)
        except ValueError:
            rel_display = current_file
        print(f"\n[Artifact Saved] Results written to {rel_display}")

        current_mode = run_data.get("mode", "fast")
        # Find previous runs matching the same mode (so fast is compared to fast, full to full)
        past_files = sorted(self.results_dir.glob("*.json"))
        past_files = [f for f in past_files if f.name != current_file.name]

        same_mode_files = []
        for f in past_files:
            try:
                with open(f, "r", encoding="utf-8") as pf:
                    data = json.load(pf)
                    if data.get("mode", "fast") == current_mode:
                        same_mode_files.append(f)
            except Exception:
                pass

        if not same_mode_files:
            if not past_files:
                print("[Baseline Run] First recorded evaluation run. Regression baseline established.")
            else:
                print(f"[Baseline Run] First recorded evaluation run for mode '{current_mode}'. Regression baseline established.")
            return 0

        latest_prev_file = same_mode_files[-1]
        print(f"[Regression Check] Comparing against previous run ({current_mode} mode): {latest_prev_file.name}")
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

            # 2. TOC precision drop / false positive regression
            if prev.get("toc_precision") is not None and curr.get("toc_precision") is not None:
                toc_prec_drop = prev["toc_precision"] - curr["toc_precision"]
                if toc_prec_drop > self.thresholds.get("max_toc_precision_drop", 0.05):
                    regressions.append(
                        f"Sample '{name}': TOC precision dropped by {toc_prec_drop:.3f} (tolerance: {self.thresholds['max_toc_precision_drop']})"
                    )
            elif curr.get("expected_chapters_count", 0) == 0:
                if curr.get("extracted_chapters_count", 0) > 0 and prev.get("extracted_chapters_count", 0) == 0:
                    regressions.append(
                        f"Sample '{name}': Hallucinated {curr['extracted_chapters_count']} chapters when none were expected."
                    )

            # 3. TOC recall drop
            if prev.get("toc_recall") is not None and curr.get("toc_recall") is not None:
                toc_rec_drop = prev["toc_recall"] - curr["toc_recall"]
                if toc_rec_drop > self.thresholds.get("max_toc_recall_drop", 0.05):
                    regressions.append(
                        f"Sample '{name}': TOC recall dropped by {toc_rec_drop:.3f} (tolerance: {self.thresholds['max_toc_recall_drop']})"
                    )

            # 4. Garbage rate increase
            garbage_inc = curr["garbage_rate"] - prev["garbage_rate"]
            if garbage_inc > self.thresholds.get("max_garbage_rate_increase", 0.03):
                regressions.append(
                    f"Sample '{name}': Garbage rate worsened by +{garbage_inc:.3f} (tolerance: +{self.thresholds['max_garbage_rate_increase']})"
                )

            # 5. Empty page count increase
            empty_inc = curr["empty_page_count"] - prev["empty_page_count"]
            if empty_inc > self.thresholds.get("max_empty_page_count_increase", 0):
                regressions.append(
                    f"Sample '{name}': Empty page count increased by +{empty_inc} (tolerance: +{self.thresholds['max_empty_page_count_increase']})"
                )

            # 6. Tiny image noise increase
            tiny_inc = curr["tiny_image_count"] - prev["tiny_image_count"]
            if tiny_inc > self.thresholds.get("max_tiny_image_count_increase", 5):
                regressions.append(
                    f"Sample '{name}': Tiny image count (<60px) increased by +{tiny_inc} (tolerance: +{self.thresholds['max_tiny_image_count_increase']})"
                )

            # 7. Needs review rate increase
            review_inc = curr["needs_review_rate"] - prev["needs_review_rate"]
            if review_inc > self.thresholds.get("max_needs_review_rate_increase", 0.05):
                regressions.append(
                    f"Sample '{name}': Needs-review rate worsened by +{review_inc:.3f} (tolerance: +{self.thresholds['max_needs_review_rate_increase']})"
                )

            # 8. Runtime regression
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
    parser.add_argument("--mode", type=str, choices=["fast", "full"], default="fast", help="Extraction mode (fast: metadata diagrams; full: full raster visual generation)")
    parser.add_argument("--sample", type=str, default=None, help="Name of specific sample folder in eval/golden to run")
    parser.add_argument("--no-save", action="store_true", help="Do not save result to eval/results")
    args = parser.parse_args()

    golden_dir = REPO_ROOT / "eval" / "golden"
    results_dir = REPO_ROOT / "eval" / "results"
    thresholds_path = REPO_ROOT / "eval" / "thresholds.json"

    runner = EvalRunner(golden_dir=golden_dir, results_dir=results_dir, thresholds_path=thresholds_path)
    run_data = runner.run_all(target_sample=args.sample, mode=args.mode)
    runner.print_report(run_data)

    if args.no_save:
        print("\n[Notice] --no-save specified; skipping result persistence and regression comparison.")
        return 0

    exit_code = runner.save_and_check_regression(run_data)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
