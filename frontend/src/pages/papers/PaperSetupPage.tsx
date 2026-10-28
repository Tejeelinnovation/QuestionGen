import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../api/content';
import { papersApi } from '../../api/papers';
import type { Chapter, PdfInspectionResult } from '../../types';
import { PaperWorkflowNav } from './components/PaperWorkflowNav';
import { FigurePickerGallery } from './components/FigurePickerGallery';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractApiErrorMessage } from '../../utils/errorUtils';
import { PaperSetupPageTablet } from '../tablet/papers/PaperSetupPageTablet';
import { PaperSetupPageMobile } from '../mobile/papers/PaperSetupPageMobile';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Skeleton } from '../../components/ui/skeleton';

const PaperSetupPageDesktop: React.FC = () => {
  const navigate = useNavigate();
  const { user, dashboardPath } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (user && !user.capabilities?.includes('CREATE_PAPER') && user.role_label !== 'Teacher') {
      navigate(dashboardPath, { replace: true });
    }
  }, [user, dashboardPath, navigate]);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chapterId, setChapterId] = useState<number | ''>('');
  const [examMode, setExamMode] = useState<'single' | 'multi'>('single');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['Mathematics']);

  // Multimodal PDF State
  const [sourceMode, setSourceMode] = useState<'curriculum' | 'pdf'>('curriculum');
  const [isInspectingPdf, setIsInspectingPdf] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<PdfInspectionResult | null>(null);
  const [selectedFigureIds, setSelectedFigureIds] = useState<string[]>([]);
  const [contributeToBank, setContributeToBank] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState('');

  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubjectToggle = (subj: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subj) ? prev.filter((s) => s !== subj) : [...prev, subj]
    );
  };

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.warning('Please select a valid PDF file.');
      return;
    }

    setUploadedFileName(file.name);
    setIsInspectingPdf(true);
    setInspectionResult(null);

    try {
      const result = await papersApi.inspectPdf(file);
      setInspectionResult(result);
      // Default to empty so the teacher selects ONLY the figures they want on the exam
      setSelectedFigureIds([]);

      if (!title.trim()) {
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setTitle(`${cleanTitle} Examination`);
      }
      toast.success(
        `PDF analyzed: ${result.page_count} pages, ${result.figure_count} diagrams found.`
      );
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to inspect PDF document.'));
    } finally {
      setIsInspectingPdf(false);
    }
  };

  const handleToggleFigure = (figId: string) => {
    setSelectedFigureIds((prev) =>
      prev.includes(figId) ? prev.filter((id) => id !== figId) : [...prev, figId]
    );
  };

  const handleSelectAllFigures = () => {
    if (inspectionResult) {
      setSelectedFigureIds(inspectionResult.figures.map((f) => f.figure_id));
    }
  };

  const handleDeselectAllFigures = () => {
    setSelectedFigureIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.warning('Paper title is required.');
      return;
    }

    // PDF Mode Submission
    if (sourceMode === 'pdf') {
      if (!inspectionResult) {
        toast.warning('Please upload and inspect a chapter PDF first.');
        return;
      }

      setIsSubmitting(true);
      try {
        const paper = await papersApi.createPaper({
          title: title.trim(),
          instructions: instructions.trim(),
          chapter: null,
          subjects: [],
          duration_minutes: 60,
          total_question_count: 0,
          specifications: {
            source_mode: 'pdf',
            inspection_id: inspectionResult.inspection_id,
            selected_figure_ids: selectedFigureIds,
            contribute_to_bank: contributeToBank,
          },
        });

        toast.success(`Exam "${paper.title}" created from PDF.`);
        navigate(`/papers/${paper.id}/configure`);
      } catch (err: any) {
        toast.error(extractApiErrorMessage(err, 'Failed to create paper from PDF.'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Curriculum Mode Submission
    if (examMode === 'single' && !chapterId) {
      toast.warning('Please select a chapter.');
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
      toast.error(extractApiErrorMessage(err, 'Failed to create paper.'));
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
            <div className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" radius="sm" />
                <Skeleton className="h-10 w-full" radius="card" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" radius="sm" />
                <Skeleton className="h-24 w-full" radius="card" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" radius="sm" />
                  <Skeleton className="h-10 w-full" radius="card" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" radius="sm" />
                  <Skeleton className="h-10 w-full" radius="card" />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Skeleton className="h-10 w-36" radius="pill" />
              </div>
            </div>
          )}

          {!isLoadingChapters && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-surface border border-border rounded-card p-6 sm:p-7 shadow-card space-y-5">
                {/* Source Mode Toggle: Curriculum Bank vs Upload PDF */}
                <div className="space-y-2">
                  <label className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider">
                    Examination Source Mode *
                  </label>
                  <div className="flex items-center p-1 bg-bg border border-border rounded-pill max-w-md">
                    <button
                      type="button"
                      onClick={() => setSourceMode('curriculum')}
                      className={`flex-1 py-2 px-3 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        sourceMode === 'curriculum'
                          ? 'bg-surface text-ink shadow-xs border border-border'
                          : 'text-ink/60 hover:text-ink'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5 text-forest" />
                      <span>Curriculum Syllabus</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceMode('pdf')}
                      className={`flex-1 py-2 px-3 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        sourceMode === 'pdf'
                          ? 'bg-forest text-surface shadow-xs'
                          : 'text-ink/60 hover:text-ink'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-lime" />
                      <span>Upload Chapter PDF</span>
                    </button>
                  </div>
                </div>

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

                {/* ============================================================== */}
                {/* MODE A: UPLOAD CHAPTER PDF / MULTIMODAL MODE */}
                {/* ============================================================== */}
                {sourceMode === 'pdf' && (
                  <div className="space-y-5 pt-1">
                    <div>
                      <label className="block font-heading text-xs font-semibold text-ink uppercase tracking-wider mb-2">
                        Upload Reference Document / Chapter PDF *
                      </label>
                      <div className="relative border-2 border-dashed border-border hover:border-forest/60 rounded-card p-6 bg-bg text-center transition-colors">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handlePdfFileChange}
                          disabled={isInspectingPdf || isSubmitting}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-forest/10 text-forest flex items-center justify-center">
                            {isInspectingPdf ? (
                              <Loader2 className="w-6 h-6 animate-spin text-forest" />
                            ) : (
                              <UploadCloud className="w-6 h-6" />
                            )}
                          </div>
                          {isInspectingPdf ? (
                            <div className="space-y-1">
                              <p className="font-heading font-semibold text-xs text-ink">
                                Extracting text and harvesting diagrams...
                              </p>
                              <p className="font-mono text-[11px] text-ink/50">
                                In-memory inspection typically takes 1–3 seconds
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <p className="font-heading font-semibold text-xs text-ink">
                                {uploadedFileName ? (
                                  <span className="text-forest flex items-center justify-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {uploadedFileName} (Click to replace)
                                  </span>
                                ) : (
                                  'Drop chapter PDF here, or click to browse'
                                )}
                              </p>
                              <p className="font-mono text-[11px] text-ink/50">
                                Supports textbooks, lecture notes, and question sheets (up to 100 pages)
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inspection Result Document Metrics */}
                    {inspectionResult && (
                      <div className="p-3.5 bg-forest/5 border border-forest/20 rounded-card flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-forest" />
                          <span className="font-heading font-semibold text-ink">
                            {inspectionResult.filename}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[11px] text-ink/70">
                          <span>{inspectionResult.page_count} Pages</span>
                          <span>•</span>
                          <span>~{inspectionResult.word_count.toLocaleString()} Words</span>
                          <span>•</span>
                          <span className="text-forest font-bold">{inspectionResult.figure_count} Figures</span>
                        </div>
                      </div>
                    )}

                    {/* Figure Picker Gallery */}
                    {inspectionResult && (
                      <FigurePickerGallery
                        figures={inspectionResult.figures}
                        selectedFigureIds={selectedFigureIds}
                        onToggleFigure={handleToggleFigure}
                        onSelectAll={handleSelectAllFigures}
                        onDeselectAll={handleDeselectAllFigures}
                      />
                    )}

                    {/* Institutional Bank Contribution Checkbox */}
                    <div className="p-3.5 bg-bg border border-border/80 rounded-card flex items-start gap-3">
                      <input
                        id="contribute-to-bank"
                        type="checkbox"
                        checked={contributeToBank}
                        onChange={(e) => setContributeToBank(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-forest focus:ring-forest cursor-pointer"
                      />
                      <label htmlFor="contribute-to-bank" className="text-xs text-ink/80 cursor-pointer select-none">
                        <strong className="font-heading font-semibold text-ink block">
                          Contribute to Institutional Question Bank
                        </strong>
                        <span className="text-[11px] text-ink/60">
                          Asynchronously extracts training layouts and adds extracted questions to your school's private question bank without delaying your exam creation.
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* ============================================================== */}
                {/* MODE B: STANDARD CURRICULUM SYLLABUS MODE */}
                {/* ============================================================== */}
                {sourceMode === 'curriculum' && (
                  <div className="space-y-5 pt-1">
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
                  className="px-6 py-2.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm cursor-pointer disabled:opacity-75 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Blueprint...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Configuration</span>
                      <span>→</span>
                    </>
                  )}
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

            {sourceMode === 'pdf' ? (
              <div className="space-y-3">
                <div className="font-heading font-bold text-xl text-ink truncate">
                  {inspectionResult ? inspectionResult.filename : 'Document Blueprint'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="pill pill-forest text-[10px]">Fast Multimodal Path</span>
                  <span className="pill bg-lime/20 text-forest border border-lime/30 text-[10px] font-semibold">
                    {selectedFigureIds.length} Diagram{selectedFigureIds.length === 1 ? '' : 's'} Selected
                  </span>
                </div>
                <div className="p-3 bg-bg rounded-lg border border-border/70 space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-ink/70">
                    <span>Source Mode:</span>
                    <strong className="text-ink">Direct Chapter PDF</strong>
                  </div>
                  <div className="flex justify-between text-ink/70">
                    <span>Diagram Storage:</span>
                    <strong className="text-forest">Google Drive Subfolder</strong>
                  </div>
                  <div className="flex justify-between text-ink/70">
                    <span>Modalities:</span>
                    <span className="text-[10px] text-ink/80">Math LaTeX, Tables, Diagrams</span>
                  </div>
                </div>
              </div>
            ) : examMode === 'single' ? (
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

