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

    # --- Expanded NCERT Bank for 100-mark coverage across all difficulties ---
    # =========================================================================
    # HARD / ADVANCED (Totaling ~65 marks)
    # =========================================================================
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Show that the square of any positive odd integer is of the form 8m + 1 for some integer m.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Any positive odd integer is of the form 4q + 1 or 4q + 3. (4q + 1)^2 = 16q^2 + 8q + 1 = 8(2q^2 + q) + 1 = 8m + 1. (4q + 3)^2 = 16q^2 + 24q + 9 = 8(2q^2 + 3q + 1) + 1 = 8m + 1.",
        "source_reference": "Ex 1.1 HOTS Q4",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Use Euclid's division lemma to show that the cube of any positive integer is of the form 9m, 9m + 1 or 9m + 8.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Let n = 3q, 3q+1, or 3q+2. Cubing each yields: (3q)^3 = 27q^3 = 9m; (3q+1)^3 = 27q^3 + 27q^2 + 9q + 1 = 9m+1; (3q+2)^3 = 27q^3 + 54q^2 + 36q + 8 = 9m+8.",
        "source_reference": "NCERT Ex 1.1 Q5",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Prove that n^2 - n is divisible by 2 for every positive integer n.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "n^2 - n = n(n-1). For any integer n, one of n or n-1 is always even, hence their product is divisible by 2.",
        "source_reference": "Exemplar",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "If d is the HCF of 56 and 72, find integers x and y satisfying d = 56x + 72y.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "HCF(56, 72) = 8. 72 = 56*1 + 16, 56 = 16*3 + 8. 8 = 56 - 16*3 = 56 - (72 - 56)*3 = 56*4 + 72*(-3). So x=4, y=-3.",
        "source_reference": "HOTS Extension",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Prove that there is no positive integer n for which 12^n ends with the digit zero or five.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "12^n = (2^2 * 3)^n = 2^(2n) * 3^n. By the Fundamental Theorem of Arithmetic, the only prime factors of 12^n are 2 and 3. Since 5 is not a factor, 12^n cannot end with 0 or 5.",
        "source_reference": "NCERT Exemplar",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "If p and q are distinct positive prime numbers, prove that √p + √q is an irrational number.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Assume √p + √q = r (rational). Then (r - √p)^2 = q => r^2 - 2r√p + p = q => √p = (r^2 + p - q)/(2r), which implies √p is rational, contradiction since p is prime.",
        "source_reference": "Exemplar Problem",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the largest number that divides 398, 436 and 542 leaving remainders 7, 11 and 15 respectively.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Required number is HCF(398-7, 436-11, 542-15) = HCF(391, 425, 527) = 17.",
        "source_reference": "CBSE Board HOTS",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Prove that if a prime number p divides a^2, where a is a positive integer, then p divides a.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Let prime factorization of a = p1*p2*...*pn. Then a^2 = (p1*p2*...*pn)^2. By uniqueness of Fundamental Theorem of Arithmetic, p must be one of p1, p2, ..., pn, hence p divides a.",
        "source_reference": "Fundamental Theorem Theorem 1.3",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that 2√3 - 1 is an irrational number, given that √3 is irrational.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Assume 2√3 - 1 = a/b (rational). Then √3 = (a/b + 1)/2 = (a+b)/(2b), which is rational. Contradiction.",
        "source_reference": "Board Exam Standard",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove by contradiction that 1 / (√5 - 2) is irrational.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "1/(√5 - 2) = √5 + 2. If √5 + 2 is rational r, then √5 = r - 2 is rational, contradicting irrationality of √5.",
        "source_reference": "HOTS",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that the product of a non-zero rational number and an irrational number is always irrational.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Let r != 0 be rational and x be irrational. Suppose rx = y is rational. Then x = y/r is quotient of two rationals, hence rational, contradiction.",
        "source_reference": "Theorem Proof",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Show that (3 + 2√5)^2 is an irrational number.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "(3 + 2√5)^2 = 9 + 20 + 12√5 = 29 + 12√5. Since √5 is irrational, 29 + 12√5 is irrational.",
        "source_reference": "Board HOTS",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Without actual division, determine after how many decimal places the decimal expansion of 14587 / (1250 * 8) terminates.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Denominator = 1250 * 8 = 10000 = 10^4 = 2^4 * 5^4. The highest power of 2 or 5 is 4, so it terminates after 4 decimal places.",
        "source_reference": "Board Exam HOTS",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Express 0.2343434... in the form p/q, where p and q are coprime integers.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Let x = 0.23434... 10x = 2.3434... 1000x = 234.3434... 990x = 232 => x = 232/990 = 116/495.",
        "source_reference": "Algebraic Conversion",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Case Study: A circular track of circumference 1200m is traversed by three athletes at speeds of 20 m/s, 25 m/s, and 30 m/s. Analyze their lap periods and calculate when they will all meet at the starting point simultaneously.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "Times taken per lap: T1 = 1200/20 = 60s, T2 = 1200/25 = 48s, T3 = 1200/30 = 40s. LCM(60, 48, 40) = 240 seconds (4 minutes).",
        "source_reference": "Case Study HOTS",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Six bells commence tolling together and toll at intervals of 2, 4, 6, 8, 10 and 12 seconds respectively. In 30 minutes, how many times do they toll together?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "LCM(2, 4, 6, 8, 10, 12) = 120 seconds = 2 minutes. In 30 minutes, number of tolls together = (30/2) + 1 (including start) = 16 times.",
        "source_reference": "Competition HOTS",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "An army contingent of 616 members is to march behind an army band of 32 members in a parade. The two groups are to march in the same number of columns. What is the maximum number of columns in which they can march?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.HARD,
        "learner_level": LearnerLevel.ADVANCED,
        "options": None,
        "correct_answer": "HCF(616, 32): 616 = 32 * 19 + 8; 32 = 8 * 4 + 0. Therefore, the maximum number of columns is 8.",
        "source_reference": "NCERT Ex 1.1 Q3",
    },

    # =========================================================================
    # MEDIUM / INTERMEDIATE (Totaling ~60 marks)
    # =========================================================================
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Find the HCF of 4052 and 12576 using Euclid's division algorithm.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "12576 = 4052 * 3 + 420; 4052 = 420 * 9 + 272; 420 = 272 * 1 + 148; 272 = 148 * 1 + 124; 148 = 124 * 1 + 24; 124 = 24 * 5 + 4; 24 = 4 * 6 + 0. HCF = 4.",
        "source_reference": "NCERT Example 1",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Show that any positive even integer is of the form 2q, and that any positive odd integer is of the form 2q + 1, where q is some integer.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Let a be positive integer and b = 2. Then a = 2q + r where 0 <= r < 2, so r = 0 or 1. If r = 0, a = 2q (even). If r = 1, a = 2q + 1 (odd).",
        "source_reference": "NCERT Example 2",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Check whether 4^n can end with the digit 0 for any natural number n.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "4^n = (2^2)^n = 2^(2n). For a number to end in 0, its prime factors must include both 2 and 5. Since 5 is absent, 4^n never ends in 0.",
        "source_reference": "NCERT Example 5",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the HCF and LCM of 6, 72 and 120, using the prime factorisation method.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "6 = 2 * 3; 72 = 2^3 * 3^2; 120 = 2^3 * 3 * 5. HCF = 2 * 3 = 6. LCM = 2^3 * 3^2 * 5 = 360.",
        "source_reference": "NCERT Example 8",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Explain why 7 × 11 × 13 + 13 and 7 × 6 × 5 × 4 × 3 × 2 × 1 + 5 are composite numbers.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "7 × 11 × 13 + 13 = 13(7 × 11 + 1) = 13 × 78; 7 × 6 × 5 × 4 × 3 × 2 × 1 + 5 = 5(7 × 6 × 4 × 3 × 2 × 1 + 1) = 5 × 1009. Both have more than two factors, so they are composite.",
        "source_reference": "NCERT Ex 1.2 Q6",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that 3 + 2√5 is irrational, given that √5 is an irrational number.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Assume 3 + 2√5 = a/b where a, b are coprime. 2√5 = a/b - 3 = (a - 3b)/b. √5 = (a - 3b)/(2b). Since a, b are integers, RHS is rational, implying √5 is rational. Contradiction.",
        "source_reference": "NCERT Ex 1.3 Q2",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that 1/√2 is irrational.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "1/√2 = √2/2. If 1/√2 = a/b, then √2 = 2a/b. Since 2a/b is rational, √2 must be rational, contradiction.",
        "source_reference": "NCERT Ex 1.3 Q3(i)",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that 7√5 is irrational.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Let 7√5 = a/b (a, b coprime). Then √5 = a/(7b). Since a/(7b) is rational, √5 is rational, contradiction.",
        "source_reference": "NCERT Ex 1.3 Q3(ii)",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that 6 + √2 is irrational.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Let 6 + √2 = a/b. Then √2 = a/b - 6 = (a - 6b)/b. Since a, b are integers, RHS is rational, which contradicts √2 is irrational.",
        "source_reference": "NCERT Ex 1.3 Q3(iii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write down the decimal expansion of 13 / 3125 by converting the denominator to a power of 10.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "3125 = 5^5. 13/3125 = (13 * 2^5)/(5^5 * 2^5) = (13 * 32)/10^5 = 416/100000 = 0.00416.",
        "source_reference": "NCERT Ex 1.4 Q2",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write down the decimal expansion of 23 / (2^3 × 5^2).",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "23 / (2^3 * 5^2) = (23 * 5)/(2^3 * 5^3) = 115/1000 = 0.115.",
        "source_reference": "NCERT Ex 1.4 Q2(vi)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "The decimal expansion of 43.123456789 represents a rational number. If expressed as p/q, what can you say about the prime factors of q?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "Since the decimal terminates after 9 places, q must be of the form 2^m * 5^n where m, n are non-negative integers. The prime factors of q are only 2 and 5.",
        "source_reference": "NCERT Ex 1.4 Q3(i)",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "A sweet seller has 420 kaju barfis and 130 badam barfis. She wants to stack them such that each stack has the same number, and they take up the least area of the tray. What is the number that can be placed in each stack for this purpose?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "HCF(420, 130): 420 = 130 * 3 + 30; 130 = 30 * 4 + 10; 30 = 10 * 3 + 0. The number of barfis in each stack is 10.",
        "source_reference": "NCERT Example 4",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Find the largest number which divides 70 and 125, leaving remainders 5 and 8 respectively.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "70 - 5 = 65; 125 - 8 = 117. HCF(65, 117) = 13.",
        "source_reference": "Exemplar Problem",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "There is a circular path around a sports field. Sonia takes 18 minutes to drive one round of the field, while Ravi takes 12 minutes for the same. Suppose they both start at the same point and at the same time, and go in the same direction. After how many minutes will they meet again at the starting point?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 4,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "LCM(18, 12): 18 = 2 * 3^2, 12 = 2^2 * 3. LCM = 2^2 * 3^2 = 36 minutes.",
        "source_reference": "NCERT Ex 1.2 Q7",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Can two numbers have 16 as their HCF and 380 as their LCM? Give reasons.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "HCF must always divide LCM exactly. 380 / 16 = 23.75, which is not an integer. Therefore, two numbers cannot have 16 as HCF and 380 as LCM.",
        "source_reference": "Exemplar Reasoning",
    },

    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Find the least number that is divisible by all the numbers from 1 to 10 (both inclusive).",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.MEDIUM,
        "learner_level": LearnerLevel.INTERMEDIATE,
        "options": None,
        "correct_answer": "LCM(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) = 2^3 * 3^2 * 5 * 7 = 2520.",
        "source_reference": "NCERT Exemplar Q7",
    },

    # =========================================================================
    # EASY / BEGINNER (Totaling ~85 marks)
    # =========================================================================
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "If two positive integers p and q can be expressed as p = ab^2 and q = a^3b; where a, b are prime numbers, what is LCM(p, q)?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "LCM(p, q) = a^3 * b^2.",
        "source_reference": "CBSE Standard Q",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "If two positive integers a and b are written as a = x^3y^2 and b = xy^3; where x, y are prime numbers, what is HCF(a, b)?",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "HCF(a, b) = x * y^2.",
        "source_reference": "NCERT Exemplar Q1",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Show that any positive odd integer is of the form 4q + 1 or 4q + 3, where q is some integer.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Let a be an odd integer, b = 4. a = 4q + r with 0 <= r < 4. For odd a, r cannot be 0 or 2. Thus a = 4q + 1 or 4q + 3.",
        "source_reference": "NCERT Example 3",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "If a and b are two positive integers such that a = bq + r, what is the condition on r?",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "0 < r <= b",
            "B": "0 <= r < b",
            "C": "0 <= r <= b",
            "D": "r > b",
        },
        "correct_answer": "B",
        "source_reference": "NCERT Core Definition",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Find the HCF of 867 and 255 using Euclid's division algorithm.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "867 = 255 * 3 + 102; 255 = 102 * 2 + 51; 102 = 51 * 2 + 0. HCF = 51.",
        "source_reference": "NCERT Ex 1.1 Q1(iii)",
    },
    {
        "topic_name": "Euclid's Division Lemma",
        "question_text": "Find the HCF of 196 and 38220 using Euclid's division algorithm.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "38220 = 196 * 195 + 0. HCF is 196.",
        "source_reference": "NCERT Ex 1.1 Q1(ii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Express 140 as a product of its prime factors.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "140 = 2 * 70 = 2 * 2 * 35 = 2^2 * 5 * 7.",
        "source_reference": "NCERT Ex 1.2 Q1(i)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Express 156 as a product of its prime factors.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "156 = 2 * 78 = 2 * 2 * 39 = 2^2 * 3 * 13.",
        "source_reference": "NCERT Ex 1.2 Q1(ii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Express 3825 as a product of its prime factors.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "3825 = 3^2 * 5^2 * 17.",
        "source_reference": "NCERT Ex 1.2 Q1(iii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Express 5005 as a product of its prime factors.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "5005 = 5 * 7 * 11 * 13.",
        "source_reference": "NCERT Ex 1.2 Q1(iv)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Express 7429 as a product of its prime factors.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "7429 = 17 * 19 * 23.",
        "source_reference": "NCERT Ex 1.2 Q1(v)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 26 and 91 and verify that LCM × HCF = product of the two numbers.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "26 = 2 * 13, 91 = 7 * 13. HCF = 13, LCM = 2 * 7 * 13 = 182. LCM * HCF = 182 * 13 = 2366. Product = 26 * 91 = 2366.",
        "source_reference": "NCERT Ex 1.2 Q2(i)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 510 and 92 and verify that LCM × HCF = product of the two numbers.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "510 = 2 * 3 * 5 * 17; 92 = 2^2 * 23. HCF = 2, LCM = 2^2 * 3 * 5 * 17 * 23 = 23460. LCM * HCF = 46920. 510 * 92 = 46920.",
        "source_reference": "NCERT Ex 1.2 Q2(ii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 336 and 54 and verify that LCM × HCF = product of the two numbers.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "336 = 2^4 * 3 * 7; 54 = 2 * 3^3. HCF = 2 * 3 = 6. LCM = 2^4 * 3^3 * 7 = 3024. 3024 * 6 = 18144. 336 * 54 = 18144.",
        "source_reference": "NCERT Ex 1.2 Q2(iii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 12, 15 and 21 by applying the prime factorisation method.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "12 = 2^2 * 3; 15 = 3 * 5; 21 = 3 * 7. HCF = 3. LCM = 2^2 * 3 * 5 * 7 = 420.",
        "source_reference": "NCERT Ex 1.2 Q3(i)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 17, 23 and 29 by applying the prime factorisation method.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "All three are prime numbers. HCF = 1. LCM = 17 * 23 * 29 = 11339.",
        "source_reference": "NCERT Ex 1.2 Q3(ii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Find the LCM and HCF of 8, 9 and 25 by applying the prime factorisation method.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "8 = 2^3; 9 = 3^2; 25 = 5^2. HCF = 1. LCM = 8 * 9 * 25 = 1800.",
        "source_reference": "NCERT Ex 1.2 Q3(iii)",
    },
    {
        "topic_name": "Fundamental Theorem of Arithmetic",
        "question_text": "Given that HCF (306, 657) = 9, find LCM (306, 657).",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "LCM = (306 * 657) / HCF = (306 * 657) / 9 = 34 * 657 = 22338.",
        "source_reference": "NCERT Ex 1.2 Q4",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "Prove that √5 is an irrational number.",
        "question_type": QuestionType.LONG_ANSWER,
        "marks": 5,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Assume √5 = a/b where a, b are coprime. 5 = a^2/b^2 => a^2 = 5b^2, so 5 divides a^2 and hence a. Let a = 5c, then 25c^2 = 5b^2 => b^2 = 5c^2, so 5 divides b. Contradicts coprimality.",
        "source_reference": "NCERT Ex 1.3 Q1",
    },
    {
        "topic_name": "Irrational Numbers",
        "question_text": "State whether true or false: The sum of a rational number and an irrational number is irrational.",
        "question_type": QuestionType.MCQ,
        "marks": 1,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": {
            "A": "True",
            "B": "False",
            "C": "Sometimes true",
            "D": "Cannot be determined",
        },
        "correct_answer": "A",
        "source_reference": "NCERT Core Theorem",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "State whether 17/8 will have a terminating decimal expansion or a non-terminating repeating decimal expansion.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Denominator 8 = 2^3 = 2^3 * 5^0, which is of the form 2^n * 5^m. Hence it is terminating.",
        "source_reference": "NCERT Ex 1.4 Q1(ii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "State whether 64/455 will have a terminating decimal expansion or a non-terminating repeating decimal expansion.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Denominator 455 = 5 * 7 * 13. Since factors other than 2 and 5 exist, it has a non-terminating repeating expansion.",
        "source_reference": "NCERT Ex 1.4 Q1(iii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "State whether 15/1600 will have a terminating decimal expansion or a non-terminating repeating decimal expansion.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "15/1600 = 3/320. Denominator 320 = 2^6 * 5^1, of the form 2^n * 5^m. Hence terminating.",
        "source_reference": "NCERT Ex 1.4 Q1(iv)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "State whether 29/343 will have a terminating decimal expansion or a non-terminating repeating decimal expansion.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Denominator 343 = 7^3. Not of form 2^n * 5^m. Hence non-terminating repeating.",
        "source_reference": "NCERT Ex 1.4 Q1(v)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "State whether 129 / (2^2 × 5^7 × 7^5) will have a terminating decimal expansion.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Contains 7^5 in denominator. Hence non-terminating repeating.",
        "source_reference": "NCERT Ex 1.4 Q1(vii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write down the decimal expansion of 17/8 without actual long division.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "17/8 = (17 * 5^3)/(2^3 * 5^3) = (17 * 125)/1000 = 2125/1000 = 2.125.",
        "source_reference": "NCERT Ex 1.4 Q2(ii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write down the decimal expansion of 15/1600 without long division.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "3/320 = (3 * 5^5)/(2^6 * 5^6) = (3 * 3125)/10^6 = 9375/1000000 = 0.009375.",
        "source_reference": "NCERT Ex 1.4 Q2(iv)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write down the decimal expansion of 6/15 without long division.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "6/15 = 2/5 = (2 * 2)/(5 * 2) = 4/10 = 0.4.",
        "source_reference": "NCERT Ex 1.4 Q2(viii)",
    },
    {
        "topic_name": "Decimal Expansions of Rational Numbers",
        "question_text": "Write down the decimal expansion of 35/50 without long division.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "35/50 = 7/10 = 0.7.",
        "source_reference": "NCERT Ex 1.4 Q2(ix)",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "If HCF(a, b) = 12 and a × b = 1800, find LCM(a, b).",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 2,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "LCM = (a * b) / HCF = 1800 / 12 = 150.",
        "source_reference": "Formula Verification",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "The HCF of two numbers is 23 and their LCM is 1449. If one of the numbers is 161, find the other number.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "Other number = (HCF * LCM) / 161 = (23 * 1449) / 161 = 1449 / 7 = 207.",
        "source_reference": "Basic Application",
    },
    {
        "topic_name": "HCF and LCM Applications",
        "question_text": "Find the greatest number which can divide 285 and 1249 leaving remainders 9 and 7 respectively.",
        "question_type": QuestionType.SHORT_ANSWER,
        "marks": 3,
        "difficulty": Difficulty.EASY,
        "learner_level": LearnerLevel.BEGINNER,
        "options": None,
        "correct_answer": "285 - 9 = 276; 1249 - 7 = 1242. HCF(276, 1242) = 138.",
        "source_reference": "Exemplar Simple",
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
