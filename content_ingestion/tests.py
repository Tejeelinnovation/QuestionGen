"""
Tests for content_ingestion app.
"""

import hashlib
import hmac
import io
import json
import time
import pymupdf as fitz
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from schools.models import School
from .extractors.digital_parser import DigitalPdfExtractor
from .models import (
    DocumentKind,
    ExtractedItem,
    ExtractedPage,
    GranularityDetected,
    IngestionJob,
    ItemType,
    JobStatus,
)
from .services import IngestionService
from .toc_detector import TocDetector

User = get_user_model()


def create_sample_test_pdf() -> bytes:
    """
    Synthesizes a realistic 3-page test PDF in memory with:
    - Page 1: Table of contents (Contents ... 1. Real Numbers .. 2, 2. Polynomials .. 3)
    - Page 2: Two-column layout with Activity, Formula, and Solved Example
    - Page 3: Summary and exercises
    """
    doc = fitz.open()

    # Page 1: TOC
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text(
        fitz.Point(50, 80),
        "TABLE OF CONTENTS\n\n"
        "Chapter 1. Real Numbers .......... 2\n"
        "Chapter 2. Polynomials .......... 3\n",
        fontsize=14,
    )

    # Page 2: Two Column Content
    p2 = doc.new_page(width=595, height=842)
    # Header banner (full width)
    p2.insert_text(fitz.Point(50, 60), "CHAPTER 1: REAL NUMBERS", fontsize=16)

    # Left Column (x=50 to x=250)
    p2.insert_textbox(
        fitz.Rect(50, 100, 270, 300),
        "Activity 1.1\nTake two positive integers a and b. We observe that a = bq + r.\n"
        "This is known as Euclid's Division Lemma.",
        fontsize=11,
    )
    p2.insert_textbox(
        fitz.Rect(50, 320, 270, 500),
        "Formula 1.1:\na = bq + r, 0 <= r < b\nHere q is the quotient and r is the remainder.",
        fontsize=11,
    )

    # Right Column (x=310 to x=540)
    p2.insert_textbox(
        fitz.Rect(310, 100, 540, 300),
        "Example 1.2:\nShow that any positive odd integer is of the form 4q + 1.\n"
        "Solution: Let a be any odd positive integer.",
        fontsize=11,
    )
    p2.insert_textbox(
        fitz.Rect(310, 320, 540, 500),
        "Exercise 1.1:\n1. Use Euclid's algorithm to find the HCF of 135 and 225.\n"
        "2. Show that the square of any positive integer is either of the form 3m or 3m + 1.",
        fontsize=11,
    )

    # Page 3: Chapter 2
    p3 = doc.new_page(width=595, height=842)
    p3.insert_text(fitz.Point(50, 60), "CHAPTER 2: POLYNOMIALS", fontsize=16)
    p3.insert_textbox(
        fitz.Rect(50, 100, 540, 300),
        "Summary:\nA polynomial p(x) of degree n has at most n real zeroes.\n"
        "If alpha and beta are the zeroes of quadratic polynomial ax^2 + bx + c, then sum is -b/a.",
        fontsize=11,
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class TocDetectorTests(TestCase):
    def test_detects_table_of_contents_and_granularity(self):
        pdf_bytes = create_sample_test_pdf()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        detector = TocDetector()
        granularity, toc_list = detector.analyze_document(doc)

        self.assertIn(granularity, ["WHOLE_BOOK", "CHAPTER"])
        self.assertTrue(len(toc_list) >= 1)
        doc.close()


class DigitalParserTests(TestCase):
    def test_multi_column_and_block_classification(self):
        pdf_bytes = create_sample_test_pdf()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        extractor = DigitalPdfExtractor()
        page2_data = extractor.extract_page(doc, page_number=2)

        self.assertIn(page2_data["layout_type"], ["TWO_COLUMN", "HYBRID_COLUMN"])
        sections = page2_data["sections"]
        self.assertTrue(len(sections) >= 3)

        section_types = [s["type"] for s in sections]
        self.assertIn("ACTIVITY", section_types)
        self.assertIn("SOLVED_EXAMPLE", section_types)
        self.assertIn("EXERCISE_QUESTION", section_types)

        doc.close()


class IngestionServiceTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Greenwood High")
        self.user = User.objects.create_user(username="teacher_ingest", password="password123", school=self.school)

    def test_service_lifecycle_chunk_by_chunk(self):
        pdf_bytes = create_sample_test_pdf()
        sample_file = SimpleUploadedFile("math_class10.pdf", pdf_bytes, content_type="application/pdf")

        job = IngestionJob.objects.create(
            uploaded_by=self.user,
            school=self.school,
            title="Class 10 Math Ingestion",
            subject="Mathematics",
            standard=10,
            board="NCERT",
            document_kind=DocumentKind.TEXTBOOK,
            source_file=sample_file,
        )

        service = IngestionService()
        service.initialize_job(job)
        job.refresh_from_db()

        self.assertEqual(job.total_pages, 3)
        self.assertEqual(job.processed_pages, 0)
        self.assertEqual(job.status, JobStatus.PENDING)

        # Process first chunk of 2 pages
        chunk1 = service.process_chunk(job, chunk_size=2)
        job.refresh_from_db()
        self.assertEqual(job.processed_pages, 2)
        self.assertFalse(chunk1["is_finished"])

        # Process final chunk
        chunk2 = service.process_chunk(job, chunk_size=2)
        job.refresh_from_db()
        self.assertEqual(job.processed_pages, 3)
        self.assertEqual(job.status, JobStatus.COMPLETED)
        self.assertTrue(chunk2["is_finished"])

        # Verify pages & items exist
        self.assertEqual(job.pages.count(), 3)
        self.assertTrue(job.items.count() > 0)


class IngestionApiTests(TestCase):
    def setUp(self):
        from users.models import Capability, CapabilityName, UserCapability

        self.school = School.objects.create(name="Greenwood High")

        # 1. Contributor (Teacher with UPLOAD_STUDY_MATERIAL capability)
        self.contributor = User.objects.create_user(username="contributor_teacher", password="password123", school=self.school)
        upload_cap, _ = Capability.objects.get_or_create(name=CapabilityName.UPLOAD_STUDY_MATERIAL)
        UserCapability.objects.create(user=self.contributor, capability=upload_cap)

        # 2. Unauthorized User (Student without capability)
        self.unauthorized_user = User.objects.create_user(username="unauth_student", password="password123", school=self.school)

        # 3. Super Admin
        self.superadmin = User.objects.create_user(username="super_admin_user", password="password123", school=None)
        super_cap, _ = Capability.objects.get_or_create(name=CapabilityName.CREATE_SCHOOL)
        UserCapability.objects.create(user=self.superadmin, capability=super_cap)

        self.client = APIClient()

    def test_permission_and_privacy_separation(self):
        pdf_bytes = create_sample_test_pdf()

        # A. Unauthorized user is blocked from uploading
        self.client.force_authenticate(user=self.unauthorized_user)
        uploaded_file = SimpleUploadedFile("test_book.pdf", pdf_bytes, content_type="application/pdf")
        res_unauth = self.client.post("/api/ingest/jobs/", {"title": "Test", "source_file": uploaded_file}, format="multipart")
        self.assertEqual(res_unauth.status_code, status.HTTP_403_FORBIDDEN)

        # B. Authorized contributor can upload
        self.client.force_authenticate(user=self.contributor)
        uploaded_file2 = SimpleUploadedFile("test_book.pdf", pdf_bytes, content_type="application/pdf")
        res_upload = self.client.post(
            "/api/ingest/jobs/",
            {
                "title": "Contributor Book",
                "subject": "Mathematics",
                "standard": 10,
                "board": "NCERT",
                "document_kind": "TEXTBOOK",
                "source_file": uploaded_file2,
            },
            format="multipart",
        )
        self.assertEqual(res_upload.status_code, status.HTTP_201_CREATED)
        job_id = res_upload.data["id"]

        # C. Contributor CANNOT export JSON or inspect internal training dataset
        res_export_forbidden = self.client.get(f"/api/ingest/jobs/{job_id}/export-json/")
        self.assertEqual(res_export_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        res_chunk_forbidden = self.client.post(f"/api/ingest/jobs/{job_id}/process-chunk/", {"chunk_size": 5}, format="json")
        self.assertEqual(res_chunk_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # D. Super Admin CAN process chunks and export JSON
        self.client.force_authenticate(user=self.superadmin)
        res_chunk = self.client.post(f"/api/ingest/jobs/{job_id}/process-chunk/", {"chunk_size": 5}, format="json")
        self.assertEqual(res_chunk.status_code, status.HTTP_200_OK)

        res_export = self.client.get(f"/api/ingest/jobs/{job_id}/export-json/")
        self.assertEqual(res_export.status_code, status.HTTP_200_OK)
        self.assertIn("content_tree", res_export.data)
        self.assertEqual(len(res_export.data["content_tree"]), 3)


class TaskQueueTests(TestCase):
    def setUp(self):
        from users.models import Capability, CapabilityName, UserCapability
        self.school = School.objects.create(name="Greenwood High")
        self.superadmin = User.objects.create_user(username="super_admin_queue", password="password123")
        super_cap, _ = Capability.objects.get_or_create(name=CapabilityName.CREATE_SCHOOL)
        UserCapability.objects.create(user=self.superadmin, capability=super_cap)
        self.client = APIClient()
        self.client.force_authenticate(user=self.superadmin)

    def test_queue_position_and_enqueue_endpoints(self):
        from content_ingestion.queue import get_job_queue_position

        job1 = IngestionJob.objects.create(
            title="Book 1",
            school=self.school,
            uploaded_by=self.superadmin,
            status=JobStatus.PENDING,
            total_pages=5,
        )
        job2 = IngestionJob.objects.create(
            title="Book 2",
            school=self.school,
            uploaded_by=self.superadmin,
            status=JobStatus.PENDING,
            total_pages=10,
        )

        # Job 1 is first in queue, Job 2 is second
        self.assertEqual(get_job_queue_position(job1), 1)
        self.assertEqual(get_job_queue_position(job2), 2)

        # When Job 1 transitions to EXTRACTING, its position becomes 0 (active)
        job1.status = JobStatus.EXTRACTING
        job1.save()
        self.assertEqual(get_job_queue_position(job1), 0)
        # Job 2 is now next in line (position 2 because 1 job is extracting)
        self.assertEqual(get_job_queue_position(job2), 2)

        # Test enqueue endpoint
        res_enqueue = self.client.post(f"/api/ingest/jobs/{job2.pk}/enqueue/")
        self.assertEqual(res_enqueue.status_code, status.HTTP_200_OK)
        self.assertIn("queue_position", res_enqueue.data)

        # Test bulk enqueue-all endpoint
        res_bulk = self.client.post("/api/ingest/jobs/enqueue-all/")
        self.assertEqual(res_bulk.status_code, status.HTTP_200_OK)
        self.assertIn("enqueued_count", res_bulk.data)


class WebhookSecurityAndIdempotencyTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name="Greenwood High")
        self.user = User.objects.create_user(username="webhook_test_user", password="password123", school=self.school)
        self.job = IngestionJob.objects.create(
            title="Webhook Test Document",
            school=self.school,
            uploaded_by=self.user,
            status=JobStatus.PENDING,
            total_pages=2,
        )
        self.secret = "test_webhook_secret_key_12345"
        self.client = APIClient()

    def _sign(self, body_bytes: bytes, timestamp: int, secret: str = None) -> str:
        s = secret or self.secret
        to_sign = f"{timestamp}.".encode("utf-8") + body_bytes
        return hmac.new(s.encode("utf-8"), to_sign, hashlib.sha256).hexdigest()

    def _make_sample_payload(self, num_pages: int = 2, idempotency_key: str = "idemp_test_1") -> dict:
        pages = []
        for p in range(1, num_pages + 1):
            pages.append({
                "page_number": p,
                "layout_type": "SINGLE_COLUMN",
                "raw_text": f"Sample page {p} content",
                "chapter_number": 1,
                "sections": [
                    {
                        "type": "PARAGRAPH",
                        "heading": f"Section {p}.1",
                        "text": f"Paragraph content for page {p}",
                        "column_index": 0,
                    }
                ],
            })
        return {
            "job_id": self.job.pk,
            "idempotency_key": idempotency_key,
            "status": "COMPLETED",
            "granularity": "SINGLE_CHAPTER",
            "chapters": [
                {
                    "chapter_number": 1,
                    "title": "Chapter 1: Intro",
                    "start_page": 1,
                    "end_page": num_pages,
                }
            ],
            "pages": pages,
            "total_pages": num_pages,
            "engine": "Docling AI (DocLayNet)",
        }

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_rejects_missing_signature(self):
        payload = self._make_sample_payload()
        raw = json.dumps(payload).encode("utf-8")
        now_ts = int(time.time())
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Missing X-Ingestion-Signature", res.data["detail"])

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_rejects_missing_timestamp(self):
        payload = self._make_sample_payload()
        raw = json.dumps(payload).encode("utf-8")
        now_ts = int(time.time())
        sig = self._sign(raw, now_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            # Omit HTTP_X_INGESTION_TIMESTAMP
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Missing X-Ingestion-Timestamp", res.data["detail"])

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_rejects_expired_timestamp_older_than_10_minutes(self):
        payload = self._make_sample_payload()
        raw = json.dumps(payload).encode("utf-8")
        # 11 minutes ago = 660 seconds old
        expired_ts = int(time.time()) - 660
        sig = self._sign(raw, expired_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(expired_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("expired", res.data["detail"])

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_rejects_raw_secret_header_without_hmac(self):
        payload = self._make_sample_payload()
        raw = json.dumps(payload).encode("utf-8")
        # Attacker tries sending the raw secret in header without computing HMAC signature
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SECRET=self.secret,
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Missing X-Ingestion-Signature", res.data["detail"])

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_rejects_invalid_or_tampered_signature(self):
        payload = self._make_sample_payload()
        raw = json.dumps(payload).encode("utf-8")
        now_ts = int(time.time())
        bad_sig = "sha256=" + "0" * 64
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=bad_sig,
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Invalid HMAC signature", res.data["detail"])

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_accepts_valid_signature_and_populates_data(self):
        payload = self._make_sample_payload(num_pages=2, idempotency_key="run_001")
        raw = json.dumps(payload).encode("utf-8")
        now_ts = int(time.time())
        sig = self._sign(raw, now_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
            HTTP_X_IDEMPOTENCY_KEY="run_001",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertFalse(res.data["idempotent_replay"])

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, JobStatus.COMPLETED)
        self.assertEqual(self.job.chapters.count(), 1)
        self.assertEqual(self.job.pages.count(), 2)
        self.assertEqual(self.job.items.count(), 2)
        self.assertEqual(self.job.metadata.get("idempotency_key"), "run_001")

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_idempotency_key_avoids_reprocessing(self):
        payload = self._make_sample_payload(num_pages=2, idempotency_key="idemp_identical_01")
        raw = json.dumps(payload).encode("utf-8")
        now_ts = int(time.time())
        sig = self._sign(raw, now_ts)

        # First request: should process
        res1 = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
            HTTP_X_IDEMPOTENCY_KEY="idemp_identical_01",
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertFalse(res1.data["idempotent_replay"])

        self.job.refresh_from_db()
        self.assertEqual(self.job.pages.count(), 2)
        self.assertEqual(self.job.items.count(), 2)

        # Duplicate request with same key: should be detected as idempotent replay
        res2 = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
            HTTP_X_IDEMPOTENCY_KEY="idemp_identical_01",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data["idempotent_replay"])

        # Database rows should be completely untouched
        self.job.refresh_from_db()
        self.assertEqual(self.job.pages.count(), 2)
        self.assertEqual(self.job.items.count(), 2)

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_safe_retry_with_new_key_replaces_cleanly(self):
        # 1. Initial extraction with 2 pages
        payload1 = self._make_sample_payload(num_pages=2, idempotency_key="run_initial")
        raw1 = json.dumps(payload1).encode("utf-8")
        now_ts1 = int(time.time())
        sig1 = self._sign(raw1, now_ts1)
        self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw1,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig1}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts1),
            HTTP_X_IDEMPOTENCY_KEY="run_initial",
        )
        self.job.refresh_from_db()
        self.assertEqual(self.job.pages.count(), 2)

        # 2. Retry with a new key and 3 pages (e.g. cloud runner re-ran and extracted more pages)
        payload2 = self._make_sample_payload(num_pages=3, idempotency_key="run_retry_updated")
        raw2 = json.dumps(payload2).encode("utf-8")
        now_ts2 = int(time.time())
        sig2 = self._sign(raw2, now_ts2)
        res2 = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw2,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig2}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts2),
            HTTP_X_IDEMPOTENCY_KEY="run_retry_updated",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertFalse(res2.data["idempotent_replay"])

        # Replaced cleanly: now 3 pages and 3 items without orphans
        self.job.refresh_from_db()
        self.assertEqual(self.job.pages.count(), 3)
        self.assertEqual(self.job.items.count(), 3)
        self.assertEqual(self.job.metadata.get("idempotency_key"), "run_retry_updated")

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_progress_heartbeat_signed(self):
        progress_payload = {
            "job_id": self.job.pk,
            "status": "PROGRESS",
            "processed_pages": 1,
            "total_pages": 4,
            "current_stage": "Extracting page 1...",
        }
        raw = json.dumps(progress_payload).encode("utf-8")
        now_ts = int(time.time())
        sig = self._sign(raw, now_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PROGRESS_UPDATED")
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, JobStatus.EXTRACTING)
        self.assertEqual(self.job.processed_pages, 1)
        self.assertEqual(self.job.total_pages, 4)

    @override_settings(INGESTION_WEBHOOK_SECRET="test_webhook_secret_key_12345", DEBUG=False)
    def test_webhook_failed_status_signed(self):
        failed_payload = {
            "job_id": self.job.pk,
            "status": "FAILED",
            "error_message": "Worker ran out of disk space.",
        }
        raw = json.dumps(failed_payload).encode("utf-8")
        now_ts = int(time.time())
        sig = self._sign(raw, now_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{self.job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "ERROR_RECORDED")
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, JobStatus.FAILED)
        self.assertIn("out of disk space", self.job.error_message)


