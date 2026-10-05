# Comprehensive Document Ingestion System Audit (Step 0)

**Date**: 2026-10-05  
**Target Repository**: `question-generation-system`  
**Worker Pipeline**: `document_ai_worker/cli_extractor.py` & `content_ingestion`  
**Status**: Step 0 Complete — Audit Phase (No code changes applied yet)

---

## Executive Summary

An audit of the document ingestion pipeline was conducted to trace the root causes of extraction failures observed on complex documents (specifically a 36-page newspaper PDF). The current system was architected primarily for standard digital NCERT school textbooks, resulting in brittle heuristics, pervasive hardcoded defaults, monolithic OCR language configurations, absence of multi-column layout derivation, and indiscriminate diagram extraction.

---

## 1. Current Probe Logic

The document inspection and routing logic currently exists in two locations:

### A. Worker Auto-Detector (`document_ai_worker/cli_extractor.py:auto_detect_document_kind`)
```python
def auto_detect_document_kind(pdf_path: str) -> str:
    # Samples at most 3 pages:
    sample_pages = min(len(doc), 3)
    # Counts selectable characters via page.get_text("text")
    # Checks if page.get_fonts() returns vector fonts
    # Scanned page check: len(images) >= 1 and len(text) < 60
    if scanned_bitmap_pages >= (sample_pages / 2) or (avg_chars < 80 and not has_vector_fonts):
        return "HANDWRITTEN_NOTES"
    return "TEXTBOOK"
```
**Critical Flaws**:
1. **Binary-only classification**: The probe can only return `"TEXTBOOK"` or `"HANDWRITTEN_NOTES"`. It has zero concept of `newspaper`, `magazine`, `worksheet_or_exam`, `single_topic`, `notes`, or `other`.
2. **First 3 pages only**: A 36-page newspaper whose first page contains a full-page photo or masthead will either trigger `HANDWRITTEN_NOTES` (if low text) or `TEXTBOOK` (if >80 chars).
3. **Hardcoded Exception Fallback**: If an exception occurs during the probe, it catches it and defaults to `"TEXTBOOK"` (`logger.warning("... Defaulting to TEXTBOOK.")`).
4. **Trigger logic**: In `cli_extractor.py:261`, the probe is only run if `args.document_kind in ("AUTO", "TEXTBOOK", "")`. If the user or upload modal passed `"TEXTBOOK"`, it runs the probe but still can only resolve to `TEXTBOOK` or `HANDWRITTEN_NOTES`.

### B. Django Backend Probe (`content_ingestion/services.py:initialize_job` & `content_ingestion/toc_detector.py`)
```python
# content_ingestion/toc_detector.py:34
def analyze_document(self, doc: fitz.Document) -> Tuple[str, List[Dict[str, Any]]]:
    # Scans first 15 pages for regex: r"\b(contents|table of contents|index|curriculum)\b"
    # Scans for "Chapter X" headings across all pages
    # If >= 15 pages and no multi-chapter found:
    if total_pages >= 15:
        return GranularityDetected.CHAPTER, [
            {"chapter_number": 1, "title": "Main Chapter", "start_page": 1, "end_page": total_pages}
        ]
```
**Critical Flaws**:
- For any document with 15+ pages (such as the 36-page newspaper) that lacks an academic "Table of Contents", it automatically forces `granularity = CHAPTER` and fabricates a dummy single chapter: `[{"chapter_number": 1, "title": "Main Chapter", "start_page": 1, "end_page": 36}]`.

---

## 2. Hardcoded Defaults: Doc Type, Board, Standard, and Subject

Every layer of the application currently injects hardcoded educational defaults:

