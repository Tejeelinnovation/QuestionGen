import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { PaperPrintData } from '../../../types';

export const PrintViewPageTablet: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);

  const [printData, setPrintData] = useState<PaperPrintData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadPrintData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await papersApi.getPrintLayout(paperId, vId);
        setPrintData(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to generate printable test layout from server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId && vId) {
      loadPrintData();
    }
  }, [paperId, vId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-ink/60 font-body text-sm">
        Generating print sheet for tablet preview...
      </div>
    );
  }

  if (errorMessage || !printData) {
    return (
      <div className="p-6 space-y-4 font-body">
        {errorMessage && (
          <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
            {errorMessage}
          </div>
        )}
        <Link
          to={`/papers/${paperId}/versions/${vId}`}
          className="text-xs font-heading font-semibold text-forest hover:underline"
        >
          ← Back to Version Detail
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-body pb-16">
      {/* ── Control Bar (print:hidden) ── */}
      <div className="print:hidden bg-surface border border-border rounded-card p-4 shadow-card flex items-center justify-between gap-4">
        <div>
          <div className="font-heading font-bold text-sm text-ink">
            Printable Sheet Preview • Tablet
          </div>
          <p className="text-xs text-ink/60">
            Formal document styling for proctored examinations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/papers/${paperId}/versions/${vId}`}
            className="px-4 py-2.5 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold hover:bg-surface-muted min-h-[44px] flex items-center"
          >
            ← Version Detail
          </Link>

          <button
            onClick={handlePrint}
            id="trigger-print-btn"
            className="px-5 py-2.5 rounded-pill bg-ink text-white text-xs font-heading font-semibold hover:bg-ink/90 active:scale-95 transition-all shadow-sm cursor-pointer min-h-[44px] flex items-center gap-2"
          >
            <span>Print Sheet / Save PDF</span>
            <span>⎙</span>
          </button>
        </div>
      </div>

      {/* ── Printable Formal Paper ── */}
      <div className="bg-white text-black border border-border print:border-none p-6 sm:p-10 rounded-card print:rounded-none print:p-0 shadow-card print:shadow-none space-y-6">
        <div className="border-b-2 border-black pb-4 text-center space-y-2">
          <div className="text-[10px] font-mono tracking-widest uppercase text-gray-600">
            Institutional Examination Paper
          </div>
          <h1 className="font-heading font-bold text-2xl text-black uppercase">
            {printData.title}
          </h1>
          <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-gray-300 font-semibold text-black">
            <span>VERSION: {printData.version_label}</span>
            <span>QUESTIONS: {printData.question_count}</span>
            <span>MAX MARKS: {printData.total_marks}</span>
          </div>
          {printData.instructions && (
            <p className="text-left text-xs italic text-gray-800 border-t border-dashed border-gray-300 pt-2">
              <strong className="font-mono uppercase text-[10px] not-italic text-black">Instructions:</strong> {printData.instructions}
            </p>
          )}
        </div>

        {/* Candidate table */}
        <div className="grid grid-cols-2 gap-3 text-xs font-mono border border-black p-3">
          <div>STUDENT NAME: _________________________________</div>
          <div className="text-right">ROLL NO / DATE: __________________</div>
        </div>

        {/* Questions */}
        <div className="space-y-6 pt-2">
          {printData.questions?.map((q, idx) => (
            <div key={q.question_id || idx} className="space-y-2 break-inside-avoid">
              <div className="flex justify-between items-baseline gap-2">
                <div className="text-sm font-medium">
                  <span className="font-bold mr-1">{idx + 1}.</span> {q.question_text}
                </div>
                <span className="font-mono font-bold text-xs shrink-0 whitespace-nowrap">
                  [{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]
                </span>
              </div>

              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs pl-4 pt-1">
                  {Object.entries(q.options).map(([key, val]) => (
                    <div key={key} className="flex items-baseline gap-1.5">
                      <span className="font-bold font-mono">({key})</span>
                      <span>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {q.question_type !== 'MCQ' && (
                <div className="pt-2 space-y-2.5 pl-4">
                  <div className="h-3 border-b border-dashed border-gray-300 w-full" />
                  <div className="h-3 border-b border-dashed border-gray-300 w-full" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center font-mono text-[10px] text-gray-500 border-t border-black pt-4">
          *** END OF QUESTION PAPER ***
        </div>
      </div>
    </div>
  );
};
