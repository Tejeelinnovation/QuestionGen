"""
Core API throttles for security and rate limiting.
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    """
    Limits authentication attempts (login, password reset) to prevent brute force
    and credential stuffing attacks. Rate is configured in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["auth"].
    """

    scope = "auth"


class ExamSubmitRateThrottle(UserRateThrottle):
    """
    Prevents accidental rapid double-submissions or submission flooding by students
    during online exams. Rate is configured in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["exam_submit"].
    """

    scope = "exam_submit"
