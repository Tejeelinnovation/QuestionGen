# ARCHITECTURE.md
# Question Generation System — Technical Architecture Reference

> **Read this file first.** This is the quick-reference map of the entire system.
> For deep details on any area, see `PROJECT_CONTEXT.md` (backend) and `DESIGN_SYSTEM.md` (frontend UI).

---

## System Overview

A school platform where:
- **Teachers** build question papers from a structured question bank and deliver them as online or print tests
- **Students** sit online tests, submit answers, and view results
- **School Admins** manage teachers and students within their school
- **Super Admins** manage all schools and users system-wide
- **DEO (Data Entry Operators)** ingest new questions into the bank
- **Validators** review and approve/reject questions before they enter the paper-building pool

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND (Vercel)                      │
│           React 19 + TypeScript + Vite + Tailwind v4     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  useBreakpoint() → Desktop | Tablet | Mobile    │    │
│  │  Every page has 3 responsive implementations    │    │
│  └─────────────────────────────────────────────────┘    │
│                        │ Axios (JWT Bearer)               │
└────────────────────────┼─────────────────────────────────┘
                         │ HTTPS REST API
┌────────────────────────┼─────────────────────────────────┐
│                   BACKEND (TBD host)                     │
│           Django 6 + DRF + SimpleJWT                     │
│                                                          │
│  ┌──────┐ ┌───────┐ ┌─────────┐ ┌────────┐ ┌────────┐  │
│  │core  │ │schools│ │  users  │ │content │ │papers  │  │
│  └──────┘ └───────┘ └─────────┘ └────────┘ └────────┘  │
│                    ┌──────────┐ ┌────────────────────┐  │
│                    │ attempts │ │    generation      │  │
│                    └──────────┘ └────────────────────┘  │
│                        │                                  │
└────────────────────────┼─────────────────────────────────┘
                         │
                 ┌───────────────┐
                 │  PostgreSQL   │
                 │ (Neon / Local)│
                 └───────────────┘
```

---

## Backend App Map

| App | Models | Key Responsibility |
|-----|--------|--------------------|
| `core` | `AuditLog` | Shared base models (`TimestampedModel`), append-only audit log, `log_action()` helper |
| `schools` | `School` | Multi-tenancy boundary. Every non-Super-Admin belongs to a School |
| `users` | `User`, `Capability`, `UserCapability` | Auth, JWT, 12 capabilities, role computation, scoped querysets |
| `content` | `Book`, `Chapter`, `Topic`, `Question`, `QuestionValidationHistory` | Question bank with full validation workflow (DRAFT→APPROVED) |
| `papers` | `Paper`, `PaperVersion`, `Delivery` | Paper assembly, immutable versioning, print/online delivery |
| `attempts` | `Attempt`, `Answer` | Student sittings, auto-grading MCQ, teacher grading descriptive |
| `generation` | *(no DB models)* | Pluggable generation service interface. Currently wraps `content.filters` |

---

## Authorization Model

> **CRITICAL**: There are NO role fields. Role is computed from capabilities.

```
User
 └── UserCapability (grant records)
       └── Capability (12 fixed names)

user.has_capability("CREATE_PAPER")  ← always use this
user.role_label                      ← display only, never for auth decisions
```

### The 12 Capabilities

| Capability | Who Has It |
|---|---|
| `CREATE_SCHOOL` | Super Admin |
| `CREATE_SCHOOL_ADMIN` | Super Admin |
| `CREATE_TEACHER` | Super Admin, School Admin |
| `CREATE_STUDENT` | Super Admin, School Admin, Teacher |
| `GENERATE_SELECT_QUESTIONS` | Teacher |
| `CREATE_PAPER` | Teacher |
| `ASSIGN_TEST` | Teacher |
| `ATTEMPT_TEST` | Student |
| `VIEW_OWN_RESULT` | Student |
| `VIEW_SCHOOL_WIDE_CONTROLS` | School Admin |
| `DATA_ENTRY_OPERATOR` | DEO |
| `VALIDATOR` | Validator |

---

## API Endpoint Map (Quick Reference)

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login/` | Returns access + refresh JWT |
| POST | `/api/auth/logout/` | Blacklists refresh token |
| GET | `/api/auth/me/` | Current user profile + capabilities |
| POST | `/api/auth/token/refresh/` | Rotate access token |
| POST | `/api/auth/password-reset/` | Send reset email |
| POST | `/api/auth/password-reset/confirm/` | Confirm with token |

