import type { QuestionPreview } from '../types';

export interface SectionQuestionItem {
  question: QuestionPreview;
  globalIndex: number; // 0-based index in the master questions array
  displayNumber: number; // 1-based sequential question number (Q1, Q2, Q3...)
  sectionIndex: number; // 1-based index within this section
}

export interface OrganizedPaperSection {
  id: string;
  letter: string; // 'A', 'B', 'C', 'D', 'E'
  title: string;
  formatSummary: string; // 'MCQ', 'Short Answer', etc.
  marksPerQuestion: number;
  totalMarks: number;
  questionCount: number;
  guideline: string;
  startIndex: number;
  endIndex: number;
  items: SectionQuestionItem[];
}

export function organizeQuestionsIntoSections(questions: QuestionPreview[]): OrganizedPaperSection[] {
  if (!questions || questions.length === 0) return [];

  // Group questions by marks ascending (1, 2, 3, 4, 5, etc.)
  const mapByMarks = new Map<number, Array<{ question: QuestionPreview; globalIndex: number }>>();

  questions.forEach((q, idx) => {
    const m = parseFloat(String(q.marks)) || 1;
    if (!mapByMarks.has(m)) {
      mapByMarks.set(m, []);
    }
    mapByMarks.get(m)!.push({ question: q, globalIndex: idx });
  });

  const sortedMarkTiers = Array.from(mapByMarks.keys()).sort((a, b) => a - b);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  let runningQuestionIndex = 0;

  return sortedMarkTiers.map((markVal, secIdx) => {
    const itemsWithIndex = mapByMarks.get(markVal) || [];
    const count = itemsWithIndex.length;
    const subtotal = markVal * count;
    const startQ = runningQuestionIndex + 1;
    const endQ = runningQuestionIndex + count;
    const letter = letters[secIdx % letters.length];

    // Detect format types in this section
    const types = new Set(itemsWithIndex.map((i) => String(i.question.question_type)));
    const hasMcq = types.has('MCQ') || types.has('MSQ');
    const hasFill = types.has('FILL_IN_THE_BLANKS') || types.has('FILL_IN_BLANKS') || types.has('ONE_WORD');
    const hasDiagram = types.has('DIAGRAM_BASED') || itemsWithIndex.some((i) => Boolean(i.question.diagram));

    let title = `Section ${letter}`;
    let formatSummary = 'Mixed Questions';
    let guideline = '';

    if (markVal === 1) {
      if (hasMcq && hasFill) {
        title = `Section ${letter} • Objective & Multiple Choice`;
        formatSummary = 'MCQ & Fill-in-Blanks';
        guideline = `Questions ${startQ} to ${endQ}. Each question carries 1 mark. Select or write the correct answer.`;
      } else if (hasMcq) {
        title = `Section ${letter} • Multiple Choice Questions`;
        formatSummary = 'MCQ (1 Mark)';
        guideline = `Questions ${startQ} to ${endQ}. Each question carries 1 mark. Select the single best option.`;
      } else {
        title = `Section ${letter} • Objective Questions (1 Mark)`;
        formatSummary = 'Objective (1 Mark)';
        guideline = `Questions ${startQ} to ${endQ}. Each question carries 1 mark.`;
      }
    } else if (markVal === 2) {
      title = `Section ${letter} • Short Answer Questions (2 Marks)`;
      formatSummary = 'Short Answer (2 Marks)';
      guideline = `Questions ${startQ} to ${endQ}. Each question carries 2 marks. Answer briefly in 30–50 words.`;
    } else if (markVal === 3) {
      title = `Section ${letter} • Analytical & Conceptual Questions (3 Marks)`;
      formatSummary = 'Short Answer (3 Marks)';
      guideline = `Questions ${startQ} to ${endQ}. Each question carries 3 marks. Answer with clear core reasoning (50–80 words).`;
    } else if (markVal === 4) {
      title = `Section ${letter} • Applied & Case-Based Questions (4 Marks)`;
      formatSummary = 'Applied (4 Marks)';
      guideline = `Questions ${startQ} to ${endQ}. Each question carries 4 marks. Provide clear explanatory steps.`;
    } else {
      title = `Section ${letter} • Long Answer & Descriptive Questions (${markVal} Marks)`;
      formatSummary = `Long Answer (${markVal} Marks)`;
      guideline = `Questions ${startQ} to ${endQ}. Each question carries ${markVal} marks. Provide a comprehensive answer with diagrams where applicable.`;
    }

    if (hasDiagram && !title.includes('Visual') && !title.includes('Diagram')) {
      title += ' (with Diagrams)';
    }

    const items: SectionQuestionItem[] = itemsWithIndex.map((item, itemIdx) => {
      const qNum = runningQuestionIndex + itemIdx + 1;
      return {
        question: item.question,
        globalIndex: item.globalIndex,
        displayNumber: qNum,
        sectionIndex: itemIdx + 1,
      };
    });

    runningQuestionIndex += count;

    return {
      id: `sec-${letter.toLowerCase()}`,
      letter,
      title,
      formatSummary,
      marksPerQuestion: markVal,
      totalMarks: subtotal,
      questionCount: count,
      guideline,
      startIndex: startQ,
      endIndex: endQ,
      items,
    };
  });
}
