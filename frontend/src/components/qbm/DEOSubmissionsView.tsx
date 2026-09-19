import React, { useState, useEffect } from 'react';
import { contentApi } from '../../api/content';
import type { Question } from '../../types';
import { ValidationStatusBadge } from './ValidationStatusBadge';
import { ValidationHistoryDrawer } from './ValidationHistoryDrawer';
import {
  AlertTriangle,
  Send,
  Edit3,
  History,
  CheckCircle2,
  Clock,
  X,
  Plus,
  Layers,
  Search,
} from 'lucide-react';
import { Pagination } from '../ui/pagination';
import { SkeletonSubmissionsList } from '../ui/skeleton';
import { getStaggerDelay, CARD_MOTION } from '../../lib/motion';
import { useToast } from '../../context/ToastContext';

interface DEOSubmissionsViewProps {
  onNewQuestionClick?: () => void;
}

export const DEOSubmissionsView: React.FC<DEOSubmissionsViewProps> = ({
  onNewQuestionClick,
}) => {
  const toast = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(8);
  const [activeFilterTab, setActiveFilterTab] = useState<'ALL' | 'CORRECTION' | 'PENDING' | 'APPROVED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);

  // Resubmit Modal state
  const [resubmittingQuestion, setResubmittingQuestion] = useState<Question | null>(null);
  const [resubmitText, setResubmitText] = useState('');
  const [resubmitOptions, setResubmitOptions] = useState<{ key: string; text: string }[]>([]);
  const [resubmitAnswer, setResubmitAnswer] = useState('');
  const [resubmitExplanation, setResubmitExplanation] = useState('');
  const [resubmitComment, setResubmitComment] = useState('');
  const [isSubmittingResubmit, setIsSubmittingResubmit] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  const fetchQuestions = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {
        page: currentPage,
        page_size: pageSize,
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      if (activeFilterTab === 'CORRECTION') {
        params.validation_status = 'CORRECTION_REQUIRED';
      } else if (activeFilterTab === 'PENDING') {
        params.validation_status = 'SUBMITTED';
      } else if (activeFilterTab === 'APPROVED') {
        params.validation_status = 'APPROVED';
      }

      const res = await contentApi.getQuestions(params);
      setQuestions(res.results);
      setTotalCount(res.count);
    } catch (err) {
      console.error('Failed to fetch DEO submissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [currentPage, activeFilterTab, searchTerm]);

  const handleOpenResubmit = (q: Question) => {
    setResubmittingQuestion(q);
    setResubmitText(q.question_text || '');
    setResubmitAnswer(q.correct_answer || '');
    setResubmitExplanation(q.explanation || '');
    setResubmitComment('');
    setResubmitError(null);

    if (q.options && typeof q.options === 'object') {
      const optList = Object.entries(q.options).map(([key, text]) => ({
        key,
        text: String(text),
      }));
      setResubmitOptions(optList);
    } else {
      setResubmitOptions([]);
    }
  };

  const handleExecuteResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resubmittingQuestion) return;

    if (!resubmitText.trim()) {
      setResubmitError('Question text cannot be empty.');
      return;
    }

    let formattedOptions: Record<string, string> | undefined = undefined;
    if (resubmitOptions.length > 0) {
      formattedOptions = {};
      resubmitOptions.forEach((o) => {
        formattedOptions![o.key] = o.text.trim();
      });
    }

    setIsSubmittingResubmit(true);
    setResubmitError(null);

    try {
      await contentApi.resubmitQuestion(resubmittingQuestion.id, {
        question_text: resubmitText.trim(),
        options: formattedOptions,
        correct_answer: resubmitAnswer.trim() || undefined,
        explanation: resubmitExplanation.trim() || undefined,
        comment: resubmitComment.trim() || undefined,
      });

      toast.success(`Question #${resubmittingQuestion.id} successfully updated and resubmitted for validation!`);
      setResubmittingQuestion(null);
      fetchQuestions();
    } catch (err: any) {
      const errText = err.response?.data?.detail || 'Failed to resubmit question.';
      setResubmitError(errText);
      toast.error(errText);
    } finally {
      setIsSubmittingResubmit(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="font-heading font-bold text-lg text-ink flex items-center gap-2">
            <span>My Submitted Questions</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-pill bg-forest/10 text-forest border border-forest/20">
              {totalCount} Total
            </span>
          </h2>
          <p className="text-xs text-ink/70 mt-0.5">
            Track your authored questions through validator review, addressing feedback and resubmitting revisions.
          </p>
        </div>

        {onNewQuestionClick && (
          <button
            type="button"
            onClick={onNewQuestionClick}
            className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Enter New Question</span>
          </button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab('ALL');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-all cursor-pointer ${
              activeFilterTab === 'ALL'
                ? 'bg-ink text-white font-semibold'
                : 'bg-surface border border-border text-ink/70 hover:bg-surface-muted'
            }`}
          >
            All Submissions
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab('CORRECTION');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilterTab === 'CORRECTION'
                ? 'bg-ember text-white font-semibold shadow-xs'
                : 'bg-ember/10 border border-ember/20 text-ember hover:bg-ember/20'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Needs Correction</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab('PENDING');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilterTab === 'PENDING'
                ? 'bg-amber-600 text-white font-semibold shadow-xs'
                : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Pending Validation</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveFilterTab('APPROVED');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilterTab === 'APPROVED'
                ? 'bg-forest text-white font-semibold shadow-xs'
                : 'bg-forest/10 border border-forest/20 text-forest hover:bg-forest/20'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Approved Bank</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search questions..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-8 py-1.5 rounded-pill bg-surface border border-border text-xs text-ink focus:border-forest focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer p-0.5"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Questions Listing */}
      {isLoading ? (
        <SkeletonSubmissionsList count={4} />
      ) : questions.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border rounded-lg bg-surface p-8 space-y-2 shadow-card">
          <span className="pill pill-forest text-xs">Submissions Ready</span>
          <Layers className="w-8 h-8 text-ink/30 mx-auto" />
          <p className="text-sm font-heading font-semibold text-ink">No questions found in this view</p>
          <p className="text-xs text-ink/60 max-w-sm mx-auto">
            Questions you submit will appear here with their live review status.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, idx) => {
            const needsCorrection = q.validation_status === 'CORRECTION_REQUIRED';

            return (
              <div
                key={q.id}
                style={getStaggerDelay(idx)}
                className={`bg-surface border rounded-card shadow-xs transition-all overflow-hidden ${CARD_MOTION.interactive} ${
                  needsCorrection
                    ? 'border-ember/40 ring-1 ring-ember/20'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                {/* Correction Feedback Banner (PDF Section 15) */}
                {needsCorrection && (
                  <div className="bg-ember/10 border-b border-ember/20 p-3 sm:px-4 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-ember shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-heading font-bold text-ember">
                          Action Required: Validator Returned for Correction (Rev #{q.revision})
                        </span>
                      </div>
                      <p className="text-ink/90 mt-1 leading-relaxed bg-surface/80 p-2 rounded border border-ember/20 whitespace-pre-wrap">
                        {q.latest_comment || 'Validator requested corrections before this question can be approved.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Question Details Header */}
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ValidationStatusBadge status={q.validation_status} revision={q.revision} />
                      <span className="pill text-[10px] bg-bg border border-border text-ink/70 font-mono">
                        {q.question_type_display || q.question_type}
                      </span>
                      <span className="pill text-[10px] bg-bg border border-border text-ink/70 font-mono">
                        {q.difficulty}
                      </span>
                      <span className="pill text-[10px] bg-bg border border-border text-ink/70 font-mono">
                        {q.marks} Marks
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryId(q.id)}
                        className="p-1.5 rounded text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors text-xs flex items-center gap-1 cursor-pointer"
                        title="View Validation Audit History"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Audit History</span>
                      </button>

                      {needsCorrection && (
                        <button
                          type="button"
                          onClick={() => handleOpenResubmit(q)}
                          className="px-3 py-1.5 rounded-pill bg-ember text-white text-xs font-heading font-semibold hover:bg-ember/90 transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit & Resubmit</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="text-xs text-ink font-body whitespace-pre-wrap leading-relaxed">
                    {q.question_text}
                  </div>

                  {/* Multiple Topics Pills */}
                  {q.topics && q.topics.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-mono text-ink/50 uppercase">Topics:</span>
                      {q.topics.map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded-pill text-[10px] bg-bg border border-border text-ink/80 font-medium"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer Meta */}
                  <div className="flex items-center justify-between text-[11px] text-ink/50 font-mono pt-2 border-t border-border">
                    <span>
                      {q.book_title || 'General'} • {q.chapter_title || 'General'}
                    </span>
                    <span>
                      Created {q.created_at ? new Date(q.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          <Pagination
            currentPage={currentPage}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemName="questions"
          />
        </div>
      )}

      {/* Edit & Resubmit Modal (PDF Section 15) */}
      {resubmittingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-surface border border-border rounded-card max-w-2xl w-full shadow-float my-8 overflow-hidden animate-scale-up">
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-card bg-ember/10 border border-ember/20 flex items-center justify-center text-ember">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-ink">
                    Edit & Resubmit Question (Rev #{resubmittingQuestion.revision} → #{(resubmittingQuestion.revision || 1) + 1})
                  </h3>
                  <p className="text-[11px] font-mono text-ink/50">Question #{resubmittingQuestion.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResubmittingQuestion(null)}
                className="p-1.5 rounded-sm text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteResubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {resubmitError && (
                <div className="p-3 rounded-card bg-ember/10 border border-ember/20 text-ember text-xs">
                  {resubmitError}
                </div>
              )}

              {/* Validator's Previous Feedback */}
              {resubmittingQuestion.latest_comment && (
                <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs space-y-1">
                  <span className="font-heading font-bold text-ember block text-[11px]">
                    Validator Correction Note:
                  </span>
                  <p className="text-ink/90 whitespace-pre-wrap">{resubmittingQuestion.latest_comment}</p>
                </div>
              )}

              {/* Editable Question Text */}
              <div className="space-y-1">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Question Text *
                </label>
                <textarea
                  rows={4}
                  required
                  value={resubmitText}
                  onChange={(e) => setResubmitText(e.target.value)}
                  className="w-full p-3 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none"
                />
              </div>

              {/* Editable Options */}
              {resubmitOptions.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Answer Options
                  </label>
                  <div className="space-y-2">
                    {resubmitOptions.map((opt, idx) => (
                      <div key={opt.key} className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-card bg-surface border border-border flex items-center justify-center font-mono text-xs font-bold shrink-0 text-ink">
                          {opt.key}
                        </span>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => {
                            const updated = [...resubmitOptions];
                            updated[idx].text = e.target.value;
                            setResubmitOptions(updated);
                          }}
                          className="flex-1 px-3 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correct Answer & Explanation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Correct Answer
                  </label>
                  <input
                    type="text"
                    value={resubmitAnswer}
                    onChange={(e) => setResubmitAnswer(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-heading font-semibold text-ink">
                    Optional Resubmission Note to Validator
                  </label>
                  <input
                    type="text"
                    value={resubmitComment}
                    onChange={(e) => setResubmitComment(e.target.value)}
                    placeholder="e.g. Corrected option C formula as requested"
                    className="w-full px-3 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none"
                  />
                </div>
              </div>

              {/* Explanation */}
              <div className="space-y-1">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Explanation / Solution
                </label>
                <textarea
                  rows={2}
                  value={resubmitExplanation}
                  onChange={(e) => setResubmitExplanation(e.target.value)}
                  className="w-full p-2.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResubmittingQuestion(null)}
                  className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border hover:bg-surface-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResubmit}
                  className="px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingResubmit ? 'Resubmitting...' : 'Resubmit for Validation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Validation Audit Trail Drawer */}
      <ValidationHistoryDrawer
        questionId={selectedHistoryId}
        isOpen={selectedHistoryId !== null}
        onClose={() => setSelectedHistoryId(null)}
      />
    </div>
  );
};
