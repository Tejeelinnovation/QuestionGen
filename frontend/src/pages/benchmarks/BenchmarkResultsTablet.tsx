import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  ArrowLeft,
  Trophy,
} from 'lucide-react';
import type { BenchmarkResultsResponse, BenchmarkRunItem } from '../../api/benchmarks';
import { BenchmarkQuestionViewer } from './components/BenchmarkQuestionViewer';

interface Props {
  data: BenchmarkResultsResponse;
  onRefresh?: () => void;
}

export const BenchmarkResultsTablet: React.FC<Props> = ({ data }) => {
  const [selectedModel, setSelectedModel] = useState<string>('ALL');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectRun, setInspectRun] = useState<BenchmarkRunItem | null>(null);

  const modelsList = ['ALL', 'qwen2.5:3b', 'llama3.2:3b', 'phi3.5:latest', 'qwen2.5-coder:7b', 'qwen2.5:7b'];
  const subjectsList = [
    'ALL',
    'Computer Science (Python)',
    'Chemistry',
    'Accountancy / Economics',
    'Sociology',
    'Hindi Literature',
    'Biology (Hindi)',
    'Sanskrit (Shemushi)',
  ];

  const filteredRuns = useMemo(() => {
    return data.runs.filter((run) => {
      const matchModel = selectedModel === 'ALL' || run.model === selectedModel;
      const matchSubject = selectedSubject === 'ALL' || run.subject === selectedSubject;
      const matchSearch =
        !searchQuery ||
        run.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        run.subject.toLowerCase().includes(searchQuery.toLowerCase());
      return matchModel && matchSubject && matchSearch;
    });
  }, [data.runs, selectedModel, selectedSubject, searchQuery]);

  return (
    <div className="px-6 py-6 space-y-8 animate-fade-in font-body">
      {/* ── Top Header ── */}
      <div className="border-b border-border pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <Link
            to="/dashboard/super-admin"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-heading font-semibold bg-surface border border-border text-ink/70 hover:text-ink cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <span className="text-xs font-mono uppercase text-forest font-semibold bg-forest/10 px-2.5 py-1 rounded-pill border border-forest/20">
            Offline SLM Fleet
          </span>
        </div>

        <div>
          <h1 className="font-heading font-bold text-2xl text-ink">
            Local SLM Empirical Evaluation
          </h1>
          <p className="text-xs text-ink/60 mt-0.5">
            GTX 1650 (4GB) benchmark results across 5 candidate models and 7 real curriculum datasets.
          </p>
        </div>

        {/* Hardware chip */}
        {data.hardware && (
          <div className="bg-surface border border-border rounded-card p-3 grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-ink/40 text-[10px] block">DEVICE / GPU</span>
              <span className="font-semibold text-ink">{data.hardware.device} (GTX 1650)</span>
            </div>
            <div>
              <span className="text-ink/40 text-[10px] block">ENGINE / FORMAT</span>
              <span className="font-semibold text-ink">{data.hardware.runtime} (Q4_K_M)</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2-Column Model Cards Grid ── */}
      <div className="space-y-3">
        <h2 className="font-heading font-bold text-lg text-ink flex items-center gap-2">
          <Trophy className="w-4 h-4 text-ember" /> Model Leaderboard
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {data.summary.map((m) => {
            const isWinner = m.model === 'qwen2.5:3b';
            const isSecond = m.model === 'llama3.2:3b';

            return (
              <div
                key={m.model}
                onClick={() => setSelectedModel(selectedModel === m.model ? 'ALL' : m.model)}
                className={`bg-surface border rounded-card p-4 space-y-3 shadow-xs cursor-pointer transition-all ${
                  selectedModel === m.model
                    ? 'border-forest ring-2 ring-forest/20'
                    : 'border-border hover:border-forest/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-heading font-bold text-sm text-ink block">{m.model}</span>
                    {isWinner && (
                      <span className="text-[10px] font-heading font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-pill inline-block mt-0.5">
                        🌟 Recommended Driver
                      </span>
                    )}
                    {isSecond && (
                      <span className="text-[10px] font-heading font-bold text-ember bg-ember/10 px-2 py-0.5 rounded-pill inline-block mt-0.5">
                        🥈 Fast Runner-up
                      </span>
                    )}
                  </div>
                  <span className="font-heading font-bold text-lg text-ink">
                    {m.avg_tokens_per_sec} <span className="text-[10px] font-mono text-ink/50 font-normal">t/s</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-border/50">
                  <div>
                    <span className="text-ink/40 block text-[10px]">Avg Latency</span>
                    <span className="font-bold text-ink">{m.avg_latency_sec}s</span>
                  </div>
                  <div>
                    <span className="text-ink/40 block text-[10px]">JSON Valid</span>
                    <span className={`font-bold ${m.json_success_pct === 100 ? 'text-forest' : 'text-ember'}`}>
                      {m.json_success_pct}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="bg-surface border border-border rounded-card p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search subject or model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs font-body rounded-pill border border-border bg-surface-muted/50 focus:bg-surface focus:outline-none focus:border-forest transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-heading font-bold text-ink shrink-0">Model:</span>
          {modelsList.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedModel(m)}
              className={`px-3 py-1 rounded-pill text-xs font-heading font-semibold shrink-0 cursor-pointer ${
                selectedModel === m ? 'bg-ink text-white' : 'bg-surface-muted text-ink/70'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-border/50">
          <span className="text-xs font-heading font-bold text-ink shrink-0">Subject:</span>
          {subjectsList.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSubject(s)}
              className={`px-2.5 py-0.5 rounded-pill text-xs font-heading shrink-0 cursor-pointer ${
                selectedSubject === s ? 'bg-forest text-white' : 'bg-surface-muted text-ink/70'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tablet 2-Column Run Cards ── */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-base text-ink">
          Test Runs ({filteredRuns.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredRuns.map((r) => (
            <div
              key={r.run_key}
              onClick={() => setInspectRun(r)}
              className="bg-surface border border-border rounded-card p-4 space-y-3 shadow-xs hover:border-forest/40 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-heading font-bold text-sm text-ink block">{r.subject}</span>
                  <span className="font-mono text-[11px] text-forest font-semibold">{r.model}</span>
                </div>
                {r.is_valid_json ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-heading font-semibold bg-forest/10 text-forest">
                    <CheckCircle2 className="w-3 h-3" /> Valid
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-heading font-semibold bg-ember/10 text-ember">
                    <AlertCircle className="w-3 h-3" /> Warning
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center p-2 bg-surface-muted/60 rounded-card text-xs font-mono">
                <div>
                  <span className="text-[9px] text-ink/40 uppercase block">Speed</span>
                  <span className="font-bold text-ink">{r.eval_tokens_per_sec} t/s</span>
                </div>
                <div>
                  <span className="text-[9px] text-ink/40 uppercase block">Latency</span>
                  <span className="font-bold text-ink">{r.client_wall_time_sec}s</span>
                </div>
                <div>
                  <span className="text-[9px] text-ink/40 uppercase block">Schema</span>
                  <span className="font-bold text-forest">{r.compliance_pct}%</span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInspectRun(r);
                }}
                className="w-full py-1.5 rounded-pill bg-surface border border-border text-xs font-heading font-semibold text-ink/80 hover:bg-forest hover:text-white hover:border-forest transition-colors flex items-center justify-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" /> View Generated Paper
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Slide-in Paper Inspector ── */}
      {inspectRun && (
        <BenchmarkQuestionViewer run={inspectRun} onClose={() => setInspectRun(null)} />
      )}
    </div>
  );
};
