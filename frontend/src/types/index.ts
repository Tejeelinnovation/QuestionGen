export type CapabilityName =
  | 'CREATE_SCHOOL'
  | 'CREATE_SCHOOL_ADMIN'
  | 'CREATE_TEACHER'
  | 'CREATE_STUDENT'
  | 'GENERATE_SELECT_QUESTIONS'
  | 'CREATE_PAPER'
  | 'ASSIGN_TEST'
  | 'ATTEMPT_TEST'
  | 'VIEW_OWN_RESULT'
  | 'VIEW_SCHOOL_WIDE_CONTROLS'
  | 'INGEST_GLOBAL_QUESTIONS';

export type RoleLabel =
  | 'Super Admin'
  | 'School Admin'
  | 'Teacher'
  | 'Student'
  | 'Question Bank Manager'
  | 'Custom'
  | string;

export type QuestionType =
  | 'MCQ'
  | 'MSQ'
  | 'ONE_WORD'
  | 'FILL_IN_THE_BLANKS'
  | 'MATCH_THE_FOLLOWING'
  | 'DIAGRAM_BASED'
  | 'COMPREHENSION_BASED'
  | 'SHORT_ANSWER'
  | 'LONG_ANSWER';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type LearnerLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type BankSource = 'GLOBAL' | 'ORGANIZATION' | 'TEACHER';

