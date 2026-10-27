"""
URL configuration for the core app (system audit logs).
"""

from django.urls import path
from .views import AuditLogListView, BenchmarkResultsView, HealthCheckView

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("health/readiness/", HealthCheckView.as_view(), name="health-check-readiness"),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-log-list"),
    path("benchmark-results/", BenchmarkResultsView.as_view(), name="benchmark-results"),
]
