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
- [ ] **Back up the Neon Database Before Merging**:
  1. Open Neon Console: `https://console.neon.tech` → Select your project.
  2. Navigate to the **Branches** tab.
  3. Click **+ Create Branch**.
     - Branch name: `pre_merge_backup`
     - Parent branch: `main` (Production)
  4. This provides an instantaneous, point-in-time snapshot of production data before any new migrations run.

---

## 3. How to Create the Pull Request on GitHub

1. Open your browser and navigate to the GitHub repository:
   `https://github.com/queraai/QuestionGen`
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

## 4. Required Secrets & Environment Variables (Authoritative List)

Set the following variables in their respective locations (names only, values configured via dashboards):

### A. Render Web Service Environment (`Render Dashboard > Environment`)
| Variable Name | Required / Optional | Purpose |
|---|:---:|---|
| `DATABASE_URL` | **Required** | Neon PostgreSQL connection string (use separate `staging` branch for staging) |
| `SECRET_KEY` | **Required** | Django cryptographic signing secret |
| `DJANGO_SETTINGS_MODULE` | **Required** | Set to `question_generation_system.settings.production` |
| `ALLOWED_HOSTS` | **Required** | Your Render service domain (e.g. `questiongen-staging.onrender.com`) |
| `BACKEND_BASE_URL` | **Required** | Public HTTPS root domain of the backend (reconciled; code also supports `RENDER_BACKEND_URL` fallback) |
| `INGESTION_WEBHOOK_SECRET` | **Required** | Shared HMAC secret for verifying incoming worker extraction webhooks |
| `GITHUB_DISPATCH_TOKEN` | Optional | GitHub Personal Access Token (PAT) with `repo` / `workflow` scope to trigger Actions runners |
| `GITHUB_DISPATCH_REPO` | Optional | GitHub repository path (`queraai/QuestionGen`, defaults to this repo) |
| `DISPATCH_REF` | Optional | Branch to dispatch (`staging` on staging service, `main` on production) |
| `MAX_CONCURRENT_DISPATCHES`| Optional | Cap on parallel Actions runners (default `2`, protects free-tier minutes) |
| `TOC_V2_ENABLED` | Optional | Kept `false` until physical multi-chapter books are verified |
| `LEGACY_REVIEW_REQUIRED` | Optional | Default `true`: flags all legacy-font converted pages for human verification in UI |
| `GEMINI_CALL_CAP` | Optional | Default `20`: caps Gemini vision AI calls per document |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional | Google Drive folder ID for external PDF cloud storage |
| `GOOGLE_DRIVE_USER_TOKEN_FILE` | Optional | Path to OAuth2 user credentials file for Google Drive API |

### B. GitHub Actions Secrets (`Settings > Secrets and variables > Actions > Secrets`)
| Secret Name | Required / Optional | Purpose |
|---|:---:|---|
| `INGESTION_WEBHOOK_SECRET` | **Required** | Shared HMAC secret used by runner to sign callback webhooks |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for handwritten notes & TOC vision fallback |
| `GOOGLE_DRIVE_USER_TOKEN_JSON` | Optional | Base64 or JSON string of OAuth2 credentials for Google Drive downloads |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional | Google Drive destination folder ID |

---

## 5. Staging Deployment & Smoke Testing

1. In GitHub, push changes to the `staging` branch (`git push company staging`).
2. Render automatically detects the push and triggers a build on the staging service.
3. Once the build completes:
   - Log into the staging application using your authorized school administrative or teacher account (demo accounts with fixed passwords are automatically blocked in production environments).
   - Upload a test single-chapter PDF or NCERT Hindi sample.
   - Confirm that the job transitions from `PENDING` → `EXTRACTING` → `COMPLETED`.
   - Review extracted sections, reading blocks, and images in the Dataset Inspection UI.
   - Confirm that pages converted from old fonts display the visible `"converted from old font, please verify"` warning banner.

---

## 6. Production Deployment & Database Migrations

1. **Do Database Migrations Run Automatically on Render?**
   - **Yes, when using `build.sh`**: If your Render service Build Command is configured as `./build.sh` (or `bash build.sh`), line 12 explicitly executes `python manage.py migrate` automatically upon deployment.
   - **If using a custom build command**: Verify that `python manage.py migrate` is included (e.g. `pip install -r requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate`).
2. In GitHub, open the Pull Request (`staging` → `main`).
3. Confirm that all automated checks show green passing checkmarks.
4. Click **Merge pull request** → **Confirm merge**.
5. Render will trigger the production build and run migrations automatically.
6. Verify in Render Deploy Logs that `Applying content_ingestion.0003_geminiresultcache... OK` appears and status is `Deployment successful`.

---

## 7. Emergency Rollback Plan & Database Schema Compatibility

If an unexpected regression or issue occurs in production:

1. **Option A: Revert PR via GitHub UI (Recommended)**:
   - Go to the merged PR on GitHub (`https://github.com/queraai/QuestionGen/pulls`).
   - Click the **Revert** button at the top right of the PR page.
   - This opens a new pull request reverting the commit to `main`.
   - Merge the revert PR; Render will rebuild and redeploy the previous code.
2. **Option B: Render Instant Rollback**:
   - In Render Dashboard → Select your Web Service → Click **Deploys**.
   - Find the previous successful deployment and select **Rollback to this deploy**.

> ### Critical Note on Migrations During Rollback:
> **Rolling back code does NOT roll back database migrations!**
> When you revert code in Git or Render, the PostgreSQL database remains at its latest migration state.
> - **Schema Compatibility**: The only migration added in this release is `content_ingestion/migrations/0003_geminiresultcache.py`, which creates a new standalone table `GeminiResultCache`.
> - **Zero-Downtime Safe**: This migration does NOT modify, drop, or rename any pre-existing tables or columns.
> - **Compatibility Guarantee**: The previous code on `main` does not query `GeminiResultCache` and will continue operating normally with 100% backwards compatibility if the code is rolled back.
> - If you ever need to restore the database to its exact pre-merge state, point Render's `DATABASE_URL` to the `pre_merge_backup` Neon branch created in Step 2.

