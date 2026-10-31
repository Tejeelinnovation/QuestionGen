export interface GroupedSectionQuestion {
  question_id?: number | string;
  question_text: string;
  question_type: string;
  marks: number;
  difficulty?: string;
  options?: Record<string, string>;
  diagram?: {
    image_url?: string;
    caption?: string;
    title?: string;
  };
  case_study_passage?: string;
  displayNum: number;
  [key: string]: any;
}

export interface GroupedExamSection {
  code: string;
  title: string;
  instructions: string;
  totalMarks: number;
  questions: GroupedSectionQuestion[];
}

export const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const isRtlText = (text?: string): boolean => !!text && RTL_REGEX.test(text);

export function groupVersionQuestionsIntoSections(rawQuestions?: any[]): GroupedExamSection[] {
  const raw = rawQuestions || [];
  if (!raw.length) return [];

  const mcq: typeof raw = [];
  const vsa: typeof raw = [];
  const sa: typeof raw = [];
  const la: typeof raw = [];

  raw.forEach((q) => {
    const marks = Number(q.marks || 1);
    const qType = String(q.question_type || '').toUpperCase();
    if (qType === 'MCQ' || (marks <= 1 && q.options && Object.keys(q.options).length > 0)) {
      mcq.push(q);
    } else if (marks <= 2 && qType !== 'LONG_ANSWER') {
      vsa.push(q);
    } else if (marks <= 3.5 && qType !== 'LONG_ANSWER') {
      sa.push(q);
    } else {
      la.push(q);
    }
  });

  const secCodes = ['A', 'B', 'C', 'D'];
  let codeIdx = 0;
  let runningQNum = 1;
  const result: GroupedExamSection[] = [];

  const addSection = (baseTitle: string, baseInst: string, items: typeof raw) => {
    if (!items.length) return;
    const code = secCodes[codeIdx++];
    const totalMarks = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);
    const itemsWithNum: GroupedSectionQuestion[] = items.map((item) => ({
      ...item,
      displayNum: runningQNum++,
    }));

    const distinctMarks = Array.from(new Set(items.map((i) => Number(i.marks || 1))));
    let titleWithMarks = baseTitle;
    let inst = baseInst;

    if (distinctMarks.length === 1) {
      const m = distinctMarks[0];
      const markLabel = m === 1 ? '1 Mark' : `${m} Marks`;
      titleWithMarks = `${baseTitle} (${markLabel} Each)`;
      inst = `Questions carry ${markLabel.toLowerCase()} each. ${baseInst}`;
    } else {
      inst = `Marks for each question are indicated against it. ${baseInst}`;
    }

    result.push({
      code,
      title: `Section ${code} — ${titleWithMarks}`,
      instructions: inst,
      totalMarks: Math.round(totalMarks * 10) / 10,
      questions: itemsWithNum,
    });
  };

  addSection('Multiple Choice Questions', 'Select the single best option.', mcq);
  addSection('Very Short Answer Questions', 'Answer concisely in 30–50 words with balanced equations or formulas where applicable.', vsa);
  addSection('Short Answer Questions', 'Answer in 50–80 words with step-by-step working and units.', sa);
  addSection('Long Answer & Analytical Questions', 'Provide detailed explanations, complete derivations, or diagrams.', la);

  if (result.length <= 1) {
    return [
      {
        code: 'A',
        title: 'All Examination Questions',
        instructions: 'Read all questions carefully before attempting.',
        totalMarks: raw.reduce((sum, item) => sum + Number(item.marks || 0), 0),
        questions: raw.map((item, idx) => ({ ...item, displayNum: idx + 1 })),
      },
    ];
  }

  return result;
}
