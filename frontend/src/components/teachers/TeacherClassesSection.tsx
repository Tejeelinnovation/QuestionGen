import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { classesApi } from '../../api/classes';
import type { ClassSection, SubjectAssignment, User } from '../../types';
import {
  GraduationCap,
  BookOpen,
  Users,
  Award,
  Search,
  X,
  ChevronRight,
  Phone,
  Mail,
} from 'lucide-react';
import { MOTION } from '../../lib/motion';

interface TeacherClassesSectionProps {
  compact?: boolean;
}

export const TeacherClassesSection: React.FC<TeacherClassesSectionProps> = ({ compact = false }) => {
  const [classTeacherSections, setClassTeacherSections] = useState<ClassSection[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Student roster modal state
  const [selectedClassForRoster, setSelectedClassForRoster] = useState<{
    id: number;
    name: string;
    subject?: string;
  } | null>(null);
  const [rosterStudents, setRosterStudents] = useState<User[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState<boolean>(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterSearch, setRosterSearch] = useState<string>('');

  useEffect(() => {
    const fetchAssignments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await classesApi.getMyAssignments();
        setClassTeacherSections(data.class_teacher_sections || []);
        setSubjectAssignments(data.subject_assignments || []);
      } catch (err: any) {
        console.error('Failed to load teacher class assignments:', err);
        setError(err.response?.data?.detail || 'Failed to load assigned academic classes.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignments();
  }, []);

  // Fetch roster when a class is selected
  const handleOpenRoster = async (cls: { id: number; name: string; subject?: string }) => {
    setSelectedClassForRoster(cls);
    setRosterSearch('');
    setIsRosterLoading(true);
    setRosterError(null);
    try {
      const students = await classesApi.getClassStudents(cls.id);
      setRosterStudents(students);
    } catch (err: any) {
      console.error('Failed to load class roster:', err);
      setRosterError(err.response?.data?.detail || 'Failed to fetch enrolled students.');
    } finally {
      setIsRosterLoading(false);
    }
  };

  const handleCloseRoster = () => {
    setSelectedClassForRoster(null);
    setRosterStudents([]);
    setRosterSearch('');
    setRosterError(null);
  };

  // Distinct subjects taught across all assignments
  const distinctSubjects = useMemo(() => {
    const subjects = new Set<string>();
    classTeacherSections.forEach((s) => {
      if (s.class_teacher_subject) subjects.add(s.class_teacher_subject);
    });
    subjectAssignments.forEach((sa) => {
      if (sa.subject) subjects.add(sa.subject);
    });
    return Array.from(subjects);
  }, [classTeacherSections, subjectAssignments]);

  // Filter roster students based on search query
  const filteredRosterStudents = useMemo(() => {
    if (!rosterSearch.trim()) return rosterStudents;
    const q = rosterSearch.toLowerCase();
    return rosterStudents.filter((s) => {
      const fullName = `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase();
      const username = (s.username || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const mobile = (s.mobile_number || '').toLowerCase();
      return (
        fullName.includes(q) ||
        username.includes(q) ||
        email.includes(q) ||
        mobile.includes(q)
      );
    });
  }, [rosterStudents, rosterSearch]);

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-card p-6 space-y-4 animate-pulse">
        <div className="h-4 bg-surface-muted rounded w-1/4" />
        <div className="h-20 bg-surface-muted rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-ember/30 bg-ember/10 text-ember p-4 text-xs font-medium">
        {error}
      </div>
    );
  }

  const hasAnyAssignments = classTeacherSections.length > 0 || subjectAssignments.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Category Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 border-grape pl-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-bold text-xl text-ink">
              My Academic Classes & Teaching Scope
            </h2>
            <span className="pill pill-grape text-xs">
              {subjectAssignments.length + classTeacherSections.length} Class Mappings
            </span>
          </div>
          <p className="text-xs text-ink/65 mt-0.5">
            Class teacher divisions, subject-based assignments, and student rosters across all standards.
          </p>
        </div>

        {/* Global Subjects Taught summary pills */}
        {distinctSubjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            <span className="text-[11px] font-heading font-semibold text-ink/60 mr-1">
              Teaching:
            </span>
            {distinctSubjects.map((subj) => (
              <span
                key={subj}
                className="px-2 py-0.5 rounded-pill bg-grape/10 border border-grape/25 text-grape font-medium text-[11px]"
              >
                {subj}
              </span>
            ))}
          </div>
        )}
      </div>

      {!hasAnyAssignments ? (
        <div className="bg-surface border border-dashed border-border rounded-card p-8 text-center space-y-2">
          <GraduationCap className="w-10 h-10 text-ink/30 mx-auto" />
          <h3 className="font-heading font-semibold text-sm text-ink">
            No Class or Subject Assignments Yet
          </h3>
          <p className="text-xs text-ink/60 max-w-md mx-auto">
            Your School Administrator has not yet mapped you as a Class Teacher or Subject Faculty.
            Once divisions are assigned, your classes and student rosters will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── 1. Main Class Teacher Division (Featured Banner) ── */}
          {classTeacherSections.map((sec) => {
            const studentCount = sec.student_count ?? sec.enrolled_students_count ?? 0;
            const capacityPct =
              sec.max_students > 0
                ? Math.min(100, Math.round((studentCount / sec.max_students) * 100))
                : 0;

            return (
              <div
                key={`ct-${sec.id}`}
                className="relative overflow-hidden bg-gradient-to-r from-forest/5 via-surface to-grape/5 border-2 border-forest/40 rounded-card p-5 shadow-card"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-pill bg-forest text-white text-[11px] font-heading font-bold flex items-center gap-1.5 shadow-sm">
                        <Award className="w-3.5 h-3.5" />
                        Main Class Teacher (In-Charge)
                      </span>
                      <span className="pill pill-forest text-[11px]">
                        Subject: {sec.class_teacher_subject || 'General'}
                      </span>
                      <span className="font-mono text-[11px] text-ink/50">
                        Standard {sec.standard} • Section {sec.section}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-heading font-bold text-2xl text-ink">
                        Class {sec.name}
                      </h3>
                      <p className="text-xs text-ink/70">
                        You are the primary Class Teacher for this division. You direct student attendance, classroom exams, and oversee subject instructors.
                      </p>
                    </div>

                    {/* Capacity Progress Meter */}
                    <div className="space-y-1 max-w-sm pt-1">
                      <div className="flex items-center justify-between text-[11px] font-mono text-ink/75">
                        <span className="flex items-center gap-1 font-heading font-semibold text-ink">
                          <Users className="w-3.5 h-3.5 text-forest" />
                          Enrolled Roster: {studentCount} / {sec.max_students} students
                        </span>
                        <span className="font-bold">{capacityPct}% capacity</span>
                      </div>
                      <div className="h-1.5 w-full bg-border/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            capacityPct >= 90
                              ? 'bg-ember'
                              : capacityPct >= 70
                              ? 'bg-grape'
                              : 'bg-forest'
                          }`}
                          style={{ width: `${capacityPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Subject faculty in this class */}
                    {sec.subject_teachers && sec.subject_teachers.length > 0 && (
                      <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink/65">
                        <span className="font-heading font-semibold text-ink/80 text-[11px]">
                          Subject Faculty:
                        </span>
                        {sec.subject_teachers.map((st) => (
                          <span
                            key={st.id}
                            className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-ink/80"
                          >
                            <strong className="text-ink">{st.subject}:</strong> {st.teacher_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenRoster({
                          id: sec.id,
                          name: sec.name,
                          subject: sec.class_teacher_subject,
                        })
                      }
                      className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>View Class Roster ({sec.student_count})</span>
                    </button>
                    <Link
                      to="/papers/new"
                      className="px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-surface border border-border text-ink hover:border-forest hover:text-forest transition-colors text-center"
                    >
                      + Create Exam for Class
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── 2. Subject-Based Teaching Classes Grid ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-grape" />
                  Subject-Based Classes
                </h4>
                <p className="text-xs text-ink/60">
                  Standards and sections where you teach academic courses. Teachers can instruct multiple subjects across different classes.
                </p>
              </div>
              <span className="text-xs font-mono text-ink/50">
                {subjectAssignments.length} Assigned {subjectAssignments.length === 1 ? 'Subject' : 'Subjects'}
              </span>
            </div>

            {subjectAssignments.length === 0 ? (
              <div className="p-4 rounded-card bg-surface border border-border text-xs text-ink/60 text-center">
                No additional subject teaching assignments mapped.
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 ${
                  compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
                } gap-4`}
              >
                {subjectAssignments.map((sa) => (
                  <div
                    key={`sa-${sa.id}`}
                    className={`bg-surface border border-border rounded-card p-4 shadow-card hover:border-grape flex flex-col justify-between transition-all ${MOTION.hoverLift.className}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-pill bg-grape text-white text-[11px] font-heading font-bold">
                          {sa.subject}
                        </span>
                        <span className="font-mono text-[10px] text-ink/50">
                          Std {sa.standard}-{sa.section}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-heading font-bold text-lg text-ink">
                          Class {sa.class_name}
                        </h4>
                        <div className="text-xs text-ink/70 flex items-center gap-1.5 mt-1">
                          <Users className="w-3.5 h-3.5 text-grape" />
                          <span className="font-medium text-ink">
                            {sa.student_count} Students
                          </span>
                          <span className="text-ink/40">• Max {sa.max_students}</span>
                        </div>
                      </div>

                      <div className="p-2 rounded bg-surface-muted border border-border/70 text-[11px] text-ink/75 space-y-0.5">
                        <div className="text-ink/50 uppercase tracking-wider text-[9px] font-mono">
                          Class Teacher
                        </div>
                        <div className="font-medium text-ink truncate">
                          {sa.is_class_teacher
                            ? 'You (Main Class Teacher)'
                            : sa.class_teacher_name || 'Not assigned'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-border/70 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenRoster({
                            id: sa.class_section_id,
                            name: sa.class_name,
                            subject: sa.subject,
                          })
                        }
                        className="px-3 py-1.5 rounded-pill bg-grape/10 border border-grape/30 text-grape font-heading font-semibold text-xs hover:bg-grape hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>View Roster</span>
                      </button>

                      <Link
                        to="/papers/new"
                        className="text-[11px] font-heading font-semibold text-ink/70 hover:text-grape flex items-center gap-0.5"
                      >
                        <span>Assign Paper</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Student Roster Modal ── */}
      {selectedClassForRoster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={handleCloseRoster}
        >
          <div
            className="bg-surface border border-border rounded-card shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-surface-muted/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="pill pill-grape text-xs">Class Student Roster</span>
                  {selectedClassForRoster.subject && (
                    <span className="pill pill-muted text-xs">
                      Subject: {selectedClassForRoster.subject}
                    </span>
                  )}
                </div>
                <h3 className="font-heading font-bold text-xl text-ink">
                  Class {selectedClassForRoster.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseRoster}
                className="p-1.5 rounded-pill hover:bg-surface-muted text-ink/60 hover:text-ink transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 border-b border-border bg-surface">
              <div className="relative">
                <Search className="w-4 h-4 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search students by name, username, email, or mobile..."
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-card border border-border bg-bg text-xs text-ink placeholder:text-ink/40 focus:outline-none focus:border-grape focus:bg-surface"
                />
              </div>
            </div>

            {/* Modal Body: Student List */}
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {isRosterLoading ? (
                <div className="py-12 text-center text-xs text-ink/50 space-y-2">
                  <div className="w-6 h-6 border-2 border-grape border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Loading class enrolled students...</p>
                </div>
              ) : rosterError ? (
                <div className="p-4 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs">
                  {rosterError}
                </div>
              ) : filteredRosterStudents.length === 0 ? (
                <div className="py-10 text-center text-xs text-ink/50 italic">
                  {rosterSearch
                    ? 'No students matched your search.'
                    : 'No students are currently enrolled in this class division.'}
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {filteredRosterStudents.map((s, idx) => {
                    const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ');
                    return (
                      <div
                        key={s.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full bg-grape/10 border border-grape/20 text-grape font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-heading font-semibold text-ink text-sm">
                              {fullName || s.username}
                            </div>
                            <div className="text-[11px] font-mono text-ink/50">
                              @{s.username}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink/70 sm:justify-end">
                          {s.email && (
                            <span className="flex items-center gap-1 text-ink/70">
                              <Mail className="w-3 h-3 text-ink/40" />
                              {s.email}
                            </span>
                          )}
                          {s.mobile_number && (
                            <span className="flex items-center gap-1 font-mono text-ink/80 bg-surface-muted px-2 py-0.5 rounded border border-border/60">
                              <Phone className="w-3 h-3 text-forest" />
                              {s.mobile_number}
                            </span>
                          )}
                          <span className="pill pill-lime text-[10px]">
                            Enrolled
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-surface-muted/40 flex items-center justify-between text-xs text-ink/60">
              <span>
                Total: <strong>{filteredRosterStudents.length}</strong> of{' '}
                {rosterStudents.length} Students
              </span>
              <button
                type="button"
                onClick={handleCloseRoster}
                className="px-4 py-1.5 rounded-pill bg-surface border border-border text-ink font-heading font-semibold hover:bg-surface-muted transition-colors cursor-pointer"
              >
                Close Roster
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
