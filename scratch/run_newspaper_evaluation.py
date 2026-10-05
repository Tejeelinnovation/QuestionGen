"""
Evaluation script for Phase 1:
Runs the 36-page Times of India newspaper PDF through the document classifier
and TOC detector, outputting document type, confidence, evidence, and TOC.
"""

import os
import sys
import json

# Ensure repo root and document_ai_worker are in sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, repo_root)
sys.path.insert(0, os.path.join(repo_root, "document_ai_worker"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "question_generation_system.settings.dev")
import django
django.setup()

import pymupdf as fitz
from content_ingestion.document_classifier import classify_document
from content_ingestion.toc_detector import TocDetector


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    newspaper_path = r"D:\PDFS_For the Testing\NewsPaper\Times of India_TOIDelhiBS-Delhi_20261001.pdf"
    if not os.path.exists(newspaper_path):
        print(f"Error: Newspaper PDF not found at {newspaper_path}")
        return

    print("=" * 70)
    print(f"EVALUATING PDF: {os.path.basename(newspaper_path)}")
    print("=" * 70)

    doc = fitz.open(newspaper_path)
    total_pages = len(doc)
    page0 = doc[0]
    rect = page0.rect

    print(f"Total Pages: {total_pages}")
    print(f"Page Dimensions: {rect.width:.1f} x {rect.height:.1f} pt")

    # 1. Document Classification
    print("\n--- 1. DOCUMENT CLASSIFICATION ---")
    classification_res = classify_document(newspaper_path, user_document_kind="AUTO")
    print(f"Inferred Document Type: {classification_res.kind}")
    print(f"Confidence Score:       {classification_res.confidence:.3f}")
    print(f"Evidence:               {classification_res.evidence}")

    # 2. Table of Contents Extraction
    print("\n--- 2. TABLE OF CONTENTS DETECTION ---")
    detector = TocDetector()
    granularity, toc_list = detector.analyze_document(doc)
    doc.close()

    print(f"Granularity: {granularity}")
    print(f"TOC Entries Count: {len(toc_list)}")
    print(f"TOC Result: {json.dumps(toc_list, indent=2)}")

    print("\n" + "=" * 70)
    print("PHASE 1 EVALUATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
