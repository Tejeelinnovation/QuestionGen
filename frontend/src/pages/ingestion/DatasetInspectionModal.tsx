import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileCode,
  Layout,
  BookOpen,
  Image as ImageIcon,
  FlaskConical,
  Sigma,
  HelpCircle,
  Lightbulb,
  Download,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { fetchJobPages, exportJobJson, type ExtractedPage, type StructuredSection } from '../../api/ingestion';
import { Skeleton } from '../../components/ui/skeleton';
import 'katex/dist/katex.min.css';
import katex from 'katex';

const MathFormula: React.FC<{ math: string }> = ({ math }) => {
  const clean = math.replace(/^\$+|\$+$/g, '').trim();
  const html = useMemo(() => {
    try {
      return katex.renderToString(clean, { throwOnError: false, displayMode: true });
    } catch {
      return null;
    }
  }, [clean]);

  if (!html) {
    return <code className="text-xs font-mono text-purple-800">{math}</code>;
  }
  return (
    <div
      className="my-1.5 py-1 px-3 bg-white/95 rounded-lg border border-purple-200/80 shadow-2xs overflow-x-auto text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface DatasetInspectionModalProps {
  jobId: number;
  jobTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DatasetInspectionModal: React.FC<DatasetInspectionModalProps> = ({
  jobId,
  jobTitle,
  isOpen,
  onClose,
}) => {
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'BLOCKS' | 'RAW_JSON'>('BLOCKS');
  const [jsonScope, setJsonScope] = useState<'PAGE' | 'FULL_PREVIEW'>('PAGE');
  const [fullJson, setFullJson] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    // Only load page records for instant, non-blocking modal display
    fetchJobPages(jobId)
      .then((pagesData) => {
        setPages(pagesData);
        setSelectedPageIndex(0);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [isOpen, jobId]);

  if (!isOpen) return null;

  const currentPage = pages[selectedPageIndex];

  const pageJson = useMemo(() => {
    if (!currentPage) return '{}';
    return JSON.stringify(currentPage, null, 2);
  }, [currentPage]);

  const fullJsonPreview = useMemo(() => {
    if (!fullJson) return '';
    const raw = JSON.stringify(fullJson, null, 2);
    const lines = raw.split('\n');
    if (lines.length > 250) {
      return (
        lines.slice(0, 250).join('\n') +
        `\n\n  // ... [Showing preview of first 250 lines out of ${lines.length.toLocaleString()} lines]` +
        `\n  // ... [Click "Download Full JSON" above to download the complete ${pages.length}-page dataset without browser lag]` +
        '\n}'
      );
    }
    return raw;
  }, [fullJson, pages.length]);

  const handleDownloadFullJson = async () => {
    setIsExporting(true);
    try {
      const data = fullJson || (await exportJobJson(jobId));
      if (!fullJson) setFullJson(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dataset_${jobTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${jobId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to download JSON dataset.');
    } finally {
      setIsExporting(false);
    }
  };

  const getSectionBadge = (type: StructuredSection['type']) => {
    switch (type) {
      case 'ACTIVITY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
            <FlaskConical className="w-3 h-3" /> ACTIVITY
          </span>
        );
      case 'FORMULA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-purple-500/10 text-purple-700 border border-purple-500/20">
            <Sigma className="w-3 h-3" /> FORMULA (LATEX)
          </span>
        );
      case 'SOLVED_EXAMPLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-blue-500/10 text-blue-700 border border-blue-500/20">
            <Lightbulb className="w-3 h-3" /> SOLVED EXAMPLE
          </span>
        );
      case 'EXERCISE_QUESTION':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <HelpCircle className="w-3 h-3" /> EXERCISE QUESTION
          </span>
        );
      case 'DIAGRAM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
            <ImageIcon className="w-3 h-3" /> DIAGRAM
          </span>
        );
      case 'DEFINITION':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-teal-500/10 text-teal-700 border border-teal-500/20">
            <BookOpen className="w-3 h-3" /> DEFINITION / LAW
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-heading font-bold bg-slate-500/10 text-slate-700 border border-slate-500/20">
            PARAGRAPH
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-1.5 sm:p-4 overflow-hidden">
      <div className="relative w-full max-w-6xl h-[95dvh] sm:h-[88vh] bg-surface border border-border rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="px-3.5 py-3 sm:px-6 sm:py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-surface-muted/50 shrink-0">
          {/* Title Row */}
          <div className="flex items-center justify-between w-full sm:w-auto min-w-0">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-forest/10 text-forest border border-forest/20 shrink-0">
                JOB #{jobId}
              </span>
              <h2
                className="text-sm sm:text-base font-heading font-bold text-ink truncate max-w-[200px] xs:max-w-xs sm:max-w-md"
                title={jobTitle}
              >
                {jobTitle}
              </h2>
            </div>
            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="sm:hidden p-1.5 rounded-lg hover:bg-surface-muted text-ink/50 hover:text-ink shrink-0 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-surface border border-border rounded-xl p-0.5 text-[11px] sm:text-xs font-heading font-semibold">
              <button
                onClick={() => setViewMode('BLOCKS')}
                className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'BLOCKS' ? 'bg-ink text-white shadow-xs' : 'text-ink/60 hover:text-ink'
                }`}
              >
                Visual Sections
              </button>
              <button
                onClick={() => setViewMode('RAW_JSON')}
                className={`px-2.5 sm:px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'RAW_JSON' ? 'bg-ink text-white shadow-xs' : 'text-ink/60 hover:text-ink'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" /> Full JSON
              </button>
            </div>

            {/* Desktop Close Button */}
            <button
              onClick={onClose}
              className="hidden sm:flex p-1.5 rounded-xl hover:bg-surface-muted text-ink/40 hover:text-ink transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {isLoading ? (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-4 gap-4" aria-hidden="true">
            <div className="w-full md:w-64 border border-border rounded-xl p-3 space-y-2.5 bg-surface-muted/30">
              <Skeleton className="h-4 w-32" radius="sm" />
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-2 rounded-lg bg-surface border border-border/60 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" radius="sm" />
                    <Skeleton className="h-2.5 w-16" radius="pill" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 border border-border rounded-xl p-4 space-y-4 bg-surface">
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-48" radius="sm" />
                <Skeleton className="h-6 w-20" radius="pill" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-full" radius="sm" />
                <Skeleton className="h-3.5 w-5/6" radius="sm" />
                <Skeleton className="h-3.5 w-4/5" radius="sm" />
                <Skeleton className="h-3.5 w-2/3" radius="sm" />
              </div>
              <div className="pt-3 border-t border-border/60 space-y-2">
                <Skeleton className="h-4 w-36" radius="sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-12 w-full" radius="card" />
                  <Skeleton className="h-12 w-full" radius="card" />
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === 'RAW_JSON' ? (
          <div className="flex-1 flex flex-col bg-[#1e1e1e] text-emerald-400 font-mono text-xs overflow-hidden">
            {/* JSON Viewer Sub-Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-2.5 bg-[#252526] border-b border-[#333333] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-[11px] font-sans">Scope:</span>
                <div className="flex items-center bg-[#1e1e1e] rounded-lg p-0.5 text-[11px] font-sans">
                  <button
                    onClick={() => setJsonScope('PAGE')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      jsonScope === 'PAGE' ? 'bg-forest text-white font-bold' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Page {currentPage ? currentPage.page_number : 1} JSON
                  </button>
                  <button
                    onClick={async () => {
                      setJsonScope('FULL_PREVIEW');
                      if (!fullJson) {
                        try {
                          const data = await exportJobJson(jobId);
                          setFullJson(data);
                        } catch (e) {
                          console.error(e);
                        }
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      jsonScope === 'FULL_PREVIEW' ? 'bg-forest text-white font-bold' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Full Dataset Preview
                  </button>
                </div>
              </div>

              <button
                onClick={handleDownloadFullJson}
                disabled={isExporting}
                className="w-full sm:w-auto justify-center px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-sans font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isExporting ? 'Preparing...' : 'Download Full JSON (.json)'}</span>
              </button>
            </div>

            {/* Warning banner when on Full Preview */}
            {jsonScope === 'FULL_PREVIEW' && (
              <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-[11px] font-sans flex items-center gap-2 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>
                  Showing high-performance preview (first 250 lines). Click &quot;Download Full JSON&quot; above to save the complete {pages.length}-page dataset.
                </span>
              </div>
            )}

            {/* Code Body */}
            <div className="flex-1 p-3 sm:p-6 overflow-y-auto selection:bg-emerald-900">
              <pre className="font-mono text-xs whitespace-pre-wrap break-all leading-relaxed">
                {jsonScope === 'PAGE'
                  ? pageJson
                  : fullJson
                  ? fullJsonPreview
                  : '// Loading full dataset preview...'}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Mobile Page Navigator Bar (Visible on < 768px, replaces the crushing sidebar) */}
            <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 bg-surface-muted/70 border-b border-border shrink-0">
              <button
                onClick={() => setSelectedPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedPageIndex === 0 || pages.length === 0}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs font-heading font-bold text-ink disabled:opacity-30 cursor-pointer shrink-0 active:scale-95"
              >
                ← Prev
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-heading font-semibold text-ink/70 shrink-0">Page</span>
                <select
                  value={selectedPageIndex}
                  onChange={(e) => setSelectedPageIndex(Number(e.target.value))}
                  disabled={pages.length === 0}
                  className="px-2 py-1 rounded-lg border border-border bg-surface text-xs font-heading font-bold text-ink focus:outline-none focus:border-forest max-w-[120px] xs:max-w-[150px] truncate"
                >
                  {pages.length === 0 ? (
                    <option value={0}>0</option>
                  ) : (
                    pages.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        {p.page_number} ({p.layout_type.replace('_COLUMN', '')})
                      </option>
                    ))
                  )}
                </select>
                <span className="text-xs text-ink/50 shrink-0">of {pages.length}</span>
              </div>

              <button
                onClick={() => setSelectedPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                disabled={selectedPageIndex >= pages.length - 1 || pages.length === 0}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs font-heading font-bold text-ink disabled:opacity-30 cursor-pointer shrink-0 active:scale-95"
              >
                Next →
              </button>
            </div>

            {/* Desktop & Tablet Left Sidebar (Hidden on mobile, visible on md: 768px+) */}
            <div className="hidden md:block w-56 border-r border-border bg-surface-muted/30 overflow-y-auto p-3 space-y-1.5 shrink-0">
              <p className="text-[11px] font-heading font-bold text-ink/50 uppercase tracking-wider px-2 mb-2">
                Pages ({pages.length})
              </p>
              {pages.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPageIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-heading font-semibold flex items-center justify-between transition-all cursor-pointer ${
                    selectedPageIndex === idx
                      ? 'bg-ink text-white shadow-xs'
                      : 'hover:bg-surface text-ink/70 hover:text-ink border border-transparent hover:border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Layout className="w-3.5 h-3.5 opacity-60 shrink-0" />
                    <span className="truncate">Page {p.page_number}</span>
                    {p.needs_review && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Needs Human Review" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {p.needs_review && (
                      <span
                        className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold ${
                          selectedPageIndex === idx ? 'bg-amber-400/30 text-amber-200' : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                        }`}
                      >
                        REVIEW
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                        selectedPageIndex === idx ? 'bg-white/20 text-white' : 'bg-surface-muted text-ink/60'
                      }`}
                    >
                      {p.layout_type.replace('_COLUMN', '')}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Right Content Pane (Takes 100% width on mobile, flex-1 on tablet/desktop) */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 bg-surface">
              {currentPage ? (
                <>
                  <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-1.5 pb-3 border-b border-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold text-sm text-ink">
                        Page {currentPage.page_number}
                      </span>
                      {currentPage.chapter_title && (
                        <span className="text-xs text-ink/60 truncate max-w-xs">
                          — {currentPage.chapter_title}
                        </span>
                      )}
                      {currentPage.needs_review ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-amber-500/10 text-amber-700 border border-amber-500/30 flex items-center gap-1 font-semibold">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Needs Review
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-forest/10 text-forest border border-forest/20 flex items-center gap-1 font-semibold">
                          <CheckCircle className="w-3 h-3 text-forest" />
                          Verified
                        </span>
                      )}
                    </div>
                    <span className="self-start xs:self-auto px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-forest/10 text-forest border border-forest/20 shrink-0">
                      Layout: {currentPage.layout_type}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {currentPage.structured_content && currentPage.structured_content.length > 0 ? (
                      currentPage.structured_content.map((sec, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-3 sm:p-4 rounded-xl border border-border bg-surface-muted/30 hover:border-forest/30 transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getSectionBadge(sec.type)}
                              {sec.heading && (
                                <span className="text-xs font-heading font-bold text-ink">
                                  {sec.heading}
                                </span>
                              )}
                            </div>
                            {sec.column_index ? (
                              <span className="text-[10px] font-mono text-ink/40">
                                Column {sec.column_index}
                              </span>
                            ) : null}
                          </div>

                          {sec.text && (
                            <p className="text-xs text-ink/80 leading-relaxed font-body whitespace-pre-line">
                              {sec.text}
                            </p>
                          )}

                          {sec.latex_equations && sec.latex_equations.length > 0 && (
                            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1.5">
                              <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                                <Sigma className="w-3.5 h-3.5" />
                                <span>Mathematical Formula</span>
                              </p>
                              {sec.latex_equations.map((eq, eqIdx) => (
                                <MathFormula key={eqIdx} math={eq} />
                              ))}
                            </div>
                          )}

                          {(sec.image_path || sec.type === 'DIAGRAM') && (
                            <div className="my-3 p-3 bg-white rounded-xl border border-border/80 shadow-xs flex flex-col items-center">
                              {sec.image_path ? (
                                <img
                                  src={
                                    sec.image_path.startsWith('http') || sec.image_path.startsWith('data:')
                                      ? sec.image_path
                                      : `${import.meta.env.VITE_API_URL || ''}${sec.image_path}`
                                  }
                                  alt={sec.image_caption || 'Diagram'}
                                  className="max-h-80 w-auto object-contain rounded-lg border border-border/40 shadow-xs transition-transform hover:scale-[1.01]"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (!target.src.includes('media') && !target.src.startsWith('data:')) {
                                      target.src = `/media/${sec.image_path?.replace(/^\/+/, '')}`;
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-full h-28 bg-surface-muted/60 border border-dashed border-border rounded-lg flex flex-col items-center justify-center text-ink/40 gap-1.5">
                                  <ImageIcon className="w-5 h-5 opacity-40" />
                                  <span className="text-[11px]">Diagram detected in document</span>
                                </div>
                              )}
                              {sec.image_caption && (
                                <p className="mt-2 text-xs font-heading font-medium text-ink/70 italic text-center flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span>{sec.image_caption}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-ink/40 border border-dashed border-border rounded-xl">
                        No sections extracted for this page yet.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-xs text-ink/50">
                  Select a page to inspect its extracted structure.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
