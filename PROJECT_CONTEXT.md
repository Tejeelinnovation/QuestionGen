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
| CORS headers | django-cors-headers | 4.7.0 |
| Database | PostgreSQL | 14+ |
| DB driver | psycopg2-binary | 2.9.12 |
| Env management | django-environ | 0.13.0 |
| Frontend framework | React (TypeScript) + Vite | React 19.2.0, Vite 8.2.2 |
| Frontend routing | react-router-dom | 7.18.3 |
| Frontend HTTP client | Axios | 1.20.0 |
| Frontend styling | Tailwind CSS | 4.3.3 |

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
├── frontend/                     ← React + TypeScript frontend shell
│   ├── src/
│   │   ├── api/                  ← Axios instance & domain endpoints (auth, users, papers, deliveries, attempts, content, audit, classes, import)
│   │   ├── auth/                 ← AuthContext, useAuth, RequireCapability
│   │   ├── components/           ← Reusable UI components by domain
│   │   │   ├── ui/               ← shadcn/ui base + bento-grid, animated-card
│   │   │   ├── attempts/         ← ConfirmSubmitModal
│   │   │   ├── audit/            ← SuperAdminAuditLogViewer
│   │   │   ├── papers/           ← PrintablePaperSheet, QuestionReplaceModal
│   │   │   ├── profile/          ← EditProfileModal, ChangePasswordModal
│   │   │   ├── qbm/              ← DEOSubmissionsView, ValidationHistoryDrawer, ValidatorQueueView, ValidatorReviewModal, ValidationStatusBadge
│   │   │   ├── schools/          ← BulkImportModal, ClassManagementView, CreateSchoolDrawer, EditSchoolModal
│   │   │   ├── teachers/         ← TeacherClassesSection
│   │   │   └── users/            ← CreateUserDrawer, UpdateUserModal, PermissionManager
│   │   ├── context/              ← ToastContext
│   │   ├── hooks/
│   │   │   ├── useBreakpoint.ts  ← Returns 'mobile' | 'tablet' | 'desktop'
│   │   │   ├── useExamCountdown.ts ← Countdown timer hook for online tests
│   │   │   └── useExamProctoring.ts ← Tab-switch / focus-loss detection during exams
│   │   ├── layouts/
│   │   │   ├── AppLayout.tsx     ← Root layout, selects responsive sub-layout
│   │   │   ├── desktop/DesktopLayout.tsx
│   │   │   ├── tablet/TabletLayout.tsx
│   │   │   └── mobile/MobileLayout.tsx
│   │   ├── lib/
│   │   │   ├── motion.ts         ← Single source of truth for motion tokens & physics
│   │   │   └── utils.ts          ← cn() helper (clsx + tailwind-merge)
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── auth/             ← ResetPasswordPage
│   │   │   ├── profile/          ← ProfilePage, ProfilePageDesktop, ProfilePageTablet, ProfilePageMobile
│   │   │   ├── dashboards/       ← SuperAdmin, SchoolAdmin, Teacher, Student, QBM dashboards
│   │   │   ├── papers/           ← PaperSetup, PaperConfigure, QuestionReview, VersionDetail, Delivery, PrintView, PaperDetail
│   │   │   ├── attempts/         ← TestAttemptPage, ResultPage, ResultsRosterPage, GradeAttemptPage
│   │   │   ├── mobile/           ← Full mobile-responsive counterparts of all pages above
│   │   │   └── tablet/           ← Full tablet-responsive counterparts of all pages above
│   │   ├── types/                ← TypeScript interfaces matching backend serializers
│   │   ├── utils/                ← Shared utility functions
│   │   ├── constants/            ← App-wide constants
│   │   ├── routes.tsx            ← Central routes & capability-based index redirect
│   │   ├── App.tsx
│   │   └── index.css             ← Tailwind v4 @theme design tokens + global styles
│   ├── package.json
│   ├── vite.config.ts
│   ├── vercel.json               ← SPA rewrite rule (all paths → index.html)
│   └── tsconfig.json
│
├── .env                          ← Local secrets (NOT committed)
├── .env.example                  ← Template with all required variables
├── .gitignore
├── local_data.json               ← Local DB dump (NOT committed — in .gitignore)
├── neon_data.json                ← Neon cloud DB dump (NOT committed — in .gitignore)
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
- **BUILT in P4.**