| Component | File & Line | Hardcoded Default | Consequence |
| :--- | :--- | :--- | :--- |
| **Frontend Upload Modal** | `frontend/src/pages/ingestion/UploadDocumentModal.tsx:18-21` | `subject = 'Mathematics'`<br>`standard = 10`<br>`board = 'NCERT'`<br>`documentKind = 'TEXTBOOK'` | Initial component state forces textbook metadata on every upload before the user even selects a file. |
| **Frontend Form Reset** | `frontend/src/pages/ingestion/UploadDocumentModal.tsx:32-35` | `setSubject('Mathematics')`<br>`setStandard(10)`<br>`setBoard('NCERT')`<br>`setDocumentKind('TEXTBOOK')` | Re-opening the modal resets all values to NCERT Class 10 Math Textbook. |
| **Frontend UI Options** | `frontend/src/pages/ingestion/UploadDocumentModal.tsx:210-230` | Only `TEXTBOOK` and `HANDWRITTEN_NOTES` in dropdown. | Teachers cannot select newspaper, worksheet, exam, or general document. |
| **Frontend List Displays** | `frontend/src/pages/ingestion/DatasetIngestionPageDesktop.tsx:302`<br>`...Tablet.tsx:266`<br>`...Mobile.tsx:246` | `{job.board \|\| 'NCERT'}` | If board is null or empty, the UI forces display of `'NCERT'`. |
| **Django IngestionJob Model** | `content_ingestion/models.py:83` | `board = models.CharField(..., default="NCERT")` | Database schema default is NCERT. |
| **Django IngestionJob Model** | `content_ingestion/models.py:89` | `document_kind = models.CharField(..., default=DocumentKind.TEXTBOOK)` | Database schema default is TEXTBOOK. |
| **Django Migration** | `content_ingestion/migrations/0001_initial.py:46,50` | `default='NCERT'`, `default='TEXTBOOK'` | DB table columns have hardcoded SQL defaults. |
| **Remote Dispatcher** | `content_ingestion/extractors/remote_client.py:131` | `"document_kind": job.document_kind` | Sends the default `"TEXTBOOK"` to GitHub Actions. |
| **GitHub Actions Workflow** | `.github/workflows/document_ai_extractor.yml:23,78` | `default: 'TEXTBOOK'`<br>`DOCUMENT_KIND: ... \|\| 'TEXTBOOK'` | Workflow input default is TEXTBOOK. |
| **Worker CLI Extractor** | `document_ai_worker/cli_extractor.py:214` | `--document-kind default="TEXTBOOK"` | CLI parser default is TEXTBOOK. |
| **Worker CLI Fallback** | `document_ai_worker/cli_extractor.py:140` | `return "TEXTBOOK"` on probe error | Error recovery forces TEXTBOOK. |
| **Worker FastAPI Schema** | `document_ai_worker/engine/schema.py:18` | `document_kind: str = Field(default="TEXTBOOK")` | Microservice schema default is TEXTBOOK. |
| **Worker Granularity Schema**| `document_ai_worker/engine/schema.py:64` | `granularity: str = "WHOLE_BOOK"` | Default response granularity is WHOLE_BOOK. |

---

## 3. How `layout_type` and `column_index` are Produced

### A. The Primary Engine: IBM Docling (`document_ai_worker/engine/docling_pipeline.py`)
In real runs, `cli_extractor.py` invokes `DoclingPipeline` by default (`USE_DOCLING=1`).
- **`column_index` is hardcoded to 0 for every block**:
  - Line 249 (Diagrams): `column_index=0`
  - Line 268 (Tables): `column_index=0`
  - Line 280 (Formulas): `column_index=0`
  - Line 293 (Headers): `column_index=0`
  - Line 322 (Paragraphs): `column_index=0`
- **`layout_type` is hardcoded to `SINGLE_COLUMN` for every page**:
  - Line 329: `PageSchema(page_number=page_num, layout_type="SINGLE_COLUMN", ...)`
- **Conclusion**: Even though Docling runs DocLayNet internally to identify items, `DoclingPipeline` completely discards layout geometry and assigns `SINGLE_COLUMN` and `column_index=0` across the entire document.

### B. The Fallback Engine: `TextbookPipeline` (`document_ai_worker/engine/textbook_pipeline.py`)
- In `_sort_reading_order` (lines 228–270), blocks are classified against a single horizontal midpoint: `mid_x = width / 2.0`.
  - Blocks with `x1 <= mid_x + 0.06 * width` are assigned `col_idx = 1`.
  - Blocks with `x0 >= mid_x - 0.06 * width` are assigned `col_idx = 2`.
  - Spanning blocks (width > 60% or header/footer) are assigned `col_idx = 0`.
