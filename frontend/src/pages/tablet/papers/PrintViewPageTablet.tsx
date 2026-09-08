import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { PaperPrintData } from '../../../types';

import { PrintablePaperSheet } from '../../../components/papers/PrintablePaperSheet';

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
          <p className="text-[11px] text-ink/50 font-mono mt-1">
            Tip: In browser print dialog, uncheck &quot;Headers and footers&quot; to remove page URL and timestamp.
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
      <PrintablePaperSheet printData={printData} />
    </div>
  );
};
