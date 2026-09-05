"""
Tests for the papers app.

Covers:
- Paper creation, permissions, and audit logging
- Candidate question selection via content.filters.filter_questions()
- Immutable version creation with snapshot and computed total_marks
- Cloning versions (Version A untouched when Version B is created)
- Refresh persistence of total_marks
- Print representation derivation from the same PaperVersion snapshot
- Scoping rules (teacher, school admin, super admin, student)
- Delivery validation (DRAFT blocker, ONLINE student requirement, scope boundary)
- AuditLog entry verification
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.test import APITestCase

from content.models import Book, Chapter, Difficulty, LearnerLevel, Question, QuestionType, Topic
from core.models import AuditLog
from schools.models import School
from users.capability_defaults import (
    grant_school_admin_defaults,
    grant_student_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
)
from users.models import User
from .models import Delivery, DeliveryMode, DeliveryStatus, Paper, PaperVersion, VersionStatus


class PapersWorkflowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Create schools
        cls.school_a = School.objects.create(name="Greenwood High")
        cls.school_b = School.objects.create(name="Riverside Academy")

        # Create Super Admin
        cls.super_admin = User.objects.create_user(
            username="super_admin", password="password123", email="sa@system.org"
        )
        grant_super_admin_defaults(cls.super_admin)

        # Create School Admin for School A
        cls.school_admin_a = User.objects.create_user(
            username="admin_a", password="password123", email="admin@schoola.org", school=cls.school_a
        )
        grant_school_admin_defaults(cls.school_admin_a, granted_by=cls.super_admin)

        # Create Teacher 1 in School A
        cls.teacher_1 = User.objects.create_user(
            username="teacher_1",
            password="password123",
            email="teacher1@schoola.org",
            school=cls.school_a,
            created_by=cls.school_admin_a,
        )
        grant_teacher_defaults(cls.teacher_1, granted_by=cls.school_admin_a)

        # Create Teacher 2 in School A
        cls.teacher_2 = User.objects.create_user(
            username="teacher_2",
            password="password123",
            email="teacher2@schoola.org",
            school=cls.school_a,
            created_by=cls.school_admin_a,
        )
        grant_teacher_defaults(cls.teacher_2, granted_by=cls.school_admin_a)

        # Students: Student 1 created by Teacher 1; Student 2 created by Teacher 2
        cls.student_1 = User.objects.create_user(
            username="student_1",
            password="password123",
            email="s1@schoola.org",
            school=cls.school_a,
            created_by=cls.teacher_1,
        )
        grant_student_defaults(cls.student_1, granted_by=cls.teacher_1)

        cls.student_2 = User.objects.create_user(
            username="student_2",
            password="password123",
            email="s2@schoola.org",
            school=cls.school_a,
            created_by=cls.teacher_2,
        )
        grant_student_defaults(cls.student_2, granted_by=cls.teacher_2)

        # Content: Book, Chapter, Topics, Questions
        cls.book = Book.objects.create(
            title="Class 10 Math", subject="Mathematics", grade="10", publisher="NCERT", is_active=True
        )
        cls.chapter = Chapter.objects.create(book=cls.book, title="Real Numbers", chapter_order=1)
        cls.topic_1 = Topic.objects.create(chapter=cls.chapter, name="Euclid's Division Lemma")
        cls.topic_2 = Topic.objects.create(chapter=cls.chapter, name="Fundamental Theorem")

        # Questions for Topic 1
        cls.q1 = Question.objects.create(
            topic=cls.topic_1,
            question_text="State Euclid's Lemma.",
            question_type=QuestionType.SHORT_ANSWER,
            marks=2,
            difficulty=Difficulty.EASY,
            learner_level=LearnerLevel.BEGINNER,
            options=None,
            correct_answer="a = bq + r",
            is_active=True,
        )
        cls.q2 = Question.objects.create(
            topic=cls.topic_1,
            question_text="Find HCF of 135 and 225.",
            question_type=QuestionType.SHORT_ANSWER,
            marks=3,
            difficulty=Difficulty.EASY,
            learner_level=LearnerLevel.BEGINNER,
            options=None,
            correct_answer="45",
            is_active=True,
        )
        cls.q3 = Question.objects.create(
            topic=cls.topic_1,
            question_text="MCQ on Euclid's lemma",
            question_type=QuestionType.MCQ,
            marks=1,
            difficulty=Difficulty.EASY,
            learner_level=LearnerLevel.BEGINNER,
            options={"A": "opt1", "B": "opt2"},
            correct_answer="A",
            is_active=True,
        )
        # Question for Topic 2
        cls.q4 = Question.objects.create(
            topic=cls.topic_2,
            question_text="Express 156 as prime factors.",
            question_type=QuestionType.SHORT_ANSWER,
            marks=2,
            difficulty=Difficulty.MEDIUM,
            learner_level=LearnerLevel.INTERMEDIATE,
            options=None,
            correct_answer="2^2 * 3 * 13",
            is_active=True,
        )

    # ------------------------------------------------------------------
    # 1. Paper Creation & Permissions
    # ------------------------------------------------------------------

    def test_teacher_can_create_paper_shell_and_logs_audit(self):
        self.client.force_authenticate(user=self.teacher_1)
        payload = {
            "title": "Unit Test 1 — Real Numbers",
            "instructions": "Answer all questions clearly.",
            "chapter": self.chapter.id,
        }
        res = self.client.post("/api/papers/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["title"], "Unit Test 1 — Real Numbers")
        self.assertEqual(res.data["created_by"], self.teacher_1.id)
        self.assertEqual(res.data["school"], self.school_a.id)

        # Verify AuditLog
        audit_entry = AuditLog.objects.filter(action="paper.created", target_id=str(res.data["id"])).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.user, self.teacher_1)

    def test_student_cannot_create_paper(self):
        self.client.force_authenticate(user=self.student_1)
        res = self.client.post(
            "/api/papers/",
            {"title": "Sneaky Paper", "chapter": self.chapter.id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # 2. Candidate Question Selection (Review Step)
    # ------------------------------------------------------------------

    def test_select_questions_preview(self):
        # First create paper
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        payload = {
            "topic_ids": [self.topic_1.id],
            "difficulty": "EASY",
            "quantity": 2,
        }
        res = self.client.post(f"/api/papers/{paper.id}/select-questions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 2)
        # Verify no PaperVersion was saved
        self.assertEqual(paper.versions.count(), 0)

    # ------------------------------------------------------------------
    # 3. Version Creation, Snapshot, Marks Computation, and Constraints
    # ------------------------------------------------------------------

    def test_create_version_with_zero_questions_fails(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        res = self.client.post(
            f"/api/papers/{paper.id}/versions/",
            {"question_ids": []},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_version_with_mismatched_total_marks_fails(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        # q1=2 marks, q2=3 marks. Sum is 5, but total_marks constraint says 10
        payload = {
            "question_ids": [self.q1.id, self.q2.id],
            "constraints_used": {"total_marks": 10},
        }
        res = self.client.post(f"/api/papers/{paper.id}/versions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("total_marks", res.data)

    def test_create_version_success_and_snapshot(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        # q1 (2 marks) + q2 (3 marks) = 5 marks
        payload = {
            "question_ids": [self.q1.id, self.q2.id],
            "constraints_used": {"difficulty": "EASY", "total_marks": 5},
        }
        res = self.client.post(f"/api/papers/{paper.id}/versions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["version_label"], "A")
        self.assertEqual(res.data["total_marks"], 5)
        self.assertEqual(res.data["question_count"], 2)

        # Snapshot check
        snapshot = res.data["question_snapshot"]
        self.assertEqual(len(snapshot), 2)
        self.assertEqual(snapshot[0]["question_id"], self.q1.id)
        self.assertEqual(snapshot[0]["marks"], 2.0)
        self.assertEqual(snapshot[1]["question_id"], self.q2.id)
        self.assertEqual(snapshot[1]["marks"], 3.0)

        # Verify AuditLog
        version_id = res.data["id"]
        audit_entry = AuditLog.objects.filter(action="version.created", target_id=str(version_id)).first()
        self.assertIsNotNone(audit_entry)

    # ------------------------------------------------------------------
    # 4. Total Marks Persists Across Refreshes
    # ------------------------------------------------------------------

    def test_total_marks_persists_after_refresh(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        payload = {
            "question_ids": [self.q1.id, self.q2.id],
            "constraints_used": {"total_marks": 5},
        }
        create_res = self.client.post(f"/api/papers/{paper.id}/versions/", payload, format="json")
        version_id = create_res.data["id"]

        # Fetch 1
        res1 = self.client.get(f"/api/papers/{paper.id}/versions/{version_id}/")
        # Fetch 2
        res2 = self.client.get(f"/api/papers/{paper.id}/versions/{version_id}/")

        self.assertEqual(res1.data["total_marks"], 5)
        self.assertEqual(res2.data["total_marks"], 5)
        self.assertEqual(res1.data["total_marks"], res2.data["total_marks"])

    # ------------------------------------------------------------------
    # 5. Clone Version & Immutability of Source Version
    # ------------------------------------------------------------------

    def test_clone_version_creates_version_b_without_mutating_version_a(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        # Create Version A with q1 (2 marks) + q2 (3 marks) = 5 marks
        payload_a = {
            "question_ids": [self.q1.id, self.q2.id],
            "constraints_used": {"topic_ids": [self.topic_1.id], "difficulty": "EASY"},
        }
        res_a = self.client.post(f"/api/papers/{paper.id}/versions/", payload_a, format="json")
        version_a_id = res_a.data["id"]
        version_a_snapshot = res_a.data["question_snapshot"]

        # Clone Version A with explicit new questions: q3 (1 mark) + q4 (2 marks) = 3 marks
        payload_b = {
            "question_ids": [self.q3.id, self.q4.id],
        }
        res_b = self.client.post(
            f"/api/papers/{paper.id}/versions/{version_a_id}/clone/", payload_b, format="json"
        )
        self.assertEqual(res_b.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_b.data["version_label"], "B")
        self.assertEqual(res_b.data["total_marks"], 3)

        # Verify Version A remains completely untouched
        res_a_after = self.client.get(f"/api/papers/{paper.id}/versions/{version_a_id}/")
        self.assertEqual(res_a_after.data["version_label"], "A")
        self.assertEqual(res_a_after.data["total_marks"], 5)
        self.assertEqual(res_a_after.data["question_snapshot"], version_a_snapshot)

        # Verify AuditLog for clone
        audit_entry = AuditLog.objects.filter(
            action="version.cloned", target_id=str(res_b.data["id"])
        ).first()
        self.assertIsNotNone(audit_entry)

    # ------------------------------------------------------------------
    # 6. Delivery Gating: DRAFT Blocker & Finalize Step
    # ------------------------------------------------------------------

    def test_delivering_draft_version_fails_until_finalized(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        # Create version in DRAFT status
        payload = {
            "question_ids": [self.q1.id],
            "status": "DRAFT",
        }
        res_v = self.client.post(f"/api/papers/{paper.id}/versions/", payload, format="json")
        version_id = res_v.data["id"]

        # Attempt to deliver while DRAFT -> 400 Bad Request
        deliver_payload = {"mode": "PRINT"}
        del_res = self.client.post(
            f"/api/papers/{paper.id}/versions/{version_id}/deliver/", deliver_payload, format="json"
        )
        self.assertEqual(del_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot deliver a PaperVersion with DRAFT status", del_res.data["detail"])

        # Explicit Finalize step
        fin_res = self.client.post(f"/api/papers/{paper.id}/versions/{version_id}/finalize/")
        self.assertEqual(fin_res.status_code, status.HTTP_200_OK)
        self.assertEqual(fin_res.data["status"], "FINALIZED")

        # Now delivery succeeds
        del_res_after = self.client.post(
            f"/api/papers/{paper.id}/versions/{version_id}/deliver/", deliver_payload, format="json"
        )
        self.assertEqual(del_res_after.status_code, status.HTTP_201_CREATED)
        self.assertEqual(del_res_after.data["mode"], "PRINT")

        # Verify AuditLog
        audit_entry = AuditLog.objects.filter(
            action="delivery.created", target_id=str(del_res_after.data["id"])
        ).first()
        self.assertIsNotNone(audit_entry)

    # ------------------------------------------------------------------
    # 7. Online Delivery Validation & Student Scoping
    # ------------------------------------------------------------------

    def test_online_delivery_requires_students(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[{"question_id": self.q1.id, "marks": 2}],
            status=VersionStatus.FINALIZED,
        )
        self.client.force_authenticate(user=self.teacher_1)

        res = self.client.post(
            f"/api/papers/{paper.id}/versions/{version.id}/deliver/",
            {"mode": "ONLINE", "student_ids": []},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teacher_cannot_assign_students_outside_scope(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[{"question_id": self.q1.id, "marks": 2}],
            status=VersionStatus.FINALIZED,
        )
        self.client.force_authenticate(user=self.teacher_1)

        # student_2 was created by teacher_2, not teacher_1!
        payload = {
            "mode": "ONLINE",
            "student_ids": [self.student_2.id],
        }
        res = self.client.post(
            f"/api/papers/{paper.id}/versions/{version.id}/deliver/", payload, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot assign test to students outside your scope", res.data["detail"])

    def test_teacher_can_assign_own_students(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[{"question_id": self.q1.id, "marks": 2}],
            status=VersionStatus.FINALIZED,
        )
        self.client.force_authenticate(user=self.teacher_1)

        # student_1 was created by teacher_1
        payload = {
            "mode": "ONLINE",
            "student_ids": [self.student_1.id],
        }
        res = self.client.post(
            f"/api/papers/{paper.id}/versions/{version.id}/deliver/", payload, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["assigned_students_count"], 1)

    # ------------------------------------------------------------------
    # 8. Print and Online Output Derive from Same PaperVersion
    # ------------------------------------------------------------------

    def test_print_and_online_derive_from_same_version(self):
        paper = Paper.objects.create(
            title="Math Exam",
            instructions="No calculators allowed.",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
        )
        snapshot = [
            {
                "question_id": self.q1.id,
                "question_text": self.q1.question_text,
                "question_type": self.q1.question_type,
                "marks": 2.0,
                "options": None,
            },
            {
                "question_id": self.q2.id,
                "question_text": self.q2.question_text,
                "question_type": self.q2.question_type,
                "marks": 3.0,
                "options": None,
            },
        ]
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=snapshot,
            status=VersionStatus.FINALIZED,
        )

        self.client.force_authenticate(user=self.teacher_1)

        # 1. Print layout
        print_res = self.client.get(f"/api/papers/{paper.id}/versions/{version.id}/print/")
        self.assertEqual(print_res.status_code, status.HTTP_200_OK)
        self.assertEqual(print_res.data["version_label"], "A")
        self.assertEqual(print_res.data["total_marks"], 5)
        self.assertEqual(len(print_res.data["questions"]), 2)
        self.assertEqual(print_res.data["questions"][0]["question_text"], self.q1.question_text)

        # 2. Online delivery
        del_res = self.client.post(
            f"/api/papers/{paper.id}/versions/{version.id}/deliver/",
            {"mode": "ONLINE", "student_ids": [self.student_1.id]},
            format="json",
        )
        self.assertEqual(del_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(del_res.data["paper_version"], version.id)
        self.assertEqual(del_res.data["total_marks"], 5)

    # ------------------------------------------------------------------
    # 9. Scoping: Visibility of Papers & Deliveries
    # ------------------------------------------------------------------

    def test_teacher_sees_only_own_papers(self):
        # Teacher 1 paper
        p1 = Paper.objects.create(
            title="Teacher 1 Paper", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        # Teacher 2 paper
        p2 = Paper.objects.create(
            title="Teacher 2 Paper", created_by=self.teacher_2, school=self.school_a, chapter=self.chapter
        )

        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.get("/api/papers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [p["id"] for p in res.data]
        self.assertIn(p1.id, ids)
        self.assertNotIn(p2.id, ids)

    def test_school_admin_sees_all_school_papers(self):
        p1 = Paper.objects.create(
            title="Teacher 1 Paper", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        p2 = Paper.objects.create(
            title="Teacher 2 Paper", created_by=self.teacher_2, school=self.school_a, chapter=self.chapter
        )

        self.client.force_authenticate(user=self.school_admin_a)
        res = self.client.get("/api/papers/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [p["id"] for p in res.data]
        self.assertIn(p1.id, ids)
        self.assertIn(p2.id, ids)

    def test_student_cannot_see_papers_or_unassigned_deliveries(self):
        paper = Paper.objects.create(
            title="Secret Paper", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[{"question_id": self.q1.id, "marks": 2}],
            status=VersionStatus.FINALIZED,
        )
        # Delivery assigned only to student_2
        delivery = Delivery.objects.create(
            paper_version=version, mode=DeliveryMode.ONLINE, created_by=self.teacher_1
        )
        delivery.assigned_students.set([self.student_2])

        self.client.force_authenticate(user=self.student_1)

        # 1. Student GET /api/papers/ returns empty
        res_papers = self.client.get("/api/papers/")
        self.assertEqual(res_papers.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_papers.data), 0)

        # 2. Student GET /api/deliveries/ returns empty (not assigned to student_1)
        res_del = self.client.get("/api/deliveries/")
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_del.data), 0)

        # When student_1 is authenticated and assigned:
        delivery.assigned_students.add(self.student_1)
        res_del_assigned = self.client.get("/api/deliveries/")
        self.assertEqual(len(res_del_assigned.data), 1)
        self.assertEqual(res_del_assigned.data[0]["id"], delivery.id)
