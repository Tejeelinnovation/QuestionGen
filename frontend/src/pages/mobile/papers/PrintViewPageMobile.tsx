import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { PaperPrintData } from '../../../types';
import { Printer, ChevronLeft, FileText, Download } from 'lucide-react';
import { PrintablePaperSheet } from '../../../components/papers/PrintablePaperSheet';

export const PrintViewPageMobile: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);

  const [printData, setPrintData] = useState<PaperPrintData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Blank line configuration
  const [linesPerMark, setLinesPerMark] = useState<number>(2);
  const [questionLineOverrides, setQuestionLineOverrides] = useState<Record<number, number>>({});
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingKey, setIsExportingKey] = useState(false);

  useEffect(() => {
    const loadPrintData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await papersApi.getPrintLayout(paperId, vId);
        setPrintData(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load printable test sheet.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId && vId) {
      loadPrintData();
    }
  }, [paperId, vId]);

  const handleExportDocx = async (target: 'paper' | 'answer-key' = 'paper') => {
    try {
      if (target === 'answer-key') setIsExportingKey(true);
      else setIsExportingDocx(true);

      await papersApi.exportDocx(paperId, vId, {
        target,
        linesPerMark,
        overrides: questionLineOverrides,
      });
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to generate Microsoft Word (.docx) file.');
    } finally {
      setIsExportingDocx(false);
      setIsExportingKey(false);
    }
  };

  const handleOverrideChange = (questionId: number, lines: number) => {
    setQuestionLineOverrides((prev) => ({
      ...prev,
      [questionId]: lines,
    }));
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-xs text-ink/60 font-body">
        Loading printable examination sheet...
      </div>
    );
  }

  if (errorMessage || !printData) {
    return (
      <div className="space-y-4 font-body">
        <Link
          to={`/papers/${paperId}/versions/${vId}`}
          className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-forest hover:underline"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage || 'Print data not available.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body pb-12">
      {/* ── Mobile Non-Printed Control Bar (print:hidden) ── */}
      <div className="print:hidden space-y-3">
        {/* Top Action Row */}
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/papers/${paperId}/versions/${vId}`}
            className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-forest hover:underline min-h-[40px] px-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Version Detail</span>
          </Link>

          <button
            type="button"
            id="mobile-trigger-print-btn"
            onClick={() => window.print()}
            className="py-2 px-3.5 rounded-pill bg-ink text-white font-heading font-semibold text-xs active:scale-95 transition-all flex items-center gap-1.5 shadow-sm min-h-[40px] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
        </div>

        {/* Word (.docx) & Answer Key Export Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleExportDocx('paper')}
            disabled={isExportingDocx}
            id="mobile-export-docx-btn"
            className="py-2 px-3 rounded-card border border-indigo-200 bg-indigo-50 text-indigo-700 active:scale-95 transition-all text-xs font-heading font-semibold flex items-center justify-center gap-1.5 min-h-[42px] disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="truncate">{isExportingDocx ? 'Generating...' : 'Word (.docx)'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportDocx('answer-key')}
            disabled={isExportingKey}
            id="mobile-export-key-docx-btn"
            className="py-2 px-3 rounded-card border border-emerald-200 bg-emerald-50 text-emerald-700 active:scale-95 transition-all text-xs font-heading font-semibold flex items-center justify-center gap-1.5 min-h-[42px] disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{isExportingKey ? 'Generating...' : 'Answer Key'}</span>
          </button>
        </div>

        {/* Universal Answer Lines Selector */}
        <div className="p-3 rounded-card bg-surface border border-border text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-ink text-xs">
              Universal Answer Lines:
            </span>
            {Object.keys(questionLineOverrides).length > 0 && (
              <button
                type="button"
                onClick={() => setQuestionLineOverrides({})}
                className="text-[11px] text-forest underline font-medium cursor-pointer"
              >
                Clear {Object.keys(questionLineOverrides).length} override{Object.keys(questionLineOverrides).length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-6 gap-1 bg-surface-muted/50 p-1 rounded-card border border-border/60">
            {[0, 1, 2, 3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setLinesPerMark(count)}
                className={`py-1.5 text-center text-xs font-medium rounded transition-colors cursor-pointer ${
                  linesPerMark === count
                    ? 'bg-ink text-white font-bold shadow-xs'
                    : 'text-ink/70 hover:bg-surface'
                }`}
              >
                {count === 0 ? '0' : `${count}/m`}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-ink/50 leading-tight">
            Sets lines per mark for written questions. Tap &quot;+&quot; or &quot;−&quot; on any question card below to customize individually.
          </p>
        </div>
      </div>

      {/* ── Formal Printable Examination Paper (Identical across all devices) ── */}
      <PrintablePaperSheet
        printData={printData}
        linesPerMark={linesPerMark}
        questionLineOverrides={questionLineOverrides}
        onOverrideChange={handleOverrideChange}
        interactive={true}
      />
    </div>
  );
};
