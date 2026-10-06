import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Maximize2,
  ExternalLink,
  FileText,
  Tag,
  AlertCircle,
  X,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { StructuredSection } from '../../api/ingestion';

interface VisualDiagramCardProps {
  section: StructuredSection;
  pageNumber?: number;
}

export const VisualDiagramCard: React.FC<VisualDiagramCardProps> = ({
  section,
  pageNumber,
}) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Derive initial image source
  const rawPath = section.image_path || '';
  const isHttp = rawPath.startsWith('http://') || rawPath.startsWith('https://');

  const getSourceUrl = (path: string, attempt: number) => {
    if (!path) return '';
    if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
      // If it's a Drive thumbnail and had an error on first attempt, try alt params
      if (attempt > 0 && path.includes('drive.google.com/thumbnail')) {
        const idMatch = path.match(/id=([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
        }
      }
      return path;
    }
    const apiBase = import.meta.env.VITE_API_URL || '';
    if (attempt > 0 && !path.includes('media/')) {
      return `/media/${path.replace(/^\/+/, '')}`;
    }
    return `${apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const imageSrc = getSourceUrl(rawPath, retryCount);

  // Derive label, caption, and description
  const label =
    section.image_label ||
    (() => {
      const cap = section.image_caption || '';
      const m = cap.match(/^\s*((?:Figure|Fig\.?|Image|Photo|Diagram|चित्र|आकृति|ग्राफ)\s*[\d.\-\w]+)/i);
      return m ? m[1].trim() : 'Diagram';
    })();

  const caption = section.image_caption || section.heading || '';

  // Extract description: prefer image_description, fall back to text if it's not identical to caption
  const description =
    section.image_description ||
    (section.text && section.text.trim() !== caption.trim() ? section.text.trim() : '');

  const handleRetry = () => {
    setImageState('loading');
    setRetryCount((prev) => prev + 1);
  };

  if (!rawPath && section.type !== 'DIAGRAM') {
    return null;
  }

  return (
    <>
      <div className="my-3 rounded-2xl border border-border/80 bg-surface shadow-xs overflow-hidden transition-all hover:border-border hover:shadow-sm">
        {/* Card Header Bar with Label Badge & Actions */}
        <div className="px-3.5 py-2.5 bg-surface-muted/40 border-b border-border/60 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 border border-indigo-500/20 shadow-2xs">
              <Tag className="w-3 h-3 text-indigo-600 shrink-0" />
              <span>{label}</span>
            </span>

            {pageNumber && (
              <span className="text-[10px] font-mono text-ink/40">
                p.{pageNumber}
              </span>
            )}

            {section.metadata?.extraction_engine && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                <Sparkles className="w-2.5 h-2.5" />
                {section.metadata.extraction_engine}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {imageState === 'loaded' && (
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="p-1.5 rounded-lg border border-border/60 hover:bg-surface text-ink/60 hover:text-ink transition-colors cursor-pointer"
                title="Expand diagram"
                aria-label="Expand diagram"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}

            {isHttp && (
              <a
                href={rawPath}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-border/60 hover:bg-surface text-ink/60 hover:text-ink transition-colors"
                title="Open original image in new tab"
                aria-label="Open original image in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Visual Content Body */}
        <div className="p-4 flex flex-col items-center">
          {rawPath ? (
            <div className="relative w-full flex flex-col items-center justify-center">
              {/* Skeleton UI with Shimmer while image is loading */}
              {imageState === 'loading' && (
                <div
                  className="w-full h-56 sm:h-64 rounded-xl border border-border/60 skeleton-shimmer flex flex-col items-center justify-center p-4 relative overflow-hidden"
                  aria-busy="true"
                  aria-label="Loading diagram image"
                >
                  <div className="flex flex-col items-center gap-2.5 z-10">
                    <div className="w-12 h-12 rounded-2xl bg-surface/80 border border-border/80 flex items-center justify-center shadow-xs">
                      <ImageIcon className="w-6 h-6 text-indigo-500/60 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/90 border border-border shadow-2xs">
                      <div className="w-3 h-3 border-2 border-forest/30 border-t-forest rounded-full animate-spin" />
                      <span className="text-[11px] font-mono text-ink/70 font-semibold">
                        Loading diagram visual...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Image with smooth fade-in */}
              <img
                src={imageSrc}
                alt={caption || label}
                onLoad={() => setImageState('loaded')}
                onError={() => {
                  if (retryCount < 2) {
                    handleRetry();
                  } else {
                    setImageState('error');
                  }
                }}
                onClick={() => {
                  if (imageState === 'loaded') setIsLightboxOpen(true);
                }}
                className={`max-h-96 w-auto object-contain rounded-xl border border-border/50 shadow-xs cursor-zoom-in transition-all duration-500 ease-out ${
                  imageState === 'loaded' ? 'opacity-100 scale-100' : 'opacity-0 absolute h-0 w-0'
                }`}
              />

              {/* Error fallback state */}
              {imageState === 'error' && (
                <div className="w-full py-8 px-4 rounded-xl border border-dashed border-border bg-surface-muted/40 flex flex-col items-center justify-center text-center space-y-2.5">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-heading font-bold text-ink">
                      Diagram preview unavailable
                    </p>
                    <p className="text-[11px] text-ink/50 max-w-sm">
                      The diagram is safely saved in the dataset. Direct preview link may require permissions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-xs font-heading font-semibold text-ink transition-all cursor-pointer shadow-2xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                    {isHttp && (
                      <a
                        href={rawPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all shadow-2xs"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open in Google Drive</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-32 bg-surface-muted/50 border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-ink/40 gap-1.5">
              <ImageIcon className="w-6 h-6 opacity-40" />
              <span className="text-xs font-mono">Diagram detected in document</span>
            </div>
          )}

          {/* Caption Heading */}
          {caption && (
            <div className="mt-3 w-full text-center sm:text-left pt-2 border-t border-border/50">
              <p className="text-xs font-heading font-bold text-ink flex items-start gap-1.5 justify-center sm:justify-start">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                <span>{caption}</span>
              </p>
            </div>
          )}

          {/* Description & Context Box */}
          {description && (
            <div className="mt-2.5 w-full p-3 rounded-xl bg-surface-muted/50 border border-border/60 text-left space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-ink/50">
                <FileText className="w-3 h-3 text-indigo-600 shrink-0" />
                <span>Description & Academic Context</span>
              </div>
              <p className="text-xs text-ink/80 leading-relaxed font-body whitespace-pre-line">
                {description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal for High-Resolution Inspection */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="px-4 py-3 bg-surface-muted border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
                  {label}
                </span>
                <h3 className="text-xs font-heading font-bold text-ink truncate">
                  {caption || label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="p-1 rounded-lg hover:bg-surface text-ink/60 hover:text-ink cursor-pointer"
                aria-label="Close lightbox"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lightbox Image Preview */}
            <div className="p-4 overflow-auto flex items-center justify-center bg-zinc-950/5 min-h-[300px]">
              <img
                src={imageSrc}
                alt={caption || label}
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-sm"
              />
            </div>

            {/* Lightbox Footer Details */}
            {description && (
              <div className="p-3.5 bg-surface border-t border-border space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink/50">
                  Description
                </span>
                <p className="text-xs text-ink/80 leading-relaxed font-body">
                  {description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
