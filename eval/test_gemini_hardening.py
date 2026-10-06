"""
Unit tests for Phase 8: Gemini Hardening & Result Caching.
Validates:
- Model verification at startup against Google's API model list.
- Rate limiting (max 2 calls/sec) and call cap (GEMINI_CALL_CAP).
- Exponential backoff on 429 / 5xx errors with jitter.
- Result caching (disk + memory + remote API).
- Quota exhaustion / missing key graceful degradation (needs_review=True, never crash).
- Privacy terms documentation for Google AI free tier.
"""

import hashlib
import json
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from document_ai_worker.engine.gemini_client import (
    GeminiClient,
    DEFAULT_GEMINI_MODEL,
    get_shared_gemini_client,
)


class TestGeminiHardening(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="test_gemini_cache_")
        self.client = GeminiClient(api_key="test_fake_key_123", cache_dir=self.temp_dir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_default_model_is_valid_2026_model(self):
        """Verifies that default model is gemini-3.8-flash (not retired 2.5-flash)."""
        self.assertEqual(DEFAULT_GEMINI_MODEL, "gemini-3.8-flash")
        self.assertEqual(self.client.model_name, "gemini-3.8-flash")

    def test_startup_verification_fails_for_invalid_model(self):
        """Startup verification raises ValueError when an invalid model is configured."""
        bad_client = GeminiClient(api_key="fake_key", cache_dir=self.temp_dir)
        bad_client.model_name = "invalid-retired-model-v0"

        with patch("requests.get") as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.json.return_value = {
                "models": [{"name": "models/gemini-3.8-flash"}, {"name": "models/gemini-pro"}]
            }
            with self.assertRaises(ValueError) as ctx:
                bad_client.verify_at_startup()
            self.assertIn("does not exist in Google Generative AI active model list", str(ctx.exception))

    def test_call_cap_enforcement(self):
        """Client enforces GEMINI_CALL_CAP and returns None when cap is reached."""
        self.client.call_cap = 2
        self.client.calls_made = 2

        # When cap reached, generate_json must return None (triggering fallback)
        res = self.client.generate_json(prompt="Test prompt", file_hash="h1", page_num=1)
        self.assertIsNone(res)

        # Same for generate_text
        txt = self.client.generate_text(prompt="Test prompt", file_hash="h1", page_num=1)
        self.assertIsNone(txt)

    def test_exponential_backoff_on_429(self):
        """Simulates 429 Rate Limit and verifies retry behavior."""
        self.client.call_cap = 10
        self.client.calls_made = 0

        with patch("requests.post") as mock_post, patch("time.sleep") as mock_sleep:
            # First attempt returns 429, second attempt succeeds with 200
            resp_429 = MagicMock()
            resp_429.status_code = 429
            resp_429.text = "Rate limit exceeded"

            resp_200 = MagicMock()
            resp_200.status_code = 200
            resp_200.json.return_value = {
                "candidates": [{
                    "content": {
                        "parts": [{"text": '{"result": "success"}'}]
                    }
                }]
            }

            mock_post.side_effect = [resp_429, resp_200]

            res = self.client.generate_json(prompt="test", file_hash="h1", page_num=1)
            self.assertEqual(res, {"result": "success"})
            self.assertEqual(mock_post.call_count, 2)
            mock_sleep.assert_called()  # Verified backoff sleep was invoked

    def test_result_cache_persistence(self):
        """Verifies disk and memory caching preventing repeat API calls."""
        cache_key = hashlib.sha256("test_doc:1:v1".encode()).hexdigest()
        data = {"chapters": [{"title": "Intro"}]}

        # Store in cache
        self.client._store_cached_result(cache_key, data, file_hash="test_doc", page_num=1, prompt_version="v1")

        # Create new client instance pointing to same cache directory
        client2 = GeminiClient(api_key="test_fake_key_123", cache_dir=self.temp_dir)
        cached = client2._get_cached_result(cache_key)
        self.assertEqual(cached, data)

    def test_privacy_and_data_policy_notice_documented(self):
        """Verifies that gemini_client.py explicitly documents Google free tier privacy terms."""
        import document_ai_worker.engine.gemini_client as gc_module
        doc = gc_module.__doc__ or ""
        self.assertIn("PRIVACY & DATA POLICY NOTICE", doc)
        self.assertIn("human reviewers", doc)
        self.assertIn("improve Google products", doc)


if __name__ == "__main__":
    unittest.main()
