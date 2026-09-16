import { apiClient } from './client';
import type {
  Book,
  Chapter,
  Difficulty,
  PaginatedResponse,
  Question,
  QuestionValidationHistoryItem,
  QuestionVariant,
  Topic,
} from '../types';

export interface QuestionStats {
  total_questions: number;
  with_variants: number;
  boards_count: number;
  active_chapters: number;
}

export interface IngestQuestionPayload {
  topic?: number | null;
  topic_ids?: number[];
  book_id?: number | null;
  chapter_id?: number | null;
  board?: string;
  book_title?: string;
  subject?: string;
  grade?: string;
  chapter_title?: string;
  topic_name?: string;
  question_text: string;
  question_type: string;
  marks: number | string;
  difficulty: string;
  learner_level?: string;
  bank_source?: string;
  submit?: boolean;
  options?: Record<string, string> | any;
  correct_answer: string;
  explanation?: string;
  source_reference?: string;
  variants?: Array<{
    variant_type: string;
    marks: number | string;
    question_text: string;
    options?: Record<string, string> | any;
    correct_answer: string;
    explanation?: string;
  }>;
}

export const contentApi = {
  getBoards: async (): Promise<string[]> => {
    const res = await apiClient.get<string[]>('/api/boards/');
    return res.data;
  },

  getBooks: async (board?: string): Promise<Book[]> => {
    const params = board ? { board } : undefined;
    const res = await apiClient.get<Book[]>('/api/books/', { params });
    return res.data;
  },

  getChapters: async (bookId?: number): Promise<Chapter[]> => {
    const params = bookId ? { book_id: bookId } : undefined;
    const res = await apiClient.get<Chapter[]>('/api/chapters/', { params });
    return res.data;
  },

  getTopics: async (chapterId?: number): Promise<Topic[]> => {
    const params = chapterId ? { chapter_id: chapterId } : undefined;
    const res = await apiClient.get<Topic[]>('/api/topics/', { params });
    return res.data;
  },

  getQuestions: async (params?: Record<string, any>): Promise<PaginatedResponse<Question>> => {
    const res = await apiClient.get<any>('/api/questions/', { params });
    if (Array.isArray(res.data)) {
      return {
        count: res.data.length,
        next: null,
        previous: null,
        results: res.data,
      };
    }
    return res.data;
  },

  getQuestionStats: async (): Promise<QuestionStats> => {
    const res = await apiClient.get<QuestionStats>('/api/questions/stats/');
    return res.data;
  },

  getQuestion: async (id: number): Promise<Question> => {
    const res = await apiClient.get<Question>(`/api/questions/${id}/`);
    return res.data;
  },

  ingestQuestion: async (payload: IngestQuestionPayload): Promise<Question> => {
    const res = await apiClient.post<Question>('/api/questions/ingest/', payload);
    return res.data;
  },

  addVariant: async (questionId: number, payload: Partial<QuestionVariant>): Promise<QuestionVariant> => {
    const res = await apiClient.post<QuestionVariant>(`/api/questions/${questionId}/variants/`, payload);
    return res.data;
  },

  deleteQuestion: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/questions/${id}/`);
  },

  getValidationQueue: async (params?: {
    status?: string;
    board?: string;
    difficulty?: string;
    subject?: string;
    page?: number;
    search?: string;
  }): Promise<PaginatedResponse<Question>> => {
    const res = await apiClient.get<PaginatedResponse<Question>>('/api/questions/validation-queue/', { params });
    return res.data;
  },

  getValidationHistory: async (questionId: number): Promise<QuestionValidationHistoryItem[]> => {
    const res = await apiClient.get<QuestionValidationHistoryItem[]>(`/api/questions/${questionId}/validation-history/`);
    return res.data;
  },

  validateQuestion: async (
    questionId: number,
    payload: { action: 'APPROVE' | 'SEND_FOR_CORRECTION' | 'REJECT'; comment?: string }
  ): Promise<Question> => {
    const res = await apiClient.post<Question>(`/api/questions/${questionId}/validate/`, payload);
    return res.data;
  },

  updateValidatorMetadata: async (
    questionId: number,
    payload: {
      topic_ids?: number[];
      difficulty?: Difficulty;
      marks?: string | number;
      variant_marks?: Array<{ id: number; marks: string | number }>;
    }
  ): Promise<Question> => {
    const res = await apiClient.patch<Question>(`/api/questions/${questionId}/validator-metadata/`, payload);
    return res.data;
  },

  resubmitQuestion: async (
    questionId: number,
    payload: {
      question_text?: string;
      options?: any;
      correct_answer?: string;
      explanation?: string;
      comment?: string;
    }
  ): Promise<Question> => {
    const res = await apiClient.post<Question>(`/api/questions/${questionId}/resubmit/`, payload);
    return res.data;
  },
};
