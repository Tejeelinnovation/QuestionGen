import React, { useState, useEffect } from 'react';
import { contentApi } from '../../api/content';
import type { Question, QuestionPreview } from '../../types';
import { CustomSelect } from '../ui/custom-select';

interface QuestionReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetQuestion: QuestionPreview | null;
  targetIndex?: number;
  existingQuestionIds: number[];
  onSelectReplacement: (replacement: QuestionPreview, targetIndex?: number) => void;
}

export const QuestionReplaceModal: React.FC<QuestionReplaceModalProps> = ({
  isOpen,
  onClose,
  targetQuestion,
  targetIndex,
  existingQuestionIds,
  onSelectReplacement,
}) => {
  const [candidates, setCandidates] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchSameTopic, setMatchSameTopic] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');

  useEffect(() => {
    if (!isOpen || !targetQuestion) {
      setCandidates([]);
      setError(null);
      setSearchQuery('');
      return;
    }

    const fetchAlternatives = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params: Record<string, any> = {
          marks: targetQuestion.marks,
          question_type: targetQuestion.question_type,
        };
        if (matchSameTopic && targetQuestion.topic) {
          params.topic_id = targetQuestion.topic;
        }

        const data = await contentApi.getQuestions(params);
        const list = Array.isArray(data) ? data : (data.results || []);
        // Exclude currently used questions in the review list
        const filtered = list.filter((q) => !existingQuestionIds.includes(q.id));
        setCandidates(filtered);
      } catch (err: any) {
        console.error('Failed to fetch replacement questions:', err);
        setError('Failed to fetch alternative questions from question bank.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlternatives();
  }, [isOpen, targetQuestion, matchSameTopic, existingQuestionIds]);

  if (!isOpen || !targetQuestion) return null;

  const filteredCandidates = candidates.filter((q) => {
    if (selectedDifficulty !== 'ALL' && q.difficulty !== selectedDifficulty) {
      return false;
    }
    if (searchQuery.trim()) {
      const qText = q.question_text.toLowerCase();
      if (!qText.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const handlePick = (q: Question) => {
    const previewItem: QuestionPreview = {
      id: q.id,
      topic: q.topic,
      topic_name: q.topic_name,
      chapter_title: q.chapter_title,
      subject: (q as any).subject,
      question_text: q.question_text,
      question_type: q.question_type,
      question_type_display: q.question_type_display,
      marks: q.marks,
      difficulty: q.difficulty,
      difficulty_display: q.difficulty_display,
      learner_level: q.learner_level,
      learner_level_display: q.learner_level_display,
      bank_source: q.bank_source as any,
      variants_count: q.variants_count,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      source_reference: q.source_reference,
    };
    onSelectReplacement(previewItem, targetIndex);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-bg/50">
          <div>
            <h3 className="font-heading font-semibold text-lg text-ink flex items-center gap-2">
              <span>🔄 Replace Question</span>
              {targetIndex !== undefined && (
                <span className="font-mono text-xs px-2 py-0.5 rounded-sm bg-forest/10 text-forest font-bold">
                  #{targetIndex + 1}
                </span>
              )}
            </h3>
            <p className="text-xs text-ink/60 mt-0.5">
              Select an alternative {targetQuestion.marks}-mark{' '}
              <span className="font-medium text-ink">{targetQuestion.question_type_display || targetQuestion.question_type}</span> question from the bank to replace this item.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-pill text-ink/50 hover:text-ink hover:bg-surface transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Current Question Snapshot Reference */}
        <div className="px-5 py-3 bg-amber-500/5 border-b border-border/80 flex items-start gap-3 text-xs">
          <span className="font-semibold text-amber-600 dark:text-amber-400 shrink-0 uppercase tracking-wider text-[10px]">
            Replacing:
          </span>
          <p className="text-ink/80 line-clamp-2 italic font-serif">
            "{targetQuestion.question_text}"
          </p>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-4 border-b border-border/60 bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchSameTopic}
                onChange={(e) => setMatchSameTopic(e.target.checked)}
                className="rounded border-border text-forest focus:ring-forest"
              />
              <span className="font-medium text-ink/80">Same topic only</span>
            </label>

            <div className="flex items-center gap-1.5 min-w-[150px]">
              <span className="text-ink/50 font-mono text-[11px] whitespace-nowrap">Difficulty:</span>
              <CustomSelect
                value={selectedDifficulty}
                onChange={(val) => setSelectedDifficulty(val)}
                options={[
                  { value: 'ALL', label: 'All Difficulties' },
                  { value: 'EASY', label: 'Easy' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HARD', label: 'Hard' },
                ]}
                placeholder="Difficulty..."
                className="w-36"
                triggerClassName="py-1 px-2.5 text-xs"
              />
            </div>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search alternative questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs border border-border rounded-md px-3 py-1.5 bg-bg text-ink placeholder:text-ink/40 focus:outline-hidden focus:border-forest"
            />
          </div>
        </div>

        {/* Body / List of Candidates */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[300px]">
          {isLoading ? (
            <div className="py-16 text-center space-y-2">
              <div className="inline-block animate-spin w-6 h-6 border-2 border-forest border-t-transparent rounded-full" />
              <p className="text-xs text-ink/60 font-mono">Finding matching questions in bank...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs text-center">
              {error}
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="text-3xl">🔍</div>
              <h4 className="font-heading font-medium text-sm text-ink">No other matching questions found</h4>
              <p className="text-xs text-ink/60 max-w-md mx-auto">
                No alternative questions matching {targetQuestion.marks} marks ({targetQuestion.question_type_display || targetQuestion.question_type})
                {matchSameTopic ? ' in this topic' : ''} were found in the question bank that aren't already included.
              </p>
              {matchSameTopic && (
                <button
                  type="button"
                  onClick={() => setMatchSameTopic(false)}
                  className="mt-2 text-xs font-semibold text-forest underline hover:opacity-80 cursor-pointer"
                >
                  Try searching across all topics for this subject
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[11px] font-mono text-ink/50 px-1">
                <span>Showing {filteredCandidates.length} available alternatives</span>
                <span>Click "Replace" to swap</span>
              </div>
              {filteredCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-4 rounded-lg border border-border bg-bg/40 hover:border-forest/50 hover:bg-forest/5 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-forest/10 text-forest">
                        {cand.marks} {Number(cand.marks) === 1 ? 'Mark' : 'Marks'}
                      </span>
                      <span className="pill pill-muted text-[10px]">
                        {cand.difficulty_display || cand.difficulty}
                      </span>
                      <span className="pill text-[10px] pill-forest">
                        {cand.question_type_display || cand.question_type}
                      </span>
                      {cand.topic_name && (
                        <span className="text-[11px] text-ink/60 font-medium">
                          Topic: <span className="text-ink">{cand.topic_name}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-serif text-ink leading-relaxed">
                      {cand.question_text}
                    </p>

                    {/* MCQ Options preview if present */}
                    {cand.question_type === 'MCQ' && cand.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-xs font-mono">
                        {Object.entries(cand.options).map(([optKey, optVal]) => (
                          <div
                            key={optKey}
                            className="px-2 py-1 rounded-sm bg-surface border border-border/60 text-ink/80 flex items-center gap-1.5 truncate"
                          >
                            <span className="font-bold text-ink">{optKey}.</span>
                            <span className="truncate">{String(optVal)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePick(cand)}
                      className="w-full sm:w-auto px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>Replace</span>
                      <span>🔄</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-bg/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-heading font-medium rounded-pill border border-border text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
