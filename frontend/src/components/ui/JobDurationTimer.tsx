import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import type { IngestionJobSummary } from '../../api/ingestion';

export const formatJobDuration = (job: IngestionJobSummary): string => {
  if (job.duration_formatted) return job.duration_formatted;
  if (job.duration_seconds && job.duration_seconds > 0) {
    const totalSec = Math.round(job.duration_seconds);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
  }
  if ((job.status === 'COMPLETED' || job.status === 'FAILED') && job.created_at && job.updated_at) {
    const start = new Date(job.created_at).getTime();
    const end = new Date(job.updated_at).getTime();
    const diffSec = Math.max(0, Math.round((end - start) / 1000));
    if (diffSec > 0) {
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      return mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;
    }
  }
  return '';
};

export const LiveTimer: React.FC<{ createdAt: string; className?: string }> = ({ createdAt, className }) => {
  const [elapsed, setElapsed] = useState<number>(() => {
    const start = new Date(createdAt).getTime();
    return isNaN(start) ? 0 : Math.max(0, Math.floor((Date.now() - start) / 1000));
  });

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    if (isNaN(start)) return;
    setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));

    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const formatted = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;

  return (
    <span className={className || 'inline-flex items-center gap-1 font-mono text-[10px]'}>
      <Clock className="w-2.5 h-2.5 animate-spin text-blue-500" />
      <span>{formatted}</span>
    </span>
  );
};

export const JobDurationBadge: React.FC<{ job: IngestionJobSummary }> = ({ job }) => {
  if (job.status === 'EXTRACTING') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-800 border border-blue-500/25"
        title="Extraction in progress"
      >
        <LiveTimer createdAt={job.created_at} />
      </span>
    );
  }

  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    const formatted = formatJobDuration(job);
    if (!formatted) return null;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-muted text-ink/75 border border-border"
        title={`Total extraction duration: ${formatted}`}
      >
        <Clock className="w-2.5 h-2.5 text-ink/50" />
        <span>{formatted}</span>
      </span>
    );
  }

  return null;
};
