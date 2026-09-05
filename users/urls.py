"""
URL configuration for the users app.

Auth endpoints:
    POST   /api/auth/login/
    POST   /api/auth/logout/
    GET    /api/auth/me/
    POST   /api/auth/token/refresh/    (SimpleJWT built-in refresh)

User management endpoints:
    GET    /api/users/
    POST   /api/users/
    PATCH  /api/users/{id}/
    POST   /api/users/{id}/permissions/
    DELETE /api/users/{id}/permissions/{capability}/
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, LogoutView, MeView, UserViewSet

# Auth URL patterns — mounted at /api/auth/ in root urls.py
auth_urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
]

# User management URL patterns — mounted at /api/users/ in root urls.py
user_list_create = UserViewSet.as_view({"get": "list", "post": "create"})
user_detail = UserViewSet.as_view({"patch": "partial_update"})
user_grant_permission = UserViewSet.as_view({"post": "grant_permission"})
user_revoke_permission = UserViewSet.as_view({"delete": "revoke_permission"})

users_urlpatterns = [
    path("", user_list_create, name="user-list-create"),
    path("<int:pk>/", user_detail, name="user-detail"),
    path("<int:pk>/permissions/", user_grant_permission, name="user-grant-permission"),
    path(
        "<int:pk>/permissions/<str:capability>/",
        user_revoke_permission,
        name="user-revoke-permission",
    ),
]
