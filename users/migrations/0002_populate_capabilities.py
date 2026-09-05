"""
Data migration: populate the fixed set of Capability rows.

These 10 capabilities are the complete, bounded permission set for the system.
Any new capability must be added here AND documented in PROJECT_CONTEXT.md.
"""

from django.db import migrations


CAPABILITIES = [
    "CREATE_SCHOOL",
    "CREATE_SCHOOL_ADMIN",
    "CREATE_TEACHER",
    "CREATE_STUDENT",
    "GENERATE_SELECT_QUESTIONS",
    "CREATE_PAPER",
    "ASSIGN_TEST",
    "ATTEMPT_TEST",
    "VIEW_OWN_RESULT",
    "VIEW_SCHOOL_WIDE_CONTROLS",
]


def populate_capabilities(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    for name in CAPABILITIES:
        Capability.objects.get_or_create(name=name)


def remove_capabilities(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.filter(name__in=CAPABILITIES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(populate_capabilities, reverse_code=remove_capabilities),
    ]
