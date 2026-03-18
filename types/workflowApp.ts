export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UploadedAudioReference {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export type CanvasNodeType = 'text' | 'image' | 'audio' | 'video';
export type CanvasRunStatus = 'idle' | 'running' | 'success' | 'error';
export type CanvasInputValueType = 'text' | 'image' | 'video' | 'audio';

export interface CanvasModelInputDefinition {
  type: CanvasInputValueType;
  label?: string;
  required?: boolean;
  multiple?: boolean;
  maxItems?: number;
}

export interface CanvasConfigFieldDefinition {
  type: 'string' | 'number' | 'boolean';
  label?: string;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  min?: number;
  max?: number;
  step?: number;
}

export interface CanvasConnection {
  id: string;
  from: string;
  to: string;
  inputType?: CanvasInputValueType;
}

export interface CanvasNodeOutput {
  text?: string;
  previewUrl?: string;
  providerJobId?: string;
  metadata?: Record<string, unknown>;
}

export interface ReviewResult {
  policyId: string;
  passed: boolean;
  notes: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReviewPolicy {
  id: string;
  name: string;
  description: string;
  defaultEnabledStageKinds: string[];
}

export interface ModelDefinition {
  familyId: string;
  familyName: string;
  deploymentId: string;
  providerModelId: string;
  aliases?: string[];
  name: string;
  vendor: string;
  modality: CanvasNodeType;
  capabilities: string[];
  inputSchema: Record<string, CanvasModelInputDefinition>;
  configSchema: Record<string, CanvasConfigFieldDefinition>;
  adapter: string;
}

export interface CapabilityDefinition {
  id: string;
  name: string;
  stageKind: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  defaultModelId: string;
  allowedModelIds: string[];
}

export interface SkillPackPromptRecipe {
  id: string;
  name: string;
  description: string;
}

export interface SkillPack {
  id: string;
  name: string;
  stageKind: string;
  source: string;
  executionRole: string;
  description: string;
  promptMethodology: string;
  templates: {
    primaryOutput: string;
    artifacts: string[];
  };
  reviewPolicies: string[];
  promptRecipes: SkillPackPromptRecipe[];
}

export interface StageConfig {
  skillPackId?: string;
  reviewPolicyIds: string[];
  capabilityId: string;
  modelId: string;
  modelParams?: Record<string, unknown>;
  promptRecipeId?: string;
}

export type StageConfigMap = Record<string, StageConfig>;

export interface ProjectSetup {
  projectId: string;
  aspectRatio: string;
  styleSummary: string;
  targetMedium: string;
  globalPrompts: string[];
  modelPreferences: Record<string, unknown>;
  stageConfig: StageConfigMap;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoryBible {
  title: string;
  logline: string;
  summary: string;
  worldRules: string[];
  styleSignals: {
    aspectRatio: string;
    styleSummary: string;
    targetMedium: string;
    globalPrompts: string[];
  };
  characters: Array<{ name: string; description: string }>;
  scenes: Array<{ name: string; description: string }>;
  props: Array<{ name: string; description: string }>;
  episodes: Array<{ episodeNumber: number; title: string; synopsis: string; sourceText: string }>;
  continuityRules: string[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  role: 'owner' | 'admin' | 'editor';
  assetCount: number;
  episodeCount: number;
  hasScript: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  id: string;
  title: string;
  ownerUserId: string;
  setup: ProjectSetup | null;
  storyBible: StoryBible | null;
  latestScriptSource: ScriptSource | null;
  members: ProjectMember[];
  currentRole: 'owner' | 'admin' | 'editor';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor';
  email: string;
  name: string;
  createdAt: string;
}

export interface ScriptSource {
  id: string;
  projectId: string;
  sourceType: string;
  mimeType: string | null;
  originalName: string | null;
  contentText: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  projectId: string;
  versionNumber: number;
  promptText: string;
  previewUrl: string | null;
  sourcePayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface CanonicalAsset {
  id: string;
  projectId: string;
  type: 'character' | 'scene' | 'prop' | 'style';
  name: string;
  description: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  currentVersionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  versions: AssetVersion[];
}

export interface EpisodeContext {
  episodeId: string;
  projectId: string;
  contextSummary: string;
  precedingSummary: string;
  content: {
    worldState?: Record<string, unknown>;
    continuityState?: Record<string, unknown>;
    [key: string]: unknown;
  };
  updatedAt: string;
}

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  modelId?: string;
  prompt?: string;
  params?: Record<string, unknown>;
  output?: CanvasNodeOutput;
  runStatus?: CanvasRunStatus;
  error?: string | null;
  lastRunAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EpisodeWorkspace {
  episodeId: string;
  projectId: string;
  content: {
    nodes: CanvasNode[];
    connections?: CanvasConnection[];
    [key: string]: unknown;
  };
  updatedAt: string;
}

export interface Episode {
  id: string;
  projectId: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  sourceText: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  context?: EpisodeContext | null;
}

export interface StudioWorkspace {
  id: string;
  userId: string;
  title: string;
  content: {
    nodes: CanvasNode[];
    connections?: CanvasConnection[];
    [key: string]: unknown;
  };
  importedAssets: Array<{
    id: string;
    name: string;
    type: string;
    projectId: string;
    copiedAt: string;
    sourceVersionId: string | null;
  }>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityRun {
  id: string;
  projectId: string | null;
  episodeId: string | null;
  capabilityId: string;
  modelId: string;
  skillPackId: string | null;
  status: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown> & {
    reviews?: ReviewResult[];
    usedLiveModel?: boolean;
  };
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  projectId: string;
  stageKind: string;
  status: string;
  capabilityRunId: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRunBundle {
  capabilityRuns: CapabilityRun[];
  workflowRuns: WorkflowRun[];
}

export interface CanvasNodeRunResult {
  workspaceKind: 'episode' | 'studio';
  episodeId?: string;
  workspaceId?: string;
  nodeId: string;
  content: {
    nodes: CanvasNode[];
    connections?: CanvasConnection[];
    [key: string]: unknown;
  };
  pending?: boolean;
  providerJob?: {
    id: string;
    status: string;
    phase?: string;
    videoUrl?: string;
    error?: string;
    progress?: number;
    metadata?: Record<string, unknown>;
  };
}

export interface JimengJob {
  id: string;
  prompt: string;
  status: string;
  phase: string;
  progress: number;
  error?: string;
  videoUrl?: string;
  metadata?: Record<string, unknown>;
  attempts?: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}
