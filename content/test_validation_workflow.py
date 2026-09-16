"""
Comprehensive Test Suite for Task 8:
QBM -> Data Entry Operator -> Validator -> Approved Question Bank
Verifying all acceptance criteria and Definition of Done.
"""

from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from content.models import Book, Chapter, Question, QuestionVariant, Topic, ValidationStatus
from schools.models import School
from users.capability_defaults import (
    grant_deo_and_validator_defaults,
    grant_deo_defaults,
    grant_school_admin_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
    grant_validator_defaults,
)

User = get_user_model()


class ValidationWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Schools: School A (Validation Enabled - Mode A), School B (Validation Disabled - Mode B)
        self.school_a = School.objects.create(
            name="Greenwood High (Validation Enabled)",
            question_bank_enabled=True,
            validation_workflow_enabled=True,
        )
        self.school_b = School.objects.create(
            name="Oakridge Academy (Validation Disabled)",
            question_bank_enabled=True,
            validation_workflow_enabled=False,
        )

        # 2. Users
        # Super Admin
        self.super_admin = User.objects.create_user(
            username="superadmin_test", password="password123", role="Super Admin"
        )
        grant_super_admin_defaults(self.super_admin)

        # School Admin for School A
        self.admin_a = User.objects.create_user(
            username="admin_a", password="password123", school=self.school_a, role="School Admin"
        )
        grant_school_admin_defaults(self.admin_a)

        # DEO for School A
        self.deo_user = User.objects.create_user(
            username="deo_user", password="password123", school=self.school_a, role="Data Entry Operator"
        )
        grant_deo_defaults(self.deo_user)

        # Validator for School A
        self.validator_user = User.objects.create_user(
            username="validator_user", password="password123", school=self.school_a, role="Validator"
        )
        grant_validator_defaults(self.validator_user)

        # Dual-Role User for School A (holds BOTH DEO and Validator)
        self.dual_user = User.objects.create_user(
            username="dual_user", password="password123", school=self.school_a, role="DEO & Validator"
        )
        grant_deo_and_validator_defaults(self.dual_user)

        # Teacher for School A
        self.teacher_a = User.objects.create_user(
            username="teacher_a", password="password123", school=self.school_a, role="Teacher"
        )
        grant_teacher_defaults(self.teacher_a)

        # Teacher for School B (Mode B)
        self.teacher_b = User.objects.create_user(
            username="teacher_b", password="password123", school=self.school_b, role="Teacher"
        )
        grant_teacher_defaults(self.teacher_b)

        # 3. Content Hierarchy
        self.book = Book.objects.create(
            title="NCERT Mathematics Class 10",
            board="CBSE",
            subject="Mathematics",
            grade="Class 10",
        )
        self.chapter = Chapter.objects.create(
            book=self.book,
            title="Real Numbers",
            chapter_order=1,
        )
        self.topic1 = Topic.objects.create(chapter=self.chapter, name="Euclid Division Lemma")
        self.topic2 = Topic.objects.create(chapter=self.chapter, name="Fundamental Theorem of Arithmetic")

    # ------------------------------------------------------------------
    # 1. School Enablement & Role Assignment
    # ------------------------------------------------------------------

    def test_super_admin_controls_school_level_enablement(self):
        """Super Admin controls validation_workflow_enabled flag on School."""
        self.client.force_authenticate(user=self.super_admin)
        res = self.client.patch(
            f"/api/schools/{self.school_b.id}/",
            {"validation_workflow_enabled": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.school_b.refresh_from_db()
        self.assertTrue(self.school_b.validation_workflow_enabled)

    def test_school_admin_can_create_deo_and_validator_and_dual_role(self):
        """School Admin in a validation-enabled school can create DEO, Validator, and Dual-Role users."""
        self.client.force_authenticate(user=self.admin_a)

        # DEO
        res_deo = self.client.post(
            "/api/users/",
            {
                "username": "new_deo",
                "password": "SecureTestPass987!",
                "email": "new_deo@school.com",
                "mobile_number": "+919876543201",
                "school": self.school_a.id,
                "profile": "deo",
            },
            format="json",
        )
        self.assertEqual(res_deo.status_code, status.HTTP_201_CREATED)
        new_deo = User.objects.get(username="new_deo")
        self.assertTrue(new_deo.has_capability("DATA_ENTRY_OPERATOR"))
        self.assertEqual(new_deo.role_label, "Data Entry Operator")

        # Validator
        res_val = self.client.post(
            "/api/users/",
            {
                "username": "new_val",
                "password": "SecureTestPass987!",
                "email": "new_val@school.com",
                "mobile_number": "+919876543202",
                "school": self.school_a.id,
                "profile": "validator",
            },
            format="json",
        )
        self.assertEqual(res_val.status_code, status.HTTP_201_CREATED)
        new_val = User.objects.get(username="new_val")
        self.assertTrue(new_val.has_capability("VALIDATOR"))
        self.assertEqual(new_val.role_label, "Validator")

        # Dual role (same person assigned both)
        res_dual = self.client.post(
            "/api/users/",
            {
                "username": "new_dual",
                "password": "SecureTestPass987!",
                "email": "new_dual@school.com",
                "mobile_number": "+919876543203",
                "school": self.school_a.id,
                "profile": "deo_validator",
            },
            format="json",
        )
        self.assertEqual(res_dual.status_code, status.HTTP_201_CREATED)
        new_dual = User.objects.get(username="new_dual")
        self.assertTrue(new_dual.has_capability("DATA_ENTRY_OPERATOR"))
        self.assertTrue(new_dual.has_capability("VALIDATOR"))
        self.assertEqual(new_dual.role_label, "DEO & Validator")

    def test_deo_profile_blocked_if_school_validation_disabled(self):
        """School Admin cannot create DEO if school has validation_workflow_enabled=False."""
        admin_b = User.objects.create_user(
            username="admin_b", password="password123", school=self.school_b, role="School Admin"
        )
        grant_school_admin_defaults(admin_b)
        self.client.force_authenticate(user=admin_b)

        res = self.client.post(
            "/api/users/",
            {
                "username": "blocked_deo",
                "password": "SecureTestPass987!",
                "email": "blocked_deo@school.com",
                "mobile_number": "+919876543204",
                "school": self.school_b.id,
                "profile": "deo",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("validation workflow is not enabled", str(res.data))

    # ------------------------------------------------------------------
    # 2. DEO Entry with Multiple Topics & Submission
    # ------------------------------------------------------------------

    def test_deo_question_entry_with_multiple_topics(self):
        """DEO enters question with multiple topics; status defaults to SUBMITTED in validation-enabled school."""
        self.client.force_authenticate(user=self.deo_user)

        payload = {
            "topic_ids": [self.topic1.id, self.topic2.id],
            "question_text": "State the Fundamental Theorem of Arithmetic and apply Euclid lemma.",
            "question_type": "SHORT_ANSWER",
            "marks": "2.00",
            "difficulty": "MEDIUM",
            "learner_level": "INTERMEDIATE",
            "bank_source": "ORGANIZATION",
            "correct_answer": "Every composite number can be uniquely factored into primes.",
            "explanation": "Standard theorem definition.",
            "variants": [
                {
                    "variant_type": "SHORT_ANSWER",
                    "marks": "3.00",
                    "question_text": "State and prove Fundamental Theorem of Arithmetic.",
                    "correct_answer": "Full proof.",
                    "explanation": "Proof steps.",
                }
            ],
        }

        res = self.client.post("/api/questions/ingest/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        question = Question.objects.get(id=res.data["id"])
        self.assertEqual(question.validation_status, ValidationStatus.SUBMITTED)
        self.assertEqual(question.revision, 1)
        self.assertEqual(question.topics.count(), 2)
        self.assertEqual(question.variants.count(), 1)
        self.assertEqual(question.variants.first().difficulty, "MEDIUM")

        # Check initial audit history created
        self.assertEqual(question.validation_history.count(), 1)
        self.assertEqual(question.validation_history.first().action, "SUBMIT")

    # ------------------------------------------------------------------
    # 3. Validator Review, Permitted Edits & Content Restrictions
    # ------------------------------------------------------------------

    def test_validator_queue_and_permitted_metadata_edits(self):
        """Validator can view queue and edit topics, difficulty, parent marks, and variant marks."""
        # Create submitted question
        q = Question.objects.create(
            topic=self.topic1,
            question_text="Sample Question Text",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            bank_source="ORGANIZATION",
            school=self.school_a,
            created_by=self.deo_user,
            correct_answer="Sample Answer",
            validation_status=ValidationStatus.SUBMITTED,
        )
        q.topics.add(self.topic1)
        var = QuestionVariant.objects.create(
            parent_question=q,
            variant_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            question_text="Variant question text",
            correct_answer="Variant answer",
        )

        self.client.force_authenticate(user=self.validator_user)

        # 1. Validator views queue
        queue_res = self.client.get("/api/questions/validation-queue/")
        self.assertEqual(queue_res.status_code, status.HTTP_200_OK)
        queue_ids = [item["id"] for item in queue_res.data]
        self.assertIn(q.id, queue_ids)

        # 2. Validator patches permitted metadata (topics, difficulty, marks, variant marks)
        patch_payload = {
            "topic_ids": [self.topic1.id, self.topic2.id],
            "difficulty": "HARD",  # Should cascade to variant
            "marks": "3.00",
            "variant_marks": [{"id": var.id, "marks": "4.00"}],
        }
        patch_res = self.client.patch(
            f"/api/questions/{q.id}/validator-metadata/",
            patch_payload,
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        q.refresh_from_db()
        var.refresh_from_db()
        self.assertEqual(q.difficulty, "HARD")
        self.assertEqual(var.difficulty, "HARD")  # Confirms cascade!
        self.assertEqual(q.marks, Decimal("3.00"))
        self.assertEqual(var.marks, Decimal("4.00"))
        self.assertEqual(q.topics.count(), 2)

        # 3. Check history has METADATA_UPDATE log
        hist = q.validation_history.filter(action="METADATA_UPDATE").first()
        self.assertIsNotNone(hist)
        self.assertIn("difficulty", hist.changed_fields)
        self.assertEqual(hist.changed_fields["difficulty"]["new"], "HARD")

    def test_validator_prohibited_from_editing_question_content_directly(self):
        """Validator cannot directly modify question text, options, or answers (HTTP 403)."""
        q = Question.objects.create(
            topic=self.topic1,
            question_text="Original question wording",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            bank_source="ORGANIZATION",
            school=self.school_a,
            created_by=self.deo_user,
            correct_answer="Original Answer",
            validation_status=ValidationStatus.SUBMITTED,
        )

        self.client.force_authenticate(user=self.validator_user)

        res = self.client.patch(
            f"/api/questions/{q.id}/",
            {"question_text": "Rewritten wording by validator"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("strictly prohibited from directly modifying question content", str(res.data))

    # ------------------------------------------------------------------
    # 4. Validator Action Matrix & Comment Enforcement
    # ------------------------------------------------------------------

    def test_validator_action_matrix_enforcement(self):
        """Send for correction and reject require comments; approve makes comment optional."""
        q = Question.objects.create(
            topic=self.topic1,
            question_text="Question text for action matrix",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            bank_source="ORGANIZATION",
            school=self.school_a,
            created_by=self.deo_user,
            correct_answer="Answer",
            validation_status=ValidationStatus.SUBMITTED,
        )

        self.client.force_authenticate(user=self.validator_user)

        # Send for correction without comment -> FAILS
        res_fail_corr = self.client.post(
            f"/api/questions/{q.id}/validate/",
            {"action": "SEND_FOR_CORRECTION", "comment": ""},
            format="json",
        )
        self.assertEqual(res_fail_corr.status_code, status.HTTP_400_BAD_REQUEST)

        # Reject without comment -> FAILS
        res_fail_rej = self.client.post(
            f"/api/questions/{q.id}/validate/",
            {"action": "REJECT", "comment": ""},
            format="json",
        )
        self.assertEqual(res_fail_rej.status_code, status.HTTP_400_BAD_REQUEST)

        # Send for correction with comment -> SUCCEEDS
        res_corr = self.client.post(
            f"/api/questions/{q.id}/validate/",
            {"action": "SEND_FOR_CORRECTION", "comment": "Typo in question wording."},
            format="json",
        )
        self.assertEqual(res_corr.status_code, status.HTTP_200_OK)
        q.refresh_from_db()
        self.assertEqual(q.validation_status, ValidationStatus.CORRECTION_REQUIRED)

    # ------------------------------------------------------------------
    # 5. Content Correction Workflow & Resubmission
    # ------------------------------------------------------------------

    def test_deo_content_correction_and_resubmission(self):
        """DEO edits question content, resubmits (increments revision), and Validator approves."""
        q = Question.objects.create(
            topic=self.topic1,
            question_text="Initial text with error",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="MEDIUM",
            learner_level="INTERMEDIATE",
            bank_source="ORGANIZATION",
            school=self.school_a,
            created_by=self.deo_user,
            correct_answer="Initial answer",
            validation_status=ValidationStatus.CORRECTION_REQUIRED,
            revision=1,
        )

        # 1. DEO corrects content and calls resubmit
        self.client.force_authenticate(user=self.deo_user)
        res_resubmit = self.client.post(
            f"/api/questions/{q.id}/resubmit/",
            {
                "question_text": "Corrected question wording after validator review.",
                "comment": "Fixed the typo as requested.",
            },
            format="json",
        )
        self.assertEqual(res_resubmit.status_code, status.HTTP_200_OK)

        q.refresh_from_db()
        self.assertEqual(q.question_text, "Corrected question wording after validator review.")
        self.assertEqual(q.validation_status, ValidationStatus.SUBMITTED)
        self.assertEqual(q.revision, 2)

        # 2. Validator approves
        self.client.force_authenticate(user=self.validator_user)
        res_approve = self.client.post(
            f"/api/questions/{q.id}/validate/",
            {"action": "APPROVE"},
            format="json",
        )
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)

        q.refresh_from_db()
        self.assertEqual(q.validation_status, ValidationStatus.APPROVED)

    # ------------------------------------------------------------------
    # 6. Approved Question Bank Gate in Paper Generation
    # ------------------------------------------------------------------

    def test_approved_question_bank_gate_in_mode_a_vs_mode_b(self):
        """Validation-enabled school excludes unapproved questions; validation-disabled school includes active questions."""
        from papers.models import Paper

        # Create unapproved question in School A
        q_unapproved_a = Question.objects.create(
            topic=self.topic1,
            question_text="Unapproved question for School A",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="MEDIUM",
            learner_level="INTERMEDIATE",
            bank_source="ORGANIZATION",
            school=self.school_a,
            created_by=self.teacher_a,
            correct_answer="Answer",
            validation_status=ValidationStatus.SUBMITTED,
        )

        # Create paper for Teacher A (School A - validation enabled)
        paper_a = Paper.objects.create(
            title="School A Test Paper",
            chapter=self.chapter,
            school=self.school_a,
            created_by=self.teacher_a,
        )

        self.client.force_authenticate(user=self.teacher_a)
        res_select_a = self.client.post(
            f"/api/papers/{paper_a.id}/select-questions/",
            {"difficulty": "MEDIUM"},
            format="json",
        )
        self.assertEqual(res_select_a.status_code, status.HTTP_200_OK)
        returned_qids_a = [q["id"] for q in res_select_a.data["questions"]]
        # Must NOT contain unapproved question!
        self.assertNotIn(q_unapproved_a.id, returned_qids_a)

        # Approve the question
        q_unapproved_a.validation_status = ValidationStatus.APPROVED
        q_unapproved_a.save()

        # Now it MUST be returned!
        res_select_a2 = self.client.post(
            f"/api/papers/{paper_a.id}/select-questions/",
            {"difficulty": "MEDIUM"},
            format="json",
        )
        self.assertEqual(res_select_a2.status_code, status.HTTP_200_OK)
        returned_qids_a2 = [q["id"] for q in res_select_a2.data["questions"]]
        self.assertIn(q_unapproved_a.id, returned_qids_a2)

        # MODE B: School B (Validation Disabled)
        q_school_b = Question.objects.create(
            topic=self.topic1,
            question_text="Direct question for School B",
            question_type="SHORT_ANSWER",
            marks=Decimal("2.00"),
            difficulty="EASY",
            learner_level="BEGINNER",
            bank_source="ORGANIZATION",
            school=self.school_b,
            created_by=self.teacher_b,
            correct_answer="Answer",
            validation_status=ValidationStatus.DRAFT,  # Even in draft or without validation
        )
        paper_b = Paper.objects.create(
            title="School B Test Paper",
            chapter=self.chapter,
            school=self.school_b,
            created_by=self.teacher_b,
        )
        self.client.force_authenticate(user=self.teacher_b)
        res_select_b = self.client.post(
            f"/api/papers/{paper_b.id}/select-questions/",
            {"difficulty": "EASY"},
            format="json",
        )
        self.assertEqual(res_select_b.status_code, status.HTTP_200_OK)
        returned_qids_b = [q["id"] for q in res_select_b.data["questions"]]
        # In validation-disabled school, gate is bypassed
        self.assertIn(q_school_b.id, returned_qids_b)
