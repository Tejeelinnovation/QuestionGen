"""
Semantic Document Chunker with Sliding-Window Overlap and LaTeX Protection.

Provides intelligent chunking for long academic textbooks, notes, and parsed items:
- Configurable sliding-window character/token overlap to preserve contextual continuity.
- LaTeX Formula Boundary Protection: Prevents formulas ($...$, $$...$$, \\[...\\], \\begin{...})
  from being split across chunk boundaries.
- Heading and structural awareness: Prefers breaks at markdown/section headings and paragraphs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple


@dataclass
class TextChunk:
    """
    A discrete chunk of extracted document text with contextual provenance.
    """
    text: str
    chunk_index: int
    total_chunks: int = 0
    char_start: int = 0
    char_end: int = 0
    heading: str = ""
    has_latex: bool = False
    latex_equations: List[str] = field(default_factory=list)
    overlap_chars: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_index": self.chunk_index,
            "total_chunks": self.total_chunks,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "heading": self.heading,
            "has_latex": self.has_latex,
            "latex_count": len(self.latex_equations),
            "overlap_chars": self.overlap_chars,
            "text": self.text,
            "metadata": self.metadata,
        }


class DocumentChunker:
    """
    Splits educational text into overlapping semantic chunks without severing
    mathematical formulas, chemical equations, or section headings.
    """

    # Matches LaTeX inline and display formulas
    LATEX_PATTERN = re.compile(
        r"(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}|\$[^\$\n]+?\$|\\\([^\)]+?\\\))",
        re.MULTILINE,
    )

    # Common structural headings in textbooks
    HEADING_PATTERN = re.compile(
        r"^(?:#{1,4}\s+|[A-Z0-9\.\s]{2,}:|\b(?:Chapter|Section|Activity|Example|Definition|Theorem|Summary|Exercise)\b[^\n]*)",
        re.MULTILINE | re.IGNORECASE,
    )

    def __init__(
        self,
        default_chunk_size: int = 1200,
        default_overlap: int = 200,
        min_chunk_size: int = 200,
    ):
        self.default_chunk_size = default_chunk_size
        self.default_overlap = default_overlap
        self.min_chunk_size = min_chunk_size

    def find_latex_spans(self, text: str) -> List[Tuple[int, int, str]]:
        """
        Locate all LaTeX formula character spans (start, end, formula_str) in the text.
        """
        spans: List[Tuple[int, int, str]] = []
        for match in self.LATEX_PATTERN.finditer(text):
            spans.append((match.start(), match.end(), match.group(0)))
        return spans

    def is_inside_latex(self, index: int, latex_spans: List[Tuple[int, int, str]]) -> Optional[Tuple[int, int]]:
        """
        Check if a given character index falls inside an active LaTeX formula span.
        Returns the (start, end) span if inside, else None.
        """
        for start, end, _ in latex_spans:
            if start < index < end:
                return (start, end)
        return None

    def chunk_text(
        self,
        text: str,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        preserve_latex: bool = True,
        initial_heading: str = "",
    ) -> List[TextChunk]:
        """
        Divide text into overlapping chunks respecting sentence, heading, and LaTeX boundaries.

        Args:
            text: Source document or chapter text to chunk.
            chunk_size: Max character size per chunk (default 1200).
            chunk_overlap: Number of characters to overlap with subsequent chunk (default 200).
            preserve_latex: If True, guarantees formulas are not cut in half.
            initial_heading: Initial active section heading if known.

        Returns:
            List[TextChunk]: Ordered list of bounded chunks.
        """
        if not text or not text.strip():
            return []

        clean_text = text.strip()
        length = len(clean_text)
        size = chunk_size or self.default_chunk_size
        overlap = chunk_overlap if chunk_overlap is not None else self.default_overlap

        # Ensure valid configuration
        if overlap >= size:
            overlap = max(0, size // 4)

        if length <= size:
            # Fits in a single chunk
            latex_spans = self.find_latex_spans(clean_text) if preserve_latex else []
            formulas = [f[2] for f in latex_spans]
            return [
                TextChunk(
                    text=clean_text,
                    chunk_index=0,
                    total_chunks=1,
                    char_start=0,
                    char_end=length,
                    heading=initial_heading or self._detect_first_heading(clean_text),
                    has_latex=len(formulas) > 0,
                    latex_equations=formulas,
                    overlap_chars=0,
                )
            ]

        latex_spans = self.find_latex_spans(clean_text) if preserve_latex else []
        raw_chunks: List[Tuple[int, int, str, int]] = []  # (start, end, chunk_text, overlap_chars)
        current_start = 0
        current_heading = initial_heading

        while current_start < length:
            target_end = min(current_start + size, length)

            if target_end >= length:
                # Last remaining piece
                actual_end = length
            else:
                # Find optimal split point near target_end
                actual_end = self._find_optimal_split(
                    text=clean_text,
                    target_pos=target_end,
                    min_pos=current_start + self.min_chunk_size,
                    max_pos=min(target_end + (overlap // 2), length),
                    latex_spans=latex_spans,
                )

            chunk_str = clean_text[current_start:actual_end].strip()
            if chunk_str:
                overlap_len = 0 if current_start == 0 else overlap
                raw_chunks.append((current_start, actual_end, chunk_str, overlap_len))

            if actual_end >= length:
                break

            # Calculate next chunk start taking overlap into account
            next_start = actual_end - overlap

            # Check if next_start lands inside a LaTeX formula
            if preserve_latex:
                in_latex = self.is_inside_latex(next_start, latex_spans)
                if in_latex:
                    # Shift start to beginning of formula to keep formula whole in overlap
                    next_start = in_latex[0]

            # Prevent infinite loops / zero progress
            if next_start <= current_start:
                next_start = actual_end

            current_start = next_start

        total = len(raw_chunks)
        results: List[TextChunk] = []

        for idx, (c_start, c_end, c_text, c_overlap) in enumerate(raw_chunks):
            # Check for headings inside chunk
            found_heading = self._detect_first_heading(c_text)
            if found_heading:
                current_heading = found_heading

            # Collect LaTeX formulas in this chunk
            chunk_formulas = [
                span[2]
                for span in self.find_latex_spans(c_text)
            ]

            results.append(
                TextChunk(
                    text=c_text,
                    chunk_index=idx,
                    total_chunks=total,
                    char_start=c_start,
                    char_end=c_end,
                    heading=current_heading,
                    has_latex=len(chunk_formulas) > 0,
                    latex_equations=chunk_formulas,
                    overlap_chars=c_overlap,
                )
            )

        return results

    def _find_optimal_split(
        self,
        text: str,
        target_pos: int,
        min_pos: int,
        max_pos: int,
        latex_spans: List[Tuple[int, int, str]],
    ) -> int:
        """
        Identifies the cleanest boundary (paragraph, heading, sentence, or space)
        while strictly protecting LaTeX equations from truncation.
        """
        # 1. LaTeX Boundary Check: If target falls inside formula, shift outside
        for l_start, l_end, _ in latex_spans:
            if l_start < target_pos < l_end:
                # If formula ends before max_pos, include whole formula
                if l_end <= max_pos:
                    target_pos = l_end
                # Otherwise break before formula starts (if >= min_pos)
                elif l_start >= min_pos:
                    target_pos = l_start
                else:
                    # Formula is larger than allowable window, include it to avoid truncation
                    target_pos = l_end
                break

        # Search window for natural punctuation / structural breaks
        window_start = max(min_pos, target_pos - 150)
        window_end = min(max_pos, target_pos + 100)
        window = text[window_start:window_end]

        # Priority 1: Double newline (Paragraph break)
        idx = window.rfind("\n\n")
        if idx != -1:
            candidate = window_start + idx + 2
            if not self.is_inside_latex(candidate, latex_spans):
                return candidate

        # Priority 2: Single newline followed by heading or bullet
        idx = window.rfind("\n#")
        if idx != -1:
            candidate = window_start + idx + 1
            if not self.is_inside_latex(candidate, latex_spans):
                return candidate

        # Priority 3: Sentence ending punctuation (. ! ? followed by space or newline)
        sentence_breaks = [m.end() for m in re.finditer(r"[\.!\?]\s+", window)]
        if sentence_breaks:
            for s_break in reversed(sentence_breaks):
                candidate = window_start + s_break
                if not self.is_inside_latex(candidate, latex_spans):
                    return candidate

        # Priority 4: Plain space
        idx = window.rfind(" ")
        if idx != -1:
            candidate = window_start + idx + 1
            if not self.is_inside_latex(candidate, latex_spans):
                return candidate

        # Fallback: check if target_pos falls inside latex formula
        chosen = target_pos
        in_latex = self.is_inside_latex(chosen, latex_spans)
        if in_latex:
            if in_latex[0] >= min_pos:
                chosen = in_latex[0]
            else:
                chosen = in_latex[1]

        return chosen

    def _detect_first_heading(self, text: str) -> str:
        """
        Extract the first occurrence of a structural heading from a text segment.
        """
        match = self.HEADING_PATTERN.search(text)
        if match:
            return match.group(0).strip()
        return ""
