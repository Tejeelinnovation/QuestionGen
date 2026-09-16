# Task 8: QBM → Data Entry Operator → Validator → Approved Question Bank
## End-to-End Implementation Prompts Guide

> **How to use this file:**
> This file contains the complete, sequential, prompt-by-prompt roadmap to implement **Task 8** as specified in the requirements PDF.
> Do **not** feed all prompts at once. Execute them **one-by-one** in order (Prompt 1 through Prompt 10). After each prompt finishes, test and verify the acceptance checklist before copying the next prompt.

---

### Project & Architectural Context for Task 8

- **Repository Stack:** Django 6.0.3 + DRF (Python 3.13) + PostgreSQL, React 19 + TypeScript + Vite, Tailwind CSS v4.
- **Multi-Device Architecture:** Responsive layouts split into `*Desktop.tsx`, `*Tablet.tsx`, and `*Mobile.tsx` driven by `useBreakpoint()`.
- **Design System:** Background `#F7F5F1`, Primary `#1F4D3A` (Forest), Secondary `#E8632C` (Ember), Borders `#E2DDD7`, Space Grotesk headings, Inter body text, Lucide React outline icons.
- **Core Principle:** Permissions are capability-based (`user.has_capability("...")`), never hardcoded to role strings. A single user can hold both DEO and Validator capabilities simultaneously.
- **Modes:**
  - **Mode A (Validation Flow Enabled):** Super Admin enabled `validation_workflow_enabled = True` for the school. Questions follow: DEO entry (`DRAFT` / `SUBMITTED`) → Validator Review (`UNDER_VALIDATION`, metadata edits, or comment-based `CORRECTION_REQUIRED` / `REJECTED`) → `APPROVED`. Only `APPROVED` questions enter downstream Paper Generation / Selection.
  - **Mode B (Validation Flow Disabled):** Existing direct Question Bank flow is preserved without requiring DEO / Validator approval stages.

---

## Roadmap Overview

| Prompt | Title | Scope & Target Files |
|---|---|---|
| **Prompt 1** | Backend Data Models & Migrations | `schools/models.py`, `content/models.py`, migrations |
| **Prompt 2** | Capability System & Role Assignment | `users/models.py`, `users/capability_defaults.py`, `users/serializers.py`, `users/views.py` |
| **Prompt 3** | Validation API Endpoints & State Machine | `content/views.py`, `content/serializers.py`, `content/urls.py` |
| **Prompt 4** | Approved Question Bank Gate Enforcement | `papers/views.py`, `content/filters.py`, `generation/services/seeded_bank.py` |
| **Prompt 5** | Backend Automated Test Suite | `content/tests.py`, `papers/tests.py`, new `content/test_validation.py` |
| **Prompt 6** | Frontend Types, API Client & Route Guards | `frontend/src/types/index.ts`, `frontend/src/api/content.ts`, `frontend/src/routes.tsx` |
| **Prompt 7** | Super Admin & School Admin Enablement UI | Super Admin School drawer, School Admin user creation/assignment modal |
| **Prompt 8** | DEO Workspace (Multi-Topic Entry & Resubmission) | DEO Dashboard tab, multi-topic question form, correction inbox across Desktop/Tablet/Mobile |
| **Prompt 9** | Validator Workspace & Review Queue | Validator review table, metadata editor, locked question text, comment modal, audit history |
| **Prompt 10** | Seed Management Command & End-to-End Verification | `seed_task8_demo.py`, full end-to-end integration test run & verification report |

---

# Prompt 1: Backend Data Models & Migrations

