"""
Management command: seed_bulk_data

High-performance bulk data generator for load testing and benchmark evaluations.
Generates thousands of realistic questions, topics, chapters, books, and student users
using Django's batch `bulk_create`.

Usage:
    # Generate 1,000 questions and 100 students (defaults)
    python manage.py seed_bulk_data

    # Custom scale (e.g., 2,500 questions, 200 students)
    python manage.py seed_bulk_data --questions 2500 --students 200

    # Wipe only the bulk-generated data
    python manage.py seed_bulk_data --clear
"""

import random
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth.hashers import make_password
from django.db import transaction

from content.models import (
    Book,
    Chapter,
    Topic,
    Question,
    QuestionType,
    Difficulty,
    LearnerLevel,
    BankSource,
    ValidationStatus,
)
from schools.models import School, ClassSection
from users.models import User, Capability, CapabilityName, UserCapability


# ---------------------------------------------------------------------------
# Curriculum blueprint for realistic bulk generation
# ---------------------------------------------------------------------------
CURRICULUM = [
    {
        "book": {"title": "Mathematics for Class 10 (NCERT)", "subject": "Mathematics", "grade": "Class 10", "board": "CBSE"},
        "chapters": [
            {
                "title": "Polynomials",
                "topics": ["Geometrical Meaning of Zeroes", "Relationship Between Zeroes and Coefficients", "Division Algorithm for Polynomials"],
            },
            {
                "title": "Pair of Linear Equations in Two Variables",
                "topics": ["Graphical Method of Solution", "Substitution Method", "Elimination Method", "Cross-Multiplication Method"],
            },
            {
                "title": "Quadratic Equations",
                "topics": ["Standard Form of Quadratic Equations", "Solution by Factorisation", "Nature of Roots and Discriminant"],
            },
            {
                "title": "Arithmetic Progressions",
                "topics": ["nth Term of an AP", "Sum of First n Terms of an AP", "Applications in Daily Life"],
            },
            {
                "title": "Triangles & Coordinate Geometry",
                "topics": ["Similarity of Triangles", "Pythagoras Theorem", "Distance Formula", "Section Formula"],
            },
            {
                "title": "Introduction to Trigonometry",
                "topics": ["Trigonometric Ratios", "Trigonometric Ratios of Specific Angles", "Trigonometric Identities"],
            },
            {
                "title": "Statistics & Probability",
                "topics": ["Mean of Grouped Data", "Mode and Median", "Classical Definition of Probability"],
            },
        ],
    },
    {
        "book": {"title": "Science for Class 10 (NCERT)", "subject": "Science", "grade": "Class 10", "board": "CBSE"},
        "chapters": [
            {
                "title": "Chemical Reactions and Equations",
                "topics": ["Writing Chemical Equations", "Types of Chemical Reactions", "Corrosion and Rancidity"],
            },
            {
                "title": "Acids, Bases and Salts",
                "topics": ["Chemical Properties of Acids and Bases", "pH Scale and Importance", "Salts and Bleaching Powder"],
            },
            {
                "title": "Metals and Non-metals",
                "topics": ["Physical and Chemical Properties of Metals", "Reactivity Series", "Extraction of Metals"],
            },
            {
                "title": "Life Processes",
                "topics": ["Autotrophic and Heterotrophic Nutrition", "Respiration in Organisms", "Transportation in Humans", "Excretion in Humans"],
            },
            {
                "title": "Control and Coordination",
                "topics": ["Human Nervous System", "Reflex Action", "Plant Hormones", "Endocrine System"],
            },
            {
                "title": "Electricity & Magnetic Effects",
                "topics": ["Ohm's Law and Resistance", "Series and Parallel Combinations", "Heating Effect of Current", "Electromagnetic Induction"],
            },
        ],
    },
    {
        "book": {"title": "Physics for Class 11 (NCERT)", "subject": "Physics", "grade": "Class 11", "board": "CBSE"},
        "chapters": [
            {
                "title": "Units and Measurements",
                "topics": ["SI Units", "Dimensional Analysis", "Errors in Measurement"],
            },
            {
                "title": "Motion in a Straight Line and Plane",
                "topics": ["Position and Displacement", "Uniformly Accelerated Motion", "Vectors and Projectile Motion"],
            },
            {
                "title": "Laws of Motion",
                "topics": ["Newton's First and Second Laws", "Conservation of Momentum", "Friction and Circular Motion"],
            },
            {
                "title": "Work, Energy and Power",
                "topics": ["Work-Energy Theorem", "Conservative and Non-Conservative Forces", "Elastic and Inelastic Collisions"],
            },
        ],
    },
    {
        "book": {"title": "Chemistry for Class 11 (NCERT)", "subject": "Chemistry", "grade": "Class 11", "board": "CBSE"},
        "chapters": [
            {
                "title": "Structure of Atom",
                "topics": ["Bohr Model of Atom", "Quantum Mechanical Model", "Electronic Configuration of Atoms"],
            },
            {
                "title": "Chemical Bonding and Molecular Structure",
                "topics": ["Kossel-Lewis Approach", "VSEPR Theory", "Hybridisation and Molecular Orbital Theory"],
            },
            {
                "title": "Chemical Thermodynamics",
                "topics": ["First Law of Thermodynamics", "Enthalpy and Heat Capacity", "Second Law of Thermodynamics and Entropy"],
            },
        ],
    },
]

