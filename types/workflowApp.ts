export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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
  id: string;
  name: string;
  vendor: string;
  modality: 'text' | 'image' | 'audio' | 'video';
  capabilities: string[];
  configSchema: Record<string, unknown>;
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
  type: 'text' | 'image' | 'audio' | 'video';
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
}

export interface EpisodeWorkspace {
  episodeId: string;
  projectId: string;
  content: {
    nodes: CanvasNode[];
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
  outputPayload: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
