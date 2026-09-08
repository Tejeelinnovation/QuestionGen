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
