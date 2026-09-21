import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Chapter } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';
import { CustomSelect } from '../../../components/ui/custom-select';
import { useToast } from '../../../context/ToastContext';
import { extractApiErrorMessage } from '../../../utils/errorUtils';

export const PaperSetupPageTablet: React.FC = () => {
  const navigate = useNavigate();
  const { user, dashboardPath } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (user && user.role_label !== 'Teacher') {
      navigate(dashboardPath, { replace: true });
    }
  }, [user, dashboardPath, navigate]);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chapterId, setChapterId] = useState<number | ''>('');

  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadChapters = async () => {
      setIsLoadingChapters(true);
      try {
        const data = await contentApi.getChapters();
        setChapters(data);
        if (data.length > 0) {
          setChapterId(data[0].id);
        }
      } catch (err: any) {
        toast.error(
          err.response?.data?.detail || 'Failed to load curriculum chapters from server.'
        );
      } finally {
        setIsLoadingChapters(false);
      }
    };

    loadChapters();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.warning('Paper title is required.');
      return;
    }
    if (!chapterId) {
      toast.warning('Please select a chapter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const paper = await papersApi.createPaper({
        title: title.trim(),
        instructions: instructions.trim(),
        chapter: Number(chapterId),
      });

      toast.success(`Paper "${paper.title}" created successfully.`);
      navigate(`/papers/${paper.id}/configure`);
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to create paper.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedChapter = chapters.find((c) => c.id === Number(chapterId));

  return (
    <div className="space-y-6 font-body">
      <PaperWorkflowNavTablet currentStep="setup" />

      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
          <span className="w-2 h-2 rounded-full bg-forest" />
          Stage 01 • Examination Blueprint
        </div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Blueprint Setup
        </h1>
        <p className="text-xs sm:text-sm text-ink/70 leading-relaxed">
          Define syllabus chapter domain, exam title, and instructions for tablet generation.
        </p>
      </div>

      {isLoadingChapters && (
        <div className="bg-surface border border-border rounded-card p-6 text-sm text-ink/60 text-center">
          Loading curriculum syllabus chapters...
        </div>
      )}

      {!isLoadingChapters && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Column 1: Touch Form */}
          <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div>
              <label htmlFor="paper-title" className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                Examination Title *
              </label>
              <input
                id="paper-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Class 10 Mid-Term - Calculus & Vectors"
                disabled={isSubmitting}
                required
                className="w-full rounded-card border border-border bg-bg px-4 py-3 text-sm text-ink focus:bg-surface focus:border-forest focus:outline-none min-h-[48px]"
              />
            </div>

            <div>
              <label htmlFor="paper-chapter" className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                Curriculum Chapter *
              </label>
              <CustomSelect
                value={chapterId ? String(chapterId) : ''}
                onChange={(val) => setChapterId(val ? Number(val) : '')}
                disabled={isSubmitting}
                options={chapters.map((c) => ({
                  value: String(c.id),
                  label: `${c.book_title ? `[${c.book_title}] ` : ''}${c.title} (${c.topic_count} Topics)`,
                }))}
                placeholder="Select curriculum chapter..."
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="paper-instructions" className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                Candidate Instructions & Guidelines
              </label>
              <textarea
                id="paper-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. All questions are compulsory. Time allowed: 90 minutes."
                rows={3}
                disabled={isSubmitting}
                className="w-full rounded-card border border-border bg-bg px-4 py-3 text-sm text-ink focus:bg-surface focus:border-forest focus:outline-none leading-relaxed"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <Link
                to={dashboardPath}
                className="px-4 py-2.5 rounded-pill border border-border bg-surface text-ink text-xs font-heading font-semibold hover:bg-surface-muted min-h-[44px] flex items-center"
              >
                Cancel
              </Link>
              <button
                type="submit"
                id="submit-paper-setup-btn"
                disabled={isSubmitting || chapters.length === 0}
                className="px-6 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center gap-2"
              >
                <span>{isSubmitting ? 'Creating...' : 'Configure Questions'}</span>
                <span>→</span>
              </button>
            </div>
          </form>

          {/* Column 2: Curriculum Context Card */}
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-mono uppercase tracking-wider text-ink/50 text-[10px]">
                  Curriculum Scope
                </span>
                <span className="pill pill-forest text-[10px]">Step 1 of 6</span>
              </div>

              {selectedChapter && (
                <div className="space-y-2">
                  <div className="font-heading font-bold text-xl text-ink">
                    {selectedChapter.title}
                  </div>
                  {selectedChapter.book_title && (
                    <div className="text-xs text-ink/70">
                      Textbook: <strong className="text-forest">{selectedChapter.book_title}</strong>
                    </div>
                  )}
                  <div className="p-3 bg-bg rounded-card border border-border flex items-center justify-between text-xs font-mono mt-2">
                    <span className="text-ink/60">Registered Syllabus Topics:</span>
                    <span className="font-bold text-forest">{selectedChapter.topic_count} Topics</span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-border space-y-1.5 text-xs text-ink/70">
                <div className="font-heading font-semibold text-ink">Next Stage:</div>
                <p>Filter question formats, difficulty levels, target marks, and topic boundaries.</p>
              </div>
            </div>

            <div className="bg-surface-muted border border-border rounded-card p-5 space-y-2">
              <span className="pill pill-ember text-[10px]">Tablet Architecture</span>
              <h3 className="font-heading font-bold text-sm text-ink">Multi-Version Alignment</h3>
              <p className="text-xs text-ink/70 leading-relaxed">
                Blueprints generate version instances (A, B, C) with identical difficulty distributions for multi-shift testing.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
