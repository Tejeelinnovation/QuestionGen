import { apiClient } from './client';
import type { LoginResponse, User } from '../types';

export const authApi = {
  login: async (credentials: { username: string; password: string }): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/api/auth/login/', credentials);
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get<User>('/api/auth/me/');
    const data = response.data;
    if (data && Array.isArray(data.capabilities)) {
      data.capabilities = data.capabilities.map((c: any) =>
        typeof c === 'object' && c?.name ? c.name : c
      );
    }
    return data;
  },

  refreshToken: async (refresh: string): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/api/auth/token/refresh/', { refresh });
    return response.data;
  },

  logout: async (refresh: string): Promise<{ detail: string }> => {
    const response = await apiClient.post<{ detail: string }>('/api/auth/logout/', { refresh });
    return response.data;
  },
};