```markdown
You are working on the Question Generation System codebase (Django 6.0 + DRF + PostgreSQL).
Please review PROJECT_CONTEXT.md and the Task 8 PDF specification.

TASK:
Implement the database schema changes required for Task 8 (QBM Validation Workflow):
1. School Validation Flow Toggle
2. Multiple Topics relationship on Question
3. Question Validation Status Lifecycle & Revision tracking
4. Question Validation History / Audit Trail model

DETAILED REQUIREMENTS:

1. `schools/models.py`:
   - In `School` model, add a new boolean field:
     `validation_workflow_enabled = models.BooleanField(
         default=False,
         help_text="Controls whether the school uses the DEO -> Validator validation workflow or direct question generation."
     )`
   - Ensure it is serialized in `schools/serializers.py` (read and update by Super Admin).

2. `content/models.py`:
   - Define `ValidationStatus` (models.TextChoices):
     - `DRAFT = "DRAFT", "Draft"`
     - `SUBMITTED = "SUBMITTED", "Submitted for Validation"`
     - `UNDER_VALIDATION = "UNDER_VALIDATION", "Under Validation"`
     - `CORRECTION_REQUIRED = "CORRECTION_REQUIRED", "Correction Required"`
     - `APPROVED = "APPROVED", "Approved"`
     - `REJECTED = "REJECTED", "Rejected"`
   - Update `Question` model:
     - Add `validation_status`:
       `models.CharField(max_length=30, choices=ValidationStatus.choices, default=ValidationStatus.DRAFT, db_index=True)`
     - Add `revision`:
       `models.PositiveIntegerField(default=1, help_text="Revision counter incremented each time question content is corrected and resubmitted.")`
     - Add Many-to-Many relationship for Multiple Topics (PDF Section 9):
       `topics = models.ManyToManyField(Topic, related_name="questions_m2m", blank=True, help_text="Multiple topics associated with this question.")`
       *Note: Keep the existing ForeignKey `topic` intact for backward compatibility; whenever `save()` is called or topics are updated, ensure `topic` is kept in sync with the primary/first topic in `topics`.*
     - Add index on `["validation_status", "school"]`.

3. Create `QuestionValidationHistory` model in `content/models.py`:
   - Extends `core.TimestampedModel`.
   - Fields:
     - `question`: `ForeignKey(Question, on_delete=models.CASCADE, related_name="validation_history")`
     - `actor`: `ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="question_validations")`
     - `action`: `models.CharField(max_length=30)` (choices: `SUBMIT`, `START_VALIDATION`, `METADATA_UPDATE`, `SEND_FOR_CORRECTION`, `RESUBMIT`, `APPROVE`, `REJECT`)
     - `comment`: `models.TextField(blank=True, default="")` (mandatory for `SEND_FOR_CORRECTION` and `REJECT`)
     - `changed_fields`: `models.JSONField(default=dict, blank=True, help_text="Stores old and new values for topics, difficulty, marks, variant marks.")`
     - `revision`: `models.PositiveIntegerField(default=1)`
   - Meta:
     - `ordering = ["-created_at"]`

4. Migrations:
   - Create migrations (`python manage.py makemigrations`).
   - Create a data migration or post-migrate script that copies existing `question.topic` into `question.topics` for all existing questions in the database, and sets existing active questions' `validation_status` to `APPROVED` so existing test suites and seed data do not break.
   - Run `python manage.py migrate`.

VERIFICATION:
- Run `python manage.py migrate` and verify zero migration errors.
- Run `python manage.py check` to verify system check passes.
```

---

# Prompt 2: Capability System & Role Assignment

```markdown
You are working on the Question Generation System codebase.
Please review PROJECT_CONTEXT.md, `users/models.py`, `users/capability_defaults.py`, and the Task 8 PDF specification.

TASK:
Implement the capabilities and role management for Data Entry Operator (DEO) and Validator:
1. Register new capabilities in `users/models.py`.
2. Allow schools to create/assign DEO and Validator responsibilities.
3. Explicitly support both separate individuals and the same individual holding both roles (PDF Section 5).
4. Enforce that Super Admin controls school-level validation enablement.

DETAILED REQUIREMENTS:

1. `users/models.py`:
   - In `CapabilityName` (TextChoices), add:
     - `DATA_ENTRY_OPERATOR = "DATA_ENTRY_OPERATOR", "Data Entry Operator (QBM)"`
     - `VALIDATOR = "VALIDATOR", "Question Validator (QBM)"`
   - In `User.role_label` property and role mapper:
     - Support `"Data Entry Operator"` / `"deo"` and `"Validator"` / `"validator"`.
     - If a user has BOTH `DATA_ENTRY_OPERATOR` and `VALIDATOR`, resolve display label to `"DEO & Validator"` (or indicate dual role).

2. Populate Capabilities in DB:
   - Create a data migration or management routine to ensure the two new `Capability` records exist in the database table (`Capability.objects.get_or_create(name=...)`).

3. `users/capability_defaults.py`:
   - Add `grant_deo_defaults(user, granted_by=None)`:
     - Grants `DATA_ENTRY_OPERATOR`.
     - Also grants `GENERATE_SELECT_QUESTIONS` if user's school has `question_bank_enabled=True`.
   - Add `grant_validator_defaults(user, granted_by=None)`:
     - Grants `VALIDATOR`.
     - Also grants `GENERATE_SELECT_QUESTIONS` if user's school has `question_bank_enabled=True`.
   - Add `grant_deo_and_validator_defaults(user, granted_by=None)`:
     - Grants both `DATA_ENTRY_OPERATOR` and `VALIDATOR`.

4. `users/views.py` & `users/serializers.py`:
   - Update `_PROFILE_TO_REQUIRED_CAP` in `UserViewSet`:
     - Allow School Admin (`VIEW_SCHOOL_WIDE_CONTROLS`) to create/assign `deo` and `validator` profiles.
     - Enforce: A School Admin can only create/assign DEO or Validator if the school's `validation_workflow_enabled` is `True` (or return HTTP 400 with a clear message: "Validation workflow is not enabled for your school. Please contact Super Admin.").
   - In `CreateUserSerializer` and `UpdateUserSerializer`:
     - Support assigning/updating capabilities for DEO and Validator.
     - Allow toggling both DEO and Validator capabilities on an existing teacher or staff member.

VERIFICATION:
- Run `python manage.py test users` to ensure all existing user auth and permission tests pass.
- Test that creating a DEO user grants `DATA_ENTRY_OPERATOR`, creating a Validator user grants `VALIDATOR`, and creating a user with both works seamlessly.
```