### `generation`
Architectural boundary and contracts for Question Generation.
- `QuestionDraft` dataclass: Generated-but-not-yet-persisted candidate question, mirroring `content.Question` core fields
- `QuestionGenerationService`: Abstract interface (`ABC`) defining `generate_questions(chapter, constraints)`
- `SeededBankGenerationService`: Concrete implementation wrapping `content.filters.filter_questions()`, mapping persisted database questions into `QuestionDraft` objects
- `get_generation_service()`: Factory resolver driven by `GENERATION_SERVICE_BACKEND` setting (defaults to `"seeded_bank"`)
- Pluggable extension mechanism allows introducing future `LLMRAGGenerationService` without modifying `papers`, `content`, or frontend code
- **BUILT in P2 (Generation Service Boundary).**

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

### The 12 Fixed Capabilities (do not add without documenting here)

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
| `DATA_ENTRY_OPERATOR` | DEO user (Task 8) | Can ingest questions into the question bank for validation |
| `VALIDATOR` | Validator user (Task 8) | Can review, approve, reject, or request correction on submitted questions |

### Default Capability Profiles (in `users/capability_defaults.py`)

| Function | Grants |
|----------|--------|
| `grant_super_admin_defaults(user)` | ALL 12 capabilities |
| `grant_school_admin_defaults(user, granted_by)` | CREATE_TEACHER, CREATE_STUDENT, VIEW_SCHOOL_WIDE_CONTROLS |
| `grant_teacher_defaults(user, granted_by)` | CREATE_STUDENT, GENERATE_SELECT_QUESTIONS, CREATE_PAPER, ASSIGN_TEST |
| `grant_student_defaults(user, granted_by)` | ATTEMPT_TEST, VIEW_OWN_RESULT |
| `grant_deo_defaults(user, granted_by)` | DATA_ENTRY_OPERATOR |
| `grant_validator_defaults(user, granted_by)` | VALIDATOR |
| `grant_deo_and_validator_defaults(user, granted_by)` | DATA_ENTRY_OPERATOR, VALIDATOR |

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

## API Surface (P3 — Papers, Versions & Delivery)

