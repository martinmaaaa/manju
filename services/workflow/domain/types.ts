export type WorkflowTemplateId = 'manju-series' | 'manju-episode' | 'manju-commentary' | 'character-assets';
export type WorkflowScope = 'series' | 'episode' | 'standalone';
export type WorkflowStatus = 'idle' | 'running' | 'blocked' | 'completed' | 'error';
export type WorkflowStageStatus = 'not_started' | 'in_progress' | 'completed' | 'error';
export type WorkflowAssetType = 'character' | 'scene' | 'prop' | 'style';
export type WorkflowBindingMode = 'pinned' | 'follow_latest' | 'derived';

export interface WorkflowStageDefinition {
  id: string;
  title: string;
  summary: string;
  kind: 'form' | 'asset' | 'binding' | 'storyboard' | 'prompt' | 'video' | 'planner';
  dependsOn: string[];
  assetRequirements?: WorkflowAssetType[];
  optional?: boolean;
}

export interface WorkflowTemplateDefinition {
  id: WorkflowTemplateId;
  name: string;
  scope: WorkflowScope;
  summary: string;
  recommendedFor: string;
  stages: WorkflowStageDefinition[];
  childTemplateId?: WorkflowTemplateId;
  defaultEpisodeCount?: number;
  canvasMaterializationTemplateId?: string;
}

export interface WorkflowStageState {
  stageId: string;
  status: WorkflowStageStatus;
  formData: Record<string, unknown>;
  outputs: Record<string, unknown>;
  artifactIds: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowAssetSummary {
  character: number;
  scene: number;
  prop: number;
  style: number;
}

export interface WorkflowAssetBatchTemplate {
  id: string;
  name: string;
  assetIds: string[];
  autoApplyToNewEpisodes: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAssetBatchTemplateSuggestion {
  key: string;
  name: string;
  assetIds: string[];
  reason: string;
  autoApplyToNewEpisodes: boolean;
}

export interface WorkflowAssetBatchTemplateTarget {
  key: string;
  name: string;
  reason: string;
  templateId?: string;
  autoApplyToNewEpisodes: boolean;
}

export interface WorkflowSeriesNextAction {
  key:
    | 'create_series_assets'
    | 'organize_asset_templates'
    | 'create_episodes'
    | 'open_episode_script'
    | 'open_episode_assets'
    | 'open_episode_storyboard'
    | 'open_episode_prompt'
    | 'open_episode_video'
    | 'materialize_series';
  label: string;
  description: string;
  episodeId?: string;
  stageId?: string;
}

export interface WorkflowSeriesOverview {
  seriesStageCount: number;
  seriesCompletedStageCount: number;
  plannedEpisodeCount: number;
  createdEpisodeCount: number;
  scriptCompletedEpisodeCount: number;
  assetCompletedEpisodeCount: number;
  storyboardCompletedEpisodeCount: number;
  promptCompletedEpisodeCount: number;
  videoCompletedEpisodeCount: number;
  autoApplyTemplateCount: number;
  reusableAssetCount: number;
  coveredAssetCount: number;
  uncoveredAssetCount: number;
  nextAction: WorkflowSeriesNextAction;
}

export interface WorkflowInstance {
  id: string;
  templateId: WorkflowTemplateId;
  scope: WorkflowScope;
  title: string;
  status: WorkflowStatus;
  parentInstanceId?: string;
  currentStageId?: string;
  stageStates: Record<string, WorkflowStageState>;
  artifactIds: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    episodeNumber?: number;
    plannedEpisodeCount?: number;
    canvasMaterializationTemplateId?: string;
    preferredBindingMode?: WorkflowBindingMode;
    assetSummary?: Partial<WorkflowAssetSummary>;
    assetBatchTemplates?: WorkflowAssetBatchTemplate[];
  };
}

export interface WorkflowProjectState {
  version: 1;
  instances: WorkflowInstance[];
  activeSeriesId: string | null;
  activeEpisodeId: string | null;
  assets: WorkflowAsset[];
  assetVersions: WorkflowAssetVersion[];
  assetBindings: EpisodeAssetBinding[];
  continuityStates: ContinuityState[];
}

export interface WorkflowAsset {
  id: string;
  projectId: string;
  type: WorkflowAssetType;
  name: string;
  currentVersionId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAssetVersion {
  id: string;
  assetId: string;
  version: number;
  files: string[];
  promptPack: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EpisodeAssetBinding {
  id: string;
  workflowInstanceId: string;
  assetId: string;
  versionId: string;
  mode: WorkflowBindingMode;
  derivedFromVersionId?: string;
  createdAt: string;
}

export interface ContinuityState {
  id: string;
  workflowInstanceId: string;
  subjectType: 'character' | 'scene' | 'prop';
  subjectId: string;
  state: Record<string, unknown>;
  updatedAt: string;
}
