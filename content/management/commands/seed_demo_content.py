"""
Management command: seed_demo_content

Seeds the fixed demo content for the Question Generation System:
  - 1 Book  : Mathematics for Class 10 (NCERT)
  - 1 Chapter: Chapter 1 — Real Numbers
  - 5 Topics : Euclid's Division Lemma, Fundamental Theorem of Arithmetic,
               Irrational Numbers, Decimal Expansions, HCF and LCM Applications
  - 42 Questions distributed across topics with deliberate variety in
    question_type, difficulty, learner_level, and marks.

IDEMPOTENCY
-----------
The command uses get_or_create throughout. Questions are matched by
(topic, question_text). Running it a second time will print "already
exists, skipping" for every row — no duplicates are created.

Usage::

    python manage.py seed_demo_content
    python manage.py seed_demo_content --clear  # deletes & reseeds from scratch
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from content.models import (
    Book,
    Chapter,
    Difficulty,
    LearnerLevel,
    Question,
    QuestionType,
    Topic,
)

# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

BOOK = {
    "title": "Mathematics for Class 10",
    "subject": "Mathematics",
    "grade": "Class 10",
    "publisher": "NCERT",
}

CHAPTER = {
    "title": "Real Numbers",
    "chapter_order": 1,
}

TOPICS = [
    "Euclid's Division Lemma",
    "Fundamental Theorem of Arithmetic",
    "Irrational Numbers",
    "Decimal Expansions of Rational Numbers",
    "HCF and LCM Applications",
]

# ---------------------------------------------------------------------------
# Questions — 42 total, deliberately varied across all dimensions.
# Each dict keys: topic_name, question_text, question_type, marks,
#                 difficulty, learner_level, options (or None), correct_answer,
#                 source_reference (optional)
# ---------------------------------------------------------------------------

QUESTIONS = [

    # ===== Topic 1: Euclid's Division Lemma ================================

    # EASY / BEGINNER
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "State Euclid's Division Lemma.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "For any two positive integers a and b, there exist unique integers q and r such that a = bq + r, where 0 ≤ r < b.",
        "source_reference": "Ex 1.1",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Using Euclid's Division Algorithm, find the HCF of 135 and 225.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "HCF(135, 225) = 45",
        "source_reference": "Ex 1.1 Q1",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Which of the following represents Euclid's Division Lemma correctly?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "a = bq + r, 0 ≤ r < b",
            "B": "a = bq + r, 0 < r ≤ b",
            "C": "a = bq + r, 0 ≤ r ≤ b",
            "D": "a = bq - r, 0 ≤ r < b",
        },
        "correct_answer": "A",
        "source_reference": "Ex 1.1",
    },

    # MEDIUM / INTERMEDIATE
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Use Euclid's Division Algorithm to find the HCF of 867 and 255.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "HCF(867, 255) = 51",
        "source_reference": "Ex 1.1 Q2",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Show that any positive odd integer is of the form 6q + 1, or 6q + 3, or 6q + 5, where q is some integer.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Let a be any positive integer. By Euclid's lemma, a = 6q + r where 0 ≤ r < 6. Odd values of r are 1, 3, 5. Therefore a = 6q+1, 6q+3, or 6q+5.",
        "source_reference": "Ex 1.1 Q3",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "An army contingent of 616 members marched behind an army band of 32 members. Both groups must march in the same number of columns. What is the maximum number of columns in which they can march?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "HCF(616, 32) = 8. Maximum columns = 8.",
        "source_reference": "Ex 1.1 Q4",
    },

    # HARD / ADVANCED
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Prove that the square of any positive integer is of the form 5m, 5m+1, or 5m+4 for some integer m.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Use Euclid's lemma: any integer a = 5q, 5q+1, 5q+2, 5q+3, or 5q+4. Square each and reduce mod 5. The squares give remainders 0, 1, 4, 4, 1 — hence 5m, 5m+1, or 5m+4.",
        "source_reference": "HOTS",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Which of the following is the HCF of 56 and 72?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": {
            "A": "4",
            "B": "8",
            "C": "12",
            "D": "18",
        },
        "correct_answer": "B",
        "source_reference": "Objective Q",
    },

    # ===== Topic 2: Fundamental Theorem of Arithmetic ======================

    # EASY / BEGINNER
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Express 156 as a product of its prime factors.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "156 = 2² × 3 × 13",
        "source_reference": "Ex 1.2 Q1",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "What does the Fundamental Theorem of Arithmetic state?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Every composite number can be expressed (factorised) as a product of primes, and this factorisation is unique, apart from the order in which the prime factors occur.",
        "source_reference": "Theorem 1.2",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Which of the following is the prime factorisation of 3825?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "3 × 5² × 51",
            "B": "3² × 5² × 17",
            "C": "3 × 5 × 255",
            "D": "5² × 153",
        },
        "correct_answer": "B",
        "source_reference": "Ex 1.2 Q1(iv)",
    },

    # MEDIUM / INTERMEDIATE
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 12, 15, and 21 by applying the prime factorisation method.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "12 = 2²×3, 15 = 3×5, 21 = 3×7. HCF = 3. LCM = 2²×3×5×7 = 420.",
        "source_reference": "Ex 1.2 Q3",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Explain why 7 × 11 × 13 + 13 is a composite number.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "7 × 11 × 13 + 13 = 13(7 × 11 + 1) = 13 × 78 = 13 × 2 × 3 × 13. It has factors other than 1 and itself, so it is composite.",
        "source_reference": "Ex 1.2 Q5",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "There is a circular path around a sports field. Sonia takes 18 minutes and Ravi takes 12 minutes to drive one round of the field. Supposing they both start at the same point and at the same time, and go in the same direction, after how many minutes will they meet again at the starting point?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "LCM(18, 12) = 36 minutes.",
        "source_reference": "Ex 1.2 Q7",
    },

    # HARD / ADVANCED
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Given that HCF(306, 657) = 9, find LCM(306, 657).",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "LCM = (306 × 657) / HCF = (306 × 657) / 9 = 22338.",
        "source_reference": "Ex 1.2 Q4",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "If p is a prime number and p divides a², then which statement is necessarily true?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": {
            "A": "p divides 2a",
            "B": "p divides a",
            "C": "p² divides a",
            "D": "p divides a only if a is even",
        },
        "correct_answer": "B",
        "source_reference": "Theorem 1.3 corollary",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Prove that √2 is irrational using the Fundamental Theorem of Arithmetic.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Assume √2 = p/q in lowest terms. Then 2q² = p², so 2 | p². By FTA, 2 | p. Let p = 2m, giving 2q² = 4m², so q² = 2m², hence 2 | q. This contradicts gcd(p,q)=1.",
        "source_reference": "Theorem 1.3",
    },

    # ===== Topic 3: Irrational Numbers =====================================

    # EASY / BEGINNER
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Which of the following is an irrational number?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "√4",
            "B": "√9",
            "C": "√2",
            "D": "√16",
        },
        "correct_answer": "C",
        "source_reference": "Objective Q",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Define an irrational number and give two examples.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "A number that cannot be expressed as p/q where p, q are integers and q ≠ 0. Examples: √2, π.",
        "source_reference": "Pg 8",
    },

    # MEDIUM / INTERMEDIATE
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that √3 is irrational.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Assume √3 = p/q (lowest terms). Then 3q² = p², so 3 | p, let p = 3m. Then 3q² = 9m², q² = 3m², so 3 | q. Contradiction with gcd(p,q) = 1.",
        "source_reference": "Ex 1.3 Q1(ii)",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that 3 + 2√5 is irrational, given that √5 is irrational.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Suppose 3 + 2√5 = p/q (rational). Then √5 = (p/q − 3)/2 = (p − 3q)/(2q), which is rational. Contradiction, since √5 is irrational.",
        "source_reference": "Ex 1.3 Q3",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Which of the following is NOT an irrational number?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": {
            "A": "√5",
            "B": "√23",
            "C": "√225",
            "D": "√7",
        },
        "correct_answer": "C",
        "source_reference": "Objective Q",
    },

    # HARD / ADVANCED
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Show that 5 − √3 is irrational.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "If 5 − √3 = r (rational), then √3 = 5 − r is rational. But √3 is irrational. Contradiction.",
        "source_reference": "Ex 1.3 Q2",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that √2 + √3 is irrational.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Suppose √2 + √3 = r. Then √3 = r − √2, squaring: 3 = r² − 2r√2 + 2, so √2 = (r²−1)/(2r), which is rational (as r is rational). But √2 is irrational. Contradiction.",
        "source_reference": "HOTS",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "The product of two irrational numbers is:",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": {
            "A": "Always irrational",
            "B": "Always rational",
            "C": "Always an integer",
            "D": "Sometimes rational, sometimes irrational",
        },
        "correct_answer": "D",
        "source_reference": "Conceptual Q",
    },

    # ===== Topic 4: Decimal Expansions of Rational Numbers =================

    # EASY / BEGINNER
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Without actually performing the long division, state whether the following will have a terminating or a non-terminating repeating decimal expansion: 13/3125.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "3125 = 5⁵ (of the form 2ⁿ × 5ᵐ). So 13/3125 has a terminating decimal expansion.",
        "source_reference": "Ex 1.4 Q1(ii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "A rational number whose denominator, after reduction to lowest terms, has only 2 and 5 as prime factors will have which type of decimal expansion?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "Non-terminating, non-repeating",
            "B": "Terminating",
            "C": "Non-terminating, repeating",
            "D": "Cannot be determined",
        },
        "correct_answer": "B",
        "source_reference": "Theorem 1.7",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write the decimal expansion of 17/8.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "17/8 = 2.125 (terminating).",
        "source_reference": "Ex 1.4 Q2",
    },

    # MEDIUM / INTERMEDIATE
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Without actually performing the long division, state whether 77/210 has a terminating or non-terminating decimal expansion.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "77/210 = 11/30. 30 = 2 × 3 × 5. Since 3 is in the denominator, it is non-terminating repeating.",
        "source_reference": "Ex 1.4 Q1(vi)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "What is the decimal expansion of 1/7? Identify the repeating block.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "1/7 = 0.142857̄ — repeating block is 142857.",
        "source_reference": "Ex 1.4 Q2",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "The decimal expansion of 23/(2³ × 5²) is:",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": {
            "A": "Non-terminating repeating",
            "B": "Terminating after 2 decimal places",
            "C": "Terminating after 3 decimal places",
            "D": "Non-terminating non-repeating",
        },
        "correct_answer": "C",
        "source_reference": "Objective Q",
    },

    # HARD / ADVANCED
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write the condition on the denominators of rational numbers for them to have a terminating decimal expansion. How many decimal places will 47/2⁵ × 5³ terminate at?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Denominator must be of the form 2ⁿ × 5ᵐ. For 47/(2⁵ × 5³): multiply numerator and denominator to make exponents equal: 47 × 5²/(2⁵ × 5⁵) = 4700/10⁵ = 0.04700. Terminates after max(5,3) = 5 decimal places.",
        "source_reference": "HOTS",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Which of the following rational numbers has a non-terminating repeating decimal expansion?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": {
            "A": "15/1600",
            "B": "23/2³ × 5²",
            "C": "35/50",
            "D": "17/6",
        },
        "correct_answer": "D",
        "source_reference": "Objective Q",
    },

    # ===== Topic 5: HCF and LCM Applications ================================

    # EASY / BEGINNER
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Find the HCF and LCM of 6 and 20 by prime factorisation.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "6 = 2 × 3, 20 = 2² × 5. HCF = 2. LCM = 2² × 3 × 5 = 60.",
        "source_reference": "Ex 1.2 Q2",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "If HCF(a, b) = 12 and a × b = 1800, find LCM(a, b).",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "LCM = (a × b) / HCF = 1800 / 12 = 150.",
        "source_reference": "Ex 1.2",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "The HCF of two numbers is 9 and their LCM is 2016. If one of the numbers is 54, what is the other?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "324",
            "B": "336",
            "C": "342",
            "D": "352",
        },
        "correct_answer": "B",
        "source_reference": "Objective Q",
    },

    # MEDIUM / INTERMEDIATE
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Three bells ring at intervals of 6, 12, and 18 minutes. They start together at 6:00 AM. At what time will they ring together again?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "LCM(6, 12, 18) = 36 minutes. They ring together again at 6:36 AM.",
        "source_reference": "Application Q",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Find the largest number that divides 245 and 1029, leaving remainders 5 and 3 respectively.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Subtract remainders: 245−5 = 240, 1029−3 = 1026. Required number = HCF(240, 1026) = 6.",
        "source_reference": "Ex 1.1",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Two tankers contain 850 litres and 680 litres of petrol respectively. Find the maximum capacity of a container that can measure the petrol of either tanker in exact number of times.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "HCF(850, 680) = 170 litres.",
        "source_reference": "Application Q",
    },

    # HARD / ADVANCED
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Prove that for any two positive integers a and b, HCF(a, b) × LCM(a, b) = a × b.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Express a = HCF × m, b = HCF × n where gcd(m,n) = 1. LCM = HCF × m × n. Therefore HCF × LCM = HCF² × m × n = (HCF × m) × (HCF × n) = a × b.",
        "source_reference": "HOTS",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "The LCM of two numbers is 14 times their HCF. The sum of LCM and HCF is 600. If one number is 280, find the other.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "LCM = 14 × HCF. LCM + HCF = 600 ⟹ 15 × HCF = 600 ⟹ HCF = 40, LCM = 560. Other number = (HCF × LCM) / 280 = (40 × 560) / 280 = 80.",
        "source_reference": "HOTS",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "If the HCF of 65 and 117 is expressible in the form 65m − 117, find the value of m.",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": {
            "A": "1",
            "B": "2",
            "C": "3",
            "D": "4",
        },
        "correct_answer": "B",
        "source_reference": "Ex 1.1 HOTS",
    },
]


class Command(BaseCommand):
    help = (
        "Seed the demo content: 1 Book, 1 Chapter, 5 Topics, and 42 Questions "
        "with variety across type, difficulty, and learner_level. "
        "Safe to run multiple times — uses get_or_create throughout."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all content data before reseeding (full reseed from scratch).",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write(self.style.WARNING("Clearing all content data..."))
            Question.objects.all().delete()
            Topic.objects.all().delete()
            Chapter.objects.all().delete()
            Book.objects.all().delete()
            self.stdout.write(self.style.WARNING("Cleared."))

        with transaction.atomic():
            self._seed()

        self.stdout.write(self.style.SUCCESS("\nSeed complete."))

    def _seed(self):
        # --- Book ---
        book, book_created = Book.objects.get_or_create(
            title=BOOK["title"],
            subject=BOOK["subject"],
            grade=BOOK["grade"],
            defaults={"publisher": BOOK["publisher"], "is_active": True},
        )
        self._report("Book", book.title, book_created)

        # --- Chapter ---
        chapter, ch_created = Chapter.objects.get_or_create(
            book=book,
            chapter_order=CHAPTER["chapter_order"],
            defaults={"title": CHAPTER["title"]},
        )
        self._report("Chapter", chapter.title, ch_created)

        # --- Topics ---
        topic_map: dict[str, Topic] = {}
        for topic_name in TOPICS:
            topic, t_created = Topic.objects.get_or_create(
                chapter=chapter,
                name=topic_name,
            )
            topic_map[topic_name] = topic
            self._report("Topic", topic_name, t_created)

        # --- Questions ---
        q_created_count = 0
        q_exists_count = 0
        for q_data in QUESTIONS:
            topic = topic_map[q_data["topic_name"]]
            question, q_created = Question.objects.get_or_create(
                topic=topic,
                question_text=q_data["question_text"],
                defaults={
                    "question_type": q_data["question_type"],
                    "marks": q_data["marks"],
                    "difficulty": q_data["difficulty"],
                    "learner_level": q_data["learner_level"],
                    "options": q_data.get("options"),
                    "correct_answer": q_data["correct_answer"],
                    "source_reference": q_data.get("source_reference", ""),
                    "is_active": True,
                },
            )
            if q_created:
                q_created_count += 1
            else:
                q_exists_count += 1

        self.stdout.write(
            f"  Questions: {q_created_count} created, "
            f"{q_exists_count} already existed (skipped)."
        )
        self._print_summary(book, chapter)

    def _report(self, model_name: str, label: str, created: bool) -> None:
        if created:
            self.stdout.write(f"  {model_name}: '{label}' — created.")
        else:
            self.stdout.write(f"  {model_name}: '{label}' — already exists, skipping.")

    def _print_summary(self, book: "Book", chapter: "Chapter") -> None:  # type: ignore[name-defined]
        from content.models import Difficulty, LearnerLevel, QuestionType  # noqa: PLC0415

        self.stdout.write("\n--- Demo Content Summary ---")
        self.stdout.write(f"Book   : {book.title} ({book.subject}, {book.grade})")
        self.stdout.write(f"Chapter: {chapter.title}")

        topics = chapter.topics.prefetch_related("questions").all()
        for topic in topics:
            active_q = topic.questions.filter(is_active=True)
            self.stdout.write(
                f"  Topic '{topic.name}': {active_q.count()} active questions"
            )

        total_q = Question.objects.filter(topic__chapter=chapter, is_active=True)
        self.stdout.write(f"\nTotal active questions in chapter: {total_q.count()}")

        for qt in QuestionType.values:
            count = total_q.filter(question_type=qt).count()
            self.stdout.write(f"  {qt}: {count}")

        self.stdout.write("")
        for diff in Difficulty.values:
            count = total_q.filter(difficulty=diff).count()
            self.stdout.write(f"  {diff}: {count}")

        self.stdout.write("")
        for level in LearnerLevel.values:
            count = total_q.filter(learner_level=level).count()
            self.stdout.write(f"  {level}: {count}")
