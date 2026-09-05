"""
Custom UserManager for the Question Generation System.

Overrides Django's default UserManager so that ``create_user`` and
``create_superuser`` work correctly with our custom User model (which
adds `school` and `created_by` fields).
"""

from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    """
    Manager for the custom User model.

    Key differences from Django's default manager:
    - ``create_user`` does not set ``is_staff`` / ``is_superuser`` to True.
    - ``create_superuser`` is a thin wrapper used ONLY by Django's internals
      and the ``create_super_admin`` management command — it must still go
      through capability grants (``grant_super_admin_defaults``) to have
      actual system privileges; Django's ``is_superuser`` flag gives Django
      admin access only.
    """

    def create_user(
        self,
        username: str,
        email: str = "",
        password: str | None = None,
        **extra_fields,
    ):
        if not username:
            raise ValueError("Username is required.")
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        username: str,
        email: str = "",
        password: str | None = None,
        **extra_fields,
    ):
        """
        Creates a Django superuser (admin panel access).

        NOTE: This only sets ``is_staff=True`` and ``is_superuser=True`` for
        Django admin access. To grant full application-level capabilities, also
        call ``grant_super_admin_defaults(user)`` after creation.
        """
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(username, email, password, **extra_fields)
