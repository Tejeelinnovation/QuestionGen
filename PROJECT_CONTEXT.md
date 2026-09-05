# PROJECT_CONTEXT.md
# Question Generation System — Project Context

> This file is the canonical reference for the project's architecture, app
> responsibilities, and naming conventions. Keep it up-to-date as each phase
> is completed. New developers and AI sessions should read this first.

---

## Project Overview

Question Generation System is a school/teacher/student platform that allows
teachers to maintain a structured question bank (organised by book, chapter,
and topic) and to assemble, version, and deliver question papers from that
bank. Students sit papers, submit answers, and receive results. In a future
phase, an LLM/RAG-powered generation service will be able to auto-suggest or
auto-generate questions — but that boundary is reserved and must not be
pre-empted by adding generation logic to any other app before it is formally
introduced.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------||
| Backend language | Python | 3.13 |
| Web framework | Django | 6.0.3 |
| REST API | Django REST Framework | 3.15.2 |
| JWT auth | djangorestframework-simplejwt | 5.4.0 |
| Database | PostgreSQL | 14+ |
| DB driver | psycopg2-binary | 2.9.12 |
| Env management | django-environ | 0.13.0 |
| Frontend *(future)* | React + TypeScript + Tailwind | TBD |

---

## Repository Structure

```
question-generation-system/       ← repo root
│
├── question_generation_system/   ← Django project package
│   ├── settings/
│   │   ├── __init__.py           ← Documents the settings split
│   │   ├── base.py               ← All shared settings (reads .env)
│   │   ├── dev.py                ← Dev overrides (default for manage.py)
│   │   └── prod.py               ← Production hardening
│   ├── urls.py
│   ├── wsgi.py                   ← Points to settings.prod
│   └── asgi.py                   ← Points to settings.prod
│
├── core/                         ← Shared utilities & base models
├── schools/                      ← School / Organisation entity (tenant boundary)
├── users/                        ← Auth / capability / permission system
├── content/                      ← Question bank (Books, Chapters, Topics, Questions)
├── papers/                       ← Question papers, versions, delivery
├── attempts/                     ← Student attempts and results
│
├── .env                          ← Local secrets (NOT committed)
├── .env.example                  ← Template with all required variables
├── .gitignore
├── manage.py
├── requirements.txt
├── README.md
└── PROJECT_CONTEXT.md            ← This file
```

---

## App Responsibilities

### `core`
Foundational layer shared by all other apps.
- Abstract base models (`TimestampedModel` with `created_at` / `updated_at`)
- `AuditLog` model — append-only security audit trail
- `log_action(user, action, target, metadata)` helper in `core/audit.py`
- **Does not contain business logic.**

### `schools`
Multi-tenancy boundary.
- `School` model: `name` (unique), `config` (JSONField for future flags),
  `created_at`, `updated_at`
- Every non-Super-Admin user has a FK to their School
- Super Admins have `school=None` (cross-school access)

### `users`
All authentication and authorisation.
- `User` — custom model extending `AbstractUser` (see below)
- `Capability` — atomic permission unit (10 fixed values, populated by data migration)
- `UserCapability` — grant record (source of truth for authz)
- JWT auth via SimpleJWT (stateless, 1h access / 7d refresh, token blacklist on logout)
- DRF permission classes in `permissions.py`
- Custom `UserManager` in `managers.py`
- Convenience grant functions in `capability_defaults.py`

### `content`
The question bank — the core curriculum data.
- `Book` → `Chapter` → `Topic` → `Question` hierarchy
- `QuestionType` choices: `MCQ` | `SHORT_ANSWER` | `LONG_ANSWER`
- `Difficulty` choices: `EASY` | `MEDIUM` | `HARD`
- `LearnerLevel` choices: `BEGINNER` | `INTERMEDIATE` | `ADVANCED`
- `filter_questions(queryset, params)` in `content/filters.py` — reused by papers app
- Read-only browse/filter APIs (P2 only; write endpoints added in later phases)
- **BUILT in P2.**

### `papers`
Question paper assembly and delivery.
- `Paper` (named assessment container)
- `PaperVersion` (immutable snapshot — never mutate once students can access)
- `Section` (groups of questions within a paper)
- Delivery configuration (time limits, randomisation, access windows)
- **NOT YET BUILT** — planned for P3.

