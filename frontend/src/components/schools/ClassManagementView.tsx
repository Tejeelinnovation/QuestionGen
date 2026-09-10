import React, { useState, useEffect } from 'react';
import { classesApi } from '../../api/classes';
import { usersApi } from '../../api/users';
import type { ClassSection, ClassSubjectTeacher, User } from '../../types';
import { SearchableSubjectSelect } from '../ui/searchable-subject-select';
import {
  GraduationCap,
  Plus,
  Users,
  BookOpen,
  UserCheck,
  AlertCircle,
  X,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
} from 'lucide-react';

interface ClassManagementViewProps {
  schoolId?: number | null;
  faculty?: User[];
}

const STANDARDS = [8, 9, 10];
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const ClassManagementView: React.FC<ClassManagementViewProps> = ({
  schoolId,
  faculty: initialFaculty,
}) => {
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [faculty, setFaculty] = useState<User[]>(initialFaculty || []);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add / Edit Class Modal State
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSection | null>(null);
  const [standard, setStandard] = useState<number>(10);
  const [section, setSection] = useState<string>('A');
  const [maxStudents, setMaxStudents] = useState<number>(40);
  const [classTeacherId, setClassTeacherId] = useState<number | ''>('');
  const [classTeacherSubject, setClassTeacherSubject] = useState<string>('Mathematics');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Subject Teacher Drawer / Modal State
  const [activeSubjectModalClass, setActiveSubjectModalClass] = useState<ClassSection | null>(null);
  const [subjectTeachers, setSubjectTeachers] = useState<ClassSubjectTeacher[]>([]);
  const [newSubject, setNewSubject] = useState<string>('Science');
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState<number | ''>('');
  const [subjectSubmitting, setSubjectSubmitting] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Expanded student roster for a class
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);
  const [classStudents, setClassStudents] = useState<User[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [classesData, teachersData] = await Promise.all([
        classesApi.getClasses(schoolId || undefined),
        faculty.length > 0 ? Promise.resolve(faculty) : usersApi.getAllUsers({ role: 'teacher' }),
      ]);
      setClasses(classesData);
      if (faculty.length === 0) {
        setFaculty(teachersData);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to load classes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [schoolId]);

  const openCreateClassModal = () => {
    setEditingClass(null);
    setStandard(10);
    setSection('A');
    setMaxStudents(40);
    setClassTeacherId('');
    setClassTeacherSubject('Mathematics');
    setModalError(null);
    setIsClassModalOpen(true);
  };

  const openEditClassModal = (cls: ClassSection) => {
    setEditingClass(cls);
    setStandard(cls.standard);
    setSection(cls.section);
    setMaxStudents(cls.max_students);
    setClassTeacherId(cls.class_teacher || '');
    setClassTeacherSubject(cls.class_teacher_subject || 'Mathematics');
    setModalError(null);
    setIsClassModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);

    const payload = {
      standard: Number(standard),
      section: section.toUpperCase().trim(),
      max_students: Number(maxStudents) > 0 ? Number(maxStudents) : 40,
      class_teacher: classTeacherId ? Number(classTeacherId) : null,
      class_teacher_subject: classTeacherSubject.trim(),
      school: schoolId || undefined,
    };

    try {
      if (editingClass) {
        await classesApi.updateClass(editingClass.id, payload);
      } else {
        await classesApi.createClass(payload);
      }
      setIsClassModalOpen(false);
      await loadData();
    } catch (err: any) {
      const data = err.response?.data;
      let msg = 'Failed to save class section.';
      if (typeof data === 'string') msg = data;
      else if (data?.detail) msg = data.detail;
      else if (data?.non_field_errors) msg = data.non_field_errors.join(' ');
      else if (data) msg = Object.values(data).flat().join(' ');
      setModalError(msg);
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteClass = async (cls: ClassSection) => {
    if (!window.confirm(`Are you sure you want to delete Class ${cls.name}? This will unassign its students.`)) {
      return;
    }
    try {
      await classesApi.deleteClass(cls.id);
      setClasses((prev) => prev.filter((c) => c.id !== cls.id));
      if (expandedClassId === cls.id) setExpandedClassId(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete class.');
    }
  };

  // Subject Teachers Management
  const openSubjectTeachersModal = async (cls: ClassSection) => {
    setActiveSubjectModalClass(cls);
    setSubjectError(null);
    setNewSubjectTeacherId(faculty.length > 0 ? faculty[0].id : '');
    try {
      const data = await classesApi.getClassSubjectTeachers(cls.id);
      setSubjectTeachers(data);
    } catch (err: any) {
      setSubjectError('Failed to load subject teachers.');
    }
  };

  const handleAssignSubjectTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubjectModalClass || !newSubjectTeacherId) return;
    setSubjectSubmitting(true);
    setSubjectError(null);

    try {
      await classesApi.assignSubjectTeacher(activeSubjectModalClass.id, {
        subject: newSubject.trim(),
        teacher: Number(newSubjectTeacherId),
      });
      const data = await classesApi.getClassSubjectTeachers(activeSubjectModalClass.id);
      setSubjectTeachers(data);
      await loadData();
    } catch (err: any) {
      setSubjectError(err.response?.data?.detail || 'Failed to assign subject teacher.');
    } finally {
      setSubjectSubmitting(false);
    }
  };

  const handleRemoveSubjectTeacher = async (subject: string) => {
    if (!activeSubjectModalClass) return;
    try {
      await classesApi.removeSubjectTeacher(activeSubjectModalClass.id, subject);
      setSubjectTeachers((prev) => prev.filter((st) => st.subject !== subject));
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove subject teacher.');
    }
  };

  // Toggle Student Roster for a Class
  const toggleClassStudents = async (cls: ClassSection) => {
    if (expandedClassId === cls.id) {
      setExpandedClassId(null);
      return;
    }
    setExpandedClassId(cls.id);
    setIsLoadingStudents(true);
    try {
      const students = await classesApi.getClassStudents(cls.id);
      setClassStudents(students);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const totalCapacity = classes.reduce((sum, c) => sum + (c.max_students || 0), 0);
  const totalEnrolled = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Overview Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Total Sections</span>
          <div className="font-heading font-bold text-2xl text-ink mt-1">{classes.length}</div>
          <span className="text-[11px] text-ink/50 font-mono">Standards 8, 9, 10</span>
        </div>

        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Total Enrolled</span>
          <div className="font-heading font-bold text-2xl text-forest mt-1">{totalEnrolled}</div>
          <span className="text-[11px] text-ink/50 font-mono">Across all classes</span>
        </div>

        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Total Capacity</span>
          <div className="font-heading font-bold text-2xl text-ink mt-1">{totalCapacity}</div>
          <span className="text-[11px] text-ink/50 font-mono">Max allowable seats</span>
        </div>

        <div className="bg-surface border border-border rounded-card p-4 shadow-card">
          <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Available Seats</span>
          <div className="font-heading font-bold text-2xl text-ember mt-1">
            {Math.max(0, totalCapacity - totalEnrolled)}
          </div>
          <span className="text-[11px] text-ink/50 font-mono">Remaining intake</span>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border rounded-card p-4 shadow-card">
        <div>
          <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-forest" />
            Classroom & Division Architecture
          </h2>
          <p className="text-xs text-ink/65 mt-0.5">
            Manage standards (8-10), sections (A-J), class teachers with designated subjects, and subject faculty.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateClassModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 active:scale-95 transition-all shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Class / Division
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Classes Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-surface border border-border rounded-card p-5 h-56 animate-pulse" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="p-12 text-center bg-surface border border-border rounded-card text-ink/60 space-y-3">
          <GraduationCap className="w-10 h-10 mx-auto text-ink/30" />
          <h3 className="font-heading font-bold text-base text-ink">No Classes Configured Yet</h3>
          <p className="text-xs max-w-md mx-auto">
            Get started by adding your first classroom division (e.g. Standard 10, Section A) to map class teachers and subject instructors.
          </p>
          <button
            type="button"
            onClick={openCreateClassModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add First Class
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => {
            const fillPercentage = Math.min(100, Math.round((cls.student_count / (cls.max_students || 1)) * 100));
            const isExpanded = expandedClassId === cls.id;

            return (
              <div
                key={cls.id}
                className="bg-surface border border-border hover:border-border-strong rounded-card shadow-card flex flex-col justify-between transition-all duration-200"
              >
                {/* Class Card Top */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-black text-2xl text-ink">
                          {cls.standard}-{cls.section}
                        </span>
                        <span className="pill pill-forest text-[10px] font-mono">
                          Standard {cls.standard}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink/50 font-mono">Division {cls.section}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditClassModal(cls)}
                        className="p-1.5 rounded-sm text-ink/60 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
                        title="Edit Class Capacity or Teacher"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClass(cls)}
                        className="p-1.5 rounded-sm text-ink/60 hover:text-ember hover:bg-ember/10 transition-colors cursor-pointer"
                        title="Delete Class"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Enrollment Progress */}
                  <div className="space-y-1.5 bg-bg border border-border/80 rounded-card p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink/65 font-medium">Student Enrollment</span>
                      <span className="font-mono font-bold text-ink">
                        {cls.student_count} / {cls.max_students}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          fillPercentage >= 100
                            ? 'bg-ember'
                            : fillPercentage >= 75
                            ? 'bg-amber-500'
                            : 'bg-forest'
                        }`}
                        style={{ width: `${fillPercentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-ink/50 font-mono">
                      <span>{fillPercentage}% full</span>
                      <span>{Math.max(0, cls.max_students - cls.student_count)} seats left</span>
                    </div>
                  </div>

                  {/* Designated Class Teacher */}
                  <div className="space-y-1.5 pt-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50 font-semibold block">
                      Main Class Teacher
                    </span>
                    {cls.class_teacher_name ? (
                      <div className="flex items-center justify-between p-2.5 rounded-card bg-surface-muted border border-border text-xs">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-forest shrink-0" />
                          <div>
                            <div className="font-semibold text-ink">{cls.class_teacher_name}</div>
                            <span className="text-[10px] text-ink/60 font-mono">
                              Subject: {cls.class_teacher_subject || 'General'}
                            </span>
                          </div>
                        </div>
                        <span className="pill text-[9px] bg-forest/15 text-forest border border-forest/20">
                          Class Teacher
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-card bg-bg border border-dashed border-border text-xs text-ink/50 italic flex items-center justify-between">
                        <span>No class teacher assigned</span>
                        <button
                          type="button"
                          onClick={() => openEditClassModal(cls)}
                          className="text-[11px] text-forest font-semibold hover:underline cursor-pointer"
                        >
                          + Assign
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Subject Faculty Indicator */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink/50 font-semibold">
                        Subject Instructors ({cls.subject_teachers?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => openSubjectTeachersModal(cls)}
                        className="text-[11px] text-forest font-semibold hover:underline cursor-pointer"
                      >
                        Manage Subjects
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {cls.subject_teachers && cls.subject_teachers.length > 0 ? (
                        cls.subject_teachers.map((st) => (
                          <span
                            key={st.id}
                            className="pill text-[10px] bg-surface-muted text-ink/80 border border-border flex items-center gap-1"
                          >
                            <span className="font-bold">{st.subject}:</span> {st.teacher_name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-ink/40 italic">
                          No additional subject instructors mapped yet.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer: View Students Roster */}
                <div className="border-t border-border bg-surface-muted/30 p-3">
                  <button
                    type="button"
                    onClick={() => toggleClassStudents(cls)}
                    className="w-full py-1.5 px-3 rounded-card text-xs font-semibold text-ink/75 hover:text-ink hover:bg-surface border border-transparent hover:border-border transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{isExpanded ? 'Hide Enrolled Students' : `View Enrolled Students (${cls.student_count})`}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {/* Inline Student Roster Dropdown */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/80 space-y-2 max-h-48 overflow-y-auto">
                      {isLoadingStudents ? (
                        <div className="text-center py-3 text-xs text-ink/50 italic">Loading student roster...</div>
                      ) : classStudents.length === 0 ? (
                        <div className="text-center py-3 text-xs text-ink/50 italic">
                          No students currently enrolled in this class.
                        </div>
                      ) : (
                        classStudents.map((s) => (
                          <div
                            key={s.id}
                            className="p-2 rounded-card bg-bg border border-border/60 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-ink">
                                {s.first_name || s.last_name ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : s.username}
                              </div>
                              <div className="text-[10px] text-ink/60 font-mono">{s.email}</div>
                            </div>
                            <span className="font-mono text-[10px] text-ink/50">{s.mobile_number}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Class Modal Drawer */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsClassModalOpen(false)}
          />
          <div className="relative z-10 w-full sm:max-w-md bg-surface border-l border-border h-full shadow-float flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-card bg-forest/10 border border-forest/20 flex items-center justify-center text-forest">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-ink">
                    {editingClass ? `Edit Class ${editingClass.name}` : 'Add Class Division'}
                  </h3>
                  <p className="text-xs text-ink/60">
                    Configure standard, section division, student quota & class teacher.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClassModalOpen(false)}
                className="w-8 h-8 rounded-card border border-border bg-surface-muted flex items-center justify-center text-ink/70 hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="flex-1 overflow-y-auto p-6 space-y-4">
              {modalError && (
                <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Standard & Division Pickers */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Standard (Class) *
                  </label>
                  <select
                    value={standard}
                    onChange={(e) => setStandard(Number(e.target.value))}
                    disabled={modalSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {STANDARDS.map((std) => (
                      <option key={std} value={std}>
                        Class {std}th
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Division (Section) *
                  </label>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    disabled={modalSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none cursor-pointer"
                  >
                    {SECTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        Section {sec}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Division Maximum Capacity */}
              <div className="space-y-1">
                <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                  Class Student Capacity *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={maxStudents}
                  onChange={(e) => setMaxStudents(parseInt(e.target.value) || 0)}
                  disabled={modalSubmitting}
                  className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none"
                  placeholder="e.g. 40"
                />
                <p className="text-[10px] text-ink/50">
                  School Admin decides maximum student admissions for this specific division.
                </p>
              </div>

              {/* Designated Main Class Teacher */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="space-y-1">
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Designated Class Teacher (Single Main Authority)
                  </label>
                  <select
                    value={classTeacherId}
                    onChange={(e) => {
                      const tId = e.target.value ? Number(e.target.value) : '';
                      setClassTeacherId(tId);
                      if (tId) {
                        const tObj = faculty.find((f) => f.id === tId);
                        if (tObj?.primary_subject) {
                          setClassTeacherSubject(tObj.primary_subject);
                        }
                      }
                    }}
                    disabled={modalSubmitting}
                    className="w-full rounded-card border border-border bg-bg px-3.5 py-2 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Unassigned (Select Faculty) --</option>
                    {faculty.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.first_name || f.last_name
                          ? `${f.first_name || ''} ${f.last_name || ''}`.trim()
                          : f.username}{' '}
                        {f.primary_subject ? `(${f.primary_subject})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Class Teacher's Subject
                  </label>
                  <SearchableSubjectSelect
                    value={classTeacherSubject}
                    onChange={setClassTeacherSubject}
                    disabled={modalSubmitting}
                    placeholder="Search or enter subject..."
                  />
                  <p className="text-[10px] text-ink/50">
                    Subject taught by the class teacher for this class division.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-surface-muted border border-border rounded-card text-[11px] text-ink/70 space-y-1">
                <span className="font-semibold text-ink">Class Isolation Guarantee:</span>
                <p>
                  Teachers assigned here will be able to deliver exam papers directly to this division in one click.
                </p>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subject Teachers Mapping Modal */}
      {activeSubjectModalClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveSubjectModalClass(null)}
          />
          <div className="relative z-10 w-full max-w-lg bg-surface border border-border rounded-card shadow-float overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-forest" />
                  Subject Teachers for Class {activeSubjectModalClass.name}
                </h3>
                <p className="text-xs text-ink/60 mt-0.5">
                  Map different teachers to their specific subjects in this section.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubjectModalClass(null)}
                className="w-7 h-7 rounded-sm border border-border flex items-center justify-center text-ink/60 hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {subjectError && (
                <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-ember text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{subjectError}</span>
                </div>
              )}

              {/* Add New Subject Mapping */}
              <form
                onSubmit={handleAssignSubjectTeacher}
                className="bg-surface-muted/50 border border-border rounded-card p-3.5 space-y-3"
              >
                <span className="font-mono text-[11px] font-bold text-ink uppercase tracking-wider block">
                  + Map New Subject & Instructor
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-ink/70 font-medium mb-1">Subject *</label>
                    <SearchableSubjectSelect
                      value={newSubject}
                      onChange={setNewSubject}
                      disabled={subjectSubmitting}
                      placeholder="Search or enter subject..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-ink/70 font-medium mb-1">Assigned Teacher</label>
                    <select
                      required
                      value={newSubjectTeacherId}
                      onChange={(e) => setNewSubjectTeacherId(Number(e.target.value))}
                      className="w-full rounded-card border border-border bg-bg px-3 py-1.5 text-xs text-ink focus:bg-surface focus:border-forest focus:outline-none cursor-pointer"
                    >
                      <option value="">Select Teacher...</option>
                      {faculty.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.first_name || f.last_name
                            ? `${f.first_name || ''} ${f.last_name || ''}`.trim()
                            : f.username}{' '}
                          {f.primary_subject ? `(${f.primary_subject})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={subjectSubmitting || !newSubjectTeacherId}
                    className="px-3.5 py-1.5 text-xs font-heading font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {subjectSubmitting ? 'Assigning...' : 'Assign Teacher'}
                  </button>
                </div>
              </form>

              {/* Current Mappings List */}
              <div className="space-y-2">
                <span className="font-mono text-[11px] font-bold text-ink/70 uppercase tracking-wider block">
                  Current Subject Teachers ({subjectTeachers.length})
                </span>

                {subjectTeachers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-ink/50 italic bg-bg rounded-card border border-border">
                    No subject teachers assigned yet.
                  </div>
                ) : (
                  subjectTeachers.map((st) => (
                    <div
                      key={st.id}
                      className="p-3 rounded-card bg-bg border border-border flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-bold text-forest">{st.subject}</span>
                          <span className="text-ink font-semibold">• {st.teacher_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-ink/50 font-mono">
                          {st.teacher_email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {st.teacher_email}
                            </span>
                          )}
                          {st.teacher_mobile && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {st.teacher_mobile}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSubjectTeacher(st.subject)}
                        className="p-1.5 text-ink/50 hover:text-ember hover:bg-ember/10 rounded-sm transition-colors cursor-pointer"
                        title="Remove Subject Teacher"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-surface-muted/30 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveSubjectModalClass(null)}
                className="px-4 py-1.5 text-xs font-heading font-semibold rounded-pill bg-ink text-white hover:bg-ink/90 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
