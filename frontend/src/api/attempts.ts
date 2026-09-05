import { apiClient } from './client';
import type { Attempt } from '../types';

export const attemptsApi = {
  startOrResumeAttempt: async (deliveryId: number): Promise<Attempt> => {
    const response = await apiClient.get<Attempt>(`/api/deliveries/${deliveryId}/start/`);
    return response.data;
  },

  getAttemptResult: async (attemptId: number): Promise<Attempt> => {
    const response = await apiClient.get<Attempt>(`/api/attempts/${attemptId}/result/`);
    return response.data;
  },

  getDeliveryResults: async (deliveryId: number): Promise<any> => {
    const response = await apiClient.get(`/api/deliveries/${deliveryId}/results/`);
    return response.data;
  },
};
