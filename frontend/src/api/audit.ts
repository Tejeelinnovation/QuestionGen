import { apiClient } from './client';

export interface AuditLogActor {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role_label: string;
}

export interface AuditLogItem {
  id: number;
  actor: AuditLogActor | null;
  event_type: string;
  target_type: string;
  target_id: string;
  category: 'PROCTORING' | 'EXAMS' | 'PAPERS' | 'USERS' | 'SYSTEM';
  metadata: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogsResponse {
  count: number;
  results: AuditLogItem[];
}

export interface AuditLogsQueryParams {
  category?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export const auditApi = {
  getLogs: async (params: AuditLogsQueryParams = {}): Promise<AuditLogsResponse> => {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'ALL') {
      query.append('category', params.category);
    }
    if (params.search) {
      query.append('search', params.search);
    }
    if (params.page) {
      query.append('page', String(params.page));
    }
    if (params.page_size) {
      query.append('page_size', String(params.page_size));
    }

    const queryString = query.toString();
    const url = `/api/audit-logs/${queryString ? `?${queryString}` : ''}`;
    const response = await apiClient.get<AuditLogsResponse>(url);
    return response.data;
  },
};
