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
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

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

    # Maximum file size guard (100 MB)
    if size_mb > 100.0:
        raise ValueError(f"Downloaded file size ({size_mb:.2f} MB) exceeds maximum allowed limit of 100 MB.")

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
    file_hash: str = "doc",
) -> Optional[str]:
    """
    Renders low-quality page and calls unified GeminiClient to perform
    optical transcription with temperature 0, exponential backoff, and Neon/disk caching.
    """
    if not gemini_api_key:
        return None

    import pymupdf as fitz
    try:
        from engine.gemini_client import get_shared_gemini_client
    except ImportError:
        from document_ai_worker.engine.gemini_client import get_shared_gemini_client

    client = get_shared_gemini_client(api_key=gemini_api_key)
    if not client.is_configured:
        return None

    try:
        doc = fitz.open(local_pdf)
        if page_num < 1 or page_num > len(doc):
            doc.close()
            return None
        page = doc[page_num - 1]
        prompt = (
            "Transcribe all text, headings, tables, and notes from this page accurately in natural reading order. "
            "Convert all mathematical and scientific formulas (fractions, limits, powers, matrices, symbols) into precise LaTeX notation using $...$ for inline formulas or $$...$$ for standalone formulas. "
            "Output clear, clean text without optical character artifacts or corrupted tokens. "
            "Preserve formatting, Hindi Devanagari text, English text, and line hierarchy."
        )
        result = client.transcribe_page_image(
            page=page,
            prompt=prompt,
            page_num=page_num,
            file_hash=file_hash,
            dpi=200,
            timeout=timeout,
            max_attempts=max_retries,
            retry_delay=retry_delay,
        )
        doc.close()
        return result
    except Exception as render_err:
        logger.warning(f"[Gemini Quality Gate] Page render/transcription error on page {page_num}: {render_err}")
        return None


def send_progress(
    callback_url: str,
    job_id: int,
    processed_pages: int,
    total_pages: int,
    stage: str,
    secret: str = "",
    elapsed_seconds: Optional[float] = None,
) -> Optional[dict]:
    """
    Sends non-blocking progress updates to the Django backend.
    Catches any network hiccups so extraction is never aborted due to a progress ping.
    Signs payload with HMAC-SHA256 if secret is provided.
    Returns backend response dict if successful (including stored_pages for resumption).
    """
    payload = {
        "job_id": job_id,
        "status": "PROGRESS",
        "processed_pages": processed_pages,
        "total_pages": total_pages,
        "current_stage": stage,
    }
    if elapsed_seconds is not None:
        payload["elapsed_seconds"] = elapsed_seconds
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
        res = requests.post(callback_url, data=raw_bytes, headers=headers, timeout=10)
        if res.status_code == 200:
            return res.json()
    except Exception as p_err:
        logger.debug(f"[Progress] Heartbeat delivery notice: {p_err}")
    return None


def send_page_batch(
    callback_url: str,
    job_id: int,
    pages_batch: list,
    total_pages: int,
    secret: str = "",
    idempotency_key: str = "",
) -> list[int]:
    """
    Sends an intermediate batch of structured pages to the Django backend to
    checkpoint extraction progress. Returns the list of stored page numbers acknowledged.
    """
    payload = {
        "job_id": job_id,
        "status": "BATCH_PAGES",
        "idempotency_key": idempotency_key,
        "pages": [p.model_dump() if hasattr(p, "model_dump") else p for p in pages_batch],
        "total_pages": total_pages,
    }
    raw_bytes = json.dumps(payload, default=str).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if idempotency_key:
        headers["X-Idempotency-Key"] = idempotency_key
    if secret:
        ts_str = str(int(time.time()))
        to_sign = f"{ts_str}.".encode("utf-8") + raw_bytes
        sig = hmac.new(secret.encode("utf-8"), to_sign, hashlib.sha256).hexdigest()
        headers["X-Ingestion-Timestamp"] = ts_str
        headers["X-Ingestion-Signature"] = f"sha256={sig}"

    for attempt in range(1, 4):
        try:
            res = requests.post(callback_url, data=raw_bytes, headers=headers, timeout=30)
            if res.status_code == 200:
                data = res.json()
                logger.info(f"[Batch Checkpoint] Checkpointed {len(pages_batch)} pages with backend.")
                return data.get("stored_pages", [])
        except Exception as err:
            logger.warning(f"[Batch Checkpoint] Attempt {attempt} failed: {err}")
            time.sleep(2)
    return []


