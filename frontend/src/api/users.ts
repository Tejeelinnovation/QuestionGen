import { apiClient } from './client';
import type { User } from '../types';

export interface CreateUserInput {
  username: string;
  password: string;
  profile: 'school_admin' | 'teacher' | 'student';
  email?: string;
  first_name?: string;
  last_name?: string;
  school?: number;
}

export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/api/users/');
    const list = response.data;
    if (Array.isArray(list)) {
      list.forEach((u) => {
        if (u && Array.isArray(u.capabilities)) {
          u.capabilities = u.capabilities.map((c: any) =>
            typeof c === 'object' && c?.name ? c.name : c
          );
        }
      });
    }
    return list;
  },

  createUser: async (data: CreateUserInput): Promise<User> => {
    const response = await apiClient.post<User>('/api/users/', data);
    return response.data;
  },
};
