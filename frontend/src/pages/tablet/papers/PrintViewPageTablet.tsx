import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { PaperPrintData } from '../../../types';
import { FileText, Download, Printer } from 'lucide-react';
import { PrintablePaperSheet } from '../../../components/papers/PrintablePaperSheet';
import { Skeleton } from '../../../components/ui/skeleton';

export const PrintViewPageTablet: React.FC = () => {
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
      <div className="py-8 space-y-6 font-body" aria-hidden="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44" radius="sm" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" radius="pill" />
            <Skeleton className="h-9 w-28" radius="pill" />
          </div>
        </div>
        <div className="bg-surface border border-border rounded-card p-8 shadow-card space-y-6 min-h-[450px]">
          <div className="text-center space-y-2 pb-6 border-b border-border/70">
            <Skeleton className="h-7 w-2/3 mx-auto" radius="sm" />
            <Skeleton className="h-4 w-1/3 mx-auto" radius="sm" />
          </div>
          <div className="space-y-4 pt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full" radius="sm" />
                <Skeleton className="h-4 w-5/6" radius="sm" />
              </div>
            ))}
          </div>
        </div>
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
      <div className="print:hidden bg-surface border border-border rounded-card p-4 shadow-card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-forest" />
              <span className="font-heading font-bold text-sm text-ink">
                Printable Sheet Preview • Tablet
              </span>
              <span className="font-mono text-[11px] text-ink/50">
                • Version {printData.version_label}
              </span>
            </div>
            <p className="text-xs text-ink/60 mt-0.5">
              Configure blank lines and download editable Microsoft Word documents or print.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/papers/${paperId}/versions/${vId}`}
              className="px-3.5 py-2 rounded-pill border border-border bg-bg text-ink text-xs font-heading font-semibold hover:bg-surface-muted min-h-[40px] flex items-center"
            >
              ← Version Detail
            </Link>

            {/* Word (.docx) */}
            <button
              onClick={() => handleExportDocx('paper')}
              disabled={isExportingDocx}
              id="tablet-export-docx-btn"
              className="px-3.5 py-2 rounded-pill border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all text-xs font-heading font-semibold min-h-[40px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isExportingDocx ? 'Generating Word...' : 'Word (.docx)'}</span>
            </button>

            {/* Answer Key (.docx) */}
            <button
              onClick={() => handleExportDocx('answer-key')}
              disabled={isExportingKey}
              id="tablet-export-key-docx-btn"
              className="px-3.5 py-2 rounded-pill border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all text-xs font-heading font-semibold min-h-[40px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isExportingKey ? 'Generating Key...' : 'Answer Key'}</span>
            </button>

            {/* Print / Save PDF */}
            <button
              onClick={handlePrint}
              id="trigger-print-btn"
              className="px-4 py-2 rounded-pill bg-ink text-white text-xs font-heading font-semibold hover:bg-ink/90 active:scale-95 transition-all shadow-sm cursor-pointer min-h-[40px] flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Universal Lines Control */}
        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs bg-bg/50 p-2.5 rounded-card">
          <div className="flex items-center gap-2">
            <span className="font-heading font-semibold text-ink">Universal Answer Lines:</span>
            <div className="flex items-center border border-border rounded-pill overflow-hidden bg-surface shadow-xs">
              {[0, 1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setLinesPerMark(count)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    linesPerMark === count
                      ? 'bg-ink text-white font-bold'
                      : 'text-ink/70 hover:bg-surface-muted'
                  }`}
                >
                  {count === 0 ? 'Compact (0)' : `${count} / mk`}
                </button>
              ))}
            </div>
          </div>

          {Object.keys(questionLineOverrides).length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-forest/10 text-forest font-semibold px-2 py-0.5 rounded-pill border border-forest/20 text-[11px]">
                {Object.keys(questionLineOverrides).length} custom override{Object.keys(questionLineOverrides).length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setQuestionLineOverrides({})}
                className="text-[11px] text-ink/60 hover:text-ink underline cursor-pointer"
              >
                Clear all overrides
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Printable Formal Paper ── */}
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
