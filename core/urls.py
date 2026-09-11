"""
URL configuration for the core app (system audit logs).
"""

from django.urls import path
from .views import AuditLogListView

urlpatterns = [
    path("audit-logs/", AuditLogListView.as_view(), name="audit-log-list"),
]
