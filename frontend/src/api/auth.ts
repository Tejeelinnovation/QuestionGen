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

  updateProfile: async (data: { first_name?: string; last_name?: string; primary_subject?: string }): Promise<User> => {
    const response = await apiClient.patch<User>('/api/auth/me/', data);
    return response.data;
  },

  changePassword: async (data: {
    old_password: string;
    new_password: string;
    new_password_confirm: string;
  }): Promise<{ detail: string }> => {
    const response = await apiClient.post<{ detail: string }>('/api/auth/change-password/', data);
    return response.data;
  },

  requestPasswordReset: async (email: string): Promise<{ detail: string; reset_url?: string }> => {
    const response = await apiClient.post<{ detail: string; reset_url?: string }>('/api/auth/password-reset/request/', {
      email,
    });
    return response.data;
  },

  confirmPasswordReset: async (payload: {
    uid: string;
    token: string;
    new_password: string;
    new_password_confirm: string;
  }): Promise<{ detail: string }> => {
    const response = await apiClient.post<{ detail: string }>('/api/auth/password-reset/confirm/', payload);
    return response.data;
  },
};
