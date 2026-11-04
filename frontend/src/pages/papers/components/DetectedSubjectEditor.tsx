import React, { useState } from 'react';
import { Sparkles, Edit3, Check, RotateCcw, AlertCircle, BookOpen } from 'lucide-react';

interface DetectedSubjectEditorProps {
  subject: string;
  detectedSubject?: string;
  detectedTitle?: string;
  isGuessed: boolean;
  onSubjectChange: (newSubject: string) => void;
  title: string;
  onTitleChange: (newTitle: string) => void;
  syncTitleWithSubject?: boolean;
  onToggleSyncTitle?: (sync: boolean) => void;
  isCustomized?: boolean;
  onCustomizedChange?: (customized: boolean) => void;
  className?: string;
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

export const DetectedSubjectEditor: React.FC<DetectedSubjectEditorProps> = ({
  subject,
  detectedSubject = '',
  detectedTitle = '',
  isGuessed,
  onSubjectChange,
  title,
  onTitleChange,
  syncTitleWithSubject = true,
  onToggleSyncTitle,
  isCustomized = false,
  onCustomizedChange,
  className = '',
}) => {
  // If the system couldn't guess the subject, default the editor to open so user provides it
  const [isOpen, setIsOpen] = useState(!detectedSubject && !subject);
  const [localCustomSubject, setLocalCustomSubject] = useState(subject || '');

  const handleSelectSubject = (selected: string) => {
    setLocalCustomSubject(selected);
    onSubjectChange(selected);
    if (onCustomizedChange) {
      onCustomizedChange(selected !== detectedSubject);
    }
    if (syncTitleWithSubject && selected.trim()) {
      onTitleChange(`${selected.trim()} Exam Paper`);
    }
  };

  const handleCustomSubjectInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalCustomSubject(val);
    onSubjectChange(val);
    if (onCustomizedChange) {
      onCustomizedChange(val.trim() !== detectedSubject);
    }
    if (syncTitleWithSubject && val.trim()) {
      onTitleChange(`${val.trim()} Exam Paper`);
    }
  };

  const handleResetToGuessed = () => {
    if (detectedSubject) {
      setLocalCustomSubject(detectedSubject);
      onSubjectChange(detectedSubject);
      if (onCustomizedChange) {
        onCustomizedChange(false);
      }
      if (detectedTitle) {
        onTitleChange(detectedTitle);
      } else if (syncTitleWithSubject) {
        onTitleChange(`${detectedSubject} Exam Paper`);
      }
    }
  };

  const isUserModified = isCustomized || (Boolean(detectedSubject) && subject !== detectedSubject);

  return (
    <div className={`p-4 bg-surface border rounded-card shadow-xs transition-colors ${
      !subject && !detectedSubject
        ? 'border-amber-300 bg-amber-50/30'
        : isUserModified
        ? 'border-indigo-200 bg-indigo-50/20'
        : 'border-forest/20 bg-forest/5'
    } ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-forest shrink-0" />
          <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-ink">
            Curriculum Subject & Title
          </h4>
          {isUserModified ? (
            <span className="px-2 py-0.5 rounded-pill bg-indigo-100 border border-indigo-200 text-[10px] font-mono font-semibold text-indigo-700">
              ✏️ User Customized
            </span>
          ) : isGuessed && detectedSubject ? (
            <span className="px-2 py-0.5 rounded-pill bg-forest/10 border border-forest/30 text-[10px] font-mono font-semibold text-forest">
              ✨ Auto-Detected
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-pill bg-amber-100 border border-amber-300 text-[10px] font-mono font-semibold text-amber-800">
              ⚠️ Not Specified
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1 text-xs font-heading font-semibold rounded-pill border border-border bg-bg text-ink/80 hover:text-ink hover:bg-surface-muted transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5 text-forest" />
          <span>{isOpen ? 'Done Editing' : 'Modify Subject / Title'}</span>
        </button>
      </div>

      {/* Summary View (When Collapsed) */}
      {!isOpen && (
        <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-ink/60 font-medium">Assigned Subject:</span>
            <span className="font-heading font-bold text-ink px-2.5 py-1 bg-bg border border-border rounded-md shadow-2xs">
              {subject || 'General / Unspecified'}
            </span>
            <span className="text-ink/40">•</span>
            <span className="text-ink/60 font-medium">Exam Title:</span>
            <span className="font-heading font-semibold text-ink truncate max-w-xs">
              {title || 'Exam Paper'}
            </span>
            {isUserModified && (
              <span className="text-[11px] font-mono text-indigo-600">
                (Customized)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="text-forest text-[11px] font-heading font-semibold hover:underline cursor-pointer self-start sm:self-auto"
          >
            Change Subject or Title →
          </button>
        </div>
      )}

      {/* Interactive Modification Editor (When Expanded) */}
      {isOpen && (
        <div className="pt-3 space-y-4">
          {!detectedSubject && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Document text analysis did not detect an unambiguous academic discipline. Please choose or enter your subject below to guarantee correct question alignment.
              </span>
            </div>
          )}

          {/* Quick Subject Select Pills */}
          <div>
            <label className="block text-[11px] font-heading font-semibold text-ink/80 uppercase tracking-wide mb-2">
              Select Standard Discipline:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_CURRICULUM_SUBJECTS.map((subj) => {
                const isSelected = subject.toLowerCase() === subj.toLowerCase();
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => handleSelectSubject(subj)}
                    className={`px-3 py-1.5 text-xs rounded-pill border transition-all cursor-pointer font-medium ${
                      isSelected
                        ? 'bg-forest text-white border-forest font-semibold shadow-xs'
                        : 'bg-bg text-ink/70 border-border hover:border-forest/50 hover:bg-forest/5 hover:text-ink'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
                    {subj}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Subject Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="custom-subject-input"
                className="block text-[11px] font-heading font-semibold text-ink/80 uppercase tracking-wide"
              >
                Or Specify Custom Subject Name:
              </label>
              {detectedSubject && subject !== detectedSubject && (
                <button
                  type="button"
                  onClick={handleResetToGuessed}
                  className="text-[11px] text-forest font-heading font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to system guess ("{detectedSubject}")</span>
                </button>
              )}
            </div>
            <div className="relative">
              <BookOpen className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="custom-subject-input"
                type="text"
                value={localCustomSubject}
                onChange={handleCustomSubjectInputChange}
                placeholder="e.g. Organic Chemistry, Marine Biology, Microeconomics..."
                className="w-full rounded-card border border-border bg-bg pl-9 pr-4 py-2 text-xs text-ink placeholder:text-ink/40 focus:border-forest focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Synchronization Checkbox */}
          {onToggleSyncTitle && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/60">
              <input
                id="sync-title-checkbox"
                type="checkbox"
                checked={syncTitleWithSubject}
                onChange={(e) => onToggleSyncTitle(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-forest focus:ring-forest cursor-pointer"
              />
              <label
                htmlFor="sync-title-checkbox"
                className="text-[11px] text-ink/70 cursor-pointer select-none"
              >
                Auto-update examination title to match subject (e.g. "{subject || 'Subject'} Exam Paper")
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
