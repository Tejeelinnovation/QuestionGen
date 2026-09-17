import React, { useState, useEffect } from 'react';
import { classesApi } from '../../api/classes';
import { usersApi } from '../../api/users';
import type { ClassSection, ClassSubjectTeacher, User } from '../../types';
import { SearchableSubjectSelect } from '../ui/searchable-subject-select';
import { CustomSelect } from '../ui/custom-select';
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
  Mail,
  Phone,
  ArrowLeft,
  ArrowRight,
  Search,
  Loader2,
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

  // Selected class for dedicated full details view
  const [selectedClassDetail, setSelectedClassDetail] = useState<ClassSection | null>(null);
  const [detailStudents, setDetailStudents] = useState<User[]>([]);
  const [isLoadingDetailStudents, setIsLoadingDetailStudents] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');

  const getStudentCount = (cls: ClassSection): number =>
    cls.student_count ?? cls.enrolled_students_count ?? 0;

  const openClassDetail = async (cls: ClassSection) => {
    setSelectedClassDetail(cls);
    setStudentSearchTerm('');
    setIsLoadingDetailStudents(true);
    try {
      const students = await classesApi.getClassStudents(cls.id);
      setDetailStudents(students);
    } catch (err) {
      console.error('Failed to load class students', err);
      setDetailStudents([]);
    } finally {
      setIsLoadingDetailStudents(false);
    }
  };

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
      if (selectedClassDetail) {
        const refreshed = classesData.find((c) => c.id === selectedClassDetail.id);
        if (refreshed) {
          setSelectedClassDetail(refreshed);
        }
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
      if (selectedClassDetail?.id === cls.id) {
        setSelectedClassDetail(null);
      }
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
      if (selectedClassDetail?.id === activeSubjectModalClass.id) {
        const updated = await classesApi.getClass(selectedClassDetail.id);
        setSelectedClassDetail(updated);
      }
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
      if (selectedClassDetail?.id === activeSubjectModalClass.id) {
        const updated = await classesApi.getClass(selectedClassDetail.id);
        setSelectedClassDetail(updated);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove subject teacher.');
    }
  };

  const totalCapacity = classes.reduce((sum, c) => sum + (c.max_students || 0), 0);
  const totalEnrolled = classes.reduce((sum, c) => sum + getStudentCount(c), 0);

  const renderClassDetailView = (cls: ClassSection) => {
    const enrolledCount = detailStudents.length;
    const maxCapacity = cls.max_students || 40;
    const fillPercent = Math.min(100, Math.round((enrolledCount / maxCapacity) * 100));
    const seatsAvailable = Math.max(0, maxCapacity - enrolledCount);

    const filteredStudents = detailStudents.filter((s) => {
      const q = studentSearchTerm.toLowerCase().trim();
      if (!q) return true;
      const name = `${s.first_name || ''} ${s.last_name || ''} ${s.username}`.toLowerCase();
      const email = (s.email || '').toLowerCase();
      const phone = (s.mobile_number || '').toLowerCase();
      const gr = (s.gr_number || '').toLowerCase();
      const roll = (s.roll_number || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || gr.includes(q) || roll.includes(q);
    });

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Navigation & Action Header */}
        <div className="bg-surface border border-border rounded-card p-3.5 sm:p-4 shadow-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedClassDetail(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted text-xs font-heading font-semibold transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-forest" />
              <span>Back<span className="hidden sm:inline"> to All Classes</span></span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => openEditClassModal(cls)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
              >
                <Edit2 className="w-3.5 h-3.5 text-forest" />
                <span>Edit<span className="hidden sm:inline"> Class</span></span>
              </button>
              <button
                type="button"
                onClick={() => openSubjectTeachersModal(cls)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-heading font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
              >
                <BookOpen className="w-3.5 h-3.5 text-grape" />
                <span>Subjects<span className="hidden sm:inline"> Manage</span></span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteClass(cls)}
                className="p-1.5 rounded-pill text-ink/50 hover:text-ember hover:bg-ember/10 transition-colors cursor-pointer shrink-0"
                title="Delete Class"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="border-t border-border/50 pt-2.5 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading font-bold text-base sm:text-lg text-ink">
                Class {cls.standard}-{cls.section}
              </h2>
              <span className="pill pill-forest text-[10px] font-mono shrink-0">
                Standard {cls.standard}
              </span>
              <span className="pill text-[10px] font-mono bg-surface-muted text-ink/70 border border-border shrink-0">
                Division {cls.section}
              </span>
            </div>
            <p className="text-[11px] text-ink/60 font-mono">
              Classroom Architecture, Faculty Assignments & Enrolled Student Roster
            </p>
          </div>
        </div>

        {/* Overview Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Enrolled Students</span>
            <div className="font-heading font-bold text-2xl text-ink mt-1">
              {enrolledCount} <span className="text-sm font-normal text-ink/50">/ {maxCapacity}</span>
            </div>
            <span className="text-[11px] text-forest font-semibold font-mono">
              {fillPercent}% capacity utilized
            </span>
          </div>

          <div className="bg-surface border border-border rounded-card p-4 shadow-card">
            <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Available Seats</span>
            <div className={`font-heading font-bold text-2xl mt-1 ${seatsAvailable > 0 ? 'text-forest' : 'text-ember'}`}>
              {seatsAvailable}
            </div>
            <span className="text-[11px] text-ink/50 font-mono">Remaining student intake</span>
          </div>

          <div className="bg-surface border border-border rounded-card p-4 shadow-card col-span-2">
            <span className="font-mono text-[10px] text-ink/60 uppercase tracking-wider">Main Class Teacher</span>
            <div className="font-heading font-bold text-base text-ink mt-1 truncate">
              {cls.class_teacher_name || 'No Class Teacher Assigned'}
            </div>
            <div className="text-[11px] text-ink/60 font-mono mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>Subject: <strong className="text-forest">{cls.class_teacher_subject || 'General'}</strong></span>
              {cls.class_teacher_username && <span>• @{cls.class_teacher_username}</span>}
            </div>
          </div>
        </div>

        {/* Capacity Progress Bar Gauge */}
        <div className="p-4 bg-surface border border-border rounded-card shadow-card space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-heading font-semibold text-ink">Classroom Capacity Gauge</span>
            <span className="font-mono text-ink/70">
              {enrolledCount} of {maxCapacity} students ({fillPercent}%)
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                fillPercent >= 100 ? 'bg-ember' : fillPercent >= 75 ? 'bg-amber-500' : 'bg-forest'
              }`}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-1 text-[10px] text-ink/50 font-mono">
            <span>0 students</span>
            <span>{seatsAvailable} seats remaining</span>
            <span>{maxCapacity} max capacity</span>
          </div>
        </div>

        {/* Faculty & Subject Mapping Section */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-forest" />
              <h3 className="font-heading font-bold text-sm text-ink">
                Subject Instructors & Faculty
              </h3>
            </div>
            <button
              type="button"
              onClick={() => openSubjectTeachersModal(cls)}
              className="text-xs text-forest font-semibold hover:underline cursor-pointer"
            >
              + Manage Subjects
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Main Class Teacher Card */}
            <div className="p-3 rounded-card bg-surface-muted/60 border border-forest/20 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold text-xs shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="pill text-[9px] bg-forest/15 text-forest border border-forest/25 mb-1">
                  Class Teacher ({cls.class_teacher_subject || 'General'})
                </span>
                <div className="font-heading font-semibold text-xs text-ink truncate">
                  {cls.class_teacher_name || 'Unassigned'}
                </div>
              </div>
            </div>

            {/* Other Subject Teachers */}
            {cls.subject_teachers?.map((st) => (
              <div
                key={st.id}
                className="p-3 rounded-card bg-bg border border-border flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-grape/10 text-grape flex items-center justify-center font-bold text-xs shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="pill text-[9px] bg-grape/10 text-grape border border-grape/25 mb-1">
                    {st.subject}
                  </span>
                  <div className="font-heading font-semibold text-xs text-ink truncate">
                    {st.teacher_name}
                  </div>
                </div>
              </div>
            ))}

            {(!cls.subject_teachers || cls.subject_teachers.length === 0) && (
              <div className="p-3 rounded-card bg-bg border border-dashed border-border text-xs text-ink/50 italic flex items-center justify-between sm:col-span-2">
                <span>No additional subject teachers mapped to this class.</span>
                <button
                  type="button"
                  onClick={() => openSubjectTeachersModal(cls)}
                  className="text-[11px] text-forest font-semibold hover:underline cursor-pointer"
                >
                  + Add Instructor
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Enrolled Students Roster Directory */}
        <div className="bg-surface border border-border rounded-card p-5 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <Users className="w-4 h-4 text-forest" />
                <span>Enrolled Students</span>
                <span className="pill pill-forest text-[11px] font-mono font-bold">
                  {detailStudents.length} Students
                </span>
              </h3>
              <p className="text-xs text-ink/60 mt-0.5">
                Full roster of students assigned to Standard {cls.standard}, Division {cls.section}.
              </p>
            </div>

            {/* Search filter input */}
            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearchTerm}
                onChange={(e) => setStudentSearchTerm(e.target.value)}
                placeholder="Search name, roll, GR, mobile..."
                className="w-full pl-8 pr-7 py-1.5 rounded-pill border border-border bg-bg text-xs text-ink focus:outline-none focus:border-forest"
              />
              {studentSearchTerm && (
                <button
                  type="button"
                  onClick={() => setStudentSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {isLoadingDetailStudents ? (
            <div className="py-12 text-center text-xs text-ink/50 italic flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 text-forest animate-spin" />
              <span>Loading enrolled students roster...</span>
            </div>
          ) : detailStudents.length === 0 ? (
            <div className="py-12 text-center bg-bg border border-dashed border-border rounded-card space-y-2">
              <Users className="w-8 h-8 mx-auto text-ink/30" />
              <div className="font-heading font-semibold text-sm text-ink">No Students Enrolled Yet</div>
              <p className="text-xs text-ink/50 max-w-md mx-auto">
                No students are currently mapped to Standard {cls.standard}, Division {cls.section}.
                You can enroll students via Excel Bulk Import or the Add Student drawer.
              </p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-8 text-center bg-bg border border-border rounded-card text-xs text-ink/50">
              No students found matching "{studentSearchTerm}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-ink/60 font-mono uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Roll #</th>
                    <th className="py-2.5 px-3">GR Number</th>
                    <th className="py-2.5 px-3">Student Name</th>
                    <th className="py-2.5 px-3">Username & Email</th>
                    <th className="py-2.5 px-3">Mobile Number</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredStudents.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-bg/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-ink">
                        {s.roll_number || idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink/80">
                        {s.gr_number ? (
                          <span className="px-2 py-0.5 rounded-sm bg-surface-muted border border-border text-[11px]">
                            {s.gr_number}
                          </span>
                        ) : (
                          <span className="text-ink/40 italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-heading font-semibold text-ink text-sm">
                          {s.first_name || s.last_name
                            ? `${s.first_name || ''} ${s.last_name || ''}`.trim()
                            : s.username}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-xs text-ink/75">@{s.username}</div>
                        {s.email && <div className="text-[11px] text-ink/50 font-mono">{s.email}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink/80">
                        {s.mobile_number ? (
                          <span className="text-forest font-medium">{s.mobile_number}</span>
                        ) : (
                          <span className="text-ink/40 italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="pill pill-forest text-[10px]">
                          Enrolled
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {selectedClassDetail ? (
        renderClassDetailView(selectedClassDetail)
      ) : (
        <>
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
                const count = getStudentCount(cls);
                const max = cls.max_students || 40;
                const fillPercentage = Math.min(100, Math.round((count / max) * 100));
                const seatsLeft = Math.max(0, max - count);

                return (
                  <div
                    key={cls.id}
                    onClick={() => openClassDetail(cls)}
                    className="bg-surface border border-border hover:border-forest/50 hover:shadow-card-hover rounded-card shadow-card flex flex-col justify-between transition-all duration-200 cursor-pointer group"
                  >
                    {/* Class Card Top */}
                    <div className="p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-heading font-black text-2xl text-ink group-hover:text-forest transition-colors">
                              {cls.standard}-{cls.section}
                            </span>
                            <span className="pill pill-forest text-[10px] font-mono">
                              Standard {cls.standard}
                            </span>
                          </div>
                          <span className="text-[11px] text-ink/50 font-mono">Division {cls.section}</span>
                        </div>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                            {count} / {max}
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
                          <span>{seatsLeft} seats left</span>
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
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditClassModal(cls);
                              }}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              openSubjectTeachersModal(cls);
                            }}
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

                    {/* Card Footer: Replaces the accordion button with a clean clickable detail action */}
                    <div className="border-t border-border bg-surface-muted/30 px-4 py-3 flex items-center justify-between text-xs font-heading font-semibold text-forest group-hover:text-forest-dark transition-colors">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{count} Enrolled Students</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <span>View Details & Roster</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
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
                  <CustomSelect
                    value={String(standard)}
                    onChange={(val) => setStandard(Number(val))}
                    disabled={modalSubmitting}
                    options={STANDARDS.map((std) => ({
                      value: String(std),
                      label: `Class ${std}th`,
                    }))}
                    placeholder="Select class..."
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink">
                    Division (Section) *
                  </label>
                  <CustomSelect
                    value={section}
                    onChange={(val) => setSection(val)}
                    disabled={modalSubmitting}
                    options={SECTIONS.map((sec) => ({
                      value: sec,
                      label: `Section ${sec}`,
                    }))}
                    placeholder="Select section..."
                    className="w-full"
                  />
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
                  <CustomSelect
                    value={classTeacherId ? String(classTeacherId) : ''}
                    onChange={(val) => {
                      const tId = val ? Number(val) : '';
                      setClassTeacherId(tId);
                      if (tId) {
                        const tObj = faculty.find((f) => f.id === tId);
                        if (tObj?.primary_subject) {
                          setClassTeacherSubject(tObj.primary_subject);
                        }
                      }
                    }}
                    disabled={modalSubmitting}
                    options={[
                      { value: '', label: '-- Unassigned (Select Faculty) --' },
                      ...faculty.map((f) => ({
                        value: String(f.id),
                        label: `${f.first_name || f.last_name ? `${f.first_name || ''} ${f.last_name || ''}`.trim() : f.username}${f.primary_subject ? ` (${f.primary_subject})` : ''}`,
                      })),
                    ]}
                    placeholder="-- Unassigned (Select Faculty) --"
                    className="w-full"
                  />
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
                    <CustomSelect
                      value={newSubjectTeacherId ? String(newSubjectTeacherId) : ''}
                      onChange={(val) => setNewSubjectTeacherId(val ? Number(val) : '')}
                      options={[
                        { value: '', label: 'Select Teacher...' },
                        ...faculty.map((f) => ({
                          value: String(f.id),
                          label: `${f.first_name || f.last_name ? `${f.first_name || ''} ${f.last_name || ''}`.trim() : f.username}${f.primary_subject ? ` (${f.primary_subject})` : ''}`,
                        })),
                      ]}
                      placeholder="Select Teacher..."
                      className="w-full"
                    />
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
