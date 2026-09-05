"""
Management command: create_super_admin

Solves the bootstrap problem — the first Super Admin cannot be created
via the API because no one holds the CREATE_SCHOOL capability yet.

Usage::

    python manage.py create_super_admin
    python manage.py create_super_admin --username admin --email admin@example.com

The command will prompt for a password interactively.  If the username
already exists the command will refuse to overwrite the existing account.
"""

import getpass

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Bootstrap: create the initial Super Admin user with all capabilities."

    def add_arguments(self, parser):
        parser.add_argument("--username", default=None, help="Username for the Super Admin.")
        parser.add_argument("--email", default="", help="Email address (optional).")
        parser.add_argument(
            "--no-input",
            action="store_true",
            dest="no_input",
            help=(
                "Skip interactive prompts. Requires --username and DJANGO_SUPERUSER_PASSWORD "
                "environment variable to be set."
            ),
        )

    def handle(self, *args, **options):
        from users.models import User  # noqa: PLC0415
        from users.capability_defaults import grant_super_admin_defaults  # noqa: PLC0415
        from core.audit import log_action  # noqa: PLC0415

        no_input = options["no_input"]
        username = options["username"]
        email = options["email"]

        # --------------- collect username ---------------
        if not username:
            if no_input:
                raise CommandError("--username is required when using --no-input.")
            username = input("Username: ").strip()
            if not username:
                raise CommandError("Username cannot be empty.")

        # --------------- check existing ---------------
        if User.objects.filter(username=username).exists():
            raise CommandError(
                f"A user with username '{username}' already exists. "
                "Use the API to grant capabilities to existing users."
            )

        # --------------- collect password ---------------
        import os  # noqa: PLC0415

        if no_input:
            password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
            if not password:
                raise CommandError(
                    "DJANGO_SUPERUSER_PASSWORD environment variable must be set "
                    "when using --no-input."
                )
        else:
            password = getpass.getpass("Password: ")
            password2 = getpass.getpass("Password (again): ")
            if password != password2:
                raise CommandError("Passwords do not match.")
            if not password:
                raise CommandError("Password cannot be empty.")

        # --------------- create + grant ---------------
        with transaction.atomic():
            user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password,
            )
            # Grant ALL capabilities — this is what makes them Super Admin.
            grant_super_admin_defaults(user, granted_by=None)

            # Audit log — granted_by=None signals system/bootstrap action.
            log_action(
                user=None,
                action="user.created",
                target=user,
                metadata={
                    "username": username,
                    "profile": "super_admin",
                    "method": "management_command",
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuper Admin '{username}' created successfully.\n"
                "All capabilities have been granted.\n"
                "Run the server and POST to /api/auth/login/ to obtain a JWT."
            )
        )