- **Limitation**: Can only produce `SINGLE_COLUMN`, `TWO_COLUMN`, or `HYBRID_COLUMN`. It is mathematically incapable of detecting 3, 4, 5, or 6 columns (as found in newspapers).

### C. The Handwriting Engine: `HandwritingPipeline` (`document_ai_worker/engine/handwriting_pipeline.py`)
- Line 179: Hardcodes `layout_type="SINGLE_COLUMN"`.
- Lines 216, 231, 239: Hardcodes `column_index=0` for all transcribed sections.

---

## 4. How the Table of Contents (TOC) is Produced

### A. In `DoclingPipeline` (`document_ai_worker/engine/docling_pipeline.py:186-200, 338-353`)
1. Looks for items where label is `TITLE` or `HEADER`.
2. Matches against: `re.search(r"(?:अध्याय|Chapter|Unit)\s*([0-9]+)", clean_text, re.IGNORECASE)`.
3. If no match is found across the document (as with a newspaper or worksheet):
   ```python
   if not chapters:
       chapters = [ChapterSchema(
           chapter_number=1,
           title="Extracted Document",
           start_page=1,
           end_page=len(pages),
           summary="Full document extracted via IBM Docling AI.",
       )]
   ```
4. Assigns `granularity = "MULTI_CHAPTER" if len(chapters) > 1 else "SINGLE_CHAPTER"`.
5. **Result**: A 36-page newspaper gets a fabricated TOC entry: `"Extracted Document", pages 1-36` and `granularity = SINGLE_CHAPTER`.

### B. In `TextbookPipeline` (`document_ai_worker/engine/textbook_pipeline.py:83-133`)
1. Calls `doc.get_toc()`.
2. Fallback: parses text of first 12 pages with regex `r"^(?:Chapter|Unit|Lesson)?\s*([0-9IVXLCDM]+)[\.\:\s\-]+([A-Za-z0-9\s\,\'\-]+?)(?:[\.\s\_\-]{2,}|[\t\s]{2,})([0-9]+)$"`.
3. If no chapters detected: creates placeholder `[ChapterSchema(chapter_number=1, title="Chapter 1", start_page=1, end_page=total_pages)]`.

---

## 5. How Diagrams are Cropped and Captioned

### A. Extraction Threshold & Cropping (`document_ai_worker/engine/docling_pipeline.py:203-243`)
1. Triggers on any item where `isinstance(item, PictureItem) or "PICTURE" in label_str`.
2. If `item.get_image(doc)` returns `None`, it performs visual viewport clipping via PyMuPDF:
   ```python
   x0, y0, x1, y1 = bbox
   page_h = fitz_page.rect.height
   rect = fitz.Rect(min(x0, x1), min(page_h - max(y0, y1), min(y0, y1)), max(x0, x1), max(page_h - min(y0, y1), max(y0, y1)))
   if rect.width > 20 and rect.height > 20:
       pix = fitz_page.get_pixmap(clip=rect, dpi=200)
   ```
3. **Flaws**:
   - **Threshold too low**: Size cutoff is only `20pt x 20pt` (~28px). Tiny line icons, bullet ornaments, logos, avatars, and ad banners pass the threshold (resulting in 439 crops on a 36-page newspaper, with 134 under 40pt).
   - **Coordinate confusion**: The formula `min(page_h - max(y0, y1), min(y0, y1))` attempts to invert y-coordinates because Docling's origin is bottom-left while PyMuPDF is top-left, but the min/max nesting leads to corrupt bounding boxes and upside-down or clipped crops.

### B. Auto-Captioning & Typing (`docling_pipeline.py:244-254`)
```python
caption = clean_text or getattr(item, "caption", "") or f"Figure {pic_idx}"
sections.append(SectionSchema(
    type="DIAGRAM",
    heading=caption[:60],
    text=clean_text,
    column_index=0,
    image_path=direct_path,
    image_caption=caption,
    metadata={"bbox": bbox},
))
```
- **Flaws**:
  - If no text is detected on the picture, it synthesizes an auto-incremented caption: `"Figure 1"`, `"Figure 2"`, etc.
  - Every single visual element is hardcoded to `type="DIAGRAM"`. There is no classification into `photo`, `ad`, `logo`, `face_grid`, `chart`, or `table_image`.

