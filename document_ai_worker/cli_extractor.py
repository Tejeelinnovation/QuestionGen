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
import hashlib
import hmac
import json
import logging
import os
import shutil
import sys
import tempfile
import time
import urllib.request
import uuid
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
try:
    from engine.document_classifier import classify_document, DocumentClassificationResult
except ImportError:
    from document_ai_worker.engine.document_classifier import classify_document, DocumentClassificationResult


def auto_detect_document_kind(
    pdf_path: str,
    user_document_kind: str = "AUTO",
    doc_title: str = "",
) -> DocumentClassificationResult:
    """
    Inspects PDF structure using evidence-based document classifier.
    Returns DocumentClassificationResult with kind, confidence, evidence.
    On error or failure, returns 'UNKNOWN' with low confidence (never TEXTBOOK).
    """
    try:
        return classify_document(pdf_path, user_document_kind=user_document_kind, doc_title=doc_title)
    except Exception as detect_err:
        logger.warning(f"[Auto-Detector] Probe encountered error: {detect_err}. Returning UNKNOWN with low confidence.")
        return DocumentClassificationResult(
            kind="UNKNOWN",
            confidence=0.10,
            evidence=f"Probe error: {detect_err}",
        )


def retry_page_with_gemini(
    local_pdf: str,
    page_num: int,
    gemini_api_key: str,
    timeout: int = 45,
    max_retries: int = 2,
    retry_delay: float = 1.0,
) -> Optional[str]:
    """
    Renders a low-quality page to a high-DPI image and calls Gemini Vision
    to perform optical transcription and text cleaning.
    """
    if not gemini_api_key:
        return None

    import base64
    import time
    import pymupdf as fitz
    import requests

    try:
        doc = fitz.open(local_pdf)
        if page_num < 1 or page_num > len(doc):
            doc.close()
            return None
        page = doc[page_num - 1]
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        doc.close()
    except Exception as render_err:
        logger.warning(f"[Gemini Quality Gate] Page render error on page {page_num}: {render_err}")
        return None

    b64_str = base64.b64encode(img_bytes).decode("utf-8")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    prompt = (
        "Transcribe all text, formulas, headings, tables, and notes from this page accurately in natural reading order. "
        "Output clear, clean text without optical character artifacts or corrupted tokens. "
        "Preserve formatting and line hierarchy."
    )
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": b64_str,
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
        },
    }

    for attempt in range(max_retries):
        try:
            res = requests.post(url, json=payload, timeout=timeout)
            if res.status_code == 200:
                try:
                    data = res.json()
                except Exception:
                    logger.warning(f"[Gemini Quality Gate] Malformed JSON response for page {page_num}")
                    return None
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and parts[0].get("text"):
                        return parts[0].get("text", "").strip()
                logger.warning(f"[Gemini Quality Gate] Bad/empty candidates in response for page {page_num}")
                return None
            elif res.status_code == 429:
                logger.warning(
                    f"[Gemini Quality Gate] Rate limit 429 for page {page_num} "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                if attempt < max_retries - 1:
                    time.sleep(retry_delay * (2 ** attempt))
                    continue
                return None
            else:
                logger.warning(
                    f"[Gemini Quality Gate] API returned HTTP {res.status_code} for page {page_num}: {res.text[:120]}"
                )
                return None
        except requests.exceptions.Timeout:
            logger.warning(
                f"[Gemini Quality Gate] Timeout for page {page_num} "
                f"(attempt {attempt + 1}/{max_retries})"
            )
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            return None
        except Exception as gemini_err:
            logger.warning(f"[Gemini Quality Gate] Request error on page {page_num}: {gemini_err}")
            return None

    return None


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
    Signs payload with HMAC-SHA256 if secret is provided.
    """
    payload = {
        "job_id": job_id,
        "status": "PROGRESS",
        "processed_pages": processed_pages,
        "total_pages": total_pages,
        "current_stage": stage,
    }
    raw_bytes = json.dumps(payload, default=str).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if secret:
        ts_str = str(int(time.time()))
        to_sign = f"{ts_str}.".encode("utf-8") + raw_bytes
        sig = hmac.new(secret.encode("utf-8"), to_sign, hashlib.sha256).hexdigest()
        headers["X-Ingestion-Timestamp"] = ts_str
        headers["X-Ingestion-Signature"] = f"sha256={sig}"

    pct = int((processed_pages / total_pages * 100) if total_pages else 0)
    logger.info(f"[Progress] {processed_pages}/{total_pages} ({pct}%) - {stage}")
    try:
        requests.post(callback_url, data=raw_bytes, headers=headers, timeout=5)
    except Exception as p_err:
        logger.debug(f"[Progress] Heartbeat delivery notice: {p_err}")


def send_webhook(
    callback_url: str,
    payload: dict,
    secret: str = "",
    max_retries: int = 5,
    idempotency_key: str = "",
) -> None:
    """
    Posts the extraction result back to the Django backend with automatic retry
    if the backend returns 502/503/504 or encounters temporary connection drops.
    Signs payload with HMAC-SHA256 bound to timestamp (X-Ingestion-Signature, X-Ingestion-Timestamp).
    """
    raw_bytes = json.dumps(payload, default=str).encode("utf-8")
    payload_kb = len(raw_bytes) // 1024
    logger.info(f"Delivering extraction results to Webhook: {callback_url} (Payload size: ~{payload_kb} KB)")
    headers = {"Content-Type": "application/json"}
    if idempotency_key:
        headers["X-Idempotency-Key"] = idempotency_key
    if secret:
        ts_str = str(int(time.time()))
        to_sign = f"{ts_str}.".encode("utf-8") + raw_bytes
        sig = hmac.new(secret.encode("utf-8"), to_sign, hashlib.sha256).hexdigest()
        headers["X-Ingestion-Timestamp"] = ts_str
        headers["X-Ingestion-Signature"] = f"sha256={sig}"

    for attempt in range(1, max_retries + 1):
        try:
            res = requests.post(callback_url, data=raw_bytes, headers=headers, timeout=60)
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
    parser.add_argument("--document-kind", type=str, default="AUTO", help="AUTO, TEXTBOOK, NEWSPAPER, etc.")
    parser.add_argument("--title", type=str, default="", help="Optional document title")
    parser.add_argument("--webhook-secret", type=str, default="", help="Optional webhook verification secret")
    parser.add_argument("--gemini-api-key", type=str, default="", help="Optional Google Gemini API Key for fast vision handwriting")
    parser.add_argument("--idempotency-key", type=str, default="", help="Optional unique idempotency key for this run")

    args = parser.parse_args()
    idempotency_key = args.idempotency_key or f"job_{args.job_id}_{uuid.uuid4().hex[:16]}"
    logger.info(f"Execution idempotency key: {idempotency_key}")

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

        # Document Classification using multi-modal evidence
        classification_res = auto_detect_document_kind(
            local_pdf,
            user_document_kind=args.document_kind,
            doc_title=args.title,
        )
        effective_kind = classification_res.kind
        logger.info(
            f"Pipeline route: {effective_kind} (confidence={classification_res.confidence}, "
            f"user_document_kind='{args.document_kind}', evidence={classification_res.evidence})"
        )

        engine_name = "Rule-Based Pipeline"
        if effective_kind == "HANDWRITTEN_NOTES":
            gemini_key = args.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
            pipeline_label = "Gemini 2.0 Flash Vision AI" if gemini_key else "Tesseract/EasyOCR AI"
            logger.info(f"Initializing Handwriting Pipeline ({pipeline_label})...")
            pipeline = HandwritingPipeline(media_dir=os.path.join(temp_dir, "assets"), gemini_api_key=gemini_key)
            chapters, pages, granularity = pipeline.process_pdf(local_pdf, progress_callback=on_pipeline_progress)
            engine_name = "Gemini Flash AI (Handwriting)" if gemini_key else "Tesseract/EasyOCR (Handwriting)"
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
                chapters, pages, granularity = pipeline.process_pdf(
                    local_pdf,
                    progress_callback=on_pipeline_progress,
                    document_kind=args.document_kind,
                )
                engine_name = "Rule-Based Engine"

        logger.info(
            f"Extraction complete! Found {len(chapters)} chapters and {len(pages)} pages. "
            f"Granularity: {granularity}"
        )

        # 2b. Quality Gate & Single-Page Retry
        gemini_key = args.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        call_cap = int(os.environ.get("GEMINI_CALL_CAP", "20"))
        gemini_calls_made = 0

        for p in pages:
            if p.page_kind in ("image_only", "blank"):
                continue

            # Quality threshold: quality_score < 0.70 or explicit review flag
            if p.quality_score < 0.70 or p.needs_review:
                if gemini_key and gemini_calls_made < call_cap:
                    logger.info(
                        f"[Quality Gate] Page {p.page_number} scored {p.quality_score:.2f} (needs_review={p.needs_review}). "
                        f"Retrying with Gemini Vision (call {gemini_calls_made + 1}/{call_cap})..."
                    )
                    transcribed = retry_page_with_gemini(local_pdf, p.page_number, gemini_key)
                    gemini_calls_made += 1
                    if transcribed:
                        try:
                            from engine.text_cleaner import clean_page_text
                        except ImportError:
                            from document_ai_worker.engine.text_cleaner import clean_page_text
                        clean_res = clean_page_text(transcribed)
                        p.raw_text = clean_res.text
                        p.quality_score = clean_res.quality_score
                        p.quality_flags.append("retried_with_gemini")
                        p.quality_flags.extend(clean_res.flags)
                        if p.quality_score >= 0.70:
                            p.needs_review = False
                            p.route_reason = f"{p.route_reason}; Transcribed and verified via Gemini Vision"
                            logger.info(f"[Quality Gate] Page {p.page_number} successfully recovered (score={p.quality_score:.2f})")
                        else:
                            p.needs_review = True
                            p.quality_flags.append("low_quality_post_retry")
                    else:
                        p.needs_review = True
                        p.quality_flags.append("gemini_retry_failed")
                else:
                    p.needs_review = True
                    if gemini_calls_made >= call_cap:
                        p.quality_flags.append("gemini_call_cap_exhausted")
                        logger.info(f"[Quality Gate] Page {p.page_number} capped (GEMINI_CALL_CAP={call_cap} reached). Set needs_review=True.")
                    elif not gemini_key:
                        p.quality_flags.append("needs_review_no_gemini_key")

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
            "schema_version": "1.1.0",
            "job_id": args.job_id,
            "idempotency_key": idempotency_key,
            "status": "COMPLETED",
            "document_kind": effective_kind,
            "classification_confidence": classification_res.confidence,
            "classification_evidence": classification_res.evidence,
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
        send_webhook(
            args.callback_url,
            payload,
            secret=args.webhook_secret,
            idempotency_key=idempotency_key,
        )
        logger.info(f"[SUCCESS] IngestionJob #{args.job_id} successfully extracted and delivered!")

    except Exception as exc:
        logger.error(f"[ERROR] Failed during extraction of Job #{args.job_id}: {exc}", exc_info=True)
        # Notify Django backend of failure with retry so UI updates immediately
        try:
            error_payload = {
                "job_id": args.job_id,
                "idempotency_key": idempotency_key if "idempotency_key" in locals() else "",
                "status": "FAILED",
                "error_message": f"Worker extraction error: {str(exc)}",
                "error": str(exc),
            }
            send_webhook(
                args.callback_url,
                error_payload,
                secret=args.webhook_secret,
                max_retries=3,
                idempotency_key=idempotency_key if "idempotency_key" in locals() else "",
            )
        except Exception as notify_err:
            logger.error(f"Could not send error notification to webhook: {notify_err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
