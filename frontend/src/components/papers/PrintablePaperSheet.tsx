import React from 'react';
import type { PaperPrintData } from '../../types';

interface PrintablePaperSheetProps {
  printData: PaperPrintData;
  linesPerMark?: number;
  questionLineOverrides?: Record<number, number>;
  onOverrideChange?: (questionId: number, lines: number) => void;
  interactive?: boolean;
}

export const PrintablePaperSheet: React.FC<PrintablePaperSheetProps> = ({
  printData,
  linesPerMark = 2,
  questionLineOverrides = {},
  onOverrideChange,
  interactive = false,
}) => {
  const institutionName = printData.school_name
    ? printData.school_name.toUpperCase()
    : 'INSTITUTIONAL EXAMINATION PAPER';

  return (
    <div className="printable-paper-sheet bg-white text-black border border-border print:border-none p-6 sm:p-12 rounded-card print:rounded-none print:p-0 shadow-card print:shadow-none space-y-8 font-body">
      {/* Formal Institutional Header */}
      <div className="border-b-2 border-black pb-5 text-center space-y-2.5">
        <div className="text-xs sm:text-sm font-heading font-bold tracking-widest uppercase text-black">
          {institutionName}
        </div>

        <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight text-black uppercase">
          {printData.title}
        </h1>

        <div className="flex flex-wrap justify-between items-center text-xs font-mono pt-3 border-t border-gray-300 font-semibold text-black gap-2">
          <span>VERSION: {printData.version_label}</span>
          <span>TOTAL QUESTIONS: {printData.question_count}</span>
          {printData.duration_minutes ? (
            <span>TIME ALLOWED: {printData.duration_minutes} MIN</span>
          ) : null}
          <span>MAXIMUM MARKS: {printData.total_marks}</span>
        </div>

        {printData.subjects && printData.subjects.length > 0 && (
          <div className="text-xs font-mono font-medium text-black text-center pt-1">
            SUBJECTS: {printData.subjects.join(' • ')}
          </div>
        )}

        {printData.instructions && (
          <div className="pt-2 text-left text-xs italic text-gray-800 border-t border-dashed border-gray-300">
            <strong className="font-mono not-italic uppercase text-[10px] text-black">
              Candidate Instructions:
            </strong>{' '}
            {printData.instructions}
          </div>
        )}
      </div>

      {/* Candidate Identification Table */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono border border-black p-3.5 bg-white">
        <div className="space-y-2.5">
          <div className="flex items-center gap-1">
            <span className="shrink-0">STUDENT NAME:</span>
            <span className="flex-1 border-b border-black inline-block min-w-[120px]" />
          </div>
          <div className="flex items-center gap-1">
            <span className="shrink-0">ROLL / ADMISSION ID:</span>
            <span className="flex-1 border-b border-black inline-block min-w-[100px]" />
          </div>
        </div>
        <div className="space-y-2.5 sm:text-right">
          <div className="flex items-center sm:justify-end gap-1">
            <span className="shrink-0">EXAMINATION DATE:</span>
            <span className="border-b border-black inline-block w-36" />
          </div>
          <div className="flex items-center sm:justify-end gap-1">
            <span className="shrink-0">INVIGILATOR SIGNATURE:</span>
            <span className="border-b border-black inline-block w-32" />
          </div>
        </div>
      </div>

      {/* Questions Body */}
      <div className="space-y-8 pt-2">
        {printData.questions?.map((q, idx) => {
          const qId = q.question_id || idx + 1;
          const isOverridden = questionLineOverrides && qId in questionLineOverrides;
          const defaultLines =
            q.question_type === 'MCQ'
              ? 0
              : Math.max(0, Math.round(q.marks * (linesPerMark ?? 2)));
          const currentLines = isOverridden
            ? questionLineOverrides[qId]
            : defaultLines;

          return (
            <div key={q.question_id || idx} className="space-y-3 break-inside-avoid">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-sm font-medium leading-relaxed">
                  <span className="font-bold mr-1.5">{idx + 1}.</span>
                  {q.question_text}
                </div>
                <span className="font-mono font-bold text-xs shrink-0 whitespace-nowrap">
                  [{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]
                </span>
              </div>

              {/* MCQ Options Display */}
              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pl-5 pt-1">
                  {Object.entries(q.options).map(([key, val]) => (
                    <div key={key} className="flex items-baseline gap-1.5">
                      <span className="font-bold font-mono">({key})</span>
                      <span>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Lined writing space for answers */}
              {currentLines > 0 && (
                <div className="pt-2 space-y-3 pl-5">
                  {Array.from({ length: currentLines }).map((_, lIdx) => (
                    <div
                      key={lIdx}
                      className="h-4 border-b border-dashed border-gray-300 w-full"
                    />
                  ))}
                </div>
              )}

              {/* Interactive Per-Question Line Stepper (Non-printed) */}
              {interactive && onOverrideChange && (
                <div className="print:hidden flex flex-wrap items-center justify-between text-xs text-ink/60 bg-surface-muted/60 border border-border/80 rounded-card px-3 py-1.5 mt-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-medium text-[11px] text-ink/70">
                      Answer lines:
                    </span>
                    <div className="flex items-center border border-border rounded-pill overflow-hidden bg-surface shadow-xs">
                      <button
                        type="button"
                        onClick={() =>
                          onOverrideChange(qId, Math.max(0, currentLines - 1))
                        }
                        className="px-2.5 py-0.5 hover:bg-surface-muted text-ink font-bold text-xs cursor-pointer select-none"
                        title="Decrease lines"
                      >
                        −
                      </button>
                      <span className="px-2 py-0.5 font-mono text-[11px] font-semibold text-ink bg-surface border-x border-border min-w-[55px] text-center">
                        {currentLines} {currentLines === 1 ? 'line' : 'lines'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOverrideChange(qId, currentLines + 1)}
                        className="px-2.5 py-0.5 hover:bg-surface-muted text-ink font-bold text-xs cursor-pointer select-none"
                        title="Increase lines"
                      >
                        +
                      </button>
                    </div>

                    {isOverridden && (
                      <span className="text-[10px] bg-forest/10 text-forest font-semibold px-2 py-0.5 rounded-pill border border-forest/20">
                        Custom
                      </span>
                    )}
                  </div>

                  {isOverridden && (
                    <button
                      type="button"
                      onClick={() => onOverrideChange(qId, defaultLines)}
                      className="text-[11px] font-heading font-medium text-ink/50 hover:text-ink underline cursor-pointer"
                    >
                      Reset to default ({defaultLines})
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* End of Examination Marker */}
      <div className="text-center font-mono text-[11px] text-gray-500 border-t border-black pt-6">
        *** END OF QUESTION PAPER • DO NOT WRITE BEYOND THIS LINE ***
      </div>
    </div>
  );
};