| Method | Path | Auth Required | Capability Required | Notes |
|--------|------|--------------|---------------------|-------|
| GET | `/api/papers/` | Yes | — | Scoped: teacher sees own, school admin sees school, super admin sees all |
| POST | `/api/papers/` | Yes | `CREATE_PAPER` | Create Paper shell (title, instructions, chapter) |
| GET | `/api/papers/{id}/` | Yes | — | Paper detail with version summaries |
| POST | `/api/papers/{id}/select-questions/` | Yes | `CREATE_PAPER` or `GENERATE_SELECT_QUESTIONS` | Preview candidate questions via `content.filters.filter_questions()`; no persistence |
| GET | `/api/papers/{id}/versions/` | Yes | — | List versions of a paper |
| POST | `/api/papers/{id}/versions/` | Yes | `CREATE_PAPER` | Create immutable `PaperVersion` with snapshot + computed `total_marks` |
| GET | `/api/papers/{id}/versions/{version_id}/` | Yes | — | Full version detail including `question_snapshot` |
| POST | `/api/papers/{id}/versions/{version_id}/finalize/` | Yes | `CREATE_PAPER` | Explicit finalize step (locks snapshot, allows delivery) |
| POST | `/api/papers/{id}/versions/{version_id}/clone/` | Yes | `CREATE_PAPER` | Clones to Version B/C from explicit IDs or constraints pool; leaves source version immutable |
| POST | `/api/papers/{id}/versions/{version_id}/deliver/` | Yes | `ASSIGN_TEST` | Creates Delivery record (PRINT or ONLINE). Version must be FINALIZED. ONLINE requires students |
| GET | `/api/papers/{id}/versions/{version_id}/print/` | Yes | — | Structured print layout from the version snapshot |
| GET | `/api/deliveries/` | Yes | — | Scoped: student sees assigned (with `my_attempt: { id, status, score, max_score }`), teacher sees created |
| GET | `/api/deliveries/{id}/` | Yes | — | Delivery detail (includes `my_attempt` for requesting student) |
| GET | `/api/deliveries/{id}/start/` | Yes | `ATTEMPT_TEST` | Start or resume online test attempt (returns existing in-progress attempt; if already submitted, returns 400 with `attempt_id` and `status` for instant redirect) |
| GET | `/api/deliveries/{id}/results/` | Yes | `ASSIGN_TEST` / `CREATE_PAPER` | Delivery results roster (teacher view) |
| PATCH | `/api/attempts/{id}/answers/{question_id}/` | Yes | `ATTEMPT_TEST` | Save/update single question response incrementally (owning student only) |
| POST | `/api/attempts/{id}/submit/` | Yes | `ATTEMPT_TEST` | Submit attempt: auto-grades MCQ, sets short/long to pending, computes score |
| GET | `/api/attempts/{id}/result/` | Yes | `VIEW_OWN_RESULT` | View attempt result (student sees own; teacher sees created deliveries) |
| POST | `/api/attempts/{id}/answers/{question_id}/grade/` | Yes | `ASSIGN_TEST` / `CREATE_PAPER` | Teacher manually grades short/long response, recalculates score, transitions to EVALUATED |

---

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------||
| Django app directories | `snake_case`, singular nouns | `core`, `users`, `content` |
| Models | `PascalCase`, singular | `Question`, `PaperVersion`, `Attempt` |
| Model fields | `snake_case` | `created_at`, `difficulty_level`, `student_response` |
| API URL paths | `kebab-case`, plural resources | `/api/v1/questions/`, `/api/v1/paper-versions/` |
| Serializers | `<Model>Serializer` | `QuestionSerializer` |
| Views/ViewSets | `<Model>ViewSet` or `<Model>View` | `QuestionViewSet` |
| Settings modules | `base`, `dev`, `prod` | `settings.dev` |
| Env variables | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `SECRET_KEY` |
| Audit action strings | `<domain>.<verb>` | `user.created`, `paper.created`, `attempt.started` |
| Capability names | `UPPER_SNAKE_CASE` | `CREATE_TEACHER`, `ATTEMPT_TEST`, `VIEW_OWN_RESULT` |

---

## Frontend Architecture

> For the full responsive layout system, design tokens, motion system, and component inventory, see **`DESIGN_SYSTEM.md`**.

### Core Principles
- **Capability-Gated UI**: The frontend **NEVER** branches routing or action permissions on `role_label`. UI logic strictly invokes `hasCapability("CAPABILITY_NAME")`, mirroring backend DRF authorization. `role_label` is display-only.
- **Unified API Client**: All HTTP requests flow through `src/api/client.ts` (Axios) with JWT Bearer injection and automatic 401 token refresh queuing.
- **Session Security**: JWT tokens stored in `sessionStorage` (not `localStorage`) — survives page refresh, clears on tab close.

### Additional Hooks (not in DESIGN_SYSTEM.md)
| Hook | Location | Purpose |
|------|----------|---------|
| `useExamCountdown` | `hooks/useExamCountdown.ts` | Countdown timer tied to `available_until` deadline; disables inputs on expiry |
| `useExamProctoring` | `hooks/useExamProctoring.ts` | Detects tab-switch and window focus-loss events during live exam sessions |

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

