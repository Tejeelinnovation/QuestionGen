import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  ArrowLeft,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { BenchmarkResultsResponse, BenchmarkRunItem } from '../../api/benchmarks';
import { BenchmarkQuestionViewer } from './components/BenchmarkQuestionViewer';

interface Props {
  data: BenchmarkResultsResponse;
  onRefresh?: () => void;
}

export const BenchmarkResultsDesktop: React.FC<Props> = ({ data }) => {
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
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-10 animate-fade-in font-body">
      {/* ── Top Header & Hardware Badge ── */}
      <div className="border-b border-border pb-6 flex flex-col xl:flex-row xl:items-start justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/super-admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-heading font-semibold bg-surface border border-border text-ink/70 hover:text-ink hover:border-forest/50 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Super Admin
            </Link>
            <span className="text-xs font-mono uppercase text-forest font-semibold bg-forest/10 px-2.5 py-1 rounded-pill border border-forest/20">
              Offline AI Fleet Benchmarks
            </span>
          </div>
          <div>
            <h1 className="font-heading font-bold text-3xl tracking-tight text-ink">
              Local SLM Empirical Evaluation
            </h1>
            <p className="text-sm text-ink/60 mt-1 max-w-2xl">
              Empirical inference results across 5 Small Language Models tested on 7 curriculum PDF datasets using local Ollama.
            </p>
          </div>
        </div>

        {/* Hardware Specification Card */}
        {data.hardware && (
          <div className="bg-surface border border-border rounded-card p-4 shadow-xs space-y-2 shrink-0 min-w-[340px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading font-bold text-ink flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-forest" /> {data.hardware.device}
              </span>
              <span className="font-mono text-[10px] text-forest font-bold bg-forest/10 px-2 py-0.5 rounded-pill">
                OFFLINE INFERENCE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-ink/70 pt-1 border-t border-border/60">
              <div>
                <span className="text-ink/40 block text-[10px]">GPU VRAM</span>
                <span className="font-semibold text-ink">{data.hardware.gpu}</span>
              </div>
              <div>
                <span className="text-ink/40 block text-[10px]">SYSTEM RAM</span>
                <span className="font-semibold text-ink">{data.hardware.ram}</span>
              </div>
              <div>
                <span className="text-ink/40 block text-[10px]">QUANTIZATION</span>
                <span className="font-semibold text-ink">{data.hardware.quantization}</span>
              </div>
              <div>
                <span className="text-ink/40 block text-[10px]">RUNTIME</span>
                <span className="font-semibold text-ink">{data.hardware.runtime}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bento Grid: Model Leaderboard Cards ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-xl text-ink flex items-center gap-2">
            <Trophy className="w-5 h-5 text-ember" /> Model Fleet Leaderboard
          </h2>
          <span className="text-xs font-mono text-ink/50">
            {data.runs.length} Total Runs Completed (100%)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {data.summary.map((m) => {
            const isWinner = m.model === 'qwen2.5:3b';
            const isSecond = m.model === 'llama3.2:3b';
            const isOffloaded = m.model.includes('7b');

            return (
              <div
                key={m.model}
                onClick={() => setSelectedModel(selectedModel === m.model ? 'ALL' : m.model)}
                className={`bg-surface border rounded-card p-5 space-y-4 shadow-xs transition-all cursor-pointer relative ${
                  selectedModel === m.model
                    ? 'border-forest ring-2 ring-forest/20'
                    : 'border-border hover:border-forest/40 hover:-translate-y-0.5'
                }`}
              >
                {/* Winner Pill */}
                {isWinner && (
                  <div className="absolute -top-3 left-4 bg-forest text-white text-[10px] font-heading font-bold px-2.5 py-0.5 rounded-pill shadow-xs flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-lime" /> TOP PICK / DAILY DRIVER
                  </div>
                )}
                {isSecond && (
                  <div className="absolute -top-3 left-4 bg-ember text-white text-[10px] font-heading font-bold px-2.5 py-0.5 rounded-pill shadow-xs flex items-center gap-1">
                    🥈 FAST RUNNER-UP
                  </div>
                )}

                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-base text-ink">{m.model}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-pill bg-surface-muted text-ink/70">
                      {m.valid_runs}/{m.total_runs} Pass
                    </span>
                  </div>
                  {isOffloaded && (
                    <span className="text-[10px] font-mono text-ember block font-medium">
                      ⚠️ CPU-Offloaded (Exceeds 4GB)
                    </span>
                  )}
                </div>

                {/* Primary Metric: Speed */}
                <div className="p-3 bg-surface-muted/50 rounded-card space-y-1">
                  <span className="text-[10px] font-mono text-ink/50 uppercase block">Inference Speed</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-heading font-black text-2xl text-ink">
                      {m.avg_tokens_per_sec}
                    </span>
                    <span className="text-xs font-mono text-ink/60">tok/s</span>
                  </div>
                </div>

                {/* Secondary Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-border/50">
                  <div>
                    <span className="text-[10px] text-ink/40 block">Avg Latency</span>
                    <span className="font-bold text-ink">{m.avg_latency_sec}s</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink/40 block">JSON Valid</span>
                    <span className={`font-bold ${m.json_success_pct === 100 ? 'text-forest' : 'text-ember'}`}>
                      {m.json_success_pct}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink/40 block">Peak VRAM</span>
                    <span className="font-bold text-ink">{m.peak_vram_mb} MB</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink/40 block">Schema Avg</span>
                    <span className="font-bold text-ink">{m.avg_compliance_pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <div className="bg-surface border border-border rounded-card p-5 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-heading font-bold text-ink uppercase tracking-wider">
              Filter by Model:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {modelsList.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedModel(m)}
                  className={`px-3 py-1 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer ${
                    selectedModel === m
                      ? 'bg-ink text-white'
                      : 'bg-surface-muted text-ink/70 hover:text-ink hover:bg-border/60'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subject or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs font-body rounded-pill border border-border bg-surface-muted/50 focus:bg-surface focus:outline-none focus:border-forest transition-colors"
            />
          </div>
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/60 overflow-x-auto pb-1">
          <span className="text-xs font-heading font-bold text-ink uppercase tracking-wider shrink-0">
            Subject:
          </span>
          <div className="flex gap-1.5 shrink-0">
            {subjectsList.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSubject(s)}
                className={`px-3 py-1 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer ${
                  selectedSubject === s
                    ? 'bg-forest text-white'
                    : 'bg-surface-muted text-ink/70 hover:text-ink hover:bg-border/60'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Runs Execution Table ── */}
      <div className="bg-surface border border-border rounded-card overflow-hidden shadow-xs">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-heading font-bold text-lg text-ink">
            Empirical Test Runs ({filteredRuns.length} of {data.runs.length})
          </h3>
          <span className="text-xs font-mono text-ink/40">
            Click any row to inspect the generated questions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-body">
            <thead>
              <tr className="bg-surface-muted/60 border-b border-border font-heading font-semibold text-ink/60 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-5">Model</th>
                <th className="py-3 px-5">Curriculum Subject</th>
                <th className="py-3 px-4">JSON Status</th>
                <th className="py-3 px-4 text-right">Speed</th>
                <th className="py-3 px-4 text-right">Latency</th>
                <th className="py-3 px-4 text-right">Tokens</th>
                <th className="py-3 px-4 text-right">Peak VRAM</th>
                <th className="py-3 px-4 text-right">Schema Score</th>
                <th className="py-3 px-5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRuns.map((r) => (
                <tr
                  key={r.run_key}
                  onClick={() => setInspectRun(r)}
                  className="hover:bg-forest/5 transition-colors cursor-pointer group"
                >
                  <td className="py-3.5 px-5 font-mono font-bold text-ink">
                    {r.model}
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="font-heading font-medium text-ink block">{r.subject}</span>
                    <span className="font-mono text-[10px] text-ink/40">{r.dataset_slug}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    {r.is_valid_json ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-[11px] font-heading font-semibold bg-forest/10 text-forest border border-forest/20">
                        <CheckCircle2 className="w-3 h-3" /> Valid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-[11px] font-heading font-semibold bg-ember/10 text-ember border border-ember/20">
                        <AlertCircle className="w-3 h-3" /> Error
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-ink">
                    {r.eval_tokens_per_sec} t/s
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-ink/80">
                    {r.client_wall_time_sec}s
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-ink/70">
                    {r.eval_count}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-ink/70">
                    {r.vram_mb ? `${r.vram_mb} MB` : 'N/A'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold">
                    <span className={r.compliance_pct > 80 ? 'text-forest' : r.compliance_pct > 0 ? 'text-ember' : 'text-ink/40'}>
                      {r.compliance_pct}%
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectRun(r);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-heading font-semibold text-ink/70 group-hover:bg-forest group-hover:text-white group-hover:border-forest transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Paper
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slide-in Paper Inspector ── */}
      {inspectRun && (
        <BenchmarkQuestionViewer run={inspectRun} onClose={() => setInspectRun(null)} />
      )}
    </div>
  );
};
