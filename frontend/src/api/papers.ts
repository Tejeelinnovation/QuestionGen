import { apiClient } from './client';
import type { Paper } from '../types';

export interface CreatePaperInput {
  title: string;
  subject: string;
  grade: number;
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
};