- [x] **P1 — Frontend Shell (React + TypeScript + Tailwind)**
  - [x] Vite + React 19 + TypeScript + Tailwind CSS setup in `frontend/`
  - [x] Backend CORS headers configured via `django-cors-headers`
  - [x] Axios instance with automatic 401 token refresh queue & `sessionStorage` fallback
  - [x] Auth context with user profile, capabilities normalization, `login()`, `logout()`, `hasCapability()`
  - [x] `RequireCapability` route guard for enforcing atomic capability checks on direct URL navigation
  - [x] Dynamic `/` capability index routing dispatching to correct dashboard without checking `role_label`
  - [x] Minimal functional dashboards: Super Admin (user counts & table, schools pending notice), School Admin (teacher list, create teacher form), Teacher (papers list, student list, create test button), Student (assigned deliveries list, start/resume test link)
  - [x] Placeholder routes for `/papers/new` and `/deliveries/:id/attempt`
  - [x] Verified via browser subagent across all 4 user roles with direct capability boundary enforcement

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

- [x] **P3 — Papers, Versions & Delivery (Teacher Workflow)**
  - [x] `Paper` model: title, instructions, created_by, school, chapter, status, timestamps
  - [x] `PaperVersion` model: paper, version_label, question_snapshot (JSON), total_marks (computed/stored), constraints_used (JSON), status, timestamps
  - [x] Immutability on save/update for finalized versions
  - [x] `Delivery` model: paper_version, mode (PRINT/ONLINE), assigned_students (M2M), status, available_from, available_until, created_by, timestamps
  - [x] 10 Teacher Question Workflow endpoints implemented and routed
  - [x] Separate serializers: read/write, question preview, snapshot, clone, delivery, and print
  - [x] Question selection uses `content.filters.filter_questions()` without duplication
  - [x] Total marks calculated immediately and persisted across refreshes
  - [x] Cloning creates alternate version without mutating source version
  - [x] Explicit finalize step prevents delivering draft versions
  - [x] Online delivery enforces assigned students and teacher scope boundary (`created_by`)
  - [x] Print and Online delivery derive from identical PaperVersion snapshot
  - [x] Scoping rules: student cannot see unassigned papers/versions/deliveries
  - [x] Audit logging on `paper.created`, `version.created`, `version.cloned`, `delivery.created`
  - [x] Comprehensive test suite in `papers/tests.py` (16 passing tests)

- [x] **P4 — Attempts & Results (Student Workflow & Evaluation)**
  - [x] `Attempt` model: delivery, student, status (NOT_STARTED/IN_PROGRESS/SUBMITTED/EVALUATED), started_at, submitted_at, score, max_score, unique_together (delivery, student)
  - [x] `Answer` model: attempt, question_id (int), question_snapshot (JSON), student_response, is_correct, marks_awarded, unique_together (attempt, question_id)
  - [x] Start / resume attempt endpoint (`GET /api/deliveries/{id}/start/`) with question snapshot delivery without correct answers
  - [x] Incremental answer save endpoint (`PATCH /api/attempts/{id}/answers/{question_id}/`)
  - [x] Auto-grading on submit (`POST /api/attempts/{id}/submit/`): MCQ graded automatically, short/long answers marked pending review, score computed so far
  - [x] Double submit protection
  - [x] Result views (`GET /api/attempts/{id}/result/`): student view vs teacher evaluation view
  - [x] Delivery results roster endpoint (`GET /api/deliveries/{id}/results/`)
  - [x] Teacher manual grading endpoint (`POST /api/attempts/{id}/answers/{question_id}/grade/`) with score update and status transition to EVALUATED
  - [x] Audit logging on `attempt.started`, `attempt.submitted`, `answer.graded`
  - [x] Comprehensive test suite in `attempts/tests.py` (16 passing tests)

