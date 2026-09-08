import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import type { PaperPrintData } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { PrintViewPageTablet } from '../tablet/papers/PrintViewPageTablet';
import { PrintViewPageMobile } from '../mobile/papers/PrintViewPageMobile';

import { PrintablePaperSheet } from '../../components/papers/PrintablePaperSheet';

const PrintViewPageDesktop: React.FC = () => {
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
      {/* ── NON-PRINTED CONTROL BAR (Document-forward framing, print:hidden) ── */}
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
          <p className="text-[11px] text-ink/50 font-mono">
            Tip: In browser print dialog, uncheck &quot;Headers and footers&quot; to remove page URL and timestamp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={`/papers/${paperId}/versions/${vId}`}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-bg text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors"
          >
            ← Version Detail
          </Link>

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

      {/* ── PRINTABLE SHEET: HIGH CONTRAST, FORMAL RESTRAINT ── */}
      <PrintablePaperSheet printData={printData} />
    </div>
  );
};

export const PrintViewPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <PrintViewPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <PrintViewPageTablet key="tablet" />;
  }
  return <PrintViewPageDesktop key="desktop" />;
};

