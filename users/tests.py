from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from schools.models import School
from users.capability_defaults import (
    grant_school_admin_defaults,
    grant_student_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
)
from users.models import Capability, CapabilityName, User, UserCapability


class RolePermissionBoundaryTests(TestCase):
    """
    Test suite verifying the 4-role hierarchy permission boundaries:
    Super Admin -> School Admin -> Teacher -> Student.
    10 total capabilities across the system.
    """

    def setUp(self):
        self.client = APIClient()

        # Ensure all standard capabilities exist
        for cap_name in CapabilityName.values:
            Capability.objects.get_or_create(name=cap_name)

        # Schools
        self.school1 = School.objects.create(name="School One")
        self.school2 = School.objects.create(name="School Two")

        # 1. Super Admin (all 10 caps, school=None)
        self.superadmin = User.objects.create_user(
            username="superadmin_test",
            email="sa@test.com",
            password="password123",
            role="Super Admin",
            is_staff=True,
            is_superuser=True,
            school=None,
        )
        grant_super_admin_defaults(self.superadmin)

        # 2. School Admin 1 (School 1: 3 caps)
        self.school_admin1 = User.objects.create_user(
            username="schooladmin1_test",
            email="admin1@school1.edu",
            password="password123",
            role="School Admin",
            school=self.school1,
            created_by=self.superadmin,
        )
        grant_school_admin_defaults(self.school_admin1, granted_by=self.superadmin)

        # School Admin 2 (School 2: 3 caps)
        self.school_admin2 = User.objects.create_user(
            username="schooladmin2_test",
            email="admin2@school2.edu",
            password="password123",
            role="School Admin",
            school=self.school2,
            created_by=self.superadmin,
        )
        grant_school_admin_defaults(self.school_admin2, granted_by=self.superadmin)

        # 3. Teacher 1 (School 1: 4 caps)
        self.teacher1 = User.objects.create_user(
            username="teacher1_test",
            email="teacher1@school1.edu",
            password="password123",
            role="Teacher",
            school=self.school1,
            created_by=self.school_admin1,
        )
        grant_teacher_defaults(self.teacher1, granted_by=self.school_admin1)

        # 4. Student 1 (School 1: 2 caps)
        self.student1 = User.objects.create_user(
            username="student1_test",
            email="student1@school1.edu",
            password="password123",
            role="Student",
            school=self.school1,
            created_by=self.teacher1,
        )
        grant_student_defaults(self.student1, granted_by=self.teacher1)

    # ------------------------------------------------------------------
    # Super Admin Scope Tests
    # ------------------------------------------------------------------

    def test_superadmin_cannot_grant_out_of_scope_to_teacher(self):
        """Super Admin cannot grant CREATE_SCHOOL or CREATE_SCHOOL_ADMIN to Teacher."""
        self.client.force_authenticate(user=self.superadmin)

        url = f"/api/users/{self.teacher1.id}/permissions/"
        res = self.client.post(url, {"capability_name": "CREATE_SCHOOL"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("out of scope", res.data["detail"])

        res2 = self.client.post(url, {"capability_name": "CREATE_SCHOOL_ADMIN"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        res3 = self.client.post(url, {"capability_name": "VIEW_SCHOOL_WIDE_CONTROLS"}, format="json")
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

    def test_superadmin_cannot_grant_out_of_scope_to_school_admin(self):
        """Super Admin cannot grant CREATE_SCHOOL or CREATE_PAPER to School Admin."""
        self.client.force_authenticate(user=self.superadmin)

        url = f"/api/users/{self.school_admin1.id}/permissions/"
        res = self.client.post(url, {"capability_name": "CREATE_SCHOOL"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res2 = self.client.post(url, {"capability_name": "CREATE_PAPER"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_superadmin_can_modify_allowed_teacher_grants(self):
        """Super Admin can revoke and grant allowed teacher capabilities."""
        self.client.force_authenticate(user=self.superadmin)

        # Teacher has CREATE_STUDENT by default
        self.assertTrue(self.teacher1.has_capability("CREATE_STUDENT"))

        # Revoke CREATE_STUDENT
        res = self.client.delete(f"/api/users/{self.teacher1.id}/permissions/CREATE_STUDENT/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.teacher1.has_capability("CREATE_STUDENT"))

        # Role label remains "Teacher" (does NOT mutate to "Custom")
        self.teacher1.refresh_from_db()
        self.assertEqual(self.teacher1.role_label, "Teacher")

        # Re-grant CREATE_STUDENT
        res2 = self.client.post(
            f"/api/users/{self.teacher1.id}/permissions/",
            {"capability_name": "CREATE_STUDENT"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertTrue(self.teacher1.has_capability("CREATE_STUDENT"))

    # ------------------------------------------------------------------
    # School Admin Scope & Hierarchy Tests
    # ------------------------------------------------------------------

    def test_school_admin_can_modify_teacher_in_same_school(self):
        """School Admin can revoke and grant allowed capabilities for Teacher in own school."""
        self.client.force_authenticate(user=self.school_admin1)

        # Revoke CREATE_PAPER from Teacher 1
        res = self.client.delete(f"/api/users/{self.teacher1.id}/permissions/CREATE_PAPER/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.teacher1.has_capability("CREATE_PAPER"))

        # Re-grant CREATE_PAPER
        res2 = self.client.post(
            f"/api/users/{self.teacher1.id}/permissions/",
            {"capability_name": "CREATE_PAPER"},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertTrue(self.teacher1.has_capability("CREATE_PAPER"))

    def test_school_admin_cannot_grant_out_of_scope_to_teacher(self):
        """School Admin cannot grant out-of-scope capabilities to Teacher."""
        self.client.force_authenticate(user=self.school_admin1)

        url = f"/api/users/{self.teacher1.id}/permissions/"
        res = self.client.post(url, {"capability_name": "VIEW_SCHOOL_WIDE_CONTROLS"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("out of scope", res.data["detail"])

    def test_school_admin_cannot_modify_other_school_admin_or_superadmin(self):
        """School Admin cannot modify another School Admin or Super Admin."""
        self.client.force_authenticate(user=self.school_admin1)

        # Attempt to modify Super Admin
        res1 = self.client.delete(f"/api/users/{self.superadmin.id}/permissions/CREATE_SCHOOL/")
        # Not found in scoped queryset or forbidden
        self.assertIn(res1.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # Attempt to modify another School Admin in different school
        res2 = self.client.delete(f"/api/users/{self.school_admin2.id}/permissions/CREATE_TEACHER/")
        self.assertIn(res2.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    # ------------------------------------------------------------------
    # Teacher & Student Unauthorized Management Tests
    # ------------------------------------------------------------------

    def test_teacher_cannot_manage_permissions(self):
        """Teachers cannot grant or revoke permissions for anyone."""
        self.client.force_authenticate(user=self.teacher1)

        # Attempt to modify Student 1
        res = self.client.delete(f"/api/users/{self.student1.id}/permissions/ATTEMPT_TEST/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class CompulsoryMobileAndEmailTests(TestCase):
    """
    Test suite verifying compulsory email and +91 10-digit mobile number rules.
    """

    def setUp(self):
        self.client = APIClient()
        for cap_name in CapabilityName.values:
            Capability.objects.get_or_create(name=cap_name)
        self.school = School.objects.create(name="Demo School")
        self.school_admin = User.objects.create_user(
            username="school_admin_test",
            email="admin@demo.com",
            mobile_number="+919876543210",
            role="School Admin",
            school=self.school,
        )
        grant_school_admin_defaults(self.school_admin)
        self.client.force_authenticate(user=self.school_admin)

    def test_create_user_fails_without_email(self):
        res = self.client.post(
            "/api/users/",
            {
                "username": "no_email_user",
                "password": "password123!",
                "mobile_number": "+919876543210",
                "profile": "teacher",
                "school": self.school.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res.data)

    def test_create_user_fails_without_mobile_number(self):
        res = self.client.post(
            "/api/users/",
            {
                "username": "no_mob_user",
                "password": "password123!",
                "email": "valid@email.com",
                "profile": "teacher",
                "school": self.school.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mobile_number", res.data)

    def test_create_user_fails_with_invalid_mobile(self):
        # 1. Missing +91
        res1 = self.client.post(
            "/api/users/",
            {
                "username": "bad_mob1",
                "password": "password123!",
                "email": "test@domain.com",
                "mobile_number": "9876543210",
                "profile": "teacher",
                "school": self.school.id,
            },
            format="json",
        )
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mobile_number", res1.data)

        # 2. 9 digits
        res2 = self.client.post(
            "/api/users/",
            {
                "username": "bad_mob2",
                "password": "password123!",
                "email": "test@domain.com",
                "mobile_number": "+91987654321",
                "profile": "teacher",
                "school": self.school.id,
            },
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_user_succeeds_with_valid_mobile_and_email(self):
        res = self.client.post(
            "/api/users/",
            {
                "username": "valid_teacher",
                "password": "password123!",
                "email": "valid_teacher@domain.com",
                "mobile_number": "+919876543219",
                "profile": "teacher",
                "school": self.school.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["mobile_number"], "+919876543219")
        self.assertEqual(res.data["email"], "valid_teacher@domain.com")


class UnifiedSchoolAndAdminCreationTests(TestCase):
    """
    Test suite verifying atomic creation of School and School Admin in a single flow.
    """

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            username="super_admin_creator",
            email="creator@system.local",
            mobile_number="+919876543210",
            role="Super Admin",
        )
        grant_super_admin_defaults(self.superadmin)
        self.client.force_authenticate(user=self.superadmin)

    def test_create_school_with_admin_at_once(self):
        payload = {
            "name": "Delhi Public Academy",
            "config": {"board": "CBSE", "curriculum": "NCERT", "timezone": "Asia/Kolkata"},
            "admin": {
                "username": "dpa_admin",
                "password": "password123!",
                "email": "admin@dpa.edu",
                "mobile_number": "+919811223344",
                "first_name": "Rajesh",
                "last_name": "Kumar",
            },
        }
        res = self.client.post("/api/schools/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["name"], "Delhi Public Academy")
        self.assertIn("admin", res.data)
        self.assertEqual(res.data["admin"]["username"], "dpa_admin")
        self.assertEqual(res.data["admin"]["mobile_number"], "+919811223344")

        # Verify DB records
        created_school = School.objects.get(name="Delhi Public Academy")
        admin_user = User.objects.get(username="dpa_admin")
        self.assertEqual(admin_user.school_id, created_school.id)
        self.assertEqual(admin_user.role_label, "School Admin")
        self.assertEqual(admin_user.created_by, self.superadmin)

    def test_create_school_without_admin_fails_because_both_required(self):
        payload = {
            "name": "Solo School Without Admin",
            "config": {"board": "ICSE", "curriculum": "ICSE Syllabus"},
        }
        res = self.client.post("/api/schools/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("admin", res.data)
        self.assertFalse(School.objects.filter(name="Solo School Without Admin").exists())

    def test_create_school_admin_standalone_is_forbidden(self):
        demo_school = School.objects.create(name="Existing School")
        res = self.client.post(
            "/api/users/",
            {
                "username": "standalone_admin",
                "password": "password123!",
                "email": "sa@existing.edu",
                "mobile_number": "+919876543210",
                "profile": "school_admin",
                "school": demo_school.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)
        self.assertIn("School Admins cannot be created separately", res.data["detail"])

    def test_create_school_with_invalid_admin_rolls_back_school(self):
        payload = {
            "name": "Should Rollback School",
            "config": {"board": "CBSE"},
            "admin": {
                "username": "bad_admin",
                "password": "password123!",
                "email": "not-valid-email",
                "mobile_number": "12345",  # Invalid mobile number
            },
        }
        res = self.client.post("/api/schools/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        # Verify rollback: school was NOT created in DB
        self.assertFalse(School.objects.filter(name="Should Rollback School").exists())


class RoleModificationAndQuestionBankTests(TestCase):
    """
    Test suite verifying the P0 role modifications and question bank configuration:
    - Super Admin cannot directly create teachers (AC-21)
    - School / Coaching Class Admin can create teachers within their own school (AC-22)
    - Super Admin can configure question_bank_enabled on an organization (AC-11)
    - Teacher cannot be granted GENERATE_SELECT_QUESTIONS if organization question_bank_enabled is False (AC-12)
    - Teacher can be granted GENERATE_SELECT_QUESTIONS if organization question_bank_enabled is True (AC-12)
    """

    def setUp(self):
        self.client = APIClient()
        for cap_name in CapabilityName.values:
            Capability.objects.get_or_create(name=cap_name)

        self.school = School.objects.create(name="Apex Coaching", question_bank_enabled=False)
        self.superadmin = User.objects.create_user(
            username="super_admin_p0",
            email="sa_p0@system.local",
            mobile_number="+919876543210",
            role="Super Admin",
        )
        grant_super_admin_defaults(self.superadmin)

        self.school_admin = User.objects.create_user(
            username="apex_admin",
            email="admin@apex.local",
            mobile_number="+919876543211",
            role="School Admin",
            school=self.school,
        )
        grant_school_admin_defaults(self.school_admin, granted_by=self.superadmin)

    def test_super_admin_cannot_directly_create_teacher(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(
            "/api/users/",
            {
                "username": "new_teacher",
                "password": "password123!",
                "email": "teacher@apex.local",
                "mobile_number": "+919876543212",
                "profile": "teacher",
                "school": self.school.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Super Admins cannot directly create teachers", res.data["detail"])

    def test_school_admin_can_create_teacher(self):
        self.client.force_authenticate(user=self.school_admin)
        res = self.client.post(
            "/api/users/",
            {
                "username": "apex_math_teacher",
                "password": "password123!",
                "email": "math@apex.local",
                "mobile_number": "+919876543213",
                "profile": "teacher",
                "school": self.school.id,
                "primary_subject": "Mathematics",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        teacher = User.objects.get(username="apex_math_teacher")
        self.assertEqual(teacher.school_id, self.school.id)
        # Verify GENERATE_SELECT_QUESTIONS was NOT granted because question_bank_enabled is False
        self.assertFalse(teacher.has_capability(CapabilityName.GENERATE_SELECT_QUESTIONS))

    def test_super_admin_can_toggle_question_bank_enabled(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.patch(
            f"/api/schools/{self.school.id}/",
            {"question_bank_enabled": True},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.school.refresh_from_db()
        self.assertTrue(self.school.question_bank_enabled)

    def test_granting_question_bank_to_teacher_respects_organization_enablement(self):
        teacher = User.objects.create_user(
            username="science_teacher",
            email="science@apex.local",
            mobile_number="+919876543214",
            role="Teacher",
            school=self.school,
        )
        grant_teacher_defaults(teacher, granted_by=self.school_admin)

        self.client.force_authenticate(user=self.school_admin)
        # 1. When organization question_bank_enabled is False -> rejected
        res = self.client.post(
            f"/api/users/{teacher.id}/permissions/",
            {"capability_name": CapabilityName.GENERATE_SELECT_QUESTIONS},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Question Bank capability is not enabled for this organization", res.data["detail"])

        # 2. When Super Admin enables question_bank_enabled -> grant succeeds
        self.school.question_bank_enabled = True
        self.school.save()

        res2 = self.client.post(
            f"/api/users/{teacher.id}/permissions/",
            {"capability_name": CapabilityName.GENERATE_SELECT_QUESTIONS},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertTrue(teacher.has_capability(CapabilityName.GENERATE_SELECT_QUESTIONS))

