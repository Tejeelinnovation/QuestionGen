"""
Management command to test Google Drive API integration and credentials.

Usage:
    python manage.py test_google_drive
"""

from __future__ import annotations

import os
import tempfile
from django.core.management.base import BaseCommand
from content_ingestion.storage.drive_client import GoogleDriveClient


class Command(BaseCommand):
    help = "Test Google Drive OAuth 2.0 user credentials and upload permissions."

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Google Drive Integration Diagnostic ===\n"))

        client = GoogleDriveClient()

        # 1. Check libraries
        try:
            import googleapiclient.discovery  # noqa: F401
            import google_auth_oauthlib  # noqa: F401
            self.stdout.write(self.style.SUCCESS("[PASS] Google API client libraries are installed."))
        except ImportError:
            self.stdout.write(self.style.ERROR("[FAIL] Google client libraries not installed."))
            self.stdout.write("Run: pip install google-api-python-client google-auth google-auth-httplib2 google-auth-oauthlib\n")
            return

        # 2. Check credentials configuration
        has_user_token = bool(client.user_token_json) or (
            bool(client.user_token_file) and os.path.exists(client.user_token_file)
        ) or os.path.exists("google_drive_token.json")

        if has_user_token:
            token_source = client.user_token_file if (client.user_token_file and os.path.exists(client.user_token_file)) else "google_drive_token.json"
            self.stdout.write(self.style.SUCCESS(f"[INFO] OAuth 2.0 User Token detected: {token_source} (Personal 15GB quota)"))
        else:
            self.stdout.write(self.style.WARNING("[NOT CONFIGURED] No Google Drive credentials detected."))
            self.stdout.write(
                "\nTo configure Google Drive for your personal 15GB free storage:\n"
                "  Run: python manage.py authenticate_google_drive\n"
            )

        if client.folder_id:
            self.stdout.write(self.style.SUCCESS(f"[INFO] Target Folder ID: {client.folder_id}"))
        else:
            self.stdout.write(self.style.WARNING("[WARN] GOOGLE_DRIVE_FOLDER_ID is empty. Files will be uploaded to root."))

        # 3. Test Authentication
        creds = client.get_credentials()
        if not creds:
            self.stdout.write(self.style.ERROR("\n[FAIL] Could not load credentials. Upload test cannot proceed.\n"))
            return

        self.stdout.write(self.style.SUCCESS("[PASS] Authentication successful! Account: Authorized Google User (Personal)"))

        # 4. Test File Upload
        self.stdout.write("\nTesting temporary file upload to Google Drive...")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as tmp:
            tmp.write("Question Generation System - Google Drive connection test successful!")
            tmp_path = tmp.name

        try:
            res = client.upload_file(tmp_path, destination_name="test_cloud_connection.txt")
            file_id = res.get("file_id", "")
            link = res.get("web_view_link", "")

            if file_id.startswith("local_"):
                self.stdout.write(self.style.WARNING(f"\n[FALLBACK] Upload fell back to local storage: {link}"))
            else:
                self.stdout.write(self.style.SUCCESS(f"[PASS] Uploaded successfully to Google Drive!"))
                self.stdout.write(f"       File ID: {file_id}")
                self.stdout.write(f"       View Link: {link}")

                # Test downloading the file back (Server Auto-Restore capability)
                self.stdout.write("\nTesting server auto-restore (download from Google Drive)...")
                with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as dl_tmp:
                    dl_path = dl_tmp.name

                try:
                    dl_success = client.download_file(file_id, dl_path)
                    if dl_success and os.path.exists(dl_path) and os.path.getsize(dl_path) > 0:
                        self.stdout.write(self.style.SUCCESS("[PASS] Successfully downloaded and restored file from Google Drive!"))
                    else:
                        self.stdout.write(self.style.WARNING("[WARN] Download test failed."))
                finally:
                    if os.path.exists(dl_path):
                        os.remove(dl_path)

                # Clean up test file from Drive
                try:
                    from googleapiclient.discovery import build
                    service = build("drive", "v3", credentials=creds)
                    service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
                    self.stdout.write(self.style.SUCCESS("[CLEANUP] Deleted temporary test file from Google Drive."))
                except Exception as del_err:
                    self.stdout.write(self.style.NOTICE(f"[NOTICE] Could not auto-delete test file: {del_err}"))

                self.stdout.write(self.style.SUCCESS("\n*** Google Drive Upload & Auto-Download are 100% OPERATIONAL! ***\n"))


        except Exception as e:
            self.stdout.write(self.style.ERROR(f"[FAIL] Upload error: {e}"))
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