### `attempts`
Student assessment records.
- `Attempt` (one student's sitting of one delivered paper)
- `Answer` (per-question response)
- Scoring, aggregation, and results
- Review and feedback endpoints
- **NOT YET BUILT** — planned for P4.

### `generation` ⚠️ PLANNED — DO NOT BUILD YET
This app/service boundary is reserved for the LLM/RAG integration phase.
- Will provide AI-assisted question suggestion and auto-generation
- Must be its own Django app (and potentially a separate service)
- **Do not add any generation/AI logic to `content`, `papers`, or any other
  existing app.** When the time comes, all such logic belongs here.

---

## CRITICAL DESIGN PRINCIPLE — No Role Models

> **There is ONE `User` model.** "Role" (Super Admin / School Admin /
> Teacher / Student) is only a computed display label derived from which
> Capabilities a user has been granted. It is NEVER stored as a field.
>
> All access-control decisions MUST call `user.has_capability("CAP_NAME")` —
> never branch on `role_label`. Role labels are for display/UI only.

---

## Capability System

### The 10 Fixed Capabilities (do not add without documenting here)

| Capability Name | Default Holders | Description |
|----------------|-----------------|-------------|
| `CREATE_SCHOOL` | Super Admin | Can create a new School |
| `CREATE_SCHOOL_ADMIN` | Super Admin | Can create a School Admin user |
| `CREATE_TEACHER` | Super Admin, School Admin | Can create a Teacher user |
| `CREATE_STUDENT` | Super Admin, School Admin, Teacher | Can create a Student user |
| `GENERATE_SELECT_QUESTIONS` | Teacher | Can generate/select questions for a paper |
| `CREATE_PAPER` | Teacher | Can assemble a question paper |
| `ASSIGN_TEST` | Teacher | Can assign a paper as a test to students |
| `ATTEMPT_TEST` | Student | Can sit and submit a test |
| `VIEW_OWN_RESULT` | Student | Can view their own test results |
| `VIEW_SCHOOL_WIDE_CONTROLS` | School Admin | Can view/manage across their school |

### Default Capability Profiles (in `users/capability_defaults.py`)

| Function | Grants |
|----------|--------|
| `grant_super_admin_defaults(user)` | ALL 10 capabilities |
| `grant_school_admin_defaults(user, granted_by)` | CREATE_TEACHER, CREATE_STUDENT, VIEW_SCHOOL_WIDE_CONTROLS |
| `grant_teacher_defaults(user, granted_by)` | CREATE_STUDENT, GENERATE_SELECT_QUESTIONS, CREATE_PAPER, ASSIGN_TEST |
| `grant_student_defaults(user, granted_by)` | ATTEMPT_TEST, VIEW_OWN_RESULT |

These are convenience functions. The underlying system supports arbitrary custom grants.

### Role Label Heuristic (`user.role_label` property)

Computed from granted capabilities — display only, never used for authz:

| Conditions | Label |
|-----------|-------|
| Has `CREATE_SCHOOL` | "Super Admin" |
| Has `VIEW_SCHOOL_WIDE_CONTROLS` AND school is set | "School Admin" |
| Has `CREATE_STUDENT` AND school is set | "Teacher" |
| Has `ATTEMPT_TEST` | "Student" |
| Otherwise | "Custom" |

### Scope Rules

| User Type | Can See (GET /api/users/) | Can Create In |
|-----------|--------------------------|---------------|
| Super Admin (school=None) | All users | Any school |
| School Admin | All users in own school | Own school only |
| Teacher | Only students they created | Own school only |
| Student | Only themselves | Cannot create |

---

## API Surface (P1)

| Method | Path | Auth Required | Capability Required |
|--------|------|--------------|---------------------|
| POST | `/api/auth/login/` | No | — |
| POST | `/api/auth/logout/` | Yes | — |
| GET | `/api/auth/me/` | Yes | — |
| POST | `/api/auth/token/refresh/` | No (refresh token in body) | — |
| GET | `/api/users/` | Yes | — (scoped) |
| POST | `/api/users/` | Yes | CREATE_{TYPE} matching profile |
| PATCH | `/api/users/{id}/` | Yes | school/created_by scope |
| POST | `/api/users/{id}/permissions/` | Yes | CREATE_SCHOOL_ADMIN |
| DELETE | `/api/users/{id}/permissions/{cap}/` | Yes | CREATE_SCHOOL_ADMIN |

## API Surface (P2 — Content)

| Method | Path | Auth Required | Notes |
|--------|------|--------------|-------|
| GET | `/api/books/` | Yes | Active books only |
| GET | `/api/chapters/?book_id=` | Yes | Filter by book (optional) |
| GET | `/api/topics/?chapter_id=` | Yes | Filter by chapter (optional) |
| GET | `/api/questions/?topic_id=&difficulty=&question_type=&learner_level=&marks=` | Yes | All filters combinable (AND logic) |

---

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------||
| Django app directories | `snake_case`, singular nouns | `core`, `users`, `content` |
| Models | `PascalCase`, singular | `Question`, `PaperVersion` |
| Model fields | `snake_case` | `created_at`, `difficulty_level` |
| API URL paths | `kebab-case`, plural resources | `/api/v1/questions/`, `/api/v1/paper-versions/` |
| Serializers | `<Model>Serializer` | `QuestionSerializer` |
| Views/ViewSets | `<Model>ViewSet` or `<Model>View` | `QuestionViewSet` |
| Settings modules | `base`, `dev`, `prod` | `settings.dev` |
| Env variables | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `SECRET_KEY` |
| Audit action strings | `<domain>.<verb>` | `user.created`, `capability.granted` |
| Capability names | `UPPER_SNAKE_CASE` | `CREATE_TEACHER`, `ATTEMPT_TEST` |

---

## Built So Far

- [x] **P0 — Project Skeleton & Environment**
  - [x] Django project `question_generation_system` created
  - [x] Settings split: `base` / `dev` / `prod`
  - [x] All secrets read from environment variables via `django-environ`
  - [x] PostgreSQL configured via `DATABASE_URL`
  - [x] Skeleton apps created and registered: `core`, `users`, `content`, `papers`, `attempts`
  - [x] `requirements.txt` with pinned versions
  - [x] `.env.example` with all required variables documented
  - [x] `.gitignore` (Python + Django + Node future-proofed)
  - [x] `README.md` with step-by-step local setup
  - [x] `PROJECT_CONTEXT.md` (this file)
  - [x] `manage.py migrate` runs cleanly on a fresh Postgres DB

- [x] **P1 — Auth & Permissions**
  - [x] `schools` app: `School` model (name, config, timestamps)
  - [x] Custom `User` model: FK to School (nullable), FK to `created_by` (self)
  - [x] `Capability` model with 10 fixed `CapabilityName` TextChoices
  - [x] `UserCapability` M2M grant record (user, capability, granted_at, granted_by)
  - [x] `has_capability(name)`, `get_capabilities()`, `role_label` on User
  - [x] `capability_defaults.py`: `grant_*_defaults()` convenience functions
  - [x] JWT auth via SimpleJWT (1h access, 7d refresh, token blacklist on logout)
  - [x] `HasCapability(name)` DRF permission factory
  - [x] `IsWithinSchoolScope`, `IsWithinCreatedByScope` object-level permissions
  - [x] `ScopedUserQuerysetMixin` for automatic queryset scoping
  - [x] `AuditLog` model in `core` + `log_action()` helper
  - [x] All endpoints log audit entries (user.created, capability.granted/revoked, user.login, user.logout)
  - [x] `create_super_admin` management command (bootstrap)
  - [x] All acceptance criteria verified via live API calls

- [x] **P2 — Content / Question Bank**
  - [x] `Book` model: title, subject, grade, publisher, is_active + TimestampedModel
  - [x] `Chapter` model: FK→Book, title, chapter_order (unique per book)
  - [x] `Topic` model: FK→Chapter, name
  - [x] `Question` model: FK→Topic, question_text, question_type, marks, difficulty, learner_level, options (JSON), correct_answer, source_reference, is_active
  - [x] `QuestionType` choices: `MCQ` | `SHORT_ANSWER` | `LONG_ANSWER`
  - [x] `Difficulty` choices: `EASY` | `MEDIUM` | `HARD`
  - [x] `LearnerLevel` choices: `BEGINNER` | `INTERMEDIATE` | `ADVANCED`
  - [x] `content/filters.py`: `filter_questions(queryset, params)` — reusable, imported by papers app (P3)
  - [x] Read-only API: `GET /api/books/`, `/api/chapters/`, `/api/topics/`, `/api/questions/`
  - [x] Combined AND filtering (topic_id + difficulty + question_type + learner_level + marks)
  - [x] `seed_demo_content` management command (42 questions, re-runnable, idempotent)
  - [x] Demo data: NCERT Mathematics Class 10, Chapter 1 Real Numbers, 5 topics, 42 questions
  - [x] All acceptance criteria verified (filters, idempotency, 401 on unauth)

---

## Not Yet Built

- [ ] **P3 — Papers & Delivery** (`papers` app: Paper, PaperVersion, Section, Delivery)
- [ ] **P4 — Attempts & Results** (`attempts` app: Attempt, Answer, scoring)
- [ ] **P5 — Generation Service Boundary** (`generation` app: LLM/RAG integration — plan only, not logic)
- [ ] **Frontend** (React + TypeScript + Tailwind — separate directory, added later)
- [ ] **Deployment** (Docker, CI/CD, production PostgreSQL, static files with WhiteNoise or S3)