QUESTION_TEMPLATES = [
    {
        "type": QuestionType.MCQ,
        "marks": Decimal("1.00"),
        "templates": [
            ("Which of the following statements is correct regarding {topic}?", {"A": "Option A is the verified principle.", "B": "Option B is an incorrect hypothesis.", "C": "Option C violates conservation laws.", "D": "None of the above."}, "A"),
            ("What is the primary unit or property measured in the context of {topic}?", {"A": "Arbitrary coefficient", "B": "Standard SI base quantity", "C": "Relative dimensionless ratio", "D": "Vector field intensity"}, "B"),
            ("If the parameter in {topic} is doubled under constant conditions, what happens to the resultant?", {"A": "It remains unchanged.", "B": "It halves.", "C": "It doubles in magnitude.", "D": "It quadruples."}, "C"),
            ("In the study of {topic}, which factor does NOT directly alter the final outcome?", {"A": "Ambient ambient humidity", "B": "Catalytic initial state", "C": "Core boundary temperature", "D": "Equilibrium pressure"}, "A"),
            ("Which law or formula provides the quantitative foundation for {topic}?", {"A": "First fundamental principle", "B": "Empirical second relation", "C": "Inverse square formulation", "D": "Dimensionless constant theorem"}, "A"),
        ],
    },
    {
        "type": QuestionType.SHORT_ANSWER,
        "marks": Decimal("2.00"),
        "templates": [
            ("Define {topic} and state its primary significance in {chapter}.", "Definition stating the core premise and functional significance in practical problem-solving."),
            ("State two conditions under which {topic} holds strictly true.", "1. Isolated boundary condition. 2. Thermodynamic equilibrium."),
            ("Differentiate between key components involved in {topic}.", "Component A acts on the gradient, while Component B stabilizes the kinetic feedback."),
            ("A problem involves applying {topic} with standard initial values. Derive the immediate simplified relation.", "Direct formula derivation yielding the simplified expression."),
        ],
    },
    {
        "type": QuestionType.LONG_ANSWER,
        "marks": Decimal("5.00"),
        "templates": [
            ("Explain the concept of {topic} in detail. Provide theoretical derivations, assumptions made, and explain two practical real-world applications.", "Comprehensive solution covering assumptions, step-by-step derivation, and real-world industrial or natural examples."),
            ("With the help of a labeled conceptual diagram, describe the mechanism of {topic}. Analyze how errors affect accuracy.", "Full explanatory rubric: 1 mark for diagram, 3 marks for mechanistic breakdown, 1 mark for error analysis."),
            ("Discuss the evolution and mathematical formulation of {topic}. Solve a representative scenario where boundary conditions are non-zero.", "Comprehensive breakdown including mathematical proof and boundary case resolution."),
        ],
    },
]