---

# Prompt 3: Validation API Endpoints & State Machine

```markdown
You are working on the Question Generation System codebase.
Please review `content/models.py`, `content/views.py`, `content/serializers.py`, and Task 8 PDF (Sections 7, 8, 9, 10, 11, 12, 15, 16).

TASK:
Implement the validation workflow state machine, permitted Validator edits, comment-enforced review actions, and history audit endpoints.

DETAILED REQUIREMENTS:

1. Permitted vs. Prohibited Validator Edits (PDF Section 8 & 10):
   - **Validator CAN directly change:**
     - Topics: add, remove, change topic associations (`topics` M2M).
     - Difficulty: change difficulty (must automatically sync to all question variants).
     - Marks: change parent question marks.
     - Variant marks: change marks on individual `QuestionVariant`.
   - **Validator CANNOT directly change:**
     - Question text / wording.
     - MCQ / MSQ options.
     - Correct answer / rubric.
     - If a user with only `VALIDATOR` capability attempts to submit edits to `question_text`, `options`, or `correct_answer`, return HTTP 403 Forbidden: `"Validators are not permitted to edit question wording or options directly. Please send back for correction with a comment."`

2. Validator Action Matrix & Endpoints (`content/views.py`):
   - **POST `/api/questions/{id}/validate/`**:
     - Action parameter in payload: `"action"` (`"APPROVE"`, `"SEND_FOR_CORRECTION"`, `"REJECT"`).
     - Required caller capability: `VALIDATOR` (or Super Admin).
     - State Transitions:
       - If `"APPROVE"`:
         - Allowed from: `SUBMITTED`, `UNDER_VALIDATION`, `CORRECTION_REQUIRED`.
         - Comment is **Optional**.
         - `validation_status` becomes `APPROVED`.
         - Logs `QuestionValidationHistory(action="APPROVE", comment=comment, revision=question.revision)`.
       - If `"SEND_FOR_CORRECTION"`:
         - Allowed from: `SUBMITTED`, `UNDER_VALIDATION`.
         - Comment is **Mandatory** (validate `bool(comment.strip())`, return HTTP 400 if empty).
         - `validation_status` becomes `CORRECTION_REQUIRED`.
         - Logs `QuestionValidationHistory(action="SEND_FOR_CORRECTION", comment=comment, revision=question.revision)`.
       - If `"REJECT"`:
         - Allowed from: `SUBMITTED`, `UNDER_VALIDATION`, `CORRECTION_REQUIRED`.
         - Comment is **Mandatory** (validate `bool(comment.strip())`, return HTTP 400 if empty).
         - `validation_status` becomes `REJECTED`.
         - Logs `QuestionValidationHistory(action="REJECT", comment=comment, revision=question.revision)`.
   - **PATCH `/api/questions/{id}/validator-metadata/`**:
     - Permitted metadata patch for Validator:
       - Update `topics` (list of topic IDs).
       - Update `difficulty` (EASY / MEDIUM / HARD) -> cascades to all variants.
       - Update `marks` (parent marks).
       - Update variant marks (list of `{ "id": variant_id, "marks": new_marks }`).
     - Tracks changes in `changed_fields` dictionary: `{ "field": { "old": old_val, "new": new_val } }`.
     - Logs `QuestionValidationHistory(action="METADATA_UPDATE", changed_fields=diff, revision=question.revision)`.

3. DEO Question Submission & Resubmission Endpoints:
   - **POST `/api/questions/` or `/api/questions/ingest/`**:
     - When created by a DEO in a validation-enabled school, `validation_status` defaults to `SUBMITTED` (or `DRAFT` if `submit=False`).
     - Associates multiple topics via `topics` IDs.
     - Creates initial `QuestionValidationHistory(action="SUBMIT", revision=1)`.
   - **POST `/api/questions/{id}/resubmit/`**:
     - Allowed for question creator / DEO when question is in `CORRECTION_REQUIRED` or `DRAFT`.
     - Increments `question.revision += 1`.
     - Sets `validation_status = "SUBMITTED"`.
     - Optional submission comment.
     - Logs `QuestionValidationHistory(action="RESUBMIT", comment=comment, revision=question.revision)`.

4. Validation Queue & Audit History Endpoints:
   - **GET `/api/questions/validation-queue/`**:
     - Returns paginated list of questions in `SUBMITTED` or `UNDER_VALIDATION` (or `CORRECTION_REQUIRED`) scoped to Validator's school (or all if Global QBM/Super Admin).
     - Filterable by `status`, `subject`, `board`, `difficulty`.
   - **GET `/api/questions/{id}/validation-history/`**:
     - Returns chronological list of all validation cycles, comments, actions, actor names, timestamps, and metadata diffs for the question.

VERIFICATION:
- Test: Validator approving question transitions status to `APPROVED`.
- Test: Validator sending for correction without comment fails with HTTP 400.
- Test: Validator modifying question text returns HTTP 403.
- Test: Validator modifying topics, difficulty, and marks succeeds and records diff in history.
- Test: DEO editing content and resubmitting increments revision and transitions status to `SUBMITTED`.
```

