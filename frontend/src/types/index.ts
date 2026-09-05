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
  | 'VIEW_SCHOOL_WIDE_CONTROLS';

export type RoleLabel =
  | 'Super Admin'
  | 'School Admin'
  | 'Teacher'
  | 'Student'
  | 'Custom'
  | string;

export interface Capability {
  id: number;
  name: CapabilityName;
  description: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role_label: RoleLabel;
  school: number | null;
  school_name?: string;
  capabilities: CapabilityName[];
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface Paper {
  id: number;
  title: string;
  subject: string;
  grade: number;
  school: number;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  versions?: PaperVersion[];
}

export interface PaperVersion {
  id: number;
  paper: number;
  version_number: number;
  title: string;
  total_marks: number;
  time_limit_minutes: number;
  instructions: string;
  questions_snapshot: any[];
  blueprint_snapshot: any;
  created_by: number;
  created_at: string;
}

export interface Delivery {
  id: number;
  paper_version: number;
  paper_version_detail?: PaperVersion;
  mode: 'PRINT' | 'ONLINE';
  title: string;
  school: number;
  created_by: number;
  assigned_students: number[];
  available_from: string | null;
  available_until: string | null;
  created_at: string;
}

export interface Attempt {
  id: number;
  delivery: number;
  delivery_detail?: Delivery;
  student: number;
  student_name?: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'GRADED';
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  time_spent_seconds: number;
  answers?: Answer[];
}

export interface Answer {
  id: number;
  attempt: number;
  question_id: number;
  student_answer: any;
  is_correct: boolean | null;
  marks_awarded: number | null;
  auto_graded: boolean;
  teacher_feedback: string;
}

export interface School {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
}
