from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from schools.models import School, ClassSection, ClassSubjectTeacher
from users.models import Capability, UserCapability

User = get_user_model()


class TeacherClassAssignmentsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.school = School.objects.create(name="Delhi Public School", max_students=100, max_teachers=20)

        self.teacher1 = User.objects.create_user(
            username="teacher1",
            email="teacher1@example.com",
            mobile_number="+919876543210",
            password="password123",
            role="Teacher",
            school=self.school,
            primary_subject="Mathematics",
        )

        self.teacher2 = User.objects.create_user(
            username="teacher2",
            email="teacher2@example.com",
            mobile_number="+919876543211",
            password="password123",
            role="Teacher",
            school=self.school,
            primary_subject="Science",
        )

        self.student1 = User.objects.create_user(
            username="student1",
            email="student1@example.com",
            mobile_number="+919876543220",
            password="password123",
            role="Student",
            school=self.school,
        )

        # 10-A: Teacher1 is Main Class Teacher (Mathematics), Teacher2 teaches Science
        self.sec_10a = ClassSection.objects.create(
            school=self.school,
            standard=10,
            section="A",
            max_students=40,
            class_teacher=self.teacher1,
            class_teacher_subject="Mathematics",
        )
        self.student1.class_section = self.sec_10a
        self.student1.save()

        ClassSubjectTeacher.objects.create(
            class_section=self.sec_10a,
            subject="Science",
            teacher=self.teacher2,
        )

        # 9-B: Teacher2 is Main Class Teacher (Science), Teacher1 teaches Mathematics
        self.sec_9b = ClassSection.objects.create(
            school=self.school,
            standard=9,
            section="B",
            max_students=35,
            class_teacher=self.teacher2,
            class_teacher_subject="Science",
        )
        ClassSubjectTeacher.objects.create(
            class_section=self.sec_9b,
            subject="Mathematics",
            teacher=self.teacher1,
        )

        # 8-A: Teacher1 ALSO teaches Science (supporting multiple subjects across different classes!)
        self.sec_8a = ClassSection.objects.create(
            school=self.school,
            standard=8,
            section="A",
            max_students=30,
        )
        ClassSubjectTeacher.objects.create(
            class_section=self.sec_8a,
            subject="Science",
            teacher=self.teacher1,
        )

    def test_teacher1_my_assignments(self):
        self.client.force_authenticate(user=self.teacher1)
        res = self.client.get("/api/schools/classes/my-assignments/")
        self.assertEqual(res.status_code, 200)
        data = res.data

        # 1. Check Main Class Teacher Section
        ct_sections = data["class_teacher_sections"]
        self.assertEqual(len(ct_sections), 1)
        self.assertEqual(ct_sections[0]["name"], "Class 10-A")
        self.assertEqual(ct_sections[0]["class_teacher_subject"], "Mathematics")
        self.assertEqual(ct_sections[0]["enrolled_students_count"], 1)

        # 2. Check Subject Assignments (Teacher1 teaches Mathematics in 9-B, and Science in 8-A)
        subjs = data["subject_assignments"]
        self.assertEqual(len(subjs), 2)
        taught_subjects = {s["subject"] for s in subjs}
        self.assertEqual(taught_subjects, {"Mathematics", "Science"})

        class_names = {s["class_name"] for s in subjs}
        self.assertEqual(class_names, {"Class 9-B", "Class 8-A"})

    def test_teacher_can_view_class_students(self):
        self.client.force_authenticate(user=self.teacher1)
        res = self.client.get(f"/api/schools/classes/{self.sec_10a.id}/students/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["username"], "student1")
        self.assertEqual(res.data[0]["mobile_number"], "+919876543220")