### Users
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/users/` | Scoped by school/created_by |
| PATCH | `/api/users/{id}/` | Update user |
| POST/DELETE | `/api/users/{id}/permissions/` | Grant/revoke capability (Super Admin only) |

### Content
| Method | Path | Notes |
|---|---|---|
| GET | `/api/books/` | Active books |
| GET | `/api/chapters/?book_id=` | Filter by book |
| GET | `/api/topics/?chapter_id=` | Filter by chapter |
| GET | `/api/questions/` | All filters combinable (topic, difficulty, type, level, marks) |
| POST | `/api/questions/{id}/validate/` | Validator: APPROVE / SEND_FOR_CORRECTION / REJECT |
| PATCH | `/api/questions/{id}/validator-metadata/` | Validator: edit topics/difficulty/marks only |
| POST | `/api/questions/{id}/resubmit/` | DEO: edit & resubmit after correction request |
| GET | `/api/questions/validation-queue/` | Validator queue (filterable) |
| GET | `/api/questions/{id}/validation-history/` | Chronological audit log |

### Papers & Delivery
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/papers/` | Scoped by role |
| GET | `/api/papers/{id}/` | Paper detail + version summaries |
| POST | `/api/papers/{id}/select-questions/` | Preview candidates (no persistence) |
| GET/POST | `/api/papers/{id}/versions/` | List / create version |
| GET | `/api/papers/{id}/versions/{vid}/` | Full snapshot |
| POST | `/api/papers/{id}/versions/{vid}/finalize/` | Lock version for delivery |
| POST | `/api/papers/{id}/versions/{vid}/clone/` | Create Version B |
| POST | `/api/papers/{id}/versions/{vid}/deliver/` | Create Delivery (PRINT or ONLINE) |
| GET | `/api/papers/{id}/versions/{vid}/print/` | Print layout |

### Deliveries & Attempts
| Method | Path | Notes |
|---|---|---|
| GET | `/api/deliveries/` | Student: assigned; Teacher: created |
| GET | `/api/deliveries/{id}/` | Detail + `my_attempt` for student |
| GET | `/api/deliveries/{id}/start/` | Start or resume attempt |
| GET | `/api/deliveries/{id}/results/` | Teacher results roster |
| PATCH | `/api/attempts/{id}/answers/{qid}/` | Incremental auto-save |
| POST | `/api/attempts/{id}/submit/` | Submit + auto-grade MCQ |
| GET | `/api/attempts/{id}/result/` | Student/teacher result view |
| POST | `/api/attempts/{id}/answers/{qid}/grade/` | Teacher grades descriptive answer |

---

## Frontend Page Map

### Desktop Pages (`src/pages/`)
| Route | Page | Capability Guard |
|---|---|---|
| `/login` | `LoginPage` | None |
| `/reset-password` | `ResetPasswordPage` | None |
| `/` | Redirects to dashboard | — |
| `/dashboard/super-admin` | `SuperAdminDashboard` | `CREATE_SCHOOL` |
| `/dashboard/school-admin` | `SchoolAdminDashboard` | `VIEW_SCHOOL_WIDE_CONTROLS` |
| `/dashboard/teacher` | `TeacherDashboard` | `CREATE_PAPER` |
| `/dashboard/student` | `StudentDashboard` | `ATTEMPT_TEST` |
| `/dashboard/qbm` | `QBMDashboard` | `INGEST_GLOBAL_QUESTIONS` or `DATA_ENTRY_OPERATOR` or `VALIDATOR` |
| `/papers/new` | `PaperSetupPage` | `CREATE_PAPER` |
| `/papers/:id` | `PaperDetailPage` | `CREATE_PAPER` |
| `/papers/:id/configure` | `PaperConfigurePage` | `CREATE_PAPER` |
| `/papers/:id/review` | `QuestionReviewPage` | `CREATE_PAPER` |
| `/papers/:id/versions/:vid` | `VersionDetailPage` | `CREATE_PAPER` |
| `/papers/:id/versions/:vid/deliver` | `DeliveryPage` | `ASSIGN_TEST` |
| `/papers/:id/versions/:vid/print` | `PrintViewPage` | `CREATE_PAPER` |
| `/deliveries/:id/attempt` | `TestAttemptPage` | `ATTEMPT_TEST` |
| `/deliveries/:id/results` | `ResultsRosterPage` | `ASSIGN_TEST` or `CREATE_PAPER` |
| `/attempts/:id/grade` | `GradeAttemptPage` | `ASSIGN_TEST` or `CREATE_PAPER` |
| `/attempts/:id/result` | `ResultPage` | `VIEW_OWN_RESULT` or `ASSIGN_TEST` |
| `/profile` | `ProfilePage` | None (authenticated) |

