"""
Production settings for Question Generation System.

Inherits everything from base and enforces security hardening.
Never set DEBUG=True here.

Usage:
    DJANGO_SETTINGS_MODULE=question_generation_system.settings.prod
"""

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Security hardening (extend as needed before first production deploy)
# ---------------------------------------------------------------------------
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Enable these once HTTPS is confirmed on your infrastructure:
# SECURE_SSL_REDIRECT = True
# SESSION_COOKIE_SECURE = True
# CSRF_COOKIE_SECURE = True
# SECURE_HSTS_SECONDS = 31536000
# SECURE_HSTS_INCLUDE_SUBDOMAINS = True
# SECURE_HSTS_PRELOAD = True
