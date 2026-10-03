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
import base64
import json
import logging
import os
import shutil
import sys
import tempfile
import time
import urllib.request
import requests

from engine.docling_pipeline import DoclingPipeline
from engine.drive_uploader import WorkerGoogleDriveUploader
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
    Validates that the downloaded file is a genuine PDF binary.
    """
    import re
    logger.info(f"Downloading PDF from: {url}")

    # Check if this is a Google Drive link
    drive_id = None
    if "drive.google.com" in url:
        m = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
        if m:
            drive_id = m.group(1)
        else:
            m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
            if m:
                drive_id = m.group(1)

    if drive_id:
        logger.info(f"Detected Google Drive File ID: {drive_id}. Downloading with confirmation handling...")
        session = requests.Session()
        drive_url = "https://drive.google.com/uc?export=download"
        res = session.get(drive_url, params={"id": drive_id}, stream=True, timeout=120)
        # Check for Google Drive virus warning token
        for k, v in res.cookies.items():
            if k.startswith("download_warning"):
                res = session.get(drive_url, params={"id": drive_id, "confirm": v}, stream=True, timeout=120)
                break
        res.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)
    else:
        # Standard direct URL download (including Django backend source PDF endpoint)
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        res = requests.get(url, headers=headers, stream=True, timeout=120)
        res.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)

    size_mb = os.path.getsize(dest_path) / (1024 * 1024)
    logger.info(f"Downloaded file: {size_mb:.2f} MB saved to {dest_path}")

    # Validate PDF Magic Bytes (%PDF-)
    with open(dest_path, "rb") as f:
        magic = f.read(5)
        if magic != b"%PDF-":
            f.seek(0)
            sample = f.read(500).decode("utf-8", errors="ignore")
            raise ValueError(
                f"Downloaded file from {url} is not a valid PDF! (First bytes: {magic!r}). "
                f"Content preview: {sample[:150]}"
            )
def auto_detect_document_kind(pdf_path: str) -> str:
    """
    Inspects PDF structure in ~5 milliseconds.
    Determines whether the document is a printed digital TEXTBOOK or a scanned/camera HANDWRITTEN_NOTES.
    """
    import pymupdf as fitz
    try:
        doc = fitz.open(pdf_path)
        sample_pages = min(len(doc), 3)
        if sample_pages == 0:
            doc.close()
            return "TEXTBOOK"

        total_chars = 0
        scanned_bitmap_pages = 0
        has_vector_fonts = False

        for p_idx in range(sample_pages):
            page = doc[p_idx]
            fonts = page.get_fonts()
            if fonts:
                has_vector_fonts = True

            text = page.get_text("text").strip()
            total_chars += len(text)

            images = page.get_images()
            # If the page consists essentially of a full-bleed camera photo with almost zero digital text
            if len(images) >= 1 and len(text) < 60:
                scanned_bitmap_pages += 1

        doc.close()

        avg_chars = total_chars / max(sample_pages, 1)

        # Scanned handwritten photos: mostly full-page images and very low/zero selectable text
        if scanned_bitmap_pages >= (sample_pages / 2) or (avg_chars < 80 and not has_vector_fonts):
            logger.info(f"[Auto-Detector] Detected HANDWRITTEN_NOTES (avg_chars={avg_chars:.1f}, scans={scanned_bitmap_pages}/{sample_pages})")
            return "HANDWRITTEN_NOTES"

        logger.info(f"[Auto-Detector] Detected printed TEXTBOOK (avg_chars={avg_chars:.1f}, vector_fonts={has_vector_fonts})")
        return "TEXTBOOK"
    except Exception as detect_err:
        logger.warning(f"[Auto-Detector] Probe encountered error: {detect_err}. Defaulting to TEXTBOOK.")
        return "TEXTBOOK"


def send_progress(
    callback_url: str,
    job_id: int,
    processed_pages: int,
    total_pages: int,
    stage: str,
    secret: str = "",
) -> None:
    """
    Sends non-blocking progress updates to the Django backend.
    Catches any network hiccups so extraction is never aborted due to a progress ping.
    """
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Ingestion-Secret"] = secret

    payload = {
        "job_id": job_id,
        "status": "PROGRESS",
        "processed_pages": processed_pages,
        "total_pages": total_pages,
        "current_stage": stage,
    }
    pct = int((processed_pages / total_pages * 100) if total_pages else 0)
    logger.info(f"[Progress] {processed_pages}/{total_pages} ({pct}%) - {stage}")
    try:
        requests.post(callback_url, json=payload, headers=headers, timeout=5)
    except Exception as p_err:
        logger.debug(f"[Progress] Heartbeat delivery notice: {p_err}")


def send_webhook(callback_url: str, payload: dict, secret: str = "", max_retries: int = 5) -> None:
    """
    Posts the extraction result back to the Django backend with automatic retry
    if the backend returns 502/503/504 or encounters temporary connection drops.
    """
    payload_kb = len(json.dumps(payload, default=str)) // 1024
    logger.info(f"Delivering extraction results to Webhook: {callback_url} (Payload size: ~{payload_kb} KB)")
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Ingestion-Secret"] = secret

    for attempt in range(1, max_retries + 1):
        try:
            res = requests.post(callback_url, json=payload, headers=headers, timeout=60)
            logger.info(f"Webhook attempt #{attempt} status code: {res.status_code}")
            if res.status_code in (502, 503, 504) and attempt < max_retries:
                logger.warning(
                    f"Backend returned HTTP {res.status_code} (likely restarting or deploying). "
                    f"Waiting 10s before retry #{attempt + 1}..."
                )
                time.sleep(10)
                continue
            if res.status_code >= 400:
                logger.error(f"Webhook error response: {res.text}")
                res.raise_for_status()
            return
        except requests.exceptions.RequestException as exc:
            if attempt < max_retries:
                logger.warning(f"Webhook connection attempt #{attempt} failed: {exc}. Retrying in 10s...")
                time.sleep(10)
            else:
                logger.error(f"All {max_retries} webhook delivery attempts failed.")
                raise


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

        import pymupdf as fitz
        try:
            preview_doc = fitz.open(local_pdf)
            detected_total_pages = len(preview_doc)
            preview_doc.close()
        except Exception:
            detected_total_pages = 0

        send_progress(
            args.callback_url,
            args.job_id,
            0,
            detected_total_pages,
            f"PDF downloaded ({detected_total_pages} pages). Initializing AI extractor...",
            secret=args.webhook_secret,
        )

        # 2. Select appropriate extraction pipeline with throttled progress reporting
        last_progress_time = [0.0]

        def on_pipeline_progress(processed: int, total: int, stage_text: str):
            now = time.time()
            if processed == 0 or processed == total or (now - last_progress_time[0]) >= 1.5:
                last_progress_time[0] = now
                send_progress(
                    args.callback_url,
                    args.job_id,
                    processed,
                    total,
                    stage_text,
                    secret=args.webhook_secret,
                )

        # Pre-Flight Auto-Inspection (5ms): determines if printed textbook or handwritten notes
        if args.document_kind in ("AUTO", "TEXTBOOK", ""):
            effective_kind = auto_detect_document_kind(local_pdf)
        else:
            effective_kind = args.document_kind

        logger.info(f"Pipeline route: {effective_kind} (user selection: {args.document_kind})")

        engine_name = "Rule-Based Pipeline"
        if effective_kind == "HANDWRITTEN_NOTES":
            logger.info("Initializing EasyOCR Deep Learning Handwriting Pipeline...")
            pipeline = HandwritingPipeline(media_dir=os.path.join(temp_dir, "assets"))
            chapters, pages, granularity = pipeline.process_pdf(local_pdf, progress_callback=on_pipeline_progress)
            engine_name = "EasyOCR AI (Handwriting)"
        else:
            use_docling = os.environ.get("USE_DOCLING", "1") == "1"
            extracted_successfully = False
            if use_docling:
                try:
                    logger.info("Initializing IBM Docling AI Pipeline (DocLayNet Layout + Tables)...")
                    docling_pipeline = DoclingPipeline(media_dir=os.path.join(temp_dir, "assets"))
                    chapters, pages, granularity = docling_pipeline.process_pdf(local_pdf, progress_callback=on_pipeline_progress)
                    extracted_successfully = True
                    engine_name = "Docling AI (DocLayNet)"
                    logger.info("[SUCCESS] IBM Docling AI successfully extracted structured document!")
                except Exception as docling_err:
                    logger.warning(f"Docling AI encountered an issue: {docling_err}. Falling back to TextbookPipeline...")

            if not extracted_successfully:
                logger.info("Initializing Textbook & Pedagogical Pipeline (Enhanced Fallback)...")
                pipeline = TextbookPipeline(media_dir=os.path.join(temp_dir, "assets"))
                chapters, pages, granularity = pipeline.process_pdf(local_pdf, progress_callback=on_pipeline_progress)
                engine_name = "Rule-Based Engine"

        logger.info(
            f"Extraction complete! Found {len(chapters)} chapters and {len(pages)} pages. "
            f"Granularity: {granularity}"
        )

        # 3. Direct Google Drive Diagram Uploading from 16GB runner
        drive_uploader = WorkerGoogleDriveUploader()
        is_drive_active = drive_uploader.is_configured()
        logger.info(f"Worker Google Drive Uploader active: {is_drive_active}")

        diagram_targets = []
        for p in pages:
            for s_idx, sec in enumerate(p.sections):
                raw_b64 = getattr(sec, "image_data", "")
                img_p = getattr(sec, "image_path", "")
                if (raw_b64 and raw_b64.startswith("data:image/")) or (img_p and os.path.exists(img_p)):
                    diagram_targets.append((p, s_idx, sec))

        total_diagrams = len(diagram_targets)
        if total_diagrams > 0 and is_drive_active:
            send_progress(
                args.callback_url,
                args.job_id,
                len(pages),
                len(pages),
                f"Pages structured. Uploading {total_diagrams} diagrams to Google Drive...",
                secret=args.webhook_secret,
            )

        uploaded_diagram_count = 0
        last_diagram_progress = time.time()
        for p, s_idx, sec in diagram_targets:
            raw_b64 = getattr(sec, "image_data", "")
            img_p = getattr(sec, "image_path", "")
            raw_bytes = b""
            ext = "png"
            mime = "image/png"

            if raw_b64 and raw_b64.startswith("data:image/"):
                header, encoded = raw_b64.split(",", 1)
                if "jpeg" in header or "jpg" in header:
                    ext = "jpg"
                    mime = "image/jpeg"
                raw_bytes = base64.b64decode(encoded)
            elif img_p and os.path.exists(img_p):
                ext = img_p.split(".")[-1].lower()
                mime = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"
                try:
                    with open(img_p, "rb") as imf:
                        raw_bytes = imf.read()
                except Exception as read_err:
                    logger.warning(f"Could not read image file {img_p}: {read_err}")

            if is_drive_active and raw_bytes:
                try:
                    filename = f"job_{args.job_id}_p{p.page_number}_fig_{s_idx + 1}.{ext}"
                    direct_url = drive_uploader.upload_bytes(
                        raw_bytes,
                        destination_name=filename,
                        mime_type=mime,
                        subfolder_name="Extracted-Diagrams",
                    )
                    if direct_url:
                        sec.image_path = direct_url
                        uploaded_diagram_count += 1
                except Exception as up_err:
                    logger.warning(f"Could not upload diagram to Drive: {up_err}")

            # Strip heavy raw image_data so webhook payload stays tiny (<50KB)
            sec.image_data = ""

            now = time.time()
            if (now - last_diagram_progress) >= 2.0 or uploaded_diagram_count == total_diagrams:
                last_diagram_progress = now
                send_progress(
                    args.callback_url,
                    args.job_id,
                    len(pages),
                    len(pages),
                    f"Uploaded {uploaded_diagram_count} of {total_diagrams} diagrams to Google Drive...",
                    secret=args.webhook_secret,
                )

        logger.info(f"Direct Drive upload complete: {uploaded_diagram_count} diagrams saved to Google Drive.")

        # 4. Assemble lightweight JSON Payload matching Django IngestionJobWebhookView
        payload = {
            "job_id": args.job_id,
            "status": "COMPLETED",
            "granularity": granularity,
            "chapters": [ch.model_dump() for ch in chapters],
            "pages": [p.model_dump() for p in pages],
            "total_pages": len(pages),
            "engine": engine_name,
        }

        send_progress(
            args.callback_url,
            args.job_id,
            len(pages),
            len(pages),
            f"Delivering structured dataset ({len(pages)} pages, {uploaded_diagram_count} diagrams) to backend...",
            secret=args.webhook_secret,
        )

        # 5. Dispatch back to Django Webhook with auto-retry
        send_webhook(args.callback_url, payload, secret=args.webhook_secret)
        logger.info(f"[SUCCESS] IngestionJob #{args.job_id} successfully extracted and delivered!")

    except Exception as exc:
        logger.error(f"[ERROR] Failed during extraction of Job #{args.job_id}: {exc}", exc_info=True)
        # Notify Django backend of failure with retry so UI updates immediately
        try:
            error_payload = {
                "job_id": args.job_id,
                "status": "FAILED",
                "error_message": f"Worker extraction error: {str(exc)}",
                "error": str(exc),
            }
            send_webhook(args.callback_url, error_payload, secret=args.webhook_secret, max_retries=3)
        except Exception as notify_err:
            logger.error(f"Could not send error notification to webhook: {notify_err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
