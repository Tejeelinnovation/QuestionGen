from django.db import migrations


def populate_topics_and_approve_existing_questions(apps, schema_editor):
    Question = apps.get_model("content", "Question")
    for q in Question.objects.all():
        # Set existing active questions to APPROVED so demo content works
        if q.is_active:
            q.validation_status = "APPROVED"
            q.save(update_fields=["validation_status"])
        if q.topic_id:
            q.topics.add(q.topic_id)


def reverse_populate(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0003_questionvalidationhistory_question_revision_and_more"),
    ]

    operations = [
        migrations.RunPython(
            populate_topics_and_approve_existing_questions,
            reverse_code=reverse_populate,
        ),
    ]
