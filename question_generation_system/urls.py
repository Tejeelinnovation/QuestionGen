"""
Root URL configuration for the Question Generation System.
"""

from django.contrib import admin
from django.urls import include, path

from users.urls import auth_urlpatterns, users_urlpatterns

urlpatterns = [
    # Django admin
    path("admin/", admin.site.urls),

    # Auth endpoints: login, logout, me, token refresh
    path("api/auth/", include((auth_urlpatterns, "auth"), namespace="auth")),

    # User management: list, create, update, permission grant/revoke
    path("api/users/", include((users_urlpatterns, "users"), namespace="users")),

    # Content: books, chapters, topics, questions (read-only browsing)
    path("api/", include(("content.urls", "content"), namespace="content")),

    # Papers, versions, delivery
    path("api/", include(("papers.urls", "papers"), namespace="papers")),

    # Attempts, answers, scoring, results
    path("api/", include(("attempts.urls", "attempts"), namespace="attempts")),
]
