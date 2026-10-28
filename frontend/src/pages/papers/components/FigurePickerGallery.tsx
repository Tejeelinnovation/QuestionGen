import React, { useState } from 'react';
import type { PdfDetectedFigure } from '../../../types';
import { Check, ZoomIn, X, Image as ImageIcon, Sparkles } from 'lucide-react';

interface FigurePickerGalleryProps {
  figures: PdfDetectedFigure[];
  selectedFigureIds: string[];
  onToggleFigure: (figureId: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  className?: string;
}

export const FigurePickerGallery: React.FC<FigurePickerGalleryProps> = ({
  figures,
  selectedFigureIds,
  onToggleFigure,
  onSelectAll,
  onDeselectAll,
  className = '',
}) => {
  const [activeModalFigure, setActiveModalFigure] = useState<PdfDetectedFigure | null>(null);

  if (!figures || figures.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-card p-6 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-forest/10 text-forest flex items-center justify-center mx-auto">
          <ImageIcon className="w-5 h-5" />
        </div>
        <p className="text-sm font-heading font-semibold text-ink">No Visual Figures Detected</p>
        <p className="text-xs text-ink/60 max-w-sm mx-auto">
          This document appears to contain primarily pure text. Text and LaTeX formulas will still be used to generate your exam.
        </p>
      </div>
    );
  }

  const allSelected = selectedFigureIds.length === figures.length;

  return (
    <div className={`space-y-3 font-body ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-forest" />
          <h4 className="font-heading font-bold text-sm text-ink">
            Detected Figures & Diagrams ({figures.length})
          </h4>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-ink/60">
            {selectedFigureIds.length} of {figures.length} selected
          </span>
          <span className="text-border-strong">|</span>
          {onSelectAll && onDeselectAll ? (
            <button
              type="button"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="text-[11px] font-heading font-semibold text-forest hover:underline cursor-pointer"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-ink/70">
        Check only the specific diagrams you want the AI to formulate questions around (e.g. labeling, identification, problem solving). Leave unchecked to generate pure text & formula questions.
      </p>

      {/* Grid of figure thumbnails */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
        {figures.map((fig) => {
          const isSelected = selectedFigureIds.includes(fig.figure_id);
          return (
            <div
              key={fig.figure_id}
              onClick={() => onToggleFigure(fig.figure_id)}
              className={`group relative bg-surface border rounded-card p-3 transition-all cursor-pointer select-none flex flex-col justify-between ${
                isSelected
                  ? 'border-forest ring-2 ring-forest/20 shadow-md bg-forest/5'
                  : 'border-border hover:border-forest/50 hover:shadow-sm'
              }`}
            >
              {/* Image Preview & Zoom overlay */}
              <div className="relative aspect-video bg-bg rounded-md overflow-hidden flex items-center justify-center border border-border/60">
                <img
                  src={`data:image/png;base64,${fig.thumbnail_b64}`}
                  alt={fig.caption}
                  className="w-full h-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveModalFigure(fig);
                  }}
                  className="absolute bottom-1.5 right-1.5 p-1 bg-surface/90 hover:bg-surface border border-border rounded-md text-ink/70 hover:text-ink shadow-sm transition-colors"
                  title="Zoom preview"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {/* Page Badge */}
                <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-surface/90 border border-border/80 rounded-full font-mono text-[10px] text-ink/70 shadow-2xs">
                  Page {fig.page_number}
                </span>
              </div>

              {/* Caption & Checkbox info */}
              <div className="mt-2.5 flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-forest border-forest text-surface'
                      : 'border-border bg-surface group-hover:border-forest'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-heading font-medium text-ink truncate leading-tight">
                    {fig.caption || `Figure on Page ${fig.page_number}`}
                  </p>
                  <p className="text-[10px] font-mono text-ink/50 mt-0.5">
                    {fig.width} x {fig.height} px
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Zoom View */}
      {activeModalFigure && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveModalFigure(null)}
        >
          <div
            className="bg-surface border border-border rounded-lg max-w-2xl w-full p-5 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="font-heading font-bold text-base text-ink">
                  {activeModalFigure.caption}
                </h3>
                <span className="text-xs font-mono text-ink/60">
                  Page {activeModalFigure.page_number} &bull; {activeModalFigure.width} x {activeModalFigure.height} px
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalFigure(null)}
                className="p-1.5 rounded-full hover:bg-bg text-ink/70 hover:text-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-bg rounded-md p-4 flex items-center justify-center max-h-[60vh] overflow-auto">
              <img
                src={`data:image/png;base64,${activeModalFigure.thumbnail_b64}`}
                alt={activeModalFigure.caption}
                className="max-h-[50vh] object-contain rounded"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => {
                  onToggleFigure(activeModalFigure.figure_id);
                  setActiveModalFigure(null);
                }}
                className={`px-4 py-2 rounded-pill font-heading text-xs font-bold transition-all ${
                  selectedFigureIds.includes(activeModalFigure.figure_id)
                    ? 'bg-ember text-surface hover:bg-ember/90'
                    : 'bg-forest text-surface hover:bg-forest/90'
                }`}
              >
                {selectedFigureIds.includes(activeModalFigure.figure_id)
                  ? 'Deselect this Figure'
                  : 'Select for Exam'}
              </button>

              <button
                type="button"
                onClick={() => setActiveModalFigure(null)}
                className="px-4 py-2 bg-surface border border-border rounded-pill text-xs font-medium text-ink/80 hover:bg-bg transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

