"""
Django management command to prune historical AuditLog entries.

Usage:
    python manage.py prune_audit_logs --days=90
    python manage.py prune_audit_logs --days=30 --action=user.login
    python manage.py prune_audit_logs --days=60 --dry-run
"""

from datetime import timedelta
from typing import Any

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import AuditLog


class Command(BaseCommand):
    help = "Prune audit log entries older than a specified number of days."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=90,
            help="Delete audit logs older than this number of days (default: 90).",
        )
        parser.add_argument(
            "--action",
            type=str,
            default="",
            help="Filter deletion to a specific action verb (e.g. 'user.login').",
        )
        parser.add_argument(
            "--chunk-size",
            type=int,
            default=1000,
            help="Number of records to delete in each batch (default: 1000).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate the pruning and display count without deleting records.",
        )

    def handle(self, *args: Any, **options: Any):
        days = options["days"]
        if days < 0:
            self.stderr.write(self.style.ERROR("--days must be a non-negative integer."))
            return

        action_filter = options.get("action", "").strip()
        chunk_size = options["chunk_size"]
        dry_run = options["dry_run"]

        cutoff_date = timezone.now() - timedelta(days=days)
        qs = AuditLog.objects.filter(timestamp__lt=cutoff_date)

        if action_filter:
            qs = qs.filter(action=action_filter)

        total_matching = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY-RUN] Found {total_matching} audit log record(s) older than {days} day(s) "
                    f"(cutoff: {cutoff_date.isoformat()})"
                    + (f" matching action='{action_filter}'." if action_filter else ".")
                )
            )
            return

        if total_matching == 0:
            self.stdout.write(self.style.SUCCESS(f"No audit logs older than {days} days to prune."))
            return

        self.stdout.write(
            f"Pruning {total_matching} audit log record(s) older than {days} days in chunks of {chunk_size}..."
        )

        deleted_count = 0
        while True:
            # Query IDs in chunks to avoid table lock / high memory usage
            ids_chunk = list(qs.values_list("id", flat=True)[:chunk_size])
            if not ids_chunk:
                break
            batch_deleted, _ = AuditLog.objects.filter(id__in=ids_chunk).delete()
            deleted_count += batch_deleted
            self.stdout.write(f"  Deleted {deleted_count}/{total_matching}...")

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully pruned {deleted_count} audit log record(s) older than {days} days."
            )
        )
