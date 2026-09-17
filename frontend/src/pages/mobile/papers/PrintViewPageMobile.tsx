import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { PaperPrintData } from '../../../types';
import { Printer, ChevronLeft } from 'lucide-react';
import { PrintablePaperSheet } from '../../../components/papers/PrintablePaperSheet';

export const PrintViewPageMobile: React.FC = () => {
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
    <div className="space-y-4 font-body">
      {/* ── Mobile Non-Printed Control Bar (print:hidden) ── */}
      <div className="print:hidden space-y-3">
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
            className="py-2 px-4 rounded-pill bg-ink text-white font-heading font-semibold text-xs active:scale-95 transition-all flex items-center gap-2 shadow-sm min-h-[40px] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet / Save PDF</span>
          </button>
        </div>

        <div className="p-3 rounded-card bg-surface border border-border text-[11px] text-ink/70 space-y-1">
          <div className="font-heading font-bold text-ink flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-forest" />
            <span>Official Examination Paper Preview</span>
          </div>
          <p className="leading-relaxed">
            Formatted for proctored printing. In your print/PDF dialog, uncheck &quot;Headers and footers&quot; for a clean official paper.
          </p>
        </div>
      </div>

      {/* ── Formal Printable Examination Paper (Identical to Desktop) ── */}
      <PrintablePaperSheet printData={printData} />
    </div>
  );
};
