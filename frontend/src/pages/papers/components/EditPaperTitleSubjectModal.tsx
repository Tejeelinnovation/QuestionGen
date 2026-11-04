import React, { useState, useEffect } from 'react';
import { X, Sparkles, BookOpen, Loader2, Check, AlertCircle } from 'lucide-react';
import { papersApi } from '../../../api/papers';
import { useToast } from '../../../context/ToastContext';
import { extractApiErrorMessage } from '../../../utils/errorUtils';

export interface EditPaperTitleSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  paperId: number;
  initialTitle: string;
  initialSubject?: string;
  onSaved: (newTitle: string, newSubject: string) => void;
}

const COMMON_CURRICULUM_SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Science',
  'Social Science',
  'English',
  'Computer Science',
  'Commerce',
  'Economics',
];

export const EditPaperTitleSubjectModal: React.FC<EditPaperTitleSubjectModalProps> = ({
  isOpen,
  onClose,
  paperId,
  initialTitle,
  initialSubject = '',
  onSaved,
}) => {
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle || '');
  const [subject, setSubject] = useState(initialSubject || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle || '');
      setSubject(initialSubject || '');
      setErrorMessage(null);
    }
  }, [isOpen, initialTitle, initialSubject]);

  // Lock body scroll & listen to Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const handleSelectSubject = (selected: string) => {
    setSubject(selected);
    if (!title.trim() || title === 'Exam Paper' || title.endsWith('Exam Paper')) {
      setTitle(`${selected} Exam Paper`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Examination title cannot be empty.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const cleanSubject = subject.trim();
      const updatedPaper = await papersApi.updatePaper(paperId, {
        title: title.trim(),
        subjects: cleanSubject ? [cleanSubject] : [],
      });

      toast.success('Paper title and subject updated successfully.');
      onSaved(updatedPaper.title, cleanSubject);
      onClose();
    } catch (err: any) {
      const msg = extractApiErrorMessage(err, 'Failed to update paper title and subject.');
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div className="bg-surface border border-border rounded-t-card sm:rounded-card w-full max-w-lg shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/80 flex items-center justify-between bg-bg/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-forest/10 text-forest flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-ink">
                Modify Examination Title & Subject
              </h3>
              <p className="text-[11px] text-ink/60 font-body">
                Update the academic discipline or examination title for this paper.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded-md text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 font-body">
          {errorMessage && (
            <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Academic Subject Field */}
          <div>
            <label className="block text-xs font-heading font-semibold text-ink uppercase tracking-wider mb-1.5">
              Curriculum Subject Name
            </label>

            {/* Quick Discipline Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {COMMON_CURRICULUM_SUBJECTS.map((subj) => {
                const isSelected = subject.toLowerCase() === subj.toLowerCase();
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => handleSelectSubject(subj)}
                    className={`px-2.5 py-1 text-xs rounded-pill border transition-all cursor-pointer font-medium ${
                      isSelected
                        ? 'bg-forest text-white border-forest font-semibold'
                        : 'bg-bg text-ink/70 border-border hover:border-forest/50 hover:bg-forest/5'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
                    {subj}
                  </button>
                );
              })}
            </div>

            {/* Custom Input */}
            <div className="relative">
              <BookOpen className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Organic Chemistry, Zoology, World History..."
                className="w-full rounded-card border border-border bg-bg pl-9 pr-3 py-2 text-xs text-ink placeholder:text-ink/40 focus:border-forest focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Paper Title Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="edit-modal-title"
                className="block text-xs font-heading font-semibold text-ink uppercase tracking-wider"
              >
                Examination Title *
              </label>
              {subject.trim() && (
                <button
                  type="button"
                  onClick={() => setTitle(`${subject.trim()} Exam Paper`)}
                  className="text-[11px] text-forest font-heading font-semibold hover:underline cursor-pointer"
                >
                  Set to "{subject.trim()} Exam Paper"
                </button>
              )}
            </div>
            <input
              id="edit-modal-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grade 10 Mid-Term - Real Numbers & Polynomials"
              required
              className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink placeholder:text-ink/40 focus:border-forest focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-ink/50 mt-1">
              Reflected across printed PDF sheets, student test sessions, and Word (.docx) exports.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-bg text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
