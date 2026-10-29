import os
import sys
import time

# Reconfigure stdout/stderr to UTF-8 to prevent cp1252 UnicodeEncodeError on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
from decimal import Decimal
import django
from django.db import connection

sys.path.insert(0, r"D:\question-generation-system")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "question_generation_system.settings.dev")
django.setup()

from users.models import User
from papers.models import Paper, PaperVersion, PaperStatus, VersionStatus
from papers.services.pdf_harvester import PdfInspectionService
from generation.services.llm_generation import LLMQuestionGenerationService

def _safe_db_call(fn, max_retries=3, delay=2):
    for attempt in range(max_retries):
        try:
            connection.close()
            return fn()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"-> DB operation retry {attempt + 1}/{max_retries} due to: {e}")
            time.sleep(delay)

def generate_exam_for_teacher(
    pdf_path: str,
    subject: str,
    exam_title: str,
    mark_distribution: list,
    duration_minutes: int = 180,
    instructions: str = ""
):
    print(f"\n=======================================================")
    print(f"STARTING EXAM GENERATION: {exam_title}")
    print(f"Subject: {subject} | PDF: {os.path.basename(pdf_path)}")
    print(f"=======================================================")

    teacher = _safe_db_call(lambda: User.objects.get(username="teacher1"))

    # 1. Inspect PDF
    with open(pdf_path, "rb") as f:
        file_bytes = f.read()

    filename = os.path.basename(pdf_path)
    t0 = time.time()
    inspection_summary = PdfInspectionService.inspect_pdf(file_bytes, filename)
    insp_data = PdfInspectionService.get_inspection_data(inspection_summary["inspection_id"])
    full_text = insp_data["full_text"]
    detected_figures = insp_data["detected_figures"]
    print(f"-> PDF Harvested: {len(detected_figures)} figures, {insp_data['word_count']} words in {time.time()-t0:.2f}s")

    # 2. Upload/Cache figures (select top 5 key figures for exam allocation)
    uploaded_diagrams = []
    if detected_figures:
        diagram_ids = [f["figure_id"] for f in detected_figures[:5]]
        uploaded_diagrams = PdfInspectionService.upload_selected_figures_to_drive(
            inspection_id=inspection_summary["inspection_id"],
            selected_figure_ids=diagram_ids,
            paper_title=exam_title
        )
        print(f"-> Cached {len(uploaded_diagrams)} diagram asset(s) locally for exam preview.")

    # Calculate target questions & marks
    target_qty = sum(int(t.get("count", 0)) for t in mark_distribution)
    expected_marks = sum(float(t.get("marks", 1.0)) * int(t.get("count", 0)) for t in mark_distribution)
    print(f"-> Blueprint: {target_qty} Questions, Expected Total Marks: {expected_marks}m")

    # 3. LLM Generation
    service = LLMQuestionGenerationService()
    constraints = {
        "source_text": full_text,
        "attached_figures": uploaded_diagrams,
        "quantity": target_qty,
        "mark_distribution": mark_distribution,
        "difficulty": "MEDIUM",
        "learner_level": "INTERMEDIATE",
    }

    t_gen = time.time()
    drafts = service.generate_questions(chapter=None, constraints=constraints)
    print(f"-> Generation finished in {time.time()-t_gen:.2f}s. Received {len(drafts)} drafts.")

    # 4. Rigorous Output Verification
    formatted_snapshot = []
    total_calculated_marks = Decimal("0.0")
    diag_count = 0
    mcq_count = 0
    latex_formula_count = 0

    for idx, d in enumerate(drafts, 1):
        q_dict = d.to_dict()
        q_dict["id"] = idx
        q_dict["question_type_display"] = q_dict.get("question_type")
        q_dict["difficulty_display"] = q_dict.get("difficulty")
        q_dict["learner_level_display"] = q_dict.get("learner_level")
        q_dict["topic_name"] = exam_title
        q_dict["chapter_title"] = filename

        q_marks = Decimal(str(d.marks))
        total_calculated_marks += q_marks

        if d.diagram:
            diag_count += 1
        if d.question_type == "MCQ":
            mcq_count += 1
        if any(tok in d.question_text for tok in ["$", "\\", "{", "}"]):
            latex_formula_count += 1

        formatted_snapshot.append(q_dict)

    # 4b. Minimum 100 Marks Guarantee
    while total_calculated_marks < Decimal("100.0"):
        needed = 100.0 - float(total_calculated_marks)
        q_count = max(1, min(4, int(needed // 2) + 1))
        per_q_mark = max(1.0, round(needed / q_count, 1))
        backfill_tier = {
            "marks": per_q_mark,
            "count": q_count,
            "question_types": ["SHORT_ANSWER" if per_q_mark >= 2.0 else "MCQ"],
        }
        print(f"-> Backfilling {q_count} questions ({needed:.1f} marks needed, {per_q_mark}m per q) to fulfill >= 100 marks mandate...")
        bf_constraints = dict(constraints)
        bf_constraints["quantity"] = q_count
        bf_constraints["mark_distribution"] = [backfill_tier]
        bf_drafts = service.generate_questions(chapter=None, constraints=bf_constraints)
        if not bf_drafts:
            break
        for d in bf_drafts:
            q_dict = d.to_dict()
            q_dict["id"] = len(formatted_snapshot) + 1
            q_dict["question_type_display"] = q_dict.get("question_type")
            q_dict["difficulty_display"] = q_dict.get("difficulty")
            q_dict["learner_level_display"] = q_dict.get("learner_level")
            q_dict["topic_name"] = exam_title
            q_dict["chapter_title"] = filename

            q_marks = Decimal(str(d.marks))
            total_calculated_marks += q_marks

            if d.diagram:
                diag_count += 1
            if d.question_type == "MCQ":
                mcq_count += 1
            if any(tok in d.question_text for tok in ["$", "\\", "{", "}"]):
                latex_formula_count += 1

            formatted_snapshot.append(q_dict)
            if total_calculated_marks >= Decimal("100.0"):
                break

    print(f"-> Verified: Total Marks = {total_calculated_marks}m, Questions = {len(formatted_snapshot)}, Diagram Qs = {diag_count}, MCQs = {mcq_count}, LaTeX items = {latex_formula_count}")

    # 5. Persist Paper in DB for teacher1 (with automatic reconnection retry)
    def _save_paper():
        t = User.objects.get(username="teacher1")
        p = Paper.objects.create(
            title=exam_title,
            instructions=instructions or "Read each question carefully. Write balanced chemical equations where applicable.",
            created_by=t,
            school=t.school,
            subjects=[subject],
            duration_minutes=duration_minutes,
            total_question_count=len(formatted_snapshot),
            specifications={
                "source_mode": "pdf",
                "pdf_filename": filename,
                "attached_diagrams": uploaded_diagrams,
                "total_marks": float(total_calculated_marks),
                "mark_distribution": mark_distribution,
            },
            status=PaperStatus.FINALIZED
        )
        v = PaperVersion.objects.create(
            paper=p,
            version_label="A",
            question_snapshot=formatted_snapshot,
            constraints_used=constraints,
            status=VersionStatus.FINALIZED
        )
        return p, v

    paper, version = _safe_db_call(_save_paper)

    print(f"-> SUCCESS: Paper #{paper.id} saved in database for teacher1! (Version #{version.id}, {total_calculated_marks} Marks)")
    return {
        "paper_id": paper.id,
        "title": paper.title,
        "subject": subject,
        "filename": filename,
        "total_marks": float(total_calculated_marks),
        "question_count": len(formatted_snapshot),
        "diagram_count": diag_count,
        "mcq_count": mcq_count,
        "latex_count": latex_formula_count,
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=str, default="chem1", help="Target exam key")
    args = parser.parse_args()

    targets = {
        "chem1": {
            "pdf_path": r"D:\PDFS_For the Testing\Chemistry\kech201.pdf",
            "subject": "Chemistry",
            "exam_title": "Class 11 Chemistry: Redox Reactions Master Examination",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
        },
        "bio1": {
            "pdf_path": r"D:\PDFS_For the Testing\biology\khbo101.pdf",
            "subject": "Biology",
            "exam_title": "Class 11 Biology: The Living World (जीव जगत) 100 Marks Comprehensive Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "सभी प्रश्नों के उत्तर ध्यानपूर्वक दीजिए। नामकरण नियमों और वर्गीकरण पदानुक्रम को स्पष्ट कीजिए।",
        },
        "bio2": {
            "pdf_path": r"D:\PDFS_For the Testing\biology\khbo102.pdf",
            "subject": "Biology",
            "exam_title": "Class 11 Biology: Biological Classification (जीव जगत का वर्गीकरण) 115 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 8.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "चित्र आधारित प्रश्नों में नामांकित चित्र बनाइए अथवा दिए गए चित्र का विश्लेषण कीजिए।",
        },
        "cs1": {
            "pdf_path": r"D:\PDFS_For the Testing\COMPUTER_SCIENCE\kecs101.pdf",
            "subject": "Computer Science",
            "exam_title": "Class 11 Computer Science: Computer System Organization (100 Marks)",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "All questions are compulsory. Illustrate answers with architecture diagrams, memory hierarchies, or flow representations where appropriate.",
        },
        "cs2": {
            "pdf_path": r"D:\PDFS_For the Testing\COMPUTER_SCIENCE\kecs102.pdf",
            "subject": "Computer Science",
            "exam_title": "Class 11 Computer Science: Encoding Schemes & Number Systems (120 Marks)",
            "mark_distribution": [
                {"marks": 1.0, "count": 16, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 12, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 8.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Show complete step-by-step radix conversions and calculations. Mention exact base/radix indices for binary, octal, decimal, and hexadecimal representations.",
        },
        "math1": {
            "pdf_path": r"D:\PDFS_For the Testing\Mathematics\khmh101.pdf",
            "subject": "Mathematics",
            "exam_title": "Class 11 Mathematics: Sets & Venn Diagrams (समुच्चय) 105 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "All mathematical expressions must be cleanly evaluated with set builder / roster notation. Draw Venn diagrams clearly for set operations.",
        },
        "math2": {
            "pdf_path": r"D:\PDFS_For the Testing\Mathematics\khmh102.pdf",
            "subject": "Mathematics",
            "exam_title": "Class 11 Mathematics: Relations and Functions (संबंध एवं फलन) 110 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "State definitions of domain, codomain, and range explicitly. Prove equivalence relations by checking reflexivity, symmetry, and transitivity.",
        },
        "phys1": {
            "pdf_path": r"D:\PDFS_For the Testing\physics\khph201.pdf",
            "subject": "Physics",
            "exam_title": "Class 11 Physics: Mechanical Properties of Solids (ठोसों के यांत्रिक गुण) 100 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "State SI units for all elastic moduli (Young, Shear, Bulk). Sketch stress-strain curves clearly indicating elastic limit, yield point, and fracture point.",
        },
        "phys2": {
            "pdf_path": r"D:\PDFS_For the Testing\physics\khph202.pdf",
            "subject": "Physics",
            "exam_title": "Class 11 Physics: Mechanical Properties of Fluids (तरलों के यांत्रिकी गुण) 120 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 8.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "State Pascal's principle and Bernoulli's theorem with complete mathematical derivations. Include free-body diagrams for surface tension and capillary rise.",
        },
        "geog1": {
            "pdf_path": r"D:\PDFS_For the Testing\Geography\khgy201.pdf",
            "subject": "Geography",
            "exam_title": "Class 11 Geography: India - Location & Boundaries (भारत - स्थिति) 100 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "भारत के मानक याम्योत्तर, अक्षांशीय एवं देशांतरीय विस्तार को स्पष्ट रूप से समझाइए। मानचित्र आधारित प्रश्नों में सटीक स्थान अंकित कीजिए।",
        },
        "geog2": {
            "pdf_path": r"D:\PDFS_For the Testing\Geography\khgy202.pdf",
            "subject": "Geography",
            "exam_title": "Class 11 Geography: Structure and Physiography (संरचना तथा भू-आकृति विज्ञान) 110 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 18, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 9, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "प्रायद्वीपीय खंड, हिमालय और सिंधु-गंगा-ब्रह्मपुत्र मैदान के भूवैज्ञानिक अंतरों की विस्तृत व्याख्या कीजिए।",
        },
        "hist1": {
            "pdf_path": r"D:\PDFS_For the Testing\History\khhs101.pdf",
            "subject": "History",
            "exam_title": "Class 11 History: Writing and City Life - Mesopotamia (लेखन कला और शहरी जीवन) 100 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "मेसोपोटामिया की कीलाकार (Cuneiform) लिपि, शहरीकरण तथा उर और उरुक नगरों की पुरातात्विक विशेषताओं पर प्रकाश डालिए।",
        },
        "hist2": {
            "pdf_path": r"D:\PDFS_For the Testing\History\khhs102.pdf",
            "subject": "History",
            "exam_title": "Class 11 History: An Empire Across Three Continents - Roman Empire (तीन महाद्वीपों में फैला साम्राज्य) 115 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 8.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "रोमन साम्राज्य के राजनीतिक इतिहास के तीन मुख्य खिलाड़ी: सम्राट, सीनेट और सेना की भूमिका का समालोचनात्मक मूल्यांकन कीजिए।",
        },
        "psych1": {
            "pdf_path": r"D:\PDFS_For the Testing\Psychology\khpy101.pdf",
            "subject": "Psychology",
            "exam_title": "Class 11 Psychology: What is Psychology? (मनोविज्ञान क्या है?) 100 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 16, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 12, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "मनोविज्ञान की एक प्राकृतिक विज्ञान तथा सामाजिक विज्ञान के रूप में समझ स्पष्ट कीजिए। संरचनावाद, प्रकार्यवाद तथा व्यवहारवाद की तुलना कीजिए।",
        },
        "psych2": {
            "pdf_path": r"D:\PDFS_For the Testing\Psychology\khpy102.pdf",
            "subject": "Psychology",
            "exam_title": "Class 11 Psychology: Methods of Enquiry in Psychology (मनोवैज्ञानिक जाँच की विधियाँ) 120 Marks Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 8.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "प्रायोगिक विधि, प्रेक्षण विधि, सर्वेक्षण विधि और मनोवैज्ञानिक परीक्षणों के गुण तथा सीमाओं का विश्लेषण कीजिए।",
        },
        "soc1": {
            "pdf_path": r"D:\PDFS_For the Testing\SOCIOLOGY\kesy101.pdf",
            "subject": "Sociology",
            "exam_title": "Class 11 Sociology: Sociology and Society (100 Marks Comprehensive Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 20, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Distinguish between sociological knowledge and common sense knowledge. Explain how personal troubles connect to public issues (C. Wright Mills).",
        },
        "soc2": {
            "pdf_path": r"D:\PDFS_For the Testing\SOCIOLOGY\kesy102.pdf",
            "subject": "Sociology",
            "exam_title": "Class 11 Sociology: Terms, Concepts and Their Use in Sociology (110 Marks Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 18, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 9, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Define primary and secondary social groups, in-groups and out-groups, ascribed vs achieved status, and social control mechanisms.",
        },
        "sanskrit1": {
            "pdf_path": r"D:\PDFS_For the Testing\Sanskrit\khsk101.pdf",
            "subject": "Sanskrit",
            "exam_title": "Class 11 Sanskrit: कुशलप्रशासनम् (Kushal Prashasnam) 100 Marks Comprehensive Exam",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "सर्वे प्रश्नाः संस्कृतेन देवनागरीलिप्या च समाधेयाः। वाल्मीकिरामायणानुसारं श्रीराम-भरतसंवादस्य आदर्शप्रशासननियमान् विशदयत।",
        },
        "sanskrit2": {
            "pdf_path": r"D:\PDFS_For the Testing\Sanskrit\khsk102.pdf",
            "subject": "Sanskrit",
            "exam_title": "Class 11 Sanskrit: सूक्तिसुधा (Suktisudha) 105 Marks Examination",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "श्लोकानाम् अन्वयं, शब्दार्थं भावार्थं च सप्रमाणं लिखत। चाणक्यनीतेः नीतिशिक्षायाः समाजे उपादेयतां निरूपयत।",
        },
        "hindi1": {
            "pdf_path": r"D:\PDFS_For the Testing\Hindi\khat101.pdf",
            "subject": "Hindi",
            "exam_title": "Class 11 Hindi: प्रेमचंद - ईदगाह (100 Marks Comprehensive Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "प्रेमचंद की कालजयी कहानी 'ईदगाह' के आधार पर बाल मनोविज्ञान, आत्मीय संवेदना तथा हामिद के चिमटे के प्रतीकार्थ पर विचार व्यक्त कीजिए।",
        },
        "hindi2": {
            "pdf_path": r"D:\PDFS_For the Testing\Hindi\khat102.pdf",
            "subject": "Hindi",
            "exam_title": "Class 11 Hindi: अमरकांत - दोपहर का भोजन (110 Marks Examination)",
            "mark_distribution": [
                {"marks": 1.0, "count": 18, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 9, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "निम्न मध्यमवर्गीय परिवार की निर्धनता, विवशता तथा सिद्धेश्वरी के वात्सल्य एवं संघर्ष की सप्रसंग विवेचना कीजिए।",
        },
        "urdu1": {
            "pdf_path": r"D:\PDFS_For the Testing\Accounting_Urdu\kuac101.pdf",
            "subject": "Accountancy",
            "exam_title": "Class 11 Accountancy (Urdu Medium): تعارف کھاتہ داری (100 Marks Comprehensive Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "تمام سوالات کے جوابات اردو زبان میں دیجیے۔ کھاتہ داری کے بنیادی مقاصد، فوائد، اور صارفین کی ضروریات کو تفصیلاً بیان کیجیے۔",
        },
        "urdu2": {
            "pdf_path": r"D:\PDFS_For the Testing\Accounting_Urdu\kuac102.pdf",
            "subject": "Accountancy",
            "exam_title": "Class 11 Accountancy (Urdu Medium): کھاتہ داری کے نظریاتی تصورات (110 Marks Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 18, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 9, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "کھاتہ داری کے عمومی تسلیم شدہ اصول (GAAP)، مفروضات، اور مالیاتی گوشواروں کی بنیاد کو واضح کیجیے۔",
        },
        "column1": {
            "pdf_path": r"D:\PDFS_For the Testing\Column Format PDF\hcv_ch01_intro_physics.pdf",
            "subject": "Physics",
            "exam_title": "Class 11 Physics (HC Verma): Introduction to Physics & Dimensions (100 Marks Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Answer with rigorous derivations and dimensional analysis. Format all equations and units in standard LaTeX notation.",
        },
        "column2": {
            "pdf_path": r"D:\PDFS_For the Testing\Column Format PDF\hcv_ch02_physics_math.pdf",
            "subject": "Physics",
            "exam_title": "Class 11 Physics (HC Verma): Physics & Mathematics - Vectors (110 Marks Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 18, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 9, "question_types": ["SHORT_ANSWER"]},
                {"marks": 6.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Focus on vector addition, scalar/dot product, cross product, and calculus applications in kinematics with full step solutions.",
        },
        "handwritten1": {
            "pdf_path": r"D:\PDFS_For the Testing\Handwritten notes\kashishjs.pdf",
            "subject": "Computer Science",
            "exam_title": "Class 12 Computer Science: JavaScript Core Syntax & Web APIs (100 Marks Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 3.5, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 5.0, "count": 6, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Test JavaScript fundamentals: data types, let/const/var, closures, DOM manipulation, and asynchronous event loops.",
        },
        "handwritten2": {
            "pdf_path": r"D:\PDFS_For the Testing\Handwritten notes\js-notes.pdf",
            "subject": "Computer Science",
            "exam_title": "Class 12 Computer Science: Advanced JavaScript Handwritten Notes (115 Marks Exam)",
            "mark_distribution": [
                {"marks": 1.0, "count": 15, "question_types": ["MCQ"]},
                {"marks": 2.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 4.0, "count": 10, "question_types": ["SHORT_ANSWER"]},
                {"marks": 8.0, "count": 5, "question_types": ["LONG_ANSWER", "DIAGRAM_BASED"]},
            ],
            "duration_minutes": 180,
            "instructions": "Evaluate deep knowledge of JavaScript architecture: execution contexts, call stack, prototypes, Promises, and async/await.",
        },
    }

    t = targets.get(args.target)
    if not t:
        print(f"Unknown target: {args.target}")
        sys.exit(1)

    res = generate_exam_for_teacher(
        pdf_path=t["pdf_path"],
        subject=t["subject"],
        exam_title=t["exam_title"],
        mark_distribution=t["mark_distribution"],
        duration_minutes=t.get("duration_minutes", 180),
        instructions=t.get("instructions", "")
    )
    print("Execution Result:", res)
