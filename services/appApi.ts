import type {
  ApiResponse,
  AuthUser,
  CapabilityDefinition,
  CapabilityRun,
  CanonicalAsset,
  CanvasNodeRunResult,
  Episode,
  EpisodeContext,
  EpisodeWorkspace,
  JimengJob,
  ModelDefinition,
  ProjectDetail,
  ProjectMember,
  ProjectRunBundle,
  ProjectSetup,
  ProjectSummary,
  ReviewPolicy,
  ScriptSource,
  SkillPack,
  StageConfigMap,
  StudioWorkspace,
  UploadedAudioReference,
} from '../types/workflowApp';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(!(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    const json = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: json?.error || `HTTP ${response.status}`,
      };
    }

    return json as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network request failed.',
    };
  }
}

export const appApi = {
  health: () => apiRequest<{ server: boolean; database: boolean; databaseHost: string }>('/health'),
  me: () => apiRequest<AuthUser>('/me'),
  register: (payload: { email: string; password: string; name: string }) =>
    apiRequest<AuthUser>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    apiRequest<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => apiRequest<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),

  listProjects: () => apiRequest<ProjectSummary[]>('/projects'),
  createProject: (payload: { title: string }) =>
    apiRequest<ProjectDetail>('/projects', { method: 'POST', body: JSON.stringify(payload) }),
  getProject: (projectId: string) => apiRequest<ProjectDetail>(`/projects/${projectId}`),
  listProjectMembers: (projectId: string) => apiRequest<ProjectMember[]>(`/projects/${projectId}/members`),
  addProjectMember: (projectId: string, payload: { email: string; role: 'owner' | 'admin' | 'editor' }) =>
    apiRequest<ProjectMember>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadScriptSource: async (projectId: string, payload: { textContent?: string; file?: File | null }) => {
    const formData = new FormData();
    if (payload.textContent) {
      formData.append('textContent', payload.textContent);
    }
    if (payload.file) {
      formData.append('file', payload.file);
    }
    return apiRequest<ScriptSource>(`/projects/${projectId}/script-source`, {
      method: 'POST',
      body: formData,
    });
  },

  uploadAudioReference: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest<UploadedAudioReference>('/uploads/audio-reference', {
      method: 'POST',
      body: formData,
    });
  },

  getProjectSetup: (projectId: string) =>
    apiRequest<{ setup: ProjectSetup | null; storyBible: ProjectDetail['storyBible']; latestScriptSource: ScriptSource | null }>(
      `/projects/${projectId}/setup`,
    ),
  updateProjectSetup: (projectId: string, payload: Partial<ProjectSetup>) =>
    apiRequest<ProjectSetup>(`/projects/${projectId}/setup`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getStageConfig: (projectId: string) => apiRequest<StageConfigMap>(`/projects/${projectId}/stage-config`),
  updateStageConfig: (projectId: string, payload: Partial<StageConfigMap>) =>
    apiRequest<StageConfigMap>(`/projects/${projectId}/stage-config`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  listProjectRuns: (projectId: string, episodeId?: string) =>
    apiRequest<ProjectRunBundle>(`/projects/${projectId}/runs${episodeId ? `?episodeId=${encodeURIComponent(episodeId)}` : ''}`),

  listSkillPacks: (stageKind?: string) =>
    apiRequest<SkillPack[]>(`/skill-packs${stageKind ? `?stageKind=${encodeURIComponent(stageKind)}` : ''}`),
  listReviewPolicies: () => apiRequest<ReviewPolicy[]>('/review-policies'),
  listModels: () => apiRequest<ModelDefinition[]>('/models'),
  listCapabilities: () => apiRequest<CapabilityDefinition[]>('/capabilities'),

  runCapability: (payload: Record<string, unknown>) =>
    apiRequest<CapabilityRun>('/capability-runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runCanvasNode: (payload: Record<string, unknown>) =>
    apiRequest<CanvasNodeRunResult>('/canvas/node-runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getJimengJob: (jobId: string) =>
    apiRequest<JimengJob>(`/jimeng/jobs/${jobId}`),
  cancelJimengJob: (jobId: string) =>
    apiRequest<JimengJob>(`/jimeng/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),

  listAssets: (projectId: string) => apiRequest<CanonicalAsset[]>(`/projects/${projectId}/assets`),
  createAsset: (projectId: string, payload: Record<string, unknown>) =>
    apiRequest<{ asset: CanonicalAsset }>(`/projects/${projectId}/assets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  saveAssetPromptVersion: (assetId: string, payload: Record<string, unknown>) =>
    apiRequest<{ asset: CanonicalAsset }>(`/assets/${assetId}/prompt-version`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setAssetCurrentVersion: (assetId: string, payload: Record<string, unknown>) =>
    apiRequest<CanonicalAsset>(`/assets/${assetId}/current-version`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  lockAsset: (assetId: string) =>
    apiRequest<CanonicalAsset>(`/assets/${assetId}/lock`, { method: 'POST' }),
  unlockAsset: (assetId: string) =>
    apiRequest<CanonicalAsset>(`/assets/${assetId}/unlock`, { method: 'POST' }),

  listEpisodes: (projectId: string) => apiRequest<Episode[]>(`/projects/${projectId}/episodes`),
  analyzeEpisode: (projectId: string, episodeId: string, payload: Record<string, unknown>) =>
    apiRequest<{ run: CapabilityRun; context: EpisodeContext; workspace: EpisodeWorkspace; episode: Episode }>(
      `/projects/${projectId}/episodes/${episodeId}/analyze`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  getEpisodeContext: (episodeId: string) => apiRequest<EpisodeContext>(`/episodes/${episodeId}/context`),
  getEpisodeWorkspace: (episodeId: string) => apiRequest<EpisodeWorkspace>(`/episodes/${episodeId}/workspace`),
  saveEpisodeWorkspace: (episodeId: string, content: Record<string, unknown>) =>
    apiRequest<EpisodeWorkspace>(`/episodes/${episodeId}/workspace`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  listStudioWorkspaces: () => apiRequest<StudioWorkspace[]>('/studio/workspaces'),
  createStudioWorkspace: (payload: { title: string }) =>
    apiRequest<StudioWorkspace>('/studio/workspaces', {
      method: 'POST',
      body: JSON.stringify({ ...payload, content: { nodes: [], connections: [] }, importedAssets: [] }),
    }),
  getStudioWorkspace: (workspaceId: string) =>
    apiRequest<StudioWorkspace>(`/studio/workspaces/${workspaceId}`),
  saveStudioWorkspace: (workspaceId: string, payload: Partial<StudioWorkspace>) =>
    apiRequest<StudioWorkspace>(`/studio/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  importProjectAssetsToStudio: (workspaceId: string, projectId: string) =>
    apiRequest<StudioWorkspace>(`/studio/workspaces/${workspaceId}/import-project-assets`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }),
};
