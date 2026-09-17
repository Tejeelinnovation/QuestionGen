import React, { useState, useEffect, useRef } from 'react';
import { importApi } from '../../api/import';
import { useToast } from '../../context/ToastContext';
import type { ImportReport, SchoolCapacityInfo } from '../../types';
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  X,
  Users,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
  onSuccess?: () => void;
  defaultRole?: 'student' | 'teacher';
  initialRole?: 'student' | 'teacher';
  schoolId?: number;
  schoolName?: string;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  onSuccess,
  defaultRole,
  initialRole,
  schoolId,
  schoolName,
}) => {
  const toast = useToast();
  const effectiveDefaultRole = initialRole || defaultRole || 'student';
  const [activeRole, setActiveRole] = useState<'student' | 'teacher'>(effectiveDefaultRole);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [capacity, setCapacity] = useState<SchoolCapacityInfo | null>(null);
  const [isLoadingCapacity, setIsLoadingCapacity] = useState<boolean>(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeReportTab, setActiveReportTab] = useState<
    'created' | 'over_limit' | 'duplicates' | 'invalid'
  >('created');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync role if defaultRole changes
  useEffect(() => {
    setActiveRole(effectiveDefaultRole);
    setReport(null);
    setSelectedFile(null);
    setError(null);
  }, [effectiveDefaultRole, isOpen]);

  // Fetch capacity metrics
  const fetchCapacity = async () => {
    setIsLoadingCapacity(true);
    try {
      const data = await importApi.getCapacity(schoolId);
      setCapacity(data);
    } catch (err: any) {
      console.error('Failed to load school capacity:', err);
    } finally {
      setIsLoadingCapacity(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCapacity();
    }
  }, [isOpen, schoolId]);

  if (!isOpen) return null;

  const currentRoleCapacity =
    activeRole === 'student' ? capacity?.students : capacity?.teachers;
  const currentLimit = currentRoleCapacity?.limit ?? 0;
  const currentUsage = currentRoleCapacity?.current ?? 0;
  const currentRemaining = currentRoleCapacity?.remaining ?? 0;
  const usagePercentage =
    currentLimit > 0 ? Math.min(100, Math.round((currentUsage / currentLimit) * 100)) : 0;

  const handleDownloadTemplate = async () => {
    try {
      await importApi.downloadTemplate(activeRole);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download sample template.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls') ||
        file.type.includes('spreadsheet')
      ) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please upload a valid Microsoft Excel workbook (.xlsx or .xls).');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) {
      setError('Please select an Excel workbook to upload.');
      toast.warning('Please select an Excel workbook to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setReport(null);

    try {
      let resultReport: ImportReport;
      if (activeRole === 'student') {
        resultReport = await importApi.importStudents(selectedFile, schoolId);
      } else {
        resultReport = await importApi.importTeachers(selectedFile, schoolId);
      }

      setReport(resultReport);
      fetchCapacity();
      if (resultReport.summary.created_count > 0) {
        onImportSuccess?.();
        onSuccess?.();
      }

      if (resultReport.summary.created_count > 0 && resultReport.summary.invalid_count === 0) {
        toast.success(`Excel Import Complete: ${resultReport.summary.created_count} accounts imported successfully!`);
      } else if (resultReport.summary.created_count > 0) {
        toast.warning(`Imported ${resultReport.summary.created_count} accounts with ${resultReport.summary.invalid_count} errors.`);
      } else {
        toast.error(`Import finished with 0 accounts created and ${resultReport.summary.invalid_count} errors.`);
      }

      // Default active report tab to the most relevant one
      if (resultReport.summary.created_count > 0) {
        setActiveReportTab('created');
      } else if (resultReport.summary.over_limit_count > 0) {
        setActiveReportTab('over_limit');
      } else if (resultReport.summary.duplicate_count > 0) {
        setActiveReportTab('duplicates');
      } else {
        setActiveReportTab('invalid');
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Failed to process Excel workbook. Please check file format and try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetForAnother = () => {
    setSelectedFile(null);
    setReport(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-card shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-surface-muted/30">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-pill bg-forest text-white text-[11px] font-heading font-semibold flex items-center gap-1 shadow-sm">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel Bulk Provisioning
              </span>
              {schoolName && (
                <span className="text-xs font-mono text-ink/60">{schoolName}</span>
              )}
            </div>
            <h2 className="font-heading font-bold text-2xl text-ink">
              Import {activeRole === 'student' ? 'Students' : 'Teachers'} via Excel
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-pill text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Role Selector Tabs ── */}
        <div className="px-5 pt-4 pb-1 border-b border-border/80 flex items-center gap-3 bg-surface">
          <button
            type="button"
            onClick={() => {
              setActiveRole('student');
              setReport(null);
              setSelectedFile(null);
              setError(null);
            }}
            className={`pb-2.5 px-3 text-xs font-heading font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeRole === 'student'
                ? 'border-forest text-forest'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Student Cohort Import</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveRole('teacher');
              setReport(null);
              setSelectedFile(null);
              setError(null);
            }}
            className={`pb-2.5 px-3 text-xs font-heading font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeRole === 'teacher'
                ? 'border-grape text-grape'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Faculty Teacher Import</span>
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* 1. School Quota & Atomic Capacity Meter */}
          <div className="p-4 rounded-card bg-surface-muted/60 border border-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-heading font-semibold text-ink">
                  <ShieldCheck className="w-4 h-4 text-forest" />
                  <span>Enforced Organization Quota</span>
                  {isLoadingCapacity && <Loader2 className="w-3.5 h-3.5 text-forest animate-spin ml-1" />}
                </div>
                <p className="text-[11px] text-ink/65">
                  Super Admin configured limit. Accounts can only be created within remaining capacity.
                </p>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-ink/60">
                  Usage:{' '}
                  <strong className="text-ink">
                    {currentUsage} / {currentLimit}
                  </strong>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-pill font-heading font-bold text-[11px] ${
                    currentRemaining > 0
                      ? 'bg-forest/10 text-forest border border-forest/20'
                      : 'bg-ember/10 text-ember border border-ember/20'
                  }`}
                >
                  {currentRemaining} slots available
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1">
              <div className="h-2 w-full bg-border/60 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    usagePercentage >= 95
                      ? 'bg-ember'
                      : usagePercentage >= 80
                      ? 'bg-amber-500'
                      : 'bg-forest'
                  }`}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-ink/50 font-mono">
                <span>0</span>
                <span>{usagePercentage}% utilized</span>
                <span>{currentLimit} max capacity</span>
              </div>
            </div>
          </div>

          {/* 2. Download Sample Template Section */}
          <div className="p-4 rounded-card border border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-forest" />
                <span className="font-heading font-bold text-xs text-ink">
                  Step 1: Download Standard Sample Template
                </span>
              </div>
              <p className="text-xs text-ink/65 max-w-lg">
                {activeRole === 'student' ? (
                  <>
                    Columns required: <strong>Student Name</strong>, <strong>GR Number</strong>,{' '}
                    <strong>Roll Number</strong>, <strong>Standard</strong> (e.g. 6, 6th, VI),{' '}
                    <strong>Division</strong> (e.g. A), <strong>Phone Number</strong> (+91).
                  </>
                ) : (
                  <>
                    Columns required: <strong>Teacher Name</strong>,{' '}
                    <strong>Teacher Mobile Number</strong> (+91), <strong>Subject</strong>,{' '}
                    <strong>Class Teacher</strong> (e.g. Standard 6 — A or None).
                  </>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3.5 py-2 rounded-pill bg-forest/10 border border-forest/30 text-forest font-heading font-semibold text-xs hover:bg-forest hover:text-white transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {activeRole === 'student' ? 'Student' : 'Teacher'} Template</span>
            </button>
          </div>

          {/* 3. Drag & Drop File Upload Dropzone */}
          {!report && (
            <div className="space-y-3">
              <span className="font-heading font-bold text-xs text-ink flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-grape" />
                Step 2: Upload Completed Workbook (.xlsx)
              </span>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-card p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5 ${
                  isDragging
                    ? 'border-forest bg-forest/5 scale-[0.99]'
                    : selectedFile
                    ? 'border-forest/60 bg-forest/5'
                    : 'border-border bg-surface hover:border-forest/40 hover:bg-surface-muted/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <FileSpreadsheet
                  className={`w-10 h-10 ${
                    selectedFile ? 'text-forest' : 'text-ink/40'
                  }`}
                />

                {selectedFile ? (
                  <div className="space-y-1">
                    <div className="font-heading font-bold text-sm text-ink flex items-center justify-center gap-1.5">
                      <span>{selectedFile.name}</span>
                      <span className="text-xs text-ink/50 font-mono">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <p className="text-xs text-forest font-medium">
                      Ready to process. Click below to initiate atomic validation and import.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-heading font-semibold text-xs text-ink">
                      Drag and drop your completed Excel workbook here, or{' '}
                      <span className="text-forest underline underline-offset-2">browse file</span>
                    </p>
                    <p className="text-[11px] text-ink/50">
                      Supports .xlsx workbooks formatted according to the downloaded template.
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-center gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* 4. Import Results & Detailed Audit Report */}
          {report && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
                <div>
                  <h3 className="font-heading font-bold text-lg text-ink flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-forest" />
                    Import Audit & Execution Report
                  </h3>
                  <p className="text-xs text-ink/65">
                    Total Processed Rows: <strong>{report.summary.total_rows}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetForAnother}
                  className="px-3 py-1 text-xs font-heading font-semibold rounded-pill bg-surface border border-border text-ink hover:bg-surface-muted transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Upload Another File</span>
                </button>
              </div>

              {/* Stat Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Created */}
                <div
                  onClick={() => setActiveReportTab('created')}
                  className={`p-3 rounded-card border transition-all cursor-pointer ${
                    activeReportTab === 'created'
                      ? 'border-forest bg-forest/10 ring-2 ring-forest/30'
                      : 'border-border bg-surface hover:border-forest/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-heading font-semibold text-forest">
                    <span>Created</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-bold font-heading text-forest mt-1">
                    {report.summary.created_count}
                  </div>
                  <div className="text-[10px] text-ink/60 mt-0.5">Accounts provisioned</div>
                </div>

                {/* Over Limit */}
                <div
                  onClick={() => setActiveReportTab('over_limit')}
                  className={`p-3 rounded-card border transition-all cursor-pointer ${
                    activeReportTab === 'over_limit'
                      ? 'border-ember bg-ember/10 ring-2 ring-ember/30'
                      : 'border-border bg-surface hover:border-ember/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-heading font-semibold text-ember">
                    <span>Over Limit</span>
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-bold font-heading text-ember mt-1">
                    {report.summary.over_limit_count}
                  </div>
                  <div className="text-[10px] text-ink/60 mt-0.5">Exceeded capacity</div>
                </div>

                {/* Duplicates */}
                <div
                  onClick={() => setActiveReportTab('duplicates')}
                  className={`p-3 rounded-card border transition-all cursor-pointer ${
                    activeReportTab === 'duplicates'
                      ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
                      : 'border-border bg-surface hover:border-amber-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-heading font-semibold text-amber-600">
                    <span>Duplicates</span>
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-bold font-heading text-amber-600 mt-1">
                    {report.summary.duplicate_count}
                  </div>
                  <div className="text-[10px] text-ink/60 mt-0.5">Already in database</div>
                </div>

                {/* Invalid */}
                <div
                  onClick={() => setActiveReportTab('invalid')}
                  className={`p-3 rounded-card border transition-all cursor-pointer ${
                    activeReportTab === 'invalid'
                      ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30'
                      : 'border-border bg-surface hover:border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-heading font-semibold text-rose-600">
                    <span>Invalid</span>
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-bold font-heading text-rose-600 mt-1">
                    {report.summary.invalid_count}
                  </div>
                  <div className="text-[10px] text-ink/60 mt-0.5">Missing or format errors</div>
                </div>
              </div>

              {/* Tabbed Drilldown List */}
              <div className="border border-border rounded-card bg-surface overflow-hidden">
                <div className="p-3 border-b border-border bg-surface-muted/40 flex items-center justify-between text-xs font-heading font-bold text-ink">
                  <span className="capitalize">{activeReportTab.replace('_', ' ')} Records</span>
                  <span className="font-mono text-[11px] text-ink/50">
                    {activeReportTab === 'created'
                      ? report.created.length
                      : activeReportTab === 'over_limit'
                      ? report.over_limit.length
                      : activeReportTab === 'duplicates'
                      ? report.duplicates.length
                      : report.invalid.length}{' '}
                    Rows
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-border/60 text-xs">
                  {activeReportTab === 'created' && (
                    <>
                      {report.created.length === 0 ? (
                        <div className="p-6 text-center text-ink/50 italic">
                          No accounts were created in this import.
                        </div>
                      ) : (
                        report.created.map((row) => (
                          <div
                            key={`cr-${row.row_number}-${row.username}`}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-surface-muted/20"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-muted border border-border text-ink/60">
                                Row {row.row_number}
                              </span>
                              <strong className="text-ink">{row.name}</strong>
                              <span className="text-[11px] font-mono text-ink/50">
                                @{row.username}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink/70">
                              {row.class_name && (
                                <span className="pill pill-forest text-[10px]">
                                  {row.class_name}
                                </span>
                              )}
                              {row.subject && (
                                <span className="pill pill-grape text-[10px]">
                                  {row.subject}
                                </span>
                              )}
                              {row.gr_number && (
                                <span className="font-mono text-ink/60">
                                  GR: {row.gr_number}
                                </span>
                              )}
                              <span className="font-mono text-ink/80">{row.mobile_number}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {activeReportTab === 'over_limit' && (
                    <>
                      {report.over_limit.length === 0 ? (
                        <div className="p-6 text-center text-ink/50 italic">
                          Zero rows exceeded capacity quota.
                        </div>
                      ) : (
                        report.over_limit.map((row) => (
                          <div
                            key={`ol-${row.row_number}`}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-ember/5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ember/15 border border-ember/30 text-ember font-bold">
                                Row {row.row_number}
                              </span>
                              <strong className="text-ink">{row.name}</strong>
                              {row.gr_number && (
                                <span className="text-[11px] font-mono text-ink/50">
                                  GR: {row.gr_number}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-ember font-medium">
                              {row.error}
                            </span>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {activeReportTab === 'duplicates' && (
                    <>
                      {report.duplicates.length === 0 ? (
                        <div className="p-6 text-center text-ink/50 italic">
                          No duplicate records detected.
                        </div>
                      ) : (
                        report.duplicates.map((row) => (
                          <div
                            key={`dup-${row.row_number}`}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-amber-500/5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 font-bold">
                                Row {row.row_number}
                              </span>
                              <strong className="text-ink">{row.name}</strong>
                              <span className="pill pill-muted text-[10px]">
                                {row.duplicate_field}
                              </span>
                            </div>
                            <span className="text-[11px] text-amber-700">{row.error}</span>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {activeReportTab === 'invalid' && (
                    <>
                      {report.invalid.length === 0 ? (
                        <div className="p-6 text-center text-ink/50 italic">
                          Zero invalid format errors detected.
                        </div>
                      ) : (
                        report.invalid.map((row) => (
                          <div
                            key={`inv-${row.row_number}`}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 bg-rose-500/5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-700 font-bold">
                                Row {row.row_number}
                              </span>
                              <strong className="text-ink">{row.name || 'Row Record'}</strong>
                            </div>
                            <span className="text-[11px] text-rose-700 font-medium">
                              {row.error}
                            </span>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-4 border-t border-border bg-surface-muted/30 flex items-center justify-between">
          <div className="text-xs text-ink/60">
            {report ? (
              <span>
                Processed completed with{' '}
                <strong className="text-forest">{report.summary.created_count}</strong> created.
              </span>
            ) : (
              <span>Template headers and capacity will be validated on upload.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-surface border border-border text-ink hover:bg-surface-muted transition-colors cursor-pointer"
            >
              {report ? 'Done / Close' : 'Cancel'}
            </button>

            {!report && (
              <button
                type="button"
                id="execute-bulk-import-btn"
                disabled={!selectedFile || isUploading}
                onClick={handleUploadAndProcess}
                className="px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Workbook...</span>
                  </>
                ) : (
                  <>
                    <span>Process & Import {activeRole === 'student' ? 'Students' : 'Teachers'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
