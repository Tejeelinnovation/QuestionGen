import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { createIngestionJob, type IngestionJobDetail } from '../../api/ingestion';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (job: IngestionJobDetail) => void;
}

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [standard, setStandard] = useState<number>(10);
  const [board, setBoard] = useState('NCERT');
  const [documentKind, setDocumentKind] = useState<'TEXTBOOK' | 'HANDWRITTEN_NOTES'>('TEXTBOOK');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever modal opens or closes
  React.useEffect(() => {
    if (isOpen) {
      setFile(null);
      setTitle('');
      setSubject('Mathematics');
      setStandard(10);
      setBoard('NCERT');
      setDocumentKind('TEXTBOOK');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.toLowerCase().endsWith('.pdf')) {
        setError('Please upload a valid PDF document.');
        return;
      }
      setFile(selected);
      setError(null);
      // Automatically update the title to the newly chosen file name
      const cleanTitle = selected.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
      setTitle(cleanTitle);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF file to upload.');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a title for the document.');
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('source_file', file);
    formData.append('title', title.trim());
    formData.append('subject', subject);
    formData.append('standard', String(standard));
    formData.append('board', board);
    formData.append('document_kind', documentKind);

    try {
      const job = await createIngestionJob(formData);
      setIsUploading(false);
      onSuccess(job);
      onClose();
    } catch (err: any) {
      setIsUploading(false);
      setError(err?.response?.data?.detail || err?.message || 'Failed to upload document.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute top-5 right-5 text-ink/40 hover:text-ink transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-heading font-bold text-ink">Upload Document for Dataset</h2>
            <p className="text-xs text-ink/60">
              Extract multi-column text, formulas in LaTeX, and diagrams for AI training.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Drag & Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
              file
                ? 'border-forest bg-forest/5'
                : 'border-border hover:border-forest/40 hover:bg-surface-muted'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-7 h-7 text-forest shrink-0" />
                  <div className="text-left truncate">
                    <p className="text-sm font-heading font-bold text-ink truncate">{file.name}</p>
                    <p className="text-xs text-ink/50">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                        fileInputRef.current.click();
                      }
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-border bg-surface hover:bg-surface-muted text-ink/70 font-semibold"
                  >
                    Change File
                  </button>
                  <CheckCircle2 className="w-5 h-5 text-forest" />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <UploadCloud className="w-8 h-8 text-ink/40 mx-auto" />
                <p className="text-xs font-heading font-semibold text-ink">Click to select PDF or drag and drop</p>
                <p className="text-[11px] text-ink/50">Supports Textbooks, Chapter booklets, and Notes up to 100MB</p>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-heading font-semibold text-ink/80 mb-1">
              Document Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. NCERT Class 10 Mathematics Chapter 1-5"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-border bg-surface text-ink focus:outline-none focus:border-forest"
            />
          </div>

          {/* Document Kind & Board */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-semibold text-ink/80 mb-1">
                Document Type
              </label>
              <select
                value={documentKind}
                onChange={(e) => setDocumentKind(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface text-ink focus:outline-none focus:border-forest"
              >
                <option value="TEXTBOOK">Digitally Typed Textbook</option>
                <option value="HANDWRITTEN_NOTES">Handwritten Notes (OCR Track)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-heading font-semibold text-ink/80 mb-1">
                Curriculum Board
              </label>
              <select
                value={board}
                onChange={(e) => setBoard(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface text-ink focus:outline-none focus:border-forest"
              >
                <option value="NCERT">NCERT</option>
                <option value="CBSE">CBSE</option>
                <option value="GSEB">GSEB (Gujarat Board)</option>
                <option value="ICSE">ICSE</option>
                <option value="STATE_BOARD">State Board</option>
              </select>
            </div>
          </div>

          {/* Subject & Standard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-heading font-semibold text-ink/80 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Mathematics, Science"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-border bg-surface text-ink focus:outline-none focus:border-forest"
              />
            </div>

            <div>
              <label className="block text-xs font-heading font-semibold text-ink/80 mb-1">
                Standard / Class
              </label>
              <select
                value={standard}
                onChange={(e) => setStandard(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-surface text-ink focus:outline-none focus:border-forest"
              >
                {[6, 7, 8, 9, 10, 11, 12].map((cls) => (
                  <option key={cls} value={cls}>
                    Class {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-heading font-semibold text-ink/70 hover:text-ink rounded-xl border border-border hover:bg-surface-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="px-5 py-2 text-xs font-heading font-bold text-white bg-forest hover:bg-forest/90 rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Uploading & Initializing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upload & Scan PDF</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