- [x] **P1 — Teacher Workflow UI (React + TypeScript)**
  - [x] `src/pages/papers/PaperSetupPage.tsx` (`/papers/new`): Paper creation with title, instructions, and curriculum chapter selector
  - [x] `src/pages/papers/PaperConfigurePage.tsx` (`/papers/:id/configure`): Question selection criteria (chapter topics multi-select, difficulty, question type, learner level, marks, quantity)
  - [x] `src/pages/papers/QuestionReviewPage.tsx` (`/papers/:id/review`): Candidate question review, reordering (up/down), deletion, running total marks, backend zero-questions error surfacing, and save as version
  - [x] `src/pages/papers/VersionDetailPage.tsx` (`/papers/:id/versions/:versionId`): Immutable snapshot viewer, DRAFT to FINALIZED transition, and version cloning (Version B created without altering Version A)
  - [x] `src/pages/papers/DeliveryPage.tsx` (`/papers/:id/versions/:versionId/deliver`): Delivery creation supporting both `PRINT` mode and `ONLINE` mode with student assignment
  - [x] `src/pages/papers/PrintViewPage.tsx` (`/papers/:id/versions/:versionId/print`): Clean print layout with exam header, question marks, and browser `window.print()` trigger
  - [x] `src/pages/papers/PaperDetailPage.tsx` (`/papers/:id`): Paper details with version list and links
  - [x] `src/pages/dashboards/TeacherDashboard.tsx`: Papers table enhanced with direct links to paper details and version counts
  - [x] All routes guarded by atomic `CREATE_PAPER` / `ASSIGN_TEST` capabilities

- [x] **P1 — Student Workflow UI (React + TypeScript)**
  - [x] `src/pages/attempts/TestAttemptPage.tsx` (`/deliveries/:id/attempt`): Replaces placeholder. Start/resume online exam sitting (`GET /api/deliveries/:id/start/`), scrollable question list (MCQ radio buttons, Short Answer text input, Long Answer textarea), debounced auto-save with inline "Saved" / "Saving..." / "Error" indicators (`PATCH /api/attempts/:id/answers/:qid/`), running answered count, available_until expiration detection and input disabling, browser confirm submit dialog (`POST /api/attempts/:id/submit/`), and double-submit auto-redirect.
  - [x] `src/pages/attempts/ResultPage.tsx` (`/attempts/:id/result`): Student test result viewer (`GET /api/attempts/:id/result/`) displaying score, max score, percentage, status badge, pending manual review banner, and individual question breakdown.
  - [x] `src/pages/dashboards/StudentDashboard.tsx`: Enhanced assigned tests desk reading directly from `d.my_attempt` as the single source of truth for attempt status, eliminating all client-side `sessionStorage` reliance across desktop, tablet, and mobile layouts.
  - [x] Backend-Driven Attempt State: `DeliverySerializer` returns `my_attempt: { id, status, score, max_score }` for the authenticated student; `AttemptStartResumeView` returns `attempt_id` and `status` in the 400 response on already-submitted attempts for immediate frontend redirection.
  - [x] **Completes ALL P1 Frontend Work** (Auth shell, 4 role dashboards, complete Teacher paper-builder workflow through print/delivery, and Student test attempt sitting through results).

- [x] **P2 (Part 1) — Hardening: Teacher Grading UI, Results Roster & Verification**
  - [x] `src/pages/attempts/ResultsRosterPage.tsx` (`/deliveries/:id/results`): Teacher delivery results roster view displaying delivery metadata, summary counter cards (Assigned, In Progress / Started, Submitted, Evaluated), and sortable attempts table with direct links to grade each student attempt.
  - [x] `src/pages/attempts/GradeAttemptPage.tsx` (`/attempts/:id/grade`): Teacher manual grading UI fetching attempt detail (`GET /api/attempts/{id}/result/`), per-question input for `marks_awarded` bounded 0 to max_marks, correctness toggle, inline editing for previously graded responses, real-time score accumulation, and auto-transition to `EVALUATED` once descriptive answers are graded (`POST /api/attempts/{id}/answers/{question_id}/grade/`).
  - [x] Routing & Guards: `/deliveries/:id/results` and `/attempts/:id/grade` registered in `routes.tsx` guarded by `anyOf={['ASSIGN_TEST', 'CREATE_PAPER']}` via updated `RequireCapability` component.
  - [x] Navigation links added in `DeliveryPage.tsx` and `TeacherDashboard.tsx` linking directly to results roster.
  - [x] Environment Seed & Reset: Consolidated "Full Demo Environment Reset" section added to `README.md` and new Django management command `python manage.py seed_demo_users` created to populate all 4 user roles with their capability sets.
  - [x] Error state audit & Double-submit protection: Verified every page displays informative red error banners when network/API calls fail, and all teacher/student forms disable submit buttons while requests are in flight.
  - [x] Full verification pass executed and confirmed.