---

# Prompt 4: Approved Question Bank Gate Enforcement

```markdown
You are working on the Question Generation System codebase.
Please review `content/filters.py`, `papers/views.py`, `generation/services/seeded_bank.py`, and Task 8 PDF (Sections 13, 14, and 19).

TASK:
Enforce the "Approved Question Bank Gate" at the backend retrieval, sampling, and paper-generation layers.

CORE RULE (PDF Sections 13 & 14):
- **Gate 1 — Authorization:** Requesting teacher/school is authorized to use the question bank (Global or own School).
- **Gate 2 — Validation:**
  - Where the school's `validation_workflow_enabled` is **True**: Candidate questions MUST have `validation_status == 'APPROVED'`.
  - Exclude all `DRAFT`, `SUBMITTED`, `UNDER_VALIDATION`, `CORRECTION_REQUIRED`, and `REJECTED` questions.
  - A teacher or DEO's own question CANNOT be selected/generated until it is approved!
  - Where the school's `validation_workflow_enabled` is **False**: The existing simpler generation flow is preserved; the validation status gate is NOT imposed (existing `is_active=True` questions are eligible).

DETAILED REQUIREMENTS:

1. `content/filters.py`:
   - Update `filter_questions(queryset, params)`:
     - Add support for multiple topics filter: if `topic_ids` is provided in params, filter `Q(topics__id__in=topic_ids) | Q(topic_id__in=topic_ids)`.
     - Add `validation_status` filter parameter when requested.

2. `papers/views.py`:
   - In `PaperSelectQuestionsView.post()`:
     - Determine the requesting school's validation mode:
       `school = getattr(request.user, "school", None)`
       `validation_enabled = getattr(school, "validation_workflow_enabled", False)`
     - If `validation_enabled` is True:
       Strictly append `.filter(validation_status="APPROVED")` to the candidate question queryset.
     - If `validation_enabled` is False:
       Do NOT impose `validation_status="APPROVED"` (allow existing questions as before).
   - In paper version question generation / cloning:
     - Ensure the same gate applies so direct API requests cannot bypass the gate.

3. `generation/services/seeded_bank.py`:
   - In `SeededBankGenerationService.generate_questions(chapter, constraints)`:
     - Check constraints for `school_id` or user context.
     - If school validation is enabled, filter candidate pool by `validation_status="APPROVED"`.

4. `content/views.py` (`QuestionListView`):
   - For paper building / browsing, non-DEO/non-Validator regular teachers in validation-enabled schools should only see `APPROVED` questions unless viewing their own authored questions in their personal drafts workspace.

VERIFICATION:
- Test: In a validation-enabled school, a question in `SUBMITTED` or `CORRECTION_REQUIRED` is NOT returned in `/api/papers/{id}/select-questions/`.
- Test: When that question is transitioned to `APPROVED`, it immediately becomes eligible and is returned in question selection.
- Test: In a validation-disabled school, questions without validation flow continue to be selected seamlessly.
```

