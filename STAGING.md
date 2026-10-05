# STAGING.md — Setting Up the Staging Environment

> Do NOT repoint the production Render service. This guide creates a **second, independent**
> Render service and a separate Neon database branch for staging.

---

## Free-Tier Limits (verified October 2026)

| Service | Free Tier |
|---------|-----------|
| Render Web Service | 750 instance-hours/month (shared across ALL free services). Each additional free service counts against the same 750h pool. |
| Render Database | No free PostgreSQL as of 2024. Use Neon instead. |
| Neon | 1 project, up to 10 branches, 0.5 GB storage, 190 compute-hours/month |
| GitHub Actions | 2,000 min/month (public repos: unlimited) |

**Warning**: If you run both production and staging 24/7, they share the 750h pool and will both
spin down. Keep staging set to "Sleep when idle" (Render default) to minimise hours used.

---

## Step 1 — Create the Neon Staging Branch

1. Go to https://console.neon.tech → select your project → **Branches** tab.
2. Click **+ Create Branch**.
   - Branch name: `staging`
   - Branch from: `main` (your production branch)
3. Copy the **connection string** for the `staging` branch (it looks like
   `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`).

---

## Step 2 — Create the Second Render Service

1. Go to https://dashboard.render.com → **New → Web Service**.
2. Connect your GitHub repo: `queraai/QuestionGen`.
3. Settings:
   - **Name**: `questiongen-staging` (or any name you like)
   - **Branch**: `staging`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
   - **Start Command**: `gunicorn question_generation_system.wsgi:application --bind 0.0.0.0:$PORT`
   - **Instance Type**: Free
4. Click **Create Web Service**.

---

## Step 3 — Set Environment Variables on the Staging Service

Go to the staging service → **Environment** tab → add each variable:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | The Neon **staging** branch connection string from Step 1 |
| `SECRET_KEY` | A **different** random secret (run `python -c "import secrets; print(secrets.token_hex(50))"`) |
| `DJANGO_SETTINGS_MODULE` | `question_generation_system.settings.production` |
| `ALLOWED_HOSTS` | `questiongen-staging.onrender.com` |
| `BACKEND_BASE_URL` | `https://questiongen-staging.onrender.com` |
| `DISPATCH_REF` | `staging` |
| `GITHUB_DISPATCH_TOKEN` | Same PAT as production (needs `workflow` scope) |
| `GITHUB_DISPATCH_REPO` | `queraai/QuestionGen` |
| `INGESTION_WEBHOOK_SECRET` | A **new, different** random value — run `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GEMINI_API_KEY` | Same or a dedicated key |
| `GOOGLE_DRIVE_FOLDER_ID` | A **staging** Drive folder ID (create a separate folder) |

Also add to GitHub Actions repo secrets:
- `INGESTION_WEBHOOK_SECRET` is already set; staging uses the value sent in the callback URL
  (it is forwarded via the callback, so no separate GH secret is needed for staging)

---

## Step 4 — Run Migrations on Staging

After the staging service is live, open the Render shell for `questiongen-staging`:

```bash
python manage.py migrate --database=default
python manage.py createsuperuser  # optional
```

---

## Step 5 — How the Staging Dispatch Flow Works

```
Staging Render service            GitHub Actions              Staging Render service
(DISPATCH_REF=staging)     →   workflow_dispatch             (BACKEND_BASE_URL=staging)
                                  ref: staging          →   POST /api/ingest/callback/
                                  ↓ checks out
                                  staging branch
                                  ↓ runs worker
```

1. Staging Django calls `RemoteAiMicroserviceExtractor.dispatch_extraction()`.
2. Client posts to `POST /repos/queraai/QuestionGen/actions/workflows/document_ai_extractor.yml/dispatches`
   with `{ "ref": "staging", "inputs": { ... "callback_url": "https://questiongen-staging.onrender.com/..." } }`.
3. GitHub Actions checks out the `staging` branch and runs the worker.
4. Worker posts results back to the staging Render service via the callback URL.

---

## Step 6 — Verify

1. Upload any PDF in the staging admin.
2. Watch the GitHub Actions tab — a new `document_ai_extractor.yml` run should appear on the `staging` branch.
3. Check that the job status updates in the staging Django admin.

---

## Useful Commands

```bash
# Generate a new random INGESTION_WEBHOOK_SECRET
python -c "import secrets; print(secrets.token_hex(32))"

# Generate a new SECRET_KEY
python -c "import secrets; print(secrets.token_hex(50))"
```

---

## What Is NOT Needed

- No new paid services.
- No separate GitHub Actions account.
- No changes to the production Render service or production `.env`.
