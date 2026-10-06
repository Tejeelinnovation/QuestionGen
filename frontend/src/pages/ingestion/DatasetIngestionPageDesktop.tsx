import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Play,
  Eye,
  Download,
  ExternalLink,
  BookOpen,
  Layers,
  Sparkles,
  Database,
  Trash2,
  CheckCircle2,
  Clock,
  HeartHandshake,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
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
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { SkeletonIngestionList } from '../../components/ui/skeleton';
import { JobDurationBadge, LiveTimer, formatJobDuration } from '../../components/ui/JobDurationTimer';

export const DatasetIngestionPageDesktop: React.FC = () => {
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

  const totalPagesCount = jobs.reduce((acc, j) => acc + (j.processed_pages || 0), 0);
  const completedJobsCount = jobs.filter((j) => j.status === 'COMPLETED').length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* ── Desktop Page Header ── */}
      <div className="flex items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-forest animate-pulse" />
            <span className="text-xs font-mono font-bold tracking-widest uppercase text-forest">
              {isSuperAdmin ? 'AI Dataset Collection & Pipeline' : 'Study Material Repository'}
            </span>
          </div>
          <h1 className="text-3xl font-heading font-extrabold text-ink tracking-tight">
            {isSuperAdmin ? 'Curated Document Ingestion' : 'Contribute Study Material'}
          </h1>
          <p className="text-xs text-ink/60 mt-1 max-w-2xl font-body">
            {isSuperAdmin
              ? 'Multi-column layout analysis, LaTeX equation extraction, and pedagogical block mapping for AI training.'
              : 'Upload reference textbooks, past papers, or handwritten notes to assist curriculum question generation.'}
          </p>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold shadow-sm transition-all shrink-0 hover:scale-[1.02]"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload PDF Document</span>
        </button>
      </div>

      {/* ── Super Admin Metrics Bento Grid (Hidden from Regular Contributors) ── */}
      {isSuperAdmin ? (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs space-y-1">
            <div className="flex items-center justify-between text-ink/50 mb-2">
              <span className="text-xs font-heading font-bold uppercase tracking-wider">Ingested Documents</span>
              <BookOpen className="w-4 h-4 text-forest" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">{jobs.length}</p>
            <p className="text-[11px] text-ink/60">{completedJobsCount} structured & validated</p>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs space-y-1">
            <div className="flex items-center justify-between text-ink/50 mb-2">
              <span className="text-xs font-heading font-bold uppercase tracking-wider">Pages Processed</span>
              <Layers className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">{totalPagesCount}</p>
            <p className="text-[11px] text-ink/60">Multi-column & LaTeX indexed</p>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs space-y-1">
            <div className="flex items-center justify-between text-ink/50 mb-2">
              <span className="text-xs font-heading font-bold uppercase tracking-wider">Active Queues</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">{processingJobIds.size}</p>
            <p className="text-[11px] text-ink/60">Asynchronous page workers</p>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs space-y-1">
            <div className="flex items-center justify-between text-ink/50 mb-2">
              <span className="text-xs font-heading font-bold uppercase tracking-wider">Cloud Storage</span>
              <Database className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-heading font-extrabold text-ink">Google Drive</p>
            <p className="text-[11px] text-ink/60">15 GB free tier active</p>
          </div>
        </div>
      ) : (
        /* Contributor Acknowledgment Card */
        <div className="p-5 rounded-2xl border border-forest/20 bg-forest/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-forest/10 flex items-center justify-center text-forest">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-heading font-bold text-ink">Material Ingestion & Verification</h3>
              <p className="text-xs text-ink/70 mt-0.5">
                Documents are pre-parsed using AI layout detection. Academic coordinators and teachers should inspect flagged pages in the verification modal before utilizing extracted questions.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-forest/10 text-forest border border-forest/20">
            {jobs.length} Submissions Made
          </span>
        </div>
      )}

      {/* ── Documents / Submissions Table ── */}
      <div className="border border-border rounded-2xl bg-surface shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface-muted/30">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-heading font-bold text-ink">
              {isSuperAdmin ? 'Uploaded Material Library' : 'My Uploaded Documents'}
            </h2>
            <span className="text-xs text-ink/50">{jobs.length} items</span>
          </div>
          {isSuperAdmin && jobs.some((j) => j.status === 'PENDING' || j.status === 'FAILED') && (
            <button
              onClick={handleEnqueueAll}
              disabled={isBulkEnqueuing}
              className="px-3 py-1.5 rounded-xl bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isBulkEnqueuing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Queueing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Auto-Extract All Pending</span>
                </>
              )}
            </button>
          )}
        </div>

        {isLoading ? (
          <SkeletonIngestionList count={4} />
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-muted border border-border mx-auto flex items-center justify-center text-ink/40">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-heading font-bold text-ink">No documents uploaded yet</p>
              <p className="text-xs text-ink/60 max-w-sm mx-auto mt-1">
                Upload a textbook or handwritten notes PDF to start collecting structured data.
              </p>
            </div>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-forest text-white text-xs font-heading font-bold shadow-xs hover:bg-forest/90 transition-all"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload First Document</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => {
              const isProcessing = processingJobIds.has(job.id);
              return (
                <div key={job.id} className="p-5 hover:bg-surface-muted/30 transition-all space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-forest/10 text-forest border border-forest/20">
                          {job.board || 'Not specified'} {job.standard ? `· Class ${job.standard}` : ''}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted text-ink/70 border border-border">
                          {job.subject || 'General'}
                        </span>
                        {job.document_kind && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              ['NEWSPAPER', 'MAGAZINE', 'OTHER'].includes(job.document_kind)
                                ? 'bg-purple-500/10 text-purple-700 border-purple-500/20'
                                : job.document_kind === 'HANDWRITTEN_NOTES' || job.document_kind === 'NOTES'
                                ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-700 border-blue-500/20'
                            }`}
                            title={job.classification_evidence}
                          >
                            {job.document_kind}
                            {job.classification_confidence !== undefined && job.classification_confidence !== null
                              ? ` (${Math.round(job.classification_confidence * 100)}%)`
                              : ''}
                          </span>
                        )}
                        {/* Contributor Status Badge */}
                        {!isSuperAdmin && (
                          job.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Verified & Accepted
                            </span>
                          ) : job.status === 'EXTRACTING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-700 border border-blue-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Processing...
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                              <Clock className="w-3 h-3" /> {job.queue_position ? `Queued (#${job.queue_position})` : 'Queued'}
                            </span>
                          )
                        )}
                        {/* Super Admin Status Badge */}
                        {isSuperAdmin && (
                          job.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Completed
                            </span>
                          ) : job.status === 'EXTRACTING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-700 border border-blue-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Extracting
                            </span>
                          ) : job.status === 'PENDING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                              <Clock className="w-3 h-3" /> {job.queue_position ? `Queued (#${job.queue_position})` : 'Queued'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-500/10 text-red-700 border border-red-500/20">
                              Failed
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

                        {/* Total Extraction Duration Timer Badge */}
                        <JobDurationBadge job={job} />
                      </div>
                      <h3 className="text-sm font-heading font-bold text-ink">{job.title}</h3>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Super Admin Exclusive Controls */}
                      {isSuperAdmin && (
                        <>
                          {job.status === 'EXTRACTING' ? (
                            <div className="flex items-center gap-1.5">
                              <div className="px-3 py-1.5 rounded-xl bg-forest/80 text-white text-xs font-heading font-semibold flex items-center gap-1.5 shadow-xs">
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Extracting...</span>
                              </div>
                              <button
                                onClick={() => handleResetJob(job.id)}
                                disabled={resettingJobIds.has(job.id)}
                                className="px-2.5 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-heading font-medium transition-all flex items-center gap-1 shadow-xs disabled:opacity-50"
                                title="Stop and reset extraction back to Pending"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset</span>
                              </button>
                            </div>
                          ) : job.status === 'FAILED' ? (
                            <button
                              onClick={() => handleAutoProcessAll(job.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-heading font-semibold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                              title="Retry extraction"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Retry Extraction</span>
                            </button>
                          ) : job.status !== 'COMPLETED' ? (
                            <button
                              onClick={() => handleAutoProcessAll(job.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-xl bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <Play className="w-3 h-3" />
                              <span>Auto-Extract</span>
                            </button>
                          ) : null}

                          <button
                            onClick={() => setInspectionJob({ id: job.id, title: job.title })}
                            className="px-3 py-1.5 rounded-xl border border-border hover:bg-surface text-ink text-xs font-heading font-semibold transition-all flex items-center gap-1.5 shadow-xs"
                            title="Inspect extracted pages & LaTeX"
                          >
                            <Eye className="w-3.5 h-3.5 text-ink/70" />
                            <span>Inspect Data</span>
                          </button>

                          <button
                            onClick={() => handleDownloadJson(job)}
                            className="p-2 rounded-xl border border-border hover:bg-surface text-ink/70 hover:text-ink transition-all shadow-xs"
                            title="Download structured training JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {job.google_drive_url && (
                            <a
                              href={job.google_drive_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-xl border border-border hover:bg-surface text-ink/70 hover:text-ink transition-all shadow-xs"
                              title="Open original file in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => handleDeleteClick(job)}
                        className="p-2 rounded-xl border border-border hover:bg-red-50 text-ink/40 hover:text-red-600 transition-all shadow-xs cursor-pointer"
                        title="Remove submission"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar & Detailed Error Card */}
                  {isSuperAdmin && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-ink/60">
                        <span className="font-mono flex items-center gap-1.5 truncate max-w-[75%]">
                          {job.current_stage?.includes('Google Drive') && (
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                          )}
                          {job.status === 'EXTRACTING' && !job.current_stage?.includes('Google Drive') && (
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          )}
                          {job.current_stage || `${job.processed_pages} of ${job.total_pages} pages processed`}
                        </span>
                        <span className="font-mono font-bold text-ink flex items-center gap-1.5 shrink-0">
                          {job.status === 'EXTRACTING' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              <LiveTimer createdAt={job.created_at} />
                              <span className="text-blue-300">·</span>
                              <span>{job.progress_percentage === 0 ? 'Starting...' : `${job.progress_percentage}%`}</span>
                            </span>
                          ) : job.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1">
                              {formatJobDuration(job) && (
                                <span className="text-[10px] font-normal text-ink/50 flex items-center gap-0.5" title="Total time taken">
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
                      <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden border border-border/50 shadow-2xs">
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
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs mt-2 animate-in fade-in duration-200">
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <div className="font-heading font-bold text-red-900 flex items-center justify-between">
                              <span>Extraction Failed</span>
                              <button
                                onClick={() => handleAutoProcessAll(job.id)}
                                className="text-[11px] underline font-sans text-red-700 hover:text-red-900 font-semibold"
                              >
                                Retry Now
                              </button>
                            </div>
                            <p className="font-mono text-[11px] text-red-700 leading-relaxed break-words">
                              {job.error_message || 'The cloud runner was unable to extract or deliver results.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
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