---

# Prompt 5: Backend Automated Test Suite

```markdown
You are working on the Question Generation System codebase.
Please review the Task 8 PDF (Section 17 Acceptance Criteria and Section 18 Definition of Done).

TASK:
Write a comprehensive Django REST Framework test suite verifying all Task 8 requirements end-to-end.

DETAILED REQUIREMENTS:

Create `content/tests/test_validation_workflow.py` (or add to `content/tests.py` and `papers/tests.py`):

1. **School-Level Enablement Tests:**
   - Super Admin can toggle `validation_workflow_enabled` on a school.
   - Non-Super Admin cannot toggle `validation_workflow_enabled`.

2. **Role Profiles & Dual-Role Assignment Tests (PDF Section 5):**
   - School Admin creates user with `DATA_ENTRY_OPERATOR` capability.
   - School Admin creates user with `VALIDATOR` capability.
   - School Admin assigns both `DATA_ENTRY_OPERATOR` and `VALIDATOR` to the SAME user.
   - Verify that the dual-role user can both enter questions and validate questions.

3. **DEO Entry & Submission Tests:**
   - DEO enters question with multiple topics (`topics` M2M), difficulty, and marks.
   - Question enters `SUBMITTED` state with `revision=1`.
   - Initial audit record created in `QuestionValidationHistory`.

4. **Validator Review & Permissions Tests (PDF Section 8 & 11):**
   - Validator can view question in `/api/questions/validation-queue/`.
   - Validator modifies topics, difficulty, and marks via metadata patch -> audit record logged with old and new values.
   - Validator changing question difficulty automatically cascades difficulty to all variants.
   - Validator attempting to modify question text / options directly is blocked with HTTP 403.
   - Validator sends question for correction WITHOUT comment -> fails with HTTP 400.
   - Validator sends question for correction WITH comment -> succeeds, status is `CORRECTION_REQUIRED`.

5. **DEO Correction & Resubmission Tests (PDF Section 15):**
   - DEO modifies question text based on Validator's comment and calls `/api/questions/{id}/resubmit/`.
   - Status transitions back to `SUBMITTED`, revision increments to 2.
   - Validator approves the resubmitted question -> status is `APPROVED`.

6. **Approved Question Bank Gate Tests (PDF Section 13 & 14):**
   - In validation-enabled school:
     - Attempting to generate a paper using candidate questions excludes `DRAFT`, `SUBMITTED`, `CORRECTION_REQUIRED`, and `REJECTED` questions.
     - Only `APPROVED` questions appear in `select-questions`.
   - In validation-disabled school:
     - Direct question generation works without requiring the DEO/Validator stage.

VERIFICATION:
- Run `python manage.py test content papers users`
- All tests must pass with 100% success.
```

---

# Prompt 6: Frontend Types, API Client & Route Guards

```markdown
You are working on the Question Generation System React + TypeScript frontend (`frontend/src/`).
Please review `frontend/src/types/index.ts`, `frontend/src/api/content.ts`, `frontend/src/routes.tsx`, and `frontend/src/auth/AuthContext.tsx`.

TASK:
Update frontend TypeScript interfaces, API service functions, and routes to support Task 8.

DETAILED REQUIREMENTS:

1. `frontend/src/types/index.ts`:
   - Add `CapabilityName`:
     - `'DATA_ENTRY_OPERATOR'`
     - `'VALIDATOR'`
   - Add `ValidationStatus`:
     `export type ValidationStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_VALIDATION' | 'CORRECTION_REQUIRED' | 'APPROVED' | 'REJECTED';`
   - Update `Question` interface:
     - `validation_status: ValidationStatus;`
     - `revision: number;`
     - `topic_ids?: number[];`
     - `topics?: Topic[];`
   - Create `QuestionValidationHistoryItem`:
     `export interface QuestionValidationHistoryItem {
       id: number;
       question: number;
       actor_id: number;
       actor_username: string;
       actor_role: string;
       action: 'SUBMIT' | 'START_VALIDATION' | 'METADATA_UPDATE' | 'SEND_FOR_CORRECTION' | 'RESUBMIT' | 'APPROVE' | 'REJECT';
       comment: string;
       changed_fields: Record<string, { old: any; new: any }>;
       revision: number;
       created_at: string;
     }`
   - Update `School` interface to include `validation_workflow_enabled: boolean;`.

