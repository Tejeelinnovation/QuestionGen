"""
Duplicate Question Detection and Similarity Guard.

Detects lexical and semantic duplicates during question paper generation and question bank ingestion:
- Multi-tier matching: Exact normalized hash, Jaccard n-gram overlap, and sequence alignment.
- Mathematical / LaTeX formula normalization.
- MCQ Option set comparison to identify identical choices with paraphrased prompts.
- Batch deduplication and live database collision detection.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from generation.interfaces import QuestionDraft


@dataclass
class DuplicateMatch:
    """Details of a detected duplicate question collision."""
    is_duplicate: bool
    similarity_score: float
    matched_text: str
    matched_id: Optional[Any] = None
    reason: str = ""  # "EXACT_NORMALIZED" | "HIGH_SIMILARITY" | "MCQ_OPTION_MATCH"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_duplicate": self.is_duplicate,
            "similarity_score": round(self.similarity_score, 3),
            "matched_text": self.matched_text,
            "matched_id": self.matched_id,
            "reason": self.reason,
        }


class DuplicateQuestionDetector:
    """
    Prevents redundant, repeated, or near-duplicate questions in generated sets
    or existing question repositories.
    """

    STOP_WORDS = {
        "what", "is", "the", "a", "an", "of", "in", "to", "for", "with", "on", "at",
        "by", "from", "up", "about", "into", "over", "after", "which", "who", "whom",
        "whose", "where", "when", "how", "why", "define", "state", "explain", "describe",
        "calculate", "find", "determine", "evaluate", "mention", "write", "give", "list",
        "name", "following", "given", "does", "do", "did", "can", "could", "would",
        "and", "having", "with", "net", "an", "or", "their", "its", "are", "be",
    }

    PUNCTUATION_RE = re.compile(r"[^\w\s\$\\\^_\{\}]")
    WHITESPACE_RE = re.compile(r"\s+")
    LATEX_SPACING_RE = re.compile(r"\\[,;! ]")

    def __init__(self, default_threshold: float = 0.80):
        self.default_threshold = default_threshold

    @staticmethod
    def _stem_word(word: str) -> str:
        """Lightweight heuristic suffix stripping for English/science terminology."""
        w = word.lower()
        for suffix in ("ations", "ation", "tions", "tion", "ical", "ment", "ing", "ies", "ed", "es", "ic", "ly", "s"):
            if len(w) > len(suffix) + 3 and w.endswith(suffix):
                return w[:-len(suffix)]
        return w

    def normalize_text(self, text: str) -> str:
        """
        Produce a normalized canonical representation of a question prompt
        for fast equality comparison.
        """
        if not text:
            return ""
        s = text.lower().strip()
        # Clean latex spacing commands
        s = self.LATEX_SPACING_RE.sub("", s)
        # Remove common punctuation while keeping formula characters
        s = self.PUNCTUATION_RE.sub(" ", s)
        # Collapse whitespace
        s = self.WHITESPACE_RE.sub(" ", s).strip()
        return s

    def tokenize_stem(self, text: str, remove_stopwords: bool = True) -> List[str]:
        """
        Split normalized text into meaningful stem tokens.
        """
        norm = self.normalize_text(text)
        tokens = norm.split()
        if remove_stopwords:
            tokens = [self._stem_word(t) for t in tokens if t not in self.STOP_WORDS and len(t) > 1]
        else:
            tokens = [self._stem_word(t) for t in tokens if len(t) > 0]
        return tokens

    def get_ngrams(self, tokens: List[str], n: int = 2) -> Set[Tuple[str, ...]]:
        """
        Generate set of n-grams from token sequence.
        """
        if len(tokens) < n:
            return set()
        return set(tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1))

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Compute a hybrid similarity score (0.0 to 1.0) between two question texts.
        Combines token Jaccard similarity, Szymkiewicz-Simpson overlap coefficient,
        and sequence matcher alignment.
        """
        norm1 = self.normalize_text(text1)
        norm2 = self.normalize_text(text2)

        if not norm1 or not norm2:
            return 0.0

        # Exact match check
        if norm1 == norm2:
            return 1.0

        tokens1 = self.tokenize_stem(text1, remove_stopwords=True)
        tokens2 = self.tokenize_stem(text2, remove_stopwords=True)

        if not tokens1 or not tokens2:
            # Fall back to raw sequence matcher if all words were stopwords
            return difflib.SequenceMatcher(None, norm1, norm2).ratio()

        set1, set2 = set(tokens1), set(tokens2)
        intersection = set1.intersection(set2)
        union = set1.union(set2)
        jaccard = len(intersection) / len(union) if union else 0.0
        min_size = min(len(set1), len(set2))
        overlap_coeff = len(intersection) / min_size if min_size > 0 else 0.0

        # Bigram overlap
        bigrams1 = self.get_ngrams(tokens1, 2)
        bigrams2 = self.get_ngrams(tokens2, 2)
        if bigrams1 and bigrams2:
            bg_intersection = bigrams1.intersection(bigrams2)
            bg_union = bigrams1.union(bigrams2)
            bg_jaccard = len(bg_intersection) / len(bg_union)
        else:
            bg_jaccard = (jaccard + overlap_coeff) / 2

        # Character sequence matcher ratio
        seq_ratio = difflib.SequenceMatcher(None, norm1, norm2).ratio()

        # Weighted composite score incorporating overlap coefficient
        composite = max(
            seq_ratio,
            (0.30 * jaccard) + (0.35 * overlap_coeff) + (0.35 * seq_ratio)
        )
        return min(1.0, max(0.0, composite))

    def calculate_option_similarity(
        self,
        options1: Optional[Dict[str, str]],
        options2: Optional[Dict[str, str]],
    ) -> float:
        """
        Compare the text content of MCQ answer options regardless of key letters (A/B/C/D).
        """
        if not options1 or not options2:
            return 0.0

        opts1 = {self.normalize_text(v) for v in options1.values() if v}
        opts2 = {self.normalize_text(v) for v in options2.values() if v}

        if not opts1 or not opts2:
            return 0.0

        matched = sum(
            1 for o1 in opts1 if any(self.calculate_similarity(o1, o2) > 0.80 for o2 in opts2)
        )
        total = max(len(opts1), len(opts2))
        return matched / total if total > 0 else 0.0

    def compare_questions(
        self,
        draft1: QuestionDraft,
        draft2: QuestionDraft,
        threshold: Optional[float] = None,
    ) -> DuplicateMatch:
        """
        Comprehensive comparison of two QuestionDraft instances.
        """
        thresh = threshold or self.default_threshold
        t1, t2 = draft1.question_text, draft2.question_text

        # 1. Exact normalized match
        if self.normalize_text(t1) == self.normalize_text(t2):
            return DuplicateMatch(
                is_duplicate=True,
                similarity_score=1.0,
                matched_text=t2,
                reason="EXACT_NORMALIZED",
            )

        text_score = self.calculate_similarity(t1, t2)

        # 2. Check MCQ options if both are MCQs
        if draft1.question_type == "MCQ" and draft2.question_type == "MCQ":
            opt_score = self.calculate_option_similarity(draft1.options, draft2.options)
            if opt_score >= 0.75:
                combined_score = (0.65 * opt_score) + (0.35 * text_score)
                if combined_score >= 0.60 or opt_score >= 0.90:
                    return DuplicateMatch(
                        is_duplicate=True,
                        similarity_score=combined_score,
                        matched_text=t2,
                        reason="MCQ_OPTION_MATCH",
                    )

        if text_score >= thresh:
            return DuplicateMatch(
                is_duplicate=True,
                similarity_score=text_score,
                matched_text=t2,
                reason="HIGH_SIMILARITY",
            )

        return DuplicateMatch(
            is_duplicate=False,
            similarity_score=text_score,
            matched_text=t2,
            reason="DISTINCT",
        )


    def filter_batch_duplicates(
        self,
        drafts: List[QuestionDraft],
        threshold: Optional[float] = None,
    ) -> Tuple[List[QuestionDraft], List[Tuple[QuestionDraft, DuplicateMatch]]]:
        """
        Filters a candidate batch of generated questions, retaining only unique questions
        and separating detected duplicates.

        Returns:
            Tuple[unique_drafts, duplicate_records]
        """
        thresh = threshold or self.default_threshold
        unique_drafts: List[QuestionDraft] = []
        duplicates: List[Tuple[QuestionDraft, DuplicateMatch]] = []

        for candidate in drafts:
            is_dup = False
            for accepted in unique_drafts:
                match = self.compare_questions(candidate, accepted, threshold=thresh)
                if match.is_duplicate:
                    duplicates.append((candidate, match))
                    is_dup = True
                    break

            if not is_dup:
                unique_drafts.append(candidate)

        return unique_drafts, duplicates

    def check_against_existing(
        self,
        draft: QuestionDraft,
        existing_questions: Iterable[Any],
        threshold: Optional[float] = None,
    ) -> Optional[DuplicateMatch]:
        """
        Compare a single QuestionDraft against an iterable of existing questions
        (e.g. content.models.Question queryset or model list).
        """
        thresh = threshold or self.default_threshold
        best_match: Optional[DuplicateMatch] = None
        highest_score = 0.0

        for q in existing_questions:
            q_text = getattr(q, "question_text", "")
            q_id = getattr(q, "id", None)
            q_type = getattr(q, "question_type", "")
            q_options = getattr(q, "options", None)

            # Check normalized equality
            if self.normalize_text(draft.question_text) == self.normalize_text(q_text):
                return DuplicateMatch(
                    is_duplicate=True,
                    similarity_score=1.0,
                    matched_text=q_text,
                    matched_id=q_id,
                    reason="EXACT_NORMALIZED",
                )

            score = self.calculate_similarity(draft.question_text, q_text)
            if draft.question_type == "MCQ" and q_type == "MCQ" and q_options:
                opt_score = self.calculate_option_similarity(draft.options, q_options)
                if opt_score >= 0.75 and score >= 0.65:
                    score = max(score, (score + opt_score) / 2)

            if score > highest_score:
                highest_score = score
                if score >= thresh:
                    best_match = DuplicateMatch(
                        is_duplicate=True,
                        similarity_score=score,
                        matched_text=q_text,
                        matched_id=q_id,
                        reason="HIGH_SIMILARITY",
                    )

        return best_match
