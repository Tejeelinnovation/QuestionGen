"""
Google Drive Diagram Uploader for Document AI Worker.

Runs directly on the 16GB GitHub Actions runner to stream extracted diagrams
into Google Drive ('QuestionGen-Uploads/Extracted-Diagrams') and return direct thumbnail URLs.
Ensures zero memory bloat (<50KB webhook payload) so Render 512MB RAM server never crashes.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class WorkerGoogleDriveUploader:
    """
    Client for uploading diagram image bytes directly to Google Drive
    from the GitHub Actions runner.
    """

    SCOPES = ["https://www.googleapis.com/auth/drive.file"]
    _folder_cache: Dict[str, str] = {}

    def __init__(self, token_json: str = "", folder_id: str = ""):
        self.token_json = (token_json or os.getenv("DRIVE_TOKEN_JSON", "")).strip()
        self.folder_id = (folder_id or os.getenv("DRIVE_FOLDER_ID", "")).strip()

    def get_credentials(self) -> Optional[Any]:
        if not self.token_json:
            return None
        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request

            info = json.loads(self.token_json) if isinstance(self.token_json, str) else self.token_json
            user_creds = Credentials.from_authorized_user_info(info, scopes=self.SCOPES)
            if user_creds and user_creds.expired and user_creds.refresh_token:
                user_creds.refresh(Request())
            return user_creds
        except Exception as e:
            logger.warning(f"Could not load Google Drive credentials on runner: {e}")
            return None

    def is_configured(self) -> bool:
        return self.get_credentials() is not None

    _local = threading.local()

    def get_service(self) -> Optional[Any]:
        """
        Thread-safe Google Drive service getter.
        Uses threading.local to ensure each worker thread has its own discovery client
        instance without connection collision.
        """
        if not hasattr(self._local, "service") or self._local.service is None:
            creds = self.get_credentials()
            if not creds:
                return None
            try:
                from googleapiclient.discovery import build
                self._local.service = build("drive", "v3", credentials=creds, cache_discovery=False)
            except Exception as e:
                logger.warning(f"Could not build Google Drive service: {e}")
                return None
        return self._local.service

    def get_or_create_subfolder(self, service: Any, subfolder_name: str = "Extracted-Diagrams") -> Optional[str]:
        cache_key = f"{self.folder_id}_{subfolder_name}"
        if cache_key in self._folder_cache:
            return self._folder_cache[cache_key]

        try:
            query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{subfolder_name}' and trashed = false"
            if self.folder_id:
                query += f" and '{self.folder_id}' in parents"

            response = service.files().list(
                q=query,
                spaces="drive",
                fields="files(id, name)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()

            files = response.get("files", [])
            if files:
                folder_id = files[0]["id"]
            else:
                folder_metadata = {
                    "name": subfolder_name,
                    "mimeType": "application/vnd.google-apps.folder",
                }
                if self.folder_id:
                    folder_metadata["parents"] = [self.folder_id]

                folder = service.files().create(
                    body=folder_metadata,
                    fields="id",
                    supportsAllDrives=True,
                ).execute()
                folder_id = folder.get("id")
                try:
                    service.permissions().create(
                        fileId=folder_id,
                        body={"role": "reader", "type": "anyone"},
                        supportsAllDrives=True,
                    ).execute()
                except Exception:
                    pass

            if folder_id:
                self._folder_cache[cache_key] = folder_id
                return folder_id
        except Exception as e:
            logger.warning(f"Could not get or create subfolder '{subfolder_name}' on runner: {e}")

        return self.folder_id

    def upload_bytes(
        self,
        data: bytes,
        destination_name: str,
        mime_type: str = "image/png",
        subfolder_name: str = "Extracted-Diagrams",
    ) -> str:
        """
        Uploads in-memory image bytes directly to Google Drive.
        Returns the direct public thumbnail URL.
        """
        service = self.get_service()
        if not service:
            return ""

        try:
            from googleapiclient.http import MediaIoBaseUpload
            import io

            target_folder_id = self.get_or_create_subfolder(service, subfolder_name)

            file_metadata = {"name": destination_name}
            if target_folder_id:
                file_metadata["parents"] = [target_folder_id]

            media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mime_type, resumable=False)
            uploaded = service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id",
                supportsAllDrives=True,
            ).execute()

            file_id = uploaded.get("id", "")
            if not file_id:
                return ""

            direct_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"
            return direct_url
        except Exception as e:
            logger.warning(f"Runner Google Drive upload failed for {destination_name}: {e}")
            return ""

