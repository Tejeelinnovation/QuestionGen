import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import type { QuestionPreview, Paper } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useToast } from '../../context/ToastContext';
import { extractApiErrorMessage } from '../../utils/errorUtils';
import { QuestionReviewPageTablet } from '../tablet/papers/QuestionReviewPageTablet';
import { QuestionReviewPageMobile } from '../mobile/papers/QuestionReviewPageMobile';
import { getStaggerDelay, MOTION } from '../../lib/motion';
import { MathText } from '../../components/ui/MathText';
import { Image as ImageIcon, Layers } from 'lucide-react';
import { API_BASE_URL } from '../../api/client';
import { organizeQuestionsIntoSections } from '../../utils/paperSectionUtils';

const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

import { QuestionReplaceModal } from '../../components/papers/QuestionReplaceModal';

const QuestionReviewPageDesktop: React.FC = () => {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const paperId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<QuestionPreview[]>([]);
  const [constraints, setConstraints] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [replacingQuestion, setReplacingQuestion] = useState<{ question: QuestionPreview; index: number } | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>('all');

  useEffect(() => {
    // Load paper details for header context
    const loadPaper = async () => {
      try {
        const pData = await papersApi.getPaper(paperId);
        setPaper(pData);
      } catch (err) {
        console.error('Failed to load paper context:', err);
      }
    };
    if (paperId) {
      loadPaper();
    }
  }, [paperId]);

  useEffect(() => {
    const extractQuestions = (val: any): QuestionPreview[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (Array.isArray(val.questions)) return val.questions;
      return [];
    };

    // 1. Try location.state
    const state = location.state as {
      questions?: any;
      constraints?: Record<string, any>;
    } | null;

    if (state?.questions) {
      setQuestions(extractQuestions(state.questions));
      setConstraints(state.constraints || {});
      return;
    }

    // 2. Fallback to sessionStorage
    const stored = sessionStorage.getItem(`paper_${paperId}_review`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.questions) {
          setQuestions(extractQuestions(parsed.questions));
          setConstraints(parsed.constraints || {});
          return;
        }
      } catch (err) {
        console.error('Failed to parse cached review questions:', err);
      }
    }
  }, [paperId, location.state]);

  const handleRemoveQuestion = (questionId: number) => {
    setQuestions((prev) => {
      const next = prev.filter((q) => q.id !== questionId);
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: next, constraints })
      );
      return next;
    });
  };

  const handleReplaceQuestion = (replacement: QuestionPreview, targetIndex?: number) => {
    setQuestions((prev) => {
      let next: QuestionPreview[];
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < prev.length) {
        next = [...prev];
        next[targetIndex] = replacement;
      } else {
        const idx = prev.findIndex((item) => item.id === replacingQuestion?.question.id);
        if (idx !== -1) {
          next = [...prev];
          next[idx] = replacement;
        } else {
          next = [...prev, replacement];
        }
      }
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: next, constraints })
      );
      return next;
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: copy, constraints })
      );
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      sessionStorage.setItem(
        `paper_${paperId}_review`,
        JSON.stringify({ questions: copy, constraints })
      );
      return copy;
    });
  };

  const runningTotalMarks = questions.reduce(
    (sum, q) => sum + (parseFloat(String(q.marks)) || 0),
    0
  );

  const sections = organizeQuestionsIntoSections(questions);
  const visibleSections = activeSectionId === 'all'
    ? sections
    : sections.filter((s) => s.id === activeSectionId);

  const handleSaveAsVersion = async () => {
    setIsSaving(true);
    try {
      const updatedConstraints = {
        ...constraints,
        ...(constraints.total_marks !== undefined && constraints.total_marks !== null
          ? { total_marks: runningTotalMarks }
          : {}),
      };

      const isPdfMode = paper?.specifications?.source_mode === 'pdf';
      const versionPayload = isPdfMode
        ? {
            questions_data: questions,
            constraints_used: updatedConstraints,
          }
        : {
            question_ids: questions.map((q) => q.id),
            constraints_used: updatedConstraints,
          };

      const newVersion = await papersApi.createVersion(paperId, versionPayload);

      toast.success(`Exam Version ${newVersion.version_label} created successfully!`);
      sessionStorage.removeItem(`paper_${paperId}_review`);
      navigate(`/papers/${paperId}/versions/${newVersion.id}`);
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to save questions as a new version.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Workflow Navigation */}
      <PaperWorkflowNav
        currentStep="review"
        paperId={paperId}
        paperTitle={paper?.title}
        chapterTitle={paper?.chapter_title}
      />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest">
            <span className="w-2 h-2 rounded-full bg-forest" />
            Stage 03 • Sequence & Curation
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl text-ink tracking-tight">
            Review Candidate Pool
          </h1>
          <p className="font-body text-ink/70 text-sm max-w-2xl leading-relaxed">
            Reorder the question presentation order, remove items that do not fit pedagogical intent, and freeze the candidate pool into an immutable version snapshot.
          </p>
        </div>

        <Link
          to={`/papers/${paperId}/configure`}
          className="text-xs font-heading font-semibold text-ink/70 hover:text-ink px-4 py-2 rounded-pill border border-border bg-surface hover:bg-surface-muted transition-colors self-start md:self-auto"
        >
          ← Reconfigure Filters
        </Link>
      </div>

      {constraints.total_marks !== undefined &&
        constraints.total_marks !== null &&
        Number(constraints.total_marks) !== runningTotalMarks && (
          <div
            id="quota-sync-info"
            className="rounded-card border border-forest/30 bg-forest/5 text-forest p-4 text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
              <span>
                Original target was <strong>{constraints.total_marks} marks</strong>. Your curated
                question set currently totals <strong>{runningTotalMarks} marks</strong>.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-ink/60 bg-surface px-2.5 py-1 rounded-pill border border-border">
              Will finalize at {runningTotalMarks} Marks
            </span>
          </div>
        )}

      {/* ── BOLD RUNNING METRICS & ACTION STRIP ── */}
      <div className="bg-surface border border-border rounded-card p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Bold prominent numbers (Requirement: running total marks as bold typography) */}
        <div className="flex items-center gap-8 sm:gap-12">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mb-1">
              Running Total Marks
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading font-bold text-4xl sm:text-5xl text-forest tracking-tight">
                {runningTotalMarks % 1 === 0 ? runningTotalMarks : runningTotalMarks.toFixed(1)}
              </span>
              <span className="font-mono text-xs font-semibold text-ink/50">Marks</span>
            </div>
          </div>

          <div className="border-l border-border pl-8 sm:pl-12">
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink/50 mb-1">
              Candidate Questions
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading font-bold text-4xl sm:text-5xl text-ink tracking-tight">
                {questions.length}
              </span>
              <span className="font-mono text-xs font-semibold text-ink/50">Items</span>
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <button
            onClick={handleSaveAsVersion}
            id="save-version-btn"
            disabled={isSaving || questions.length === 0}
            className="px-6 py-3 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <span>{isSaving ? 'Creating Version Snapshot...' : 'Save as Formal Version'}</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* ── INTERACTIVE EXAMINATION SECTION NAVIGATOR ── */}
      {sections.length > 0 && (
        <div className="bg-surface border border-border rounded-card p-4 shadow-card space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-heading font-semibold text-ink">
              <Layers className="w-4 h-4 text-forest" />
              <span>Examination Paper Structure & Sections</span>
              <span className="text-[11px] font-mono text-ink/50 bg-bg px-2 py-0.5 rounded border border-border">
                {sections.length} Sections Defined
              </span>
            </div>
            <div className="text-[11px] font-body text-ink/60">
              Filter by section or review full examination sequence
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            <button
              type="button"
              onClick={() => setActiveSectionId('all')}
              className={`px-3.5 py-2 rounded-pill text-xs font-heading font-semibold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeSectionId === 'all'
                  ? 'bg-forest text-white shadow-sm'
                  : 'bg-bg text-ink/70 hover:text-ink hover:bg-surface-muted border border-border'
              }`}
            >
              <span>Entire Paper</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  activeSectionId === 'all' ? 'bg-white/20 text-white' : 'bg-surface text-ink/60'
                }`}
              >
                {questions.length} Qs • {runningTotalMarks}M
              </span>
            </button>

            {sections.map((sec) => {
              const isActive = activeSectionId === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`px-3.5 py-2 rounded-pill text-xs font-heading font-semibold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-forest text-white shadow-sm'
                      : 'bg-bg text-ink/70 hover:text-ink hover:bg-surface-muted border border-border'
                  }`}
                >
                  <span className="font-bold">Sec {sec.letter}</span>
                  <span className="text-ink/60 text-[11px] hidden md:inline">
                    ({sec.formatSummary})
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-surface text-ink/60'
                    }`}
                  >
                    {sec.questionCount} Qs • {sec.totalMarks}M
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SECTIONED CANDIDATE QUESTIONS ── */}
      <div className="space-y-8">
        {visibleSections.map((sec) => (
          <div key={sec.id} className="space-y-4">
            {/* Authentic Examination Section Header Banner */}
            <div className="bg-surface border-2 border-forest/30 rounded-card p-4 sm:p-5 shadow-card space-y-2 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-forest" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-forest text-white font-heading font-bold text-xs uppercase tracking-wider rounded-sm shadow-sm">
                    SECTION {sec.letter}
                  </span>
                  <h2 className="font-heading font-bold text-base sm:text-lg text-ink tracking-tight">
                    {sec.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono font-semibold">
                  <span className="bg-bg text-ink/80 px-2.5 py-1 rounded border border-border">
                    {sec.questionCount} {sec.questionCount === 1 ? 'Question' : 'Questions'} (Q{sec.startIndex < 10 ? `0${sec.startIndex}` : sec.startIndex} – Q{sec.endIndex < 10 ? `0${sec.endIndex}` : sec.endIndex})
                  </span>
                  <span className="bg-forest/10 text-forest px-2.5 py-1 rounded border border-forest/20">
                    {sec.marksPerQuestion} Mark{sec.marksPerQuestion === 1 ? '' : 's'} Each • Total {sec.totalMarks} Marks
                  </span>
                </div>
              </div>

              {sec.guideline && (
                <p className="text-xs text-ink/70 font-body italic pt-2 border-t border-border/60">
                  {sec.guideline}
                </p>
              )}
            </div>

            {/* Questions within this Section */}
            <div className="space-y-4 pl-0 sm:pl-2">
              {sec.items.map((item) => {
                const q = item.question;
                const isMcq = q.question_type === 'MCQ';
                const globalIdx = item.globalIndex;

                return (
                  <div
                    key={q.id}
                    style={getStaggerDelay(item.sectionIndex)}
                    className={`animate-card-enter bg-surface border border-border rounded-card p-5 sm:p-6 shadow-card hover:border-forest/50 space-y-4 ${MOTION.hoverLift.className} ${MOTION.touch.card.className}`}
                  >
                    {/* Top Card Bar: Sequence, Tags & Integrated Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Prominent Question Number */}
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm bg-forest/10 border border-forest/30 text-forest px-3 py-1 rounded-sm">
                            Q{item.displayNumber < 10 ? `0${item.displayNumber}` : item.displayNumber}
                          </span>
                          <span className="text-[11px] font-mono text-ink/50">
                            (Sec {sec.letter} • #{item.sectionIndex})
                          </span>
                        </div>

                        {/* Format Pill */}
                        <span
                          className={`pill text-[10px] ${
                            isMcq
                              ? 'pill-forest'
                              : q.question_type === 'SHORT_ANSWER'
                              ? 'pill-ember'
                              : 'pill-grape'
                          }`}
                        >
                          {q.question_type_display || q.question_type}
                        </span>

                        {/* Difficulty Pill */}
                        <span className="pill pill-muted text-[10px]">
                          {q.difficulty_display || q.difficulty}
                        </span>

                        {/* Bank Source Badge */}
                        <span
                          className={`pill text-[10px] ${
                            q.bank_source === 'GLOBAL'
                              ? 'bg-forest/10 text-forest border border-forest/20'
                              : 'bg-ocean/10 text-ocean border border-ocean/20'
                          }`}
                        >
                          {q.bank_source === 'GLOBAL' ? 'Global Bank' : 'School Bank'}
                        </span>

                        {/* Subject Pill */}
                        {q.subject && (
                          <span className="pill pill-muted text-[10px] font-mono">
                            {q.subject}
                          </span>
                        )}

                        {/* Topic name */}
                        {q.topic_name && (
                          <span className="text-xs text-ink/60 font-medium hidden md:inline">
                            Topic: <span className="text-ink">{q.topic_name}</span>
                          </span>
                        )}
                      </div>

                      {/* Integrated Reorder & Remove Controls */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto bg-bg p-1 rounded-pill border border-border">
                        {/* Marks indicator badge */}
                        <span className="font-mono text-xs font-bold text-forest px-2.5 py-0.5">
                          {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                        </span>

                        <span className="text-border-strong">|</span>

                        {/* Move Up */}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(globalIdx)}
                          disabled={globalIdx === 0 || isSaving}
                          title="Move up in sequence"
                          className="p-1 px-2 text-xs font-heading font-medium rounded-pill text-ink/70 hover:text-ink hover:bg-surface disabled:opacity-30 cursor-pointer transition-colors"
                        >
                          ↑ Up
                        </button>

                        {/* Move Down */}
                        <button
                          type="button"
                          onClick={() => handleMoveDown(globalIdx)}
                          disabled={globalIdx === questions.length - 1 || isSaving}
                          title="Move down in sequence"
                          className="p-1 px-2 text-xs font-heading font-medium rounded-pill text-ink/70 hover:text-ink hover:bg-surface disabled:opacity-30 cursor-pointer transition-colors"
                        >
                          ↓ Down
                        </button>

                        <span className="text-border-strong">|</span>

                        {/* Replace Question */}
                        <button
                          type="button"
                          onClick={() => setReplacingQuestion({ question: q, index: globalIdx })}
                          disabled={isSaving}
                          title="Replace question with matching alternative from question bank"
                          className="p-1 px-2.5 text-xs font-heading font-semibold rounded-pill text-forest hover:bg-forest/10 cursor-pointer transition-colors flex items-center gap-1"
                        >
                          <span>🔄 Replace</span>
                        </button>

                        <span className="text-border-strong">|</span>

                        {/* Remove Question */}
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(q.id)}
                          disabled={isSaving}
                          title="Remove question from paper"
                          className="p-1 px-2.5 text-xs font-heading font-semibold rounded-pill text-ember hover:bg-ember/10 cursor-pointer transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Question Text with KaTeX Formula Support */}
                    <div className="font-body text-sm sm:text-base font-medium text-ink leading-relaxed">
                      <MathText text={q.question_text} as="div" />
                    </div>

                    {/* Diagram / Visual Asset Attachment */}
                    {q.diagram && q.diagram.image_url && (
                      <div className="bg-bg border border-border rounded-card p-4 space-y-2 max-w-lg">
                        <div className="flex items-center gap-2 text-xs font-heading font-semibold text-forest">
                          <ImageIcon className="w-4 h-4" />
                          <span>{q.diagram.title || 'Referenced Examination Figure'}</span>
                        </div>
                        <div className="relative rounded-md overflow-hidden bg-surface border border-border/80 flex items-center justify-center p-2">
                          <img
                            src={resolveImageUrl(q.diagram.image_url)}
                            alt={q.diagram.title || 'Diagram'}
                            className="max-h-56 object-contain rounded"
                            onError={(e) => {
                              console.warn('Failed to render diagram image:', q.diagram?.image_url);
                              const currentSrc = (e.currentTarget as HTMLImageElement).src;
                              if (!currentSrc.includes(':8000') && q.diagram?.image_url?.startsWith('/')) {
                                (e.currentTarget as HTMLImageElement).src = `http://127.0.0.1:8000${q.diagram.image_url}`;
                              }
                            }}
                          />
                        </div>
                        {q.diagram.caption && (
                          <p className="text-[11px] font-mono text-ink/60 italic">
                            {q.diagram.caption}
                          </p>
                        )}
                      </div>
                    )}

                    {/* MCQ Options Grid */}
                    {isMcq && q.options && Object.keys(q.options).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {Object.entries(q.options).map(([optKey, optVal]) => (
                          <div
                            key={optKey}
                            className="p-2.5 rounded-card border border-border/80 bg-bg text-xs flex items-start gap-2"
                          >
                            <span className="font-mono font-bold text-forest shrink-0">
                              ({optKey})
                            </span>
                            <div className="text-ink/80 flex-1">
                              <MathText text={optVal} as="span" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {questions.length === 0 && (
          <div className="bg-surface border-2 border-dashed border-border rounded-card p-12 text-center space-y-4">
            <span className="pill pill-ember text-xs">Zero Questions Remaining</span>
            <h3 className="font-heading font-bold text-xl text-ink">
              All candidate questions have been removed
            </h3>
            <p className="text-xs text-ink/65 max-w-md mx-auto">
              You can re-query the question bank with different constraint parameters or topic coverage.
            </p>
            <Link
              to={`/papers/${paperId}/configure`}
              className="inline-block mt-2 px-5 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors"
            >
              Reconfigure Questions →
            </Link>
          </div>
        )}
      </div>

      {/* Bottom Save Action */}
      {questions.length > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="text-xs text-ink/60">
            Saving creates an immutable version record that can be finalized and scheduled.
          </div>

          <button
            onClick={handleSaveAsVersion}
            disabled={isSaving}
            className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            <span>{isSaving ? 'Saving Version Snapshot...' : 'Save as Formal Version'}</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Question Replace Modal */}
      <QuestionReplaceModal
        isOpen={Boolean(replacingQuestion)}
        onClose={() => setReplacingQuestion(null)}
        targetQuestion={replacingQuestion?.question || null}
        targetIndex={replacingQuestion?.index}
        existingQuestionIds={questions.map((q) => q.id)}
        onSelectReplacement={handleReplaceQuestion}
      />
    </div>
  );
};

export const QuestionReviewPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  if (breakpoint === 'mobile') {
    return <QuestionReviewPageMobile key="mobile" />;
  }
  if (breakpoint === 'tablet') {
    return <QuestionReviewPageTablet key="tablet" />;
  }
  return <QuestionReviewPageDesktop key="desktop" />;
};

