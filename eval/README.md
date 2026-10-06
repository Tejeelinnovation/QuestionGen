# Evaluation Harness Documentation (`eval/`)

This directory contains the golden testing dataset, metrics documentation, regression checking harness, and evaluation test suite for the Document Ingestion & Extraction pipeline.

---

## 1. Directory Structure

```text
eval/
├── golden/                     # Golden sample test documents and ground truth
│   ├── MANIFEST.json           # Sample metadata, SHA256 checksums, and path mappings
│   ├── newspaper_36p/          # Times of India 36-page broadsheet edition
│   ├── single_chapter/         # NCERT Class 11 Sociology Chapter 1 (kesy101.pdf)
│   ├── hindi_gujarati_book/    # NCERT Class 11 Hindi Antara Chapter 1 (khat101.pdf)
│   ├── clean_textbook/         # Placeholder: Complete textbook with multi-chapter TOC
│   ├── worksheet/              # Placeholder: Exam paper or worksheet
│   ├── scanned_book/           # Placeholder: Scanned textbook PDF
│   ├── handwritten_sheet/      # Placeholder: Handwritten student/teacher notes
│   └── magazine/               # Placeholder: Periodical magazine
├── results/                    # Recorded evaluation runs (JSON artifacts)
├── METRICS.md                  # Comprehensive mathematical definitions of all metrics
├── run.py                      # Main evaluation pipeline runner and regression guard
├── test_harness.py             # Unit tests for the evaluation harness itself
└── thresholds.json             # Regression tolerance configuration
```

---

## 2. Managing Test PDF Binaries

To keep the git repository lightweight and prevent git history bloat, **PDF binaries are excluded from git** via `.gitignore`.

### How to place sample PDFs locally:
1. Refer to `eval/golden/MANIFEST.json` for expected sample filenames and SHA-256 checksums.
2. Place the corresponding PDF file into its folder under `eval/golden/<sample_name>/sample.pdf`.
3. Alternatively, `eval/run.py` automatically checks local repository candidate directories configured in `MANIFEST.json`.

---

## 3. Running Evaluation

### Fast Mode (Default)
Optimized for local development and CI runs. Extracts all document structure, reading order, layout columns, tables, formulas, and section diagram bounding boxes without generating heavy raster pixel crops:
```bash
python eval/run.py --mode fast
```

### Full Mode
Executes complete visual rendering and diagram generation:
```bash
python eval/run.py --mode full
```

### Targeted Sample Run
Evaluate a single document folder:
```bash
python eval/run.py --sample newspaper_36p
```

### Skipping Persistence / Regression Check
```bash
python eval/run.py --no-save
```

---

## 4. Running Unit Tests

```bash
# Evaluation harness unit tests
python -m unittest eval/test_harness.py

# Ingestion backend tests
python manage.py test content_ingestion
```

---

## 5. Metrics Summary

See [`eval/METRICS.md`](METRICS.md) for full details:
- **`doc_type_correct` & `confidence`**: Multi-modal evidence-based document classifier accuracy.
- **`toc_precision` & `toc_recall`**: Defined on multi-chapter books. Non-TOC documents report `n/a` and `"correct: no TOC produced"` separately.
- **`garbage_rate`**: Multi-lingual, script-aware unprintable corruption score (Latin, Devanagari, Gujarati).
- **`<60px` Tiny Images**: Counted from final output `SectionSchema` diagram items only (not raw PDF clipping streams).
- **`needs_review_rate`**: Proportion of pages requiring teacher verification.
