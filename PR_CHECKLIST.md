# Staging to Main Pull Request & Deployment Checklist

This document provides a plain-language checklist for merging the Document Ingestion and Document AI subsystem from `staging` into `main`.

> **IMPORTANT RULE**: DO NOT merge `staging` to `main` until you have verified the deployment on your staging environment and confirmed that all CI checks pass.

---

## 1. What Changes Are in This Pull Request?

This branch brings the Document Ingestion and Document AI pipeline from Phase 0 through Phase 10:

1. **Document Classification**: Fast, rule-based classification identifying whether an uploaded PDF is a `FULL_BOOK`, `SINGLE_CHAPTER`, `NEWSPAPER`, `HANDWRITTEN_NOTES`, `WORKSHEET_OR_EXAM`, or `MAGAZINE`.
2. **Legacy Hindi Font Repair**: Native decoding for legacy Walkman-Chanakya and KrutiDev 010 fonts into clean Unicode Hindi (Devanagari), correctly fixing nuktas (`ज़`, `फ़`, `ख़`), conjunct consonants, and vowel matras.
3. **Clean Diagram & Layout Extraction**: Column-aware reading order and diagram extraction with a strict 60px filter that discards decorative lines, bullets, and icon clutter.
4. **Table of Contents Engine (v2)**: Multi-stage TOC parser (bookmarks → Gemini AI → multilingual regex fallback) with printed-to-physical page offset calibration. Shipped safely behind `TOC_V2_ENABLED=false` until physical multi-chapter textbook samples are tested.
5. **Hardened Gemini AI Client**: Centralized AI client using `gemini-3.8-flash` with rate limiting, exponential backoff, a 20-call per-job cap, startup model validation, and persistent PostgreSQL caching so completed calls are never billed or run twice.
6. **Reliability & Crash Resumption**: Long jobs stream pages in batches of 15 to the backend database. If an ephemeral worker dies, a restarted runner queries the database and picks up right where it left off.
7. **Free-Tier Protection**: `MAX_CONCURRENT_DISPATCHES = 2` protects GitHub Actions monthly runner minutes, and 8-retry progressive webhook backoff (~165s) accommodates Render free-tier cold-start wakeups (~60s).
8. **Automated CI Regression Testing**: GitHub Actions workflow (`.github/workflows/ci_eval.yml`) runs all 43 unit tests and the golden regression harness on every push and pull request.

---

## 2. Pre-Merge Verification Checklist

Before creating or approving the pull request, verify each of the following:

- [ ] **No Edits to Golden Baselines**: Confirm that `eval/golden/*/expected.json` and `eval/thresholds.json` are untouched.
- [ ] **All Unit Tests Pass Locally**:
  ```bash
  python manage.py test content_ingestion
  python -m unittest discover -s eval -p "test_*.py"
  ```
  Expected: 43 unit tests passing.
- [ ] **Regression Harness Passes**:
  ```bash
  python -m eval.run --mode fast
  ```
  Expected: Zero regressions across all golden samples within tolerance thresholds.
- [ ] **Feature Flag Kept Safe**: Verify `TOC_V2_ENABLED` is set to `false` in production settings until real multi-chapter textbook PDFs are provided and validated.

---

## 3. How to Create the Pull Request on GitHub

1. Open your browser and navigate to your GitHub repository:
   `https://github.com/<your-org>/question-generation-system`
2. Click on the **Pull requests** tab.
3. Click the green **New pull request** button.
4. Set the branches:
   - **Base**: `main`
   - **Compare**: `staging`
5. Title the PR:
   `feat(document-ai): Document Ingestion Pipeline, Table of Contents v2, Gemini Hardening & Reliability (Phases 0-10)`
6. In the PR description, copy and paste the summary from Section 1 above.
7. Click **Create pull request** (do NOT click "Merge").

---

## 4. Required Secrets to Set Before Running in Cloud

Set the following secrets in your hosting environments:

### In GitHub Repository Secrets (`Settings > Secrets and variables > Actions`):
| Secret Name | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini OCR / TOC fallback |
| `INGESTION_WEBHOOK_SECRET` | Shared HMAC secret for worker-to-backend webhook security |
| `RENDER_BACKEND_URL` | Base URL of your Django backend (e.g., `https://qgs-backend.onrender.com`) |

### In Render Environment Variables (`Render Dashboard > Environment`):
| Variable Name | Value | Purpose |
|---|---|---|
| `INGESTION_WEBHOOK_SECRET` | *(Same secret as above)* | Verifies signatures on incoming worker webhooks |
| `MAX_CONCURRENT_DISPATCHES` | `2` | Guards Actions monthly quota |
| `TOC_V2_ENABLED` | `false` | Keeps unverified TOC v2 feature flag disabled |
| `GEMINI_CALL_CAP` | `20` | Caps external AI calls per document |

---

## 5. Staging Deployment & Smoke Testing

1. In GitHub, push or merge to the `staging` branch (already tracking `company/staging`).
2. Render will automatically detect the push and trigger a build on your staging service.
3. Once the build completes:
   - Log into the staging application as a Teacher (`teacher1` / `password123`).
   - Upload a test single-chapter PDF or NCERT Hindi sample.
   - Confirm that the job transitions from `PENDING` → `PROCESSING` → `COMPLETED`.
   - Review extracted sections and images in the UI.

---

## 6. Production Deployment Steps (When Ready)

1. Return to the GitHub Pull Request (`staging` → `main`).
2. Confirm the green checkmark: all CI tests (`CI Evaluation Harness` and Django test suites) must be **PASSING**.
3. Click **Merge pull request** → **Confirm merge**.
4. Render will trigger the production build automatically.
5. In Render, verify that the latest deployment log shows `Deployment successful`.

---

## 7. Emergency Rollback Plan

If an unexpected regression or issue occurs in production:

1. **Option A: Revert PR via GitHub UI (Recommended)**:
   - Go to the merged PR on GitHub.
   - Click the **Revert** button at the top right of the PR page.
   - This creates a new pull request reverting the changes.
   - Click **Merge pull request** to immediately restore `main` to its prior state.
2. **Option B: Render Instant Rollback**:
   - In your Render Dashboard, go to your backend web service.
   - Click **Deploys** in the left sidebar.
   - Find the previous successful deployment before the merge.
   - Click the three dots (`...`) next to it and select **Rollback to this deploy**.
