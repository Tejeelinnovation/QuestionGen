"""
URL configuration for the schools app.
"""

from rest_framework.routers import DefaultRouter
from .views import BulkImportViewSet, ClassSectionViewSet, SchoolViewSet

router = DefaultRouter()
router.register(r"import", BulkImportViewSet, basename="school-import")
router.register(r"classes", ClassSectionViewSet, basename="class-section")
router.register(r"", SchoolViewSet, basename="school")

urlpatterns = router.urls

