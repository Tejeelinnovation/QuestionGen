from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "user", "action", "target_type", "target_id")
    list_filter = ("action", "target_type")
    search_fields = ("user__username", "action", "target_type", "target_id")
    readonly_fields = ("user", "action", "target_type", "target_id", "timestamp", "metadata")
    ordering = ("-timestamp",)

    def has_add_permission(self, request):
        # AuditLog entries are written by code only, never via admin.
        return False

    def has_change_permission(self, request, obj=None):
        # Immutable — never allow editing in admin.
        return False

    def has_delete_permission(self, request, obj=None):
        # Immutable — never allow deletion in admin.
        return False
