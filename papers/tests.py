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

from django.test import TestCase
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

    def test_select_questions_with_total_marks_quota_success(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        # q1=2 marks, q2=3 marks. Total pool has at least 5 marks. Request total_marks=5
        payload = {
            "topic_ids": [self.topic_1.id],
            "difficulty": "EASY",
            "total_marks": 5,
        }
        res = self.client.post(f"/api/papers/{paper.id}/select-questions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        returned_marks = sum(float(q["marks"]) for q in res.data["questions"])
        self.assertEqual(returned_marks, 5.0)

    def test_select_questions_with_total_marks_exceeding_pool_fails_gracefully(self):
        paper = Paper.objects.create(
            title="Math Test", created_by=self.teacher_1, school=self.school_a, chapter=self.chapter
        )
        self.client.force_authenticate(user=self.teacher_1)

        # Request 999 marks which clearly exceeds available pool
        payload = {
            "topic_ids": [self.topic_1.id],
            "difficulty": "EASY",
            "total_marks": 999,
        }
        res = self.client.post(f"/api/papers/{paper.id}/select-questions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot meet your target", res.data["detail"])

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
        self.assertEqual(print_res.data["school_name"], self.school_a.name)
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

    def test_multi_subject_paper_creation_and_blueprint_metadata(self):
        """Verify paper creation with multiple subjects, duration, and question count."""
        self.client.force_authenticate(user=self.teacher_1)
        payload = {
            "title": "Combined Science & Math Entrance Exam",
            "instructions": "Attempt all sections. No calculators allowed.",
            "subjects": ["Mathematics", "Physics"],
            "duration_minutes": 120,
            "total_question_count": 25,
            "specifications": {
                "subject_breakdown": [
                    {"subject": "Mathematics", "marks": 20, "count": 10},
                    {"subject": "Physics", "marks": 20, "count": 10},
                ]
            },
        }
        res = self.client.post("/api/papers/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["title"], "Combined Science & Math Entrance Exam")
        self.assertEqual(res.data["subjects"], ["Mathematics", "Physics"])
        self.assertEqual(res.data["duration_minutes"], 120)
        self.assertEqual(res.data["total_question_count"], 25)
        self.assertIsNone(res.data["chapter"])

    def test_multi_source_candidate_selection_includes_global_and_own_school(self):
        """Retrieval pools both QBM Global questions and teacher's own school questions."""
        # Create private question for School A
        q_school_a = Question.objects.create(
            topic=self.topic_1,
            question_text="School A Proprietary Question on Euclid.",
            question_type=QuestionType.SHORT_ANSWER,
            marks=2,
            difficulty=Difficulty.EASY,
            bank_source="ORGANIZATION",
            school=self.school_a,
            created_by=self.teacher_1,
            is_active=True,
        )

        paper = Paper.objects.create(
            title="School A Unit Test",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
            duration_minutes=45,
        )

        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.post(f"/api/papers/{paper.id}/select-questions/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        returned_ids = [q["id"] for q in res.data["questions"]]

        # Both Global (q1) and School A private (q_school_a) must be present
        self.assertIn(self.q1.id, returned_ids)
        self.assertIn(q_school_a.id, returned_ids)

    def test_cross_organization_question_exclusion(self):
        """Questions belonging to School B are strictly EXCLUDED from School A's candidate pool."""
        # Create private question for School B
        q_school_b = Question.objects.create(
            topic=self.topic_1,
            question_text="School B Proprietary Question on Euclid.",
            question_type=QuestionType.SHORT_ANSWER,
            marks=2,
            difficulty=Difficulty.EASY,
            bank_source="ORGANIZATION",
            school=self.school_b,
            is_active=True,
        )

        paper_a = Paper.objects.create(
            title="School A Test",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
        )

        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.post(f"/api/papers/{paper_a.id}/select-questions/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        returned_ids = [q["id"] for q in res.data["questions"]]

        # School B question must NEVER appear in School A's paper candidates
        self.assertNotIn(q_school_b.id, returned_ids)

    def test_print_representation_includes_duration_and_subjects(self):
        """Verify that print layout exposes duration_minutes and subjects."""
        paper = Paper.objects.create(
            title="Class 10 Mid-Term Exam",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
            subjects=["Mathematics"],
            duration_minutes=90,
            total_question_count=2,
        )
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[
                {"question_id": self.q1.id, "marks": 2, "question_text": self.q1.question_text},
                {"question_id": self.q2.id, "marks": 3, "question_text": self.q2.question_text},
            ],
            status=VersionStatus.FINALIZED,
        )

        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.get(f"/api/papers/{paper.id}/versions/{version.id}/print/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["duration_minutes"], 90)
        self.assertEqual(res.data["subjects"], ["Mathematics"])
        self.assertEqual(res.data["total_question_count"], 2)

    def test_delete_unassigned_paper_success(self):
        """Teacher can successfully delete an unassigned draft paper."""
        paper = Paper.objects.create(
            title="Draft Paper to Delete",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
            subjects=["Mathematics"],
        )
        PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[{"question_id": self.q1.id, "marks": 2}],
            status=VersionStatus.DRAFT,
        )

        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.delete(f"/api/papers/{paper.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(Paper.objects.filter(id=paper.id).exists())
        self.assertFalse(PaperVersion.objects.filter(paper_id=paper.id).exists())

    def test_delete_assigned_paper_blocked(self):
        """Deleting a paper that has active or past delivery sessions is strictly blocked."""
        paper = Paper.objects.create(
            title="Active Assigned Paper",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
            subjects=["Mathematics"],
        )
        version = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            question_snapshot=[{"question_id": self.q1.id, "marks": 2}],
            status=VersionStatus.FINALIZED,
        )
        # Create a delivery record
        Delivery.objects.create(
            paper_version=version,
            mode=DeliveryMode.ONLINE,
            created_by=self.teacher_1,
            status=DeliveryStatus.ACTIVE,
        )

        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.delete(f"/api/papers/{paper.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been assigned or delivered", res.data["detail"])
        # Paper must still exist in DB
        self.assertTrue(Paper.objects.filter(id=paper.id).exists())

    def test_delete_paper_permission_denied(self):
        """Student or unauthorized user cannot delete a paper."""
        paper = Paper.objects.create(
            title="School A Paper",
            created_by=self.teacher_1,
            school=self.school_a,
            chapter=self.chapter,
        )
        self.client.force_authenticate(user=self.student_1)
        res = self.client.delete(f"/api/papers/{paper.id}/")
        # Student cannot see or delete the paper
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])
        self.assertTrue(Paper.objects.filter(id=paper.id).exists())


class PaperPublishingAndAnswerKeyTests(TestCase):
    """Tests for academic exam publishing, sections, and answer key generation."""

    @classmethod
    def setUpTestData(cls):
        from users.models import User, Capability, CapabilityName
        from schools.models import School
        from content.models import Book, Chapter, Topic
        from papers.models import Paper, PaperVersion, VersionStatus

        for cap in CapabilityName.values:
            Capability.objects.get_or_create(name=cap)

        cls.school = School.objects.create(name="St. Xavier's High School")
        cls.teacher = User.objects.create_user(
            username="publish_teacher",
            email="pub@xavier.edu",
            password="pass",
            role="Teacher",
            school=cls.school,
        )
        grant_teacher_defaults(cls.teacher)

        cls.book = Book.objects.create(title="Chemistry 10", subject="Chemistry", grade="10")
        cls.chapter = Chapter.objects.create(book=cls.book, title="Acids and Bases", chapter_order=1)

        cls.paper = Paper.objects.create(
            title="Acids & Bases Mid-Term",
            created_by=cls.teacher,
            school=cls.school,
            chapter=cls.chapter,
            subjects=["Chemistry"],
            duration_minutes=90,
            instructions="All sections are compulsory. Use of scientific calculator is permitted.",
        )
        cls.version = PaperVersion.objects.create(
            paper=cls.paper,
            version_label="A",
            total_marks=10.0,
            status=VersionStatus.FINALIZED,
            question_snapshot=[
                {
                    "question_id": 101,
                    "question_text": "What is the pH of pure water at 25°C?",
                    "question_type": "MCQ",
                    "marks": 1.0,
                    "difficulty": "EASY",
                    "correct_answer": "B",
                    "options": {"A": "1", "B": "7", "C": "14", "D": "0"},
                },
                {
                    "question_id": 102,
                    "question_text": "Define neutralization reaction with an equation.",
                    "question_type": "SHORT_ANSWER",
                    "marks": 3.0,
                    "difficulty": "MEDIUM",
                    "correct_answer": "Acid + Base -> Salt + Water. Example: HCl + NaOH -> NaCl + H2O",
                },
                {
                    "question_id": 103,
                    "question_text": "Explain the chlor-alkali process with chemical reactions and uses of all products.",
                    "question_type": "LONG_ANSWER",
                    "marks": 6.0,
                    "difficulty": "HARD",
                    "correct_answer": "2NaCl + 2H2O -> 2NaOH + Cl2 + H2. Products: Chlorine, Hydrogen, Sodium Hydroxide...",
                },
            ],
        )

    def test_publishing_service_sections(self):
        from papers.publishing import PaperPublishingService
        service = PaperPublishingService()
        sections = service.compile_sections(self.version)
        self.assertEqual(len(sections), 3)
        self.assertEqual(sections[0].section_code, "A")
        self.assertEqual(sections[0].questions[0].question_type, "MCQ")
        self.assertEqual(sections[1].section_code, "B")
        self.assertEqual(sections[2].section_code, "C")

    def test_student_paper_output(self):
        from papers.publishing import PaperPublishingService
        service = PaperPublishingService()
        paper_data = service.generate_student_exam_paper(self.version)
        self.assertEqual(paper_data["document_type"], "STUDENT_QUESTION_PAPER")
        self.assertEqual(paper_data["school_name"], "St. Xavier's High School")
        self.assertEqual(paper_data["total_marks"], 10.0)
        self.assertIn("watermark", paper_data)
        self.assertEqual(len(paper_data["student_metadata_fields"]), 4)

    def test_teacher_answer_key_output(self):
        from papers.publishing import PaperPublishingService
        service = PaperPublishingService()
        key_data = service.generate_teacher_answer_key(self.version)
        self.assertEqual(key_data["document_type"], "TEACHER_ANSWER_KEY")
        self.assertIn("Answer Key", key_data["title"])
        sec_a = key_data["sections"][0]
        q1 = sec_a["questions"][0]
        self.assertEqual(q1["correct_answer"], "B")
        self.assertEqual(q1["correct_option_text"], "7")

    def test_answer_key_api_endpoint(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.teacher)
        res = client.get(f"/api/papers/{self.paper.id}/versions/{self.version.id}/answer-key/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["document_type"], "TEACHER_ANSWER_KEY")
        self.assertEqual(res.data["total_questions"], 3)

    def test_docx_export_student_paper_with_blank_lines(self):
        from papers.docx_export import ExamPaperDocxService
        service = ExamPaperDocxService()
        # Set universal lines_per_mark=2, and override question 102 (3 marks) to have 10 lines
        buf = service.generate_student_paper(
            version=self.version,
            lines_per_mark=2,
            question_line_overrides={"102": 10},
        )
        self.assertGreater(len(buf.getvalue()), 1000)
        # Verify it's a valid Word document by reading back with docx
        import docx
        doc = docx.Document(buf)
        full_text = "\n".join(p.text for p in doc.paragraphs)
        self.assertIn("ST. XAVIER'S HIGH SCHOOL", full_text)
        self.assertIn("ACIDS & BASES MID-TERM", full_text)
        self.assertIn("SECTION A", full_text)
        self.assertIn("SECTION B", full_text)
        self.assertIn("SECTION C", full_text)

    def test_docx_export_answer_key(self):
        from papers.docx_export import ExamPaperDocxService
        service = ExamPaperDocxService()
        buf = service.generate_answer_key(self.version)
        self.assertGreater(len(buf.getvalue()), 1000)
        import docx
        doc = docx.Document(buf)
        full_text = "\n".join(p.text for p in doc.paragraphs)
        self.assertIn("ANSWER KEY", full_text)
        self.assertIn("CORRECT ANSWER:", full_text)

    def test_docx_export_api_endpoints(self):
        from rest_framework.test import APIClient
        import json
        client = APIClient()
        client.force_authenticate(user=self.teacher)

        # 1. Student Paper Docx Export
        overrides = json.dumps({"102": 8})
        res = client.get(
            f"/api/papers/{self.paper.id}/versions/{self.version.id}/export-docx/?target=paper&lines_per_mark=3&overrides={overrides}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertIn("Question_Paper.docx", res["Content-Disposition"])
        self.assertGreater(len(res.content), 1000)

        # 2. Teacher Answer Key Docx Export
        res_key = client.get(
            f"/api/papers/{self.paper.id}/versions/{self.version.id}/export-docx/?target=answer-key"
        )
        self.assertEqual(res_key.status_code, 200)
        self.assertEqual(res_key["Content-Type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertIn("Answer_Key.docx", res_key["Content-Disposition"])

    def test_pdf_inspect_and_paper_generation_flow(self):
        """
        Verify the fast multimodal teacher PDF workflow:
        1. POST /api/papers/inspect-pdf/ -> extracts text and embedded images in <2 seconds.
        2. POST /api/papers/ with source_mode='pdf' and selected figures.
        3. POST /api/papers/{id}/select-questions/ -> returns generated questions with diagram attachments.
        4. POST /api/papers/{id}/versions/ with questions_data -> creates snapshot preserving diagrams.
        """
        from rest_framework.test import APIClient
        from django.core.files.uploadedfile import SimpleUploadedFile
        import pymupdf
        import io
        from PIL import Image

        # Build in-memory test PDF with text and a test figure
        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text((50, 50), "Chapter 5: Cell Biology and Organization.\nFigure 5.1: Structure of a plant cell.\nCells contain nucleus, mitochondria, and cell wall.")
        
        from PIL import ImageDraw
        test_img = Image.new("RGB", (160, 160), color="white")
        draw = ImageDraw.Draw(test_img)
        draw.rectangle([20, 20, 140, 140], fill="blue", outline="red", width=4)
        draw.line([0, 0, 160, 160], fill="green", width=5)
        img_bytes_io = io.BytesIO()
        test_img.save(img_bytes_io, format="PNG")
        page.insert_image(pymupdf.Rect(50, 100, 210, 260), stream=img_bytes_io.getvalue())
        pdf_bytes = doc.write()
        doc.close()

        client = APIClient()
        client.force_authenticate(user=self.teacher)

        # 1. Inspect PDF
        uploaded_pdf = SimpleUploadedFile("Cell_Biology.pdf", pdf_bytes, content_type="application/pdf")
        inspect_res = client.post("/api/papers/inspect-pdf/", {"file": uploaded_pdf}, format="multipart")
        self.assertEqual(inspect_res.status_code, 200)
        inspect_data = inspect_res.data
        self.assertIn("inspection_id", inspect_data)
        self.assertEqual(inspect_data["page_count"], 1)
        self.assertGreater(inspect_data["figure_count"], 0)
        fig_id = inspect_data["figures"][0]["figure_id"]

        # 1b. Test Dedicated Diagram Asset Streaming View (bypasses CORS/cookie blocks)
        asset_res = client.get(f"/api/papers/diagram-asset/{fig_id}/")
        self.assertEqual(asset_res.status_code, 200)
        self.assertEqual(asset_res["Content-Type"], "image/png")

        # 2. Create Paper Shell from PDF with selected figure
        create_res = client.post(
            "/api/papers/",
            {
                "title": "Cell Biology Unit Test",
                "instructions": "Answer all diagram-based questions.",
                "duration_minutes": 45,
                "total_question_count": 3,
                "specifications": {
                    "source_mode": "pdf",
                    "inspection_id": inspect_data["inspection_id"],
                    "selected_figure_ids": [fig_id],
                    "contribute_to_bank": True,
                },
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        paper_id = create_res.data["id"]

        # 3. Select / Generate Candidate Questions using Structured Mark Rubric
        gen_res = client.post(
            f"/api/papers/{paper_id}/select-questions/",
            {
                "difficulty": "MEDIUM",
                "mark_distribution": [
                    {"marks": 1, "count": 2, "question_types": ["MCQ"]},
                    {"marks": 5, "count": 1, "question_types": ["LONG_ANSWER"]},
                ],
                "quantity": 3,
            },
            format="json",
        )
        self.assertEqual(gen_res.status_code, 200)
        self.assertEqual(len(gen_res.data["questions"]), 3)
        # Verify smart diagram allocation: exactly 1 diagram question, 2 text MCQs
        diagram_qs = [q for q in gen_res.data["questions"] if q.get("diagram")]
        self.assertEqual(len(diagram_qs), 1, "Only 1 question should have the selected diagram attached.")
        mcq_qs = [q for q in gen_res.data["questions"] if q.get("question_type") == "MCQ"]
        self.assertEqual(len(mcq_qs), 2, "2 questions should be text-based MCQs matching rubric.")

        # 4. Create Version snapshot directly from questions_data
        version_res = client.post(
            f"/api/papers/{paper_id}/versions/",
            {
                "questions_data": gen_res.data["questions"],
                "version_label": "A",
                "status": "DRAFT",
            },
            format="json",
        )
        self.assertEqual(version_res.status_code, 201)
        self.assertEqual(version_res.data["version_label"], "A")
        self.assertGreater(version_res.data["total_marks"], 0)
        self.assertEqual(len(version_res.data["question_snapshot"]), 3)


class ModalityRendererAndSectionHeaderTests(TestCase):
    """
    Tests for Bug 7 (Modality Renderers - Tables & Code Blocks)
    and Bug 8 (Dynamic Section Header Marks & Instructions).
    """

    def test_docx_export_content_blocks_parsing(self):
        from papers.docx_export import ExamPaperDocxService
        service = ExamPaperDocxService()

        # Test mixed text + table + code
        raw_text = (
            "From the following ledger details:\n"
            "| Date | Particulars | Debit | Credit |\n"
            "| --- | --- | --- | --- |\n"
            "| 2024-01-01 | Cash A/c | 50000 | 0 |\n"
            "| 2024-01-02 | Capital A/c | 0 | 50000 |\n"
            "Execute the following python script:\n"
            "```python\n"
            "def balance(cr, dr):\n"
            "    return cr - dr\n"
            "```\n"
            "State the final net balance."
        )

        blocks = service._parse_content_blocks(raw_text)
        self.assertEqual(len(blocks), 5)
        self.assertEqual(blocks[0]["type"], "text")
        self.assertEqual(blocks[1]["type"], "table")
        self.assertEqual(len(blocks[1]["headers"]), 4)
        self.assertEqual(len(blocks[1]["rows"]), 2)
        self.assertEqual(blocks[2]["type"], "text")
        self.assertEqual(blocks[3]["type"], "code")
        self.assertEqual(blocks[3]["lang"], "python")
        self.assertIn("def balance", blocks[3]["content"])
        self.assertEqual(blocks[4]["type"], "text")

    def test_section_headers_uniform_vs_heterogeneous_marks(self):
        from papers.publishing import PaperPublishingService
        from papers.models import PaperVersion, Paper
        from schools.models import School
        from users.models import User

        school = School.objects.create(name="Header Test School")
        user = User.objects.create_user(username="test_head_teacher", password="pw", school=school)
        paper = Paper.objects.create(title="Mark Test Paper", created_by=user, school=school)

        # Case 1: Uniform 2-mark questions in VSA
        uniform_vsa_snapshot = [
            {"id": "q1", "question_text": "What is goodwill?", "question_type": "SHORT_ANSWER", "marks": 2.0},
            {"id": "q2", "question_text": "Define sacrificing ratio.", "question_type": "SHORT_ANSWER", "marks": 2.0},
        ]
        version_uniform = PaperVersion.objects.create(
            paper=paper,
            version_label="A",
            total_marks=4.0,
            question_snapshot=uniform_vsa_snapshot,
        )

        service = PaperPublishingService()
        sections_uniform = service.compile_sections(version_uniform)
        self.assertEqual(len(sections_uniform), 1)
        self.assertIn("(2 Marks Each)", sections_uniform[0].title)
        self.assertIn("carry 2 marks each", sections_uniform[0].instructions)

        # Case 2: Heterogeneous/varied marks in VSA (e.g. 1.5 marks and 2.0 marks)
        varied_vsa_snapshot = [
            {"id": "q1", "question_text": "Short definition 1", "question_type": "SHORT_ANSWER", "marks": 1.5},
            {"id": "q2", "question_text": "Short definition 2", "question_type": "SHORT_ANSWER", "marks": 2.0},
        ]
        version_varied = PaperVersion.objects.create(
            paper=paper,
            version_label="B",
            total_marks=3.5,
            question_snapshot=varied_vsa_snapshot,
        )

        sections_varied = service.compile_sections(version_varied)
        self.assertEqual(len(sections_varied), 1)
        self.assertNotIn("(2 Marks Each)", sections_varied[0].title)
        self.assertNotIn("carry 2 marks each", sections_varied[0].instructions)
        self.assertIn("Marks for each question are indicated against it", sections_varied[0].instructions)





