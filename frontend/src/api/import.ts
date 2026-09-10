import { apiClient } from './client';
import type { ImportReport, SchoolCapacityInfo } from '../types';

export const importApi = {
  /**
   * Downloads sample Excel template for Student or Teacher import.
   */
  downloadTemplate: async (type: 'student' | 'teacher'): Promise<void> => {
    const response = await apiClient.get('/api/schools/import/template/', {
      params: { type },
      responseType: 'blob',
    });

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${type}_import_sample.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  },

  /**
   * Retrieves configured capacity, current usage, and remaining slots for the school.
   */
  getCapacity: async (schoolId?: number): Promise<SchoolCapacityInfo> => {
    const params: Record<string, any> = {};
    if (schoolId) params.school_id = schoolId;
    const response = await apiClient.get<SchoolCapacityInfo>('/api/schools/import/capacity/', {
      params,
    });
    return response.data;
  },

  /**
   * Uploads completed Student workbook (.xlsx) and returns detailed import audit report.
   */
  importStudents: async (file: File, schoolId?: number): Promise<ImportReport> => {
    const formData = new FormData();
    formData.append('file', file);
    if (schoolId) formData.append('school_id', String(schoolId));

    const response = await apiClient.post<ImportReport>(
      '/api/schools/import/students/',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Uploads completed Teacher workbook (.xlsx) and returns detailed import audit report.
   */
  importTeachers: async (file: File, schoolId?: number): Promise<ImportReport> => {
    const formData = new FormData();
    formData.append('file', file);
    if (schoolId) formData.append('school_id', String(schoolId));

    const response = await apiClient.post<ImportReport>(
      '/api/schools/import/teachers/',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },
};
