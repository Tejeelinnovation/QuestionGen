"""
FastAPI Entrypoint for Document AI Microservice.

Provides REST APIs for:
- Automatic textbook and chapter extraction (LaTeX math, columns, diagrams, TOC).
- Handwritten student/teacher notes transcription.
- Health monitoring and webhook callbacks.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import urllib.request
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
import requests

from engine.handwriting_pipeline import HandwritingPipeline
from engine.schema import ExtractionRequest, ExtractionResponse
from engine.textbook_pipeline import TextbookPipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("document-ai-worker")

app = FastAPI(
    title="Document AI Worker Microservice",
    description="Standalone, high-memory service for educational textbook & handwritten notes extraction.",
    version="1.0.0",
)

# CORS for local and web communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

textbook_pipeline = TextbookPipeline()
handwriting_pipeline = HandwritingPipeline()


@app.get("/")
def root():
    return {
        "service": "Document AI Worker Microservice",
        "status": "online",
        "engine": "Docling + DocLayNet + EasyOCR",
        "version": "1.0.0",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


def _send_webhook_callback(callback_url: str, payload: dict):
    """
    Sends extraction result back to Django via webhook.
    """
    try:
        logger.info(f"Dispatching webhook callback to: {callback_url}")
        res = requests.post(callback_url, json=payload, timeout=60)
        logger.info(f"Webhook delivered: Status {res.status_code}")
    except Exception as err:
        logger.error(f"Failed to deliver webhook callback to {callback_url}: {err}")


@app.post("/extract", response_model=ExtractionResponse)
async def extract_document(
    request: ExtractionRequest,
    background_tasks: BackgroundTasks,
):
    """
    Extracts a document from a remote PDF URL (e.g. Google Drive or S3).
    """
    if not request.pdf_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pdf_url is required when using JSON request.",
        )

    # 1. Download PDF to temporary file
    temp_dir = tempfile.mkdtemp(prefix="doc_ai_")
    local_pdf_path = os.path.join(temp_dir, f"job_{request.job_id}.pdf")

    try:
        logger.info(f"Downloading PDF for Job #{request.job_id} from: {request.pdf_url}")
        # Support Google Drive and standard HTTP downloads
        if "drive.google.com" in request.pdf_url and "id=" in request.pdf_url:
            file_id = request.pdf_url.split("id=")[1].split("&")[0]
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
        else:
            download_url = request.pdf_url

        urllib.request.urlretrieve(download_url, local_pdf_path)

        # 2. Select pipeline based on document kind
        if request.document_kind == "HANDWRITTEN_NOTES":
            logger.info(f"Routing Job #{request.job_id} to HandwritingPipeline.")
            chapters, pages, granularity = handwriting_pipeline.process_pdf(
                local_pdf_path, max_pages=request.max_pages
            )
        else:
            logger.info(f"Routing Job #{request.job_id} to TextbookPipeline.")
            chapters, pages, granularity = textbook_pipeline.process_pdf(
                local_pdf_path, max_pages=request.max_pages
            )

        response_payload = ExtractionResponse(
            job_id=request.job_id,
            status="COMPLETED",
            total_pages=len(pages),
            processed_pages=len(pages),
            granularity=granularity,
            table_of_contents=chapters,
            pages=pages,
        )

        # 3. If callback_url provided, trigger asynchronous webhook to Django
        if request.callback_url:
            background_tasks.add_task(
                _send_webhook_callback,
                request.callback_url,
                response_payload.model_dump(),
            )

        return response_payload

    except Exception as e:
        logger.error(f"Error processing Job #{request.job_id}: {e}", exc_info=True)
        error_payload = ExtractionResponse(
            job_id=request.job_id,
            status="FAILED",
            total_pages=0,
            processed_pages=0,
            error_message=str(e),
        )
        if request.callback_url:
            background_tasks.add_task(
                _send_webhook_callback,
                request.callback_url,
                error_payload.model_dump(),
            )
        return error_payload

    finally:
        # Clean up temporary directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/extract-upload", response_model=ExtractionResponse)
async def extract_uploaded_file(
    file: UploadFile = File(...),
    job_id: int = Form(...),
    document_kind: str = Form("TEXTBOOK"),
    max_pages: Optional[int] = Form(None),
):
    """
    Direct multipart file upload extraction.
    """
    temp_dir = tempfile.mkdtemp(prefix="doc_ai_upload_")
    local_pdf_path = os.path.join(temp_dir, file.filename or "upload.pdf")

    try:
        with open(local_pdf_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        if document_kind == "HANDWRITTEN_NOTES":
            chapters, pages, granularity = handwriting_pipeline.process_pdf(
                local_pdf_path, max_pages=max_pages
            )
        else:
            chapters, pages, granularity = textbook_pipeline.process_pdf(
                local_pdf_path, max_pages=max_pages
            )

        return ExtractionResponse(
            job_id=job_id,
            status="COMPLETED",
            total_pages=len(pages),
            processed_pages=len(pages),
            granularity=granularity,
            table_of_contents=chapters,
            pages=pages,
        )

    except Exception as e:
        logger.error(f"Error extracting upload for Job #{job_id}: {e}", exc_info=True)
        return ExtractionResponse(
            job_id=job_id,
            status="FAILED",
            total_pages=0,
            processed_pages=0,
            error_message=str(e),
        )

    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