2. `frontend/src/api/content.ts`:
   - Add API methods:
     - `getValidationQueue(params?: { status?: string; board?: string; difficulty?: string; page?: number }): Promise<PaginatedResponse<Question>>`
     - `getValidationHistory(questionId: number): Promise<QuestionValidationHistoryItem[]>`
     - `validateQuestion(questionId: number, payload: { action: 'APPROVE' | 'SEND_FOR_CORRECTION' | 'REJECT'; comment?: string }): Promise<Question>`
     - `updateValidatorMetadata(questionId: number, payload: { topic_ids?: number[]; difficulty?: Difficulty; marks?: string | number; variant_marks?: { id: number; marks: string | number }[] }): Promise<Question>`
     - `resubmitQuestion(questionId: number, payload: { question_text?: string; options?: any; correct_answer?: string; comment?: string }): Promise<Question>`

3. `frontend/src/routes.tsx`:
   - Register routes:
     - `/qbm/validation-queue` -> guarded by `RequireCapability` with `capability="VALIDATOR"`.
     - `/qbm/my-submissions` -> guarded by `RequireCapability` with `capability="DATA_ENTRY_OPERATOR"`.

VERIFICATION:
- Run `npm run build` in `frontend/` to ensure all TypeScript types compile without errors.
```

---

# Prompt 7: Super Admin & School Admin Enablement UI

```markdown
You are working on the Question Generation System React frontend (`frontend/src/`).
Please review `DESIGN_SYSTEM.md`, `SuperAdminDashboard.tsx`, `SchoolAdminDashboard.tsx`, `CreateUserDrawer.tsx`, and `UpdateUserModal.tsx`.

TASK:
Implement the UI controls for Super Admin school enablement and School Admin user assignment of DEO and Validator roles.

DETAILED REQUIREMENTS:

1. Super Admin School Configuration:
   - In the School edit modal / drawer (`CreateSchoolDrawer.tsx` / `UpdateSchoolModal.tsx` / `SuperAdminDashboard`):
     - Add a clean toggle switch: **"Enable QBM Validation Workflow (DEO → Validator)"**.
     - Display helper text: *"When enabled, all questions entered for this school must pass through a Data Entry Operator and Validator before becoming eligible for question generation."*
     - Sends `validation_workflow_enabled: boolean` in the payload to `PATCH /api/schools/{id}/`.
     - Follow design system tokens: Forest green active state (`bg-forest`), warm border (`border-border`), smooth toggle animation.

2. School Admin User Management:
   - In `CreateUserDrawer.tsx` and `UpdateUserModal.tsx`:
     - When the school has `validation_workflow_enabled == true`:
       - Show role profile options for **"Data Entry Operator (DEO)"** and **"Validator"**.
       - Provide checkboxes / toggles allowing the admin to assign **BOTH** DEO and Validator capabilities to the same user (PDF Section 5: *"The same person can be assigned both the DEO and Validator responsibilities"*).
     - When `validation_workflow_enabled == false`:
       - Show an informative pill: *"Validation workflow disabled by Super Admin. Standard teacher question-generation flow active."*

3. Multi-Device Layout:
   - Ensure drawers and forms look stunning across Desktop (slide-in sheet), Tablet (elevation modal), and Mobile (full-screen overlay), adhering to `DESIGN_SYSTEM.md`.

VERIFICATION:
- Verify Super Admin can enable and disable the toggle for any school.
- Verify School Admin can create a DEO, a Validator, or a dual-role user.
```

---

# Prompt 8: DEO Workspace (Multi-Topic Entry & Resubmission)

```markdown
You are working on the Question Generation System React frontend (`frontend/src/`).
Please review `DESIGN_SYSTEM.md`, `QBMDashboard.tsx`, and Task 8 PDF (Sections 7, 9, 10, 15).

