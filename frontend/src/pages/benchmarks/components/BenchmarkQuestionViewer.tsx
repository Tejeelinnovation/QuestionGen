import React, { useState } from 'react';
import { X, Check, FileText, Code, Sparkles, AlertCircle, Clock, Zap, HardDrive, CheckCircle2 } from 'lucide-react';
import type { BenchmarkRunItem, BenchmarkQuestion } from '../../../api/benchmarks';

interface BenchmarkQuestionViewerProps {
  run: BenchmarkRunItem | null;
  onClose: () => void;
}

export const BenchmarkQuestionViewer: React.FC<BenchmarkQuestionViewerProps> = ({ run, onClose }) => {
  const [activeTab, setActiveTab] = useState<'paper' | 'raw'>('paper');

  if (!run) return null;

  const questions: BenchmarkQuestion[] = run.questions || [];

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="w-full max-w-3xl bg-bg h-full shadow-2xl flex flex-col overflow-hidden border-l border-border animate-slide-in-right">
        {/* Header */}
        <div className="p-6 bg-surface border-b border-border flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-pill text-xs font-mono font-semibold bg-forest/10 text-forest border border-forest/20">
                {run.model}
              </span>
              <span className="px-2.5 py-0.5 rounded-pill text-xs font-heading font-semibold bg-surface-muted text-ink/80 border border-border">
                {run.subject}
              </span>
              {run.is_valid_json ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-heading font-semibold bg-forest text-white">
                  <CheckCircle2 className="w-3 h-3" /> Valid JSON
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-heading font-semibold bg-ember text-white">
                  <AlertCircle className="w-3 h-3" /> Schema Warning
                </span>
              )}
            </div>
            <h2 className="font-heading font-bold text-xl text-ink">
              Generated Paper & Run Metrics
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-border bg-surface-muted hover:bg-surface text-ink/70 hover:text-ink cursor-pointer active:scale-95 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metrics Bar */}
        <div className="bg-surface-muted/60 border-b border-border px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-body">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-forest shrink-0" />
            <div>
              <p className="text-ink/50 text-[10px] uppercase font-mono">Inference Time</p>
              <p className="font-heading font-bold text-ink">{run.client_wall_time_sec}s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-ember shrink-0" />
            <div>
              <p className="text-ink/50 text-[10px] uppercase font-mono">Eval Speed</p>
              <p className="font-heading font-bold text-ink">{run.eval_tokens_per_sec} tok/s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-grape shrink-0" />
            <div>
              <p className="text-ink/50 text-[10px] uppercase font-mono">Peak VRAM</p>
              <p className="font-heading font-bold text-ink">{run.vram_mb ? `${run.vram_mb} MB` : 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-lime shrink-0" />
            <div>
              <p className="text-ink/50 text-[10px] uppercase font-mono">Tokens Out</p>
              <p className="font-heading font-bold text-ink">{run.eval_count} tokens</p>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4 bg-surface border-b border-border flex gap-2">
          <button
            onClick={() => setActiveTab('paper')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-heading font-semibold rounded-t-card border-b-2 cursor-pointer transition-all ${
              activeTab === 'paper'
                ? 'border-forest text-forest bg-forest/5'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            <FileText className="w-4 h-4" />
            Rendered Paper ({questions.length} questions)
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-heading font-semibold rounded-t-card border-b-2 cursor-pointer transition-all ${
              activeTab === 'raw'
                ? 'border-forest text-forest bg-forest/5'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            <Code className="w-4 h-4" />
            Raw Model JSON
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'paper' ? (
            questions.length > 0 ? (
              <div className="space-y-4">
                {questions.map((q, idx) => {
                  const qType = q.question_type || (q as any).answer_type || 'QUESTION';
                  const qText = q.question_text || (q as any).question || 'Question content missing';
                  const correctAns = q.correct_answer || (q as any).answer || '';
                  const options = q.options;

                  return (
                    <div
                      key={idx}
                      className="bg-surface border border-border rounded-card p-5 space-y-3 shadow-xs hover:border-forest/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-forest text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-pill text-[11px] font-heading font-semibold ${
                              qType === 'MCQ'
                                ? 'bg-grape/15 text-grape'
                                : qType === 'SHORT_ANSWER'
                                ? 'bg-forest/15 text-forest'
                                : 'bg-ember/15 text-ember'
                            }`}
                          >
                            {qType}
                          </span>
                          {q.difficulty && (
                            <span className="px-2 py-0.5 rounded-pill text-[10px] font-mono text-ink/60 bg-surface-muted border border-border">
                              {q.difficulty}
                            </span>
                          )}
                        </div>
                        {q.marks && (
                          <span className="text-xs font-mono font-bold text-ink/70">
                            {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                          </span>
                        )}
                      </div>

                      <p className="font-body text-sm text-ink leading-relaxed font-medium">
                        {qText}
                      </p>

                      {/* MCQ Options Rendering */}
                      {options && (
                        <div className="pt-2 space-y-1.5">
                          {Array.isArray(options) ? (
                            // Render array options
                            options.map((optStr, optIdx) => (
                              <div
                                key={optIdx}
                                className={`px-3 py-2 rounded-card text-xs font-body border flex items-center justify-between ${
                                  correctAns && optStr.includes(correctAns)
                                    ? 'bg-forest/10 border-forest/30 text-forest font-semibold'
                                    : 'bg-surface-muted/40 border-border text-ink/80'
                                }`}
                              >
                                <span>{optStr}</span>
                                {correctAns && optStr.includes(correctAns) && (
                                  <Check className="w-3.5 h-3.5 text-forest shrink-0" />
                                )}
                              </div>
                            ))
                          ) : typeof options === 'object' ? (
                            // Render dictionary options
                            Object.entries(options).map(([optKey, optVal]) => {
                              const isCorrect =
                                correctAns === optKey ||
                                correctAns.toLowerCase() === optKey.toLowerCase() ||
                                correctAns === optVal;

                              return (
                                <div
                                  key={optKey}
                                  className={`px-3.5 py-2 rounded-card text-xs font-body border flex items-center justify-between transition-colors ${
                                    isCorrect
                                      ? 'bg-forest/10 border-forest/30 text-forest font-semibold'
                                      : 'bg-surface-muted/40 border-border text-ink/80'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className={`w-5 h-5 rounded-full text-[11px] font-mono font-bold flex items-center justify-center ${
                                      isCorrect ? 'bg-forest text-white' : 'bg-surface border border-border text-ink/70'
                                    }`}>
                                      {optKey}
                                    </span>
                                    <span>{String(optVal)}</span>
                                  </div>
                                  {isCorrect && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-forest">
                                      <Check className="w-3.5 h-3.5" /> Correct
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          ) : null}
                        </div>
                      )}

                      {/* Short / Long Answer Model Solution */}
                      {correctAns && (!options || Array.isArray(options)) && (
                        <div className="pt-2">
                          <div className="p-3 bg-surface-muted/60 border border-border rounded-card text-xs font-body space-y-1">
                            <span className="text-[10px] font-mono uppercase text-ink/50 font-bold block">
                              Model Solution / Key Points:
                            </span>
                            <p className="text-ink/90 leading-relaxed">{correctAns}</p>
                          </div>
                        </div>
                      )}

                      {/* Source Reference */}
                      {q.source_reference && (
                        <div className="text-[10px] font-mono text-ink/40 pt-1">
                          Source: {q.source_reference}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 space-y-3 bg-surface border border-border rounded-card p-8">
                <AlertCircle className="w-8 h-8 text-ember mx-auto" />
                <h3 className="font-heading font-bold text-ink">No Questions Parsed</h3>
                <p className="text-xs text-ink/60 max-w-sm mx-auto">
                  {run.error || run.validation_error || 'The model did not return a valid question array conforming to the schema.'}
                </p>
                <button
                  onClick={() => setActiveTab('raw')}
                  className="px-4 py-2 rounded-pill bg-forest text-white font-heading text-xs font-semibold hover:bg-forest/90 transition-all cursor-pointer"
                >
                  View Raw Model Output
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-ink/60 uppercase">Raw Output Stream</span>
                <span className="text-[11px] font-mono text-ink/40">
                  {run.raw_response.length} characters
                </span>
              </div>
              <pre className="p-4 bg-ink text-lime font-mono text-xs rounded-card overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] border border-ink/20">
                {run.raw_response || '// Empty raw output'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
