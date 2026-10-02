import { apiClient } from './client';

export interface IngestionJobSummary {
  id: number;
  title: string;
  subject: string;
  standard: number | null;
  board: string;
  document_kind: 'TEXTBOOK' | 'HANDWRITTEN_NOTES' | 'QUESTION_PAPER' | 'OTHER';
  granularity: 'UNKNOWN' | 'WHOLE_BOOK' | 'CHAPTER' | 'TOPIC';
  status: 'PENDING' | 'PARSING' | 'EXTRACTING' | 'COMPLETED' | 'FAILED';
  total_pages: number;
  processed_pages: number;
  progress_percentage: number;
  current_stage: string;
  queue_position?: number | null;
  error_message?: string;
  google_drive_file_id?: string;
  google_drive_url: string;
  created_at: string;
  updated_at: string;
}


export interface ExtractedChapter {
  id: number;
  chapter_number: number;
  title: string;
  start_page: number;
  end_page: number;
  summary: string;
  metadata: Record<string, any>;
}

export interface IngestionJobDetail extends IngestionJobSummary {
  google_drive_file_id: string;
  error_message: string;
  table_of_contents: Array<{
    chapter_number: number;
    title: string;
    start_page: number;
    end_page: number;
  }>;
  chapters: ExtractedChapter[];
  items_count: number;
  metadata: Record<string, any>;
}

export interface StructuredSection {
  type: 'PARAGRAPH' | 'FORMULA' | 'DIAGRAM' | 'ACTIVITY' | 'SOLVED_EXAMPLE' | 'EXERCISE_QUESTION' | 'DEFINITION' | 'SUMMARY';
  heading?: string;
  text?: string;
  column_index?: number;
  latex_equations?: string[];
  image_path?: string;
  image_caption?: string;
  metadata?: Record<string, any>;
}

export interface ExtractedPage {
  id: number;
  page_number: number;
  layout_type: string;
  raw_text: string;
  structured_content: StructuredSection[];
  chapter: number | null;
  chapter_title: string;
  is_verified: boolean;
  items_count: number;
}

export const fetchIngestionJobs = async (): Promise<IngestionJobSummary[]> => {
  const response = await apiClient.get<IngestionJobSummary[]>('/api/ingest/jobs/');
  return response.data;
};

export const fetchIngestionJobDetail = async (id: number): Promise<IngestionJobDetail> => {
  const response = await apiClient.get<IngestionJobDetail>(`/api/ingest/jobs/${id}/`);
  return response.data;
};

export const createIngestionJob = async (formData: FormData): Promise<IngestionJobDetail> => {
  const response = await apiClient.post<IngestionJobDetail>('/api/ingest/jobs/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processIngestionChunk = async (
  id: number,
  chunkSize: number = 5
): Promise<{
  job_id: number;
  status: string;
  processed_pages: number;
  total_pages: number;
  progress_percentage: number;
  current_stage: string;
  is_finished: boolean;
}> => {
  const response = await apiClient.post(`/api/ingest/jobs/${id}/process-chunk/`, {
    chunk_size: chunkSize,
  });
  return response.data;
};

export const fetchJobPages = async (
  id: number,
  pageNumber?: number
): Promise<ExtractedPage[]> => {
  const params = pageNumber ? { page_number: pageNumber } : {};
  const response = await apiClient.get<ExtractedPage[]>(`/api/ingest/jobs/${id}/pages/`, { params });
  return response.data;
};

export const exportJobJson = async (id: number): Promise<any> => {
  const response = await apiClient.get(`/api/ingest/jobs/${id}/export-json/`);
  return response.data;
};

export const enqueueJob = async (
  id: number
): Promise<{
  job_id: number;
  status: string;
  queue_position: number | null;
  message: string;
}> => {
  const response = await apiClient.post(`/api/ingest/jobs/${id}/enqueue/`);
  return response.data;
};

export const enqueueAllJobs = async (): Promise<{
  enqueued_count: number;
  message: string;
}> => {
  const response = await apiClient.post('/api/ingest/jobs/enqueue-all/');
  return response.data;
};

export const deleteIngestionJob = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/ingest/jobs/${id}/`);
};

export const resetIngestionJob = async (
  id: number
): Promise<{
  status: string;
  job_id: number;
  job_status: string;
}> => {
  const response = await apiClient.post(`/api/ingest/jobs/${id}/reset/`);
  return response.data;
};

