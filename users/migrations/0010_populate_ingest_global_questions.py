from django.db import migrations

def populate_ingest_capability(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.get_or_create(name="INGEST_GLOBAL_QUESTIONS")

def remove_ingest_capability(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.filter(name="INGEST_GLOBAL_QUESTIONS").delete()

class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_alter_capability_name"),
    ]

    operations = [
        migrations.RunPython(populate_ingest_capability, reverse_code=remove_ingest_capability),
    ]
