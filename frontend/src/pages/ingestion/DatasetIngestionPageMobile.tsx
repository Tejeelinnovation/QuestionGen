import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Trash2,
  CheckCircle2,
  Clock,
  HeartHandshake,
  Download,
  Eye,
  Play,
  RotateCcw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  fetchIngestionJobs,
  enqueueJob,
  enqueueAllJobs,
  deleteIngestionJob,
  resetIngestionJob,
  exportJobJson,
  type IngestionJobSummary,
} from '../../api/ingestion';
import { UploadDocumentModal } from './UploadDocumentModal';
import { DatasetInspectionModal } from './DatasetInspectionModal';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { SkeletonIngestionList } from '../../components/ui/skeleton';
import {
  formatJobDuration,
  LiveTimer,
  JobDurationBadge,
} from '../../components/ui/JobDurationTimer';

export const DatasetIngestionPageMobile: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const toast = useToast();
  const isSuperAdmin = hasCapability('CREATE_SCHOOL') || !user?.school;

  const [jobs, setJobs] = useState<IngestionJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [inspectionJob, setInspectionJob] = useState<{ id: number; title: string } | null>(null);
  const [processingJobIds, setProcessingJobIds] = useState<Set<number>>(new Set());
  const [resettingJobIds, setResettingJobIds] = useState<Set<number>>(new Set());
  const [isBulkEnqueuing, setIsBulkEnqueuing] = useState(false);

  // Custom Delete Confirmation Modal state
  const [jobToDelete, setJobToDelete] = useState<IngestionJobSummary | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);
  const [deleteJobError, setDeleteJobError] = useState<string | null>(null);

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

  const handleDeleteClick = (job: IngestionJobSummary) => {
    setJobToDelete(job);
    setDeleteJobError(null);
  };

  const handleConfirmDelete = async () => {
    if (!jobToDelete) return;
    setIsDeletingJob(true);
    setDeleteJobError(null);
    try {
      await deleteIngestionJob(jobToDelete.id);
      setJobs((prev) => prev.filter((j) => j.id !== jobToDelete.id));
      toast.success(`Submission "${jobToDelete.title}" removed successfully.`);
      setJobToDelete(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to delete submission.';
      setDeleteJobError(msg);
      toast.error(msg);
    } finally {
      setIsDeletingJob(false);
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
      toast.success(`Exported dataset JSON for "${job.title}".`);
    } catch (err) {
      toast.error('Failed to export dataset JSON.');
    }
  };

  const totalPages = jobs.reduce((acc, j) => acc + (j.processed_pages || 0), 0);

  return (
    <div className="w-full space-y-4 pb-28 animate-in fade-in duration-200">
      {/* ── Mobile Header ── */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-forest">
            {isSuperAdmin ? 'AI Dataset Pipeline' : 'Study Material'}
          </span>
        </div>
        <h1 className="text-xl font-heading font-extrabold text-ink tracking-tight">
          {isSuperAdmin ? 'Document Ingestion' : 'Submit Material'}
        </h1>
        <p className="text-xs text-ink/60 font-body">
          {isSuperAdmin
            ? 'Extract multi-column text, formulas in LaTeX, and diagrams.'
            : 'Upload reference materials or notes for academic review.'}
        </p>
      </div>

      {/* ── Super Admin Quick Metric Chips ── */}
      {isSuperAdmin && jobs.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl border border-border bg-surface shadow-2xs">
            <span className="text-[10px] font-heading font-bold text-ink/50 uppercase">Documents</span>
            <p className="text-lg font-heading font-extrabold text-ink mt-0.5">{jobs.length}</p>
          </div>
          <div className="p-3 rounded-xl border border-border bg-surface shadow-2xs">
            <span className="text-[10px] font-heading font-bold text-ink/50 uppercase">Pages Ready</span>
            <p className="text-lg font-heading font-extrabold text-ink mt-0.5">{totalPages}</p>
          </div>
        </div>
      )}

      {/* ── Upload Action Button (Full-width, high-contrast, touch-optimized) ── */}
      <button
        onClick={() => setIsUploadOpen(true)}
        className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold shadow-sm flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
      >
        <UploadCloud className="w-4 h-4" />
        <span>Upload PDF Document</span>
      </button>

      {/* Contributor Message */}
      {!isSuperAdmin && (
        <div className="p-3 rounded-xl border border-forest/20 bg-forest/5 flex items-start gap-2.5">
          <HeartHandshake className="w-4 h-4 text-forest shrink-0 mt-0.5" />
          <p className="text-[11px] text-ink/75 leading-relaxed font-body">
            Pre-parsed with AI layout detection. Academic coordinators and teachers should inspect flagged pages in the verification modal before generating examination questions.
          </p>
        </div>
      )}

      {/* ── Submissions Queue ── */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs font-heading font-bold text-ink/60 uppercase tracking-wider px-1">
          <div className="flex items-center gap-2">
            <span>{isSuperAdmin ? 'Queue' : 'My Uploads'}</span>
            <span className="font-mono text-ink/40 text-[10px]">{jobs.length} files</span>
          </div>
          {isSuperAdmin && jobs.some((j) => j.status === 'PENDING' || j.status === 'FAILED') && (
            <button
              onClick={handleEnqueueAll}
              disabled={isBulkEnqueuing}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-forest text-white text-[11px] font-heading font-bold flex items-center gap-1 shadow-2xs active:scale-95 transition-all disabled:opacity-50"
            >
              {isBulkEnqueuing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Queueing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Extract All</span>
                </>
              )}
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonIngestionList count={3} />
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-border bg-surface space-y-2">
            <FileText className="w-8 h-8 text-ink/30 mx-auto" />
            <p className="text-xs font-heading font-bold text-ink">No materials uploaded yet</p>
            <p className="text-[11px] text-ink/50">Tap the button above to upload a PDF</p>
          </div>
        ) : (
          jobs.map((job) => {
            const isProcessing = processingJobIds.has(job.id);
            return (
              <div
                key={job.id}
                className="p-3.5 rounded-xl border border-border bg-surface shadow-2xs space-y-3"
              >
                {/* Badges & Meta */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-forest/10 text-forest border border-forest/20">
                      {job.board || 'Not specified'} {job.standard ? `· Class ${job.standard}` : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-surface-muted text-ink/70">
                      {job.subject || 'General'}
                    </span>
                    {job.document_kind && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-surface-muted text-ink/70 border border-border">
                        {job.document_kind}
                      </span>
                    )}
                    {isSuperAdmin && (
                      job.status === 'COMPLETED' ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-700">
                          Completed
                        </span>
                      ) : job.status === 'EXTRACTING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/10 text-blue-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Extracting
                        </span>
                      ) : job.status === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-700">
                          <Clock className="w-2.5 h-2.5" /> {job.queue_position ? `Queued (#${job.queue_position})` : 'Queued'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-red-500/10 text-red-700">
                          Failed
                        </span>
                      )
                    )}
                    {!isSuperAdmin && (
                      job.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-700">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Accepted
                        </span>
                      ) : job.status === 'EXTRACTING' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-blue-500/10 text-blue-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Processing...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-500/10 text-amber-700">
                          <Clock className="w-2.5 h-2.5" /> {job.queue_position ? `Queued (#${job.queue_position})` : 'Under Review'}
                        </span>
                      )
                    )}

                    {/* Extraction Engine Tag */}
                    {job.metadata?.extraction_engine ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-purple-500/10 text-purple-800 border border-purple-500/25">
                        <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                        {job.metadata.extraction_engine}
                      </span>
                    ) : job.current_stage?.includes('Docling') || job.current_stage?.includes('Marker') ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-purple-500/10 text-purple-800 border border-purple-500/25">
                        <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                        Docling AI (DocLayNet)
                      </span>
                    ) : job.status === 'EXTRACTING' ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-purple-500/10 text-purple-700 border border-purple-500/20 animate-pulse">
                        <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                        Docling AI Engine
                      </span>
                    ) : job.status === 'COMPLETED' ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-surface-muted text-ink/65 border border-border">
                        Document AI
                      </span>
                    ) : null}

                    {/* Total Extraction Duration Timer Badge */}
                    <JobDurationBadge job={job} />
                  </div>

                  {/* Title */}
                  <h3 className="text-xs font-heading font-bold text-ink leading-snug break-words">
                    {job.title}
                  </h3>
                </div>

                {/* Progress Bar (Super Admin) */}
                {isSuperAdmin && (
                  <div className="space-y-1 bg-surface-muted/40 p-2 rounded-lg border border-border/40">
                    <div className="flex justify-between items-center text-[10px] text-ink/60 font-mono">
                      <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                        {job.current_stage?.includes('Google Drive') && (
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                        )}
                        {job.status === 'EXTRACTING' && !job.current_stage?.includes('Google Drive') && (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        )}
                        {job.current_stage || `${job.processed_pages}/${job.total_pages} pages`}
                      </span>
                      <span className="font-bold flex items-center gap-1.5 shrink-0">
                        {job.status === 'EXTRACTING' ? (
                          <span className="inline-flex items-center gap-1 text-[9px] text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
                            <LiveTimer createdAt={job.created_at} />
                            <span className="text-blue-300">·</span>
                            <span>{job.progress_percentage === 0 ? 'Starting...' : `${job.progress_percentage}%`}</span>
                          </span>
                        ) : job.status === 'COMPLETED' ? (
                          <span className="inline-flex items-center gap-1">
                            {formatJobDuration(job) && (
                              <span className="text-[9px] font-normal text-ink/50 flex items-center gap-0.5" title="Total time taken">
                                <Clock className="w-2.5 h-2.5 text-ink/40" />
                                <span>{formatJobDuration(job)}</span>
                                <span className="mx-0.5 text-ink/30">·</span>
                              </span>
                            )}
                            <span>100%</span>
                          </span>
                        ) : (
                          `${job.progress_percentage}%`
                        )}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-700 ease-out ${
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
                            job.status === 'COMPLETED'
                              ? 100
                              : job.status === 'EXTRACTING'
                              ? Math.max(job.progress_percentage, 8)
                              : job.progress_percentage
                          }%`,
                        }}
                      />
                    </div>
                    {job.status === 'FAILED' && (
                      <div className="flex items-start gap-1.5 p-2 rounded bg-red-50 border border-red-200 text-red-800 text-[10px] mt-1 font-mono">
                        <AlertCircle className="w-3 h-3 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1 break-words">
                          <span className="font-bold">Error: </span>
                          {job.error_message || 'Cloud runner encountered an error.'}
                        </div>
                      </div>
                    )}
                  </div>
                )}


                {/* Action Controls (Touch-Friendly: min 38px height) */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-border/50">
                  {/* Left: Auto Extract / Resume (Super Admin) */}
                  <div className="flex items-center gap-1.5">
                    {isSuperAdmin && (
                      <>
                        {job.status === 'EXTRACTING' ? (
                          <div className="flex items-center gap-1">
                            <div className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-forest/80 text-white text-xs font-heading font-semibold flex items-center gap-1 shadow-2xs">
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Extracting...</span>
                            </div>
                            <button
                              onClick={() => handleResetJob(job.id)}
                              disabled={resettingJobIds.has(job.id)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-heading font-semibold flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer"
                              title="Stop & Reset"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset</span>
                            </button>
                          </div>
                        ) : job.status === 'FAILED' ? (
                          <button
                            onClick={() => handleAutoProcessAll(job.id)}
                            disabled={isProcessing}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-heading font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        ) : job.status !== 'COMPLETED' ? (
                          <button
                            onClick={() => handleAutoProcessAll(job.id)}
                            disabled={isProcessing}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Extract</span>
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>

                  {/* Right: Inspect, Download, Delete */}
                  <div className="flex items-center gap-1.5">
                    {isSuperAdmin && (
                      <>
                        <button
                          onClick={() => setInspectionJob({ id: job.id, title: job.title })}
                          className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted text-ink text-xs font-heading font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                          title="Inspect Visual & JSON"
                        >
                          <Eye className="w-3.5 h-3.5 text-ink/70" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => handleDownloadJson(job)}
                          className="min-h-[38px] min-w-[38px] p-2 rounded-lg border border-border bg-surface hover:bg-surface-muted text-ink/70 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                          title="Download Dataset JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteClick(job)}
                      className="min-h-[38px] min-w-[38px] p-2 rounded-lg border border-border/80 bg-surface hover:bg-red-50 text-ink/40 hover:text-red-600 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modals */}
      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => loadJobs()}
      />

      <ConfirmDeleteModal
        isOpen={jobToDelete !== null}
        onClose={() => {
          if (!isDeletingJob) {
            setJobToDelete(null);
            setDeleteJobError(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeletingJob}
        error={deleteJobError}
        title="Remove Submission"
        itemName={jobToDelete?.title}
        description={`Are you sure you want to permanently remove "${jobToDelete?.title}"? All extracted chapters, formulas, diagrams, and AI-generated question datasets will be deleted.`}
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

