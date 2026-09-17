import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../api/content';
import { papersApi } from '../../api/papers';
import type { Chapter } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PaperSetupPageTablet } from '../tablet/papers/PaperSetupPageTablet';
import { PaperSetupPageMobile } from '../mobile/papers/PaperSetupPageMobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

const PaperSetupPageDesktop: React.FC = () => {
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
  const [examMode, setExamMode] = useState<'single' | 'multi'>('single');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['Mathematics']);

  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableSubjects = [
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Science',
    'Social Science',
    'English',
  ];

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
          err.response?.data?.detail || 'Failed to load curriculum chapters from server.'
        );
      } finally {
        setIsLoadingChapters(false);
      }
    };

    loadChapters();
  }, []);

  const handleSubjectToggle = (subj: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Paper title is required.');
      toast.warning('Paper title is required.');
      return;
    }
    if (examMode === 'single' && !chapterId) {
      setErrorMessage('Please select a chapter.');
      toast.warning('Please select a chapter.');
      return;
    }
    if (examMode === 'multi' && selectedSubjects.length === 0) {
      setErrorMessage('Please select at least one subject for the combined test.');
      toast.warning('Please select at least one subject for the combined test.');
      return;
    }

    setIsSubmitting(true);
    try {
      const paper = await papersApi.createPaper({
        title: title.trim(),
        instructions: instructions.trim(),
        chapter: examMode === 'single' ? Number(chapterId) : null,
        subjects: examMode === 'multi' ? selectedSubjects : [],
        duration_minutes: 60,
        total_question_count: 0,
      });

      toast.success(`Paper "${paper.title}" created successfully.`);
      navigate(`/papers/${paper.id}/configure`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.chapter?.[0] ||
        err.response?.data?.title?.[0] ||
        JSON.stringify(err.response?.data) ||
        'Failed to create paper.';
      setErrorMessage(detail);
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedChapter = chapters.find((c) => c.id === Number(chapterId));

  return (
    <div className="space-y-8">
      {/* Workflow Navigation */}
      <PaperWorkflowNav currentStep="setup" />

      {/* Asymmetric 2-Column Architecture (Ref 08: Typography-Led Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
              <span className="w-2 h-2 rounded-full bg-forest" />
              Stage 01 • Examination Blueprint
            </div>
            <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
              Blueprint Setup
            </h1>
            <p className="font-body text-ink/70 text-sm leading-relaxed">
              Define the syllabus domain, test title, and student-facing examination guidelines before filtering candidate questions.
            </p>
          </div>

          {isLoadingChapters && (
            <div className="bg-surface border border-border rounded-card p-6 text-sm text-ink/60">
              Retrieving curriculum syllabus and chapters...
            </div>
          )}

          {errorMessage && (
            <div
              id="setup-error-banner"
              className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium flex items-start gap-2"
            >
              <span className="font-bold text-sm">!</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {!isLoadingChapters && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-5">
                {/* Paper Title */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="paper-title"
                      className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                    >
                      Examination Title *
                    </label>
                    <span className="text-[11px] font-mono text-ink/40">Required</span>
                  </div>
                  <input
                    id="paper-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Grade 10 Mid-Term - Real Numbers & Polynomials"
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none transition-colors"
                    required
                  />
                  <p className="text-[11px] text-ink/50 mt-1">
                    This title appears on both digital test sessions and printed exam sheets.
                  </p>
                </div>

                {/* Exam Mode Toggle: Single vs Multi-Subject */}
                <div>
                  <label className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider mb-2">
                    Blueprint Scope Mode *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setExamMode('single')}
                      className={`p-3 rounded-card border text-left transition-all cursor-pointer ${
                        examMode === 'single'
                          ? 'border-forest bg-forest/5 text-ink ring-1 ring-forest'
                          : 'border-border bg-bg text-ink/70 hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-heading font-semibold text-xs">
                        <span className={`w-2 h-2 rounded-full ${examMode === 'single' ? 'bg-forest' : 'bg-ink/30'}`} />
                        Single Chapter Focus
                      </div>
                      <p className="text-[11px] text-ink/60 mt-1">
                        Chapter-specific unit test or weekly assessment.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExamMode('multi')}
                      className={`p-3 rounded-card border text-left transition-all cursor-pointer ${
                        examMode === 'multi'
                          ? 'border-forest bg-forest/5 text-ink ring-1 ring-forest'
                          : 'border-border bg-bg text-ink/70 hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-heading font-semibold text-xs">
                        <span className={`w-2 h-2 rounded-full ${examMode === 'multi' ? 'bg-forest' : 'bg-ink/30'}`} />
                        Multi-Subject / Combined Exam
                      </div>
                      <p className="text-[11px] text-ink/60 mt-1">
                        Competitive mock (JEE/NEET) or term exam across disciplines.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Single Chapter Selector / Multi-Subject Selection */}
                {examMode === 'single' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="paper-chapter-trigger"
                        className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                      >
                        Curriculum Chapter *
                      </label>
                      <span className="text-[11px] font-mono text-ink/40">Question Bank Scope</span>
                    </div>

                    <Select
                      value={chapterId ? String(chapterId) : ''}
                      onValueChange={(val) => setChapterId(Number(val))}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger
                        id="paper-chapter-trigger"
                        className="w-full h-auto py-2.5 px-4 rounded-card border border-border bg-bg text-sm text-ink focus:border-forest focus:bg-surface transition-colors"
                      >
                        <SelectValue placeholder="Select a syllabus chapter..." />
                      </SelectTrigger>
                      <SelectContent className="bg-surface border border-border rounded-card shadow-float max-h-72">
                        {chapters.map((c) => (
                          <SelectItem
                            key={c.id}
                            value={String(c.id)}
                            className="py-2.5 px-3 text-xs hover:bg-surface-muted cursor-pointer"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-heading font-semibold text-ink">
                                {c.book_title ? `[${c.book_title}] ` : ''}
                                {c.title}
                              </span>
                              <span className="font-mono text-[10px] text-ink/50">
                                {c.topic_count} Topics available in syllabus
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <select
                      id="paper-chapter"
                      value={chapterId}
                      onChange={(e) => setChapterId(Number(e.target.value))}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {chapters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider">
                        Participating Subjects *
                      </label>
                      <span className="text-[11px] font-mono text-ink/40">
                        {selectedSubjects.length} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {availableSubjects.map((subj) => {
                        const isSelected = selectedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => handleSubjectToggle(subj)}
                            className={`px-3 py-1.5 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-forest text-white border-forest shadow-xs'
                                : 'bg-bg text-ink/70 border-border hover:bg-surface hover:text-ink'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {subj}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-ink/50 mt-1.5">
                      Questions from both global QBM banks and your organization's private bank will be pooled across these subjects.
                    </p>
                  </div>
                )}

                {/* Instructions / Notes */}
                <div className="pt-2 border-t border-border/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="paper-instructions"
                      className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider"
                    >
                      Candidate Instructions & Exam Guidelines
                    </label>
                    <span className="text-[11px] font-mono text-ink/40">Optional</span>
                  </div>
                  <textarea
                    id="paper-instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. All questions are compulsory. Calculators are strictly prohibited. Time allowed: 90 minutes."
                    rows={3}
                    disabled={isSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:bg-surface focus:border-forest focus:outline-none transition-colors"
                  />
                  <p className="text-[11px] text-ink/50 mt-1">
                    Formatted at the head of every printed paper and shown prior to starting online attempts.
                  </p>
                </div>
              </div>

              {/* Form Action Controls */}
              <div className="flex items-center justify-between pt-2">
                <Link
                  to={dashboardPath}
                  className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors"
                >
                  Cancel & Return
                </Link>

                <button
                  type="submit"
                  id="submit-paper-setup-btn"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <span>{isSubmitting ? 'Creating Blueprint...' : 'Continue to Configuration'}</span>
                  <span>→</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Editorial Overview & Syllabus Guidance (5 cols) (Ref 08) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Syllabus Context Card */}
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <span className="font-mono uppercase tracking-wider text-ink/50 text-[10px]">
                Curriculum Scope
              </span>
              <span className="pill pill-forest text-[10px]">
                Step 1 of 6
              </span>
            </div>

            {examMode === 'single' ? (
              selectedChapter ? (
                <div className="space-y-3">
                  <div className="font-heading font-bold text-xl text-ink">
                    {selectedChapter.title}
                  </div>
                  {selectedChapter.book_title && (
                    <div className="text-xs text-ink/70 flex items-center gap-1.5">
                      <span className="font-medium text-forest">Course Textbook:</span>
                      <span>{selectedChapter.book_title}</span>
                    </div>
                  )}
                  <div className="p-3 bg-bg rounded-lg border border-border/70 flex items-center justify-between text-xs font-mono">
                    <span className="text-ink/60">Registered Syllabus Topics:</span>
                    <span className="font-bold text-forest">{selectedChapter.topic_count} Topics</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink/60 py-2">
                  Select a chapter to review curriculum coverage.
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="font-heading font-bold text-xl text-ink">
                  Multi-Subject Examination
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSubjects.map((s) => (
                    <span key={s} className="pill pill-forest text-[10px]">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="p-3 bg-bg rounded-lg border border-border/70 text-xs text-ink/70">
                  <span className="font-medium text-forest">Next Stage:</span> Exam duration, compulsory total marks, and per-mark question format distributions are configured in Stage 02.
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-border/70 space-y-2">
              <div className="text-xs font-heading font-semibold text-ink">
                What happens in Step 2:
              </div>
              <ul className="text-xs text-ink/70 space-y-1.5 list-disc list-inside">
                <li>Multi-source candidate retrieval (Global QBM + School Banks)</li>
                <li>Apply Bloom’s taxonomy & difficulty balancing</li>
                <li>Constrain question types (MCQ, Short, Long Answer)</li>
                <li>Target precise total examination marks & quotas</li>
              </ul>
            </div>
          </div>

          {/* Pedagogical Principle Callout Card */}
          <div className="bg-surface-muted border border-border rounded-card p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-ember" />
              <span className="font-mono text-[11px] font-semibold text-ember uppercase">
                Examination Architecture
              </span>
            </div>
            <h3 className="font-heading font-bold text-base text-ink">
              Multi-Version Consistency
            </h3>
            <p className="text-xs text-ink/70 leading-relaxed">
              Every blueprint generates discrete version instances (e.g. Version A, Version B). You can clone a finalized question pool with identical weightings across alternate exam shifts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PaperSetupPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <PaperSetupPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <PaperSetupPageTablet key="tablet" />;
  }
  return <PaperSetupPageDesktop key="desktop" />;
};

