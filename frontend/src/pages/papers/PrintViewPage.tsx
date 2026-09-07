import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import type { PaperPrintData } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { PrintViewPageTablet } from '../tablet/papers/PrintViewPageTablet';

export const PrintViewPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'tablet') {
    return <PrintViewPageTablet />;
  }

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
      <div className="max-w-4xl mx-auto py-12 text-center text-ink/60 font-body text-sm">
        Assembling high-contrast print layout...
      </div>
    );
  }

  if (errorMessage || !printData) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4 font-body">
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
    <div className="max-w-4xl mx-auto space-y-6 font-body">
      {/* ── NON-PRINTED CONTROL BAR (Ref 06: Document-forward framing, print:hidden) ── */}
      <div className="print:hidden bg-surface border border-border rounded-card p-4 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-forest" />
            <span className="font-heading font-bold text-sm text-ink">
              Official Examination Document
            </span>
            <span className="font-mono text-[11px] text-ink/50">
              • Version {printData.version_label}
            </span>
          </div>
          <p className="text-xs text-ink/60">
            Formatted with high-contrast document restraint for clean physical reproduction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/papers/${paperId}/versions/${vId}`}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-bg text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors"
          >
            ← Version Detail
          </Link>

          {/* Understated but clear print trigger */}
          <button
            onClick={handlePrint}
            id="trigger-print-btn"
            className="px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-ink text-white hover:bg-ink/90 transition-all shadow-sm cursor-pointer flex items-center gap-2"
          >
            <span>Print Sheet / Save PDF</span>
            <span>⎙</span>
          </button>
        </div>
      </div>

      {/* ── PRINTABLE SHEET: HIGH CONTRAST, FORMAL RESTRAINT (Ref 06) ── */}
      <div className="bg-white text-black border border-border print:border-none p-8 sm:p-12 rounded-card print:rounded-none print:p-0 shadow-card print:shadow-none space-y-8">
        
        {/* Formal Institutional Header */}
        <div className="border-b-2 border-black pb-5 text-center space-y-2.5">
          <div className="text-[11px] font-mono tracking-widest uppercase text-gray-600">
            Institutional Examination Paper
          </div>

          <h1 className="font-heading font-bold text-2xl sm:text-3xl tracking-tight text-black uppercase">
            {printData.title}
          </h1>

          <div className="flex flex-wrap justify-between items-center text-xs font-mono pt-3 border-t border-gray-300 font-semibold text-black">
            <span>VERSION: {printData.version_label}</span>
            <span>TOTAL QUESTIONS: {printData.question_count}</span>
            <span>MAXIMUM MARKS: {printData.total_marks}</span>
          </div>

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
        <div className="grid grid-cols-2 gap-4 text-xs font-mono border border-black p-3">
          <div className="space-y-2">
            <div>STUDENT NAME: _____________________________________</div>
            <div>ROLL / ADMISSION ID: ______________________________</div>
          </div>
          <div className="space-y-2 text-right">
            <div>EXAMINATION DATE: __________________</div>
            <div>INVIGILATOR SIGNATURE: _______________</div>
          </div>
        </div>

        {/* Questions Body */}
        <div className="space-y-8 pt-2">
          {printData.questions?.map((q, idx) => (
            <div key={q.question_id || idx} className="space-y-3 break-inside-avoid">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-sm font-medium leading-relaxed">
                  <span className="font-bold mr-1">{idx + 1}.</span>
                  {q.question_text}
                </div>
                <span className="font-mono font-bold text-xs shrink-0 whitespace-nowrap">
                  [{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]
                </span>
              </div>

              {/* MCQ Options Display */}
              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs pl-5 pt-1">
                  {Object.entries(q.options).map(([key, val]) => (
                    <div key={key} className="flex items-baseline gap-1.5">
                      <span className="font-bold font-mono">({key})</span>
                      <span>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Lined writing space for descriptive answers */}
              {q.question_type !== 'MCQ' && (
                <div className="pt-2 space-y-3 pl-5">
                  <div className="h-4 border-b border-dashed border-gray-300 w-full" />
                  <div className="h-4 border-b border-dashed border-gray-300 w-full" />
                  {q.question_type === 'LONG_ANSWER' && (
                    <>
                      <div className="h-4 border-b border-dashed border-gray-300 w-full" />
                      <div className="h-4 border-b border-dashed border-gray-300 w-full" />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* End of Examination Marker */}
        <div className="text-center font-mono text-[11px] text-gray-500 border-t border-black pt-6">
          *** END OF QUESTION PAPER • DO NOT WRITE BEYOND THIS LINE ***
        </div>
      </div>
    </div>
  );
};
