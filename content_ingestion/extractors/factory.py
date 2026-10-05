"""
Extractor Factory.

Selects the optimal extraction strategy based on document kind,
presence of digital text layers, and configuration settings.
"""

from typing import Optional
from django.conf import settings

from .base import BaseExtractor
from .digital_parser import DigitalPdfExtractor
from .gemini_flash import GeminiFlashExtractor


def get_extractor(
    document_kind: str = "AUTO",
    has_text_layer: bool = True,
    media_dir: str = "",
) -> BaseExtractor:
    """
    Factory function returning the appropriate page extractor.

    - HANDWRITTEN_NOTES or scanned PDFs (no text layer) -> GeminiFlashExtractor
    - Digital typed PDFs -> DigitalPdfExtractor (Fast, free, 0 API tokens)
    """
    # Allow overriding via settings if user wants to force an engine
    configured_backend = getattr(settings, "DOCUMENT_EXTRACTOR_BACKEND", "auto")

    if configured_backend == "gemini_flash":
        return GeminiFlashExtractor()
    elif configured_backend == "digital_parser":
        return DigitalPdfExtractor(media_output_dir=media_dir)

    # Auto mode:
    # If the document is handwritten or has no embedded digital text, route to Gemini Vision
    if document_kind == "HANDWRITTEN_NOTES" or not has_text_layer:
        return GeminiFlashExtractor()

    return DigitalPdfExtractor(media_output_dir=media_dir)