- [x] **P2 (Part 2) — Generation Service Boundary (Interface Stub)**
  - [x] `generation/interfaces.py`: `QuestionDraft` dataclass (shape parity with `content.Question`, JSON serializable `to_dict()`, constructed via `from_question()`) and `QuestionGenerationService` abstract base class defining `generate_questions(chapter, constraints)`.
  - [x] `generation/services/seeded_bank.py`: `SeededBankGenerationService` concrete implementation wrapping `content.filters.filter_questions()`, querying chapter questions and returning formatted `QuestionDraft` objects.
  - [x] `generation/factory.py`: `get_generation_service()` factory resolver and `register_generation_service()` plugin hook, controlled by `settings.GENERATION_SERVICE_BACKEND` (env var `GENERATION_SERVICE_BACKEND`, default `"seeded_bank"`).
  - [x] Settings & Env: `generation` registered in `LOCAL_APPS` (`settings/base.py`) and `GENERATION_SERVICE_BACKEND` documented in `.env.example`.
  - [x] Design Documentation: `generation/README.md` details contract design, how to add an `LLMRAGGenerationService`, conceptual LLM prompt schema, and explicit MVP scope exclusions (multi-book ingestion, production prompts, Bloom classification).
  - [x] Code isolation: Existing `papers/views.py` `select-questions/` endpoint preserved untouched with explanatory integration comment; existing test suites continue passing with 100% success.
  - [x] Comprehensive test suite in `generation/tests.py` (12 passing tests).

- [x] **Task 8 — QBM -> DEO -> Validator -> Approved Question Bank Workflow**
  - [x] School-level validation toggle: `School.validation_workflow_enabled` (Mode A: enabled, Mode B: direct paper generation without gating).
  - [x] Data models: `Question.validation_status` (`DRAFT`, `SUBMITTED`, `UNDER_VALIDATION`, `CORRECTION_REQUIRED`, `APPROVED`, `REJECTED`), `Question.revision` integer counter, `Question.topics` (M2M relation), and `QuestionValidationHistory` audit log model (captures actor, action, comments, field diffs, revision).
  - [x] Capability system: Added `DATA_ENTRY_OPERATOR` and `VALIDATOR` to `CapabilityName`; updated role computation supporting `"Data Entry Operator"`, `"Validator"`, and `"DEO & Validator"` dual-role.
  - [x] Default capability mappings: `grant_deo_defaults`, `grant_validator_defaults`, `grant_deo_and_validator_defaults`.
  - [x] State machine & validation endpoints:
    - `POST /api/questions/<id>/validate/`: validator review actions (`APPROVE`, `SEND_FOR_CORRECTION`, `REJECT`), mandatory comments (>=5 chars) on correction/rejection.
    - `PATCH /api/questions/<id>/validator-metadata/`: permitted validator metadata edits (topics, difficulty with variants synchronization, marks); direct content/options mutations strictly prohibited with HTTP 403.
    - `POST /api/questions/<id>/resubmit/`: DEO edit and resubmission, increments revision counter and transitions status back to `SUBMITTED`.
    - `GET /api/questions/validation-queue/`: filterable queue for validators.
    - `GET /api/questions/<id>/validation-history/`: full chronological audit log.
  - [x] Approved Question Bank Gate: `PaperSelectQuestionsView`, `PaperVersionCloneView`, and `SeededBankGenerationService` filter strictly for `validation_status=APPROVED` when school has validation enabled.
  - [x] Automated test suite: `content/test_validation_workflow.py` (9 tests covering state machine, permission checks, audit logging, content mutation restrictions, resubmissions, and gate enforcement).
  - [x] Frontend UI:
    - Super Admin / School Admin: Validation workflow toggle on school creation/edit; DEO, Validator, and Dual-Role user onboarding.
    - DEO Workspace: Ingestion with multi-topic selection; "My Submissions" tab with status badges, correction alert banners, and "Edit & Resubmit" modal.
    - Validator Workspace: Review queue with filters; review modal allowing permitted metadata edits while keeping question content read-only; slide-in validation audit history drawer.
  - [x] Demo Seeding: `seed_task8_demo` command seeding test users and questions across all workflow states.

