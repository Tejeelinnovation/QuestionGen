import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../../api/papers';
import type { PaperPrintData } from '../../../types';
import { Monitor, Printer, ChevronLeft } from 'lucide-react';

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
        Loading test summary...
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
          <span>Back to Version Detail</span>
        </Link>
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage || 'Print data not available.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-body">
      {/* Back button */}
      <Link
        to={`/papers/${paperId}/versions/${vId}`}
        className="inline-flex items-center gap-1 text-xs font-heading font-semibold text-forest hover:underline"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>Back to Version Detail</span>
      </Link>

      {/* ── Prominent Notice: Best viewed on desktop for printing ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-2 text-xs">
        <div className="flex items-center gap-2 text-forest font-heading font-bold text-sm">
          <Monitor className="w-4 h-4" />
          <span>Best viewed on desktop for printing</span>
        </div>
        <p className="text-ink/75 leading-relaxed">
          Physical test papers, answer keys, and high-resolution formatting are formatted for desktop browser printing sheets. A simplified mobile preview is shown below.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-2 py-2 px-3 rounded-pill border border-border bg-surface-muted text-ink font-heading font-semibold text-xs active:scale-95 transition-all flex items-center gap-1.5"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Trigger Device Print</span>
        </button>
      </div>

      {/* ── Simplified Read-Only Summary ── */}
      <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3">
        <div className="border-b border-border pb-2.5">
          <h1 className="font-heading font-bold text-base text-ink">
            {printData.title}
          </h1>
          <div className="text-xs text-ink/60 font-mono">
            Version: {printData.version_label}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-ink/70">
          <span>{printData.questions?.length || 0} Questions</span>
          <span>{printData.total_marks || 0} Total Marks</span>
        </div>

        {printData.instructions && (
          <div className="p-2.5 rounded-card bg-bg border border-border text-[11px] text-ink/80 leading-relaxed">
            <span className="font-bold block mb-0.5">Instructions:</span>
            {printData.instructions}
          </div>
        )}
      </div>

      {/* ── Simplified Questions List ── */}
      <div className="space-y-2">
        <div className="text-xs font-mono text-ink/60 px-1">
          QUESTIONS ({printData.questions?.length || 0})
        </div>

        {printData.questions?.map((q, idx) => (
          <div
            key={q.question_id || idx}
            className="p-3 rounded-card bg-surface border border-border shadow-xs space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono font-bold text-forest">Question {idx + 1}</span>
              <span className="pill pill-forest text-[10px] py-0.5">
                {q.marks || 1} mark{(q.marks || 1) === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs text-ink font-body leading-relaxed">
              {q.question_text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
