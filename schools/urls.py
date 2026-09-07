"""
URL configuration for the schools app.
"""

from rest_framework.routers import DefaultRouter
from .views import SchoolViewSet

router = DefaultRouter()
router.register(r"", SchoolViewSet, basename="school")

urlpatterns = router.urls
