import { apiClient } from './client';
import type { Chapter, Topic } from '../types';

export const contentApi = {
  getChapters: async (bookId?: number): Promise<Chapter[]> => {
    const url = bookId ? `/api/chapters/?book_id=${bookId}` : '/api/chapters/';
    const response = await apiClient.get<Chapter[]>(url);
    return response.data;
  },

  getTopics: async (chapterId?: number): Promise<Topic[]> => {
    const url = chapterId ? `/api/topics/?chapter_id=${chapterId}` : '/api/topics/';
    const response = await apiClient.get<Topic[]>(url);
    return response.data;
  },
};
