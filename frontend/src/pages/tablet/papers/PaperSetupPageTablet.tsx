import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Chapter, PdfInspectionResult } from '../../../types';
import { PaperWorkflowNavTablet } from './components/PaperWorkflowNavTablet';
import { FigurePickerGallery } from '../../papers/components/FigurePickerGallery';
import { CustomSelect } from '../../../components/ui/custom-select';
import { Skeleton } from '../../../components/ui/skeleton';
import { useToast } from '../../../context/ToastContext';
import { extractApiErrorMessage } from '../../../utils/errorUtils';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Loader2,
} from 'lucide-react';

export const PaperSetupPageTablet: React.FC = () => {
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

  // Multimodal PDF State
  const [sourceMode, setSourceMode] = useState<'curriculum' | 'pdf'>('curriculum');
  const [isInspectingPdf, setIsInspectingPdf] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<PdfInspectionResult | null>(null);
  const [selectedFigureIds, setSelectedFigureIds] = useState<string[]>([]);
  const [contributeToBank, setContributeToBank] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState('');

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

    // PDF Mode
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

    // Curriculum Mode
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
          Define syllabus chapter domain or upload a custom textbook PDF, exam title, and instructions for tablet generation.
        </p>
      </div>

      {isLoadingChapters && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" radius="sm" />
              <Skeleton className="h-10 w-full" radius="card" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" radius="sm" />
              <Skeleton className="h-10 w-full" radius="card" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" radius="sm" />
              <Skeleton className="h-20 w-full" radius="card" />
            </div>
            <div className="pt-2 flex items-center justify-between gap-3">
              <Skeleton className="h-11 w-24" radius="pill" />
              <Skeleton className="h-11 w-44" radius="pill" />
            </div>
          </div>
          <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Skeleton className="h-3 w-28" radius="sm" />
              <Skeleton className="h-5 w-20" radius="pill" />
            </div>
            <Skeleton className="h-6 w-3/4" radius="sm" />
            <Skeleton className="h-4 w-1/2" radius="sm" />
            <Skeleton className="h-14 w-full" radius="card" />
          </div>
        </div>
      )}

      {!isLoadingChapters && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Column 1: Touch Form */}
          <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
            {/* Source Mode Toggle: Curriculum Bank vs Upload PDF */}
            <div>
              <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1.5">
                Examination Source Mode *
              </label>
              <div className="flex items-center p-1 bg-bg border border-border rounded-pill">
                <button
                  type="button"
                  onClick={() => setSourceMode('curriculum')}
                  className={`flex-1 py-2 px-3 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
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
                  className={`flex-1 py-2 px-3 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
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

            {/* MODE A: UPLOAD CHAPTER PDF */}
            {sourceMode === 'pdf' && (
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1.5">
                    Upload Chapter PDF *
                  </label>
                  <div className="relative border-2 border-dashed border-border hover:border-forest/60 rounded-card p-5 bg-bg text-center transition-colors">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfFileChange}
                      disabled={isInspectingPdf || isSubmitting}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-forest/10 text-forest flex items-center justify-center">
                        {isInspectingPdf ? (
                          <Loader2 className="w-5 h-5 animate-spin text-forest" />
                        ) : (
                          <UploadCloud className="w-5 h-5" />
                        )}
                      </div>
                      {isInspectingPdf ? (
                        <div className="space-y-0.5">
                          <p className="font-heading font-semibold text-xs text-ink">
                            Extracting text and harvesting diagrams...
                          </p>
                          <p className="font-mono text-[10px] text-ink/50">
                            Fast inspection takes ~1-3s
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <p className="font-heading font-semibold text-xs text-ink">
                            {uploadedFileName ? (
                              <span className="text-forest flex items-center justify-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                {uploadedFileName} (Tap to replace)
                              </span>
                            ) : (
                              'Tap to browse or drop chapter PDF'
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-ink/50">
                            Supports textbooks & lecture notes (up to 100 pages)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inspection Summary */}
                {inspectionResult && (
                  <div className="p-3 bg-forest/5 border border-forest/20 rounded-card flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-forest" />
                      <span className="font-heading font-semibold text-ink truncate max-w-[180px]">
                        {inspectionResult.filename}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-ink/70">
                      <span>{inspectionResult.page_count} Pages</span>
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

                {/* Contribute Checkbox */}
                <div className="p-3 bg-bg border border-border/80 rounded-card flex items-start gap-2.5">
                  <input
                    id="tablet-contribute-to-bank"
                    type="checkbox"
                    checked={contributeToBank}
                    onChange={(e) => setContributeToBank(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-forest focus:ring-forest cursor-pointer"
                  />
                  <label htmlFor="tablet-contribute-to-bank" className="text-xs text-ink/80 cursor-pointer select-none">
                    <strong className="font-heading font-semibold text-ink block text-[11px]">
                      Contribute to Institutional Question Bank
                    </strong>
                    <span className="text-[10px] text-ink/60">
                      Silently extracts training layouts and adds extracted questions to your school's private question bank.
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* MODE B: CURRICULUM SYLLABUS MODE */}
            {sourceMode === 'curriculum' && (
              <div className="space-y-4 pt-1">
                {/* Blueprint Scope Mode: Single Chapter vs Multi-Subject */}
                <div>
                  <label className="block text-xs font-heading font-semibold text-ink uppercase mb-1">
                    Blueprint Scope Mode *
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setExamMode('single')}
                      className={`p-3 rounded-card border text-left transition-all cursor-pointer ${
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
                        Unit test or weekly assessment
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

                {/* Chapter Selection or Multi-Subject Pills */}
                {examMode === 'single' ? (
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
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-heading font-semibold text-ink uppercase">
                        Participating Subjects *
                      </label>
                      <span className="text-[11px] font-mono text-ink/40">
                        {selectedSubjects.length} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-0.5">
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
                            {subj}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                disabled={
                  isSubmitting ||
                  (sourceMode === 'pdf' && !inspectionResult) ||
                  (sourceMode === 'curriculum' && examMode === 'single' && chapters.length === 0)
                }
                className="px-6 py-3 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-75 min-h-[44px] flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Blueprint...</span>
                  </>
                ) : (
                  <>
                    <span>Configure Questions</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Column 2: Curriculum Context Card */}
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-card p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-mono uppercase tracking-wider text-ink/50 text-[10px]">
                  {sourceMode === 'pdf' ? 'PDF Blueprint Source' : 'Curriculum Scope'}
                </span>
                <span className="pill pill-forest text-[10px]">Step 1 of 6</span>
              </div>

              {sourceMode === 'pdf' ? (
                inspectionResult ? (
                  <div className="space-y-3">
                    <div className="font-heading font-bold text-lg text-ink">
                      {inspectionResult.filename}
                    </div>
                    <div className="p-3 bg-bg rounded-card border border-border space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-ink/60">Pages Scanned:</span>
                        <span className="font-bold text-forest">{inspectionResult.page_count} Pages</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink/60">Estimated Words:</span>
                        <span className="font-bold text-ink">~{inspectionResult.word_count.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink/60">Selected Diagrams:</span>
                        <span className="font-bold text-ember">
                          {selectedFigureIds.length} of {inspectionResult.figure_count} Figures
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-ink/70 leading-relaxed">
                      Questions will be formulated from the extracted text, formulas, and selected figures.
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-ink/60 py-3 space-y-2">
                    <p className="font-heading font-semibold text-ink">No PDF Document Uploaded Yet</p>
                    <p>Upload a chapter PDF on the left to view document statistics and select diagrams for your exam.</p>
                  </div>
                )
              ) : examMode === 'single' ? (
                selectedChapter ? (
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
                ) : (
                  <div className="text-xs text-ink/60 py-2">
                    Select a chapter to review curriculum coverage.
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <div className="font-heading font-bold text-xl text-ink">
                    Multi-Subject Examination
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedSubjects.map((s) => (
                      <span key={s} className="pill pill-forest text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="p-3 bg-bg rounded-card border border-border text-xs text-ink/70 mt-2">
                    Combined exam pooling questions across {selectedSubjects.length} chosen subjects.
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
              <h3 className="font-heading font-bold text-sm text-ink">Multimodal Exam Generation</h3>
              <p className="text-xs text-ink/70 leading-relaxed">
                Supports STEM formulas (LaTeX), chemical structures, financial tables, and embedded high-resolution figures.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