class Phase1DocumentIngestionTests(TestCase):
    """
    Tests for Phase 1 additions:
    - Nullable board/standard/subject/document_kind
    - Removal of placeholder TOC generators (Main Chapter / Extracted Document)
    - Teacher-provided metadata overrides inference
    - Low-confidence probe-error fallback to UNKNOWN (never TEXTBOOK)
    - Newspaper multi-modal classification and non-educational tolerance
    """

    def setUp(self):
        self.school = School.objects.create(name="Delhi Public School")
        self.user = User.objects.create_user(
            username="teacher_phase1", password="password123", school=self.school, is_superuser=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.secret = "test_phase1_secret_98765"

    def _sign(self, raw_bytes: bytes, timestamp: int) -> str:
        to_sign = f"{timestamp}.".encode("utf-8") + raw_bytes
        return hmac.new(self.secret.encode("utf-8"), to_sign, hashlib.sha256).hexdigest()

    def test_nullable_fields_default_to_none_when_omitted(self):
        job = IngestionJob.objects.create(title="Unspecified Document", school=self.school)
        self.assertIsNone(job.board)
        self.assertIsNone(job.standard)
        self.assertIsNone(job.subject)
        self.assertIsNone(job.document_kind)
        self.assertIsNone(job.classification_confidence)
        self.assertEqual(job.classification_evidence, "")

    def test_no_toc_found_returns_empty_and_unknown_granularity(self):
        """Multi-page document without TOC must NOT fabricate a 'Main Chapter' entry."""
        doc = fitz.open()
        for i in range(16):
            p = doc.new_page(width=595, height=842)
            p.insert_text(fitz.Point(50, 100), f"Generic report content on page {i+1} without chapter markers.")

        detector = TocDetector()
        granularity, toc_list = detector.analyze_document(doc)
        doc.close()

        self.assertEqual(granularity, GranularityDetected.UNKNOWN)
        self.assertEqual(toc_list, [])

    def test_teacher_metadata_override_in_classifier(self):
        from .document_classifier import classify_document

        # Even on an empty/arbitrary file, teacher's explicit document_kind overrides inference
        res = classify_document("nonexistent_path.pdf", user_document_kind="WORKSHEET_OR_EXAM")
        self.assertEqual(res.kind, "WORKSHEET_OR_EXAM")
        self.assertEqual(res.confidence, 1.0)
        self.assertIn("Teacher specified", res.evidence)

    def test_probe_error_fallback_returns_unknown_low_confidence(self):
        from .document_classifier import classify_document

        # On error/missing file without user override, returns UNKNOWN with low confidence, NOT TEXTBOOK
        res = classify_document("completely_missing_file_404.pdf")
        self.assertEqual(res.kind, "UNKNOWN")
        self.assertLessEqual(res.confidence, 0.20)
        self.assertNotIn("TEXTBOOK", res.kind)

    @override_settings(INGESTION_WEBHOOK_SECRET="test_phase1_secret_98765", DEBUG=False)
    def test_webhook_preserves_teacher_metadata_override(self):
        # Teacher specified NOTES on upload
        job = IngestionJob.objects.create(
            title="Class Notes",
            document_kind=DocumentKind.NOTES,
            school=self.school,
        )
        now_ts = int(time.time())
        # Microservice payload sends inferred document_kind=TEXTBOOK
        payload = {
            "job_id": job.pk,
            "status": "COMPLETED",
            "document_kind": "TEXTBOOK",
            "classification_confidence": 0.85,
            "classification_evidence": "Inferred from printed layout",
            "table_of_contents": [],
            "pages": [],
        }
        raw = json.dumps(payload).encode("utf-8")
        sig = self._sign(raw, now_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        # Teacher choice preserved!
        self.assertEqual(job.document_kind, DocumentKind.NOTES)
        self.assertIn(job.table_of_contents, (None, []))
        self.assertEqual(job.chapters.count(), 0)

    @override_settings(INGESTION_WEBHOOK_SECRET="test_phase1_secret_98765", DEBUG=False)
    def test_webhook_non_educational_document_warning_does_not_block(self):
        job = IngestionJob.objects.create(title="Daily Paper", school=self.school)
        now_ts = int(time.time())
        payload = {
            "job_id": job.pk,
            "status": "COMPLETED",
            "document_kind": "NEWSPAPER",
            "classification_confidence": 0.98,
            "classification_evidence": "Masthead match; Broadsheet dimensions",
            "table_of_contents": [],
            "pages": [],
        }
        raw = json.dumps(payload).encode("utf-8")
        sig = self._sign(raw, now_ts)
        res = self.client.post(
            f"/api/ingest/jobs/{job.pk}/webhook/",
            data=raw,
            content_type="application/json",
            HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            HTTP_X_INGESTION_TIMESTAMP=str(now_ts),
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        job.refresh_from_db()
        self.assertEqual(job.status, JobStatus.COMPLETED)
        self.assertEqual(job.document_kind, "NEWSPAPER")
        self.assertEqual(job.classification_confidence, 0.98)
        self.assertIn("Masthead match", job.classification_evidence)
        self.assertFalse(job.is_educational)

    def test_newspaper_classification_on_real_pdf_if_available(self):
        import os
        from .document_classifier import classify_document

        toi_path = r"D:\PDFS_For the Testing\NewsPaper\Times of India_TOIDelhiBS-Delhi_20261001.pdf"
        if os.path.exists(toi_path):
            res = classify_document(toi_path)
            self.assertEqual(res.kind, "NEWSPAPER")
            self.assertGreaterEqual(res.confidence, 0.90)
            self.assertIn("times of india", res.evidence.lower())
            self.assertIn("broadsheet", res.evidence.lower())

            doc = fitz.open(toi_path)
            detector = TocDetector()
            granularity, toc_list = detector.analyze_document(doc)
            doc.close()
            # Must NOT fabricate TOC
            self.assertEqual(toc_list, [])


class NullMetadataAndFilteringTests(APITestCase):
    """
    Tests ensuring null board/standard/subject/document_kind:
    1. Does not break creation or serializer coercion (accepts null, 'null', '', 'AUTO')
    2. Does not break list, detail, or search/filter views
    3. Does not break question generation and content filtering
    """

    def setUp(self):
        from users.models import Capability, CapabilityName, UserCapability

        self.school = School.objects.create(name="Delhi Public School")
        self.user = User.objects.create_user(
            username="teacher_null_meta",
            email="teacher@dps.edu",
            password="secretpassword",
            school=self.school,
        )
        upload_cap, _ = Capability.objects.get_or_create(name=CapabilityName.UPLOAD_STUDY_MATERIAL)
        UserCapability.objects.create(user=self.user, capability=upload_cap)

        self.admin = User.objects.create_user(
            username="admin_null_meta",
            email="admin@dps.edu",
            password="adminpassword",
            school=None,
        )
        super_cap, _ = Capability.objects.get_or_create(name=CapabilityName.CREATE_SCHOOL)
        UserCapability.objects.create(user=self.admin, capability=super_cap)

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_create_job_with_explicit_null_json(self):
        from .serializers import IngestionJobCreateSerializer

        dummy_file = SimpleUploadedFile("sample.pdf", b"%PDF-1.4 dummy", content_type="application/pdf")
        data = {
            "title": "Unspecified Material",
            "standard": None,
            "board": None,
            "subject": None,
            "document_kind": None,
            "source_file": dummy_file,
        }
        serializer = IngestionJobCreateSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        job = serializer.save(uploaded_by=self.user, school=self.school)
        self.assertIsNone(job.standard)
        self.assertIsNone(job.board)
        self.assertIsNone(job.subject)
        self.assertIsNone(job.document_kind)

    def test_create_job_with_string_null_and_empty_and_auto(self):
        """
        Simulate multipart/form-data where nulls might arrive as 'null', '', or 'AUTO'.
        """
        from .serializers import IngestionJobCreateSerializer

        dummy_file = SimpleUploadedFile("sample2.pdf", b"%PDF-1.4 dummy", content_type="application/pdf")
        data = {
            "title": "FormData Material",
            "standard": "null",
            "board": "",
            "subject": "None",
            "document_kind": "AUTO",
            "source_file": dummy_file,
        }
        serializer = IngestionJobCreateSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        job = serializer.save(uploaded_by=self.user, school=self.school)
        self.assertIsNone(job.standard)
        self.assertIsNone(job.board)
        self.assertIsNone(job.subject)
        self.assertIsNone(job.document_kind)

    def test_list_and_detail_views_serialize_null_metadata_safely(self):
        job = IngestionJob.objects.create(
            title="Null Meta Book",
            board=None,
            standard=None,
            subject=None,
            document_kind=None,
            uploaded_by=self.user,
            school=self.school,
        )
        res = self.client.get("/api/ingest/jobs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        found = [j for j in res.data if j["id"] == job.id][0]
        self.assertIsNone(found["standard"])
        self.assertIsNone(found["board"])
        self.assertIsNone(found["subject"])
        self.assertIsNone(found["document_kind"])

        detail_res = self.client.get(f"/api/ingest/jobs/{job.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertIsNone(detail_res.data["standard"])
        self.assertIsNone(detail_res.data["board"])

    def test_filter_jobs_by_null_and_exact_values(self):
        job_null = IngestionJob.objects.create(
            title="Null Job",
            board=None,
            standard=None,
            uploaded_by=self.user,
            school=self.school,
        )
        job_cbse_10 = IngestionJob.objects.create(
            title="Class 10 CBSE Math",
            board="CBSE",
            standard=10,
            uploaded_by=self.user,
            school=self.school,
        )

        # Filter by null standard
        res_null_std = self.client.get("/api/ingest/jobs/?standard=null")
        self.assertEqual(res_null_std.status_code, status.HTTP_200_OK)
        ids = [j["id"] for j in res_null_std.data]
        self.assertIn(job_null.id, ids)
        self.assertNotIn(job_cbse_10.id, ids)

        # Filter by standard 10
        res_std_10 = self.client.get("/api/ingest/jobs/?standard=10")
        self.assertEqual(res_std_10.status_code, status.HTTP_200_OK)
        ids = [j["id"] for j in res_std_10.data]
        self.assertIn(job_cbse_10.id, ids)
        self.assertNotIn(job_null.id, ids)

        # Filter by null board
        res_null_board = self.client.get("/api/ingest/jobs/?board=null")
        self.assertEqual(res_null_board.status_code, status.HTTP_200_OK)
        ids = [j["id"] for j in res_null_board.data]
        self.assertIn(job_null.id, ids)
        self.assertNotIn(job_cbse_10.id, ids)

    def test_question_generation_and_filtering_with_null_metadata(self):
        """
        Verify that question filtering and seeded bank generation do not crash
        when board, standard, subject, or constraints contain null/None.
        """
        from content.filters import filter_questions
        from content.models import Book, Chapter, Topic, Question
        from generation.services.seeded_bank import SeededBankGenerationService

        book = Book.objects.create(
            title="General Reference",
            subject="General",
            grade="Class 10",
            board="CBSE",
        )
        chapter = Chapter.objects.create(book=book, title="Chapter 1", chapter_order=1)
        topic = Topic.objects.create(chapter=chapter, name="Topic 1")
        q = Question.objects.create(
            topic=topic,
            question_text="What is a test question?",
            question_type="SHORT_ANSWER",
            difficulty="MEDIUM",
            learner_level="INTERMEDIATE",
            marks=2.0,
            is_active=True,
        )

        # Filter questions with null / None / empty params
        qs = Question.objects.filter(id=q.id)
        filtered = filter_questions(qs, {
            "board": None,
            "topic_id": None,
            "difficulty": None,
            "search": None,
            "marks": None,
        })
        self.assertEqual(filtered.count(), 1)

        # Question generation service with null values in constraints
        service = SeededBankGenerationService()
        drafts = service.generate_questions(
            chapter=chapter.id,
            constraints={
                "difficulty": None,
                "question_type": None,
                "learner_level": None,
                "marks": None,
                "school": None,
                "validation_workflow_enabled": None,
            },
        )
        self.assertGreaterEqual(len(drafts), 1)
        self.assertEqual(drafts[0].question_text, "What is a test question?")


class GeminiCacheAndBatchReliabilityTests(APITestCase):
    """
    Tests for Phase 8 Neon Database Gemini result caching and
    Phase 9 batch page checkpointing and resumption.
    """

    def setUp(self):
        self.client = APIClient()
        self.school = School.objects.create(name="Cache Test School")
        self.user = User.objects.create_user(
            username="cacheteacher",
            email="cacheteacher@school.org",
            password="testpassword",
            school=self.school,
            role="CONTRIBUTOR",
        )
        self.job = IngestionJob.objects.create(
            uploaded_by=self.user,
            school=self.school,
            title="Batch Reliability Book",
            status=JobStatus.PENDING,
            total_pages=20,
            processed_pages=0,
        )

    def test_gemini_cache_endpoint(self):
        """Tests GET and POST /api/ingest/cache/gemini/."""
        cache_key = "test_neon_cache_key_999"

        # Initially 404
        get_res = self.client.get(f"/api/ingest/cache/gemini/?key={cache_key}")
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

        # Store cache entry
        post_data = {
            "cache_key": cache_key,
            "file_hash": "hash_123",
            "page_number": 5,
            "prompt_version": "v1",
            "response_data": {"extracted_notes": "Sample physics notes"},
        }
        post_res = self.client.post("/api/ingest/cache/gemini/", data=post_data, format="json")
        self.assertEqual(post_res.status_code, status.HTTP_200_OK)
        self.assertEqual(post_res.data.get("status"), "CACHED")

        # Now GET returns cached entry
        get_res2 = self.client.get(f"/api/ingest/cache/gemini/?key={cache_key}")
        self.assertEqual(get_res2.status_code, status.HTTP_200_OK)
        self.assertTrue(get_res2.data.get("found"))
        self.assertEqual(get_res2.data.get("response_data"), {"extracted_notes": "Sample physics notes"})

    @override_settings(INGESTION_WEBHOOK_SECRET="test_batch_secret_123", DEBUG=False)
    def test_batch_pages_checkpointing_and_resumption(self):
        """Tests sending intermediate BATCH_PAGES and retrieving GET_RESUME_STATE."""
        secret = "test_batch_secret_123"

        def _make_signed_post(url, payload):
            raw_bytes = json.dumps(payload).encode("utf-8")
            ts = int(time.time())
            sig = hmac.new(secret.encode("utf-8"), f"{ts}.".encode("utf-8") + raw_bytes, hashlib.sha256).hexdigest()
            return self.client.post(
                url,
                data=raw_bytes,
                content_type="application/json",
                HTTP_X_INGESTION_TIMESTAMP=str(ts),
                HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            )

        # 1. Send batch for pages 1 to 3
        batch_payload = {
            "status": "BATCH_PAGES",
            "total_pages": 20,
            "pages": [
                {"page_number": 1, "raw_text": "Page 1 intro", "sections": [{"type": "PARAGRAPH", "text": "Intro text"}]},
                {"page_number": 2, "raw_text": "Page 2 content", "sections": [{"type": "DEFINITION", "text": "Newton law"}]},
                {"page_number": 3, "raw_text": "Page 3 exercises", "sections": [{"type": "EXERCISE_QUESTION", "text": "Solve for x"}]},
            ],
        }
        res = _make_signed_post(f"/api/ingest/jobs/{self.job.pk}/webhook/", batch_payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("status"), "BATCH_SAVED")
        self.assertEqual(res.data.get("stored_pages"), [1, 2, 3])

        # Verify pages exist in database
        self.job.refresh_from_db()
        self.assertEqual(self.job.pages.count(), 3)
        self.assertEqual(self.job.processed_pages, 3)

        # 2. Check resume state
        resume_res = _make_signed_post(f"/api/ingest/jobs/{self.job.pk}/webhook/", {"status": "GET_RESUME_STATE"})
        self.assertEqual(resume_res.status_code, status.HTTP_200_OK)
        self.assertEqual(resume_res.data.get("stored_pages"), [1, 2, 3])
        self.assertEqual(resume_res.data.get("processed_pages"), 3)

    @override_settings(INGESTION_WEBHOOK_SECRET="test_crash_resume_secret_456", DEBUG=False)
    def test_job_killed_halfway_resumes_without_redoing_stored_pages(self):
        """
        Item 8: Demonstrates a job killed halfway (after 5 of 10 pages)
        and resumed by a new worker which fetches stored_pages and only processes pages 6-10.
        """
        secret = "test_crash_resume_secret_456"

        def _make_signed_post(url, payload):
            raw_bytes = json.dumps(payload).encode("utf-8")
            ts = int(time.time())
            sig = hmac.new(secret.encode("utf-8"), f"{ts}.".encode("utf-8") + raw_bytes, hashlib.sha256).hexdigest()
            return self.client.post(
                url,
                data=raw_bytes,
                content_type="application/json",
                HTTP_X_INGESTION_TIMESTAMP=str(ts),
                HTTP_X_INGESTION_SIGNATURE=f"sha256={sig}",
            )

        # Worker 1 starts: processes pages 1 to 5, saves batch, then dies (killed)
        worker1_pages = [{"page_number": p, "raw_text": f"Text on page {p}", "sections": []} for p in range(1, 6)]
        res1 = _make_signed_post(f"/api/ingest/jobs/{self.job.pk}/webhook/", {
            "status": "BATCH_PAGES",
            "total_pages": 10,
            "pages": worker1_pages,
        })
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data.get("stored_pages"), [1, 2, 3, 4, 5])

        # Simulate Worker 1 crashing: database has 5 pages saved, job is EXTRACTING
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "EXTRACTING")
        self.assertEqual(self.job.processed_pages, 5)
        self.assertEqual(set(self.job.pages.values_list("page_number", flat=True)), {1, 2, 3, 4, 5})

        # Worker 2 spawns: queries GET_RESUME_STATE before doing any work
        resume_res = _make_signed_post(f"/api/ingest/jobs/{self.job.pk}/webhook/", {"status": "GET_RESUME_STATE"})
        self.assertEqual(resume_res.status_code, status.HTTP_200_OK)
        already_stored = set(resume_res.data.get("stored_pages", []))
        self.assertEqual(already_stored, {1, 2, 3, 4, 5})

        # Worker 2 computes remaining pages: only 6 to 10
        total_pages = 10
        remaining_pages = [p for p in range(1, total_pages + 1) if p not in already_stored]
        self.assertEqual(remaining_pages, [6, 7, 8, 9, 10])

        # Worker 2 extracts only remaining pages and streams batch
        worker2_pages = [{"page_number": p, "raw_text": f"Text on page {p}", "sections": []} for p in remaining_pages]
        res2 = _make_signed_post(f"/api/ingest/jobs/{self.job.pk}/webhook/", {
            "status": "BATCH_PAGES",
            "total_pages": 10,
            "pages": worker2_pages,
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data.get("stored_pages"), list(range(1, 11)))

        # Worker 2 completes job
        complete_res = _make_signed_post(f"/api/ingest/jobs/{self.job.pk}/webhook/", {
            "status": "COMPLETED",
            "total_pages": 10,
            "processed_pages": 10,
            "document_kind": "SINGLE_CHAPTER",
        })
        self.assertEqual(complete_res.status_code, status.HTTP_200_OK)

        self.job.refresh_from_db()
        self.assertEqual(self.job.status, "COMPLETED")
        self.assertEqual(self.job.processed_pages, 10)
        self.assertEqual(self.job.pages.count(), 10)

    def test_webhook_retry_after_simulated_60s_backend_sleep(self):
        """
        Item 8: Tests worker webhook retry loop surviving Render free-tier cold starts
        (e.g., connection timeouts or 503 sleeping instances for ~60s before waking).
        """
        from unittest.mock import patch, MagicMock
        from document_ai_worker.cli_extractor import send_webhook
        import requests

        attempt_count = 0

        def simulated_render_cold_start(*args, **kwargs):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count < 4:
                # First 3 attempts fail while Render instance is spinning up (~60s sleep)
                mock_resp = MagicMock()
                mock_resp.status_code = 503
                mock_resp.text = "Service Unavailable - Instance waking up"
                mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_resp)
                return mock_resp
            # 4th attempt: backend is awake and returns success
            success_resp = MagicMock()
            success_resp.status_code = 200
            success_resp.json.return_value = {"status": "BATCH_SAVED", "stored_pages": [1, 2, 3]}
            success_resp.text = '{"status": "BATCH_SAVED"}'
            return success_resp

        # Patch requests.post and sleep (to avoid delaying unit test suite)
        with patch("requests.post", side_effect=simulated_render_cold_start) as mock_post, \
             patch("time.sleep", return_value=None) as mock_sleep:
            res = send_webhook(
                callback_url="https://questiongen-staging.onrender.com/api/ingest/jobs/99/webhook/",
                secret="secret_abc",
                payload={"status": "BATCH_PAGES", "pages": [{"page_number": 1}]},
                retries=6,
            )
            self.assertTrue(res)
            self.assertEqual(attempt_count, 4)
            self.assertEqual(mock_sleep.call_count, 3)
            # Confirm progressive backoff was called
            delays = [call[0][0] for call in mock_sleep.call_args_list]
            self.assertEqual(delays, [5, 10, 15])



