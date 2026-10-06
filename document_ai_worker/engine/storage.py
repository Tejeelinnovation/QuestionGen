"""
Pluggable Storage Backend Interface for Extracted Document Assets.

================================================================================
CRITICAL NOTE ON GOOGLE DRIVE THUMBNAILS:
Google Drive thumbnail URLs (e.g. drive.google.com/thumbnail?id=... or lh3.googleusercontent.com/...)
are intended for lightweight preview rendering. They are subject to Google workspace rate-limits,
quota ceilings, and session cookie requirements. They are NOT a reliable, high-throughput,
production image CDN for serving thousands of concurrent exam-taking students.
For enterprise production, use an S3-compatible object store (e.g. AWS S3, Cloudflare R2).
================================================================================
"""

from __future__ import annotations

import abc
import hashlib
import logging
import os
from typing import Any, Dict, Optional, Union

from .drive_uploader import WorkerGoogleDriveUploader

logger = logging.getLogger(__name__)


class StorageBackend(abc.ABC):
    """
    Abstract interface for asset storage. Files are deterministically named by their SHA-256 hash.
    """

    @abc.abstractmethod
    def upload_bytes(
        self,
        data: bytes,
        mime_type: str = "image/png",
        ext: str = "png",
    ) -> Dict[str, Any]:
        """
        Uploads binary bytes and returns a dictionary with metadata:
        {
            "sha256": str,
            "filename": str,
            "url": str,
            "backend": str,
        }
        """
        pass

    @abc.abstractmethod
    def get_url(self, file_id_or_hash: str) -> str:
        """Returns access URL for a given file identifier or hash."""
        pass


class GoogleDriveStorageBackend(StorageBackend):
    """
    Default Storage Backend. Uploads assets to Google Drive using WorkerGoogleDriveUploader.
    Files are named deterministically by SHA-256 hash: {sha256}.{ext}.
    """

    def __init__(self, token_json: str = "", folder_id: str = ""):
        self.uploader = WorkerGoogleDriveUploader(token_json=token_json, folder_id=folder_id)
        self.is_active = self.uploader.is_configured()

    def upload_bytes(
        self,
        data: bytes,
        mime_type: str = "image/png",
        ext: str = "png",
    ) -> Dict[str, Any]:
        sha = hashlib.sha256(data).hexdigest()
        filename = f"{sha}.{ext}"

        if not self.is_active:
            # Fallback to in-memory data URL if Drive is unconfigured
            import base64
            b64 = base64.b64encode(data).decode("utf-8")
            data_url = f"data:{mime_type};base64,{b64}"
            return {
                "sha256": sha,
                "filename": filename,
                "url": data_url,
                "backend": "data_uri_fallback",
            }

        res = self.uploader.upload_diagram_bytes(data, filename, mime_type=mime_type)
        if res and res.get("thumbnail_url"):
            return {
                "sha256": sha,
                "filename": filename,
                "url": res["thumbnail_url"],
                "drive_file_id": res.get("file_id", ""),
                "backend": "google_drive",
            }

        # Fallback if upload failed
        import base64
        b64 = base64.b64encode(data).decode("utf-8")
        return {
            "sha256": sha,
            "filename": filename,
            "url": f"data:{mime_type};base64,{b64}",
            "backend": "data_uri_fallback",
        }

    def get_url(self, file_id_or_hash: str) -> str:
        return f"https://drive.google.com/thumbnail?id={file_id_or_hash}&sz=w1000"


class LocalStorageBackend(StorageBackend):
    """
    Local filesystem storage backend for development, tests, and air-gapped environments.
    """

    def __init__(self, storage_dir: str = "media/extracted_assets"):
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)

    def upload_bytes(
        self,
        data: bytes,
        mime_type: str = "image/png",
        ext: str = "png",
    ) -> Dict[str, Any]:
        sha = hashlib.sha256(data).hexdigest()
        filename = f"{sha}.{ext}"
        dest_path = os.path.join(self.storage_dir, filename)

        if not os.path.exists(dest_path):
            with open(dest_path, "wb") as f:
                f.write(data)

        return {
            "sha256": sha,
            "filename": filename,
            "url": f"/media/extracted_assets/{filename}",
            "local_path": dest_path,
            "backend": "local_filesystem",
        }

    def get_url(self, file_id_or_hash: str) -> str:
        return f"/media/extracted_assets/{file_id_or_hash}.png"


def get_default_storage_backend() -> StorageBackend:
    """Factory function returning the configured default storage backend."""
    token = os.getenv("DRIVE_TOKEN_JSON", "")
    folder = os.getenv("DRIVE_FOLDER_ID", "")
    if token and folder:
        return GoogleDriveStorageBackend(token_json=token, folder_id=folder)
    return LocalStorageBackend()
