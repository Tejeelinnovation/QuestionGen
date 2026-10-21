"""
Base settings for Question Generation System.

All environment-specific settings live in dev.py or prod.py.
This module must never be used directly as DJANGO_SETTINGS_MODULE.
"""

from pathlib import Path

import environ

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# BASE_DIR points to the repository root (two levels above this file).
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ---------------------------------------------------------------------------
# django-environ initialisation
# ---------------------------------------------------------------------------
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, []),
)

# Read .env from the repository root if it exists.
# This is safe to call even when the file doesn't exist (e.g. in CI/CD where
# env vars are injected directly).
environ.Env.read_env(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# Core security
# ---------------------------------------------------------------------------
SECRET_KEY = env("SECRET_KEY")

DEBUG = env("DEBUG")

ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    # Shared utilities, audit logging, abstract base models.
    "core",
    # Multi-tenancy boundary — School / Organisation entity.
    "schools",
    # User accounts, capabilities, and permissions (auth system).
    "users",
    # Books, Chapters, Topics, Questions — the content / question bank.
    "content",
    # Question Papers, Versions, and Delivery configurations.
    "papers",
    # Student Attempts and Results.
    "attempts",
    # Question Generation Service boundary & interfaces.
    "generation",
    # Document Ingestion & Training Dataset Collection Engine
    "content_ingestion",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ---------------------------------------------------------------------------
# URL / WSGI / ASGI
# ---------------------------------------------------------------------------
ROOT_URLCONF = "question_generation_system.urls"

WSGI_APPLICATION = "question_generation_system.wsgi.application"

# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database — PostgreSQL, configured entirely via environment variables
# ---------------------------------------------------------------------------
import sys

DATABASES = {
    "default": env.db("DATABASE_URL")
}
# Reuse persistent database connections to cut SSL handshake latency under load
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)
# Enable connection health checks (reconnects if idle connection dropped by Neon serverless)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = env.bool("CONN_HEALTH_CHECKS", default=True)

# Support for PgBouncer / Neon connection pooling (transaction mode disables server-side cursors)
database_url_str = env("DATABASE_URL", default="")
if env.bool("DATABASE_DISABLE_SERVER_SIDE_CURSORS", default=False) or "-pooler" in database_url_str:
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True

# Database connection options (e.g. connect timeout)
db_options = DATABASES["default"].get("OPTIONS", {})
if "connect_timeout" not in db_options:
    db_options["connect_timeout"] = env.int("DB_CONNECT_TIMEOUT", default=10)
DATABASES["default"]["OPTIONS"] = db_options

if "test" in sys.argv:
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }

# ---------------------------------------------------------------------------
# Caching configuration (Redis in staging/prod with LocMem fallback)
# ---------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", default="")

if REDIS_URL and "test" not in sys.argv:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "TIMEOUT": env.int("CACHE_TIMEOUT", default=300),
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "IGNORE_EXCEPTIONS": True,  # Fall back to database gracefully if Redis drops
                "SOCKET_CONNECT_TIMEOUT": 5,
                "SOCKET_TIMEOUT": 5,
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "qgs-cache-locmem",
            "TIMEOUT": env.int("CACHE_TIMEOUT", default=300),
        }
    }

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {
            "min_length": 4,
        },
    },
]

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ---------------------------------------------------------------------------
# Document Ingestion & Extractor configuration
# ---------------------------------------------------------------------------
DOCUMENT_EXTRACTOR_BACKEND = env("DOCUMENT_EXTRACTOR_BACKEND", default="auto")
DOCUMENT_AI_MICROSERVICE_URL = env("DOCUMENT_AI_MICROSERVICE_URL", default="")
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
GEMINI_MODEL_NAME = env("GEMINI_MODEL_NAME", default="gemini-2.0-flash")
GOOGLE_DRIVE_FOLDER_ID = env("GOOGLE_DRIVE_FOLDER_ID", default="")
GOOGLE_DRIVE_USER_TOKEN_FILE = env("GOOGLE_DRIVE_USER_TOKEN_FILE", default="google_drive_token.json")
GOOGLE_DRIVE_USER_TOKEN_JSON = env("GOOGLE_DRIVE_USER_TOKEN_JSON", default="")

