"""
Unit Tests for Gemini Retry and Fallback Logic.
Tests mocked responses for:
1. Success (HTTP 200 with valid transcribed content)
2. Rate Limit (HTTP 429 with retry backoff and graceful None fallback)
3. Timeout (requests.exceptions.Timeout with graceful None fallback)
4. Bad Response (HTTP 500, empty candidates array, and malformed JSON)
"""

import unittest
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path
import requests
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "document_ai_worker"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from document_ai_worker.cli_extractor import retry_page_with_gemini


class TestGeminiRetry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Golden PDF path for rendering a test page
        cls.pdf_path = str(Path("eval/golden/single_chapter/sample.pdf"))

    @patch("requests.post")
    def test_gemini_retry_success(self, mock_post):
        """Verifies that a 200 response with valid candidate text returns transcribed string."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "Transcribed Chapter 1 Heading and introductory notes."}
                        ]
                    }
                }
            ]
        }
        mock_post.return_value = mock_response

        result = retry_page_with_gemini(
            local_pdf=self.pdf_path,
            page_num=1,
            gemini_api_key="mock_test_key",
            timeout=5,
            max_retries=1,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result, "Transcribed Chapter 1 Heading and introductory notes.")
        mock_post.assert_called_once()

    @patch("requests.post")
    def test_gemini_retry_rate_limit_429(self, mock_post):
        """Verifies that HTTP 429 triggers retry attempts and returns None on exhaustion."""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = '{"error": {"code": 429, "message": "Resource has been exhausted"}}'
        mock_post.return_value = mock_response

        result = retry_page_with_gemini(
            local_pdf=self.pdf_path,
            page_num=1,
            gemini_api_key="mock_test_key",
            timeout=5,
            max_retries=2,
            retry_delay=0.01,
        )

        self.assertIsNone(result)
        self.assertEqual(mock_post.call_count, 2)

    @patch("requests.post")
    def test_gemini_retry_timeout(self, mock_post):
        """Verifies that network timeout is caught, retried, and returns None gracefully."""
        mock_post.side_effect = requests.exceptions.Timeout("Connection timed out after 5000ms")

        result = retry_page_with_gemini(
            local_pdf=self.pdf_path,
            page_num=1,
            gemini_api_key="mock_test_key",
            timeout=5,
            max_retries=2,
            retry_delay=0.01,
        )

        self.assertIsNone(result)
        self.assertEqual(mock_post.call_count, 2)

    @patch("requests.post")
    def test_gemini_retry_bad_response_500(self, mock_post):
        """Verifies that an HTTP 500 server error returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        result = retry_page_with_gemini(
            local_pdf=self.pdf_path,
            page_num=1,
            gemini_api_key="mock_test_key",
            timeout=5,
            max_retries=1,
        )

        self.assertIsNone(result)

    @patch("requests.post")
    def test_gemini_retry_bad_response_empty_candidates(self, mock_post):
        """Verifies that a 200 response with empty candidates returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"candidates": []}
        mock_post.return_value = mock_response

        result = retry_page_with_gemini(
            local_pdf=self.pdf_path,
            page_num=1,
            gemini_api_key="mock_test_key",
            timeout=5,
            max_retries=1,
        )

        self.assertIsNone(result)

    @patch("requests.post")
    def test_gemini_retry_bad_response_malformed_json(self, mock_post):
        """Verifies that a 200 response with malformed JSON body returns None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_post.return_value = mock_response

        result = retry_page_with_gemini(
            local_pdf=self.pdf_path,
            page_num=1,
            gemini_api_key="mock_test_key",
            timeout=5,
            max_retries=1,
        )

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
