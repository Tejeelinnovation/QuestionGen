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
};