def send_webhook(
    callback_url: str,
    payload: dict,
    secret: str = "",
    max_retries: int = 8,
    idempotency_key: str = "",
    retries: Optional[int] = None,
) -> bool:
    """
    Posts the extraction result back to the Django backend with automatic retry.
    Tolerates Render free tier spin-up delays (~60 seconds) using progressive delays.
    Signs payload with HMAC-SHA256 bound to timestamp (X-Ingestion-Signature, X-Ingestion-Timestamp).
    """
    if retries is not None:
        max_retries = retries

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

    # Progressive retry delays: 5s, 10s, 15s, 20s, 25s, 30s, 30s, 30s (~165s max wait)
    delays = [5, 10, 15, 20, 25, 30, 30, 30]

    for attempt in range(1, max_retries + 1):
        try:
            res = requests.post(callback_url, data=raw_bytes, headers=headers, timeout=60)
            logger.info(f"Webhook attempt #{attempt} status code: {res.status_code}")
            if res.status_code in (502, 503, 504) and attempt < max_retries:
                wait_sec = delays[min(attempt - 1, len(delays) - 1)]
                logger.warning(
                    f"Backend returned HTTP {res.status_code} (Render free instance may be waking). "
                    f"Waiting {wait_sec}s before retry #{attempt + 1}..."
                )
                time.sleep(wait_sec)
                continue
            if res.status_code >= 400:
                logger.error(f"Webhook error response: {res.text}")
                res.raise_for_status()
            return True
        except requests.exceptions.RequestException as exc:
            if attempt < max_retries:
                wait_sec = delays[min(attempt - 1, len(delays) - 1)]
                logger.warning(f"Webhook connection attempt #{attempt} failed: {exc}. Retrying in {wait_sec}s...")
                time.sleep(wait_sec)
            else:
                logger.error(f"All {max_retries} webhook delivery attempts failed.")
                raise
    return False



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

        # Maximum page count guard (250 pages)
        if detected_total_pages > 250:
            raise ValueError(
                f"Document has {detected_total_pages} pages, which exceeds the limit of 250 pages. "
                "Please split large books into individual chapters for optimal processing."
            )

        # Gemini model verification at startup
        gemini_key = args.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        if gemini_key:
            try:
                from engine.gemini_client import get_shared_gemini_client
            except ImportError:
                from document_ai_worker.engine.gemini_client import get_shared_gemini_client
            g_client = get_shared_gemini_client(api_key=gemini_key)
            g_client.verify_at_startup()

        # Job runtime guard
        job_start_time = time.time()
        MAX_JOB_SECONDS = 1800  # 30 minutes timeout

        init_res = send_progress(
            args.callback_url,
            args.job_id,
            0,
            detected_total_pages,
            f"PDF downloaded ({detected_total_pages} pages). Initializing AI extractor...",
            secret=args.webhook_secret,
        )
        stored_pages = set((init_res or {}).get("stored_pages", []))
        if stored_pages:
            logger.info(f"[Resumption] Found {len(stored_pages)} previously stored pages in database.")

        # 2. Select appropriate extraction pipeline with throttled progress reporting
        last_progress_time = [0.0]

        def on_pipeline_progress(processed: int, total: int, stage_text: str):
            now = time.time()
            if processed == 0 or processed == total or (now - last_progress_time[0]) >= 1.5:
                last_progress_time[0] = now
                elapsed = round(now - job_start_time, 1)
                send_progress(
                    args.callback_url,
                    args.job_id,
                    processed,
                    total,
                    stage_text,
                    secret=args.webhook_secret,
                    elapsed_seconds=elapsed,
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

        # 2b. Parallel Quality Gate & Multi-Page AI Rescue
        gemini_key = args.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
        call_cap = int(os.environ.get("GEMINI_CALL_CAP", "20"))

        pages_to_rescue = [
            p for p in pages
            if p.page_kind not in ("image_only", "blank") and (
                p.quality_score < 0.70 or
                p.needs_review or
                not p.raw_text.strip() or
                "legacy_font_unresolved" in p.quality_flags
            )
        ][:call_cap]

        if pages_to_rescue and gemini_key:
            num_workers = min(5, len(pages_to_rescue))
            logger.info(
                f"[Quality Gate] Concurrently rescuing {len(pages_to_rescue)} pages with Gemini Vision "
                f"across {num_workers} parallel threads (pages: {[p.page_number for p in pages_to_rescue]})..."
            )
            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                future_to_page = {
                    executor.submit(retry_page_with_gemini, local_pdf, p.page_number, gemini_key): p
                    for p in pages_to_rescue
                }
                for future in as_completed(future_to_page):
                    p = future_to_page[future]
                    try:
                        transcribed = future.result()
                        if transcribed and transcribed.strip():
                            try:
                                from engine.text_cleaner import clean_page_text
                            except ImportError:
                                from document_ai_worker.engine.text_cleaner import clean_page_text
                            clean_res = clean_page_text(transcribed)
                            p.raw_text = clean_res.text
                            p.quality_score = max(0.85, clean_res.quality_score)
                            p.needs_review = False
                            p.quality_flags.append("retried_with_gemini")
                            p.quality_flags.extend(clean_res.flags)
                            p.route_reason = f"{p.route_reason}; Transcribed and verified via Gemini Vision"

                            # If sections are empty or lack text, rebuild sections from transcribed markdown
                            has_non_diagram_text = any(s.text.strip() for s in p.sections if s.type != "DIAGRAM")
                            if not has_non_diagram_text:
                                try:
                                    from engine.schema import SectionSchema
                                except ImportError:
                                    from document_ai_worker.engine.schema import SectionSchema

                                p_sections = [s for s in p.sections if s.type == "DIAGRAM"]
                                blocks = [b.strip() for b in transcribed.split("\n\n") if b.strip()]
                                for b in blocks:
                                    sec_type = "PARAGRAPH"
                                    if b.startswith("#") or (len(b) < 60 and not b.endswith(".")):
                                        sec_type = "PARAGRAPH"
                                    if "$" in b or "\\frac" in b or "\\lim" in b:
                                        sec_type = "FORMULA"
                                    p_sections.append(SectionSchema(
                                        type=sec_type,
                                        heading=b[:40] if sec_type != "PARAGRAPH" else "",
                                        text=b,
                                        column_index=0,
                                        latex_equations=[b] if sec_type == "FORMULA" else [],
                                    ))
                                p.sections = p_sections
                            else:
                                # Backfill any remaining empty or needs_review FORMULA sections from Gemini's transcribed equations
                                formula_indices = [
                                    idx for idx, s in enumerate(p.sections)
                                    if s.type == "FORMULA" and (not (s.text or "").strip() or s.metadata.get("needs_review"))
                                ]
                                if formula_indices:
                                    gemini_eqs = [
                                        b.strip() for b in transcribed.split("\n\n")
                                        if b.strip() and ("$" in b or "\\frac" in b or "\\lim" in b or "\\sum" in b)
                                    ]
                                    for i, f_idx in enumerate(formula_indices):
                                        if i < len(gemini_eqs):
                                            eq_val = gemini_eqs[i]
                                            p.sections[f_idx].text = eq_val
                                            p.sections[f_idx].latex_equations = [eq_val]
                                            if hasattr(p.sections[f_idx], "metadata") and isinstance(p.sections[f_idx].metadata, dict):
                                                p.sections[f_idx].metadata["needs_review"] = False

                            logger.info(f"[Quality Gate] Page {p.page_number} successfully recovered via Gemini Vision (score={p.quality_score:.2f})")
                        else:
                            p.needs_review = True
                            p.quality_flags.append("gemini_retry_failed")
                    except Exception as rescue_err:
                        p.needs_review = True
                        p.quality_flags.append("gemini_retry_error")
                        logger.warning(f"[Quality Gate] Gemini rescue failed for page {p.page_number}: {rescue_err}")
        elif pages_to_rescue and not gemini_key:
            for p in pages_to_rescue:
                p.needs_review = True
                p.quality_flags.append("needs_review_no_gemini_key")

        # 3. Direct Google Drive Diagram Uploading from 16GB runner (Parallel Multi-threaded)
        drive_uploader = WorkerGoogleDriveUploader()
        is_drive_active = drive_uploader.is_configured()
        logger.info(f"Worker Google Drive Uploader active: {is_drive_active}")

        diagram_items = []
        for p in pages:
            for s_idx, sec in enumerate(p.sections):
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
                    try:
                        raw_bytes = base64.b64decode(encoded)
                    except Exception:
                        pass
                elif img_p and os.path.exists(img_p):
                    ext = img_p.split(".")[-1].lower()
                    mime = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"
                    try:
                        with open(img_p, "rb") as imf:
                            raw_bytes = imf.read()
                    except Exception as read_err:
                        logger.warning(f"Could not read image file {img_p}: {read_err}")

                # Filter out micro decorative icons/bullets (< 400 bytes)
                if raw_bytes and len(raw_bytes) >= 400:
                    filename = f"job_{args.job_id}_p{p.page_number}_fig_{s_idx + 1}.{ext}"
                    diagram_items.append((sec, raw_bytes, filename, mime))

                # Strip heavy raw image_data so webhook payload stays tiny (<50KB)
                sec.image_data = ""

        total_diagrams = len(diagram_items)
        uploaded_diagram_count = 0

        if total_diagrams > 0 and is_drive_active:
            send_progress(
                args.callback_url,
                args.job_id,
                len(pages),
                len(pages),
                f"Pages structured. Uploading {total_diagrams} diagrams to Google Drive (12 parallel threads)...",
                secret=args.webhook_secret,
            )

            def _upload_single_diagram(item):
                target_sec, data, fname, mtype = item
                try:
                    url = drive_uploader.upload_bytes(
                        data,
                        destination_name=fname,
                        mime_type=mtype,
                        subfolder_name="Extracted-Diagrams",
                    )
                    if url:
                        target_sec.image_path = url
                        return True
                except Exception as up_err:
                    logger.warning(f"Could not upload diagram {fname} to Drive: {up_err}")
                return False

            max_workers = min(12, total_diagrams)
            last_diagram_progress = time.time()
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_item = {executor.submit(_upload_single_diagram, item): item for item in diagram_items}
                for future in as_completed(future_to_item):
                    if future.result():
                        uploaded_diagram_count += 1
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

            logger.info(f"Direct Drive upload complete: {uploaded_diagram_count}/{total_diagrams} diagrams saved to Google Drive.")
        elif total_diagrams > 0:
            logger.info(f"Drive not configured. Retaining local paths for {total_diagrams} diagrams.")

        # Checkpoint pages in batches to ensure progress is safely persisted
        if len(pages) > 10:
            batch_size = 15
            for i in range(0, len(pages), batch_size):
                batch_slice = pages[i : i + batch_size]
                send_page_batch(
                    args.callback_url,
                    args.job_id,
                    batch_slice,
                    len(pages),
                    secret=args.webhook_secret,
                    idempotency_key=f"{idempotency_key}_batch_{i // batch_size}",
                )
        duration_seconds = round(time.time() - job_start_time, 1)
        payload = {
            "schema_version": "1.1.0",
            "job_id": args.job_id,
            "idempotency_key": idempotency_key,
            "status": "COMPLETED",
            "duration_seconds": duration_seconds,
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
            elapsed_seconds=duration_seconds,
        )

        # 5. Dispatch back to Django Webhook with auto-retry
        send_webhook(
            args.callback_url,
            payload,
            secret=args.webhook_secret,
            idempotency_key=idempotency_key,
        )
        logger.info(f"[SUCCESS] IngestionJob #{args.job_id} successfully extracted and delivered in {duration_seconds}s!")

    except Exception as exc:
        logger.error(f"[ERROR] Failed during extraction of Job #{args.job_id}: {exc}", exc_info=True)
        # Notify Django backend of failure with retry so UI updates immediately
        try:
            failed_duration = round(time.time() - job_start_time, 1) if "job_start_time" in locals() else None
            error_payload = {
                "job_id": args.job_id,
                "idempotency_key": idempotency_key if "idempotency_key" in locals() else "",
                "status": "FAILED",
                "duration_seconds": failed_duration,
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
