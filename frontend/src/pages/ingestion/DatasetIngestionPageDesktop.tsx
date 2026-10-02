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
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchIngestionJobs,
  processIngestionChunk,
  deleteIngestionJob,
  type IngestionJobSummary,
  exportJobJson,
} from '../../api/ingestion';
import { UploadDocumentModal } from './UploadDocumentModal';
import { DatasetInspectionModal } from './DatasetInspectionModal';
import { SkeletonIngestionList } from '../../components/ui/skeleton';

export const DatasetIngestionPageDesktop: React.FC = () => {
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
              <h3 className="text-sm font-heading font-bold text-ink">Thank you for contributing!</h3>
              <p className="text-xs text-ink/70 mt-0.5">
                Uploaded materials are reviewed by academic coordinators. Your contributions help build better exam papers.
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
          <h2 className="text-sm font-heading font-bold text-ink">
            {isSuperAdmin ? 'Uploaded Material Library' : 'My Uploaded Documents'}
          </h2>
          <span className="text-xs text-ink/50">{jobs.length} items</span>
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
                          {job.board || 'NCERT'} {job.standard ? `· Class ${job.standard}` : ''}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted text-ink/70 border border-border">
                          {job.subject || 'General'}
                        </span>
                        {job.document_kind === 'HANDWRITTEN_NOTES' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-700 border border-amber-500/20">
                            HANDWRITTEN
                          </span>
                        )}
                        {/* Contributor Status Badge */}
                        {!isSuperAdmin && (
                          job.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Verified & Accepted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-700 border border-blue-500/20">
                              <Clock className="w-3 h-3" /> Under Review
                            </span>
                          )
                        )}
                      </div>
                      <h3 className="text-sm font-heading font-bold text-ink">{job.title}</h3>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Super Admin Exclusive Controls */}
                      {isSuperAdmin && (
                        <>
                          {job.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleAutoProcessAll(job.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-xl bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              {isProcessing ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3" />
                                  <span>Auto-Extract All</span>
                                </>
                              )}
                            </button>
                          )}

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
                        onClick={() => handleDeleteJob(job.id)}
                        className="p-2 rounded-xl border border-border hover:bg-red-50 text-ink/40 hover:text-red-600 transition-all shadow-xs"
                        title="Remove submission"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar (Super Admin shows percentage; Contributor shows simple bar) */}
                  {isSuperAdmin && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-ink/60">
                        <span className="font-mono flex items-center gap-1.5 truncate max-w-[80%]">
                          {job.current_stage?.includes('Google Drive') && (
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                          )}
                          {job.current_stage || `${job.processed_pages} of ${job.total_pages} pages processed`}
                        </span>
                        <span className="font-mono font-bold text-ink">
                          {job.progress_percentage}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden border border-border/50">
                        <div
                          className={`h-full transition-all duration-300 ${
                            job.status === 'COMPLETED'
                              ? 'bg-forest'
                              : job.status === 'FAILED'
                              ? 'bg-red-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${job.progress_percentage}%` }}
                        />
                      </div>
                      {job.status === 'FAILED' && job.error_message && (
                        <div className="text-[11px] text-red-600 bg-red-50 px-2.5 py-1 rounded-md border border-red-200/60 mt-1 font-mono break-words">
                          {job.error_message}
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
