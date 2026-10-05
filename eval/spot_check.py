"""
Ground-Truth Spot-Check Metric (Word-Level Accuracy).
Evaluates 11 sample pages across:
- 5 newspaper pages (p3, p4, p11, p15, p20)
- 3 Hindi book pages (p3, p4, p5)
- 3 Single chapter pages (p1, p2, p3)
against verified ground truth text files in eval/spot_checks/.
"""

import os
import sys
import json
import re
import difflib
import unicodedata
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, ".")

SPOT_DIR = Path("eval/spot_checks")
RESULTS_DIR = Path("eval/results")


def normalize_words(text: str) -> List[str]:
    """Tokenizes and normalizes text into word tokens stripped of punctuation."""
    norm = unicodedata.normalize("NFC", text).lower()
    raw_tokens = norm.split()
    clean = []
    for t in raw_tokens:
        cleaned = re.sub(r"^[^\w\u0900-\u097f]+|[^\w\u0900-\u097f]+$", "", t)
        if cleaned:
            clean.append(cleaned)
    return clean


def calculate_word_accuracy(gt_text: str, ext_text: str) -> Tuple[float, int, int]:
    """
    Calculates word-level accuracy using sequence alignment.
    Returns (accuracy_percentage, matching_words, total_gt_words).
    """
    gt_words = normalize_words(gt_text)
    ext_words = normalize_words(ext_text)
    if not gt_words:
        return 100.0, 0, 0

    matcher = difflib.SequenceMatcher(None, gt_words, ext_words)
    matches = sum(block.size for block in matcher.get_matching_blocks())
    acc = (matches / len(gt_words)) * 100.0
    return round(acc, 2), matches, len(gt_words)


def run_spot_checks() -> Dict[str, Dict]:
    # Load extraction JSONs
    hindi_json_path = RESULTS_DIR / "extraction_hindi_gujarati_book.json"
    news_json_path = RESULTS_DIR / "extraction_newspaper_36p.json"

    with open(hindi_json_path, "r", encoding="utf-8") as f:
        hindi_pages = json.load(f)

    with open(news_json_path, "r", encoding="utf-8") as f:
        news_pages = json.load(f)

    # For single chapter, load or extract
    import pymupdf as fitz
    sc_doc = fitz.open("eval/golden/single_chapter/sample.pdf")
    sc_pages = [page.get_text("text") for page in sc_doc]

    checks = [
        ("newspaper_36p", 3, "newspaper_p3.txt", news_pages[2].get("raw_text", "")),
        ("newspaper_36p", 4, "newspaper_p4.txt", news_pages[3].get("raw_text", "")),
        ("newspaper_36p", 11, "newspaper_p11.txt", news_pages[10].get("raw_text", "")),
        ("newspaper_36p", 15, "newspaper_p15.txt", news_pages[14].get("raw_text", "")),
        ("newspaper_36p", 20, "newspaper_p20.txt", news_pages[19].get("raw_text", "")),
        ("hindi_gujarati_book", 3, "hindi_p3.txt", hindi_pages[2].get("raw_text", "")),
        ("hindi_gujarati_book", 4, "hindi_p4.txt", hindi_pages[3].get("raw_text", "")),
        ("hindi_gujarati_book", 5, "hindi_p5.txt", hindi_pages[4].get("raw_text", "")),
        ("single_chapter", 1, "single_chapter_p1.txt", sc_pages[0]),
        ("single_chapter", 2, "single_chapter_p2.txt", sc_pages[1]),
        ("single_chapter", 3, "single_chapter_p3.txt", sc_pages[2]),
    ]

    results = {}
    print("=" * 80)
    print("GROUND TRUTH WORD-LEVEL ACCURACY SPOT CHECK REPORT")
    print("STATUS: UNVERIFIED AI-AUTHORED BASELINES — EXCLUDED FROM HEADLINE ACCURACY")
    print("Refer to eval/spot_checks/HUMAN_REVIEW.md for human verification queue.")
    print("=" * 80)
    print(f"{'Sample':<22} | {'Page':<5} | {'GT Words':<9} | {'Matched':<8} | {'Accuracy':<10} | {'Status'}")
    print("-" * 80)

    total_gt = 0
    total_matches = 0

    for sample, page_num, gt_file, ext_text in checks:
        gt_path = SPOT_DIR / gt_file
        with open(gt_path, "r", encoding="utf-8") as f:
            lines = [l for l in f if not l.startswith("#")]
            gt_text = "".join(lines)

        acc, matched, gt_count = calculate_word_accuracy(gt_text, ext_text)
        total_gt += gt_count
        total_matches += matched
        results[gt_file] = {
            "sample": sample,
            "page": page_num,
            "gt_words": gt_count,
            "matched_words": matched,
            "word_accuracy": acc,
            "verified": False,
        }
        print(f"{sample:<22} | {page_num:<5} | {gt_count:<9} | {matched:<8} | {acc:.2f}%     | UNVERIFIED")

    overall_acc = (total_matches / total_gt) * 100.0 if total_gt else 0.0
    print("-" * 80)
    print(f"{'OVERALL UNVERIFIED AI BENCHMARK':<40} | {total_gt:<9} | {total_matches:<8} | {overall_acc:.2f}%     | UNVERIFIED")
    print(f"{'HEADLINE VERIFIED ACCURACY':<40} | {'N/A':<9} | {'N/A':<8} | N/A (Pending Human Review)")
    print("=" * 80)
    return results


if __name__ == "__main__":
    run_spot_checks()