TASK:
Build the Data Entry Operator (DEO) workspace supporting multi-topic selection, question submission, and correction resubmission across Desktop, Tablet, and Mobile.

DETAILED REQUIREMENTS:

1. Multi-Topic Selection (PDF Section 9):
   - In the question entry form (`QBMDashboard.tsx` or new `DEOQuestionEntryForm.tsx`):
     - Allow selecting **multiple topics** under the chosen chapter.
     - Render selected topics as interactive removable pills (`bg-surface`, `border-border`, with Lucide `X` icon).
     - Support searching/filtering topics.

2. Status Badges & Lifecycle Display (PDF Section 12):
   - Visual badges for question lifecycle:
     - `DRAFT`: Gray pill (`bg-gray-100 text-gray-700`)
     - `SUBMITTED`: Amber pill (`bg-amber-100 text-amber-800`)
     - `UNDER_VALIDATION`: Blue pill (`bg-blue-100 text-blue-800`)
     - `CORRECTION_REQUIRED`: Burnt orange pill (`bg-ember/10 text-ember border-ember/20`)
     - `APPROVED`: Deep forest green pill (`bg-forest/10 text-forest border-forest/20`)
     - `REJECTED`: Red pill (`bg-red-100 text-red-800`)

3. DEO "My Submissions" & Correction Flow (PDF Section 15):
   - Tab / view: **"My Submissions"** listing questions authored by the current DEO.
   - Filter tabs: All, Needs Correction, Pending Validation, Approved.
   - When a question has status `CORRECTION_REQUIRED`:
     - Render an alert banner at the top of the question card:
       - Burnt orange banner (`bg-ember/10 border-ember/30 text-ink`).
       - Displays: *"Validator Comment (Rev #{q.revision}): {comment}"* with timestamp and Validator name.
     - DEO can click **"Edit & Resubmit"**:
       - Form opens with question text, options, and answers editable.
       - DEO edits the content and enters an optional resubmission note.
       - Submits via `POST /api/questions/{id}/resubmit/`.
       - Status updates to `SUBMITTED`, revision counter increments, banner clears.

4. Responsive Layouts:
   - Provide desktop layout (multi-column bento style), tablet (2-column), and mobile (single-column with touch press states), utilizing `useBreakpoint()`.

VERIFICATION:
- Enter a question with 3 topics -> verify all 3 topics save and persist.
- Submit question -> verify status is `SUBMITTED`.
- View a question sent back for correction -> verify Validator comment is prominently displayed.
- Edit question text and resubmit -> verify status transitions back to `SUBMITTED` with incremented revision number.
```

---

# Prompt 9: Validator Workspace & Review Queue

```markdown
You are working on the Question Generation System React frontend (`frontend/src/`).
Please review `DESIGN_SYSTEM.md`, `QBMDashboard.tsx`, and Task 8 PDF (Sections 8, 10, 11, 16).

TASK:
Build the Validator Workspace: Review Queue, Metadata-Only Editor, Comment-Enforced Actions, and Validation History Drawer across Desktop, Tablet, and Mobile.

DETAILED REQUIREMENTS:

1. Validator Review Queue (`ValidatorQueuePage.tsx` or QBM tab):
   - Table / Card view of submitted questions awaiting review (`validation_status in ['SUBMITTED', 'UNDER_VALIDATION']`).
   - Displays: Question snippet, Topics list pills, Type, Difficulty, Marks, Variant count, Author (DEO), Submitted date, Revision badge.
   - Quick filters: Subject, Board, Difficulty, Status.

2. Review & Edit Interface (PDF Section 8 & 10):
   - When reviewing a question:
     - **Editable Metadata Fields (Validator CAN edit):**
       - Topics: Multi-select dropdown to add/remove/change topics.
       - Difficulty: EASY / MEDIUM / HARD selector (warns that variants will sync).
       - Marks: Numeric input for parent question marks.
       - Variant Marks: Inline editable marks input for each variant.
       - "Save Metadata Changes" button -> calls `PATCH /api/questions/{id}/validator-metadata/`.
     - **Locked Content Fields (Validator CANNOT edit):**
       - Question text, MCQ options, Correct answer, Explanation.
       - Rendered in read-only styled cards with a subtle lock icon (`Lucide Lock`):
         *"Question wording is locked. If correction is needed, send back to DEO with comment."*

