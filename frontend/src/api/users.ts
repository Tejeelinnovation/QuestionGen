import { apiClient } from './client';
import type {
  User,
  CapabilityName,
  UserUpdateInput,
  School,
  SchoolCreateInput,
  SchoolUpdateInput,
  PaginatedResponse,
  UserStats,
} from '../types';

export interface UserQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  role?: string;
  paginate?: boolean;
}

export interface CreateUserInput {
  username: string;
  password: string;
  profile: 'school_admin' | 'teacher' | 'student' | 'qbm' | 'deo' | 'validator' | 'deo_validator';
  email: string;
  mobile_number: string;
  first_name?: string;
  last_name?: string;
  school?: number;
  class_section?: number | null;
  primary_subject?: string;
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
  getUsers: async (params?: UserQueryParams): Promise<PaginatedResponse<User>> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    if (params?.search) query.set('search', params.search);
    if (params?.role && params.role !== 'ALL') query.set('role', params.role);
    if (params?.paginate !== undefined) query.set('paginate', String(params.paginate));

    const qs = query.toString();
    const url = qs ? `/api/users/?${qs}` : '/api/users/';
    const response = await apiClient.get<any>(url);

    if (Array.isArray(response.data)) {
      const list = response.data.map(normalizeUser);
      return {
        count: list.length,
        next: null,
        previous: null,
        results: list,
      };
    }

    if (response.data && Array.isArray(response.data.results)) {
      response.data.results = response.data.results.map(normalizeUser);
      return response.data as PaginatedResponse<User>;
    }

    return {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };
  },

  getAllUsers: async (params?: { role?: string; search?: string }): Promise<User[]> => {
    const query = new URLSearchParams({ paginate: 'false' });
    if (params?.role && params.role !== 'ALL') query.set('role', params.role);
    if (params?.search) query.set('search', params.search);

    const response = await apiClient.get<any>(`/api/users/?${query.toString()}`);
    const list = Array.isArray(response.data) ? response.data : (response.data?.results || []);
    return list.map(normalizeUser);
  },

  getUserStats: async (): Promise<UserStats> => {
    const response = await apiClient.get<UserStats>('/api/users/stats/');
    return response.data;
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

  getSchool: async (id: number): Promise<School> => {
    const response = await apiClient.get<School>(`/api/schools/${id}/`);
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
