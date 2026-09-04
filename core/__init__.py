"""
core — Shared utilities, abstract base models, and audit logging.

This app is the foundational layer imported by all other local apps.
It contains no business logic of its own.

Responsibilities:
- Abstract base models (TimestampedModel, UUIDModel, etc.) — to be built in P2+
- Audit log infrastructure — to be built later
- Shared mixins, managers, and utility functions
"""
