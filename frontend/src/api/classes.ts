import { apiClient } from './client';
import type {
  ClassSection,
  ClassSectionCreateInput,
  ClassSubjectTeacher,
  User,
} from '../types';

export const classesApi = {
  getClasses: async (schoolId?: number): Promise<ClassSection[]> => {
    const query = new URLSearchParams();
    if (schoolId) query.set('school', String(schoolId));
    const qs = query.toString();
    const url = qs ? `/api/schools/classes/?${qs}` : '/api/schools/classes/';
    const response = await apiClient.get<any>(url);
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data?.results || [];
  },

  getClass: async (id: number): Promise<ClassSection> => {
    const response = await apiClient.get<ClassSection>(`/api/schools/classes/${id}/`);
    return response.data;
  },

  createClass: async (data: ClassSectionCreateInput): Promise<ClassSection> => {
    const response = await apiClient.post<ClassSection>('/api/schools/classes/', data);
    return response.data;
  },

  updateClass: async (
    id: number,
    data: Partial<ClassSectionCreateInput>
  ): Promise<ClassSection> => {
    const response = await apiClient.patch<ClassSection>(`/api/schools/classes/${id}/`, data);
    return response.data;
  },

  deleteClass: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/schools/classes/${id}/`);
  },

  getClassSubjectTeachers: async (classId: number): Promise<ClassSubjectTeacher[]> => {
    const response = await apiClient.get<ClassSubjectTeacher[]>(
      `/api/schools/classes/${classId}/subject-teachers/`
    );
    return response.data;
  },

  assignSubjectTeacher: async (
    classId: number,
    data: { subject: string; teacher: number }
  ): Promise<ClassSubjectTeacher> => {
    const response = await apiClient.post<ClassSubjectTeacher>(
      `/api/schools/classes/${classId}/subject-teachers/`,
      data
    );
    return response.data;
  },

  removeSubjectTeacher: async (
    classId: number,
    subject: string
  ): Promise<void> => {
    await apiClient.delete(`/api/schools/classes/${classId}/subject-teachers/?subject=${encodeURIComponent(subject)}`);
  },

  getClassStudents: async (classId: number): Promise<User[]> => {
    const response = await apiClient.get<User[]>(
      `/api/schools/classes/${classId}/students/`
    );
    return response.data;
  },
};
