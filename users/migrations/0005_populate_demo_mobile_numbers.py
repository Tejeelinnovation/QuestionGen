from django.db import migrations

def populate_demo_mobile_numbers(apps, schema_editor):
    User = apps.get_model('users', 'User')
    demo_numbers = {
        'superadmin': '+919876543210',
        'schooladmin1': '+919876543211',
        'teacher1': '+919876543212',
        'student1': '+919876543213',
        'student2': '+919876543214',
    }
    for user in User.objects.all():
        if user.username in demo_numbers:
            user.mobile_number = demo_numbers[user.username]
        elif not user.mobile_number or user.mobile_number == '+919876543210':
            user.mobile_number = f"+9198{user.id:08d}"
        user.save(update_fields=['mobile_number'])

class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_user_mobile_number'),
    ]

    operations = [
        migrations.RunPython(populate_demo_mobile_numbers, migrations.RunPython.noop),
    ]
