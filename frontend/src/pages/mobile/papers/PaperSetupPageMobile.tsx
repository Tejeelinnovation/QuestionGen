import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Chapter } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { useToast } from '../../../context/ToastContext';
import { extractApiErrorMessage } from '../../../utils/errorUtils';
import { ArrowRight } from 'lucide-react';
import { CustomSelect } from '../../../components/ui/custom-select';

export const PaperSetupPageMobile: React.FC = () => {
  const navigate = useNavigate();
  const { dashboardPath } = useAuth();
  const toast = useToast();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chapterId, setChapterId] = useState<number | ''>('');
  const [examMode, setExamMode] = useState<'single' | 'multi'>('single');
  const availableSubjects = [
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Science',
    'Social Science',
    'English',
  ];
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['Mathematics']);

  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadChapters = async () => {
      setIsLoadingChapters(true);
      try {
        const chapData = await contentApi.getChapters();
        setChapters(chapData);
        if (chapData.length > 0) {
          setChapterId(chapData[0].id);
        }
      } catch (err: any) {
        toast.error(
          err.response?.data?.detail || 'Failed to load curriculum chapters.'
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

    if (!title.trim()) {
      toast.warning('Paper title is required.');
      return;
    }
    if (examMode === 'single' && !chapterId) {
      toast.warning('Please select a curriculum chapter.');
      return;
    }
    if (examMode === 'multi' && selectedSubjects.length === 0) {
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
      toast.error(extractApiErrorMessage(err, 'Failed to create question paper.'));
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

          {/* Blueprint Scope Mode: Single Chapter vs Multi-Subject */}
          <div className="space-y-1.5">
            <label className="block text-xs font-heading font-semibold text-ink">
              Blueprint Scope Mode *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExamMode('single')}
                className={`p-2.5 rounded-card border text-left transition-all cursor-pointer ${
                  examMode === 'single'
                    ? 'border-forest bg-forest/5 text-ink ring-1 ring-forest'
                    : 'border-border bg-bg text-ink/70 hover:bg-surface'
                }`}
              >
                <div className="flex items-center gap-1.5 font-heading font-semibold text-xs">
                  <span className={`w-2 h-2 rounded-full ${examMode === 'single' ? 'bg-forest' : 'bg-ink/30'}`} />
                  Single Chapter
                </div>
                <p className="text-[10px] text-ink/60 mt-0.5">
                  Unit test or chapter focus
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExamMode('multi')}
                className={`p-2.5 rounded-card border text-left transition-all cursor-pointer ${
                  examMode === 'multi'
                    ? 'border-forest bg-forest/5 text-ink ring-1 ring-forest'
                    : 'border-border bg-bg text-ink/70 hover:bg-surface'
                }`}
              >
                <div className="flex items-center gap-1.5 font-heading font-semibold text-xs">
                  <span className={`w-2 h-2 rounded-full ${examMode === 'multi' ? 'bg-forest' : 'bg-ink/30'}`} />
                  Multi-Subject
                </div>
                <p className="text-[10px] text-ink/60 mt-0.5">
                  Combined or term mock exam
                </p>
              </button>
            </div>
          </div>

          {/* Chapter / Multi-Subject Choice */}
          {examMode === 'single' ? (
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
                <CustomSelect
                  id="mobile-paper-chapter"
                  value={String(chapterId)}
                  onChange={(val) => setChapterId(Number(val))}
                  options={chapters.map((ch) => ({
                    value: String(ch.id),
                    label: `${ch.book_subject ? `${ch.book_subject}: ` : ''}${ch.title}`,
                  }))}
                  placeholder="Select a chapter..."
                  triggerClassName="min-h-[48px] py-3 text-xs sm:text-sm font-body bg-surface"
                />
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Participating Subjects *
                </label>
                <span className="text-[11px] font-mono text-ink/40">
                  {selectedSubjects.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {availableSubjects.map((subj) => {
                  const isSelected = selectedSubjects.includes(subj);
                  return (
                    <button
                      key={subj}
                      type="button"
                      onClick={() => handleSubjectToggle(subj)}
                      className={`px-2.5 py-1 rounded-pill text-xs font-heading font-semibold transition-all cursor-pointer border ${
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
            </div>
          )}

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
