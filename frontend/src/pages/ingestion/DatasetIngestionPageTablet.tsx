import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Play,
  Eye,
  Download,
  BookOpen,
  Layers,
  Trash2,
  CheckCircle2,
  Clock,
  HeartHandshake,
  RotateCcw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchIngestionJobs,
  enqueueJob,
  enqueueAllJobs,
  deleteIngestionJob,
  resetIngestionJob,
  type IngestionJobSummary,
  exportJobJson,
} from '../../api/ingestion';
import { UploadDocumentModal } from './UploadDocumentModal';
import { DatasetInspectionModal } from './DatasetInspectionModal';
import { SkeletonIngestionList } from '../../components/ui/skeleton';

export const DatasetIngestionPageTablet: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const isSuperAdmin = hasCapability('CREATE_SCHOOL') || !user?.school;

  const [jobs, setJobs] = useState<IngestionJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [inspectionJob, setInspectionJob] = useState<{ id: number; title: string } | null>(null);
  const [processingJobIds, setProcessingJobIds] = useState<Set<number>>(new Set());
  const [resettingJobIds, setResettingJobIds] = useState<Set<number>>(new Set());
  const [isBulkEnqueuing, setIsBulkEnqueuing] = useState(false);

  const loadJobs = async () => {
    try {
      const data = await fetchIngestionJobs();
      setJobs(data);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load ingestion jobs', err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // Poll every 3s while any job is active in the background queue
  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (j) => j.status === 'PENDING' || j.status === 'EXTRACTING' || j.status === 'PARSING'
    );
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      loadJobs();
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs]);

  const handleAutoProcessAll = async (jobId: number) => {
    if (processingJobIds.has(jobId)) return;
    setProcessingJobIds((prev) => new Set(prev).add(jobId));
    try {
      await enqueueJob(jobId);
      await loadJobs();
    } catch (err) {
      console.error(`Error enqueuing job ${jobId}`, err);
    } finally {
      setProcessingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleResetJob = async (jobId: number) => {
    try {
      setResettingJobIds((prev) => new Set(prev).add(jobId));
      await resetIngestionJob(jobId);
      await loadJobs();
    } catch (err) {
      console.error(`Error resetting job ${jobId}`, err);
    } finally {
      setResettingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleEnqueueAll = async () => {
    try {
      setIsBulkEnqueuing(true);
      await enqueueAllJobs();
      await loadJobs();
    } catch (err) {
      console.error('Error bulk enqueuing jobs', err);
    } finally {
      setIsBulkEnqueuing(false);
    }
  };

  const handleDownloadJson = async (job: IngestionJobSummary) => {
    try {
      const jsonData = await exportJobJson(job.id);
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dataset_${job.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${job.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export dataset JSON.');
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    if (!window.confirm('Are you sure you want to remove this submission?')) {
      return;
    }
    try {
      await deleteIngestionJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      alert('Failed to delete job.');
    }
  };

  const totalPagesCount = jobs.reduce((acc, j) => acc + (j.processed_pages || 0), 0);
  const completedJobsCount = jobs.filter((j) => j.status === 'COMPLETED').length;

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-200">
      {/* ── Tablet Header Bar ── */}
      <div className="flex items-center justify-between gap-4 pb-5 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-forest animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-forest">
              {isSuperAdmin ? 'AI Dataset Pipeline' : 'Study Material Submissions'}
            </span>
          </div>
          <h1 className="text-2xl font-heading font-extrabold text-ink tracking-tight">
            {isSuperAdmin ? 'Document Ingestion' : 'Contribute Study Material'}
          </h1>
          <p className="text-xs text-ink/60 font-body mt-0.5">
            {isSuperAdmin
              ? 'Multi-column layout analysis, LaTeX formulas, and pedagogical blocks.'
              : 'Upload reference materials to assist automated question generation.'}
          </p>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold shadow-sm transition-all shrink-0 active:scale-95 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload PDF</span>
        </button>
      </div>

      {/* ── Tablet Super Admin Stats Bento Grid (3-column grid) ── */}
      {isSuperAdmin ? (
        <div className="grid grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink/50">
              <span className="text-[11px] font-heading font-bold uppercase">Documents</span>
              <BookOpen className="w-4 h-4 text-forest" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">{jobs.length}</p>
            <p className="text-[10px] text-ink/50">Submitted textbook files</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink/50">
              <span className="text-[11px] font-heading font-bold uppercase">Pages Extracted</span>
              <Layers className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">{totalPagesCount}</p>
            <p className="text-[10px] text-ink/50">Structured dataset pages</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink/50">
              <span className="text-[11px] font-heading font-bold uppercase">Datasets Ready</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">{completedJobsCount}</p>
            <p className="text-[10px] text-ink/50">Ready for question gen</p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-forest/20 bg-forest/5 flex items-center gap-3">
          <HeartHandshake className="w-6 h-6 text-forest shrink-0" />
          <p className="text-xs text-ink/80 leading-relaxed font-body">
            Documents are pre-parsed using AI layout detection. Academic coordinators and teachers should inspect flagged pages in the verification modal before utilizing extracted questions.
          </p>
        </div>
      )}

      {/* ── Tablet Document Cards ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-heading font-bold text-ink/60 uppercase tracking-wider">
              {isSuperAdmin ? 'Material Queue' : 'My Uploads'} ({jobs.length})
            </h2>
            <span className="text-[11px] font-mono text-ink/40">Real-time queue</span>
          </div>
          {isSuperAdmin && jobs.some((j) => j.status === 'PENDING' || j.status === 'FAILED') && (
            <button
              onClick={handleEnqueueAll}
              disabled={isBulkEnqueuing}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all disabled:opacity-50"
            >
              {isBulkEnqueuing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Queueing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Extract All Pending</span>
                </>
              )}
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonIngestionList count={3} />
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center rounded-2xl border border-dashed border-border bg-surface space-y-2">
            <FileText className="w-8 h-8 text-ink/30 mx-auto" />
            <p className="text-xs font-heading font-bold text-ink">No documents submitted yet</p>
            <p className="text-[11px] text-ink/50">Upload a PDF to start dataset extraction</p>
          </div>
        ) : (
          jobs.map((job) => {
            const isProcessing = processingJobIds.has(job.id);
            return (
              <div key={job.id} className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-forest/10 text-forest border border-forest/20">
                        {job.board || 'Not specified'} {job.standard ? `· Class ${job.standard}` : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted text-ink/70">
                        {job.subject || 'General'}
                      </span>
                      {job.document_kind && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted text-ink/70 border border-border">
                          {job.document_kind}
                        </span>
                      )}
                      {isSuperAdmin && (
                        job.status === 'COMPLETED' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-700">
                            Completed
                          </span>
                        ) : job.status === 'EXTRACTING' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Extracting
                          </span>
                        ) : job.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-700">
                            <Clock className="w-3 h-3" /> {job.queue_position ? `Queued (#${job.queue_position})` : 'Queued'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/10 text-red-700">
                            Failed
                          </span>
                        )
                      )}
                      {!isSuperAdmin && (
                        job.status === 'COMPLETED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Accepted
                          </span>
                        ) : job.status === 'EXTRACTING' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Processing...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-700">
                            <Clock className="w-3 h-3" /> {job.queue_position ? `Queued (#${job.queue_position})` : 'Under Review'}
                          </span>
                        )
                      )}

                      {/* Extraction Engine Tag */}
                      {job.metadata?.extraction_engine ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-800 border border-purple-500/25">
                          <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                          {job.metadata.extraction_engine}
                        </span>
                      ) : job.current_stage?.includes('Docling') || job.current_stage?.includes('Marker') ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-800 border border-purple-500/25">
                          <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                          Docling AI (DocLayNet)
                        </span>
                      ) : job.status === 'EXTRACTING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 text-purple-700 border border-purple-500/20 animate-pulse">
                          <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                          Docling AI Engine
                        </span>
                      ) : job.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-muted text-ink/65 border border-border">
                          Document AI Engine
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-sm font-heading font-bold text-ink leading-snug break-words">
                      {job.title}
                    </h3>
                  </div>

                  {/* Tablet Action Buttons (Touch friendly: 40px height) */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isSuperAdmin && (
                      <>
                        {job.status === 'EXTRACTING' ? (
                          <div className="flex items-center gap-1.5">
                            <div className="min-h-[40px] px-3 py-2 rounded-xl bg-forest/80 text-white text-xs font-heading font-semibold flex items-center gap-1.5 shadow-xs">
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Extracting...</span>
                            </div>
                            <button
                              onClick={() => handleResetJob(job.id)}
                              disabled={resettingJobIds.has(job.id)}
                              className="min-h-[40px] px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-heading font-semibold transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer"
                              title="Stop and reset extraction"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reset</span>
                            </button>
                          </div>
                        ) : job.status === 'FAILED' ? (
                          <button
                            onClick={() => handleAutoProcessAll(job.id)}
                            disabled={isProcessing}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-heading font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                            title="Retry extraction"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retry</span>
                          </button>
                        ) : job.status !== 'COMPLETED' ? (
                          <button
                            onClick={() => handleAutoProcessAll(job.id)}
                            disabled={isProcessing}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                            title="Auto-extract all pages"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Extract</span>
                          </button>
                        ) : null}
                        <button
                          onClick={() => setInspectionJob({ id: job.id, title: job.title })}
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-border bg-surface text-ink hover:bg-surface-muted text-xs font-heading font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                          title="Inspect Data"
                        >
                          <Eye className="w-4 h-4 text-ink/70" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => handleDownloadJson(job)}
                          className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-border bg-surface text-ink hover:bg-surface-muted active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                          title="Download JSON"
                        >
                          <Download className="w-4 h-4 text-ink/70" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-border bg-surface text-ink/40 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="space-y-1.5 bg-surface-muted/40 p-2.5 rounded-lg border border-border/40">
                    <div className="flex justify-between items-center text-[10px] text-ink/60 font-mono">
                      <span className="flex items-center gap-1.5 truncate max-w-[80%]">
                        {job.current_stage?.includes('Google Drive') && (
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                        )}
                        {job.status === 'EXTRACTING' && !job.current_stage?.includes('Google Drive') && (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        )}
                        {job.current_stage || `${job.processed_pages}/${job.total_pages} pages`}
                      </span>
                      <span className="font-bold">
                        {job.status === 'EXTRACTING' && job.progress_percentage === 0 ? (
                          <span className="text-emerald-700 font-semibold animate-pulse">Starting...</span>
                        ) : (
                          `${job.progress_percentage}%`
                        )}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ease-out ${
                          job.status === 'COMPLETED'
                            ? 'bg-forest'
                            : job.status === 'FAILED'
                            ? 'bg-red-500'
                            : job.status === 'EXTRACTING'
                            ? 'progress-active-stripe'
                            : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${
                            job.status === 'EXTRACTING'
                              ? Math.max(job.progress_percentage, 5)
                              : job.progress_percentage
                          }%`,
                        }}
                      />
                    </div>
                    {job.status === 'FAILED' && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs mt-1.5 font-mono">
                        <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1 break-words">
                          <span className="font-bold">Extraction Failed: </span>
                          {job.error_message || 'Cloud runner encountered an error.'}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => loadJobs()}
      />

      {isSuperAdmin && inspectionJob && (
        <DatasetInspectionModal
          jobId={inspectionJob.id}
          jobTitle={inspectionJob.title}
          isOpen={true}
          onClose={() => setInspectionJob(null)}
        />
      )}
    </div>
  );
};
