"""
Unified, Resilient Google Gemini Client for Document AI Microservice.

================================================================================
PRIVACY & DATA POLICY NOTICE (GOOGLE AI FREE TIER):
When using Google's free Gemini API tier (ai.google.dev), user content and model
interactions may be logged, reviewed by human reviewers, and used by Google to train
and improve Google products and machine learning models.
Teachers and school administrators must be informed before uploading any student-authored
or confidential examination documents. For sensitive student records or strict FERPA/GDPR
compliance, an enterprise Vertex AI or HIPAA/BAA-compliant cloud project must be configured.
================================================================================
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import random
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import requests
from PIL import Image

logger = logging.getLogger(__name__)

# Default model recommended by Google Gemini API (March 2026+)
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"



class GeminiClient:
    """
    Singleton shared Gemini client with exponential backoff, rate limiting,
    strict JSON output parsing, disk/Neon cache, and per-job invocation caps.
    """

    _instance: Optional[GeminiClient] = None

    @classmethod
    def get_instance(cls, api_key: Optional[str] = None) -> GeminiClient:
        if cls._instance is None:
            cls._instance = cls(api_key=api_key)
        elif api_key and not cls._instance.api_key:
            cls._instance.api_key = api_key
        return cls._instance

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache_dir: Optional[str] = None,
        backend_api_url: Optional[str] = None,
    ):
        self.api_key = (api_key or os.environ.get("GEMINI_API_KEY", "")).strip()
        self.model_name = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip()
        self.backend_api_url = (backend_api_url or os.environ.get("BACKEND_BASE_URL", "")).strip()
        self.call_cap = int(os.environ.get("GEMINI_CALL_CAP", "20"))
        self.calls_made = 0
        self.cache_dir = cache_dir or os.path.join(tempfile_dir := os.environ.get("TEMP", "/tmp"), "gemini_cache")
        os.makedirs(self.cache_dir, exist_ok=True)
        self.memory_cache: Dict[str, Dict[str, Any]] = {}
        self._verified_models: Optional[List[str]] = None
        self._last_call_time = 0.0
        self.min_call_interval = 0.5  # Rate limit: max 2 calls/sec

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def verify_at_startup(self) -> None:
        """
        Verifies at startup that GEMINI_MODEL exists in Google's current model list.
        Fails fast with a clear, actionable exception if the model is retired or invalid.
        """
        if not self.is_configured:
            return

        if not self.verify_model_exists():
            raise ValueError(
                f"Configured GEMINI_MODEL '{self.model_name}' does not exist in Google Generative AI active model list! "
                f"Please update GEMINI_MODEL in your environment (recommended: {DEFAULT_GEMINI_MODEL})."
            )

    def verify_model_exists(self) -> bool:
        """
        Queries Google's ListModels endpoint to verify that self.model_name
        is an active, supported model.
        """
        if not self.is_configured:
            return False

        if self._verified_models is not None:
            return any(self.model_name in m for m in self._verified_models)

        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
        try:
            res = requests.get(url, timeout=10)
            if res.status_code == 200:
                models_data = res.json().get("models", [])
                available = [m.get("name", "") for m in models_data]
                self._verified_models = available

                is_valid = any(self.model_name in m for m in available)
                if not is_valid:
                    valid_names = [m.replace("models/", "") for m in available if "generateContent" in str(m)]
                    logger.error(
                        f"Configured GEMINI_MODEL '{self.model_name}' does not exist in Google's active model list! "
                        f"Available generateContent models: {valid_names[:10]}"
                    )
                    return False
                return True
            else:
                logger.warning(f"Could not verify Gemini model list (HTTP {res.status_code}): {res.text[:120]}")
                return False
        except Exception as err:
            logger.warning(f"Error connecting to Gemini models endpoint: {err}")
            return False

    def _get_cached_result(self, cache_key: str) -> Optional[Any]:
        """Looks up cached Gemini response from memory, local disk, or Neon DB via Django API."""
        # 1. Memory cache
        if cache_key in self.memory_cache:
            return self.memory_cache[cache_key]

        # 2. Disk cache
        disk_file = os.path.join(self.cache_dir, f"gemini_{cache_key}.json")
        if os.path.exists(disk_file):
            try:
                with open(disk_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.memory_cache[cache_key] = data
                    return data
            except Exception:
                pass

        # 3. Remote Neon Database Cache via Django API
        if self.backend_api_url:
            try:
                api_url = f"{self.backend_api_url.rstrip('/')}/api/ingest/cache/gemini/?key={cache_key}"
                res = requests.get(api_url, timeout=4)
                if res.status_code == 200:
                    payload = res.json()
                    if payload.get("found") and "response_data" in payload:
                        data = payload["response_data"]
                        self.memory_cache[cache_key] = data
                        logger.debug(f"[Gemini Cache] Neon DB hit for key {cache_key[:12]}")
                        return data
            except Exception as net_err:
                logger.debug(f"[Gemini Cache] Remote Neon cache lookup error: {net_err}")

        return None

    def _store_cached_result(
        self,
        cache_key: str,
        data: Any,
        file_hash: str = "",
        page_num: int = 1,
        prompt_version: str = "v1",
    ) -> None:
        """Stores Gemini response in memory, disk, and persists to Neon DB via Django API."""
        self.memory_cache[cache_key] = data
        disk_file = os.path.join(self.cache_dir, f"gemini_{cache_key}.json")
        try:
            with open(disk_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception:
            pass

        if self.backend_api_url:
            try:
                api_url = f"{self.backend_api_url.rstrip('/')}/api/ingest/cache/gemini/"
                payload = {
                    "cache_key": cache_key,
                    "file_hash": file_hash,
                    "page_number": page_num,
                    "prompt_version": prompt_version,
                    "response_data": data if isinstance(data, dict) else {"text": data},
                }
                requests.post(api_url, json=payload, timeout=5)
            except Exception as post_err:
                logger.debug(f"[Gemini Cache] Remote Neon cache save notice: {post_err}")

    def generate_json(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        image_mime: str = "image/png",
        file_hash: str = "doc",
        page_num: int = 1,
        prompt_version: str = "v1",
        timeout: int = 25,
    ) -> Optional[Dict[str, Any]]:
        """
        Executes a Gemini Vision or Text generation call returning a parsed JSON object.
        Applies:
        - Result cache (file_hash + page + prompt_version)
        - Exponential backoff on 429/5xx (retries up to 3 times)
        - Strict temperature 0
        - Per-job call cap guard
        """
        if not self.is_configured:
            logger.info("No GEMINI_API_KEY configured; skipping Gemini call.")
            return None

        # 1. Check Per-Job Call Cap
        if self.calls_made >= self.call_cap:
            logger.warning(
                f"[Gemini Quota Guard] Reached job limit of {self.call_cap} calls. "
                "Subsequent pages will be routed to fallback with needs_review=True."
            )
            return None

        # 2. Check Memory, Disk & Neon DB Cache
        cache_key = hashlib.sha256(f"{file_hash}:{page_num}:{prompt_version}".encode()).hexdigest()
        cached = self._get_cached_result(cache_key)
        if cached is not None:
            logger.debug(f"[Gemini Cache] Hit for {file_hash} p{page_num}")
            return cached

        # 3. Construct Request Body with Strict Temperature 0
        parts: List[Dict[str, Any]] = [{"text": prompt}]
        if image_bytes:
            b64_data = base64.b64encode(image_bytes).decode("utf-8")
            parts.append({
                "inlineData": {
                    "mimeType": image_mime,
                    "data": b64_data,
                }
            })

        body = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
            },
        }

        # 4. Rate Limiting
        elapsed = time.time() - self._last_call_time
        if elapsed < self.min_call_interval:
            time.sleep(self.min_call_interval - elapsed)

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"

        # 5. Exponential Backoff on 429/5xx
        max_attempts = 3
        backoff_sec = 2.0

        for attempt in range(1, max_attempts + 1):
            try:
                self._last_call_time = time.time()
                res = requests.post(url, json=body, timeout=timeout)
                self.calls_made += 1

                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        logger.warning(f"[Gemini] Empty candidates for page {page_num}")
                        return None

                    cand_parts = candidates[0].get("content", {}).get("parts", [])
                    if not cand_parts:
                        return None

                    raw_text = cand_parts[0].get("text", "").strip()

                    # Strip markdown code blocks if wrapped
                    if raw_text.startswith("```"):
                        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                        raw_text = re.sub(r"\s*```$", "", raw_text)

                    parsed = json.loads(raw_text)

                    # Persist in memory, disk, and Neon DB
                    self._store_cached_result(
                        cache_key,
                        parsed,
                        file_hash=file_hash,
                        page_num=page_num,
                        prompt_version=prompt_version,
                    )
                    return parsed

                elif res.status_code in (429, 500, 502, 503, 504):
                    # Rate limit or transient error
                    if attempt < max_attempts:
                        jitter = random.uniform(0.5, 1.5)
                        wait_time = backoff_sec + jitter
                        logger.warning(
                            f"[Gemini API HTTP {res.status_code}] Attempt {attempt}/{max_attempts}. "
                            f"Retrying in {wait_time:.1f}s..."
                        )
                        time.sleep(wait_time)
                        backoff_sec *= 2.0
                        continue
                    else:
                        logger.error(
                            f"[Gemini API Quota/Error {res.status_code}] Exhausted {max_attempts} retries: {res.text[:150]}"
                        )
                        return None
                else:
                    logger.warning(f"[Gemini API HTTP {res.status_code}]: {res.text[:150]}")
                    return None

            except requests.exceptions.RequestException as err:
                if attempt < max_attempts:
                    time.sleep(backoff_sec)
                    backoff_sec *= 2.0
                    continue
                logger.error(f"[Gemini API Request Error] {err}")
                return None
            except json.JSONDecodeError as err:
                logger.warning(f"[Gemini Malformed JSON Output] {err}")
                return None

        return None

    def call_with_page_image(
        self,
        page: Any,
        prompt: str,
        page_num: int = 1,
        file_hash: str = "doc",
        prompt_version: str = "v1",
        dpi: int = 150,
    ) -> Optional[Dict[str, Any]]:
        """Helper to render a fitz.Page and call generate_json."""
        try:
            pix = page.get_pixmap(dpi=dpi)
            img_bytes = pix.tobytes("png")
            return self.generate_json(
                prompt=prompt,
                image_bytes=img_bytes,
                image_mime="image/png",
                file_hash=file_hash,
                page_num=page_num,
                prompt_version=prompt_version,
            )
        except Exception as err:
            logger.warning(f"Error rendering page {page_num} for Gemini: {err}")
            return None

    def generate_text(
        self,
        prompt: str,
        image_bytes: Optional[bytes] = None,
        image_mime: str = "image/png",
        file_hash: str = "doc",
        page_num: int = 1,
        prompt_version: str = "v1",
        timeout: int = 35,
        max_attempts: int = 3,
        retry_delay: float = 2.0,
    ) -> Optional[str]:
        """
        Executes a Gemini call returning plain text (transcriptions, OCR corrections).
        Applies exponential backoff, rate limiting, and cache.
        """
        if not self.is_configured:
            return None

        if self.calls_made >= self.call_cap:
            logger.warning(f"[Gemini Quota Guard] Reached job limit of {self.call_cap} calls.")
            return None

        cache_key = hashlib.sha256(f"{file_hash}:{page_num}:{prompt_version}:text".encode()).hexdigest()
        cached = self._get_cached_result(cache_key)
        if cached is not None:
            return cached.get("text") if isinstance(cached, dict) else str(cached)

        parts: List[Dict[str, Any]] = [{"text": prompt}]
        if image_bytes:
            b64_data = base64.b64encode(image_bytes).decode("utf-8")
            parts.append({
                "inlineData": {
                    "mimeType": image_mime,
                    "data": b64_data,
                }
            })

        body = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.0,
            },
        }

        elapsed = time.time() - self._last_call_time
        if elapsed < self.min_call_interval:
            time.sleep(self.min_call_interval - elapsed)

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"

        backoff_sec = retry_delay

        for attempt in range(1, max_attempts + 1):
            try:
                self._last_call_time = time.time()
                res = requests.post(url, json=body, timeout=timeout)
                self.calls_made += 1

                if res.status_code == 200:
                    cand = res.json().get("candidates", [])
                    if cand:
                        p = cand[0].get("content", {}).get("parts", [])
                        if p and p[0].get("text"):
                            result_text = p[0].get("text", "").strip()
                            self._store_cached_result(
                                cache_key,
                                {"text": result_text},
                                file_hash=file_hash,
                                page_num=page_num,
                                prompt_version=prompt_version,
                            )
                            return result_text
                    return None
                elif res.status_code in (429, 500, 502, 503, 504):
                    if attempt < max_attempts:
                        jitter = random.uniform(0.5, 1.5)
                        time.sleep(backoff_sec + jitter)
                        backoff_sec *= 2.0
                        continue
                    return None
                else:
                    return None
            except Exception:
                if attempt < max_attempts:
                    time.sleep(backoff_sec)
                    backoff_sec *= 2.0
                    continue
                return None

        return None

    def transcribe_page_image(
        self,
        page: Any,
        prompt: str = "Transcribe all text from this page accurately in natural reading order.",
        page_num: int = 1,
        file_hash: str = "doc",
        dpi: int = 150,
        timeout: int = 35,
        max_attempts: int = 3,
        retry_delay: float = 2.0,
    ) -> Optional[str]:
        """Renders fitz.Page and executes text transcription via generate_text."""
        try:
            pix = page.get_pixmap(dpi=dpi)
            img_bytes = pix.tobytes("png")
            return self.generate_text(
                prompt=prompt,
                image_bytes=img_bytes,
                image_mime="image/png",
                file_hash=file_hash,
                page_num=page_num,
                prompt_version=f"transcribe_{time.time()}_{page_num}",
                timeout=timeout,
                max_attempts=max_attempts,
                retry_delay=retry_delay,
            )
        except Exception as err:
            logger.warning(f"Error rendering page {page_num} for transcription: {err}")
            return None


def get_shared_gemini_client(api_key: Optional[str] = None) -> GeminiClient:
    """Returns the shared singleton GeminiClient."""
    return GeminiClient.get_instance(api_key=api_key)
