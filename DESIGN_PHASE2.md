# Phase 2 Design Specification: Per-Page Document Router (`DESIGN_PHASE2.md`)

## Executive Summary & Objectives
Phase 2 introduces a fine-grained **per-page classification and routing architecture** in the Document AI extraction pipeline. Rather than forcing an entire document through a single monolithic extraction path (e.g. running Docling or Tesseract globally), the system inspects each page independently using a lightweight pre-probe (~5 ms/page), classifies its nature (`page_kind`), detects legacy font encodings or handwriting, and routes each page to the optimal engine.

---

## 1. Mixed Document Handling with IBM Docling

### The Problem
Educational textbooks and periodicals are rarely uniform across all pages. A 30-page textbook chapter often contains:
- 25 clean digital text pages with diagrams and tables.
- 2 scanned insert pages (historical primary sources, old newspaper clippings).
- 2 exercise/worksheet pages with student handwritten annotations.
- 1 full-page photo / advertisement / blank section divider.

Running IBM Docling on scanned or handwritten pages wastes CPU cycles on CNN layout models that misinterpret handwriting as random punctuation or broken tables. Conversely, running OCR globally across digital pages degrades character fidelity and drops vector layout geometry.

### Analysis of Approaches

| Approach | Description | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Approach A: Run Once, Replace Flagged** | Run Docling across all pages 1..N, then re-OCR flagged pages. | Simple single Docling invocation. | Inefficient: Docling wastes 2-3s per scanned/handwritten page doing failed layout parsing; high peak memory. | **Rejected** |
| **Approach B: Pre-Probe & Selective Range Routing** | Run fast PyMuPDF probe (5ms/page), compute `page_kind`, invoke Docling only on digital page ranges, route others to specialized engines. | Minimal CPU/RAM usage; avoids feeding handwriting to Docling; targeted OCR languages per page. | Requires assembling pages back in original reading order. | **RECOMMENDED** |

### Implementation Mechanism
1. **Pre-Probe Phase**: Fast scan using PyMuPDF (`fitz.Page`) gathers character counts, image rectangles, font metadata, and script distributions for all pages in $< 0.1\text{s}$.
2. **Page Partitioning**:
   - Group contiguous digital text pages into sub-ranges (e.g. pages `[1-12]`, `[15-28]`) and pass to Docling or PyMuPDF block assembler.
   - Route scanned printed pages (`[13]`) to Tesseract with the detected page script (e.g. `hin` or `guj`, never global `hin+eng`).
   - Route handwritten pages (`[14]`) or low-confidence pages to Gemini Flash Vision (within call budget).
   - Tag `image_only` (`[29]`) and `blank` (`[30]`) without running text OCR.
3. **Structured Assembly**: Merge all `PageSchema` objects preserving sequential page indices (`1..N`), documenting `page_kind`, `engine`, and `route_reason` in each page's metadata.

---

## 2. Text Building from PyMuPDF Words/Blocks vs Docling

### The Spacing, Glued Word, and Drop Cap Problem
In digital PDFs, text spacing is frequently encoded not as ASCII space characters (`0x20`), but via font glyph displacement offsets ($T_x$ coordinates in PDF content streams).
- Generic OCR or naive layout tools often miss these displacement intervals, leading to **glued words** (e.g. `SociologyandSociety` or `ChapterOneIntroduction`).
- **Drop caps** (large decorative initial capital letters) are commonly separated as isolated orphan blocks (e.g. `"T"` followed by `"he book begins..."` resulting in `"T he"`).

### Proposed Hybrid Architecture
We separate **geometry & structure** from **text stream extraction**:
1. **Layout, Tables, and Formulas via Docling**:
   - Docling extracts high-level block bounding boxes, reading order, table cell grids (TableFormer), and LaTeX formula spans.
2. **Text Construction via PyMuPDF Word Advance Coordinates**:
   - PyMuPDF's `page.get_text("words")` extracts exact word tuples: `(x0, y0, x1, y1, word, block_no, line_no, word_no)`.
   - By examining the horizontal gap $\Delta x = x_{0,\text{next}} - x_{1,\text{prev}}$ relative to font body size, word boundaries and spaces are preserved with 100% precision.
   - **Drop Cap Merging**: If line 1 of a block starts with a single large character whose bottom baseline aligns with line 2 or 3, it is automatically merged into the first word (`"T" + "he" -> "The"`).
