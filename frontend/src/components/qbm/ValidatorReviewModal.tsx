import React, { useState, useEffect } from 'react';
import { contentApi } from '../../api/content';
import type { Question, Topic, Difficulty } from '../../types';
import { ValidationStatusBadge } from './ValidationStatusBadge';
import { ValidationHistoryDrawer } from './ValidationHistoryDrawer';
import {
  X,
  Lock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  History,
  Save,
  Layers,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface ValidatorReviewModalProps {
  question: Question | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedQuestion: Question) => void;
}

export const ValidatorReviewModal: React.FC<ValidatorReviewModalProps> = ({
  question,
  isOpen,
  onClose,
  onUpdated,
}) => {
  // Metadata edit states
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [marks, setMarks] = useState<string>('1.00');
  const [variantMarks, setVariantMarks] = useState<Record<number, string>>({});
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);

  // Action dialog states
  const [activeAction, setActiveAction] = useState<'APPROVE' | 'SEND_FOR_CORRECTION' | 'REJECT' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    if (isOpen && question) {
      setDifficulty(question.difficulty);
      setMarks(String(question.marks));
      setFeedbackMessage(null);
      setActiveAction(null);
      setActionComment('');

      // Initialize topics
      const currentTopicIds = question.topics?.map((t) => t.id) || (question.topic ? [question.topic] : []);
      setSelectedTopicIds(currentTopicIds);

      // Initialize variant marks
      const vMarks: Record<number, string> = {};
      if (question.variants && question.variants.length > 0) {
        question.variants.forEach((v) => {
          if (v.id) vMarks[v.id] = String(v.marks);
        });
      }
      setVariantMarks(vMarks);

      // Fetch topics list for the chapter if available
      contentApi
        .getTopics()
        .then(setAvailableTopics)
        .catch(() => setAvailableTopics([]));
    }
  }, [isOpen, question]);

  if (!isOpen || !question) return null;

  const handleSaveMetadata = async () => {
    setIsSavingMetadata(true);
    setFeedbackMessage(null);
    try {
      const vMarksArray = Object.entries(variantMarks).map(([id, m]) => ({
        id: Number(id),
        marks: m,
      }));

      const updated = await contentApi.updateValidatorMetadata(question.id, {
        topic_ids: selectedTopicIds,
        difficulty: difficulty,
        marks: marks,
        variant_marks: vMarksArray.length > 0 ? vMarksArray : undefined,
      });

      setFeedbackMessage({ type: 'success', text: 'Question metadata updated and logged to audit trail.' });
      onUpdated(updated);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to update question metadata.',
      });
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleExecuteValidationAction = async () => {
    if (!activeAction) return;

    if ((activeAction === 'SEND_FOR_CORRECTION' || activeAction === 'REJECT') && actionComment.trim().length < 5) {
      setFeedbackMessage({
        type: 'error',
        text: 'A constructive comment with at least 5 characters is mandatory for this action.',
      });
      return;
    }

    setIsPerformingAction(true);
    setFeedbackMessage(null);

    try {
      const updated = await contentApi.validateQuestion(question.id, {
        action: activeAction,
        comment: actionComment.trim() || undefined,
      });

      setActiveAction(null);
      setActionComment('');
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to execute validation action.',
      });
    } finally {
      setIsPerformingAction(false);
    }
  };

  const toggleTopic = (tId: number) => {
    setSelectedTopicIds((prev) =>
      prev.includes(tId) ? prev.filter((id) => id !== tId) : [...prev, tId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-ink/40 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-surface border border-border rounded-card max-w-4xl w-full shadow-float my-8 flex flex-col max-h-[92vh] animate-scale-up overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-base text-ink">Validator Review</h3>
                <ValidationStatusBadge status={question.validation_status} revision={question.revision} />
              </div>
              <p className="text-[11px] font-mono text-ink/50">
                Question #{question.id} • {question.book_title || 'Central Bank'} • {question.chapter_title || 'General'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-pill border border-border bg-bg hover:bg-surface-muted text-ink/80 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Audit History</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`p-3 mx-5 mt-4 rounded-card text-xs flex items-center gap-2 border ${
              feedbackMessage.type === 'success'
                ? 'bg-forest/10 border-forest/20 text-forest'
                : 'bg-ember/10 border-ember/20 text-ember'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Top Grid: Permitted Metadata Editor (Left) vs Locked Question Content (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Col: Editable Metadata (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="font-mono text-xs font-semibold uppercase text-forest tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Editable Metadata
                </span>
                <span className="text-[10px] text-ink/50 font-mono">Validator Permission</span>
              </div>

              {/* Difficulty Selector */}
              <div className="space-y-1">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Difficulty Level
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`py-1.5 px-2 rounded-card text-xs font-medium border transition-all cursor-pointer ${
                        difficulty === d
                          ? 'bg-forest text-white border-forest shadow-xs'
                          : 'bg-bg text-ink/70 border-border hover:bg-surface-muted'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink/50 mt-1">
                  * Note: Difficulty will automatically cascade to all question variants upon save.
                </p>
              </div>

              {/* Marks Input */}
              <div className="space-y-1">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Question Marks
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-card bg-bg border border-border text-xs focus:border-forest focus:outline-none font-mono"
                />
              </div>

              {/* Variant Marks (If question has variants) */}
              {question.variants && question.variants.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Variant Marks Allocation
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-1">
                    {question.variants.map((v, idx) => (
                      <div
                        key={v.id || idx}
                        className="flex items-center justify-between gap-2 p-2 bg-bg border border-border rounded-card text-xs"
                      >
                        <span className="font-mono text-[11px] text-ink/70">
                          Var #{idx + 1} ({v.variant_type}):
                        </span>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          value={v.id ? variantMarks[v.id] || '' : ''}
                          onChange={(e) => {
                            if (v.id) {
                              const val = e.target.value;
                              setVariantMarks((prev) => ({ ...prev, [v.id!]: val }));
                            }
                          }}
                          className="w-20 px-2 py-1 rounded-sm bg-surface border border-border text-xs font-mono text-right focus:border-forest focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Multiple Topics Association */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Associated Curriculum Topics
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[30px] p-2 bg-bg rounded-card border border-border">
                  {selectedTopicIds.length === 0 && (
                    <span className="text-[11px] text-ink/40 font-mono">No topics tagged.</span>
                  )}
                  {selectedTopicIds.map((tId) => {
                    const topObj = availableTopics.find((t) => t.id === tId) || question.topics?.find((t) => t.id === tId);
                    const name = topObj?.name || `Topic #${tId}`;
                    return (
                      <span
                        key={tId}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] bg-surface border border-border text-ink font-medium shadow-2xs"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => toggleTopic(tId)}
                          className="text-ink/40 hover:text-ink cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>

                {availableTopics.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 p-1 bg-bg/50 rounded-card border border-border">
                    <span className="text-[10px] uppercase font-mono text-ink/50 px-1 block">
                      Toggle Available Topics:
                    </span>
                    {availableTopics.slice(0, 15).map((top) => {
                      const isSelected = selectedTopicIds.includes(top.id);
                      return (
                        <button
                          key={top.id}
                          type="button"
                          onClick={() => toggleTopic(top.id)}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-forest/10 text-forest font-semibold'
                              : 'text-ink/70 hover:bg-surface'
                          }`}
                        >
                          <span>{top.name}</span>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-forest" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Save Metadata Button */}
              <button
                type="button"
                onClick={handleSaveMetadata}
                disabled={isSavingMetadata}
                className="w-full py-2 px-3 text-xs font-heading font-semibold rounded-pill bg-surface text-ink border border-forest/40 hover:bg-forest hover:text-white transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingMetadata ? 'Saving Changes...' : 'Save Metadata Modifications'}</span>
              </button>
            </div>

            {/* Right Col: Locked Question Content (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="font-mono text-xs font-semibold uppercase text-ink/70 tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-ember" />
                  Locked Question Content
                </span>
                <span className="text-[10px] text-ember font-mono flex items-center gap-1">
                  Non-Editable for Validator
                </span>
              </div>

              <div className="bg-surface-muted/30 border border-border rounded-card p-3 text-[11px] text-ink/70 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-ember shrink-0 mt-0.5" />
                <span>
                  Validators are not permitted to edit question wording or options directly (PDF Section 8). If changes are needed, send back to the DEO with clear comments.
                </span>
              </div>

              {/* Question Text */}
              <div className="space-y-1">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Question Text ({question.question_type_display || question.question_type})
                </label>
                <div className="p-3.5 rounded-card bg-bg border border-border text-xs text-ink font-body whitespace-pre-wrap leading-relaxed">
                  {question.question_text}
                </div>
              </div>

              {/* Options (MCQ / MSQ) */}
              {question.options && Object.keys(question.options).length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Answer Options
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(question.options).map(([key, val]) => {
                      const isCorrect = String(question.correct_answer || '').includes(key);
                      return (
                        <div
                          key={key}
                          className={`p-2.5 rounded-card border text-xs flex items-start gap-2 ${
                            isCorrect
                              ? 'bg-forest/5 border-forest/40 text-ink'
                              : 'bg-bg border-border text-ink/80'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                              isCorrect
                                ? 'bg-forest text-white'
                                : 'bg-surface border border-border text-ink/60'
                            }`}
                          >
                            {key}
                          </span>
                          <span className="mt-0.5 leading-snug">{String(val)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Correct Answer & Explanation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Correct Answer
                  </label>
                  <div className="p-2.5 rounded-card bg-bg border border-border text-xs font-mono font-bold text-forest">
                    {question.correct_answer || 'N/A'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Source / Reference
                  </label>
                  <div className="p-2.5 rounded-card bg-bg border border-border text-xs text-ink/70 font-mono">
                    {question.source_reference || 'N/A'}
                  </div>
                </div>
              </div>

              {question.explanation && (
                <div className="space-y-1 pt-1">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Explanation / Solution Rubric
                  </label>
                  <div className="p-3 rounded-card bg-bg border border-border text-xs text-ink/80 leading-relaxed">
                    {question.explanation}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger Modal / Confirmation Area */}
          {activeAction && (
            <div className="p-4 rounded-card border border-border bg-surface shadow-md space-y-3 animate-slide-up">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  {activeAction === 'APPROVE' && <CheckCircle2 className="w-4 h-4 text-forest" />}
                  {activeAction === 'SEND_FOR_CORRECTION' && <AlertTriangle className="w-4 h-4 text-ember" />}
                  {activeAction === 'REJECT' && <XCircle className="w-4 h-4 text-red-600" />}
                  <span className="font-heading font-bold text-sm text-ink">
                    {activeAction === 'APPROVE'
                      ? 'Approve Question into Question Bank'
                      : activeAction === 'SEND_FOR_CORRECTION'
                      ? 'Send Back to DEO for Content Correction'
                      : 'Reject Question from Bank'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAction(null)}
                  className="text-ink/40 hover:text-ink cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-heading font-semibold text-ink mb-1">
                  {activeAction === 'APPROVE'
                    ? 'Optional Approval Note'
                    : 'Mandatory Feedback / Correction Instructions *'}
                </label>
                <textarea
                  rows={3}
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder={
                    activeAction === 'APPROVE'
                      ? 'Add any optional validation notes...'
                      : 'Specify precisely what needs correction by the author (options, clarity, diagram, formula)...'
                  }
                  className="w-full p-2.5 text-xs rounded-card bg-bg border border-border text-ink focus:border-forest focus:outline-none"
                />
                {(activeAction === 'SEND_FOR_CORRECTION' || activeAction === 'REJECT') && (
                  <p className="text-[10px] text-ink/50 mt-1">
                    At least 5 characters required ({actionComment.trim().length}/5).
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActiveAction(null)}
                  className="px-3 py-1.5 text-xs font-medium rounded-pill border border-border hover:bg-surface-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteValidationAction}
                  disabled={
                    isPerformingAction ||
                    ((activeAction === 'SEND_FOR_CORRECTION' || activeAction === 'REJECT') &&
                      actionComment.trim().length < 5)
                  }
                  className={`px-4 py-1.5 text-xs font-heading font-semibold rounded-pill text-white transition-all shadow-xs cursor-pointer disabled:opacity-50 ${
                    activeAction === 'APPROVE'
                      ? 'bg-forest hover:bg-forest/90'
                      : activeAction === 'SEND_FOR_CORRECTION'
                      ? 'bg-ember hover:bg-ember/90'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isPerformingAction ? 'Processing...' : `Confirm ${activeAction.replace(/_/g, ' ')}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Action Matrix Buttons */}
        <div className="p-4 sm:p-5 border-t border-border flex flex-wrap items-center justify-between gap-3 bg-surface-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/60 font-mono">
              Author: {question.created_by_username || 'DEO Staff'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveAction('REJECT')}
              className="px-3 py-2 text-xs font-heading font-semibold rounded-pill border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
            >
              Reject Question
            </button>

            <button
              type="button"
              onClick={() => setActiveAction('SEND_FOR_CORRECTION')}
              className="px-3.5 py-2 text-xs font-heading font-semibold rounded-pill border border-ember/30 text-ember bg-ember/10 hover:bg-ember/20 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Send for Correction</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAction('APPROVE')}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approve Question</span>
            </button>
          </div>
        </div>
      </div>

      {/* Validation History Drawer */}
      <ValidationHistoryDrawer
        questionId={question.id}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
    </div>
  );
};
