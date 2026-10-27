import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Trophy,
} from 'lucide-react';
import type { BenchmarkResultsResponse, BenchmarkRunItem } from '../../api/benchmarks';
import { BenchmarkQuestionViewer } from './components/BenchmarkQuestionViewer';

interface Props {
  data: BenchmarkResultsResponse;
  onRefresh?: () => void;
}

export const BenchmarkResultsMobile: React.FC<Props> = ({ data }) => {
  const [selectedModel, setSelectedModel] = useState<string>('ALL');
  const [inspectRun, setInspectRun] = useState<BenchmarkRunItem | null>(null);

  const modelsList = ['ALL', 'qwen2.5:3b', 'llama3.2:3b', 'phi3.5:latest', 'qwen2.5-coder:7b', 'qwen2.5:7b'];

  const filteredRuns = useMemo(() => {
    return data.runs.filter((run) => {
      const matchModel = selectedModel === 'ALL' || run.model === selectedModel;
      return matchModel;
    });
  }, [data.runs, selectedModel]);

  return (
    <div className="px-4 py-4 space-y-6 pb-24 animate-fade-in font-body">
      {/* ── Mobile Top Header ── */}
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <Link
            to="/dashboard/super-admin"
            className="inline-flex items-center gap-1 px-3 py-1 rounded-pill text-xs font-heading font-semibold bg-surface border border-border text-ink/70"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <span className="text-[10px] font-mono text-forest font-bold bg-forest/10 px-2.5 py-0.5 rounded-pill border border-forest/20">
            OFFLINE SLM FLEET
          </span>
        </div>

        <div>
          <h1 className="font-heading font-bold text-xl text-ink">
            SLM Benchmark Results
          </h1>
          <p className="text-xs text-ink/60 mt-0.5">
            Real offline inference benchmarks on ASUS TUF GTX 1650 (4GB VRAM).
          </p>
        </div>
      </div>

      {/* ── Horizontal Scrollable Model Summary Cards ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-heading font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-ember" /> Model Leaderboard
          </span>
          <span className="text-[10px] font-mono text-ink/40">Swipe ➔</span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
          {data.summary.map((m) => {
            const isWinner = m.model === 'qwen2.5:3b';
            const isSecond = m.model === 'llama3.2:3b';

            return (
              <div
                key={m.model}
                onClick={() => setSelectedModel(selectedModel === m.model ? 'ALL' : m.model)}
                className={`min-w-[200px] shrink-0 bg-surface border rounded-card p-3.5 space-y-2 shadow-xs snap-start transition-all ${
                  selectedModel === m.model
                    ? 'border-forest ring-2 ring-forest/20'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className="font-heading font-bold text-xs text-ink block">{m.model}</span>
                  {isWinner && (
                    <span className="text-[9px] font-heading font-bold text-forest bg-forest/10 px-1.5 py-0.5 rounded-pill">
                      Winner
                    </span>
                  )}
                  {isSecond && (
                    <span className="text-[9px] font-heading font-bold text-ember bg-ember/10 px-1.5 py-0.5 rounded-pill">
                      #2
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="font-heading font-black text-xl text-ink">
                    {m.avg_tokens_per_sec}
                  </span>
                  <span className="text-[10px] font-mono text-ink/50">tok/s</span>
                </div>

                <div className="flex justify-between text-[10px] font-mono text-ink/70 pt-1 border-t border-border/50">
                  <span>{m.avg_latency_sec}s avg</span>
                  <span className={m.json_success_pct === 100 ? 'text-forest font-bold' : 'text-ember'}>
                    {m.json_success_pct}% JSON
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Model Filter Pills ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        {modelsList.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedModel(m)}
            className={`px-3 py-1 rounded-pill text-[11px] font-heading font-semibold shrink-0 cursor-pointer ${
              selectedModel === m ? 'bg-ink text-white' : 'bg-surface border border-border text-ink/70'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ── Single-Column Mobile Run Cards ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-heading font-bold text-ink">
            Test Runs ({filteredRuns.length})
          </span>
          <span className="text-[10px] font-mono text-ink/40">Tap card to inspect</span>
        </div>

        <div className="space-y-2.5">
          {filteredRuns.map((r) => (
            <div
              key={r.run_key}
              onClick={() => setInspectRun(r)}
              className="bg-surface border border-border rounded-card p-3.5 space-y-2.5 shadow-xs active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-heading font-bold text-xs text-ink">{r.subject}</h4>
                  <span className="font-mono text-[10px] text-forest font-semibold">{r.model}</span>
                </div>
                {r.is_valid_json ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-heading font-semibold bg-forest/10 text-forest">
                    <CheckCircle2 className="w-2.5 h-2.5" /> OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-heading font-semibold bg-ember/10 text-ember">
                    <AlertCircle className="w-2.5 h-2.5" /> Warn
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-2 bg-surface-muted/60 rounded-card text-center font-mono text-xs">
                <div>
                  <span className="text-[8px] text-ink/40 uppercase block">Speed</span>
                  <span className="font-bold text-ink">{r.eval_tokens_per_sec} t/s</span>
                </div>
                <div>
                  <span className="text-[8px] text-ink/40 uppercase block">Latency</span>
                  <span className="font-bold text-ink">{r.client_wall_time_sec}s</span>
                </div>
                <div>
                  <span className="text-[8px] text-ink/40 uppercase block">Schema</span>
                  <span className="font-bold text-forest">{r.compliance_pct}%</span>
                </div>
              </div>
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
