import { apiClient } from './client';
import type { Delivery } from '../types';

export const deliveriesApi = {
  getDeliveries: async (): Promise<Delivery[]> => {
    const response = await apiClient.get<Delivery[]>('/api/deliveries/');
    return response.data;
  },

  getDelivery: async (id: number): Promise<Delivery> => {
    const response = await apiClient.get<Delivery>(`/api/deliveries/${id}/`);
    return response.data;
  },
};