### C. Cloud Storage Upload (`document_ai_worker/cli_extractor.py:302-379`)
- `WorkerGoogleDriveUploader` uploads images directly to Google Drive folder `QuestionGen-Uploads/Extracted-Diagrams`.
- Replaces `sec.image_path` with the Google Drive thumbnail URL (`https://drive.google.com/thumbnail?id=...&sz=w1000`).
- Clears `sec.image_data = ""` to keep the webhook payload under 50KB.

---

## 6. How the Webhook Payload is Shaped

### A. Worker Dispatcher (`document_ai_worker/cli_extractor.py:382-390`)
The CLI worker builds the following JSON payload and posts it to the Django callback URL:
```json
{
  "job_id": 15,
  "status": "COMPLETED",
  "granularity": "SINGLE_CHAPTER",
  "chapters": [
    {
      "chapter_number": 1,
      "title": "Extracted Document",
      "start_page": 1,
      "end_page": 36,
      "summary": "Full document extracted via IBM Docling AI."
    }
  ],
  "pages": [
    {
      "page_number": 1,
      "layout_type": "SINGLE_COLUMN",
      "raw_text": "...",
      "chapter_number": 1,
      "chapter_title": "Chapter 1",
      "sections": [
        {
          "type": "DIAGRAM",
          "heading": "Figure 1",
          "text": "",
          "column_index": 0,
          "latex_equations": [],
          "image_path": "https://drive.google.com/thumbnail?id=...",
          "image_data": "",
          "image_caption": "Figure 1",
          "metadata": {"bbox": [10.0, 20.0, 100.0, 200.0]}
        },
        {
          "type": "PARAGRAPH",
          "heading": "",
          "text": "Body text...",
          "column_index": 0,
          "latex_equations": [],
          "image_path": "",
          "image_data": "",
          "image_caption": "",
          "metadata": {"bbox": [50.0, 210.0, 500.0, 250.0]}
        }
      ]
    }
  ],
  "total_pages": 36,
  "engine": "Docling AI (DocLayNet)"
}
```

### B. Django Webhook Receiver (`content_ingestion/views.py:IngestionJobWebhookView`)
- Endpoint: `POST /api/ingest/jobs/<pk>/webhook/`
- **Security & Reliability Issues**:
  1. `authentication_classes = []` and `permission_classes = []`.
  2. The incoming header `X-Ingestion-Secret` is **never verified**. Anyone with the URL can post arbitrary payload data.
  3. No idempotency key is checked. If the runner retries after a timeout, the endpoint re-deletes and re-inserts all chapters, pages, and items.
  4. In an atomic transaction:
     - Deletes all existing `ExtractedChapter` records for the job and recreates them from `payload["chapters"]`.
     - Deletes all existing `ExtractedPage` records and recreates them from `payload["pages"]`.
     - Bulk-creates `ExtractedItem` records for every section in every page.
     - Sets `job.status = COMPLETED`.

---

## 7. Root Cause Analysis of the 9 Observed Problems

| # | Observed Problem | Code Location & Mechanism |
| :--- | :--- | :--- |
| **1** | Metadata forced to TEXTBOOK, NCERT, 10, SINGLE_CHAPTER | `UploadDocumentModal.tsx:18-21` sets defaults in React state; `cli_extractor.py:101-137` only classifies into TEXTBOOK or HANDWRITTEN_NOTES; `docling_pipeline.py:353` defaults to SINGLE_CHAPTER. |
| **2** | TOC placeholder "Extracted Document", pages 1-36 | `docling_pipeline.py:339` creates placeholder chapter when no "Chapter N" regex matches occur. |
| **3** | layout_type=SINGLE_COLUMN and column_index=0 on every page | `docling_pipeline.py:249-329` hardcodes `column_index=0` on all sections and `layout_type="SINGLE_COLUMN"` on all pages. |
| **4** | Page 1 English handwriting became Latin/Devanagari garbage ("VIGNI AO SOINLL") | `docling_pipeline.py:90` hardcodes `ocr_langs = ["hin", "eng"]` globally. Tesseract matches Latin letter strokes to Devanagari character shapes. Handwriting pipeline model URL is also hardcoded (`gemini-3.8-flash`). |
| **5** | Image-only pages (ads) produced empty/garbled text with no flag | No page-level classifier for image coverage or selectable characters exists. Pages with 100% ad image are forced through Docling text OCR without an `image_only` tag. |
| **6** | 439 diagrams, 134 under 40pt, auto-captioned "Figure N", all typed DIAGRAM | `docling_pipeline.py:227` sets a 20pt cutoff; line 244 defaults to `f"Figure {pic_idx}"`; line 246 sets `type="DIAGRAM"`. |
| **7** | 3,544 flat PARAGRAPH blocks, no article grouping, 403 blocks < 4 chars | Docling output items are mapped 1-to-1 to SectionSchema without clustering by column, article, headline, or byline. Fragments under 4 chars are not filtered. |
| **8** | Text defects: drop-cap splits, glued words, unjoined hyphens, leaked glyph names | No text cleaning/post-processing pipeline exists. Docling outputs raw tokens directly into SectionSchema text. |
| **9** | bbox uses bottom-left origin inconsistently | `docling_pipeline.py:226` applies ad-hoc inversion `page_h - max(y0, y1)` for clipping, while storing raw unnormalized coordinates in `metadata["bbox"]`. |

