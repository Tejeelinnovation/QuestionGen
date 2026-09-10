import { apiClient } from './client';
import type {
  Delivery,
  Paper,
  PaperPrintData,
  PaperVersion,
  QuestionPreview,
} from '../types';

export interface CreatePaperInput {
  title: string;
  instructions: string;
  chapter: number;
}

export interface SelectQuestionsConstraints {
  topic_ids?: number[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | '';
  question_type?: 'MCQ' | 'SHORT_ANSWER' | 'LONG_ANSWER' | '';
  learner_level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | '';
  marks_per_question?: number | string | null;
  total_marks?: number | null;
  quantity?: number | null;
}

export interface CreateVersionInput {
  question_ids: number[];
  constraints_used?: Record<string, any>;
  status?: 'DRAFT' | 'FINALIZED';
  version_label?: string;
}

export interface CloneVersionInput {
  question_ids?: number[];
  status?: 'DRAFT' | 'FINALIZED';
}

export interface DeliverVersionInput {
  mode: 'PRINT' | 'ONLINE';
  student_ids?: number[];
  class_section_id?: number;
  available_from?: string | null;
  available_until?: string | null;
}

export const papersApi = {
  getPapers: async (): Promise<Paper[]> => {
    const response = await apiClient.get<Paper[]>('/api/papers/');
    return response.data;
  },

  getPaper: async (id: number): Promise<Paper> => {
    const response = await apiClient.get<Paper>(`/api/papers/${id}/`);
    return response.data;
  },

  createPaper: async (data: CreatePaperInput): Promise<Paper> => {
    const response = await apiClient.post<Paper>('/api/papers/', data);
    return response.data;
  },

  selectQuestions: async (
    paperId: number,
    constraints: SelectQuestionsConstraints
  ): Promise<QuestionPreview[]> => {
    // Strip empty / null values before sending to backend
    const payload: Record<string, any> = {};
    if (constraints.topic_ids && constraints.topic_ids.length > 0) {
      payload.topic_ids = constraints.topic_ids;
    }
    if (constraints.difficulty) {
      payload.difficulty = constraints.difficulty;
    }
    if (constraints.question_type) {
      payload.question_type = constraints.question_type;
    }
    if (constraints.learner_level) {
      payload.learner_level = constraints.learner_level;
    }
    if (constraints.marks_per_question !== undefined && constraints.marks_per_question !== '' && constraints.marks_per_question !== null) {
      payload.marks_per_question = Number(constraints.marks_per_question);
    }
    if (constraints.total_marks !== undefined && constraints.total_marks !== null && constraints.total_marks > 0) {
      payload.total_marks = Number(constraints.total_marks);
    }
    if (constraints.quantity !== undefined && constraints.quantity !== null && constraints.quantity > 0) {
      payload.quantity = Number(constraints.quantity);
    }

    const response = await apiClient.post<{ questions: QuestionPreview[] } | QuestionPreview[]>(
      `/api/papers/${paperId}/select-questions/`,
      payload
    );
    const data: any = response.data;
    return Array.isArray(data) ? data : (data.questions || []);
  },

  getPaperVersions: async (paperId: number): Promise<PaperVersion[]> => {
    const response = await apiClient.get<PaperVersion[]>(`/api/papers/${paperId}/versions/`);
    return response.data;
  },

  createVersion: async (
    paperId: number,
    data: CreateVersionInput
  ): Promise<PaperVersion> => {
    const response = await apiClient.post<PaperVersion>(
      `/api/papers/${paperId}/versions/`,
      data
    );
    return response.data;
  },

  getPaperVersion: async (
    paperId: number,
    versionId: number
  ): Promise<PaperVersion> => {
    const response = await apiClient.get<PaperVersion>(
      `/api/papers/${paperId}/versions/${versionId}/`
    );
    return response.data;
  },

  finalizeVersion: async (
    paperId: number,
    versionId: number
  ): Promise<PaperVersion> => {
    const response = await apiClient.post<PaperVersion>(
      `/api/papers/${paperId}/versions/${versionId}/finalize/`
    );
    return response.data;
  },

  cloneVersion: async (
    paperId: number,
    versionId: number,
    data?: CloneVersionInput
  ): Promise<PaperVersion> => {
    const response = await apiClient.post<PaperVersion>(
      `/api/papers/${paperId}/versions/${versionId}/clone/`,
      data || {}
    );
    return response.data;
  },

  deliverVersion: async (
    paperId: number,
    versionId: number,
    data: DeliverVersionInput
  ): Promise<Delivery> => {
    const response = await apiClient.post<Delivery>(
      `/api/papers/${paperId}/versions/${versionId}/deliver/`,
      data
    );
    return response.data;
  },

  getPrintLayout: async (
    paperId: number,
    versionId: number
  ): Promise<PaperPrintData> => {
    const response = await apiClient.get<PaperPrintData>(
      `/api/papers/${paperId}/versions/${versionId}/print/`
    );
    return response.data;
  },

  getDeliveries: async (): Promise<Delivery[]> => {
    const response = await apiClient.get<Delivery[]>('/api/deliveries/');
    return response.data;
  },
};