---

## Verification Report

| Checklist Item | Status | Verification Evidence & Notes |
|----------------|--------|-------------------------------|
| **Authentication** | **PASS** | Valid login (`teacher1`, `student1`, `schooladmin1`, `superadmin`, `deo1`, `validator1`, `dualuser1`) issues JWT and loads respective dashboard; invalid password returns HTTP 400 with user-facing error message; expired/invalid Bearer token returns HTTP 401 and cleanly redirects to `/login`. |
| **Authorization** | **PASS** | Gated client-side by `RequireCapability` and server-side by DRF permissions: `student1` attempting to create a student returns HTTP 403; `teacher1` attempting to create a school admin returns HTTP 403; `schooladmin1` attempting cross-school or unauthorized admin creation returns HTTP 403. Validators attempting content modification return HTTP 403. |
| **Scope** | **PASS** | Scoped queries verified in UI and API: teachers only see students within their assigned school and papers they authored; students only see deliveries assigned to their student ID via `assigned_students` M2M filter. DEO/Validator queues scoped to school questions. |
| **Question Selection** | **PASS** | Applying combinations of filters (`chapter=1`, `difficulty=EASY`, `question_type=MCQ`, `learner_level=BEGINNER`) deterministically returns identical ordered subsets from the 42-question NCERT question bank. Approved Question Bank gate strictly blocks non-approved questions when validation is enabled. |
| **Paper** | **PASS** | Version `total_marks` is computed immediately upon version creation by summing question snapshot marks and persists across page refreshes and browser reloads. |
| **Versions** | **PASS** | Creating Version B by cloning Version A does not mutate Version A's stored snapshot, total marks, or lifecycle status; each version maintains an independent immutable record. |
| **Online Test** | **PASS** | End-to-end flow verified via live browser subagent: Teacher delivers test -> Student sits and saves responses incrementally -> Student submits (MCQ auto-graded, descriptive set to pending) -> Teacher views roster (`/deliveries/:id/results`) -> Teacher grades descriptive questions (`/attempts/:id/grade`) -> Attempt transitions to `EVALUATED` -> Student result page (`/attempts/:id/result`) displays final evaluated score with no pending banner. |
| **Print** | **PASS** | Print layout route (`/papers/:id/versions/:id/print`) renders clean exam header (title, instructions, version label, total marks) and question sequence with mark allocation; print preview trigger confirmed functional. |
| **Validation Workflow (Task 8)** | **PASS** | 65 backend tests passed 100% (`content/test_validation_workflow.py` 9 tests, `papers/tests.py`, `users/tests.py`). Frontend production build passed cleanly (`tsc -b && vite build` built in 1.06s). End-to-end demo seeded with `deo1`, `validator1`, `dualuser1`, and `teacher_direct`. |
| **Regression** | **N/A** | Repository git history reviewed: no legacy document-processing or external DTO layer preceded this project. |

---

## Deployment Status

- [/] **Frontend — Vercel** (React/Vite SPA)
  - `frontend/vercel.json` created with SPA rewrite rule
  - Vercel project settings: Root Directory = `frontend`, Framework = Vite
  - Required Vercel env var: `VITE_API_BASE_URL` = Django backend production URL

- [ ] **Backend — Not yet deployed**
  - Django backend needs a host (Railway, Render, VPS, etc.)
  - Production settings in `question_generation_system/settings/prod.py`
  - Email SMTP credentials needed (see `.env.example` — `EMAIL_HOST_*` vars)
  - Static files: WhiteNoise or S3 (not yet configured)
  - Docker / CI/CD: not yet set up


