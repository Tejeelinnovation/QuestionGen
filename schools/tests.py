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


class NormalizationTests(TestCase):
    def test_standard_normalization(self):
        from schools.services.normalization import AcademicClassNormalizer
        # Numbers and floats
        self.assertEqual(AcademicClassNormalizer.normalize_standard(6), 6)
        self.assertEqual(AcademicClassNormalizer.normalize_standard(10.0), 10)
        # Strings with prefixes
        self.assertEqual(AcademicClassNormalizer.normalize_standard("Standard 6"), 6)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("Std 6"), 6)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("Std. 6"), 6)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("Class 10"), 10)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("Grade 8"), 8)
        # Ordinals
        self.assertEqual(AcademicClassNormalizer.normalize_standard("6th"), 6)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("10th"), 10)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("1st"), 1)
        # Roman numerals
        self.assertEqual(AcademicClassNormalizer.normalize_standard("VI"), 6)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("X"), 10)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("IX"), 9)
        self.assertEqual(AcademicClassNormalizer.normalize_standard("iv"), 4)

    def test_division_normalization(self):
        from schools.services.normalization import AcademicClassNormalizer
        self.assertEqual(AcademicClassNormalizer.normalize_division("A"), "A")
        self.assertEqual(AcademicClassNormalizer.normalize_division("b"), "B")
        self.assertEqual(AcademicClassNormalizer.normalize_division("Section C"), "C")
        self.assertEqual(AcademicClassNormalizer.normalize_division("Division D"), "D")

    def test_class_teacher_parsing(self):
        from schools.services.normalization import AcademicClassNormalizer
        # With unicode em-dash / en-dash
        r1 = AcademicClassNormalizer.parse_class_teacher_assignment("Standard 6 — A")
        self.assertEqual(r1.standard, 6)
        self.assertEqual(r1.section, "A")

        # Hyphen
        r2 = AcademicClassNormalizer.parse_class_teacher_assignment("Std 10-B")
        self.assertEqual(r2.standard, 10)
        self.assertEqual(r2.section, "B")

        # Space separated
        r3 = AcademicClassNormalizer.parse_class_teacher_assignment("Class 9 A")
        self.assertEqual(r3.standard, 9)
        self.assertEqual(r3.section, "A")

        # Compact
        r4 = AcademicClassNormalizer.parse_class_teacher_assignment("10A")
        self.assertEqual(r4.standard, 10)
        self.assertEqual(r4.section, "A")

        # Empty / None
        r5 = AcademicClassNormalizer.parse_class_teacher_assignment("None")
        self.assertIsNone(r5.standard)
        self.assertIsNone(r5.section)


class BulkImportApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # School with capacity: max 2 students, max 2 teachers
        self.school = School.objects.create(name="St. Mary School", max_students=2, max_teachers=2)

        self.admin = User.objects.create_user(
            username="schooladmin",
            email="admin@stmary.edu",
            mobile_number="+919876543000",
            password="password123",
            role="School Admin",
            school=self.school,
        )
        cap, _ = Capability.objects.get_or_create(name="VIEW_SCHOOL_WIDE_CONTROLS")
        UserCapability.objects.create(user=self.admin, capability=cap, granted_by=self.admin)

        # Standard student capabilities
        Capability.objects.get_or_create(name="ATTEMPT_TEST")
        Capability.objects.get_or_create(name="VIEW_OWN_RESULT")
        Capability.objects.get_or_create(name="CREATE_PAPER")
        Capability.objects.get_or_create(name="ASSIGN_TEST")

    def test_download_templates(self):
        self.client.force_authenticate(user=self.admin)
        res_stu = self.client.get("/api/schools/import/template/?type=student")
        self.assertEqual(res_stu.status_code, 200)
        self.assertIn("spreadsheetml", res_stu["Content-Type"])

        res_tch = self.client.get("/api/schools/import/template/?type=teacher")
        self.assertEqual(res_tch.status_code, 200)
        self.assertIn("spreadsheetml", res_tch["Content-Type"])

    def test_capacity_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/schools/import/capacity/")
        self.assertEqual(res.status_code, 200)
        data = res.data
        self.assertEqual(data["school_name"], "St. Mary School")
        self.assertEqual(data["students"]["limit"], 2)
        self.assertEqual(data["students"]["remaining"], 2)
        self.assertEqual(data["teachers"]["limit"], 2)
        self.assertEqual(data["teachers"]["remaining"], 2)

    def test_student_import_with_capacity_and_duplicates(self):
        from schools.services.excel_templates import generate_student_template
        self.client.force_authenticate(user=self.admin)

        # Use openpyxl to construct a workbook with 3 students (school capacity is 2)
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Student Name", "GR Number", "Roll Number", "Standard", "Division", "Phone Number"])
        ws.append(["Student Alpha", "GR-101", "1", "Standard 10", "A", "+919876543111"])
        ws.append(["Student Beta", "GR-102", "2", "10th", "A", "+919876543112"])
        ws.append(["Student Gamma", "GR-103", "3", "VI", "B", "+919876543113"])  # Should be over_limit!
        ws.append(["Student Alpha Dup", "GR-101", "4", "10", "A", "+919876543114"])  # Duplicate GR!

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        res = self.client.post(
            "/api/schools/import/students/",
            {"file": buf},
            format="multipart",
        )
        self.assertEqual(res.status_code, 200)
        data = res.data

        # 2 created, 1 over_limit, 1 duplicate
        self.assertEqual(data["summary"]["created_count"], 2)
        self.assertEqual(data["summary"]["over_limit_count"], 1)
        self.assertEqual(data["summary"]["duplicate_count"], 1)
        self.assertEqual(data["summary"]["remaining_capacity_after"], 0)

        # Verify created students exist in DB
        self.assertTrue(User.objects.filter(gr_number="GR-101").exists())
        self.assertTrue(User.objects.filter(gr_number="GR-102").exists())
        self.assertFalse(User.objects.filter(gr_number="GR-103").exists())

    def test_teacher_import_with_class_teacher_mapping(self):
        import io
        import openpyxl
        self.client.force_authenticate(user=self.admin)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Teacher Name", "Teacher Mobile Number", "Subject", "Class Teacher"])
        ws.append(["Teacher Raman", "+919876543222", "Mathematics", "Standard 10 — A"])

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        res = self.client.post(
            "/api/schools/import/teachers/",
            {"file": buf},
            format="multipart",
        )
        self.assertEqual(res.status_code, 200)
        data = res.data

        self.assertEqual(data["summary"]["created_count"], 1)
        self.assertTrue(User.objects.filter(mobile_number="+919876543222").exists())

        # Verify ClassSection was created and teacher assigned as Class Teacher
        sec = ClassSection.objects.get(school=self.school, standard=10, section="A")
        self.assertEqual(sec.class_teacher.mobile_number, "+919876543222")
        self.assertEqual(sec.class_teacher_subject, "Mathematics")

