import { apiClient } from './client';
import type { Book, Chapter, Question, QuestionVariant, Topic } from '../types';

export interface IngestQuestionPayload {
  topic: number;
  question_text: string;
  question_type: string;
  marks: number | string;
  difficulty: string;
  learner_level?: string;
  bank_source?: string;
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

  getQuestions: async (params?: Record<string, any>): Promise<Question[]> => {
    const res = await apiClient.get<Question[]>('/api/questions/', { params });
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
};
