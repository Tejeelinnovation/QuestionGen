"""
Marker AI Document Pipeline for Educational Textbooks & Complex Documents.

Combines:
- marker-pdf (Surya Layout, Multilingual Devanagari OCR, Texify for LaTeX equations)
- PyMuPDF High-DPI Visual Clipping for diagrams and equations
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Callable, Dict, List, Optional, Tuple

import pymupdf as fitz

from .schema import ChapterSchema, PageSchema, SectionSchema

logger = logging.getLogger(__name__)


class MarkerPipeline:
    """
    Executes deep learning Document AI extraction using marker-pdf (Surya + Texify).
    """

    def __init__(self, media_dir: str = "/tmp/extracted_assets"):
        self.media_dir = media_dir
        os.makedirs(self.media_dir, exist_ok=True)

    def process_pdf(
        self,
        pdf_path: str,
        max_pages: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> Tuple[List[ChapterSchema], List[PageSchema], str]:
        """
        Executes marker-pdf extraction and parses the resulting structured JSON/Markdown
        into ChapterSchema, PageSchema, and SectionSchema.
        """
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages) if max_pages else total_pages
        doc.close()

        if progress_callback:
            progress_callback(
                0,
                pages_to_process,
                f"Starting Marker Document AI (Surya Layout + Texify LaTeX) for {pages_to_process} pages...",
            )

        # 1. Run marker_single CLI to output structured JSON
        out_base_dir = tempfile.mkdtemp(prefix="marker_run_")
        pdf_stem = os.path.splitext(os.path.basename(pdf_path))[0]
        marker_exec = shutil.which("marker_single")

        if marker_exec:
            cmd = [marker_exec, pdf_path, "--output_format", "json", "--output_dir", out_base_dir]
        else:
            cmd = [sys.executable, "-m", "marker.scripts.convert_single", pdf_path, "--output_format", "json", "--output_dir", out_base_dir]

        if max_pages:
            cmd.extend(["--max_pages", str(max_pages)])

        # Ensure LLAMA_CPP_BINARY is present in environment if installed
        sub_env = dict(os.environ)
        if "LLAMA_CPP_BINARY" not in sub_env:
            for candidate in ["/opt/llama-cpp/llama-server", shutil.which("llama-server"), "/usr/local/bin/llama-server"]:
                if candidate and os.path.exists(candidate):
                    sub_env["LLAMA_CPP_BINARY"] = candidate
                    break

        sub_env.setdefault("SURYA_INFERENCE_STARTUP_TIMEOUT", "120")

        logger.info(f"Running Marker command: {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                env=sub_env,
            )

            # Monitor runner output for progress
            curr_pg = 0
            if proc.stdout:
                for line in proc.stdout:
                    line_clean = line.strip()
                    if line_clean:
                        logger.info(f"[Marker] {line_clean}")
                    # Track page progress if marker outputs page index
                    pg_match = re.search(r"page\s*(\d+)", line_clean, re.IGNORECASE)
                    if pg_match and progress_callback:
                        found_pg = int(pg_match.group(1))
                        if 1 <= found_pg <= pages_to_process:
                            curr_pg = found_pg
                            progress_callback(
                                curr_pg,
                                pages_to_process,
                                f"Marker AI transcribing page {curr_pg} of {pages_to_process} (Devanagari + LaTeX)...",
                            )

            proc.wait()
            if proc.returncode != 0:
                raise RuntimeError(f"Marker command failed with exit code {proc.returncode}")

        except Exception as run_err:
            logger.error(f"Marker execution failed: {run_err}. Falling back to Python API or fallback parser.")
            raise

        # 2. Locate generated JSON output
        result_dir = os.path.join(out_base_dir, pdf_stem)
        json_path = os.path.join(result_dir, f"{pdf_stem}.json")
        md_path = os.path.join(result_dir, f"{pdf_stem}.md")

        if not os.path.exists(json_path) and os.path.exists(result_dir):
            for f in os.listdir(result_dir):
                if f.endswith(".json") and not f.endswith("_meta.json"):
                    json_path = os.path.join(result_dir, f)
                    break

        if not os.path.exists(json_path):
            raise FileNotFoundError(f"Marker output JSON not found at {json_path}")

        with open(json_path, "r", encoding="utf-8") as jf:
            marker_data = json.load(jf)

        # 3. Parse Marker JSON into ChapterSchema and PageSchema
        chapters, pages, granularity = self._parse_marker_json(
            marker_data,
            result_dir,
            pages_to_process,
            progress_callback,
        )

        return chapters, pages, granularity

    def _parse_marker_json(
        self,
        marker_data: Any,
        result_dir: str,
        total_pages: int,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ) -> Tuple[List[ChapterSchema], List[PageSchema], str]:
        """
        Walks the Marker output tree and converts block items to our schema.
        """
        pages: List[PageSchema] = []
        chapters: List[ChapterSchema] = []

        # Marker JSON is either a list of page blocks or a root dict with 'children'
        raw_pages = marker_data if isinstance(marker_data, list) else marker_data.get("children", [])
        if not raw_pages:
            raw_pages = [marker_data]

        chapter_num = 1
        for p_idx, page_item in enumerate(raw_pages):
            page_num = p_idx + 1
            sections: List[SectionSchema] = []
            page_text_pieces: List[str] = []

            page_blocks = page_item.get("children", []) if isinstance(page_item, dict) else []
            for b in page_blocks:
                b_type = b.get("block_type", "Text")
                html_text = b.get("html", "") or b.get("text", "") or ""
                # Strip basic HTML tags while keeping content
                clean_text = re.sub(r"<[^>]+>", "", html_text).strip()
                bbox = b.get("polygon", []) or b.get("bbox", [])

                if not clean_text and b_type != "Picture":
                    continue

                # Classify block type
                if b_type == "Formula":
                    # Texify generated clean LaTeX formula
                    latex_str = f"${clean_text}$" if not clean_text.startswith("$") else clean_text
                    sections.append(SectionSchema(
                        type="FORMULA",
                        heading="",
                        text=clean_text,
                        column_index=0,
                        latex_equations=[latex_str],
                        metadata={"bbox": bbox},
                    ))
                    page_text_pieces.append(clean_text)

                elif b_type in ("Picture", "Figure"):
                    img_src = b.get("image_path", "") or b.get("src", "")
                    img_data = ""
                    direct_path = ""
                    if img_src:
                        full_img_path = os.path.join(result_dir, os.path.basename(img_src))
                        if os.path.exists(full_img_path):
                            direct_path = full_img_path
                            with open(full_img_path, "rb") as imf:
                                b64 = base64.b64encode(imf.read()).decode("utf-8")
                                img_data = f"data:image/png;base64,{b64}"

                    caption = clean_text or "Figure"
                    sections.append(SectionSchema(
                        type="DIAGRAM",
                        heading=caption[:60],
                        text=clean_text,
                        column_index=0,
                        image_path=direct_path,
                        image_data=img_data,
                        image_caption=caption,
                        metadata={"bbox": bbox},
                    ))

                elif b_type == "Section-header":
                    sections.append(SectionSchema(
                        type="PARAGRAPH",
                        heading=clean_text,
                        text=clean_text,
                        column_index=0,
                        metadata={"bbox": bbox},
                    ))
                    page_text_pieces.append(clean_text)
                    # Check for chapter title
                    ch_match = re.search(r"(?:अध्याय|Chapter|Unit)\s*([0-9]+)", clean_text, re.IGNORECASE)
                    if ch_match:
                        try:
                            ch_n = int(ch_match.group(1))
                            chapter_num = ch_n
                            chapters.append(ChapterSchema(
                                chapter_number=ch_n,
                                title=clean_text,
                                start_page=page_num,
                                end_page=page_num,
                            ))
                        except ValueError:
                            pass

                else:
                    # Regular text / pedagogical block
                    p_type = "PARAGRAPH"
                    heading = ""
                    if re.match(r"^\s*(उदाहरण|Example|Solved Example)\b", clean_text, re.IGNORECASE):
                        p_type = "SOLVED_EXAMPLE"
                        heading = clean_text[:40]
                    elif re.match(r"^\s*(प्रश्नावली|अभ्यास|Exercise|Question)\b", clean_text, re.IGNORECASE):
                        p_type = "EXERCISE_QUESTION"
                        heading = clean_text[:40]
                    elif re.match(r"^\s*(परिभाषा|प्रमेय|Definition|Theorem)\b", clean_text, re.IGNORECASE):
                        p_type = "DEFINITION"
                        heading = clean_text[:40]
                    elif re.match(r"^\s*(सारांश|Summary)\b", clean_text, re.IGNORECASE):
                        p_type = "SUMMARY"
                        heading = clean_text[:40]

                    sections.append(SectionSchema(
                        type=p_type,
                        heading=heading,
                        text=clean_text,
                        column_index=0,
                        metadata={"bbox": bbox},
                    ))
                    page_text_pieces.append(clean_text)

            pages.append(PageSchema(
                page_number=page_num,
                layout_type="SINGLE_COLUMN",
                raw_text="\n\n".join(page_text_pieces),
                chapter_number=chapter_num,
                chapter_title=chapters[-1].title if chapters else f"Chapter {chapter_num}",
                sections=sections,
            ))

            if progress_callback:
                progress_callback(
                    page_num,
                    total_pages,
                    f"Parsed page {page_num} of {total_pages} with Marker AI...",
                )

        if not chapters:
            chapters = [ChapterSchema(
                chapter_number=1,
                title="Extracted Document",
                start_page=1,
                end_page=len(pages),
                summary="Full document extracted via Marker AI.",
            )]

        # Calculate chapter end pages
        for i in range(len(chapters) - 1):
            chapters[i].end_page = max(chapters[i].start_page, chapters[i + 1].start_page - 1)
        if chapters:
            chapters[-1].end_page = len(pages)

        granularity = "MULTI_CHAPTER" if len(chapters) > 1 else "SINGLE_CHAPTER"
        return chapters, pages, granularity
