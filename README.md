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
| `schools` | School / Organisation entity (tenant boundary) |
| `users` | User accounts, capabilities, JWT auth |
| `content` | Book / Chapter / Topic / Question bank *(P2)* |
| `papers` | Question Papers, Versions, Delivery *(P3)* |
| `attempts` | Student Attempts and Results *(P4)* |
| `generation` | *(Planned)* LLM/RAG generation service boundary |

---

## Running tests

```bash
python manage.py test
```

---

## Environment variables quick reference

See [`.env.example`](.env.example) for the full list with descriptions.

---

## P1 — Auth & Capability System

### Running migrations (P1)

```bash
# Apply all migrations including schools, users, core, token_blacklist
python manage.py migrate
```

### Bootstrap — creating the first Super Admin

The first Super Admin cannot be created via the API (no one holds the
`CREATE_SCHOOL` capability yet). Use the management command:

```bash
# Interactive (prompts for password)
python manage.py create_super_admin --username admin --email admin@example.com

# Non-interactive (for CI/scripting)
DJANGO_SUPERUSER_PASSWORD=<password> python manage.py create_super_admin \
    --username admin --email admin@example.com --no-input
```

This creates the user, grants all 10 capabilities, and writes an AuditLog entry.

---

### Example API calls

#### Login and obtain JWT

```bash
# PowerShell
$r = Invoke-RestMethod -Method POST `
    -Uri "http://127.0.0.1:8000/api/auth/login/" `
    -ContentType "application/json" `
    -Body '{"username":"admin","password":"your_password"}'
$TOKEN = $r.access
$REFRESH = $r.refresh

# curl
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

Response:
```json
{"access": "<jwt_access_token>", "refresh": "<jwt_refresh_token>"}
```

#### Get current user profile

```bash
# PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/auth/me/" `
    -Headers @{"Authorization"="Bearer $TOKEN"}

# curl
curl http://127.0.0.1:8000/api/auth/me/ \
  -H "Authorization: Bearer <access_token>"
```

Response includes `role_label` (computed, e.g. `"Super Admin"`) and
`capabilities` list.

#### Create a School Admin (as Super Admin)

You need a School first. Create one via the Django shell or admin panel:
```bash
python manage.py shell -c "
from schools.models import School
s = School.objects.create(name='Example High School')
print(s.id)
"
```

Then create the School Admin:
```bash
# PowerShell
Invoke-RestMethod -Method POST `
    -Uri "http://127.0.0.1:8000/api/users/" `
    -ContentType "application/json" `
    -Headers @{"Authorization"="Bearer $TOKEN"} `
    -Body '{"username":"sa1","email":"sa1@school.com","password":"Pass1234!","profile":"school_admin","school":1}'

# curl
curl -X POST http://127.0.0.1:8000/api/users/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"username":"sa1","email":"sa1@school.com","password":"Pass1234!","profile":"school_admin","school":1}'
```

Valid `profile` values: `school_admin`, `teacher`, `student`.

#### Grant / revoke a capability

```bash
# Grant CREATE_PAPER to user 5
curl -X POST http://127.0.0.1:8000/api/users/5/permissions/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"capability_name":"CREATE_PAPER"}'

# Revoke it
curl -X DELETE http://127.0.0.1:8000/api/users/5/permissions/CREATE_PAPER/ \
  -H "Authorization: Bearer <access_token>"
```

#### Logout (blacklist refresh token)

```bash
curl -X POST http://127.0.0.1:8000/api/auth/logout/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"refresh":"<refresh_token>"}'
```

#### Refresh access token

```bash
curl -X POST http://127.0.0.1:8000/api/auth/token/refresh/ \
  -H "Content-Type: application/json" \
  -d '{"refresh":"<refresh_token>"}'
```

