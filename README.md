# Question Generation System

A platform for schools, teachers, and students to generate question papers from a
curated question bank. The backend is Django + DRF + PostgreSQL. A React + TypeScript
frontend will be added in a later phase.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Python | 3.11+ |
| pip | 23+ |
| PostgreSQL | 14+ |

---

## Local Setup (step-by-step)

### 1. Clone the repository

```bash
git clone <repo-url>
cd question-generation-system
```

### 2. Create and activate a virtual environment

```bash
# Create
python -m venv .venv

# Activate — macOS / Linux
source .venv/bin/activate

# Activate — Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Create a PostgreSQL database

Connect to your local PostgreSQL instance and run:

```sql
CREATE USER qgs_user WITH PASSWORD 'qgs_password';
CREATE DATABASE question_generation_system OWNER qgs_user;
GRANT ALL PRIVILEGES ON DATABASE question_generation_system TO qgs_user;
```

> You can choose different credentials — just make sure they match your `.env` file below.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values. At minimum you must set:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key. Generate one with the command below. |
| `DEBUG` | `True` for local dev, `False` in production. |
| `ALLOWED_HOSTS` | Comma-separated hostnames (e.g. `localhost,127.0.0.1`). |
| `DATABASE_URL` | Full Postgres DSN: `postgres://USER:PASSWORD@HOST:PORT/DB_NAME` |

**Generate a SECRET_KEY:**

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 6. Run database migrations

```bash
python manage.py migrate
```

### 7. Start the development server

```bash
python manage.py runserver
```

Visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/) — you should see the Django welcome page.

---

## Settings modules

| Module | Purpose | `DJANGO_SETTINGS_MODULE` value |
|--------|---------|-------------------------------|
| `base` | Shared settings (never used directly) | — |
| `dev` | Local development (default for `manage.py`) | `question_generation_system.settings.dev` |
| `prod` | Production | `question_generation_system.settings.prod` |

To override the settings module (e.g. to test production settings locally):

```bash
DJANGO_SETTINGS_MODULE=question_generation_system.settings.prod python manage.py check
```

---

## Project apps

| App | Responsibility |
|-----|---------------|
| `core` | Shared utilities, abstract base models, audit logging |
| `users` | User accounts, roles, permissions *(P2)* |
| `content` | Book / Chapter / Topic / Question bank *(P3)* |
| `papers` | Question Papers, Versions, Delivery *(P4)* |
| `attempts` | Student Attempts and Results *(P5)* |
| `generation` | *(Planned)* LLM/RAG generation service boundary |

---

## Running tests

```bash
python manage.py test
```

---

## Environment variables quick reference

See [`.env.example`](.env.example) for the full list with descriptions.
