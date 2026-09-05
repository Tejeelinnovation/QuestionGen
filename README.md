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

## Full Demo Environment Reset (Copy-Pasteable Sequence)

To completely reset the demo environment from scratch (fresh schema, clear state, reseed NCERT question bank, and recreate demo accounts with accurate capabilities):

### Option A: Clean Schema & Full Reseed (Recommended)

Run this single command block in PowerShell or Bash from the repository root:

```bash
# 1. Run migrations to ensure latest schema
python manage.py migrate

# 2. Reseed NCERT Class 10 Math question bank (42 questions across 5 topics)
python manage.py seed_demo_content --clear

# 3. Reseed demo users for all 4 roles
python manage.py seed_demo_users --clear
```

### Option B: Complete PostgreSQL Database Drop & Recreate

If you wish to wipe PostgreSQL tables entirely:

```bash
# PostgreSQL CLI (drop & recreate database)
psql -U postgres -c "DROP DATABASE IF EXISTS question_generation_system;"
psql -U postgres -c "CREATE DATABASE question_generation_system OWNER qgs_user;"

# Apply fresh migrations from scratch
python manage.py migrate

# Reseed content and demo users
python manage.py seed_demo_content
python manage.py seed_demo_users
```

### Demo Accounts Quick Reference

All demo accounts share the password: `password123`

| Role | Username | Password | School | Assigned Capabilities | Primary Landing Dashboard |
|------|----------|----------|--------|----------------------|---------------------------|
| **Super Admin** | `superadmin` | `password123` | *None (Global)* | All 10 capabilities (`CREATE_SCHOOL`, `CREATE_SCHOOL_ADMIN`, etc.) | `/dashboard/super-admin` |
| **School Admin** | `schooladmin1` | `password123` | Greenwood High (`1`) | `CREATE_TEACHER`, `CREATE_STUDENT`, `VIEW_SCHOOL_WIDE_CONTROLS` | `/dashboard/school-admin` |
| **Teacher** | `teacher1` | `password123` | Greenwood High (`1`) | `CREATE_PAPER`, `ASSIGN_TEST`, `GENERATE_SELECT_QUESTIONS`, `CREATE_STUDENT` | `/dashboard/teacher` |
| **Student** | `student1` | `password123` | Greenwood High (`1`) | `ATTEMPT_TEST`, `VIEW_OWN_RESULT` | `/dashboard/student` |
| **Student (Alt)** | `student2` | `password123` | Greenwood High (`1`) | `ATTEMPT_TEST`, `VIEW_OWN_RESULT` | `/dashboard/student` |

---

## Running the frontend

### Prerequisites
- Node.js 18+ and npm

### 1. Install frontend dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment variables (optional)

By default, the frontend points to the local Django dev server at `http://127.0.0.1:8000`. To customize the API base URL, create `frontend/.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 3. Start the Vite development server

```bash
npm run dev
```

Visit [http://localhost:5173/](http://localhost:5173/) to access the application.

### 4. Production build and type checking

```bash
npm run build
```

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

---

## P2 — Content / Question Bank

### Seed the demo content

```bash
# First run — creates 1 book, 1 chapter, 5 topics, 42 questions
python manage.py seed_demo_content

# Re-run at any time — idempotent, prints "already exists, skipping" for each row
python manage.py seed_demo_content

# Full reseed from scratch (deletes and recreates everything)
python manage.py seed_demo_content --clear
```

**What is seeded:**
- **Book**: Mathematics for Class 10 (NCERT)
- **Chapter**: Chapter 1 — Real Numbers
- **Topics** (5): Euclid's Division Lemma, Fundamental Theorem of Arithmetic, Irrational Numbers, Decimal Expansions of Rational Numbers, HCF and LCM Applications
- **Questions** (42): mix of MCQ / SHORT_ANSWER / LONG_ANSWER, EASY / MEDIUM / HARD, BEGINNER / INTERMEDIATE / ADVANCED, marks 1–5

---

### Content API examples

All content endpoints require authentication (`Authorization: Bearer <token>`).

#### GET /api/books/

```bash
curl http://127.0.0.1:8000/api/books/ \
  -H "Authorization: Bearer <access_token>"
```

#### GET /api/chapters/?book_id=1

```bash
curl "http://127.0.0.1:8000/api/chapters/?book_id=1" \
  -H "Authorization: Bearer <access_token>"
```

#### GET /api/topics/?chapter_id=1

```bash
curl "http://127.0.0.1:8000/api/topics/?chapter_id=1" \
  -H "Authorization: Bearer <access_token>"
```

#### GET /api/questions/ — with filters

All filter params are optional and combine with AND logic:

| Param | Values | Example |
|-------|--------|---------|
| `topic_id` | integer | `?topic_id=1` |
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD` | `?difficulty=HARD` |
| `question_type` | `MCQ` \| `SHORT_ANSWER` \| `LONG_ANSWER` | `?question_type=MCQ` |
| `learner_level` | `BEGINNER` \| `INTERMEDIATE` \| `ADVANCED` | `?learner_level=ADVANCED` |
| `marks` | decimal | `?marks=2` |

```bash
# All MCQ questions that are HARD and for ADVANCED learners
curl "http://127.0.0.1:8000/api/questions/?question_type=MCQ&difficulty=HARD&learner_level=ADVANCED" \
  -H "Authorization: Bearer <access_token>"

# 2-mark questions in topic 3
curl "http://127.0.0.1:8000/api/questions/?topic_id=3&marks=2" \
  -H "Authorization: Bearer <access_token>"

# All EASY questions (no other constraint)
curl "http://127.0.0.1:8000/api/questions/?difficulty=EASY" \
  -H "Authorization: Bearer <access_token>"
```

