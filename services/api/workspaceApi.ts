import { apiRequest, isApiAvailable } from './client';
import type { ApiResponse } from './client';
import type {
  EpisodeAssetBinding,
  WorkflowShot,
  WorkflowShotOutput,
  WorkflowStageRun,
} from '../workflow/domain/types';

export interface EpisodeWorkspaceData {
  workflowInstanceId: string;
  projectId: string;
  assetBindings: EpisodeAssetBinding[];
  stageRuns: WorkflowStageRun[];
  shots: WorkflowShot[];
  shotOutputs: WorkflowShotOutput[];
}

export interface WorkflowStageRunMutation {
  status?: WorkflowStageRun['status'];
  formData?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  artifactIds?: string[];
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
}

export interface EpisodeAssetBindingMutation {
  assetId?: string;
  versionId?: string | null;
  mode?: EpisodeAssetBinding['mode'];
  derivedFromVersionId?: string | null;
}

export interface WorkflowShotMutation {
  id?: string;
  stageRunId?: string | null;
  shotNumber?: number;
  title?: string;
  sourceNodeId?: string | null;
  sourcePage?: number | null;
  panelIndex?: number | null;
  prompt?: string;
  imageUrl?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WorkflowShotOutputMutation {
  id?: string;
  workflowInstanceId?: string | null;
  generationJobId?: string | null;
  provider?: string | null;
  outputType?: string;
  label?: string | null;
  url?: string;
  thumbnailUrl?: string | null;
  metadata?: Record<string, unknown>;
  isSelected?: boolean;
  selectedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

async function requireWorkspaceApi<T>(message: string): Promise<ApiResponse<T> | null> {
  if (await isApiAvailable()) {
    return null;
  }

  return {
    success: false,
    error: message,
  };
}

export async function getEpisodeWorkspace(
  workflowInstanceId: string,
): Promise<ApiResponse<EpisodeWorkspaceData>> {
  const unavailable = await requireWorkspaceApi<EpisodeWorkspaceData>('Episode workspace requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<EpisodeWorkspaceData>(`/episodes/${workflowInstanceId}/workspace`);
}

export async function listWorkflowStageRuns(
  workflowInstanceId: string,
): Promise<ApiResponse<WorkflowStageRun[]>> {
  const unavailable = await requireWorkspaceApi<WorkflowStageRun[]>('Workflow stage runs require the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowStageRun[]>(`/workflows/${workflowInstanceId}/stages`);
}

export async function updateWorkflowStageRun(
  workflowInstanceId: string,
  stageId: string,
  payload: WorkflowStageRunMutation,
): Promise<ApiResponse<WorkflowStageRun>> {
  const unavailable = await requireWorkspaceApi<WorkflowStageRun>('Updating workflow stages requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowStageRun>(`/workflows/${workflowInstanceId}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function listEpisodeShots(
  workflowInstanceId: string,
): Promise<ApiResponse<WorkflowShot[]>> {
  const unavailable = await requireWorkspaceApi<WorkflowShot[]>('Episode shots require the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowShot[]>(`/episodes/${workflowInstanceId}/shots`);
}

export async function createEpisodeAssetBinding(
  workflowInstanceId: string,
  payload: EpisodeAssetBindingMutation,
): Promise<ApiResponse<EpisodeAssetBinding>> {
  const unavailable = await requireWorkspaceApi<EpisodeAssetBinding>('Creating episode asset bindings requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<EpisodeAssetBinding>(`/episodes/${workflowInstanceId}/bindings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEpisodeAssetBinding(
  bindingId: string,
  payload: EpisodeAssetBindingMutation,
): Promise<ApiResponse<EpisodeAssetBinding>> {
  const unavailable = await requireWorkspaceApi<EpisodeAssetBinding>('Updating episode asset bindings requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<EpisodeAssetBinding>(`/episode-bindings/${bindingId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEpisodeAssetBinding(
  bindingId: string,
): Promise<ApiResponse<void>> {
  const unavailable = await requireWorkspaceApi<void>('Deleting episode asset bindings requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<void>(`/episode-bindings/${bindingId}`, {
    method: 'DELETE',
  });
}

export async function createEpisodeShot(
  workflowInstanceId: string,
  payload: WorkflowShotMutation,
): Promise<ApiResponse<WorkflowShot>> {
  const unavailable = await requireWorkspaceApi<WorkflowShot>('Creating episode shots requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowShot>(`/episodes/${workflowInstanceId}/shots`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateWorkflowShot(
  shotId: string,
  payload: WorkflowShotMutation,
): Promise<ApiResponse<WorkflowShot>> {
  const unavailable = await requireWorkspaceApi<WorkflowShot>('Updating shots requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowShot>(`/shots/${shotId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteWorkflowShot(
  shotId: string,
): Promise<ApiResponse<void>> {
  const unavailable = await requireWorkspaceApi<void>('Deleting shots requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<void>(`/shots/${shotId}`, {
    method: 'DELETE',
  });
}

export async function listShotOutputs(
  shotId: string,
): Promise<ApiResponse<WorkflowShotOutput[]>> {
  const unavailable = await requireWorkspaceApi<WorkflowShotOutput[]>('Shot outputs require the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowShotOutput[]>(`/shots/${shotId}/outputs`);
}

export async function createShotOutput(
  shotId: string,
  payload: WorkflowShotOutputMutation,
): Promise<ApiResponse<WorkflowShotOutput>> {
  const unavailable = await requireWorkspaceApi<WorkflowShotOutput>('Creating shot outputs requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowShotOutput>(`/shots/${shotId}/outputs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function selectShotOutput(
  outputId: string,
): Promise<ApiResponse<WorkflowShotOutput>> {
  const unavailable = await requireWorkspaceApi<WorkflowShotOutput>('Selecting shot outputs requires the local API server.');
  if (unavailable) return unavailable;

  return apiRequest<WorkflowShotOutput>(`/shot-outputs/${outputId}/select`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
