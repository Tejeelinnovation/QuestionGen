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

export const DatasetIngestionPageTablet: React.FC = () => {
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

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-6 animate-in fade-in duration-200">
      {/* ── Tablet Header Bar ── */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-forest">
              {isSuperAdmin ? 'AI Pipeline' : 'Material Submissions'}
            </span>
          </div>
          <h1 className="text-2xl font-heading font-extrabold text-ink tracking-tight">
            {isSuperAdmin ? 'Document Ingestion' : 'Contribute Study Material'}
          </h1>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold shadow-sm transition-all shrink-0 active:scale-95"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload PDF</span>
        </button>
      </div>

      {/* ── Tablet Super Admin Stats (2-column grid) ── */}
      {isSuperAdmin ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink/50">
              <span className="text-xs font-heading font-bold uppercase">Documents</span>
              <BookOpen className="w-4 h-4 text-forest" />
            </div>
            <p className="text-xl font-heading font-extrabold text-ink">{jobs.length}</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink/50">
              <span className="text-xs font-heading font-bold uppercase">Pages Processed</span>
              <Layers className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-xl font-heading font-extrabold text-ink">{totalPagesCount}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-forest/20 bg-forest/5 flex items-center gap-3">
          <HeartHandshake className="w-6 h-6 text-forest shrink-0" />
          <p className="text-xs text-ink/80 leading-relaxed font-body">
            Thank you for contributing! Your uploaded materials are reviewed by academic coordinators to expand test banks.
          </p>
        </div>
      )}

      {/* ── Tablet Document Cards ── */}
      <div className="space-y-3">
        <h2 className="text-xs font-heading font-bold text-ink/60 uppercase tracking-wider px-1">
          {isSuperAdmin ? 'Material Queue' : 'My Uploads'} ({jobs.length})
        </h2>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-ink/60 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-forest/30 border-t-forest rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border bg-surface space-y-2">
            <FileText className="w-8 h-8 text-ink/30 mx-auto" />
            <p className="text-xs font-heading font-bold text-ink">No documents submitted yet</p>
          </div>
        ) : (
          jobs.map((job) => {
            const isProcessing = processingJobIds.has(job.id);
            return (
              <div key={job.id} className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-forest/10 text-forest">
                        {job.board} {job.standard ? `Class ${job.standard}` : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-muted text-ink/70">
                        {job.subject}
                      </span>
                      {!isSuperAdmin && (
                        job.status === 'COMPLETED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Accepted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-700">
                            <Clock className="w-3 h-3" /> Under Review
                          </span>
                        )
                      )}
                    </div>
                    <h3 className="text-sm font-heading font-bold text-ink">{job.title}</h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSuperAdmin && (
                      <>
                        {job.status !== 'COMPLETED' && (
                          <button
                            onClick={() => handleAutoProcessAll(job.id)}
                            disabled={isProcessing}
                            className="p-2 rounded-xl bg-forest text-white hover:bg-forest/90"
                            title="Auto-extract all"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setInspectionJob({ id: job.id, title: job.title })}
                          className="p-2 rounded-xl border border-border bg-surface text-ink hover:bg-surface-muted"
                          title="Inspect Data"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadJson(job)}
                          className="p-2 rounded-xl border border-border bg-surface text-ink hover:bg-surface-muted"
                          title="Download JSON"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="p-2 rounded-xl border border-border text-ink/40 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-ink/50 font-mono">
                      <span>{job.current_stage || `${job.processed_pages}/${job.total_pages} pages`}</span>
                      <span>{job.progress_percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div className="h-full bg-forest" style={{ width: `${job.progress_percentage}%` }} />
                    </div>
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
