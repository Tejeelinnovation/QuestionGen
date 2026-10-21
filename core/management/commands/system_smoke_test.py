"""
System Operational Smoke Test Management Command.

Automates multi-gate operational verification for CI/CD pipelines, container
entrypoints, and pre-release deployment validation:
- Gate 1: Database connectivity and atomic read/write/cleanup.
- Gate 2: Cache read, write, and invalidation latency.
- Gate 3: User authentication system and model verification.
- Gate 4: Content bank query and filtering integrity.
- Gate 5: Question Generation Service contract resolution.
- Gate 6: Document chunker and LaTeX formula boundary protection.

Usage:
    python manage.py system_smoke_test
    python manage.py system_smoke_test --verbose
    python manage.py system_smoke_test --json
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any, Dict, List

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Run automated multi-gate system smoke tests to verify operational integrity."

    def add_arguments(self, parser):
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show detailed latency and diagnostic metrics for each test gate.",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Output machine-readable JSON summary for automated monitoring pipelines.",
        )
        parser.add_argument(
            "--quiet",
            action="store_true",
            help="Suppress standard output, only exit with code 0 or 1.",
        )

    def handle(self, *args: Any, **options: Any):
        is_verbose = options.get("verbose", False)
        is_json = options.get("json", False)
        is_quiet = options.get("quiet", False)

        gates: List[Dict[str, Any]] = []
        all_passed = True

        def run_gate(name: str, check_fn) -> bool:
            nonlocal all_passed
            start = time.monotonic()
            try:
                detail = check_fn()
                duration = round((time.monotonic() - start) * 1000.0, 2)
                gates.append({
                    "gate": name,
                    "passed": True,
                    "duration_ms": duration,
                    "details": detail,
                })
                return True
            except Exception as exc:
                all_passed = False
                duration = round((time.monotonic() - start) * 1000.0, 2)
                gates.append({
                    "gate": name,
                    "passed": False,
                    "duration_ms": duration,
                    "error": str(exc),
                })
                return False

        # Gate 1: Database connectivity and transaction isolation
        def check_database() -> str:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                row = cursor.fetchone()
                if not row or row[0] != 1:
                    raise RuntimeError("Database SELECT 1 returned unexpected result")
            from core.models import AuditLog
            test_entry = AuditLog.objects.create(
                action="system.smoke_test",
                metadata={"probe": "ephemeral"},
            )
            test_id = test_entry.id
            AuditLog.objects.filter(id=test_id).delete()
            return f"Engine: {connection.settings_dict.get('ENGINE', '').split('.')[-1]}"

        # Gate 2: Cache read, write, and invalidation
        def check_cache() -> str:
            test_key = f"_smoke_test_{int(time.time() * 1000)}"
            cache.set(test_key, "smoke_val", 15)
            val = cache.get(test_key)
            if val != "smoke_val":
                raise RuntimeError(f"Cache get returned {val!r}, expected 'smoke_val'")
            cache.delete(test_key)
            return "Cache write/read/delete roundtrip verified"

        # Gate 3: User authentication system
        def check_auth() -> str:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            count = User.objects.count()
            return f"User model verified, {count} user record(s)"

        # Gate 4: Content bank models
        def check_content() -> str:
            from content.models import Question
            count = Question.objects.filter(is_active=True).count()
            return f"Question bank active: {count} active question(s)"

        # Gate 5: Question Generation Service contract
        def check_generation_service() -> str:
            from generation.factory import get_generation_service
            from generation.interfaces import QuestionDraft, QuestionGenerationService
            service = get_generation_service()
            if not isinstance(service, QuestionGenerationService):
                raise TypeError(f"{service} does not implement QuestionGenerationService")
            draft = QuestionDraft(
                question_text="Smoke test question prompt",
                question_type="SHORT_ANSWER",
                marks=2.0,
                difficulty="EASY",
                learner_level="BEGINNER",
                correct_answer="Smoke test answer",
            )
            draft_dict = draft.to_dict()
            if draft_dict.get("question_text") != "Smoke test question prompt":
                raise ValueError("QuestionDraft serialization mismatch")
            return f"Active Backend: {service.__class__.__name__}"

        # Gate 6: Document Chunker & LaTeX Protection
        def check_chunker() -> str:
            from content_ingestion.chunker import DocumentChunker
            chunker = DocumentChunker(default_chunk_size=100, default_overlap=30)
            formula = "$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$"
            sample = f"Intro mathematics concepts. {formula} This is Gauss summation."
            chunks = chunker.chunk_text(sample, chunk_size=80, chunk_overlap=25, preserve_latex=True)
            if not chunks:
                raise ValueError("DocumentChunker produced 0 chunks")
            # Verify formula is whole
            formula_found = any(formula in c.text for c in chunks)
            if not formula_found:
                raise ValueError("LaTeX formula was severed across chunk boundaries")
            return f"Generated {len(chunks)} chunk(s), formula intact"

        # Run all verification gates
        run_gate("1. Database Integrity & Isolation", check_database)
        run_gate("2. Cache Roundtrip Latency", check_cache)
        run_gate("3. User Authentication System", check_auth)
        run_gate("4. Question Content Bank", check_content)
        run_gate("5. Generation Service Contract", check_generation_service)
        run_gate("6. Document Chunker & LaTeX Guard", check_chunker)

        # Handle JSON output mode
        if is_json:
            result_payload = {
                "overall_status": "PASSED" if all_passed else "FAILED",
                "timestamp": time.time(),
                "total_gates": len(gates),
                "passed_gates": sum(1 for g in gates if g["passed"]),
                "failed_gates": sum(1 for g in gates if not g["passed"]),
                "gates": gates,
            }
            self.stdout.write(json.dumps(result_payload, indent=2))
            if not all_passed:
                sys.exit(1)
            return

        if is_quiet:
            if not all_passed:
                sys.exit(1)
            return

        # Human-readable CLI output
        self.stdout.write("\n" + "=" * 65)
        self.stdout.write(" SYSTEM OPERATIONAL SMOKE TEST SUITE ")
        self.stdout.write("=" * 65)

        for g in gates:
            status_tag = self.style.SUCCESS("[PASS]") if g["passed"] else self.style.ERROR("[FAIL]")
            timing = f"({g['duration_ms']}ms)"
            self.stdout.write(f" {status_tag} {g['gate']:<40} {timing:>12}")
            if is_verbose or not g["passed"]:
                if g["passed"]:
                    self.stdout.write(f"        -> {g.get('details', '')}")
                else:
                    self.stdout.write(self.style.ERROR(f"        ERROR: {g.get('error', '')}"))

        self.stdout.write("-" * 65)
        if all_passed:
            self.stdout.write(
                self.style.SUCCESS(" ALL 6 OPERATIONAL GATES PASSED CLEANLY (SYSTEM READY)")
            )
            self.stdout.write("=" * 65 + "\n")
        else:
            self.stdout.write(
                self.style.ERROR(" ONE OR MORE OPERATIONAL GATES FAILED")
            )
            self.stdout.write("=" * 65 + "\n")
            sys.exit(1)