3. Validator Action Matrix (PDF Section 11):
   - Action Buttons:
     - **"Approve Question"** (`bg-forest text-white`):
       - Opens confirmation dialog with **Optional** comment.
       - On confirm, calls `POST /api/questions/{id}/validate/` with `action="APPROVE"`.
       - Question enters `APPROVED` status and enters the Approved Question Bank.
     - **"Send for Correction"** (`bg-ember text-white`):
       - Opens modal with **Mandatory** comment textarea: *"Specify what is wrong with the question content for the DEO to fix."*
       - Submit button disabled until at least 5 characters typed.
       - On submit, calls `action="SEND_FOR_CORRECTION"`.
     - **"Reject Question"** (`bg-red-600 text-white`):
       - Opens modal with **Mandatory** rejection reason textarea.
       - On submit, calls `action="REJECT"`.

4. Validation History / Audit Trail Sheet (PDF Section 16):
   - Button **"View History"** opens a slide-in timeline drawer:
     - Displays chronological history of every validation cycle.
     - Each entry shows: Timestamp, Actor name & role, Action badge (Approved, Returned for Correction, Resubmitted, Metadata Updated), Revision number, Comment text.
     - If metadata was updated, displays old vs. new values (e.g. *Marks changed: 2.00 → 3.00*, *Topics updated: +Algebra, -Trigonometry*).

5. Multi-Device Layouts:
   - Implement responsive variations for Desktop, Tablet, and Mobile using `useBreakpoint()`.

VERIFICATION:
- Validator can edit topics, marks, and difficulty and save successfully.
- Question text is strictly non-editable for the Validator.
- Sending for correction without a comment is blocked.
- History drawer accurately displays all actions, timestamps, and comments.
```

---

# Prompt 10: Seed Management Command & End-to-End Verification

```markdown
You are working on the Question Generation System codebase.
Please review `PROJECT_CONTEXT.md`, `README.md`, and the Task 8 PDF (Section 17 Acceptance Criteria, Section 18 Definition of Done, Section 19 Final Workflow).

TASK:
1. Create a demo data seeding management command for Task 8: `seed_task8_demo`.
2. Update `PROJECT_CONTEXT.md` and `README.md` with the new Task 8 capabilities, endpoints, and workflows.
3. Perform a complete end-to-end verification pass across both Mode A and Mode B.

DETAILED REQUIREMENTS:

1. Django Management Command: `python manage.py seed_task8_demo`
   - Reseeds or provisions:
     - School 1 ("Greenwood High"): `validation_workflow_enabled = True` (Mode A).
       - User `deo1` (password `password123`): assigned `DATA_ENTRY_OPERATOR`.
       - User `validator1` (password `password123`): assigned `VALIDATOR`.
       - User `dualuser1` (password `password123`): assigned BOTH `DATA_ENTRY_OPERATOR` and `VALIDATOR`.
       - Demo questions in various states: `DRAFT`, `SUBMITTED`, `CORRECTION_REQUIRED`, `APPROVED`, `REJECTED`.
     - School 2 ("Oakridge Academy"): `validation_workflow_enabled = False` (Mode B).
       - User `teacher_direct` (password `password123`): direct generation flow without DEO/Validator requirement.
   - Command is idempotent and safe to re-run.

2. Documentation Updates:
   - `PROJECT_CONTEXT.md`:
     - Document Task 8 under "Built So Far".
     - Document new capabilities (`DATA_ENTRY_OPERATOR`, `VALIDATOR`).
     - Document validation status lifecycle and the Approved Question Bank Gate.
   - `README.md`:
     - Document new demo credentials (`deo1`, `validator1`, `dualuser1`).
     - Document the verification workflow for Task 8.

3. Automated End-to-End Verification Script:
   - Create or run a verification script that verifies:
     - Mode A: Unapproved questions are never returned to teachers for paper generation.
     - Mode A: Approving a question immediately allows it to be generated into papers.
     - Mode B: Validation gate is bypassed and direct generation works.
     - Dual-role user can perform both DEO and Validator actions.
     - Validator cannot edit question wording directly.
     - Audit history retains full provenance with timestamps and comments.

VERIFICATION:
- Run `python manage.py seed_task8_demo`
- Run `python manage.py test`
- Build frontend (`npm run build`)
- Confirm 100% passing tests and complete Definition of Done compliance.
```
