# Evaluation Harness Metrics Specification (`eval/METRICS.md`)

This document defines the mathematical formulas, scoring criteria, and interpretation of all metrics computed by `eval/run.py`.

---

## 1. Document Classification Accuracy (`doc_type_correct` & `confidence`)
- **Predicted**: Value returned by `classify_document(pdf_path)`.
- **Expected**: `expected.json["doc_type"]` (`NEWSPAPER`, `MAGAZINE`, `WORKSHEET_OR_EXAM`, `FULL_BOOK`, `SINGLE_CHAPTER`, `HANDWRITTEN_NOTES`, `OTHER`, `UNKNOWN`).
- **Score**:
  - `Y`: When `predicted.upper() == expected.upper()`.
  - `N`: When predicted does not match expected. **Any mismatch is treated strictly as a failure.**
- **Confidence**: Normalized scalar $\in [0.0, 1.0]$ based on multi-modal evidence (masthead match, geometry, datelines, publication stamps, heading hierarchies, script distribution).

---

## 2. Table of Contents Precision & Recall (`toc_precision`, `toc_recall`)

### A. Non-TOC Documents (`expected["has_toc"] == False`)
For single chapters, worksheets, newspapers, and notes that do not have an internal multi-chapter TOC:
- **Trivial/Undefined Precision & Recall**: In previous versions, $0/0$ was erroneously reported as `1.00`. Mathematically, precision and recall are **undefined** when expected chapters are zero. The harness now outputs `n/a`.
- **Correctness Status**:
  - If extracted chapter count $== 0$: **`correct: no TOC produced`** (Clean result).
  - If extracted chapter count $> 0$: **`false positive: N chapters produced`** (TOC hallucination / extraction error).

### B. Multi-Chapter Documents (`expected["has_toc"] == True`)
Where an explicit table of contents is expected:
$$\text{Precision} = \frac{\text{True Positives}}{\max(|\text{Extracted Chapters}|, 1)}$$
$$\text{Recall} = \frac{\text{True Positives}}{\max(|\text{Expected Chapters}|, 1)}$$

**Matching Criteria**:
An extracted chapter matches an expected chapter if:
1. Normalized string similarity $\ge 0.65$ (`difflib.SequenceMatcher`), OR
2. Identical chapter number with overlapping start/end page boundaries.

---

## 3. Chapter Page-Range Accuracy (`page_range_accuracy`)
Evaluates the boundary correctness of matched chapters relative to document span:
- For documents without TOC (`has_toc == False`), range accuracy is undefined: **`n/a`**.
- For matched chapters:
$$\text{Accuracy} = \max\left(0, 1.0 - \frac{|\text{start}_{\text{ext}} - \text{start}_{\text{exp}}| + |\text{end}_{\text{ext}} - \text{end}_{\text{exp}}|}{\text{Total Document Pages}}\right)$$
Averaged across all matched chapters.

---

## 4. Script-Aware Garbage Score (`garbage_rate`)
Measures unprintable characters, broken encoding, and OCR noise across Latin, Devanagari (Hindi/Sanskrit), and Gujarati scripts without falsely penalizing non-Latin scripts.

### Signals Evaluated:
1. **Broken Font Tokens**: Occurrences of Unicode replacement character (`\ufffd`) and unresolved font IDs (`cid:\d+`).
2. **Control & Unprintable Characters**: Byte codes $< 32$ (excluding `\n`, `\t`, `\r`) and $127 \le \text{code} < 160$.
3. **Symbol Ratio**: Ratio of isolated punctuation sequences (e.g., `~~~`, `----`, `*****`) to total characters.
4. **Mixed-Script Fragmentation Ratio**: Tokens exhibiting abnormal script splicing (e.g. random ASCII letters or digits embedded within Devanagari or Gujarati words due to un-remapped legacy font encodings like Kruti Dev).
5. **Token-Length / Fragment Ratio**: Density of 1-letter isolated non-word fragments (excluding valid standalone grammatical particles like English `a`, `I` or Hindi `व`, `ने`).

$$\text{Garbage Rate} = \min\left(1.0, \frac{\text{Garbage / Corrupt Character Count}}{\max(\text{Total Extracted Characters}, 1)}\right)$$

---

## 5. Empty-Page Count (`empty_page_count`)
Count of document pages where extracted text content is whitespace-only or has 0 characters.
- In educational books and newspapers, unexpected empty pages usually indicate failed OCR, rendering timeout, or missed vector text layers.
- In Phase 2, empty pages are cross-referenced with `page_kind` (e.g. `image_only` full-page photos/advertisements vs unread text).

---

## 6. Tiny Images Under 60px (`tiny_image_count`)
**Critical Distinction**:
- **Raw PDF Image Objects**: PDFs often embed hundreds of invisible $1 \times 1$ clipping masks, stencil patterns, bullet icons, and font glyphs as raw XObjects. Counting raw PDF image streams creates artificial inflation (e.g., 4,695 raw objects).
- **Final Output Section Count**: The evaluation harness counts tiny images **from the final structured output sections only** (`SectionSchema` where `type == "DIAGRAM"` or `image_path` / `image_data` is populated) having width $< 60\text{px}$ or height $< 60\text{px}$.
- This directly evaluates whether the pipeline filter correctly discarded useless icons, bullets, and divider lines before presenting assets to teachers.

---

## 7. Needs-Review Rate (`needs_review_rate`)
Proportion of pages requiring manual teacher verification:
$$\text{Needs Review Rate} = \frac{\text{Count of Pages Flagged for Review}}{\max(\text{Total Pages}, 1)}$$

A page is flagged for review if:
- Classification confidence $< 0.60$,
- Per-page garbage rate $> 0.20$,
- Page has 0 extracted text in a multi-page document,
- Extracted chapter boundary has invalid order ($\text{start\_page} > \text{end\_page}$).

---

## 8. Runtime & Modes (`runtime_seconds`, `--mode full|fast`)
- **`--mode full`**: Executes the complete end-to-end extraction pipeline with full raster visual rendering, bounding box layout segmentation, and diagram generation.
- **`--mode fast`**: Executes classification, layout structure, text extraction, and metadata verification with optimized fast image inspection for quick local iterations.
- Each evaluation result explicitly displays the active mode and underlying engine (e.g. `Docling AI (DocLayNet)`, `TextbookPipeline`, or `Gemini Flash Vision`).