class Command(BaseCommand):
    help = "Seed large-scale bulk curriculum, questions, and students for performance and load testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--questions",
            type=int,
            default=1000,
            help="Total number of bulk questions to generate (default: 1000).",
        )
        parser.add_argument(
            "--students",
            type=int,
            default=100,
            help="Total number of student accounts to generate (default: 100).",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Database bulk_create batch size (default: 500).",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear previously generated bulk questions and student users before running.",
        )

    def handle(self, *args, **options):
        total_questions_target = options["questions"]
        total_students_target = options["students"]
        batch_size = options["batch_size"]
        clear = options["clear"]

        self.stdout.write(self.style.NOTICE("=== Question Generation System: Bulk Data Seeder ==="))

        if clear:
            self.stdout.write("Clearing previous bulk test data...")
            deleted_q, _ = Question.objects.filter(source_reference="BULK_LOAD_TEST").delete()
            deleted_u, _ = User.objects.filter(username__startswith="bulk_student_").delete()
            self.stdout.write(self.style.SUCCESS(f"Deleted {deleted_q} bulk questions and {deleted_u} bulk students."))
            if total_questions_target == 0 and total_students_target == 0:
                return

        # -------------------------------------------------------------------
        # 1. Ensure Target School & Class Section Exist
        # -------------------------------------------------------------------
        school = School.objects.first()
        if not school:
            school = School.objects.create(
                name="Greenwood High School",
                config={"curriculum": "CBSE", "board": "NCERT"},
            )
            self.stdout.write(f"Created default school: {school.name}")

        section_10a, _ = ClassSection.objects.get_or_create(
            school=school,
            standard=10,
            section="A",
            defaults={"max_students": 500},
        )
        section_10b, _ = ClassSection.objects.get_or_create(
            school=school,
            standard=10,
            section="B",
            defaults={"max_students": 500},
        )

        # -------------------------------------------------------------------
        # 2. Build Curriculum Structure (Books -> Chapters -> Topics)
        # -------------------------------------------------------------------
        self.stdout.write("Provisioning curriculum structure (Books, Chapters, Topics)...")
        created_topics: list[Topic] = []

        with transaction.atomic():
            for book_def in CURRICULUM:
                book_meta = book_def["book"]
                book, _ = Book.objects.get_or_create(
                    title=book_meta["title"],
                    subject=book_meta["subject"],
                    grade=book_meta["grade"],
                    board=book_meta["board"],
                    defaults={"publisher": "NCERT", "is_active": True},
                )

                for order, chapter_def in enumerate(book_def["chapters"], start=1):
                    chapter, _ = Chapter.objects.get_or_create(
                        book=book,
                        chapter_order=order,
                        defaults={"title": chapter_def["title"]},
                    )
                    if chapter.title != chapter_def["title"]:
                        chapter.title = chapter_def["title"]
                        chapter.save(update_fields=["title"])

                    for topic_name in chapter_def["topics"]:
                        topic, _ = Topic.objects.get_or_create(
                            chapter=chapter,
                            name=topic_name,
                        )
                        created_topics.append(topic)

        self.stdout.write(self.style.SUCCESS(f"Curriculum ready with {len(created_topics)} topics across {Chapter.objects.count()} chapters."))

        # -------------------------------------------------------------------
        # 3. Fast Bulk Question Generation
        # -------------------------------------------------------------------
        self.stdout.write(f"Generating {total_questions_target} bulk questions across topics...")
        difficulties = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]
        learner_levels = [LearnerLevel.BEGINNER, LearnerLevel.INTERMEDIATE, LearnerLevel.ADVANCED]

        questions_to_create: list[Question] = []
        for i in range(1, total_questions_target + 1):
            topic = created_topics[i % len(created_topics)]
            chapter_title = topic.chapter.title

            # Pick template family
            template_group = random.choices(
                QUESTION_TEMPLATES,
                weights=[0.50, 0.30, 0.20],  # 50% MCQ, 30% Short Answer, 20% Long Answer
                k=1,
            )[0]

            tmpl_item = random.choice(template_group["templates"])
            q_type = template_group["type"]
            marks = template_group["marks"]

            if q_type == QuestionType.MCQ:
                q_text_fmt, options_dict, correct = tmpl_item
                options_val = options_dict
            else:
                q_text_fmt, correct = tmpl_item
                options_val = None

            q_text = f"[Q-{i:05d}] " + q_text_fmt.format(topic=topic.name, chapter=chapter_title)
            diff = random.choice(difficulties)
            learner = random.choice(learner_levels)

            questions_to_create.append(
                Question(
                    topic=topic,
                    question_text=q_text,
                    question_type=q_type,
                    marks=marks,
                    difficulty=diff,
                    learner_level=learner,
                    bank_source=BankSource.GLOBAL,
                    school=None,
                    created_by=None,
                    options=options_val,
                    correct_answer=correct,
                    explanation=f"Explanation for Q-{i:05d} concerning {topic.name}.",
                    source_reference="BULK_LOAD_TEST",
                    is_active=True,
                    validation_status=ValidationStatus.APPROVED,
                    revision=1,
                )
            )

            # Insert in chunks to optimize memory and DB connection
            if len(questions_to_create) >= batch_size:
                Question.objects.bulk_create(questions_to_create, batch_size=batch_size)
                self.stdout.write(f"  * Seeded {i}/{total_questions_target} questions...")
                questions_to_create = []

        if questions_to_create:
            Question.objects.bulk_create(questions_to_create, batch_size=batch_size)
            self.stdout.write(f"  * Seeded {total_questions_target}/{total_questions_target} questions...")

        self.stdout.write(self.style.SUCCESS(f"Successfully created {total_questions_target} questions in question bank!"))

        # -------------------------------------------------------------------
        # 4. Fast Bulk Student User Generation
        # -------------------------------------------------------------------
        if total_students_target > 0:
            self.stdout.write(f"Generating {total_students_target} student user accounts...")
            hashed_pw = make_password("password123")
            sections = [section_10a, section_10b]

            students_to_create: list[User] = []
            for i in range(1, total_students_target + 1):
                username = f"bulk_student_{i:03d}"
                sec = sections[i % len(sections)]
                students_to_create.append(
                    User(
                        username=username,
                        password=hashed_pw,
                        first_name="TestStudent",
                        last_name=f"{i:03d}",
                        email=f"{username}@greenwood.demo",
                        school=school,
                        role="Student",
                        class_section=sec,
                        gr_number=f"GR-BULK-{i:04d}",
                        roll_number=str(i),
                        mobile_number=f"+9198{i:08d}"[:13],
                        is_active=True,
                    )
                )

            # Bulk create users (ignore conflicts if already created)
            created_user_objs = User.objects.bulk_create(
                students_to_create,
                batch_size=batch_size,
                ignore_conflicts=True,
            )

            # Fetch capability objects for ATTEMPT_TEST and VIEW_OWN_RESULT
            attempt_cap = Capability.objects.filter(name=CapabilityName.ATTEMPT_TEST).first()
            view_result_cap = Capability.objects.filter(name=CapabilityName.VIEW_OWN_RESULT).first()

            if attempt_cap and view_result_cap:
                # Assign capabilities to all bulk students in one batch
                all_bulk_users = list(User.objects.filter(username__startswith="bulk_student_"))
                existing_grants = set(
                    UserCapability.objects.filter(user__in=all_bulk_users).values_list("user_id", "capability_id")
                )

                cap_grants: list[UserCapability] = []
                for student_user in all_bulk_users:
                    if (student_user.id, attempt_cap.id) not in existing_grants:
                        cap_grants.append(UserCapability(user=student_user, capability=attempt_cap))
                    if (student_user.id, view_result_cap.id) not in existing_grants:
                        cap_grants.append(UserCapability(user=student_user, capability=view_result_cap))

                if cap_grants:
                    UserCapability.objects.bulk_create(cap_grants, batch_size=batch_size)

            self.stdout.write(self.style.SUCCESS(f"Successfully created {total_students_target} student accounts (password: password123)!"))

        # -------------------------------------------------------------------
        # 5. Final Statistics Summary
        # -------------------------------------------------------------------
        self.stdout.write("\n=== UPDATED DATABASE TOTALS ===")
        self.stdout.write(f"Books: {Book.objects.count()}")
        self.stdout.write(f"Chapters: {Chapter.objects.count()}")
        self.stdout.write(f"Topics: {Topic.objects.count()}")
        self.stdout.write(f"Total Questions in Bank: {Question.objects.count()}")
        self.stdout.write(f"Total Users: {User.objects.count()}")
        self.stdout.write(self.style.SUCCESS("Bulk data generation complete! Ready for load testing."))
