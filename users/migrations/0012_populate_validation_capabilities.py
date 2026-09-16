from django.db import migrations

def populate_validation_capabilities(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.get_or_create(name="DATA_ENTRY_OPERATOR")
    Capability.objects.get_or_create(name="VALIDATOR")

def remove_validation_capabilities(apps, schema_editor):
    Capability = apps.get_model("users", "Capability")
    Capability.objects.filter(name__in=["DATA_ENTRY_OPERATOR", "VALIDATOR"]).delete()

class Migration(migrations.Migration):

    dependencies = [
        ("users", "0011_alter_capability_name"),
    ]

    operations = [
        migrations.RunPython(populate_validation_capabilities, reverse_code=remove_validation_capabilities),
    ]
