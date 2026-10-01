"""
Google Drive Storage Client.

Provides cloud backup of uploaded PDFs with link generation.
Gracefully operates in mock/local fallback mode if credentials are not configured.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, Optional
from django.conf import settings

logger = logging.getLogger(__name__)


class GoogleDriveClient:
    """
    Handles file upload and link retrieval for Google Drive.
    """

    def __init__(self):
        self.folder_id = getattr(settings, "GOOGLE_DRIVE_FOLDER_ID", "") or os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")
        self.service_account_file = getattr(settings, "GOOGLE_DRIVE_CREDENTIALS_FILE", "") or os.getenv("GOOGLE_DRIVE_CREDENTIALS_FILE", "")

    def upload_file(self, local_file_path: str, destination_name: str) -> Dict[str, str]:
        """
        Uploads a local file to Google Drive and returns {'file_id': ..., 'web_view_link': ...}.
        If credentials are not yet set up, returns a local pseudo-reference for testing.
        """
        if not os.path.exists(local_file_path):
            return {"file_id": "", "web_view_link": ""}

        # If real credentials exist and google-api-python-client is present, use it
        if self.service_account_file and os.path.exists(self.service_account_file):
            try:
                from google.oauth2 import service_account
                from googleapiclient.discovery import build
                from googleapiclient.http import MediaFileUpload

                creds = service_account.Credentials.from_service_account_file(
                    self.service_account_file,
                    scopes=["https://www.googleapis.com/auth/drive.file"],
                )
                service = build("drive", "v3", credentials=creds)

                file_metadata = {"name": destination_name}
                if self.folder_id:
                    file_metadata["parents"] = [self.folder_id]

                media = MediaFileUpload(local_file_path, resumable=True)
                uploaded = (
                    service.files()
                    .create(body=file_metadata, media_body=media, fields="id, webViewLink")
                    .execute()
                )

                return {
                    "file_id": uploaded.get("id", ""),
                    "web_view_link": uploaded.get("webViewLink", ""),
                }
            except Exception as e:
                logger.warning(f"Google Drive upload failed: {e}. Falling back to local storage link.")

        # Local fallback representation
        return {
            "file_id": f"local_{os.path.basename(local_file_path)}",
            "web_view_link": f"/media/ingestion_raw/{os.path.basename(local_file_path)}",
        }
