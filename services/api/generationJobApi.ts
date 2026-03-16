import { apiRequest, isApiAvailable } from './client';
import type { ApiResponse } from './client';

export interface GenerationJob {
  id: string;
  legacyJobId?: string;
  projectId?: string;
  workflowInstanceId?: string;
  provider: string;
  model?: string;
  capability: string;
  prompt: string;
  status: string;
  phase: string;
  progress: number;
  error?: string;
  resultUrl?: string;
  referenceFiles: Array<{
    originalname: string;
    mimetype: string;
    size: number;
  }>;
  sourcePayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface GenerationJobQuery {
  provider?: string;
  status?: string;
  projectId?: string;
  workflowInstanceId?: string;
  limit?: number;
}

export interface GenerationJobMutation {
  id?: string;
  legacyJobId?: string | null;
  projectId?: string | null;
  workflowInstanceId?: string | null;
  provider?: string;
  model?: string | null;
  capability?: string;
  prompt?: string;
  status?: string;
  phase?: string;
  progress?: number;
  error?: string | null;
  resultUrl?: string | null;
  referenceFiles?: Array<Record<string, unknown>>;
  sourcePayload?: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  attempts?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

function toQueryString(query: GenerationJobQuery = {}): string {
  const searchParams = new URLSearchParams();

  if (query.provider) {
    searchParams.set('provider', query.provider);
  }

  if (query.status) {
    searchParams.set('status', query.status);
  }

  if (query.projectId) {
    searchParams.set('projectId', query.projectId);
  }

  if (query.workflowInstanceId) {
    searchParams.set('workflowInstanceId', query.workflowInstanceId);
  }

  if (typeof query.limit === 'number' && Number.isFinite(query.limit)) {
    searchParams.set('limit', String(query.limit));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

async function requireLocalApi<T>(message: string): Promise<ApiResponse<T> | null> {
  if (await isApiAvailable()) {
    return null;
  }

  return {
    success: false,
    error: message,
  };
}

export async function listGenerationJobs(query: GenerationJobQuery = {}): Promise<ApiResponse<GenerationJob[]>> {
  if (!(await isApiAvailable())) {
    return {
      success: true,
      data: [],
    };
  }

  return apiRequest<GenerationJob[]>(`/generation-jobs${toQueryString(query)}`);
}

export async function listProjectGenerationJobs(
  projectId: string,
  query: Omit<GenerationJobQuery, 'projectId'> = {},
): Promise<ApiResponse<GenerationJob[]>> {
  if (!(await isApiAvailable())) {
    return {
      success: true,
      data: [],
    };
  }

  return apiRequest<GenerationJob[]>(`/projects/${projectId}/generation-jobs${toQueryString(query)}`);
}

export async function getGenerationJob(id: string): Promise<ApiResponse<GenerationJob>> {
  const unavailable = await requireLocalApi<GenerationJob>('Generation jobs require the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<GenerationJob>(`/generation-jobs/${id}`);
}

export async function createGenerationJob(payload: GenerationJobMutation): Promise<ApiResponse<GenerationJob>> {
  const unavailable = await requireLocalApi<GenerationJob>('Creating generation jobs requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<GenerationJob>('/generation-jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateGenerationJob(
  id: string,
  payload: GenerationJobMutation,
): Promise<ApiResponse<GenerationJob>> {
  const unavailable = await requireLocalApi<GenerationJob>('Updating generation jobs requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<GenerationJob>(`/generation-jobs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function postGenerationJobAction(
  id: string,
  action: 'cancel' | 'requeue' | 'retry',
  payload: Record<string, unknown> = {},
): Promise<ApiResponse<GenerationJob>> {
  const unavailable = await requireLocalApi<GenerationJob>(`Generation job ${action} requires the local API server.`);
  if (unavailable) return unavailable;

  return apiRequest<GenerationJob>(`/generation-jobs/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelGenerationJob(
  id: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResponse<GenerationJob>> {
  return postGenerationJobAction(id, 'cancel', payload);
}

export function requeueGenerationJob(
  id: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResponse<GenerationJob>> {
  return postGenerationJobAction(id, 'requeue', payload);
}

export function retryGenerationJob(
  id: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResponse<GenerationJob>> {
  return postGenerationJobAction(id, 'retry', payload);
}
