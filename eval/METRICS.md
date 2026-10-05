# Evaluation Metrics & Baselines Changelog

This document maintains an auditable record of all metric definitions, baseline evolutions, and reconciliation across the Question Generation System document ingestion pipeline.

---

## 1. Reconciliation of Needs-Review Figures

A notable discrepancy was observed between early Phase 1.5 runs (13.9% needs-review on `newspaper_36p`) and later runs. Below is the exact causal reconciliation:

### Timeline & Causal Breakdown

| Run Timestamp | Run Context | `newspaper_36p` Needs-Review | `hindi_gujarati_book` Needs-Review | Root Cause of Metric Value |
| :--- | :--- | :--- | :--- | :--- |
| **`20261005_150028`** | Phase 1.5 Initial Run | **13.9%** (5/36 pages) | **4.5%** (1/22 pages) | Evaluated with naive empty check: 5 full-page newspaper display ads had `raw_text == ""` and were flagged as review-needed (5/36 = 13.88%). |
| **`20261005_154008`** | Classifier Refactor Check | **50.0%** (18/36 pages) | **90.9%** (20/22 pages) | Document classifier confidence heuristic dropped to 0.55 (<0.60 threshold). In `hindi_gujarati_book`, all 20 legacy font pages were quarantined because OCR was unavailable and remap was not yet connected. |
| **`20261005_154418`** | Phase 2 Router Active | **2.8%** (1/36 pages) | **0.0%** (0/22 pages) | `PageRouter` classified full-page display ads as `image_only` (exempt from empty page penalty). Only Page 1 masthead was flagged. |
| **`20261005_164842`** | Phase 3+4 Text Cleaner | **5.6%** (2/36 pages) | **0.0%** (0/22 pages) | Quality gate introduced `quality_score < 0.70`. Page 22 (dense classifieds with punctuation density) scored quality 0.68. Flagged pages = Page 1 (masthead) + Page 22 (classifieds) = 2/36 (5.55%). |
| **`20261005_170604`** | Strict Quarantine Trial | **5.6%** (2/36 pages) | **4.5%** (1/22 pages) | Page 18 of Hindi book contained split span `'Vf'` which triggered unmapped bytes quarantine (`raw_text = ""`), flagging 1 page. |
| **`20261005_171034`** | Verified Span Merging (Current) | **5.6%** (2/36 pages) | **0.0%** (0/22 pages) | Adjacent legacy spans merged before remap; `Vf^;k` correctly resolved to `टट्टियाँ`. All 20 Hindi pages cleanly remapped with 0 unmapped bytes. |

---

## 2. Metric Definition Changes

### Metric A: `garbage_rate`
- **Definition v1.0 (Phase 1)**: Simple non-ASCII ratio:
  $$\text{garbage} = \frac{\text{count of chars } \notin [\text{ASCII 32..126}]}{\text{total characters}}$$
  *Flaw*: Severely broken for Indic scripts. Legitimate Unicode Devanagari and Gujarati characters scored 100% garbage.
- **Definition v2.0 (Phase 1.5+, Current)**: Script-aware character validity ratio:
  $$\text{garbage} = \frac{\text{count of unmapped / invalid glyphs or replacement chars}}{\text{total characters}}$$
  Uses Unicode blocks for Latin (`\u0020-\u007e`), Devanagari (`\u0900-\u097f`), and Gujarati (`\u0a80-\u0aff`), plus common typography marks.

### Metric B: `empty_page_count`
- **Definition v1.0 (Phase 1)**: Any page with `len(raw_text.strip()) == 0` incremented `empty_page_count`.
  *Flaw*: Legitimate visual newspaper advertisements, illustrations, and blank endpapers were counted as engine failures.
- **Definition v2.0 (Phase 2+, Current)**: Excludes pages where `page_kind` is classified as `image_only` or `blank`. An empty page is counted as a failure only if `page_kind` was expected to yield readable text (`digital_text`, `scanned_printed`, `mixed`).

### Metric C: `needs_review_rate`
- **Definition v1.0 (Phase 1)**: Flagged pages where `raw_text == ""` or `garbage_rate > 0.20`.
- **Definition v2.0 (Phase 3+4, Current)**: Comprehensive multi-attribute quality gate:
  A page is flagged for review (`needs_review = True`) if any of the following occur:
  1. `page_quality_score < 0.70` (computed from character density, line continuity, punctuation ratio, and glued words).
  2. `page_decision.needs_review == True` (unsupported handwriting without Gemini key, corrupted legacy fonts without OCR/remap, or unmapped legacy bytes).
  3. `document_classification_confidence < 0.60`.
  $$\text{needs\_review\_rate} = \frac{\text{count of flagged pages}}{\text{total pages}}$$

### Metric D: `tiny_images`
- **Definition v1.0 (Phase 1)**: Counted raw PDF object xrefs with bounding box $< 60\text{px}$.
  *Flaw*: Counted internal PDF shading patterns and decorative layout rules, unrelated to extracted content.
- **Definition v2.0 (Phase 2+, Current)**: Counts diagram sections in the final output `SectionSchema` where `type == "DIAGRAM"` and rendered dimensions are $< 60\text{px}$.

---

## 3. Recomputed Baselines (Standardized Definitions)

Recomputing historical runs under the current standard definitions yields the following apples-to-apples baseline:

| Golden Sample | Doc Kind | Pages | Engine | Script-Aware Garbage | Empty Pages | Needs-Review Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`newspaper_36p`** | NEWSPAPER | 36 | TextbookPipeline | 0.68% | 0 | 5.6% (p1 masthead, p22 classifieds) |
| **`hindi_gujarati_book`** | SINGLE_CHAPTER | 22 | TextbookPipeline (Legacy Remap) | 0.15% | 0 | 0.0% (all 20 legacy pages verified) |
| **`single_chapter`** | SINGLE_CHAPTER | 23 | TextbookPipeline | 0.00% | 0 | 0.0% (clean textbook) |
