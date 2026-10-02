"""
Google Drive Storage Client.

Provides cloud backup of uploaded PDFs with link generation.
Gracefully operates in local fallback mode if credentials are not configured.

Uses OAuth 2.0 User Credentials (giving you your personal 15GB free storage quota):
  - Local dev: Reads google_drive_token.json from disk.
  - Production (Render): Reads GOOGLE_DRIVE_USER_TOKEN_JSON environment variable.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional
from django.conf import settings

logger = logging.getLogger(__name__)


class GoogleDriveClient:
    """
    Handles file upload and link retrieval for Google Drive.
    """

    SCOPES = ["https://www.googleapis.com/auth/drive.file"]

    def __init__(self):
        self.folder_id = (
            getattr(settings, "GOOGLE_DRIVE_FOLDER_ID", "")
            or os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")
        ).strip()
        self.user_token_file = (
            getattr(settings, "GOOGLE_DRIVE_USER_TOKEN_FILE", "")
            or os.getenv("GOOGLE_DRIVE_USER_TOKEN_FILE", "google_drive_token.json")
        ).strip()
        self.user_token_json = (
            getattr(settings, "GOOGLE_DRIVE_USER_TOKEN_JSON", "")
            or os.getenv("GOOGLE_DRIVE_USER_TOKEN_JSON", "")
        ).strip()

    def get_credentials(self) -> Optional[Any]:
        """
        Loads Google OAuth 2.0 user credentials from JSON string or file.
        Automatically refreshes expired access tokens.
        """
        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request

            user_creds: Optional[Credentials] = None

            # 1. Try JSON string from environment variable (ideal for Render / Cloud)
            if self.user_token_json:
                try:
                    info = (
                        json.loads(self.user_token_json)
                        if isinstance(self.user_token_json, str)
                        else self.user_token_json
                    )
                    user_creds = Credentials.from_authorized_user_info(info, scopes=self.SCOPES)
                except Exception as parse_err:
                    logger.warning(f"Failed to parse GOOGLE_DRIVE_USER_TOKEN_JSON: {parse_err}")

            # 2. Try file path on disk (ideal for local development)
            elif self.user_token_file and os.path.exists(self.user_token_file):
                try:
                    user_creds = Credentials.from_authorized_user_file(self.user_token_file, scopes=self.SCOPES)
                except Exception as file_err:
                    logger.warning(f"Failed to load GOOGLE_DRIVE_USER_TOKEN_FILE: {file_err}")

            elif os.path.exists("google_drive_token.json"):
                try:
                    user_creds = Credentials.from_authorized_user_file("google_drive_token.json", scopes=self.SCOPES)
                except Exception as file_err:
                    logger.warning(f"Failed to load google_drive_token.json: {file_err}")

            # Automatically refresh expired credentials if refresh_token is present
            if user_creds:
                if user_creds.expired and user_creds.refresh_token:
                    try:
                        user_creds.refresh(Request())
                        save_target = self.user_token_file if (self.user_token_file and os.path.exists(self.user_token_file)) else "google_drive_token.json"
                        if os.path.exists(save_target):
                            with open(save_target, "w", encoding="utf-8") as f:
                                f.write(user_creds.to_json())
                    except Exception as ref_err:
                        logger.warning(f"Could not refresh Google Drive user token: {ref_err}")
                return user_creds

        except ImportError:
            logger.warning("google-auth/google-api-python-client not installed. Using local fallback.")

        return None

    def is_configured(self) -> bool:
        """Returns True if Google Drive credentials are configured."""
        return self.get_credentials() is not None

    def upload_file(self, local_file_path: str, destination_name: str) -> Dict[str, str]:
        """
        Uploads a local file to Google Drive and returns {'file_id': ..., 'web_view_link': ...}.
        If credentials are not yet set up, returns a local pseudo-reference for testing.
        """
        if not os.path.exists(local_file_path):
            return {"file_id": "", "web_view_link": ""}

        creds = self.get_credentials()
        if creds:
            try:
                from googleapiclient.discovery import build
                from googleapiclient.http import MediaFileUpload

                service = build("drive", "v3", credentials=creds)

                file_metadata: Dict[str, Any] = {"name": destination_name}
                if self.folder_id:
                    file_metadata["parents"] = [self.folder_id]

                media = MediaFileUpload(local_file_path, resumable=True)
                uploaded = (
                    service.files()
                    .create(
                        body=file_metadata,
                        media_body=media,
                        fields="id, webViewLink, webContentLink",
                        supportsAllDrives=True,
                    )
                    .execute()
                )

                file_id = uploaded.get("id", "")
                web_view_link = uploaded.get("webViewLink", "")

                # Make file accessible via link if possible
                try:
                    service.permissions().create(
                        fileId=file_id,
                        body={"role": "reader", "type": "anyone"},
                        supportsAllDrives=True,
                    ).execute()
                except Exception as perm_err:
                    logger.debug(f"Could not set public permission on Drive file: {perm_err}")

                return {
                    "file_id": file_id,
                    "web_view_link": web_view_link,
                }
            except Exception as e:
                logger.warning(f"Google Drive upload failed: {e}. Falling back to local storage link.")

        # Local fallback representation when Drive is not configured
        return {
            "file_id": f"local_{os.path.basename(local_file_path)}",
            "web_view_link": f"/media/ingestion_raw/{os.path.basename(local_file_path)}",
        }

    _folder_cache: Dict[str, str] = {}

    def get_or_create_subfolder(self, service: Any, subfolder_name: str, parent_id: Optional[str] = None) -> Optional[str]:
        """
        Finds or creates a subfolder inside parent_id (or self.folder_id).
        Uses memory cache to avoid repeated Drive API lookups.
        """
        parent = parent_id or self.folder_id
        cache_key = f"{parent}_{subfolder_name}"
        if cache_key in self._folder_cache:
            return self._folder_cache[cache_key]

        try:
            query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{subfolder_name}' and trashed = false"
            if parent:
                query += f" and '{parent}' in parents"

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
                folder_metadata: Dict[str, Any] = {
                    "name": subfolder_name,
                    "mimeType": "application/vnd.google-apps.folder",
                }
                if parent:
                    folder_metadata["parents"] = [parent]

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
            logger.warning(f"Could not get or create subfolder '{subfolder_name}': {e}")

        return parent

    def upload_bytes(
        self,
        data: bytes,
        destination_name: str,
        mime_type: str = "image/png",
        subfolder_name: str = "Extracted-Diagrams",
    ) -> Dict[str, str]:
        """
        Uploads in-memory image bytes directly to a subfolder inside Google Drive without touching local disk.
        Returns {'file_id': ..., 'web_view_link': ..., 'direct_url': ...}.
        """
        creds = self.get_credentials()
        if creds:
            try:
                from googleapiclient.discovery import build
                from googleapiclient.http import MediaIoBaseUpload
                import io

                service = build("drive", "v3", credentials=creds)

                # Route into dedicated subfolder (e.g. 'Extracted-Diagrams')
                target_folder_id = self.folder_id
                if subfolder_name:
                    sub_id = self.get_or_create_subfolder(service, subfolder_name, parent_id=self.folder_id)
                    if sub_id:
                        target_folder_id = sub_id

                file_metadata: Dict[str, Any] = {"name": destination_name}
                if target_folder_id:
                    file_metadata["parents"] = [target_folder_id]

                media = MediaIoBaseUpload(io.BytesIO(data), mimetype=mime_type, resumable=False)
                uploaded = (
                    service.files()
                    .create(
                        body=file_metadata,
                        media_body=media,
                        fields="id, webViewLink, webContentLink",
                        supportsAllDrives=True,
                    )
                    .execute()
                )

                file_id = uploaded.get("id", "")
                web_view_link = uploaded.get("webViewLink", "")

                try:
                    service.permissions().create(
                        fileId=file_id,
                        body={"role": "reader", "type": "anyone"},
                        supportsAllDrives=True,
                    ).execute()
                except Exception:
                    pass

                direct_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"
                return {
                    "file_id": file_id,
                    "web_view_link": web_view_link,
                    "direct_url": direct_url,
                }
            except Exception as e:
                logger.warning(f"Google Drive upload bytes failed for {destination_name}: {e}")

        return {"file_id": "", "web_view_link": "", "direct_url": ""}

    def download_file(self, file_id: str, destination_path: str) -> bool:
        """
        Downloads a file from Google Drive given its file_id and writes it to destination_path.
        Returns True if download succeeded and file is non-empty, False otherwise.
        """
        if not file_id or file_id.startswith("local_"):
            return False

        creds = self.get_credentials()
        if not creds:
            logger.warning("No Google Drive credentials configured. Cannot download file.")
            return False

        try:
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaIoBaseDownload
            import io

            service = build("drive", "v3", credentials=creds)
            request = service.files().get_media(fileId=file_id, supportsAllDrives=True)

            os.makedirs(os.path.dirname(os.path.abspath(destination_path)), exist_ok=True)
            with open(destination_path, "wb") as fh:
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                    if status:
                        logger.debug(f"Google Drive download progress: {int(status.progress() * 100)}%")

            if os.path.exists(destination_path) and os.path.getsize(destination_path) > 0:
                logger.info(f"Successfully downloaded Google Drive file {file_id} to {destination_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Google Drive download failed for file {file_id}: {e}", exc_info=True)
            if os.path.exists(destination_path):
                try:
                    os.remove(destination_path)
                except OSError:
                    pass
            return False

    def delete_file(self, file_id: str) -> bool:
        """
        Deletes a file from Google Drive given its file_id.
        Returns True if successful, False otherwise.
        """
        if not file_id or file_id.startswith("local_"):
            return False

        creds = self.get_credentials()
        if not creds:
            return False

        try:
            from googleapiclient.discovery import build

            service = build("drive", "v3", credentials=creds)
            service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
            logger.info(f"Successfully deleted Google Drive file {file_id}")
            return True
        except Exception as e:
            logger.warning(f"Could not delete Google Drive file {file_id}: {e}")
            return False


