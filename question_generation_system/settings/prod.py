"""
Production settings for Question Generation System.

Inherits everything from base and enforces security hardening.
Never set DEBUG=True here.

Usage:
    DJANGO_SETTINGS_MODULE=question_generation_system.settings.prod
"""

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Security hardening
# ---------------------------------------------------------------------------
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Render terminates SSL at its load balancer and proxies to gunicorn
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---------------------------------------------------------------------------
# Allowed Hosts
# ---------------------------------------------------------------------------
# Render automatically injects RENDER_EXTERNAL_HOSTNAME (e.g. your-app.onrender.com)
RENDER_EXTERNAL_HOSTNAME = env("RENDER_EXTERNAL_HOSTNAME", default=None)
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS = list(ALLOWED_HOSTS) + [RENDER_EXTERNAL_HOSTNAME, ".onrender.com"]

# ---------------------------------------------------------------------------
# CORS Configuration for Vercel Frontend
# ---------------------------------------------------------------------------
# Read allowed origins from env, defaulting to localhost for testing
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])

# Ensure FRONTEND_URL is in CORS_ALLOWED_ORIGINS if configured
if FRONTEND_URL and FRONTEND_URL not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)

CORS_ALLOW_CREDENTIALS = True

# Allow any Vercel domain (production and preview deployments)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https:\/\/.*\.vercel\.app$",
]

# Allow standard API headers
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

