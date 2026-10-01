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
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchIngestionJobs,
  deleteIngestionJob,
  exportJobJson,
  type IngestionJobSummary,
} from '../../api/ingestion';
import { UploadDocumentModal } from './UploadDocumentModal';
import { DatasetInspectionModal } from './DatasetInspectionModal';

export const DatasetIngestionPageMobile: React.FC = () => {
  const { user, hasCapability } = useAuth();
  const isSuperAdmin = hasCapability('CREATE_SCHOOL') || !user?.school;

  const [jobs, setJobs] = useState<IngestionJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [inspectionJob, setInspectionJob] = useState<{ id: number; title: string } | null>(null);

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

  return (
    <div className="w-full px-4 py-5 space-y-5 animate-in fade-in duration-200">
      {/* ── Mobile Header ── */}
      <div className="space-y-1">
        <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-forest">
          {isSuperAdmin ? 'AI Dataset' : 'Study Material'}
        </span>
        <h1 className="text-xl font-heading font-extrabold text-ink">
          {isSuperAdmin ? 'Document Ingestion' : 'Submit Material'}
        </h1>
        <p className="text-xs text-ink/60 font-body">
          {isSuperAdmin
            ? 'Process textbooks & notes for AI dataset extraction.'
            : 'Upload reference materials or notes for academic review.'}
        </p>
      </div>

      {/* ── Floating / Full-Width Upload Button ── */}
      <button
        onClick={() => setIsUploadOpen(true)}
        className="w-full py-3 px-4 rounded-xl bg-forest hover:bg-forest/90 text-white text-xs font-heading font-bold shadow-sm flex items-center justify-center gap-2 active:scale-98 transition-all"
      >
        <UploadCloud className="w-4 h-4" />
        <span>Upload PDF Document</span>
      </button>

      {/* Contributor Message */}
      {!isSuperAdmin && (
        <div className="p-3.5 rounded-xl border border-forest/20 bg-forest/5 flex items-start gap-2.5">
          <HeartHandshake className="w-4 h-4 text-forest shrink-0 mt-0.5" />
          <p className="text-[11px] text-ink/75 leading-relaxed font-body">
            Thank you! Your uploaded study materials help teachers build better question papers.
          </p>
        </div>
      )}

      {/* ── Submissions List ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-heading font-bold text-ink/60 uppercase tracking-wider px-1">
          <span>{isSuperAdmin ? 'Documents' : 'My Uploads'}</span>
          <span>{jobs.length}</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-ink/60 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-forest/30 border-t-forest rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-border bg-surface space-y-1.5">
            <FileText className="w-6 h-6 text-ink/30 mx-auto" />
            <p className="text-xs font-heading font-bold text-ink">No materials uploaded</p>
            <p className="text-[11px] text-ink/50">Tap the button above to upload a PDF</p>
          </div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className="p-4 rounded-xl border border-border bg-surface shadow-2xs space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-forest/10 text-forest">
                    {job.board || 'NCERT'} {job.standard ? `· Class ${job.standard}` : ''}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-surface-muted text-ink/70">
                    {job.subject || 'General'}
                  </span>
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
                <h3 className="text-xs font-heading font-bold text-ink leading-snug">{job.title}</h3>
              </div>

              {/* Progress on Mobile (Super Admin) */}
              {isSuperAdmin && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-ink/50 font-mono">
                    <span>{job.processed_pages}/{job.total_pages} pages</span>
                    <span>{job.progress_percentage}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-surface-muted overflow-hidden">
                    <div className="h-full bg-forest" style={{ width: `${job.progress_percentage}%` }} />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                {isSuperAdmin && (
                  <>
                    <button
                      onClick={() => setInspectionJob({ id: job.id, title: job.title })}
                      className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-heading font-semibold text-ink flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                    <button
                      onClick={() => handleDownloadJson(job)}
                      className="p-1.5 rounded-lg border border-border text-ink/70"
                      title="Download JSON"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDeleteJob(job.id)}
                  className="p-1.5 rounded-lg border border-border text-ink/40 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
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
