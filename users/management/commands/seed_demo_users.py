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
    grant_school_admin_defaults,
    grant_student_defaults,
    grant_super_admin_defaults,
    grant_teacher_defaults,
)
from users.models import User


class Command(BaseCommand):
    help = "Seed demo users for all 4 roles (Super Admin, School Admin, Teacher, Student)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing demo users before recreating them.",
        )

    def handle(self, *args, **options):
        clear = options["clear"]
        demo_usernames = ["superadmin", "schooladmin1", "teacher1", "student1", "student2"]

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
                    "first_name": "Super",
                    "last_name": "Admin",
                    "role": "Super Admin",
                    "is_staff": True,
                    "is_superuser": True,
                    "school": None,
                },
            )
            superadmin.role = "Super Admin"
            superadmin.set_password("password123")
            superadmin.save()
            grant_super_admin_defaults(superadmin)
            self.stdout.write(f"  {'Created' if created else 'Updated'} superadmin (Super Admin)")

            # 3. School Admin
            sa, created = User.objects.get_or_create(
                username="schooladmin1",
                defaults={
                    "email": "admin@greenwood.edu",
                    "first_name": "Sarah",
                    "last_name": "Admin",
                    "role": "School Admin",
                    "school": school,
                    "created_by": superadmin,
                },
            )
            sa.role = "School Admin"
            sa.set_password("password123")
            sa.save()
            grant_school_admin_defaults(sa, granted_by=superadmin)
            self.stdout.write(f"  {'Created' if created else 'Updated'} schooladmin1 (School Admin)")

            # 4. Teacher
            teacher, created = User.objects.get_or_create(
                username="teacher1",
                defaults={
                    "email": "teacher1@greenwood.edu",
                    "first_name": "Thomas",
                    "last_name": "Teacher",
                    "role": "Teacher",
                    "school": school,
                    "created_by": sa,
                },
            )
            teacher.role = "Teacher"
            teacher.set_password("password123")
            teacher.save()
            grant_teacher_defaults(teacher, granted_by=sa)
            self.stdout.write(f"  {'Created' if created else 'Updated'} teacher1 (Teacher)")

            # 5. Students
            for uname, fname, lname in [
                ("student1", "Sam", "Student"),
                ("student2", "Sophie", "Learner"),
            ]:
                stu, created = User.objects.get_or_create(
                    username=uname,
                    defaults={
                        "email": f"{uname}@greenwood.edu",
                        "first_name": fname,
                        "last_name": lname,
                        "role": "Student",
                        "school": school,
                        "created_by": teacher,
                    },
                )
                stu.role = "Student"
                stu.set_password("password123")
                stu.save()
                grant_student_defaults(stu, granted_by=teacher)
                self.stdout.write(f"  {'Created' if created else 'Updated'} {uname} (Student)")

        self.stdout.write(
            self.style.SUCCESS(
                "\nDemo users successfully seeded! Password for all demo users is 'password123'."
            )
        )
