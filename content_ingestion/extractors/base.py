"""
Base Extractor Interface.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseExtractor(ABC):
    """
    Abstract extractor interface for processing a single document page.
    """

    @abstractmethod
    def extract_page(self, pdf_document: Any, page_number: int) -> Dict[str, Any]:
        """
        Extract structured content from a given page number (1-indexed).

        Returns a dictionary conforming to the structured page schema:
        {
            "layout_type": "SINGLE_COLUMN" | "TWO_COLUMN" | "HYBRID_COLUMN" | "COMPLEX_GRID",
            "raw_text": str,
            "sections": [
                {
                    "type": "PARAGRAPH" | "FORMULA" | "DIAGRAM" | "ACTIVITY" | "SOLVED_EXAMPLE" | "EXERCISE_QUESTION" | "DEFINITION" | "SUMMARY",
                    "heading": str,
                    "text": str,
                    "column_index": int,
                    "latex_equations": list[str],
                    "image_path": str,
                    "image_caption": str,
                    "metadata": dict
                }
            ]
        }
        """
        pass
