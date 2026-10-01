"""
Tests for content_ingestion app.
"""

import io
import pymupdf as fitz
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from schools.models import School
from .extractors.digital_parser import DigitalPdfExtractor
from .models import DocumentKind, ExtractedItem, ExtractedPage, IngestionJob, ItemType, JobStatus
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
