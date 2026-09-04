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
|-------|-----------|---------|
| Backend language | Python | 3.13 |
| Web framework | Django | 6.0.3 |
| REST API | Django REST Framework | 3.15.2 |
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
├── users/                        ← Auth / permission system
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
- Abstract base models (`TimestampedModel`, `UUIDModel`, etc.)
- Audit logging infrastructure
- Shared mixins, managers, and utility functions
- **Does not contain business logic.**

### `users`
All authentication and authorisation.
- Custom `User` model (extending `AbstractBaseUser`)
- `Role` choices: `admin`, `teacher`, `student`
- `School` / `Institution` model (multi-tenancy boundary)
- Token-based auth endpoints (login, logout, refresh)
- DRF permission classes used by all other apps

### `content`
The question bank — the core curriculum data.
- `Book` → `Chapter` → `Topic` hierarchy
- `Question` model with type variants (MCQ, short answer, long answer, etc.)
- Difficulty, marks, and subject tagging
- Teacher-facing CRUD APIs

### `papers`
Question paper assembly and delivery.
- `Paper` (named assessment container)
- `PaperVersion` (immutable snapshot — never mutate once students can access)
- `Section` (groups of questions within a paper)
- Delivery configuration (time limits, randomisation, access windows)

### `attempts`
Student assessment records.
- `Attempt` (one student's sitting of one delivered paper)
- `Answer` (per-question response)
- Scoring, aggregation, and results
- Review and feedback endpoints

### `generation` ⚠️ PLANNED — DO NOT BUILD YET
This app/service boundary is reserved for the LLM/RAG integration phase.
- Will provide AI-assisted question suggestion and auto-generation
- Must be its own Django app (and potentially a separate service)
- **Do not add any generation/AI logic to `content`, `papers`, or any other
  existing app.** When the time comes, all such logic belongs here.

---

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Django app directories | `snake_case`, singular nouns | `core`, `users`, `content` |
| Models | `PascalCase`, singular | `Question`, `PaperVersion` |
| Model fields | `snake_case` | `created_at`, `difficulty_level` |
| API URL paths | `kebab-case`, plural resources | `/api/v1/questions/`, `/api/v1/paper-versions/` |
| Serializers | `<Model>Serializer` | `QuestionSerializer` |
| Views/ViewSets | `<Model>ViewSet` or `<Model>View` | `QuestionViewSet` |
| Settings modules | `base`, `dev`, `prod` | `settings.dev` |
| Env variables | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `SECRET_KEY` |

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

---

## Not Yet Built

- [ ] **P1 — Auth & Permissions** (`users` app: custom User, roles, JWT auth)
- [ ] **P2 — Content / Question Bank** (`content` app: Book, Chapter, Topic, Question models + APIs)
- [ ] **P3 — Papers & Delivery** (`papers` app: Paper, PaperVersion, Section, Delivery)
- [ ] **P4 — Attempts & Results** (`attempts` app: Attempt, Answer, scoring)
- [ ] **P5 — Generation Service Boundary** (`generation` app: LLM/RAG integration — plan only, not logic)
- [ ] **Frontend** (React + TypeScript + Tailwind — separate directory, added later)
- [ ] **Deployment** (Docker, CI/CD, production PostgreSQL, static files with WhiteNoise or S3)
