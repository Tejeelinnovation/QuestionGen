import { apiClient } from './client';
import type {
  AttemptStartResponse,
  AttemptSubmitResponse,
  DeliveryResultsRoster,
  GradeAnswerInput,
  GradeAnswerResponse,
  StudentAttemptResult,
  TeacherAttemptDetail,
} from '../types';

export const attemptsApi = {
  startOrResumeAttempt: async (deliveryId: number): Promise<AttemptStartResponse> => {
    const response = await apiClient.get<AttemptStartResponse>(
      `/api/deliveries/${deliveryId}/start/`
    );
    return response.data;
  },

  saveAnswer: async (
    attemptId: number,
    questionId: number,
    studentResponse: string
  ): Promise<{
    attempt_id: number;
    question_id: number;
    student_response: string;
    updated_at: string;
  }> => {
    const response = await apiClient.patch(
      `/api/attempts/${attemptId}/answers/${questionId}/`,
      { student_response: studentResponse }
    );
    return response.data;
  },

  submitAttempt: async (attemptId: number): Promise<AttemptSubmitResponse> => {
    const response = await apiClient.post<AttemptSubmitResponse>(
      `/api/attempts/${attemptId}/submit/`,
      {}
    );
    return response.data;
  },

  getAttemptResult: async (attemptId: number): Promise<StudentAttemptResult> => {
    const response = await apiClient.get<StudentAttemptResult>(
      `/api/attempts/${attemptId}/result/`
    );
    return response.data;
  },

  getDeliveryResults: async (deliveryId: number): Promise<DeliveryResultsRoster> => {
    const response = await apiClient.get<DeliveryResultsRoster>(
      `/api/deliveries/${deliveryId}/results/`
    );
    return response.data;
  },

  exportGradebook: async (
    deliveryId: number,
    sortBy: 'roll_number' | 'name' | 'score' = 'roll_number'
  ): Promise<void> => {
    const response = await apiClient.get(
      `/api/deliveries/${deliveryId}/export-gradebook/?sort_by=${sortBy}`,
      {
        responseType: 'blob',
      }
    );

    const disposition = response.headers['content-disposition'];
    let filename = `Gradebook_Delivery_${deliveryId}.xlsx`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  getTeacherAttemptDetail: async (attemptId: number): Promise<TeacherAttemptDetail> => {
    const response = await apiClient.get<TeacherAttemptDetail>(
      `/api/attempts/${attemptId}/result/`
    );
    return response.data;
  },

  gradeAnswer: async (
    attemptId: number,
    questionId: number,
    data: GradeAnswerInput
  ): Promise<GradeAnswerResponse> => {
    const response = await apiClient.post<GradeAnswerResponse>(
      `/api/attempts/${attemptId}/answers/${questionId}/grade/`,
      data
    );
    return response.data;
  },

  logProctoringWarning: async (
    attemptId: number,
    eventType: string,
    details?: string
  ): Promise<{
    attempt_id: number;
    warning_count: number;
    event_type: string;
    details: string;
    message: string;
  }> => {
    const response = await apiClient.post(
      `/api/attempts/${attemptId}/proctoring-warning/`,
      { event_type: eventType, details }
    );
    return response.data;
  },

  downloadScorecardPdf: async (attemptId: number): Promise<void> => {
    const response = await apiClient.get(
      `/api/attempts/${attemptId}/download-scorecard/`,
      {
        responseType: 'blob',
      }
    );

    const disposition = response.headers['content-disposition'];
    let filename = `Scorecard_Attempt_${attemptId}.pdf`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const blob = new Blob([response.data], {
      type: 'application/pdf',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

