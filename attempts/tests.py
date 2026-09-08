"""
Tests for the attempts app.

Covers:
1. Student starts attempt for assigned ONLINE delivery (creates Attempt + blank answers, logs audit)
2. Attempt start is idempotent (resuming returns existing attempt, no duplicate)
3. PRINT mode delivery rejects attempt start (400)
4. Unassigned student cannot start attempt (403)
5. Time window enforcement (available_from / available_until)
6. Incremental answer saving (PATCH student_response while IN_PROGRESS)
7. Other student cannot modify answers (403)
8. Cannot modify answers on submitted attempt (400)
9. Double submit protection (400 on second submit)
10. Auto-grading of MCQ questions (correct vs incorrect)
11. Short/long answers remain pending manual review (status SUBMITTED)
12. Pure MCQ paper becomes EVALUATED directly on submit
13. Student result view scoping (student sees own, cannot see others)
14. Teacher result view scoping (teacher sees delivery they created, other teacher cannot)
15. Delivery roster results endpoint (teacher view, student 403)
16. Teacher manual grading (updates score, transitions to EVALUATED, logs audit)
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from content.models import Book, Chapter, Difficulty, LearnerLevel, Question, QuestionType, Topic
from core.models import AuditLog
from papers.models import Delivery, DeliveryMode, DeliveryStatus, Paper, PaperVersion, VersionStatus
from schools.models import School
from users.capability_defaults import (
    grant_school_admin_defaults,
    grant_student_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
)
from users.models import User
from .models import Answer, Attempt, AttemptStatus


class AttemptsWorkflowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Create schools
        cls.school_a = School.objects.create(name="St. Jude Academy")

        # Create Admins & Teachers
        cls.super_admin = User.objects.create_user(
            username="super_admin", password="password123", email="sa@system.org"
        )
        grant_super_admin_defaults(cls.super_admin)

        cls.school_admin = User.objects.create_user(
            username="school_admin", password="password123", email="admin@stjude.org", school=cls.school_a
        )
        grant_school_admin_defaults(cls.school_admin, granted_by=cls.super_admin)

        cls.teacher_1 = User.objects.create_user(
            username="teacher_1",
            password="password123",
            email="teacher1@stjude.org",
            school=cls.school_a,
            created_by=cls.school_admin,
        )
        grant_teacher_defaults(cls.teacher_1, granted_by=cls.school_admin)

        cls.teacher_2 = User.objects.create_user(
            username="teacher_2",
            password="password123",
            email="teacher2@stjude.org",
            school=cls.school_a,
            created_by=cls.school_admin,
        )
        grant_teacher_defaults(cls.teacher_2, granted_by=cls.school_admin)

        # Students
        cls.student_1 = User.objects.create_user(
            username="student_1",
            password="password123",
            email="student1@stjude.org",
            school=cls.school_a,
            created_by=cls.teacher_1,
        )
        grant_student_defaults(cls.student_1, granted_by=cls.teacher_1)

        cls.student_2 = User.objects.create_user(
            username="student_2",
            password="password123",
            email="student2@stjude.org",
            school=cls.school_a,
            created_by=cls.teacher_1,
        )
        grant_student_defaults(cls.student_2, granted_by=cls.teacher_1)

        cls.student_unassigned = User.objects.create_user(
            username="student_unassigned",
            password="password123",
            email="unassigned@stjude.org",
            school=cls.school_a,
            created_by=cls.teacher_2,
        )
        grant_student_defaults(cls.student_unassigned, granted_by=cls.teacher_2)

        # Content
        cls.book = Book.objects.create(
            title="Science 10", subject="Science", grade="10", publisher="NCERT", is_active=True
        )
        cls.chapter = Chapter.objects.create(book=cls.book, title="Chemical Reactions", chapter_order=1)
        cls.topic = Topic.objects.create(chapter=cls.chapter, name="Types of Reactions")

        # Questions
        # Q1: MCQ (2 marks)
        cls.q1 = Question.objects.create(
            topic=cls.topic,
            question_text="Which gas is released during photosynthesis?",
            question_type=QuestionType.MCQ,
            marks=2,
            difficulty=Difficulty.EASY,
            learner_level=LearnerLevel.BEGINNER,
            options={"A": "Nitrogen", "B": "Oxygen", "C": "Carbon Dioxide"},
            correct_answer="B",
            is_active=True,
        )
        # Q2: SHORT_ANSWER (3 marks)
        cls.q2 = Question.objects.create(
            topic=cls.topic,
            question_text="Define an exothermic reaction with an example.",
            question_type=QuestionType.SHORT_ANSWER,
            marks=3,
            difficulty=Difficulty.MEDIUM,
            learner_level=LearnerLevel.INTERMEDIATE,
            options=None,
            correct_answer="Reactions that release heat. Example: respiration.",
            is_active=True,
        )
        # Q3: MCQ (1 mark)
        cls.q3 = Question.objects.create(
            topic=cls.topic,
            question_text="What is the chemical formula for rust?",
            question_type=QuestionType.MCQ,
            marks=1,
            difficulty=Difficulty.EASY,
            learner_level=LearnerLevel.BEGINNER,
            options={"A": "Fe2O3", "B": "FeO", "C": "Fe3O4"},
            correct_answer="A",
            is_active=True,
        )

        # Paper and Version
        cls.paper = Paper.objects.create(
            title="Science Test 1",
            instructions="Answer all questions.",
            created_by=cls.teacher_1,
            school=cls.school_a,
            chapter=cls.chapter,
            status="FINALIZED",
        )

        cls.version_mixed = PaperVersion.objects.create(
            paper=cls.paper,
            version_label="A",
            question_snapshot=[
                {
                    "question_id": cls.q1.id,
                    "question_text": cls.q1.question_text,
                    "question_type": cls.q1.question_type,
                    "marks": 2.0,
                    "options": cls.q1.options,
                    "correct_answer": cls.q1.correct_answer,
                },
                {
                    "question_id": cls.q2.id,
                    "question_text": cls.q2.question_text,
                    "question_type": cls.q2.question_type,
                    "marks": 3.0,
                    "options": None,
                    "correct_answer": cls.q2.correct_answer,
                },
            ],
            status=VersionStatus.FINALIZED,
        )

        cls.version_pure_mcq = PaperVersion.objects.create(
            paper=cls.paper,
            version_label="B",
            question_snapshot=[
                {
                    "question_id": cls.q1.id,
                    "question_text": cls.q1.question_text,
                    "question_type": cls.q1.question_type,
                    "marks": 2.0,
                    "options": cls.q1.options,
                    "correct_answer": cls.q1.correct_answer,
                },
                {
                    "question_id": cls.q3.id,
                    "question_text": cls.q3.question_text,
                    "question_type": cls.q3.question_type,
                    "marks": 1.0,
                    "options": cls.q3.options,
                    "correct_answer": cls.q3.correct_answer,
                },
            ],
            status=VersionStatus.FINALIZED,
        )

        # Deliveries
        cls.online_delivery = Delivery.objects.create(
            paper_version=cls.version_mixed,
            mode=DeliveryMode.ONLINE,
            status=DeliveryStatus.ACTIVE,
            created_by=cls.teacher_1,
        )
        cls.online_delivery.assigned_students.set([cls.student_1, cls.student_2])

        cls.print_delivery = Delivery.objects.create(
            paper_version=cls.version_mixed,
            mode=DeliveryMode.PRINT,
            status=DeliveryStatus.ACTIVE,
            created_by=cls.teacher_1,
        )

    # ------------------------------------------------------------------
    # 1. Attempt Start & Question Representation
    # ------------------------------------------------------------------

    def test_student_starts_online_attempt_creates_attempt_and_blank_answers(self):
        self.client.force_authenticate(user=self.student_1)
        res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], AttemptStatus.IN_PROGRESS)
        self.assertEqual(Decimal(str(res.data["total_marks"])), Decimal("5.00"))
        self.assertEqual(len(res.data["questions"]), 2)

        # Verify correct_answer is NOT revealed in start response
        for q in res.data["questions"]:
            self.assertNotIn("correct_answer", q)

        # Verify DB Attempt and Answers
        attempt = Attempt.objects.get(delivery=self.online_delivery, student=self.student_1)
        self.assertEqual(attempt.status, AttemptStatus.IN_PROGRESS)
        self.assertEqual(attempt.answers.count(), 2)

        # Verify AuditLog
        audit_entry = AuditLog.objects.filter(action="attempt.started", target_id=str(attempt.id)).first()
        self.assertIsNotNone(audit_entry)

    # ------------------------------------------------------------------
    # 2. Idempotent Start / Resume
    # ------------------------------------------------------------------

    def test_attempt_start_is_idempotent_resume(self):
        self.client.force_authenticate(user=self.student_1)

        # First call
        res1 = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        attempt_id_1 = res1.data["attempt_id"]

        # Second call
        res2 = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        attempt_id_2 = res2.data["attempt_id"]

        self.assertEqual(attempt_id_1, attempt_id_2)
        self.assertEqual(Attempt.objects.filter(delivery=self.online_delivery, student=self.student_1).count(), 1)

    # ------------------------------------------------------------------
    # 3. PRINT Mode Rejection
    # ------------------------------------------------------------------

    def test_print_mode_delivery_rejects_attempt_start(self):
        self.client.force_authenticate(user=self.student_1)
        res = self.client.get(f"/api/deliveries/{self.print_delivery.id}/start/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ONLINE", res.data["detail"])

    # ------------------------------------------------------------------
    # 4. Unassigned Student Rejection
    # ------------------------------------------------------------------

    def test_unassigned_student_cannot_start_attempt(self):
        self.client.force_authenticate(user=self.student_unassigned)
        res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # 5. Availability Time Window
    # ------------------------------------------------------------------

    def test_attempt_outside_available_window_rejected(self):
        # Delivery in future
        future_delivery = Delivery.objects.create(
            paper_version=self.version_mixed,
            mode=DeliveryMode.ONLINE,
            available_from=timezone.now() + timedelta(days=1),
            created_by=self.teacher_1,
        )
        future_delivery.assigned_students.set([self.student_1])

        self.client.force_authenticate(user=self.student_1)
        res = self.client.get(f"/api/deliveries/{future_delivery.id}/start/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not available yet", res.data["detail"])

        # Expired delivery
        past_delivery = Delivery.objects.create(
            paper_version=self.version_mixed,
            mode=DeliveryMode.ONLINE,
            available_until=timezone.now() - timedelta(days=1),
            created_by=self.teacher_1,
        )
        past_delivery.assigned_students.set([self.student_1])

        res2 = self.client.get(f"/api/deliveries/{past_delivery.id}/start/")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res2.data["detail"])

    # ------------------------------------------------------------------
    # 6. Incremental Answer Saving
    # ------------------------------------------------------------------

    def test_student_can_save_answer_incrementally(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # Save answer for Q1
        patch_res = self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q1.id}/",
            {"student_response": "B"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data["student_response"], "B")

        ans = Answer.objects.get(attempt_id=attempt_id, question_id=self.q1.id)
        self.assertEqual(ans.student_response, "B")

    # ------------------------------------------------------------------
    # 7. Student Isolation on Answer Saving
    # ------------------------------------------------------------------

    def test_other_student_cannot_modify_answer(self):
        # Student 1 starts attempt
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # Student 2 tries to modify Student 1's answer
        self.client.force_authenticate(user=self.student_2)
        res = self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q1.id}/",
            {"student_response": "A"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # 8. Modifying Submitted Attempt Blocked
    # ------------------------------------------------------------------

    def test_cannot_modify_answer_on_submitted_attempt(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # Submit attempt
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        # Try to modify answer
        res = self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q1.id}/",
            {"student_response": "C"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # 9. Double Submit Protection
    # ------------------------------------------------------------------

    def test_submit_double_submit_protection(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # First submit -> succeeds
        res1 = self.client.post(f"/api/attempts/{attempt_id}/submit/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second submit -> fails with 400
        res2 = self.client.post(f"/api/attempts/{attempt_id}/submit/")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already been submitted", res2.data["detail"])

    # ------------------------------------------------------------------
    # 10. Auto-Grading of MCQ Questions
    # ------------------------------------------------------------------

    def test_auto_grading_mcq_correct_and_incorrect(self):
        # Delivery with version_pure_mcq (Q1: 2 marks, ans B; Q3: 1 mark, ans A)
        delivery = Delivery.objects.create(
            paper_version=self.version_pure_mcq,
            mode=DeliveryMode.ONLINE,
            status=DeliveryStatus.ACTIVE,
            created_by=self.teacher_1,
        )
        delivery.assigned_students.set([self.student_1])

        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # Student answers: Q1="B" (correct), Q3="C" (incorrect, correct is A)
        self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q1.id}/",
            {"student_response": "B"},
            format="json",
        )
        self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q3.id}/",
            {"student_response": "C"},
            format="json",
        )

        submit_res = self.client.post(f"/api/attempts/{attempt_id}/submit/")
        self.assertEqual(submit_res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(submit_res.data["score"])), Decimal("2.00"))

        ans_q1 = Answer.objects.get(attempt_id=attempt_id, question_id=self.q1.id)
        self.assertTrue(ans_q1.is_correct)
        self.assertEqual(ans_q1.marks_awarded, Decimal("2.00"))

        ans_q3 = Answer.objects.get(attempt_id=attempt_id, question_id=self.q3.id)
        self.assertFalse(ans_q3.is_correct)
        self.assertEqual(ans_q3.marks_awarded, Decimal("0.00"))

    # ------------------------------------------------------------------
    # 11. Short & Long Answers Pending Manual Review
    # ------------------------------------------------------------------

    def test_short_and_long_answer_pending_manual_review_and_status_submitted(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # Answer Q1 (MCQ) correct, Q2 (SHORT_ANSWER) with some text
        self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q1.id}/",
            {"student_response": "B"},
            format="json",
        )
        self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q2.id}/",
            {"student_response": "Heat is given out during reaction."},
            format="json",
        )

        submit_res = self.client.post(f"/api/attempts/{attempt_id}/submit/")
        self.assertEqual(submit_res.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_res.data["status"], AttemptStatus.SUBMITTED)
        self.assertEqual(Decimal(str(submit_res.data["score"])), Decimal("2.00"))

        ans_q2 = Answer.objects.get(attempt_id=attempt_id, question_id=self.q2.id)
        self.assertIsNone(ans_q2.is_correct)
        self.assertIsNone(ans_q2.marks_awarded)

    # ------------------------------------------------------------------
    # 12. Pure MCQ Paper Transitions to EVALUATED Directly
    # ------------------------------------------------------------------

    def test_pure_mcq_paper_evaluates_directly_on_submit(self):
        delivery = Delivery.objects.create(
            paper_version=self.version_pure_mcq,
            mode=DeliveryMode.ONLINE,
            status=DeliveryStatus.ACTIVE,
            created_by=self.teacher_1,
        )
        delivery.assigned_students.set([self.student_1])

        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        submit_res = self.client.post(f"/api/attempts/{attempt_id}/submit/")
        self.assertEqual(submit_res.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_res.data["status"], AttemptStatus.EVALUATED)

    # ------------------------------------------------------------------
    # 13. Student View Result Scoping
    # ------------------------------------------------------------------

    def test_student_views_own_result_and_cannot_view_others(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        # Student 1 views own result
        res = self.client.get(f"/api/attempts/{attempt_id}/result/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res.data["score"])), Decimal("0.00"))
        self.assertEqual(len(res.data["answers"]), 2)

        # Student 2 tries to view Student 1's result -> 403 Forbidden
        self.client.force_authenticate(user=self.student_2)
        res_other = self.client.get(f"/api/attempts/{attempt_id}/result/")
        self.assertEqual(res_other.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # 14. Teacher View Result Scoping
    # ------------------------------------------------------------------

    def test_teacher_views_result_for_delivery_they_created(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        # Teacher 1 (creator of delivery) can view
        self.client.force_authenticate(user=self.teacher_1)
        res_t1 = self.client.get(f"/api/attempts/{attempt_id}/result/")
        self.assertEqual(res_t1.status_code, status.HTTP_200_OK)
        self.assertEqual(res_t1.data["student_username"], "student_1")
        # Teacher view includes grading aids
        self.assertIn("needs_grading", res_t1.data["answers"][1])

        # Teacher 2 (different teacher) cannot view
        self.client.force_authenticate(user=self.teacher_2)
        res_t2 = self.client.get(f"/api/attempts/{attempt_id}/result/")
        self.assertEqual(res_t2.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # 15. Delivery Roster Endpoint
    # ------------------------------------------------------------------

    def test_delivery_results_roster_endpoint(self):
        # Student 1 submits attempt
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        # Teacher 1 views roster
        self.client.force_authenticate(user=self.teacher_1)
        res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/results/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_students_assigned"], 2)
        self.assertEqual(res.data["attempts_count"], 1)
        self.assertEqual(len(res.data["attempts"]), 1)
        self.assertEqual(res.data["attempts"][0]["student_username"], "student_1")

        # Student cannot access delivery roster
        self.client.force_authenticate(user=self.student_1)
        res_student = self.client.get(f"/api/deliveries/{self.online_delivery.id}/results/")
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # 16. Manual Grading Flow
    # ------------------------------------------------------------------

    def test_teacher_manual_grading_updates_score_and_transitions_to_evaluated(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # Q1 MCQ answer = B (correct, 2 marks)
        self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q1.id}/",
            {"student_response": "B"},
            format="json",
        )
        # Q2 Short answer
        self.client.patch(
            f"/api/attempts/{attempt_id}/answers/{self.q2.id}/",
            {"student_response": "Reactions that give off heat."},
            format="json",
        )
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        attempt = Attempt.objects.get(id=attempt_id)
        self.assertEqual(attempt.status, AttemptStatus.SUBMITTED)
        self.assertEqual(attempt.score, Decimal("2.00"))

        # Teacher 1 manually grades Q2 (out of 3 marks, awards 2.5)
        self.client.force_authenticate(user=self.teacher_1)
        grade_res = self.client.post(
            f"/api/attempts/{attempt_id}/answers/{self.q2.id}/grade/",
            {"marks_awarded": 2.5, "is_correct": True},
            format="json",
        )
        self.assertEqual(grade_res.status_code, status.HTTP_200_OK)
        self.assertEqual(grade_res.data["marks_awarded"], 2.5)
        self.assertEqual(grade_res.data["attempt_score"], 4.5)
        self.assertEqual(grade_res.data["attempt_status"], AttemptStatus.EVALUATED)

        # Verify DB attempt state
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, AttemptStatus.EVALUATED)
        self.assertEqual(attempt.score, Decimal("4.50"))

        # Verify AuditLog
        audit_entry = AuditLog.objects.filter(action="answer.graded").first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.user, self.teacher_1)

    # ------------------------------------------------------------------
    # 17. Start Attempt on Already Submitted Test Returns attempt_id
    # ------------------------------------------------------------------

    def test_start_attempt_already_submitted_returns_attempt_id(self):
        self.client.force_authenticate(user=self.student_1)
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        # Try to start/resume again
        retry_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        self.assertEqual(retry_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(retry_res.data["detail"], "You have already submitted this test.")
        self.assertEqual(retry_res.data["attempt_id"], attempt_id)
        self.assertEqual(retry_res.data["status"], AttemptStatus.SUBMITTED)

    # ------------------------------------------------------------------
    # 18. Delivery List and Detail Includes my_attempt as Single Source of Truth
    # ------------------------------------------------------------------

    def test_delivery_list_and_detail_includes_my_attempt_for_student(self):
        self.client.force_authenticate(user=self.student_1)

        # Before starting: my_attempt should be None
        list_res = self.client.get("/api/deliveries/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        delivery_data = next(d for d in list_res.data if d["id"] == self.online_delivery.id)
        self.assertIsNone(delivery_data["my_attempt"])

        # Start attempt and submit
        start_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/start/")
        attempt_id = start_res.data["attempt_id"]

        # In-progress: my_attempt should have status IN_PROGRESS
        list_res = self.client.get("/api/deliveries/")
        delivery_data = next(d for d in list_res.data if d["id"] == self.online_delivery.id)
        self.assertIsNotNone(delivery_data["my_attempt"])
        self.assertEqual(delivery_data["my_attempt"]["id"], attempt_id)
        self.assertEqual(delivery_data["my_attempt"]["status"], AttemptStatus.IN_PROGRESS)

        # Submit
        self.client.post(f"/api/attempts/{attempt_id}/submit/")

        # After submission: my_attempt status should be SUBMITTED
        detail_res = self.client.get(f"/api/deliveries/{self.online_delivery.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(detail_res.data["my_attempt"])
        self.assertEqual(detail_res.data["my_attempt"]["id"], attempt_id)
        self.assertEqual(detail_res.data["my_attempt"]["status"], AttemptStatus.SUBMITTED)
        self.assertIn("score", detail_res.data["my_attempt"])
        self.assertIn("max_score", detail_res.data["my_attempt"])
