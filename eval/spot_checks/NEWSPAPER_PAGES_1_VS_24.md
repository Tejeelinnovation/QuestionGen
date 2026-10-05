# NEWSPAPER PAGES: Page 1 vs Page 24 — Classification Investigation

## Summary

Previous classification wrongly tagged newspaper page 1 as `handwriting` (due to 489 vector drawing paths). Page 24 was correctly tagged as `digital_text`.

This document shows the real content of each page.

---

## Page 1 — Times of India, October 1 2026

**Dimensions**: 989.97 × 1544.88 pts (broadsheet)
**Characters**: 581
**Drawing paths**: 489
**Images**: 4 (one 12654×1192 banner scan, one 1087×378 greyscale masthead, one 301×243 colour photo × 2)
**Fonts**: `RupeeET`, `PoynterAgateOne-Cond`, `PoynterAgateOne-BoldCon`

**Content**: Standard broadsheet masthead and dateline (digital text), with a full-page **creative display advertisement** occupying ~85% of the page area below the masthead. The ad is rendered entirely as 489 vector Bezier curves (item types: `l`, `re`, `c`) — this is a complex graphic layout, NOT handwriting.

**Correct classification**: `image_only` (full-page display ad + masthead strips).

**Old classification**: `handwriting` — incorrect. The `is_newspaper_hw_letter` heuristic fired because `rect.width > 700 and rect.height > 1000 and page_num == 1 and char_count < 700 and lower_drawings >= 100`.

**Fix applied (A4)**: Replaced the blanket `is_newspaper_hw_letter` with a content-based check: if `char_count > 50` and masthead fonts are standard digital typefaces (`PoynterAgateOne`, `NimrodMT`, etc., i.e., NOT handwriting fonts), the page is a display ad, not a handwritten letter.

The heuristic for a genuine handwritten letter (e.g. scanned note) must additionally require:
- `char_count < 50` (almost no typed text at all), AND
- `lower_drawings > 200` (dense pen stroke paths), AND
- Absence of any commercial font names in the span set.

---

## Page 24 — Times of India, October 1 2026 (Editorial/Op-Ed)

**Dimensions**: 989.97 × 1544.88 pts (same broadsheet)
**Characters**: 21,189
**Drawing paths**: 18
**Images**: 18
**Fonts**: `PoynterOSDisplay-Roman`, `PoynterOSDisplay-Bold`, `NimrodMT`, `NimrodMT-Bold`, `GriffithGothic-Ultra`, etc.

**Content**: Op-Ed / Editorial page with:
- Mahatma Gandhi "Thought for Today" quote (top)
- Multiple opinion columns
- Letters to the editor
- Editorial content

**Correct classification**: `digital_text` (clean typeset digital content — no OCR needed)

**Old classification**: Labelled as `scanned_printed` by a previous session. This was WRONG. The page has 21,189 native text characters from standard professional fonts. There is no scanning or rasterization.

**Confirmed fix**: `page_kind = digital_text`, `legacy_font_encoding = False`, `needs_review = False`.

---

*Investigation date: 2026-10-05. No golden expected.json was modified.*
