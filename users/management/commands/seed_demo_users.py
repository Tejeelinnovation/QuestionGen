"""
Management command: seed_demo_users

Creates standard demo users across all 4 system roles for local development
and automated testing.

Users created:
  - superadmin     / password123 (Super Admin — all capabilities, school=None)
  - schooladmin1   / password123 (School Admin — CREATE_TEACHER, CREATE_STUDENT, VIEW_SCHOOL_WIDE_CONTROLS)
  - teacher1       / password123 (Teacher — CREATE_PAPER, ASSIGN_TEST, GENERATE_SELECT_QUESTIONS, CREATE_STUDENT)
  - student1       / password123 (Student — ATTEMPT_TEST, VIEW_OWN_RESULT)
  - student2       / password123 (Student — ATTEMPT_TEST, VIEW_OWN_RESULT)

Usage::
    python manage.py seed_demo_users
    python manage.py seed_demo_users --clear
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from core.audit import log_action
from schools.models import School
from users.capability_defaults import (
    grant_qbm_defaults,
    grant_school_admin_defaults,
    grant_student_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
)
from users.models import User


class Command(BaseCommand):
    help = "Seed demo users for all system roles (Super Admin, School Admin, Teacher, Student, QBM)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing demo users before recreating them.",
        )

    def handle(self, *args, **options):
        clear = options["clear"]
        demo_usernames = ["superadmin", "schooladmin1", "teacher1", "student1", "student2", "qbm1"]

        if clear:
            self.stdout.write("Clearing existing demo users...")
            User.objects.filter(username__in=demo_usernames).delete()

        with transaction.atomic():
            # 1. Ensure Demo School exists
            school, _ = School.objects.get_or_create(
                name="Greenwood High School",
                defaults={"config": {"curriculum": "CBSE", "board": "NCERT"}},
            )

            # 2. Super Admin
            superadmin, created = User.objects.get_or_create(
                username="superadmin",
                defaults={
                    "email": "superadmin@system.local",
                    "mobile_number": "+919876543210",
                    "first_name": "Super",
                    "last_name": "Admin",
                    "role": "Super Admin",
                    "is_staff": True,
                    "is_superuser": True,
                    "school": None,
                },
            )
            superadmin.role = "Super Admin"
            superadmin.mobile_number = "+919876543210"
            superadmin.set_password("password123")
            superadmin.save()
            grant_super_admin_defaults(superadmin)
            self.stdout.write(f"  {'Created' if created else 'Updated'} superadmin (Super Admin)")

            # 3. School Admin
            sa, created = User.objects.get_or_create(
                username="schooladmin1",
                defaults={
                    "email": "admin@greenwood.edu",
                    "mobile_number": "+919876543211",
                    "first_name": "Sarah",
                    "last_name": "Admin",
                    "role": "School Admin",
                    "school": school,
                    "created_by": superadmin,
                },
            )
            sa.role = "School Admin"
            sa.mobile_number = "+919876543211"
            sa.set_password("password123")
            sa.save()
            grant_school_admin_defaults(sa, granted_by=superadmin)
            self.stdout.write(f"  {'Created' if created else 'Updated'} schooladmin1 (School Admin)")

            # 4. Teacher
            teacher, created = User.objects.get_or_create(
                username="teacher1",
                defaults={
                    "email": "teacher1@greenwood.edu",
                    "mobile_number": "+919876543212",
                    "first_name": "Thomas",
                    "last_name": "Teacher",
                    "role": "Teacher",
                    "school": school,
                    "created_by": sa,
                    "primary_subject": "Mathematics",
                },
            )
            teacher.role = "Teacher"
            teacher.mobile_number = "+919876543212"
            teacher.primary_subject = "Mathematics"
            teacher.set_password("password123")
            teacher.save()
            grant_teacher_defaults(teacher, granted_by=sa)
            self.stdout.write(f"  {'Created' if created else 'Updated'} teacher1 (Teacher)")

            # 4b. Seed Academic Classes & Subject Mapping
            from schools.models import ClassSection, ClassSubjectTeacher  # noqa: PLC0415
            class_10a, _ = ClassSection.objects.get_or_create(
                school=school,
                standard=10,
                section="A",
                defaults={
                    "max_students": 40,
                    "class_teacher": teacher,
                    "class_teacher_subject": "Mathematics",
                },
            )
            class_10a.class_teacher = teacher
            class_10a.class_teacher_subject = "Mathematics"
            class_10a.save()

            sec_9a, _ = ClassSection.objects.get_or_create(
                school=school,
                standard=9,
                section="A",
                defaults={"max_students": 40},
            )
            sec_8a, _ = ClassSection.objects.get_or_create(
                school=school,
                standard=8,
                section="A",
                defaults={"max_students": 40},
            )

            # Teacher teaches Mathematics in 10-A (also Class Teacher), Science in 10-A,
            # Mathematics in 9-A, and Science in 8-A (multiple subjects across classes!)
            ClassSubjectTeacher.objects.get_or_create(
                class_section=class_10a,
                subject="Mathematics",
                defaults={"teacher": teacher},
            )
            ClassSubjectTeacher.objects.get_or_create(
                class_section=class_10a,
                subject="Science",
                defaults={"teacher": teacher},
            )
            ClassSubjectTeacher.objects.get_or_create(
                class_section=sec_9a,
                subject="Mathematics",
                defaults={"teacher": teacher},
            )
            ClassSubjectTeacher.objects.get_or_create(
                class_section=sec_8a,
                subject="Science",
                defaults={"teacher": teacher},
            )

            # 5. Students
            for uname, fname, lname, mob in [
                ("student1", "Sam", "Student", "+919876543213"),
                ("student2", "Sophie", "Learner", "+919876543214"),
            ]:
                stu, created = User.objects.get_or_create(
                    username=uname,
                    defaults={
                        "email": f"{uname}@greenwood.edu",
                        "mobile_number": mob,
                        "first_name": fname,
                        "last_name": lname,
                        "role": "Student",
                        "school": school,
                        "created_by": teacher,
                        "class_section": class_10a,
                    },
                )
                stu.role = "Student"
                stu.mobile_number = mob
                stu.class_section = class_10a
                stu.set_password("password123")
                stu.save()
                grant_student_defaults(stu, granted_by=teacher)
                self.stdout.write(f"  {'Created' if created else 'Updated'} {uname} (Student - Class 10-A)")

            # 6. Question Bank Manager (QBM)
            qbm, created = User.objects.get_or_create(
                username="qbm1",
                defaults={
                    "email": "qbm1@system.local",
                    "mobile_number": "+919876543219",
                    "first_name": "Quinn",
                    "last_name": "BankManager",
                    "role": "QBM",
                    "school": None,
                    "created_by": superadmin,
                },
            )
            qbm.role = "QBM"
            qbm.mobile_number = "+919876543219"
            qbm.set_password("password123")
            qbm.save()
            grant_qbm_defaults(qbm, granted_by=superadmin)
            self.stdout.write(f"  {'Created' if created else 'Updated'} qbm1 (Question Bank Manager)")

        self.stdout.write(
            self.style.SUCCESS(
                "\nDemo users successfully seeded! Password for all demo users is 'password123'."
            )
        )
