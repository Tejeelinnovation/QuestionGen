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
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchIngestionJobs,
  processIngestionChunk,
  deleteIngestionJob,
  exportJobJson,
  type IngestionJobSummary,
} from '../../api/ingestion';
import { UploadDocumentModal } from './UploadDocumentModal';
import { DatasetInspectionModal } from './DatasetInspectionModal';
import { SkeletonIngestionList } from '../../components/ui/skeleton';

export const DatasetIngestionPageMobile: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const isSuperAdmin = hasCapability('CREATE_SCHOOL') || !user?.school;

  const [jobs, setJobs] = useState<IngestionJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [inspectionJob, setInspectionJob] = useState<{ id: number; title: string } | null>(null);
  const [processingJobIds, setProcessingJobIds] = useState<Set<number>>(new Set());

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

  const handleAutoProcessAll = async (jobId: number) => {
    if (processingJobIds.has(jobId)) return;
    setProcessingJobIds((prev) => new Set(prev).add(jobId));

    let isDone = false;
    while (!isDone) {
      try {
        const res = await processIngestionChunk(jobId, 20);
        setJobs((prevJobs) =>
          prevJobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  processed_pages: res.processed_pages,
                  progress_percentage: res.progress_percentage,
                  status: res.status as any,
                  current_stage: res.current_stage,
                }
              : j
          )
        );

        if (res.is_finished || res.status === 'COMPLETED' || res.status === 'FAILED') {
          isDone = true;
        }
      } catch (err) {
        console.error(`Error processing chunk for job ${jobId}`, err);
        isDone = true;
      }
    }

    setProcessingJobIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });

    loadJobs();
  };

  const handleDeleteJob = async (jobId: number) => {
    if (!window.confirm('Remove this submission?')) return;
    try {
      await deleteIngestionJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (err) {
      alert('Failed to delete job.');
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
            Thank you! Your uploaded study materials help teachers build better question papers.
          </p>
        </div>
      )}

      {/* ── Submissions Queue ── */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs font-heading font-bold text-ink/60 uppercase tracking-wider px-1">
          <span>{isSuperAdmin ? 'Queue' : 'My Uploads'}</span>
          <span className="font-mono text-ink/40">{jobs.length} files</span>
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
                      {job.board || 'NCERT'} {job.standard ? `· Class ${job.standard}` : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-surface-muted text-ink/70">
                      {job.subject || 'General'}
                    </span>
                    {isSuperAdmin && (
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : job.status === 'FAILED'
                            ? 'bg-red-500/10 text-red-700'
                            : 'bg-amber-500/10 text-amber-700'
                        }`}
                      >
                        {job.status}
                      </span>
                    )}
                    {!isSuperAdmin && (
                      job.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-700">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Accepted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-blue-500/10 text-blue-700">
                          <Clock className="w-2.5 h-2.5" /> Under Review
                        </span>
                      )
                    )}
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
                        {job.current_stage || `${job.processed_pages}/${job.total_pages} pages`}
                      </span>
                      <span className="font-bold">{job.progress_percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          job.status === 'FAILED' ? 'bg-red-500' : 'bg-forest'
                        }`}
                        style={{ width: `${job.progress_percentage}%` }}
                      />
                    </div>
                    {job.status === 'FAILED' && job.error_message && (
                      <div className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200/60 mt-1 font-mono break-words">
                        {job.error_message}
                      </div>
                    )}
                  </div>
                )}


                {/* Action Controls (Touch-Friendly: min 38px height) */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-border/50">
                  {/* Left: Auto Extract / Resume (Super Admin) */}
                  <div className="flex items-center gap-1.5">
                    {isSuperAdmin && job.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleAutoProcessAll(job.id)}
                        disabled={isProcessing}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isProcessing ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Extracting...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Extract</span>
                          </>
                        )}
                      </button>
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
                      onClick={() => handleDeleteJob(job.id)}
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

