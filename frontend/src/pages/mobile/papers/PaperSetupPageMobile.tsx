import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { contentApi } from '../../../api/content';
import { papersApi } from '../../../api/papers';
import { useAuth } from '../../../auth/AuthContext';
import type { Chapter, PdfInspectionResult } from '../../../types';
import { PaperWorkflowNavMobile } from './components/PaperWorkflowNavMobile';
import { FigurePickerGallery } from '../../papers/components/FigurePickerGallery';
import { useToast } from '../../../context/ToastContext';
import { extractApiErrorMessage } from '../../../utils/errorUtils';
import {
  ArrowRight,
  UploadCloud,
  FileText,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { CustomSelect } from '../../../components/ui/custom-select';
import { Skeleton } from '../../../components/ui/skeleton';

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

  // Multimodal PDF State
  const [sourceMode, setSourceMode] = useState<'curriculum' | 'pdf'>('curriculum');
  const [isInspectingPdf, setIsInspectingPdf] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<PdfInspectionResult | null>(null);
  const [inspectionProgress, setInspectionProgress] = useState<{
    step: number;
    total: number;
    label: string;
    sublabel: string;
  } | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [selectedFigureIds, setSelectedFigureIds] = useState<string[]>([]);
  const [contributeToBank, setContributeToBank] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState('');

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
    setInspectionError(null);
    setInspectionProgress({
      step: 1,
      total: 3,
      label: 'Reading chapter pages & text...',
      sublabel: `Analyzing ${file.name} for text and typography...`,
    });

    const timer1 = setTimeout(() => {
      setInspectionProgress({
        step: 2,
        total: 3,
        label: 'Scanning figures & diagrams...',
        sublabel: 'Harvesting educational charts and diagrams in parallel...',
      });
    }, 1800);

    const timer2 = setTimeout(() => {
      setInspectionProgress({
        step: 3,
        total: 3,
        label: 'Structuring blueprint...',
        sublabel: 'Finalizing page inspection cache...',
      });
    }, 5500);

    try {
      const result = await papersApi.inspectPdf(file);
      clearTimeout(timer1);
      clearTimeout(timer2);
      setInspectionResult(result);
      setInspectionProgress(null);
      setSelectedFigureIds([]);

      if (!title.trim()) {
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setTitle(`${cleanTitle} Exam`);
      }
      toast.success(
        `PDF analyzed: ${result.page_count} pages, ${result.figure_count} diagrams found.`
      );
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      const errMsg = extractApiErrorMessage(err, 'Failed to inspect PDF document.');
      setInspectionError(errMsg);
      setInspectionProgress(null);
      setUploadedFileName(''); // Clear false positive
      toast.error(errMsg);
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
          Establish the examination title, syllabus source, and student instructions.
        </p>
      </div>

      {/* Setup Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 rounded-card bg-surface border border-border shadow-xs space-y-3.5">
          {/* Source Mode Toggle: Curriculum Bank vs Upload PDF */}
          <div className="space-y-1.5">
            <label className="block text-xs font-heading font-semibold text-ink">
              Examination Source Mode *
            </label>
            <div className="flex items-center p-1 bg-bg border border-border rounded-pill">
              <button
                type="button"
                onClick={() => setSourceMode('curriculum')}
                className={`flex-1 py-2 px-2.5 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
                  sourceMode === 'curriculum'
                    ? 'bg-surface text-ink shadow-xs border border-border'
                    : 'text-ink/60 hover:text-ink'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-forest" />
                <span>Syllabus Bank</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('pdf')}
                className={`flex-1 py-2 px-2.5 rounded-pill text-xs font-heading font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
                  sourceMode === 'pdf'
                    ? 'bg-forest text-surface shadow-xs'
                    : 'text-ink/60 hover:text-ink'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-lime" />
                <span>Upload PDF</span>
              </button>
            </div>
          </div>

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

          {/* MODE A: UPLOAD CHAPTER PDF */}
          {sourceMode === 'pdf' && (
            <div className="space-y-3.5 pt-1">
              <div className="space-y-1.5">
                <label className="block text-xs font-heading font-semibold text-ink">
                  Upload Reference Chapter PDF *
                </label>
                <div className="relative border-2 border-dashed border-border hover:border-forest/60 rounded-card p-4 bg-bg text-center transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfFileChange}
                    disabled={isInspectingPdf || isSubmitting}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  {isInspectingPdf && inspectionProgress ? (
                    <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none py-1 w-full max-w-xs mx-auto">
                      <div className="w-9 h-9 rounded-full bg-forest/10 text-forest flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-forest" />
                      </div>
                      <div className="space-y-1 text-center w-full">
                        <div className="flex items-center justify-between text-[10px] font-mono text-ink/60 px-0.5">
                          <span className="font-heading font-semibold text-forest">
                            Step {inspectionProgress.step}/{inspectionProgress.total}
                          </span>
                          <span>{Math.round((inspectionProgress.step / inspectionProgress.total) * 100)}%</span>
                        </div>
                        <div className="w-full bg-border/60 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-forest h-1 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(inspectionProgress.step / inspectionProgress.total) * 100}%` }}
                          />
                        </div>
                        <p className="font-heading font-semibold text-xs text-ink pt-0.5">
                          {inspectionProgress.label}
                        </p>
                        <p className="font-mono text-[9px] text-ink/50 leading-tight">
                          {inspectionProgress.sublabel}
                        </p>
                      </div>
                    </div>
                  ) : inspectionError ? (
                    <div className="flex flex-col items-center justify-center space-y-1.5 py-1">
                      <div className="w-9 h-9 rounded-full bg-ember/10 text-ember flex items-center justify-center">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 text-center max-w-xs px-2">
                        <p className="font-heading font-semibold text-xs text-ember">
                          Inspection Failed
                        </p>
                        <p className="text-[10px] text-ink/70 break-words leading-tight">
                          {inspectionError}
                        </p>
                        <p className="text-[9px] font-mono text-forest underline pt-0.5">
                          Tap to select another file
                        </p>
                      </div>
                    </div>
                  ) : inspectionResult ? (
                    <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none py-0.5">
                      <div className="w-9 h-9 rounded-full bg-forest/10 text-forest flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-forest" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-heading font-semibold text-xs text-forest flex items-center justify-center gap-1">
                          <span>{uploadedFileName}</span>
                          <span className="text-[9px] font-mono text-ink/50">(Tap to change)</span>
                        </p>
                        <p className="font-mono text-[9px] text-ink/60">
                          {inspectionResult.page_count} pages • {inspectionResult.figure_count} diagrams
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none py-0.5">
                      <div className="w-9 h-9 rounded-full bg-forest/10 text-forest flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-heading font-semibold text-xs text-ink">
                          Tap to select chapter PDF
                        </p>
                        <p className="font-mono text-[9px] text-ink/50">
                          Supports textbooks up to 100 pages
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Inspection Summary */}
              {inspectionResult && (
                <div className="p-3 bg-forest/5 border border-forest/20 rounded-card flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 text-forest flex-shrink-0" />
                    <span className="font-heading font-semibold text-ink text-xs truncate">
                      {inspectionResult.filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink/70 flex-shrink-0">
                    <span>{inspectionResult.page_count} pgs</span>
                    <span>•</span>
                    <span className="text-forest font-bold">{inspectionResult.figure_count} figures</span>
                  </div>
                </div>
              )}

              {/* Figure Picker */}
              {inspectionResult && (
                <FigurePickerGallery
                  figures={inspectionResult.figures}
                  selectedFigureIds={selectedFigureIds}
                  onToggleFigure={handleToggleFigure}
                  onSelectAll={handleSelectAllFigures}
                  onDeselectAll={handleDeselectAllFigures}
                />
              )}

              {/* Contribution Checkbox */}
              <div className="p-3 bg-bg border border-border/80 rounded-card flex items-start gap-2.5">
                <input
                  id="mobile-contribute-to-bank"
                  type="checkbox"
                  checked={contributeToBank}
                  onChange={(e) => setContributeToBank(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-forest focus:ring-forest cursor-pointer"
                />
                <label htmlFor="mobile-contribute-to-bank" className="text-xs text-ink/80 cursor-pointer select-none">
                  <strong className="font-heading font-semibold text-ink block text-[11px]">
                    Contribute to School Question Bank
                  </strong>
                  <span className="text-[10px] text-ink/60">
                    Silently archives extracted figures and layout to your question repository.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* MODE B: STANDARD CURRICULUM SYLLABUS */}
          {sourceMode === 'curriculum' && (
            <div className="space-y-3.5 pt-1">
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
                    <Skeleton className="h-12 w-full" radius="card" />
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
          disabled={
            isSubmitting ||
            (sourceMode === 'pdf' && (!inspectionResult || isInspectingPdf)) ||
            (sourceMode === 'curriculum' && (isLoadingChapters || (examMode === 'single' && !chapterId)))
          }
          className="w-full py-3.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-sm hover:bg-forest/90 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 min-h-[48px] cursor-pointer disabled:opacity-75"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Creating Blueprint...</span>
            </>
          ) : isInspectingPdf ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-lime" />
              <span>Analyzing Chapter PDF...</span>
            </>
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
