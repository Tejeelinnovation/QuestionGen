"""
Shared pagination classes for the Question Generation System.
"""

from __future__ import annotations

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPageNumberPagination(PageNumberPagination):
    """
    Standard pagination class supporting:
    - Default page size: 20
    - Custom page size via ?page_size=
    - Max page size: 100
    - Opt-out via ?paginate=false or ?all=true
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        # Support explicit unpaginated retrieval for pickers/dropdowns
        paginate_param = request.query_params.get("paginate", "").lower()
        all_param = request.query_params.get("all", "").lower()
        if paginate_param in ("false", "0", "no") or all_param in ("true", "1", "yes"):
            return None

        return super().paginate_queryset(queryset, request, view=view)