Response fields include `topic_name`, `chapter_title`, `book_title`,
`question_type_display`, `difficulty_display`, `learner_level_display`,
`options` (MCQ choices dict), and `correct_answer`.

---

## P3 — Papers, Versions & Delivery (Teacher Workflow)

All endpoints require authentication (`Authorization: Bearer <token>`).
Teacher endpoints require `CREATE_PAPER` and `ASSIGN_TEST` capabilities.

### End-to-End Teacher Workflow (curl)

#### 1. Create a Paper shell

```bash
curl -X POST http://127.0.0.1:8000/api/papers/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Class 10 Unit Test — Real Numbers",
    "instructions": "All questions are compulsory. Total marks: 5.",
    "chapter": 1
  }'
```
Response `id` is the `paper_id` (e.g. `1`).

#### 2. Select / Review Candidate Questions (does not persist)

```bash
curl -X POST http://127.0.0.1:8000/api/papers/1/select-questions/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "difficulty": "EASY",
    "quantity": 3
  }'
```
Returns eligible candidate questions from the paper's chapter for review.

#### 3. Create Version A (immutable snapshot + computed total marks)

```bash
curl -X POST http://127.0.0.1:8000/api/papers/1/versions/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "question_ids": [1, 2],
    "constraints_used": {
      "difficulty": "EASY",
      "total_marks": 5
    },
    "status": "DRAFT"
  }'
```
Creates `PaperVersion` with `version_label: "A"`, stores the snapshot, and calculates `total_marks: 5`.

#### 4. Clone Version A to create Version B (alternate version)

```bash
curl -X POST http://127.0.0.1:8000/api/papers/1/versions/1/clone/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "question_ids": [3, 4]
  }'
```
Creates `PaperVersion` with `version_label: "B"`. Version A's snapshot and marks remain completely untouched.

#### 5. Finalize Version A (required before delivery)

```bash
curl -X POST http://127.0.0.1:8000/api/papers/1/versions/1/finalize/ \
  -H "Authorization: Bearer <teacher_token>"
```
Locks Version A into `FINALIZED` status.

#### 6. Deliver PRINT mode

```bash
curl -X POST http://127.0.0.1:8000/api/papers/1/versions/1/deliver/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "PRINT"
  }'
```

#### 7. Deliver ONLINE mode (assign to students)

```bash
curl -X POST http://127.0.0.1:8000/api/papers/1/versions/1/deliver/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ONLINE",
    "student_ids": [6]
  }'
```

#### 8. Retrieve Print Layout (structured format for PDF/printing)

```bash
curl http://127.0.0.1:8000/api/papers/1/versions/1/print/ \
  -H "Authorization: Bearer <teacher_token>"
```
Returns title, instructions, version label, total marks, and ordered questions derived from the snapshot.

#### 9. List Deliveries (scoped)

```bash
# As Teacher — sees deliveries created by this teacher
curl http://127.0.0.1:8000/api/deliveries/ \
  -H "Authorization: Bearer <teacher_token>"

# As Student — sees ONLY tests assigned to them
curl http://127.0.0.1:8000/api/deliveries/ \
  -H "Authorization: Bearer <student_token>"
```

---

## P4 — Attempts & Results (Student Workflow & Evaluation)

All endpoints require authentication (`Authorization: Bearer <token>`).
Student endpoints require `ATTEMPT_TEST` capability.
Teacher endpoints require `ASSIGN_TEST` or `CREATE_PAPER` capabilities.

### Student Exam Sitting Workflow (curl)

#### 1. Start or Resume an Online Test Attempt

```bash
curl http://127.0.0.1:8000/api/deliveries/1/start/ \
  -H "Authorization: Bearer <student_token>"
```
Returns `attempt_id`, instructions, and questions list (with options, without correct answers). Resuming an in-progress attempt is idempotent.

#### 2. Save Answers Incrementally

```bash
# Save an MCQ choice
curl -X PATCH http://127.0.0.1:8000/api/attempts/1/answers/101/ \
  -H "Authorization: Bearer <student_token>" \
  -H "Content-Type: application/json" \
  -d '{"student_response": "B"}'

# Save a Short Answer response
curl -X PATCH http://127.0.0.1:8000/api/attempts/1/answers/102/ \
  -H "Authorization: Bearer <student_token>" \
  -H "Content-Type: application/json" \
  -d '{"student_response": "Heat is released during the reaction."}'
```

#### 3. Submit the Attempt (Auto-Grading)

```bash
curl -X POST http://127.0.0.1:8000/api/attempts/1/submit/ \
  -H "Authorization: Bearer <student_token>"
```
Auto-grades all MCQ questions against the version snapshot, marks short/long answers as pending review, computes score awarded so far, and locks the attempt from further changes (double submit protection).

#### 4. View Attempt Result (Student)

```bash
curl http://127.0.0.1:8000/api/attempts/1/result/ \
  -H "Authorization: Bearer <student_token>"
```
Returns total score, max score, per-question correctness and marks for auto-graded questions, and pending review flags for descriptive questions.

---

### Teacher Evaluation & Roster Workflow (curl)

#### 5. View Delivery Results Roster

```bash
curl http://127.0.0.1:8000/api/deliveries/1/results/ \
  -H "Authorization: Bearer <teacher_token>"
```
Returns list of all assigned students, submission status, scores, and completion timestamps.

#### 6. Teacher Manual Grading for Short / Long Answers

```bash
curl -X POST http://127.0.0.1:8000/api/attempts/1/answers/102/grade/ \
  -H "Authorization: Bearer <teacher_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "marks_awarded": 2.5,
    "is_correct": true
  }'
```
Awards marks, updates question correctness, recalculates attempt total score, and transitions attempt status to `EVALUATED` once all questions are graded.