> Each page above has **Mobile** and **Tablet** counterparts in `pages/mobile/` and `pages/tablet/`.

---

## Data Flow: Teacher Creates & Delivers a Paper

```
1. Teacher → POST /api/papers/           → Paper (DRAFT)
2. Teacher → POST /api/papers/:id/select-questions/ → Preview questions (no DB write)
3. Teacher → POST /api/papers/:id/versions/        → PaperVersion (DRAFT, snapshot stored)
4. Teacher → POST /api/papers/:id/versions/:vid/finalize/ → PaperVersion (FINALIZED)
5. Teacher → POST /api/papers/:id/versions/:vid/deliver/  → Delivery (ONLINE, students assigned)
6. Student → GET  /api/deliveries/:id/start/       → Attempt created (IN_PROGRESS)
7. Student → PATCH /api/attempts/:id/answers/:qid/ → Answer saved (auto-save)
8. Student → POST  /api/attempts/:id/submit/       → MCQ auto-graded, SUBMITTED
9. Teacher → POST  /api/attempts/:id/answers/:qid/grade/ → Descriptive graded, EVALUATED
10. Student → GET  /api/attempts/:id/result/       → View final score
```

---

## Data Flow: DEO → Validator → Approved Question Bank

```
1. DEO      → POST /api/questions/               → Question (DRAFT)
2. DEO      → PATCH /api/questions/:id/          → Question status: SUBMITTED
3. Validator → GET  /api/questions/validation-queue/ → See queue
4. Validator → POST /api/questions/:id/validate/ → APPROVE / SEND_FOR_CORRECTION / REJECT
   If CORRECTION_REQUIRED:
5. DEO      → POST /api/questions/:id/resubmit/  → Back to SUBMITTED (revision++)
   Repeat 4-5 as needed until APPROVED
6. APPROVED questions enter the paper-building pool (when school validation_workflow_enabled=True)
```

---

## Key Design Rules (Must Not Break)

1. **No role fields** — use `has_capability()` everywhere, never `role_label` for logic
2. **PaperVersion is immutable once FINALIZED** — never mutate the `question_snapshot`
3. **Approved question gate** — when `School.validation_workflow_enabled=True`, only `APPROVED` questions can be used in papers
4. **Generation service boundary** — do NOT add question generation logic to `papers` or `content` apps. All generation goes through `generation.factory.get_generation_service()`
5. **Scoped querysets** — all user-facing querysets must go through `ScopedUserQuerysetMixin` or equivalent scope filter
6. **Audit logging** — every state-changing action must call `log_action(user, "domain.verb", target)`
7. **Motion tokens** — frontend animations must only use values from `src/lib/motion.ts`, never inline

---

## Environment Variables (Quick Reference)

```env
# Django
SECRET_KEY=
DEBUG=False
ALLOWED_HOSTS=yourdomain.com
DATABASE_URL=postgres://...

# Email (for password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=noreply@company.com
EMAIL_HOST_PASSWORD=app-password-here
DEFAULT_FROM_EMAIL=noreply@company.com

# Frontend URL (for reset links)
FRONTEND_URL=https://yourapp.vercel.app

# Generation backend
GENERATION_SERVICE_BACKEND=seeded_bank
```

```env
# Frontend (.env in frontend/)
VITE_API_BASE_URL=https://your-django-backend.com
```

---

## Test Suites

| File | Count | Covers |
|---|---|---|
| `users/tests.py` | — | Auth, capabilities, scoping |
| `papers/tests.py` | 16 | Paper, version, delivery, clone, finalize |
| `attempts/tests.py` | 16 | Attempt, auto-grade, teacher grade, result |
| `generation/tests.py` | 12 | Service interface, seeded bank, factory |
| `content/test_validation_workflow.py` | 9 | State machine, DEO/Validator, gate enforcement |

Run all: `python manage.py test`

---

## Demo Users (from `seed_demo_users` + `seed_task8_demo`)

| Username | Role | Password |
|---|---|---|
| `superadmin` | Super Admin | `admin123` |
| `schooladmin1` | School Admin | `admin123` |
| `teacher1` | Teacher | `admin123` |
| `student1` | Student | `admin123` |
| `deo1` | Data Entry Operator | `admin123` |
| `validator1` | Validator | `admin123` |
| `dualuser1` | DEO & Validator | `admin123` |
| `teacher_direct` | Teacher (validation disabled school) | `admin123` |
