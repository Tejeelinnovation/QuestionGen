import { apiClient } from './client';
import type {
  User,
  CapabilityName,
  UserUpdateInput,
  School,
  SchoolCreateInput,
  SchoolUpdateInput,
} from '../types';

export interface CreateUserInput {
  username: string;
  password: string;
  profile: 'school_admin' | 'teacher' | 'student';
  email?: string;
  first_name?: string;
  last_name?: string;
  school?: number;
}

const normalizeUser = (u: any): User => {
  if (u && Array.isArray(u.capabilities)) {
    u.capabilities = u.capabilities.map((c: any) =>
      typeof c === 'object' && c?.name ? c.name : c
    );
  }
  return u as User;
};

export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/api/users/');
    const list = response.data;
    if (Array.isArray(list)) {
      list.forEach((u) => normalizeUser(u));
    }
    return list;
  },

  getUser: async (id: number): Promise<User> => {
    const response = await apiClient.get<User>(`/api/users/${id}/`);
    return normalizeUser(response.data);
  },

  createUser: async (data: CreateUserInput): Promise<User> => {
    const response = await apiClient.post<User>('/api/users/', data);
    return normalizeUser(response.data);
  },

  updateUser: async (id: number, data: Partial<UserUpdateInput>): Promise<User> => {
    const response = await apiClient.patch<User>(`/api/users/${id}/`, data);
    return normalizeUser(response.data);
  },

  grantPermission: async (
    userId: number,
    capabilityName: CapabilityName
  ): Promise<{ detail: string }> => {
    const response = await apiClient.post<{ detail: string }>(
      `/api/users/${userId}/permissions/`,
      { capability_name: capabilityName }
    );
    return response.data;
  },

  revokePermission: async (
    userId: number,
    capabilityName: CapabilityName
  ): Promise<void> => {
    await apiClient.delete(`/api/users/${userId}/permissions/${capabilityName}/`);
  },

  // Schools management endpoints
  getSchools: async (): Promise<School[]> => {
    const response = await apiClient.get<School[]>('/api/schools/');
    return response.data;
  },

  createSchool: async (data: SchoolCreateInput): Promise<School> => {
    const response = await apiClient.post<School>('/api/schools/', data);
    return response.data;
  },

  updateSchool: async (id: number, data: SchoolUpdateInput): Promise<School> => {
    const response = await apiClient.patch<School>(`/api/schools/${id}/`, data);
    return response.data;
  },
};
