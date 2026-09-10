"""
URL configuration for the schools app.
"""

from rest_framework.routers import DefaultRouter
from .views import ClassSectionViewSet, SchoolViewSet

router = DefaultRouter()
router.register(r"classes", ClassSectionViewSet, basename="class-section")
router.register(r"", SchoolViewSet, basename="school")

urlpatterns = router.urls