3. **Fallback to Pure PyMuPDF on Resource-Constrained Environments**:
   - If Docling is not installed, PyMuPDF's block/word reading order sorter serves as a robust zero-dependency extractor.

---

## 3. GitHub Actions Runtime & Cost Projections (Estimates)

> [!NOTE]
> All runtime and cost figures below are preliminary engineering **estimates**. Actual production metrics will be empirically benchmarked and validated in a real GitHub Actions runner execution during testing.

### Estimated Execution Benchmarks

| Pipeline Component | Estimated Runtime per Page | Target Document (30 Pages) [Est.] | Broadsheet Newspaper (36 Pages) [Est.] |
| :--- | :--- | :--- | :--- |
| **PyMuPDF Pre-Probe** | ~3 - 5 ms | ~0.15 s | ~0.20 s |
| **PyMuPDF Digital Text Assembly** | ~10 - 20 ms | ~0.50 s | ~1.50 s |
| **Docling Layout Analysis (CPU)** | ~1.2 - 2.0 s | ~35 - 50 s (digital pages) | Skipped / Selective |
| **Tesseract OCR (Single Language)** | ~0.6 - 1.2 s | ~2 - 4 s (2-3 scanned pages) | N/A |
| **Gemini Flash Vision** | ~1.0 - 1.8 s | ~2 - 4 s (1-2 handwritten pages)| N/A |
| **Total Estimated Job Runtime** | - | **~40 - 65 seconds** | **~15 - 30 seconds** |

### Runner Constraint Verification
- **GitHub Actions Runner Limit**: Standard `ubuntu-latest` runner provides 6 hours max runtime. Total job runtime of $< 2$ minutes consumes $< 0.5\%$ of workflow limits.
- **Render Backend Webhook Timeout**: The Django web service on Render only receives the final webhook and non-blocking progress pings; it does NOT execute the extraction workload. Webhook heartbeats are dispatched every 1.5s to prevent network connection drops.

---

## 4. Memory Footprint & Environment Clarifications

### Architectural Execution Boundary
- **Django Backend on Render**:
  - Render free-tier web service has ~512 MB RAM.
  - The Django backend handles upload API endpoints, dispatching GitHub Actions repository dispatches, and receiving webhook payloads.
  - **The heavy extraction worker NEVER runs on Render.**
- **Extraction Worker on GitHub Actions**:
  - Runs on GitHub Actions `ubuntu-latest` runner equipped with **16 GB RAM** and dual-core x86_64 CPUs.
  - Worker memory budget is well within the 16 GB physical allocation.
- **Worker Memory Safeguards**:
  1. **Batching**: Process PDF in batches of 10 pages, invoking `gc.collect()` between batches.
  2. **Streaming Pixmaps**: Close PyMuPDF page pixmaps immediately after bounding box calculation or clipping export; never retain 36 uncompressed 300 DPI RGBA bitmaps in RAM simultaneously.
  3. **Peak RAM Cap**: Docling PyTorch models allocate ~1.2 GB to 1.8 GB RAM. If available runner RAM drops below 2.0 GB, degrade to PyMuPDF rule-based extraction to guarantee stability.

---

## 5. Handwriting Detection Signals, Thresholds & Graceful Degradation

### Detection Signals & Thresholds
A page is classified as `handwriting` when evidence indicates non-typeset, handwritten text:
1. **Low Typeset Font Density**: Native text layer has $< 60$ characters while page raster coverage is $> 50\%$.
2. **Line Geometry Variance**: Baseline angles and line spacing vary widely ($\text{variance} > 0.35$), unlike parallel printed text lines.
3. **Stroke Disconnects / Tesseract Low Confidence**: If Tesseract OCR confidence on sampled patches is $< 45\%$ and character token shapes have high stroke irregularity.
4. **Keyword Cues**: Presence of phrases such as "homework", "notes", "submitted by", "my solution", "class test" in handwritten margin areas.
5. **Threshold**:
   - `handwriting_score = 0.40 * (1 - font_density) + 0.35 * line_variance + 0.25 * ocr_uncertainty`
   - If `handwriting_score >= 0.65`: classify as `page_kind: "handwriting"`.

