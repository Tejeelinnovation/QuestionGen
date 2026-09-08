import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Chapter } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { ArrowRight } from 'lucide-react';

export const PaperSetupPageMobile: React.FC = () => {
  const navigate = useNavigate();
  const { dashboardPath } = useAuth();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chapterId, setChapterId] = useState<number | ''>('');

  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadChapters = async () => {
      setIsLoadingChapters(true);
      setErrorMessage(null);
      try {
        const data = await contentApi.getChapters();
        setChapters(data);
        if (data.length > 0) {
          setChapterId(data[0].id);
        }
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load curriculum chapters.'
        );
      } finally {
        setIsLoadingChapters(false);
      }
    };

    loadChapters();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Paper title is required.');
      return;
    }
    if (!chapterId) {
      setErrorMessage('Please select a curriculum chapter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const paper = await papersApi.createPaper({
        title: title.trim(),
        instructions: instructions.trim(),
        chapter: Number(chapterId),
      });

      navigate(`/papers/${paper.id}/configure`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.chapter?.[0] ||
        err.response?.data?.title?.[0] ||
        'Failed to create question paper.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-body">
      <PaperWorkflowNavMobile currentStep="setup" backTo={dashboardPath} />

      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-heading font-bold text-xl text-ink tracking-tight">
          Create Question Paper
        </h1>
        <p className="text-xs text-ink/70">
          Establish the examination title, curriculum chapter, and student instructions.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-3 text-xs font-medium">
          {errorMessage}
        </div>
      )}

      {/* Setup Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3.5">
          {/* Paper Title */}
          <div className="space-y-1.5">
            <label
              htmlFor="mobile-paper-title"
              className="block text-xs font-heading font-semibold text-ink"
            >
              Paper Title *
            </label>
            <input
              id="mobile-paper-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midterm Assessment: Classical Mechanics"
              required
              className="w-full px-3.5 py-3 rounded-card bg-surface border border-border text-sm font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none min-h-[48px]"
            />
          </div>

          {/* Curriculum Chapter Select */}
          <div className="space-y-1.5">
            <label
              htmlFor="mobile-paper-chapter"
              className="block text-xs font-heading font-semibold text-ink"
            >
              Curriculum Chapter *
            </label>
            {isLoadingChapters ? (
              <div className="text-xs text-ink/50 py-2">Loading chapters...</div>
            ) : (
              <div className="relative">
                <select
                  id="mobile-paper-chapter"
                  value={chapterId}
                  onChange={(e) => setChapterId(Number(e.target.value))}
                  required
                  className="w-full px-3.5 py-3 rounded-card bg-surface border border-border text-xs sm:text-sm font-body text-ink focus:border-forest focus:outline-none min-h-[48px] appearance-none cursor-pointer"
                >
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.book_subject ? `${ch.book_subject}: ` : ''}{ch.title}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink/40 text-xs">
                  ▼
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <label
              htmlFor="mobile-paper-instructions"
              className="block text-xs font-heading font-semibold text-ink"
            >
              Student Exam Instructions (Optional)
            </label>
            <textarea
              id="mobile-paper-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Answer all questions. Calculators permitted. Total duration 60 mins."
              rows={3}
              className="w-full p-3 rounded-card bg-surface border border-border text-xs font-body text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Submit Action */}
        <button
          type="submit"
          id="mobile-paper-setup-submit"
          disabled={isSubmitting || isLoadingChapters}
          className="w-full py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-sm hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            'Creating Paper...'
          ) : (
            <>
              <span>Continue to Question Criteria</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
