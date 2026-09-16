import React, { useState, useEffect } from 'react';
import { contentApi } from '../../api/content';
import type { Question } from '../../types';
import { ValidationStatusBadge } from './ValidationStatusBadge';
import { ValidatorReviewModal } from './ValidatorReviewModal';
import { ValidationHistoryDrawer } from './ValidationHistoryDrawer';
import {
  Inbox,
  CheckCircle2,
  Search,
  History,
  Layers,
} from 'lucide-react';
import { Pagination } from '../ui/pagination';

export const ValidatorQueueView: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [difficultyFilter, setDifficultyFilter] = useState('ALL');
  const [boardFilter, setBoardFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Active Review Modal & History Drawer
  const [reviewingQuestion, setReviewingQuestion] = useState<Question | null>(null);
  const [historyQuestionId, setHistoryQuestionId] = useState<number | null>(null);

  const fetchQueue = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {
        page: currentPage,
        page_size: pageSize,
      };

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      if (difficultyFilter !== 'ALL') {
        params.difficulty = difficultyFilter;
      }
      if (boardFilter !== 'ALL') {
        params.board = boardFilter;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const res = await contentApi.getValidationQueue(params);
      setQuestions(res.results);
      setTotalCount(res.count);
    } catch (err) {
      console.error('Failed to load validation queue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [currentPage, statusFilter, difficultyFilter, boardFilter, searchTerm]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="font-heading font-bold text-lg text-ink flex items-center gap-2">
            <Inbox className="w-5 h-5 text-forest" />
            <span>Validator Review Queue</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-pill bg-forest/10 text-forest border border-forest/20">
              {totalCount} Awaiting Review
            </span>
          </h2>
          <p className="text-xs text-ink/70 mt-0.5">
            Review questions submitted by Data Entry Operators. Validate topics, adjust marks & difficulty, and approve or return for correction.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-surface border border-border rounded-card p-3 shadow-xs">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by question text or code..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none"
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-2.5 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none font-mono"
          >
            <option value="ALL">Status: All In-Review</option>
            <option value="SUBMITTED">Submitted (New / Resubmitted)</option>
            <option value="UNDER_VALIDATION">Under Validation</option>
            <option value="CORRECTION_REQUIRED">Needs Correction</option>
          </select>
        </div>

        {/* Difficulty Filter */}
        <div>
          <select
            value={difficultyFilter}
            onChange={(e) => {
              setDifficultyFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-2.5 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none font-mono"
          >
            <option value="ALL">Difficulty: All</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>

        {/* Board Filter */}
        <div>
          <select
            value={boardFilter}
            onChange={(e) => {
              setBoardFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-2.5 py-1.5 rounded-card bg-bg border border-border text-xs text-ink focus:border-forest focus:outline-none font-mono"
          >
            <option value="ALL">Board: All</option>
            <option value="CBSE">CBSE</option>
            <option value="ICSE">ICSE</option>
            <option value="STATE">State Board</option>
          </select>
        </div>
      </div>

      {/* Queue Content: Card List / Table */}
      {isLoading ? (
        <div className="py-16 text-center text-xs font-mono text-ink/50">
          Loading review queue...
        </div>
      ) : questions.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-card bg-surface p-8">
          <CheckCircle2 className="w-8 h-8 text-forest/40 mx-auto mb-2" />
          <p className="text-sm font-heading font-semibold text-ink">Validation Queue is Clear!</p>
          <p className="text-xs text-ink/60 mt-1">
            All submitted questions have been processed or approved into the question bank.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className="bg-surface border border-border rounded-card p-4 sm:p-5 shadow-xs hover:border-border-strong transition-all space-y-3"
            >
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
                  {q.variants && q.variants.length > 0 && (
                    <span className="pill text-[10px] bg-forest/10 border border-forest/20 text-forest font-mono">
                      {q.variants.length} Variants
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryQuestionId(q.id)}
                    className="p-1.5 rounded text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors text-xs flex items-center gap-1 cursor-pointer"
                    title="View Validation Audit History"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-[11px]">Audit History</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewingQuestion(q)}
                    className="px-4 py-1.5 rounded-pill bg-forest text-white text-xs font-heading font-semibold hover:bg-forest/90 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Review & Validate</span>
                  </button>
                </div>
              </div>

              {/* Question Text Snippet */}
              <div className="text-xs text-ink font-body line-clamp-3 whitespace-pre-wrap leading-relaxed">
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
                  Author: <strong className="text-ink/80">{q.created_by_username || 'DEO Staff'}</strong> • {q.book_title || 'General'}
                </span>
                <span>
                  Submitted {q.created_at ? new Date(q.created_at).toLocaleDateString() : ''}
                </span>
              </div>
            </div>
          ))}

          <Pagination
            currentPage={currentPage}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemName="questions"
          />
        </div>
      )}

      {/* Review Modal */}
      <ValidatorReviewModal
        question={reviewingQuestion}
        isOpen={reviewingQuestion !== null}
        onClose={() => setReviewingQuestion(null)}
        onUpdated={() => {
          setReviewingQuestion(null);
          fetchQueue();
        }}
      />

      {/* Audit History Drawer */}
      <ValidationHistoryDrawer
        questionId={historyQuestionId}
        isOpen={historyQuestionId !== null}
        onClose={() => setHistoryQuestionId(null)}
      />
    </div>
  );
};