---

## 8. Proposed Architectural Plan (Phases 1–10)

1. **Phase 1 - Classification and Metadata**:
   - Introduce multi-class document classifier (`full_book`, `single_chapter`, `single_topic`, `worksheet_or_exam`, `notes`, `newspaper`, `magazine`, `other`, `unknown`) with confidence score and evidence string.
   - Remove hardcoded defaults (`board=null`, `standard=null`, `subject=null`, `document_kind=null`).
   - Accept user metadata from upload form and prioritize over inference.
2. **Phase 2 - Per-page Router**:
   - Compute per-page metrics: text-layer char count, image coverage %, detected script (Devanagari vs Latin vs Gujarati), handwriting likelihood.
   - Route dynamically per page: digital vector text -> PyMuPDF/Docling; scanned print -> targeted single-script OCR; handwriting/low-confidence -> Gemini; ad/poster -> `page_kind="image_only"`.
3. **Phase 3 - Quality Gate**:
   - Per-page quality scoring (dictionary-word ratio, script mixing ratio, symbol density, fragment ratio).
   - If quality < threshold, retry via Gemini Vision. If still low, flag `needs_review=true`.
4. **Phase 4 - Text Post-Processing Pure Functions**:
   - Merge drop-caps (`"T he"` -> `"The"`), rejoin hyphenated line wraps (`"con- \nnect"` -> `"connect"`), strip font glyph leakage, discard noise fragments (<4 chars).
5. **Phase 5 - Multi-Column Layout Analysis & Article Grouping**:
   - Cluster blocks by x-coordinates into real column spans (1 to 8 columns).
   - Normalize bounding boxes to top-left origin `[x0, y0, x1, y1]` in standard 72 DPI points.
   - Group headline + byline + body into cohesive article structures with stable IDs.
6. **Phase 6 - Visual Asset Classification & Storage**:
   - Filter images < 60px.
   - Classify into `photo`, `ad`, `logo`, `face_grid`, `diagram`, `chart`, `table_image`.
   - Remove `"Figure N"` fallback; extract captions from nearest text. Deduplicate via sha256.
7. **Phase 7 - Robust Table of Contents**:
   - Book-only TOC extractor: Native PDF outline -> Gemini candidate scan -> pattern fallback.
   - Calibrate printed page numbers to PDF page index by majority vote offset.
   - If no TOC found, return `toc = null`. Never emit placeholder TOCs.
8. **Phase 8 - Resilient Gemini Integration**:
   - Dynamic model resolution via `GEMINI_MODEL` env var.
   - Strict JSON output schema, temperature 0, exponential backoff on 429, sha256 cache.
9. **Phase 9 - Webhook Security & Idempotency**:
   - HMAC SHA256 signature verification (`X-Ingestion-Signature`).
   - Idempotency key tracking and retry backoff.
10. **Phase 10 - Evaluation Harness**:
    - Automated test harness in `/eval` with golden sample datasets and regression assertions.

---

*Awaiting confirmation from user before proceeding to Phase 1.*
