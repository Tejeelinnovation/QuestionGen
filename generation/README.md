# Generation Service Boundary (Design Document & Contract)

## Overview

The `generation` app defines the architectural service boundary between question paper assembly requests and the underlying question generator engine.

Throughout the MVP phase, the system has relied exclusively on a **pre-seeded question bank** (`content` app) from which teachers select and filter curriculum questions. This app introduces an abstract interface and factory layer to ensure that when a live LLM or RAG pipeline is integrated in the future, it can plug in seamlessly with **zero refactoring** of `papers`, `content`, or frontend UI code.

---

## Architecture & Contract

### 1. `QuestionDraft` (Data Transfer Contract)

Located in `generation.interfaces.QuestionDraft`.

`QuestionDraft` is a typed dataclass representing a candidate question generated or retrieved by a generation backend, prior to persistence in the database:

```python
@dataclass
class QuestionDraft:
    question_text: str
    question_type: str            # "MCQ" | "SHORT_ANSWER" | "LONG_ANSWER"
    marks: Decimal | float
    difficulty: str               # "EASY" | "MEDIUM" | "HARD"
    learner_level: str            # "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
    correct_answer: str
    options: Optional[dict[str, str]] = None   # MCQ options: {"A": "...", "B": "..."}
    source_reference: str = ""
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    is_active: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)
```

**Why it is shaped this way:**
- **Exact Parity with Core Schema:** Matches the fields of `content.models.Question`.
- **Decoupled from ORM:** Backends produce lightweight Python objects without needing immediate database insertion.
- **Direct Serializability:** `to_dict()` provides instant JSON compatibility for previewing in the React question review screen (`/papers/:id/review`).
- **Extensibility:** `metadata` carries engine-specific audit trails (e.g. `model_name`, `source_chunks`, `confidence_score`, `bloom_level`) without altering core fields.

---

### 2. `QuestionGenerationService` (Abstract Interface)

Located in `generation.interfaces.QuestionGenerationService`.

```python
class QuestionGenerationService(ABC):
    @abstractmethod
    def generate_questions(
        self,
        chapter: Any,
        constraints: dict[str, Any],
    ) -> list[QuestionDraft]:
        pass
```

The `constraints` dictionary accepts existing `filter_questions()` parameters:
- `topic_ids` / `topic_id`: Topic scoping within the chapter.
- `difficulty`: `EASY` | `MEDIUM` | `HARD`.
- `question_type`: `MCQ` | `SHORT_ANSWER` | `LONG_ANSWER`.
- `learner_level`: `BEGINNER` | `INTERMEDIATE` | `ADVANCED`.
- `marks`: Numerical mark allocation per question.
- `quantity`: Desired number of candidate questions.

Additionally, `constraints` allows future parameters without breaking the signature:
- `source_text`: Extracted textbook or reference text.
- `bloom_level`: Cognitive taxonomy level (e.g. Remember, Understand, Apply, Analyze).
- `temperature` / `model_name`: Generation hyper-parameters.

---

### 3. Concrete Implementation: `SeededBankGenerationService`

Located in `generation.services.seeded_bank.SeededBankGenerationService`.

This service wraps the existing `content.filters.filter_questions()` helper. When invoked, it:
1. Filters active questions in the database by `chapter_id`.
2. Applies standard attribute filters (`difficulty`, `type`, `marks`, `learner_level`).
3. Enforces `quantity` truncation.
4. Maps each `content.models.Question` model instance to a `QuestionDraft` via `QuestionDraft.from_question(q)`.

This provides a working, production-safe baseline that guarantees identical deterministic behavior to the current question bank.

---

### 4. Factory & Service Resolver

Located in `generation.factory.get_generation_service`.

Resolution is driven by configuration:
```python
# settings/base.py
GENERATION_SERVICE_BACKEND = env("GENERATION_SERVICE_BACKEND", default="seeded_bank")
```

To resolve the active backend:
```python
from generation.factory import get_generation_service

service = get_generation_service()
drafts = service.generate_questions(chapter_id=1, constraints={"difficulty": "EASY", "quantity": 5})
```

---

## How to Add a Future Backend (e.g. `LLMRAGGenerationService`)

Adding an AI generation backend requires **zero modifications** to existing paper, attempt, or frontend logic:

### Step 1: Implement the Service Class

Create `generation/services/llm_rag.py`:

```python
from generation.interfaces import QuestionDraft, QuestionGenerationService

class LLMRAGGenerationService(QuestionGenerationService):
    def generate_questions(self, chapter, constraints) -> list[QuestionDraft]:
        # 1. Retrieve chapter context or RAG text chunks
        # 2. Construct LLM prompt with constraints (difficulty, type, marks)
        # 3. Call model API and parse structured JSON response
        # 4. Return list of QuestionDraft objects
        ...
```

### Step 2: Register in `generation/factory.py`

```python
from generation.services.llm_rag import LLMRAGGenerationService

_BACKENDS = {
    "seeded_bank": SeededBankGenerationService,
    "llm_rag": LLMRAGGenerationService,
}
```

### Step 3: Switch Configuration

In `.env`:
```env
GENERATION_SERVICE_BACKEND=llm_rag
```

Neither the paper selection UI (`PaperConfigurePage.tsx`, `QuestionReviewPage.tsx`) nor the paper assembly endpoints require any changes.

---

## Conceptual LLM Prompt & Context Contract

When an LLM backend is introduced, the prompt contract will operate as follows:

```
[System Context]
You are an expert curriculum assessment developer. Generate questions strictly aligned
with the provided syllabus extract and formatting rules.

[Curriculum / RAG Context]
Chapter: {chapter.title}
Textbook Excerpt / Retrieval Chunks:
\"\"\"{source_text}\"\"\"

[Constraints]
- Topic: {topic.name}
- Question Type: {question_type} (MCQ / SHORT_ANSWER / LONG_ANSWER)
- Difficulty: {difficulty}
- Target Marks: {marks}
- Number of Questions: {quantity}

[Output Schema (Strict JSON Array)]
[
  {
    "question_text": "...",
    "question_type": "MCQ",
    "marks": 1.0,
    "difficulty": "EASY",
    "learner_level": "BEGINNER",
    "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correct_answer": "A",
    "source_reference": "Section 1.2"
  }
]
```

The returned payload directly deserializes into `QuestionDraft` objects and flows through the exact same preview, reordering, and version snapshot pipeline.

---

## Scope Exclusions

Out of scope for this boundary stub:
- **Multi-book ingestion pipelines**: Vector database indexing and document parsing are reserved for future work.
- **Live LLM API credentials & prompt engineering**: No external AI provider calls are made in this baseline.
- **Bloom taxonomy auto-classification**: Cognitive taxonomy tags remain extension slots in `QuestionDraft.metadata`.

The current interface boundary satisfies all contract prerequisites for future AI integration without destabilizing the validated workflow.