export interface Capability {
  id: number;
  name: CapabilityName;
  description: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  mobile_number?: string;
  first_name?: string;
  last_name?: string;
  role_label: RoleLabel;
  school: number | null;
  school_name?: string;
  class_section?: number | null;
  class_section_name?: string | null;
  gr_number?: string;
  roll_number?: string;
  primary_subject?: string;
  created_by?: number | null;
  created_by_username?: string | null;
  capabilities: CapabilityName[];
  is_active?: boolean;
  date_joined?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface UserStats {
  total: number;
  super_admin: number;
  school_admin: number;
  teacher: number;
  student: number;
}

export interface UserUpdateInput {
  email?: string;
  mobile_number?: string;
  first_name?: string;
  last_name?: string;
  class_section?: number | null;
  primary_subject?: string;
  is_active?: boolean;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface Book {
  id: number;
  title: string;
  board?: string;
  subject: string;
  grade: string;
  publisher?: string;
  is_active?: boolean;
  chapter_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Chapter {
  id: number;
  book: number;
  book_title?: string;
  book_board?: string;
  book_subject?: string;
  book_grade?: string;
  title: string;
  chapter_order: number;
  topic_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface Topic {
  id: number;
  chapter: number;
  chapter_title?: string;
  chapter_order?: number;
  book_title?: string;
  book_subject?: string;
  name: string;
  question_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionVariant {
  id?: number;
  parent_question?: number;
  variant_type: QuestionType;
  variant_type_display?: string;
  marks: number | string;
  difficulty: Difficulty;
  difficulty_display?: string;
  question_text: string;
  options?: Record<string, string> | any;
  correct_answer: string;
  explanation?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Question {
  id: number;
  topic: number;
  topic_name?: string;
  chapter_title?: string;
  book_title?: string;
  book_board?: string;
  question_text: string;
  question_type: QuestionType;
  question_type_display?: string;
  marks: number | string;
  difficulty: Difficulty;
  difficulty_display?: string;
  learner_level: LearnerLevel;
  learner_level_display?: string;
  bank_source?: BankSource;
  bank_source_display?: string;
  school?: number | null;
  created_by?: number | null;
  options?: Record<string, string> | any;
  correct_answer?: string;
  explanation?: string;
  source_reference?: string;
  variants_count?: number;
  variants?: QuestionVariant[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface QuestionPreview {
  id: number;
  topic: number;
  topic_name?: string;
  chapter_title?: string;
  subject?: string;
  question_text: string;
  question_type: QuestionType;
  question_type_display?: string;
  marks: number | string;
  difficulty: Difficulty;
  difficulty_display?: string;
  learner_level: LearnerLevel;
  learner_level_display?: string;
  bank_source?: 'GLOBAL' | 'ORGANIZATION' | 'TEACHER';
  variants_count?: number;
  options?: Record<string, string> | null;
  correct_answer?: string;
  explanation?: string;
  source_reference?: string;
}

export interface QuestionSnapshotItem {
  question_id: number;
  question_text: string;
  question_type: string;
  marks: number;
  difficulty: string;
  learner_level: string;
  bank_source?: string;
  variant_id?: number | null;
  subject?: string;
  chapter_title?: string;
  topic_name?: string;
  explanation?: string;
  options?: Record<string, string> | null;
  correct_answer?: string;
  source_reference?: string;
}

export interface PaperVersionSummary {
  id: number;
  version_label: string;
  total_marks: number;
  question_count: number;
  status: 'DRAFT' | 'FINALIZED';
  created_at: string;
}

export interface Paper {
  id: number;
  title: string;
  instructions: string;
  chapter?: number | null;
  chapter_title?: string;
  subjects?: string[];
  duration_minutes?: number;
  total_question_count?: number;
  specifications?: Record<string, any>;
  created_by: number;
  created_by_username?: string;
  school: number;
  school_name?: string;
  status: string;
  version_count?: number;
  versions?: PaperVersionSummary[];
  created_at: string;
  updated_at: string;
}

export interface PaperVersion {
  id: number;
  paper: number;
  paper_title?: string;
  version_label: string;
  total_marks: number;
  question_count?: number;
  question_snapshot: QuestionSnapshotItem[];
  constraints_used: Record<string, any>;
  status: 'DRAFT' | 'FINALIZED';
  created_at: string;
  updated_at: string;
}

export interface PaperPrintData {
  paper_id: number;
  title: string;
  school_name?: string;
  instructions: string;
  version_label: string;
  duration_minutes?: number;
  total_question_count?: number;
  subjects?: string[];
  total_marks: number;
  question_count: number;
  questions: QuestionSnapshotItem[];
}

export interface StudentAttemptSummary {
  id: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';
  score: number;
  max_score: number;
}

export interface Delivery {
  id: number;
  paper_version: number;
  paper_id?: number;
  paper_title?: string;
  version_label?: string;
  total_marks?: number;
  mode: 'PRINT' | 'ONLINE';
  status: string;
  assigned_students: number[];
  assigned_students_count?: number;
  assigned_students_details?: Array<{ id: number; username: string; email: string }>;
  target_class?: number | null;
  target_class_name?: string | null;
  my_attempt?: StudentAttemptSummary | null;
  available_from: string | null;
  available_until: string | null;
  created_by: number;
  created_by_username?: string;
  created_at: string;
  updated_at: string;
}

export interface AttemptQuestionItem {
  question_id: number;
  question_text: string;
  question_type: 'MCQ' | 'SHORT_ANSWER' | 'LONG_ANSWER' | string;
  marks: number;
  options: Record<string, string> | null;
  student_response: string;
}

export interface AttemptStartResponse {
  attempt_id: number;
  delivery_id: number;
  paper_title: string;
  instructions: string;
  version_label: string;
  total_marks: string | number;
  status: string;
  started_at: string;
  available_until?: string | null;
  questions: AttemptQuestionItem[];
}

export interface AttemptSubmitResponse {
  id: number;
  delivery: number;
  paper_title: string;
  status: 'SUBMITTED' | 'EVALUATED' | string;
  score: number;
  max_score: number;
  started_at: string;
  submitted_at: string;
  message: string;
}

export interface StudentResultAnswerItem {
  question_id: number;
  question_text: string;
  question_type: string;
  max_marks: number;
  student_response: string;
  is_correct: boolean | null;
  marks_awarded: number | null;
  pending_manual_review: boolean;
  correct_answer?: string;
}

export interface StudentAttemptResult {
  id: number;
  delivery: number;
  paper_title: string;
  status: 'SUBMITTED' | 'EVALUATED' | string;
  score: number | null;
  max_score: number;
  warning_count?: number;
  is_evaluation_pending?: boolean;
  evaluation_message?: string;
  started_at: string;
  submitted_at: string;
  answers: StudentResultAnswerItem[];
}

export interface Attempt {
  id: number;
  delivery: number;
  delivery_detail?: Delivery;
  student: number;
  student_name?: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EVALUATED' | 'GRADED';
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  time_spent_seconds?: number;
  answers?: Answer[];
}

export interface Answer {
  id: number;
  attempt: number;
  question_id: number;
  student_answer?: any;
  student_response?: string;
  is_correct: boolean | null;
  marks_awarded: number | null;
  auto_graded?: boolean;
  teacher_feedback?: string;
}

export interface DeliveryRosterAttempt {
  attempt_id: number;
  student_id: number;
  student_username: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED' | string;
  score: number | null;
  max_score: number;
  submitted_at: string | null;
}

export interface DeliveryResultsRoster {
  delivery_id: number;
  paper_title: string;
  version_label: string;
  total_marks: number;
  total_students_assigned: number;
  attempts_count: number;
  submitted_count: number;
  evaluated_count: number;
  attempts: DeliveryRosterAttempt[];
}

export interface TeacherAttemptAnswerItem {
  answer_id?: number;
  question_id: number;
  question_text: string;
  question_type: string;
  max_marks: number;
  student_response: string;
  correct_answer?: string;
  options?: Record<string, string> | null;
  is_correct: boolean | null;
  marks_awarded: number | null;
  needs_grading?: boolean;
}

export interface TeacherAttemptDetail {
  id: number;
  delivery: number;
  paper_title: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED' | string;
  score: number;
  max_score: number;
  started_at: string;
  submitted_at: string | null;
  student_id: number;
  student_username: string;
  answers: TeacherAttemptAnswerItem[];
}

export interface GradeAnswerInput {
  marks_awarded: number;
  is_correct?: boolean;
}

export interface GradeAnswerResponse {
  attempt_id: number;
  question_id: number;
  marks_awarded: number;
  is_correct: boolean;
  attempt_score: number;
  attempt_status: string;
}

export interface School {
  id: number;
  name: string;
  config?: Record<string, any>;
  max_students?: number;
  max_teachers?: number;
  question_bank_enabled?: boolean;
  student_count?: number;
  teacher_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SchoolAdminCreateInput {
  username: string;
  password: string;
  email: string;
  mobile_number: string;
  first_name?: string;
  last_name?: string;
}

export interface SchoolCreateInput {
  name: string;
  max_students?: number;
  max_teachers?: number;
  question_bank_enabled?: boolean;
  config?: Record<string, any>;
  admin?: SchoolAdminCreateInput;
}

export interface SchoolUpdateInput {
  name?: string;
  max_students?: number;
  max_teachers?: number;
  question_bank_enabled?: boolean;
  config?: Record<string, any>;
}

export interface ClassSubjectTeacher {
  id: number;
  class_section: number;
  subject: string;
  teacher: number;
  teacher_name?: string;
  teacher_email?: string;
  teacher_mobile?: string;
}

export interface ClassSection {
  id: number;
  school: number;
  standard: number;
  section: string;
  name: string;
  max_students: number;
  student_count?: number;
  enrolled_students_count?: number;
  class_teacher: number | null;
  class_teacher_username?: string | null;
  class_teacher_name?: string | null;
  class_teacher_subject?: string;
  subject_teachers?: ClassSubjectTeacher[];
  created_at?: string;
  updated_at?: string;
}

export interface SubjectAssignment {
  id: number;
  class_section_id: number;
  class_name: string;
  standard: number;
  section: string;
  subject: string;
  student_count: number;
  max_students: number;
  class_teacher_id?: number | null;
  class_teacher_name?: string | null;
  is_class_teacher?: boolean;
}

export interface TeacherAssignmentsResponse {
  class_teacher_sections: ClassSection[];
  subject_assignments: SubjectAssignment[];
}

export interface ClassSectionCreateInput {
  standard: number;
  section: string;
  max_students?: number;
  class_teacher?: number | null;
  class_teacher_subject?: string;
  school?: number;
}

export interface SchoolCapacityInfo {
  school_id: number;
  school_name: string;
  students: {
    limit: number;
    current: number;
    remaining: number;
  };
  teachers: {
    limit: number;
    current: number;
    remaining: number;
  };
}

export interface ImportSummary {
  total_rows: number;
  created_count: number;
  over_limit_count: number;
  duplicate_count: number;
  invalid_count: number;
  configured_limit: number;
  current_usage_before: number;
  current_usage_after: number;
  remaining_capacity_before: number;
  remaining_capacity_after: number;
}

export interface ImportCreatedRow {
  row_number: number;
  id: number;
  name: string;
  username: string;
  mobile_number: string;
  gr_number?: string;
  roll_number?: string;
  standard?: number;
  division?: string;
  class_name?: string;
  subject?: string;
  class_teacher?: string;
}

export interface ImportOverLimitRow {
  row_number: number;
  name: string;
  gr_number?: string;
  standard?: number;
  division?: string;
  subject?: string;
  error: string;
}

export interface ImportDuplicateRow {
  row_number: number;
  name: string;
  gr_number?: string;
  duplicate_field: string;
  error: string;
}

export interface ImportInvalidRow {
  row_number: number;
  name?: string;
  gr_number?: string;
  error: string;
}

export interface ImportReport {
  error?: string;
  summary: ImportSummary;
  created: ImportCreatedRow[];
  over_limit: ImportOverLimitRow[];
  duplicates: ImportDuplicateRow[];
  invalid: ImportInvalidRow[];
}


