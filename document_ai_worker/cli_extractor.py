"""
CLI Runner for Document AI Extraction inside GitHub Actions or Cloud Containers.

Usage:
    python document_ai_worker/cli_extractor.py \
        --job-id 15 \
        --pdf-url "https://..." \
        --callback-url "https://your-domain.onrender.com/api/ingest/jobs/15/webhook/" \
        --document-kind "TEXTBOOK" \
        --webhook-secret "optional_secret"
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
import urllib.request
import requests

from engine.handwriting_pipeline import HandwritingPipeline
from engine.textbook_pipeline import TextbookPipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [DocumentAI-CLI] %(message)s",
)
logger = logging.getLogger("document-ai-cli")


def download_file(url: str, dest_path: str) -> None:
    """
    Downloads a PDF from a direct URL or Google Drive link.
    """
    logger.info(f"Downloading PDF from: {url}")
    if "drive.google.com" in url and "id=" in url:
        file_id = url.split("id=")[1].split("&")[0]
        download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    else:
        download_url = url

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    req = urllib.request.Request(download_url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as response, open(dest_path, "wb") as out_file:
        out_file.write(response.read())

    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    logger.info(f"Downloaded PDF successfully: {size_mb:.2f} MB saved to {dest_path}")


def send_webhook(callback_url: str, payload: dict, secret: str = "") -> None:
    """
    Posts the extraction result back to the Django backend.
    """
    logger.info(f"Delivering extraction results to Webhook: {callback_url}")
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Ingestion-Secret"] = secret

    res = requests.post(callback_url, json=payload, headers=headers, timeout=120)
    logger.info(f"Webhook response status code: {res.status_code}")
    if res.status_code >= 400:
        logger.error(f"Webhook error response: {res.text}")
        res.raise_for_status()


def main():
    parser = argparse.ArgumentParser(description="Run Document AI extraction on a PDF.")
    parser.add_argument("--job-id", type=int, required=True, help="Django IngestionJob ID")
    parser.add_argument("--pdf-url", type=str, required=True, help="Public or Drive URL of PDF")
    parser.add_argument("--callback-url", type=str, required=True, help="Django Webhook Callback URL")
    parser.add_argument("--document-kind", type=str, default="TEXTBOOK", help="TEXTBOOK or HANDWRITTEN_NOTES")
    parser.add_argument("--webhook-secret", type=str, default="", help="Optional webhook verification secret")

    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix="doc_ai_cli_")
    local_pdf = os.path.join(temp_dir, f"job_{args.job_id}.pdf")

    try:
        # 1. Download file
        download_file(args.pdf_url, local_pdf)

        # 2. Select appropriate extraction pipeline
        if args.document_kind == "HANDWRITTEN_NOTES":
            logger.info("Initializing Handwriting Pipeline...")
            pipeline = HandwritingPipeline(media_dir=os.path.join(temp_dir, "assets"))
            chapters, pages, granularity = pipeline.process_pdf(local_pdf)
        else:
            logger.info("Initializing Textbook & Pedagogical Pipeline...")
            pipeline = TextbookPipeline(media_dir=os.path.join(temp_dir, "assets"))
            chapters, pages, granularity = pipeline.process_pdf(local_pdf)

        logger.info(
            f"Extraction complete! Found {len(chapters)} chapters and {len(pages)} pages. "
            f"Granularity: {granularity}"
        )

        # 3. Assemble JSON Payload matching Django IngestionJobWebhookView expectations
        payload = {
            "job_id": args.job_id,
            "status": "COMPLETED",
            "granularity": granularity,
            "chapters": [ch.model_dump() for ch in chapters],
            "pages": [p.model_dump() for p in pages],
            "total_pages": len(pages),
        }

        # 4. Dispatch back to Django Webhook
        send_webhook(args.callback_url, payload, secret=args.webhook_secret)
        logger.info(f"[SUCCESS] IngestionJob #{args.job_id} successfully extracted and delivered!")

    except Exception as exc:
        logger.error(f"[ERROR] Failed during extraction of Job #{args.job_id}: {exc}", exc_info=True)
        # Notify Django backend of failure so UI updates immediately
        try:
            error_payload = {
                "job_id": args.job_id,
                "status": "FAILED",
                "error": str(exc),
            }
            send_webhook(args.callback_url, error_payload, secret=args.webhook_secret)
        except Exception as notify_err:
            logger.error(f"Could not send error notification to webhook: {notify_err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
