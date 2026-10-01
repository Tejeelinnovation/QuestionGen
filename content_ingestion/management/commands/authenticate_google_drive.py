"""
Management command to perform one-time OAuth 2.0 authorization for Google Drive.

This authenticates with your personal Google / Gmail account, avoiding the
Service Account 'storageQuotaExceeded' restriction on personal Google Drives.

Usage:
    python manage.py authenticate_google_drive
"""

from __future__ import annotations

import glob
import os
import sys
import tempfile
from django.core.management.base import BaseCommand
from content_ingestion.storage.drive_client import GoogleDriveClient


class Command(BaseCommand):
    help = "Perform one-time OAuth 2.0 login to connect your personal Google Drive (with 15GB free storage)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--client-secrets",
            type=str,
            default="",
            help="Path to downloaded OAuth client secrets JSON file.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Google Drive OAuth 2.0 Personal Account Setup ===\n"))

        try:
            from google_auth_oauthlib.flow import InstalledAppFlow
        except ImportError:
            self.stdout.write(
                self.style.ERROR("Error: google-auth-oauthlib is not installed.\nRun: pip install google-auth-oauthlib")
            )
            return

        client_secrets_path = options.get("client_secrets", "").strip()

        # Auto-detect client secrets file if not explicitly passed
        if not client_secrets_path:
            candidates = [
                "oauth_client_secret.json",
                "client_secret.json",
            ] + glob.glob("client_secret_*.json")

            for c in candidates:
                if os.path.exists(c):
                    client_secrets_path = c
                    break

        if not client_secrets_path or not os.path.exists(client_secrets_path):
            self.stdout.write(self.style.WARNING("No OAuth 2.0 Client Secret JSON file found!\n"))
            self.stdout.write(
                "To get this file (Takes 1 minute in Google Cloud Console):\n"
                "  1. Go to: https://console.cloud.google.com/apis/credentials\n"
                "  2. Click '+ CREATE CREDENTIALS' -> 'OAuth client ID'\n"
                "     (Note: If prompted to configure OAuth consent screen, select 'External',\n"
                "      fill App Name: 'QuestionGen', add your email as User & Developer contact, and click Save)\n"
                "  3. Set 'Application type' to: 'Desktop app'\n"
                "  4. Name it: 'QuestionGen Desktop' and click 'Create'\n"
                "  5. Click 'DOWNLOAD JSON' on the popup\n"
                "  6. Move the downloaded file into this project folder and rename it to: 'oauth_client_secret.json'\n"
                "  7. Re-run: python manage.py authenticate_google_drive\n"
            )
            return

        self.stdout.write(self.style.SUCCESS(f"[INFO] Found client secrets: {client_secrets_path}"))
        self.stdout.write(self.style.NOTICE("Opening your browser to authorize your personal Google Drive account..."))

        try:
            flow = InstalledAppFlow.from_client_secrets_file(
                client_secrets_path,
                scopes=GoogleDriveClient.SCOPES,
            )
            creds = flow.run_local_server(
                port=0,
                success_message="Google Drive authorization successful! You may close this tab and return to your terminal.",
            )

            token_path = "google_drive_token.json"
            with open(token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())

            self.stdout.write(self.style.SUCCESS(f"\n[PASS] Successfully authorized! Saved token to: {token_path}"))

            # Test upload immediately
            self.stdout.write("\nTesting immediate file upload with your authorized account...")
            client = GoogleDriveClient()
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as tmp:
                tmp.write("Question Generation System - OAuth 2.0 Google Drive connection successful!")
                tmp_path = tmp.name

            try:
                res = client.upload_file(tmp_path, destination_name="oauth_drive_test.txt")
                file_id = res.get("file_id", "")
                link = res.get("web_view_link", "")

                if file_id and not file_id.startswith("local_"):
                    self.stdout.write(self.style.SUCCESS(f"[PASS] Uploaded successfully to your Google Drive!"))
                    self.stdout.write(f"       File ID: {file_id}")
                    self.stdout.write(f"       View Link: {link}")

                    # Auto-delete test file
                    try:
                        from googleapiclient.discovery import build
                        service = build("drive", "v3", credentials=creds)
                        service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
                        self.stdout.write(self.style.SUCCESS("[CLEANUP] Deleted temporary test file from Google Drive."))
                    except Exception as del_err:
                        self.stdout.write(self.style.NOTICE(f"[NOTICE] Could not auto-delete test file: {del_err}"))

                    self.stdout.write(self.style.SUCCESS("\n*** Google Drive is 100% OPERATIONAL with your 15GB free storage! ***\n"))
                else:
                    self.stdout.write(self.style.WARNING(f"[NOTICE] Upload returned: {res}"))
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\n[FAIL] Authorization failed: {e}\n"))
