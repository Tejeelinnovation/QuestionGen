from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Capability, User, UserCapability


class UserCapabilityInline(admin.TabularInline):
    model = UserCapability
    fk_name = "user"  # disambiguate: UserCapability has two FKs to User
    extra = 0
    readonly_fields = ("granted_at", "granted_by")
    autocomplete_fields = ("capability",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("capability", "granted_by")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        "username", "email", "first_name", "last_name",
        "school", "role_label", "is_active", "date_joined",
    )
    list_filter = ("is_active", "school", "is_staff")
    search_fields = ("username", "email", "first_name", "last_name")
    readonly_fields = ("date_joined", "last_login", "role_label")
    inlines = [UserCapabilityInline]

    fieldsets = DjangoUserAdmin.fieldsets + (
        (
            "System Fields",
            {"fields": ("school", "created_by", "role_label")},
        ),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        (
            "System Fields",
            {"fields": ("school", "created_by")},
        ),
    )

    @admin.display(description="Role (computed)")
    def role_label(self, obj):
        return obj.role_label


@admin.register(Capability)
class CapabilityAdmin(admin.ModelAdmin):
    list_display = ("name", "get_name_display")
    search_fields = ("name",)
    readonly_fields = ("name",)

    def has_add_permission(self, request):
        # Capabilities are a fixed, bounded set — add via data migration only.
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(UserCapability)
class UserCapabilityAdmin(admin.ModelAdmin):
    list_display = ("user", "capability", "granted_by", "granted_at")
    list_filter = ("capability",)
    search_fields = ("user__username", "capability__name")
    readonly_fields = ("granted_at",)
