"""
Development settings for Question Generation System.

Inherits everything from base and adds developer-friendly extras
(verbose logging, DRF browsable API, etc.).

Usage:
    DJANGO_SETTINGS_MODULE=question_generation_system.settings.dev
"""

from .base import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Dev-only overrides
# ---------------------------------------------------------------------------

ALLOWED_HOSTS = ALLOWED_HOSTS + ["testserver"]

# CORS configuration for Vite frontend
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS_ALLOW_CREDENTIALS = True

# Show all SQL queries in the console.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.db.backends": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# Add the browsable API renderer in development.
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]
