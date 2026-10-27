import { apiClient } from './client';

export interface BenchmarkHardware {
  device: string;
  gpu: string;
  ram: string;
  quantization: string;
  runtime: string;
}

export interface BenchmarkSummaryItem {
  model: string;
  total_runs: number;
  valid_runs: number;
  json_success_pct: number;
  avg_tokens_per_sec: number;
  avg_latency_sec: number;
  avg_compliance_pct: number;
  peak_vram_mb: number;
}

export interface BenchmarkQuestion {
  question_text: string;
  question_type: 'MCQ' | 'SHORT_ANSWER' | 'LONG_ANSWER' | string;
  marks?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string;
  learner_level?: string;
  correct_answer?: string;
  options?: Record<string, string> | null;
  source_reference?: string;
  [key: string]: any;
}

export interface BenchmarkRunItem {
  run_key: string;
  model: string;
  dataset_slug: string;
  subject: string;
  client_wall_time_sec: number;
  eval_count: number;
  prompt_eval_count: number;
  eval_tokens_per_sec: number;
  vram_mb: number;
  is_valid_json: boolean;
  compliance_pct: number;
  error?: string | null;
  timestamp: string;
  questions: BenchmarkQuestion[];
  raw_response: string;
  validation_error?: string;
}

export interface BenchmarkResultsResponse {
  available: boolean;
  message?: string;
  hardware?: BenchmarkHardware;
  last_updated?: string;
  summary: BenchmarkSummaryItem[];
  runs: BenchmarkRunItem[];
}

export const benchmarksApi = {
  getResults: async (): Promise<BenchmarkResultsResponse> => {
    const res = await apiClient.get<BenchmarkResultsResponse>('/api/benchmark-results/');
    return res.data;
  },
};