### Graceful Degradation (Missing Key or Quota Exhaustion)
- If `page_kind == "handwriting"`:
  - If `GEMINI_API_KEY` is present and quota is available: call Gemini 2.0 Flash Vision with temperature 0.
  - **If `GEMINI_API_KEY` is missing, blank, or returns HTTP 429 (quota exhausted)**:
    - The page does **NOT** crash the extraction job.
    - The page is assigned:
      - `needs_review: true`
      - `transcription_status: "quota_exhausted_needs_review"` (or `"missing_key_needs_review"`)
      - `engine: "Fallback (Review Required)"`
    - The overall extraction job completes successfully and delivers all structured pages to the backend.

---

## 6. Legacy Font Detection (KrutiDev, Devlys, Chanakya) & Handling

### The Problem
NCERT and state board Hindi publications (e.g. `khat101.pdf`) frequently embed legacy 8-bit ASCII fonts (such as KrutiDev 010, Devlys 010, or Chanakya) instead of Unicode Devanagari.
- In these PDFs, PyMuPDF extracts raw ASCII nonsense (e.g. `izsepan` for `प्रेमचंद`, `x|&[kaM` for `गद्य-खंड`, `bZnxkg` for `ईदगाह`).
- Storing these corrupt strings directly into the database corrupts search, question generation, and UI display.

### Detection Mechanism
1. **Font Dictionary Inspection**:
   - Inspect PDF font family names via `page.get_fonts()`.
   - Flag matches against legacy patterns: `r"(?:kruti|devlys|chanakya|shree[-_]?dev|walkman|dv[-_]|kanji|bilingual)"` (case-insensitive).
2. **Text Character N-Gram Patterns**:
   - If font names are obfuscated (e.g. `F1`, `TT2`), inspect ASCII text layer for characteristic KrutiDev n-grams:
     - `\b(?:izse|osQ|esa|FkkA|gSA|dk|dh|dks|mUgksaus|if=kdk)\b`
     - Density of intra-word symbols like `|&[`, `f=k`, `fk`.
   - If legacy n-gram density $> 3$ hits per 500 characters in a document with 0 Unicode Devanagari characters: flag as legacy font.

### Remediation Protocol
1. Mark page metadata: `legacy_font_encoding: true`.
2. **Never save the corrupted ASCII text layer as good text.**
3. Route the page to:
   - Tesseract OCR with `-l hin` on the rendered high-resolution page image, OR
   - A verified KrutiDev-to-Unicode character remapping table.
4. Overwrite `raw_text` and section text with the corrected Unicode Devanagari text.

---

## 7. Language Routing Protocol (Never Global `hin+eng`)
When a page is flagged as `scanned_printed`:
- Compute the dominant script from visible text snippets or Tesseract orientation/script detection (OSD).
- If Devanagari $\ge 60\%$: invoke Tesseract with `-l hin`.
- If Gujarati $\ge 60\%$: invoke Tesseract with `-l guj`.
- If Latin $\ge 70\%$: invoke Tesseract with `-l eng`.
- **Under no circumstances should `hin+eng+guj` be combined indiscriminately**, as joint multi-language dictionaries degrade punctuation and induce mixed-script token corruption.

---

## 8. Metadata Output Schema (Backward-Compatible Additions)
Each page in the extraction JSON payload will be enriched with additive fields:
```json
{
  "page_number": 1,
  "layout_type": "SINGLE_COLUMN",
  "page_kind": "digital_text",
  "engine": "TextbookPipeline (Rule-Based Fallback)",
  "route_reason": "High vector character density (1,420 chars); image coverage 12%",
  "detected_script": "devanagari",
  "legacy_font_encoding": false,
  "needs_review": false,
  "quality_score": 0.95
}
```

---

## 9. Verification & Acceptance Criteria for Phase 2
1. **Newspaper Sample**:
   - Newspaper page 1 classified as `digital_text` with correct column preservation; handwriting/advertisements tagged accurately or marked `needs_review=true`.
2. **Hindi/Gujarati Sample**:
   - Pages classified with `detected_script: "devanagari"` and `legacy_font_encoding: true` where applicable.
3. **Empty Pages**:
   - Any empty page in the report is fully explained by `page_kind: "blank"` or `page_kind: "image_only"`.
4. **Regression Guard**:
   - Zero metric regressions on `eval/run.py` against the Phase 1.5 baseline.