# ---------------------------------------------------------------------------
# Default primary key type
# ---------------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Custom User model
# ---------------------------------------------------------------------------
# MUST be set before any migration that references the user model.
AUTH_USER_MODEL = "users.User"

# ---------------------------------------------------------------------------
# Django REST Framework defaults
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    # Default: require authentication on all endpoints.
    # Individual views / viewsets override this where public access is needed.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # OpenAPI 3.0 schema generation via drf-spectacular
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Rate limiting & Throttling
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON_RATE", default="120/minute"),
        "user": env("THROTTLE_USER_RATE", default="1200/minute"),
        "auth": env("THROTTLE_AUTH_RATE", default="15/minute"),
        "exam_submit": env("THROTTLE_EXAM_SUBMIT_RATE", default="10/minute"),
    },
}

# During automated test runs, raise throttle limits to prevent false-positive 429 errors
if "test" in sys.argv:
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
        "anon": "100000/day",
        "user": "100000/day",
        "auth": "100000/day",
        "exam_submit": "100000/day",
    }

# ---------------------------------------------------------------------------
# drf-spectacular (OpenAPI 3.0 / Swagger UI) configuration
# ---------------------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "Question Generation System API",
    "DESCRIPTION": (
        "REST API for Question Generation System — question banks, paper assembly, "
        "online & print test delivery, student assessment, and validation workflow."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# ---------------------------------------------------------------------------
# SimpleJWT configuration
# ---------------------------------------------------------------------------
from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    # Access tokens are short-lived; clients must refresh regularly.
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    # Refresh tokens are valid for 7 days.
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # Each refresh call issues a new refresh token (rotation).
    "ROTATE_REFRESH_TOKENS": True,
    # Old refresh tokens are blacklisted after rotation.
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ---------------------------------------------------------------------------
# Question Generation Service configuration
# ---------------------------------------------------------------------------
GENERATION_SERVICE_BACKEND = env("GENERATION_SERVICE_BACKEND", default="seeded_bank")

# ---------------------------------------------------------------------------
# Email Configuration
# ---------------------------------------------------------------------------
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@questiongen.local")

# Use live SMTP if user and password are provided; otherwise use console backend for dev/testing
if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
else:
    EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")

FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

# ---------------------------------------------------------------------------
# Document AI Microservice & GitHub Actions Dispatcher
# ---------------------------------------------------------------------------
DOCUMENT_AI_MICROSERVICE_URL = env("DOCUMENT_AI_MICROSERVICE_URL", default="")
GITHUB_DISPATCH_TOKEN = env("GITHUB_DISPATCH_TOKEN", default="")
GITHUB_DISPATCH_REPO = env("GITHUB_DISPATCH_REPO", default="queraai/QuestionGen")
# Standardized BACKEND_BASE_URL (reconciled with RENDER_BACKEND_URL fallback)
BACKEND_BASE_URL = env("BACKEND_BASE_URL", default=env("RENDER_BACKEND_URL", default="http://localhost:8000"))
INGESTION_WEBHOOK_SECRET = env("INGESTION_WEBHOOK_SECRET", default="")
# A7: DISPATCH_REF controls which branch the GitHub Actions workflow_dispatch uses.
# Set to "staging" on the staging Render service, "main" on production.
DISPATCH_REF = env("DISPATCH_REF", default="main")

# Quality & Safety Configuration
LEGACY_REVIEW_REQUIRED = env.bool("LEGACY_REVIEW_REQUIRED", default=True)
TOC_V2_ENABLED = env.bool("TOC_V2_ENABLED", default=False)



# Support large extracted textbook payloads and multi-page diagrams
DATA_UPLOAD_MAX_MEMORY_SIZE = 100 * 1024 * 1024  # 100 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 100 * 1024 * 1024  # 100 MB



