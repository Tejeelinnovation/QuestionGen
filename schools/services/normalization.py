"""
Academic Class and Division Normalization Service.

Provides deterministic parsing and normalization of class standards and
divisions (e.g. Standard 6, Std 6, 6th, VI -> canonical Standard 6).
Keeps normalization behind a clean service boundary so intelligent or ML-based
components can be integrated in the future without altering API contracts.
"""

from __future__ import annotations

import re
from typing import NamedTuple


class ParsedClassAssignment(NamedTuple):
    standard: int | None
    section: str | None
    canonical_name: str | None


class AcademicClassNormalizer:
    """
    Deterministic normalizer for school standards and division representations.
    """

    ROMAN_TO_INT: dict[str, int] = {
        "I": 1,
        "II": 2,
        "III": 3,
        "IV": 4,
        "V": 5,
        "VI": 6,
        "VII": 7,
        "VIII": 8,
        "IX": 9,
        "X": 10,
        "XI": 11,
        "XII": 12,
    }

    # Ordinal mappings
    ORDINAL_SUFFIX_PATTERN = re.compile(r"^(\d+)(?:st|nd|rd|th)?$", re.IGNORECASE)

    # Prefix stripping pattern
    PREFIX_PATTERN = re.compile(
        r"^(?:standard|std\.?|class|grade)\s*[-:]?\s*", re.IGNORECASE
    )

    # Division extraction pattern
    DIVISION_CLEAN_PATTERN = re.compile(
        r"^(?:section|sec\.?|division|div\.?)?\s*([a-zA-Z])$", re.IGNORECASE
    )

    @classmethod
    def normalize_standard(cls, raw_standard: str | int | float | None) -> int | None:
        """
        Normalizes any standard representation into a canonical integer (1-12).

        Examples:
            'Standard 6' -> 6
            'Std 6'      -> 6
            '6th'        -> 6
            'VI'         -> 6
            'Class 10'   -> 10
            'X'          -> 10
            10           -> 10
        """
        if raw_standard is None:
            return None

        # Convert float from excel (e.g. 10.0 -> 10)
        if isinstance(raw_standard, (int, float)):
            try:
                int_val = int(raw_standard)
                if 1 <= int_val <= 12:
                    return int_val
            except (ValueError, OverflowError):
                return None

        text = str(raw_standard).strip()
        if not text:
            return None

        # Strip common prefixes like 'Standard ', 'Std. ', 'Class '
        cleaned = cls.PREFIX_PATTERN.sub("", text).strip()

        # Check Roman numerals
        upper_cleaned = cleaned.upper()
        if upper_cleaned in cls.ROMAN_TO_INT:
            return cls.ROMAN_TO_INT[upper_cleaned]

        # Check digits or ordinals (e.g. '6th', '10', '1st')
        m = cls.ORDINAL_SUFFIX_PATTERN.match(cleaned)
        if m:
            try:
                val = int(m.group(1))
                if 1 <= val <= 12:
                    return val
            except ValueError:
                pass

        # Try to find any stand-alone integer in the text
        int_match = re.search(r"\b([1-9]|1[0-2])\b", text)
        if int_match:
            return int(int_match.group(1))

        # Also check if original unstripped text was Roman numeral
        upper_text = text.upper()
        if upper_text in cls.ROMAN_TO_INT:
            return cls.ROMAN_TO_INT[upper_text]

        return None

    @classmethod
    def normalize_division(cls, raw_division: str | None) -> str | None:
        """
        Normalizes a section / division string to a single uppercase character (e.g. 'A', 'B').

        Examples:
            'A'            -> 'A'
            'section a'    -> 'A'
            'Division B'   -> 'B'
            'b'            -> 'B'
        """
        if not raw_division:
            return None

        text = str(raw_division).strip()
        if not text:
            return None

        m = cls.DIVISION_CLEAN_PATTERN.match(text)
        if m:
            return m.group(1).upper()

        # If it's a single letter anywhere in the string
        single_letter_match = re.search(r"\b([a-zA-Z])\b", text)
        if single_letter_match:
            return single_letter_match.group(1).upper()

        # Just take the first valid alphabetical char if len is 1
        cleaned_chars = [c.upper() for c in text if c.isalpha()]
        if len(cleaned_chars) == 1:
            return cleaned_chars[0]

        return None

    @classmethod
    def parse_class_teacher_assignment(
        cls, raw_value: str | None
    ) -> ParsedClassAssignment:
        """
        Parses a teacher's 'Class Teacher' field into standard and division.

        Handles compound strings such as:
            'Standard 6 — A'
            'Std 6 - A'
            'Class 10 A'
            '10-A'
            'VI - A'
            '6th - B'
            'None' / '' -> (None, None, None)
        """
        if not raw_value:
            return ParsedClassAssignment(None, None, None)

        text = str(raw_value).strip()
        # Ignore empty / not applicable tokens
        if not text or text.lower() in {"na", "n/a", "none", "nil", "-", "no", "not assigned"}:
            return ParsedClassAssignment(None, None, None)

        # Normalize unicode dashes (em-dash, en-dash, hyphens)
        normalized_text = re.sub(r"[—–−]", "-", text)

        # Pattern 1: Delimited with dash, e.g. "Standard 6 - A", "10-A", "VI - B"
        if "-" in normalized_text:
            parts = normalized_text.split("-", 1)
            standard = cls.normalize_standard(parts[0].strip())
            division = cls.normalize_division(parts[1].strip())
            if standard and division:
                return ParsedClassAssignment(
                    standard=standard,
                    section=division,
                    canonical_name=f"Class {standard}-{division}",
                )

        # Pattern 2: Regex for standard followed by single division letter:
        # e.g. "Class 10 A", "Std 6 A", "10A", "VI A", "6th B"
        compound_regex = re.compile(
            r"^(?:standard|std\.?|class|grade)?\s*([0-9]{1,2}|[ivxlcdmIVXLCDM]+)(?:st|nd|rd|th)?\s*[-:\s/]?\s*(?:section|sec\.?|division|div\.?)?\s*([a-zA-Z])$",
            re.IGNORECASE,
        )
        m = compound_regex.match(normalized_text)
        if m:
            standard = cls.normalize_standard(m.group(1))
            division = cls.normalize_division(m.group(2))
            if standard and division:
                return ParsedClassAssignment(
                    standard=standard,
                    section=division,
                    canonical_name=f"Class {standard}-{division}",
                )

        # Fallback: Attempt to extract standard and division separately
        tokens = normalized_text.split()
        if len(tokens) >= 2:
            # Check if last token is division
            division = cls.normalize_division(tokens[-1])
            standard = cls.normalize_standard(" ".join(tokens[:-1]))
            if standard and division:
                return ParsedClassAssignment(
                    standard=standard,
                    section=division,
                    canonical_name=f"Class {standard}-{division}",
                )

        return ParsedClassAssignment(None, None, None)
