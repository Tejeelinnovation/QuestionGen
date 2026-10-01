from django.db import migrations

def populate_upload_capability(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.get_or_create(name="UPLOAD_STUDY_MATERIAL")

def remove_upload_capability(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.filter(name="UPLOAD_STUDY_MATERIAL").delete()

class Migration(migrations.Migration):

    dependencies = [
        ("users", "0013_alter_capability_name"),
    ]

    operations = [
        migrations.RunPython(populate_upload_capability, reverse_code=remove_upload_capability),
    ]
