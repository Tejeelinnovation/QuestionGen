import io
import openpyxl
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from schools.models import School, ClassSection
from users.models import User, Capability, CapabilityName, UserCapability
from users.capability_defaults import grant_super_admin_defaults
from content.models import Book, Chapter, Topic, Question, QuestionVariant
from papers.models import Paper, PaperVersion


class EndToEndTargetFlowTests(TestCase):
    """
    Comprehensive verification of Section 14: End-to-End Target Flow:
    1. Super Admin provisions School/Coaching Class with capacity limits & Question Bank capability, and creates QBM.
    2. School Admin imports Excel workbook with students & teachers:
       - Capacity limit enforcement
       - Duplicate detection
       - Class/division normalization ('Std 6' -> 'Class 6')
       - Audit log recording ('excel_import.executed')
    3. School Admin toggles Question Bank capability for a teacher.
    4. QBM ingests global questions with difficulty-consistent variants (AC-15).
    5. Teacher creates an organization-private question (AC-13, AC-14).
    6. Another School B teacher creates a private question for School B.
    7. Teacher creates a multi-subject test blueprint (AC-17, AC-18).
    8. Multi-source candidate pooling includes Global QBM + Teacher's School, strictly excluding School B (AC-19, AC-20).
    9. Paper is frozen into an immutable version snapshot with duration, subjects, and print representation verified.
    """

    def setUp(self):
        self.client = APIClient()

        # Ensure all standard capabilities exist
        for cap_name in CapabilityName.values:
            Capability.objects.get_or_create(name=cap_name)

        # Create Super Admin
        self.superadmin = User.objects.create_superuser(
            username="flow_superadmin",
            email="superadmin@flow.com",
            password="password123",
            role="Super Admin",
        )
        grant_super_admin_defaults(self.superadmin)

        # Standard curriculum hierarchy: Book -> Chapter -> Topic
        self.book_math = Book.objects.create(
            title="CBSE Mathematics 6",
            board="CBSE",
            subject="Mathematics",
            grade="Class 6",
        )
        self.chapter_math = Chapter.objects.create(
            book=self.book_math,
            title="Fractions",
            chapter_order=1,
        )
        self.topic_math = Topic.objects.create(
            chapter=self.chapter_math,
            name="Proper Fractions",
        )

        self.book_sci = Book.objects.create(
            title="CBSE Science 6",
            board="CBSE",
            subject="Science",
            grade="Class 6",
        )
        self.chapter_sci = Chapter.objects.create(
            book=self.book_sci,
            title="Light",
            chapter_order=1,
        )
        self.topic_sci = Topic.objects.create(
            chapter=self.chapter_sci,
            name="Reflection",
        )

    def _build_excel_file(self, headers, rows):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(headers)
        for r in rows:
            ws.append(r)
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        return bio

    def test_section_14_complete_end_to_end_flow(self):
        # -------------------------------------------------------------
        # STEP 1: Super Admin provisions School/Coaching Class and QBM user
        # -------------------------------------------------------------
        self.client.force_authenticate(user=self.superadmin)

        # Super Admin creates Organization with capacity limit and Question Bank enabled
        school_res = self.client.post(
            "/api/schools/",
            {
                "name": "Apex Coaching Academy",
                "max_students": 5,  # Small capacity to test enforcement
                "max_teachers": 2,
                "question_bank_enabled": True,
                "admin": {
                    "username": "apex_admin",
                    "email": "admin@apex.com",
                    "password": "ApexSecure#2026!",
                    "first_name": "Apex",
                    "last_name": "Director",
                    "mobile_number": "+919876543210",
                },
            },
            format="json",
        )
        self.assertEqual(school_res.status_code, status.HTTP_201_CREATED, school_res.data)
        apex_school_id = school_res.data["id"]
        apex_school = School.objects.get(id=apex_school_id)
        self.assertTrue(apex_school.question_bank_enabled)

        # Super Admin creates QBM user
        qbm_res = self.client.post(
            "/api/users/",
            {
                "username": "apex_qbm",
                "email": "qbm@apex.com",
                "password": "ApexSecure#2026!",
                "profile": "qbm",
                "first_name": "Central",
                "last_name": "Curator",
                "mobile_number": "+919876543211",
            },
            format="json",
        )
        self.assertEqual(qbm_res.status_code, status.HTTP_201_CREATED, qbm_res.data)
        qbm_user = User.objects.get(username="apex_qbm")
        self.assertEqual(qbm_user.role_label, "Question Bank Manager")
        self.assertIsNone(qbm_user.school)
        self.assertTrue(qbm_user.has_capability("INGEST_GLOBAL_QUESTIONS"))

        # Super Admin creates School B (to test multi-tenant privacy isolation)
        school_b_res = self.client.post(
            "/api/schools/",
            {
                "name": "Zenith Public School",
                "max_students": 100,
                "max_teachers": 20,
                "question_bank_enabled": True,
                "admin": {
                    "username": "zenith_admin",
                    "email": "admin@zenith.com",
                    "password": "ZenithSecure#2026!",
                    "first_name": "Zenith",
                    "last_name": "Admin",
                    "mobile_number": "+919876543299",
                },
            },
            format="json",
        )
        self.assertEqual(school_b_res.status_code, status.HTTP_201_CREATED, school_b_res.data)
        school_b = School.objects.get(id=school_b_res.data["id"])

        # -------------------------------------------------------------
        # STEP 2: School Admin imports Excel workbook with students & teachers
        # -------------------------------------------------------------
        apex_admin = User.objects.get(username="apex_admin")
        self.client.force_authenticate(user=apex_admin)

        # 2a: Teacher Excel import
        # Apex has max_teachers = 2. We import 2 teachers, one of which has "Std 6" in class mapping.
        teacher_headers = ["Teacher Name", "Teacher Mobile Number", "Subject", "Class Teacher"]
        teacher_rows = [
            ["Teacher Alice", "9111111111", "Mathematics", "Std 6-A"],
            ["Teacher Bob", "9111111112", "Science", "Class 6-B"],
        ]
        excel_teachers = self._build_excel_file(teacher_headers, teacher_rows)
        import_t_res = self.client.post(
            "/api/schools/import/teachers/",
            {"file": excel_teachers},
            format="multipart",
        )
        self.assertEqual(import_t_res.status_code, status.HTTP_200_OK)
        self.assertEqual(import_t_res.data["summary"]["created_count"], 2)

        # Verify teacher Alice and Bob exist and class was normalized from "Std 6-A" to "Class 6 - A"
        alice = User.objects.get(first_name="Teacher", last_name="Alice")
        self.assertEqual(alice.role_label, "Teacher")
        self.assertEqual(alice.school, apex_school)
        sec_a = ClassSection.objects.get(school=apex_school, standard=6, section="A")
        self.assertEqual(sec_a.name, "Class 6-A")

        # Verify audit log for teacher import
        audit_t = AuditLog.objects.filter(action="excel_import.executed", target_id=str(apex_school.id)).first()
        self.assertIsNotNone(audit_t)
        self.assertEqual(audit_t.metadata["type"], "teacher")
        self.assertEqual(audit_t.metadata["created_count"], 2)

        # 2b: Capacity limit & Duplicate handling for Teachers
        # Try importing another teacher (exceeds max_teachers=2)
        excel_t_overflow = self._build_excel_file(
            teacher_headers,
            [["Teacher Charlie", "9111111113", "English", "Class 6-A"]],
        )
        import_t_overflow = self.client.post(
            "/api/schools/import/teachers/",
            {"file": excel_t_overflow},
            format="multipart",
        )
        self.assertEqual(import_t_overflow.status_code, status.HTTP_200_OK)
        self.assertEqual(import_t_overflow.data["summary"]["created_count"], 0)
        self.assertGreater(import_t_overflow.data["summary"]["over_limit_count"], 0)

        # 2c: Student Excel import (including duplicate & capacity checks)
        student_headers = ["Student Name", "Phone Number", "GR Number", "Roll Number", "Standard", "Division"]
        student_rows = [
            ["Student S1", "9222222221", "GR001", "1", "Std 6", "A"],
            ["Student S2", "9222222222", "GR002", "2", "6", "A"],
            ["Student S3", "9222222223", "GR003", "3", "Class 6", "A"],
            ["Student S4", "9222222224", "GR004", "4", "Class 6", "B"],
            ["Student S5", "9222222225", "GR005", "5", "Class 6", "B"],
            # 6th student exceeds capacity of 5
            ["Student S6", "9222222226", "GR006", "6", "Class 6", "B"],
        ]
        excel_students = self._build_excel_file(student_headers, student_rows)
        import_s_res = self.client.post(
            "/api/schools/import/students/",
            {"file": excel_students},
            format="multipart",
        )
        self.assertEqual(import_s_res.status_code, status.HTTP_200_OK)
        self.assertEqual(import_s_res.data["summary"]["created_count"], 5)
        self.assertEqual(import_s_res.data["summary"]["over_limit_count"], 1)

        # Re-upload duplicate row
        excel_dup = self._build_excel_file(
            student_headers,
            [["Student S1", "9222222221", "GR001", "1", "Class 6", "A"]],
        )
        import_dup_res = self.client.post(
            "/api/schools/import/students/",
            {"file": excel_dup},
            format="multipart",
        )
        self.assertEqual(import_dup_res.status_code, status.HTTP_200_OK)
        self.assertEqual(import_dup_res.data["summary"]["created_count"], 0)
        self.assertEqual(import_dup_res.data["summary"]["duplicate_count"], 1)

        # -------------------------------------------------------------
        # STEP 3: School Admin toggles Question Bank capability for Teacher Alice
        # -------------------------------------------------------------
        perm_res = self.client.post(
            f"/api/users/{alice.id}/permissions/",
            {"capability_name": "GENERATE_SELECT_QUESTIONS"},
            format="json",
        )
        self.assertEqual(perm_res.status_code, status.HTTP_200_OK)
        alice.refresh_from_db()
        self.assertTrue(alice.has_capability("GENERATE_SELECT_QUESTIONS"))

        # -------------------------------------------------------------
        # STEP 4: QBM ingests global questions with difficulty-consistent variants (AC-15)
        # -------------------------------------------------------------
        self.client.force_authenticate(user=qbm_user)

        global_q_res = self.client.post(
            "/api/questions/ingest/",
            {
                "topic": self.topic_math.id,
                "question_text": "Global QBM: What is 1/2 + 1/4?",
                "question_type": "MCQ",
                "difficulty": "MEDIUM",
                "marks": 2,
                "correct_answer": "3/4",
                "options": {
                    "A": "3/4",
                    "B": "2/6",
                    "C": "1/4",
                    "D": "1",
                },
                "explanation": "Find common denominator 4.",
            },
            format="json",
        )
        self.assertEqual(global_q_res.status_code, status.HTTP_201_CREATED)
        global_q_id = global_q_res.data["id"]
        global_q = Question.objects.get(id=global_q_id)
        self.assertEqual(global_q.bank_source, "GLOBAL")
        self.assertIsNone(global_q.school)

        # QBM adds a variant to the global question
        var_res = self.client.post(
            f"/api/questions/{global_q_id}/variants/",
            {
                "variant_type": "MCQ",
                "marks": 2,
                "question_text": "Global QBM Variant: What is 2/4 + 1/4?",
                "correct_answer": "3/4",
                "options": {
                    "A": "3/4",
                    "B": "1/2",
                    "C": "1/4",
                    "D": "1",
                },
                "explanation": "Denominators are already identical.",
            },
            format="json",
        )
        self.assertEqual(var_res.status_code, status.HTTP_201_CREATED)
        variant = QuestionVariant.objects.get(id=var_res.data["id"])
        # Enforce AC-15: variant preserves parent difficulty, type, marks
        self.assertEqual(variant.difficulty, global_q.difficulty)
        self.assertEqual(variant.variant_type, global_q.question_type)
        self.assertEqual(variant.marks, global_q.marks)

        # Also ingest a global Science question
        qbm_sci_res = self.client.post(
            "/api/questions/ingest/",
            {
                "topic": self.topic_sci.id,
                "question_text": "Global QBM: What surface reflects light best?",
                "question_type": "MCQ",
                "difficulty": "EASY",
                "marks": 1,
                "correct_answer": "A",
                "options": {
                    "A": "Smooth plane mirror",
                    "B": "Rough cardboard",
                },
            },
            format="json",
        )
        self.assertEqual(qbm_sci_res.status_code, status.HTTP_201_CREATED)
        global_sci_q = Question.objects.get(id=qbm_sci_res.data["id"])

        # -------------------------------------------------------------
        # STEP 5: Teacher Alice creates an organization-private question (AC-13, AC-14)
        # -------------------------------------------------------------
        self.client.force_authenticate(user=alice)

        alice_q_res = self.client.post(
            "/api/questions/ingest/",
            {
                "topic": self.topic_math.id,
                "question_text": "Alice Private Q: What is 3/8 + 1/8?",
                "question_type": "MCQ",
                "difficulty": "EASY",
                "marks": 1,
                "correct_answer": "A",
                "options": {
                    "A": "4/8 or 1/2",
                    "B": "3/16",
                },
            },
            format="json",
        )
        self.assertEqual(alice_q_res.status_code, status.HTTP_201_CREATED)
        alice_q = Question.objects.get(id=alice_q_res.data["id"])
        self.assertEqual(alice_q.bank_source, "ORGANIZATION")
        self.assertEqual(alice_q.school, apex_school)

        # -------------------------------------------------------------
        # STEP 6: School B Teacher creates question for School B
        # -------------------------------------------------------------
        teacher_b = User.objects.create_user(
            username="teacher_b",
            email="tb@zenith.com",
            password="password123",
            school=school_b,
        )
        # Assign CREATE_TEACHER/Teacher role capabilities to teacher_b
        from users.models import Capability, CapabilityName
        cap_q, _ = Capability.objects.get_or_create(name=CapabilityName.GENERATE_SELECT_QUESTIONS)
        from users.models import UserCapability
        UserCapability.objects.create(user=teacher_b, capability=cap_q)

        school_b_q = Question.objects.create(
            topic=self.topic_math,
            question_text="School B Private Q: Confidential test item",
            question_type="MCQ",
            difficulty="HARD",
            marks=3,
            bank_source="ORGANIZATION",
            school=school_b,
            created_by=teacher_b,
            correct_answer="X",
        )

        # -------------------------------------------------------------
        # STEP 7: Teacher Alice creates a multi-subject test blueprint (AC-17, AC-18)
        # -------------------------------------------------------------
        paper_res = self.client.post(
            "/api/papers/",
            {
                "title": "Class 6 Integrated Term Assessment",
                "subjects": ["Mathematics", "Science"],
                "duration_minutes": 90,
                "total_question_count": 3,
                "specifications": {
                    "distribution": {
                        "Mathematics": 2,
                        "Science": 1,
                    },
                    "difficulty_breakdown": {
                        "EASY": 2,
                        "MEDIUM": 1,
                    },
                },
            },
            format="json",
        )
        self.assertEqual(paper_res.status_code, status.HTTP_201_CREATED)
        paper_id = paper_res.data["id"]
        paper = Paper.objects.get(id=paper_id)
        self.assertEqual(paper.duration_minutes, 90)
        self.assertEqual(paper.total_question_count, 3)
        self.assertEqual(paper.subjects, ["Mathematics", "Science"])

        # -------------------------------------------------------------
        # STEP 8: Multi-source candidate pooling & Cross-organization exclusion (AC-19, AC-20)
        # -------------------------------------------------------------
        candidates_res = self.client.post(
            f"/api/papers/{paper_id}/select-questions/",
            {},
            format="json",
        )
        self.assertEqual(candidates_res.status_code, status.HTTP_200_OK)
        candidate_ids = [q["id"] for q in candidates_res.data["questions"]]

        # MUST include Global questions (QBM)
        self.assertIn(global_q.id, candidate_ids)
        self.assertIn(global_sci_q.id, candidate_ids)
        # MUST include Teacher Alice's own school questions
        self.assertIn(alice_q.id, candidate_ids)
        # MUST strictly EXCLUDE School B private questions (AC-20)
        self.assertNotIn(school_b_q.id, candidate_ids)

        # -------------------------------------------------------------
        # STEP 9: Generate paper version, freeze snapshot & verify print representation
        # -------------------------------------------------------------
        version_res = self.client.post(
            f"/api/papers/{paper_id}/versions/",
            {
                "question_ids": [global_q.id, global_sci_q.id, alice_q.id],
                "version_label": "A",
            },
            format="json",
        )
        self.assertEqual(version_res.status_code, status.HTTP_201_CREATED)
        version_id = version_res.data["id"]
        version = PaperVersion.objects.get(id=version_id)

        # Verify frozen snapshot questions maintain bank_source metadata
        snapshot = version.question_snapshot
        self.assertEqual(len(snapshot), 3)
        sources = {q.get("bank_source") for q in snapshot}
        self.assertIn("GLOBAL", sources)
        self.assertIn("ORGANIZATION", sources)

        # Verify print view representation
        print_res = self.client.get(f"/api/papers/{paper_id}/versions/{version_id}/print/")
        self.assertEqual(print_res.status_code, status.HTTP_200_OK)
        print_data = print_res.data
        self.assertEqual(print_data["duration_minutes"], 90)
        self.assertEqual(print_data["subjects"], ["Mathematics", "Science"])
        self.assertEqual(print_data["total_question_count"], 3)
        self.assertEqual(print_data["question_count"], 3)
