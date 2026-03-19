import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, LogOut, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { AppShell } from './components/workflow2/AppShell';
import { Card, MetricTile } from './components/workflow2/PagePrimitives';
import { EpisodesPage } from './components/workflow2/pages/EpisodesPage';
import { EpisodeScenesPage } from './components/workflow2/pages/EpisodeScenesPage';
import { SetupPage } from './components/workflow2/pages/SetupPage';
import { AssetsPage } from './components/workflow2/pages/AssetsPage';
import { SetupSecondarySections } from './components/workflow2/pages/SetupSecondarySections';
import { EpisodeWorkspaceOverviewCard } from './components/workflow2/pages/EpisodeWorkspaceOverviewCard';
import { EpisodeWorkspacePreviewPanel } from './components/workflow2/pages/EpisodeWorkspacePreviewPanel';
import { EpisodeWorkspaceCanvasPanel } from './components/workflow2/pages/EpisodeWorkspaceCanvasPanel';
import { EpisodeWorkspaceTimelineCard } from './components/workflow2/pages/EpisodeWorkspaceTimelineCard';
import { StudioPage } from './components/workflow2/pages/StudioPage';
import { RunLogOverlay } from './components/workflow2/RunLogOverlay';
import { appApi } from './services/appApi';
import {
  resolveCapabilityModelId,
  selectAllowedModels,
  selectCapability,
} from './services/workflow/runtime/capabilityCatalogHelpers';
import {
  buildCanvasNodeModelChangePatch,
  buildCanvasConnectionId,
  buildCanvasNodeStagePresetPatch,
  createCanvasNode,
  getNodePrimaryValue,
  normalizeCanvasContent,
  validateCanvasConnection,
} from './services/workflow/runtime/canvasGraphHelpers';
import {
  appendManualEpisodeShotSlot,
  buildEpisodeShotClip,
  buildEpisodeShotStrip,
  clearEpisodeShotClip,
  clearEpisodeShotJob,
  deleteEpisodeShotSlot,
  findSelectedEpisodeShot,
  renameEpisodeShotSlot,
  reorderEpisodeShotSlot,
  saveClipToEpisodeShotStrip,
  selectEpisodeShotSlot,
  splitShotStripSegments,
  summarizeEpisodeShotStrip,
  upsertEpisodeShotJob,
} from './services/workflow/runtime/episodeShotStripHelpers';
import { syncEpisodeWorkspaceContent } from './services/workflow/runtime/episodeWorkspaceGraphHelpers';
import {
  addEpisodeWorkspaceNode,
  seekEpisodeWorkspaceTimelineDraft,
  selectEpisodeWorkspaceShotDraft,
} from './services/workflow/runtime/episodeWorkspaceEditorHelpers';
import { buildEpisodeWorkspaceViewModel } from './services/workflow/runtime/episodeWorkspaceViewModel';
import { buildSetupFlowSections } from './services/workflow/runtime/setupPageViewModel';
import {
  getEpisodeAssetNodeId,
  getEpisodePrimaryNodeId,
  harmonizeEpisodeWorkbenchContent,
  layoutEpisodeWorkbenchContent,
} from './services/workflow/runtime/episodeWorkbenchHelpers';
import {
  summarizeModelConfigFields,
  summarizeModelInputSupport,
} from './services/workflow/runtime/modelDeploymentHelpers';
import {
  applySkillPackSelection,
  applyStageModelParamChange,
  applyStageModelSelection,
  resolveStageModelParams,
} from './services/workflow/runtime/stageConfigHelpers';
import {
  collectEpisodeWorkspaceVideoInputs,
  isAudioSource,
} from './services/workflow/runtime/workspaceMediaHelpers';
import type {
  AuthUser,
  AssetVersion,
  CapabilityDefinition,
  CanvasNode,
  CanonicalAsset,
  CapabilityRun,
  Episode,
  EpisodeContext,
  EpisodeShotJob,
  EpisodeShotStrip as EpisodeShotStripState,
  EpisodeWorkspace,
  JimengJob,
  ModelDefinition,
  ProjectDetail,
  ProjectMember,
  ProjectRunBundle,
  ProjectSummary,
  ReviewPolicy,
  ReviewResult,
  ScriptSource,
  SkillPack,
  StageConfig,
  StageConfigMap,
  StudioWorkspace,
} from './types/workflowApp';

type Route =
  | { kind: 'home' }
  | { kind: 'project-setup'; projectId: string }
  | { kind: 'project-assets'; projectId: string }
  | { kind: 'project-episodes'; projectId: string }
  | { kind: 'episode-scenes'; projectId: string; episodeId: string }
  | { kind: 'episode-workspace'; projectId: string; episodeId: string }
  | { kind: 'studio' };

type StageKind =
  | 'script_decompose'
  | 'asset_design'
  | 'episode_expand'
  | 'storyboard_generate'
  | 'video_prompt_generate'
  | 'video_generate';

const EMPTY_RUNS: ProjectRunBundle = { capabilityRuns: [], workflowRuns: [] };

const STAGE_LABELS: Record<StageKind, string> = {
  script_decompose: '剧本拆解',
  asset_design: '资产设计',
  episode_expand: '单集扩写',
  storyboard_generate: '分镜生成',
  video_prompt_generate: '视频提示词',
  video_generate: '视频生成',
};

const STAGE_CAPABILITIES: Record<StageKind, string> = {
  script_decompose: 'script_decompose',
  asset_design: 'asset_extract',
  episode_expand: 'episode_expand',
  storyboard_generate: 'storyboard_generate',
  video_prompt_generate: 'video_prompt_generate',
  video_generate: 'video_generate',
};

const WORKFLOW_STAGE_FLOWS: Array<{
  id: 'director_analysis' | 'asset_management' | 'episode_workbench';
  eyebrow: string;
  title: string;
  description: string;
  stageKinds: StageKind[];
}> = [
  {
    id: 'director_analysis',
    eyebrow: '流程一',
    title: '导演分析剧本',
    description: '完整读完全剧，拆出剧集列表，并沉淀导演讲戏本、人物清单和场景清单，供后续技能统一调用。',
    stageKinds: ['script_decompose'],
  },
  {
    id: 'asset_management',
    eyebrow: '流程二',
    title: '资产管理',
    description: '服化道技能包根据导演设定、人物清单和场景清单，一次性产出全部资产生图提示词，不让用户逐个点。',
    stageKinds: ['asset_design'],
  },
  {
    id: 'episode_workbench',
    eyebrow: '流程三',
    title: '单集工作台',
    description: '单集理解、分镜提示词和视频生成都归到工作台，画布只负责组装和执行，不再让阶段页承载太多中间心智。',
    stageKinds: ['episode_expand', 'video_prompt_generate', 'video_generate'],
  },
];

const ROUTE_RUN_LOG_CONFIG: Record<
  Route['kind'],
  { title: string; subtitle: string; scope: 'project' | 'episode' | 'none'; stageKinds?: string[] }
> = {
  home: {
    title: '系统日志',
    subtitle: '当前页没有可展示的工作流日志。',
    scope: 'none',
  },
  studio: {
    title: '画布日志',
    subtitle: '画布沙盒当前不展示工作流日志。',
    scope: 'none',
  },
  'project-setup': {
    title: '项目日志',
    subtitle: '这里收项目初始化、导演分析和资产准备相关日志。',
    scope: 'project',
    stageKinds: ['script_decompose', 'asset_design'],
  },
  'project-assets': {
    title: '项目日志',
    subtitle: '这里收导演分析和资产提取相关日志。',
    scope: 'project',
    stageKinds: ['script_decompose', 'asset_design'],
  },
  'project-episodes': {
    title: '项目日志',
    subtitle: '这里收剧集分析、分镜和视频生成相关日志。',
    scope: 'project',
    stageKinds: ['episode_expand', 'video_prompt_generate', 'video_generate'],
  },
  'episode-scenes': {
    title: '单集日志',
    subtitle: '这里收当前单集的分析、分镜和视频生成日志。',
    scope: 'episode',
    stageKinds: ['episode_expand', 'storyboard_generate', 'video_prompt_generate', 'video_generate'],
  },
  'episode-workspace': {
    title: '单集日志',
    subtitle: '这里收当前单集的分析、分镜和视频生成日志。',
    scope: 'none',
    stageKinds: ['episode_expand', 'storyboard_generate', 'video_prompt_generate', 'video_generate'],
  },
};

const REVIEW_POLICY_LABELS: Record<string, string> = {
  'business-review': '业务审查',
  'compliance-review': '合规审查',
};

function parseRoute(pathname = '/'): Route {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '') return { kind: 'home' };
  if (clean === '/studio') return { kind: 'studio' };

  const scenesMatch = clean.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)\/scenes$/);
  if (scenesMatch) {
    return { kind: 'episode-scenes', projectId: scenesMatch[1], episodeId: scenesMatch[2] };
  }

  const workspaceMatch = clean.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)\/workspace$/);
  if (workspaceMatch) {
    return { kind: 'episode-workspace', projectId: workspaceMatch[1], episodeId: workspaceMatch[2] };
  }

  const projectMatch = clean.match(/^\/projects\/([^/]+)\/(setup|assets|episodes)$/);
  if (!projectMatch) return { kind: 'home' };
  if (projectMatch[2] === 'setup') return { kind: 'project-setup', projectId: projectMatch[1] };
  if (projectMatch[2] === 'assets') return { kind: 'project-assets', projectId: projectMatch[1] };
  return { kind: 'project-episodes', projectId: projectMatch[1] };
}

function fmt(value?: string | null) {
  if (!value) return '暂无时间';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function sameCanvasContent(
  left: EpisodeWorkspace['content'] | StudioWorkspace['content'],
  right: EpisodeWorkspace['content'] | StudioWorkspace['content'],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stageEntry(stageConfig: StageConfigMap, stageKind: StageKind): StageConfig {
  return {
    capabilityId: STAGE_CAPABILITIES[stageKind],
    modelId: '',
    modelParams: {},
    reviewPolicyIds: [],
    ...(stageConfig[stageKind] || {}),
  };
}

function assetPrompt(asset: CanonicalAsset) {
  return asset.versions.find((item) => item.id === asset.currentVersionId)?.promptText || asset.versions[0]?.promptText || '';
}

function assetPreview(asset: CanonicalAsset) {
  return asset.versions.find((item) => item.id === asset.currentVersionId)?.previewUrl || asset.versions[0]?.previewUrl || '';
}

function currentAssetVersion(asset: CanonicalAsset): AssetVersion | null {
  return asset.versions.find((item) => item.id === asset.currentVersionId) || asset.versions[0] || null;
}

function assetVersionSourceLabel(version: AssetVersion) {
  const normalized = String(
    (version.sourcePayload as Record<string, unknown>)?.source
    || (version.metadata as Record<string, unknown>)?.source
    || 'manual',
  )
    .replace(/[_-]+/g, ' ')
    .trim();

  if (normalized === 'manual') return '手动';
  if (normalized === 'image prompt generate') return '图片提示词生成';
  if (normalized === 'asset extract') return '资产提取';
  if (normalized === 'character generate') return '人物预览生成';
  if (normalized === 'scene generate') return '场景预览生成';
  if (normalized === 'prop generate') return '道具预览生成';
  return normalized;
}

function assetVersionDisplay(asset: CanonicalAsset) {
  const version = currentAssetVersion(asset);
  if (!version) {
    return {
      versionId: null,
      versionNumber: null,
      versionLabel: 'manual',
    };
  }

  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    versionLabel: assetVersionSourceLabel(version) || 'manual',
  };
}

function nodeAssetVersionDisplay(node: CanvasNode | null | undefined) {
  const metadata = (node?.metadata || {}) as Record<string, unknown>;
  const numericVersion = Number(metadata.sourceVersionNumber);
  return {
    versionId: String(metadata.sourceVersionId || '').trim() || null,
    versionNumber: Number.isFinite(numericVersion) ? numericVersion : null,
    versionLabel: String(metadata.sourceVersionLabel || '').trim() || 'manual',
  };
}

function assetCapability(asset: CanonicalAsset) {
  if (asset.type === 'character') return 'character_generate';
  if (asset.type === 'scene') return 'scene_generate';
  if (asset.type === 'prop') return 'prop_generate';
  return null;
}

function reviewList(run: CapabilityRun | undefined): ReviewResult[] {
  return Array.isArray(run?.outputPayload?.reviews) ? (run.outputPayload.reviews as ReviewResult[]) : [];
}

function failedReviewList(run: CapabilityRun | undefined): ReviewResult[] {
  return reviewList(run).filter((review) => !review.passed);
}

function latestStageCapabilityRun(bundle: ProjectRunBundle, stageKind: StageKind): CapabilityRun | undefined {
  const latestWorkflowRun = bundle.workflowRuns
    .filter((item) => item.stageKind === stageKind)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0];

  if (!latestWorkflowRun?.capabilityRunId) {
    return undefined;
  }

  return bundle.capabilityRuns.find((item) => item.id === latestWorkflowRun.capabilityRunId);
}

function isRunningStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  return ['queued', 'pending', 'running', 'processing', 'claimed'].includes(normalized);
}

function formatRunStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'succeeded' || normalized === 'success') return '已完成';
  if (normalized === 'error' || normalized === 'failed') return '失败';
  if (normalized === 'cancelled' || normalized === 'canceled') return '已取消';
  if (normalized === 'queued') return '排队中';
  if (normalized === 'pending') return '等待中';
  if (normalized === 'running' || normalized === 'processing') return '运行中';
  if (!normalized) return '未知';
  return status || '未知';
}

function formatAssetTypeLabel(type: string) {
  if (type === 'character') return '人物';
  if (type === 'scene') return '场景';
  if (type === 'prop') return '道具';
  if (type === 'style') return '风格';
  return type;
}

function formatEpisodeStatus(status: string) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'ready') return '已就绪';
  if (normalized === 'generated') return '已生成';
  if (normalized === 'draft') return '草稿';
  if (normalized === 'pending') return '待处理';
  return status || '未知';
}

function formatReviewPolicyLabel(policyId?: string | null) {
  return REVIEW_POLICY_LABELS[String(policyId || '').trim()] || String(policyId || '').trim() || '未命名审查';
}

function formatCapabilityDisplayName(capability?: Pick<CapabilityDefinition, 'id' | 'name'> | null) {
  const capabilityId = String(capability?.id || '').trim();
  const knownLabelMap: Record<string, string> = {
    script_decompose: '剧本拆解',
    asset_extract: '资产提取',
    episode_expand: '单集扩写',
    storyboard_generate: '分镜生成',
    video_prompt_generate: '视频提示词生成',
    voice_prompt_generate: '配音提示词生成',
    video_generate: '视频生成',
    image_prompt_generate: '图片提示词生成',
    character_generate: '人物预览生成',
    scene_generate: '场景预览生成',
    prop_generate: '道具预览生成',
  };
  return knownLabelMap[capabilityId] || capability?.name || capabilityId || '未命名能力';
}

function formatMemberRoleLabel(role?: string | null) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'owner') return '所有者';
  if (normalized === 'admin') return '管理员';
  if (normalized === 'editor') return '编辑';
  return role || '成员';
}

function canCancelJimengShotJob(job: EpisodeShotJob | null | undefined) {
  if (!job) {
    return false;
  }

  const status = String(job.status || '').toUpperCase();
  const phase = String(job.phase || '').trim();
  return ['QUEUED', 'PENDING', 'CLAIMED'].includes(status) || phase.includes('排队');
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function estimateShotCount(text: string, index: number) {
  const punctuationWeight = (text.match(/[，。！？；:：]/g) || []).length;
  return Math.max(3, Math.min(13, punctuationWeight + 2 + (index % 3)));
}

function formatClipTime(seconds: number) {
  const clamped = Math.max(1, Math.min(59, seconds));
  return `00:${String(clamped).padStart(2, '0')}`;
}

function splitScriptSections(text: string) {
  return text
    .split(/\n{2,}|(?=【场景】)|(?=\d+\s*-\s*\d+)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildEpisodeSceneCards(episode: Episode | null, episodeContext: EpisodeContext | null, storyboardText: string) {
  const storyboardBeats = asStringArray((episodeContext?.content as Record<string, unknown> | undefined)?.storyboardBeats);
  const sourceSegments = splitScriptSections(episode?.sourceText || episode?.synopsis || '');
  const sceneSeeds = storyboardBeats.length > 0 ? storyboardBeats : sourceSegments.slice(0, 6);

  return sceneSeeds.map((item, index) => {
    const shotCount = estimateShotCount(item, index);
    return {
      id: `${episode?.id || 'episode'}-scene-${index + 1}`,
      title: `${episode?.episodeNumber || 1}-${index + 1}`,
      summary: item,
      shotCount,
      durationLabel: formatClipTime(Math.max(3, Math.min(shotCount, 10))),
    };
  });
}

function isVideoSource(value: string) {
  return /^data:video\/[\w.+-]+;base64,/i.test(value) || /^https?:\/\//i.test(value);
}

function HealthBadge({ health }: { health: { server: boolean; database: boolean; databaseHost: string } | null }) {
  if (!health) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full px-2 py-1 text-xs', health.server ? 'bg-emerald-300/15 text-emerald-100' : 'bg-red-400/15 text-red-100')}>
          服务端 {health.server ? '正常' : '异常'}
        </span>
        <span className={cx('rounded-full px-2 py-1 text-xs', health.database ? 'bg-emerald-300/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100')}>
          数据库 {health.database ? '就绪' : '不可用'}
        </span>
      </div>
      <div className="mt-2 text-xs text-white/45">{health.databaseHost}</div>
    </div>
  );
}

export const App = () => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ server: boolean; database: boolean; databaseHost: string } | null>(null);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectTitle, setProjectTitle] = useState('');

  const [catalogs, setCatalogs] = useState<{
    capabilities: CapabilityDefinition[];
    models: ModelDefinition[];
    skillPacks: SkillPack[];
    reviewPolicies: ReviewPolicy[];
  }>({
    capabilities: [],
    models: [],
    skillPacks: [],
    reviewPolicies: [],
  });

  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectRuns, setProjectRuns] = useState<ProjectRunBundle>(EMPTY_RUNS);
  const [stageConfig, setStageConfig] = useState<StageConfigMap>({});
  const [assets, setAssets] = useState<CanonicalAsset[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const [setupDraft, setSetupDraft] = useState({
    aspectRatio: '9:16',
    styleSummary: '',
    targetMedium: '漫剧',
    globalPromptsText: '',
  });
  const [scriptText, setScriptText] = useState('');
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [latestScriptSource, setLatestScriptSource] = useState<ScriptSource | null>(null);
  const latestScriptSourceRef = React.useRef<ScriptSource | null>(null);
  const [memberForm, setMemberForm] = useState({ email: '', role: 'editor' as 'owner' | 'admin' | 'editor' });
  const [assetForm, setAssetForm] = useState({
    type: 'character' as 'character' | 'scene' | 'prop' | 'style',
    name: '',
    description: '',
    promptText: '',
  });
  const [assetFilterType, setAssetFilterType] = useState<'character' | 'scene' | 'prop' | 'style'>('character');
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [assetVersionDrawerAssetId, setAssetVersionDrawerAssetId] = useState<string | null>(null);
  const [assetVersionCompareIds, setAssetVersionCompareIds] = useState<Record<string, { leftId: string | null; rightId: string | null }>>({});
  const [assetVersionSwitchId, setAssetVersionSwitchId] = useState<string | null>(null);

  const [episodeContext, setEpisodeContext] = useState<EpisodeContext | null>(null);
  const [episodeWorkspace, setEpisodeWorkspace] = useState<EpisodeWorkspace | null>(null);
  const [episodeRuns, setEpisodeRuns] = useState<ProjectRunBundle>(EMPTY_RUNS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [episodeWorkspaceSaveState, setEpisodeWorkspaceSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [episodeWorkspaceSavedAt, setEpisodeWorkspaceSavedAt] = useState<string | null>(null);
  const episodeWorkspaceRef = React.useRef<EpisodeWorkspace | null>(null);
  const routeRef = React.useRef<Route>(route);
  const inFlightActionKeysRef = React.useRef<Set<string>>(new Set());
  const [inFlightActionKeys, setInFlightActionKeys] = useState<string[]>([]);

  const [studioWorkspaces, setStudioWorkspaces] = useState<StudioWorkspace[]>([]);
  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState<string | null>(null);
  const studioWorkspacesRef = React.useRef<StudioWorkspace[]>([]);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [projectCreating, setProjectCreating] = useState(false);
  const [scriptSourceSaving, setScriptSourceSaving] = useState(false);
  const [projectSetupSaving, setProjectSetupSaving] = useState(false);
  const [scriptDecomposeRunning, setScriptDecomposeRunning] = useState(false);
  const [assetCreating, setAssetCreating] = useState(false);

  const activeStudio = useMemo(
    () => studioWorkspaces.find((item) => item.id === activeStudioId) || null,
    [studioWorkspaces, activeStudioId],
  );

  useEffect(() => {
    episodeWorkspaceRef.current = episodeWorkspace;
  }, [episodeWorkspace]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    setRunLogOpen(false);
  }, [route.kind]);

  useEffect(() => {
    studioWorkspacesRef.current = studioWorkspaces;
  }, [studioWorkspaces]);

  useEffect(() => {
    latestScriptSourceRef.current = latestScriptSource;
  }, [latestScriptSource]);

  const getCapabilityDefinition = (capabilityId: string) => selectCapability(catalogs.capabilities, capabilityId);
  const getCapabilityModels = (capabilityId: string) => selectAllowedModels(catalogs.models, getCapabilityDefinition(capabilityId));
  const getResolvedCapabilityModelId = (capabilityId: string, preferredModelId?: string) =>
    resolveCapabilityModelId(catalogs.models, getCapabilityDefinition(capabilityId), preferredModelId);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  };

  const startActionLock = (key: string) => {
    if (inFlightActionKeysRef.current.has(key)) {
      return false;
    }

    inFlightActionKeysRef.current.add(key);
    setInFlightActionKeys(Array.from(inFlightActionKeysRef.current));
    return true;
  };

  const finishActionLock = (key: string) => {
    if (!inFlightActionKeysRef.current.has(key)) {
      return;
    }

    inFlightActionKeysRef.current.delete(key);
    setInFlightActionKeys(Array.from(inFlightActionKeysRef.current));
  };

  const isActionLocked = (key: string) => inFlightActionKeys.includes(key);

  const loadCatalogs = async () => {
    const [modelsRes, capabilitiesRes, skillsRes, reviewsRes] = await Promise.all([
      appApi.listModels(),
      appApi.listCapabilities(),
      appApi.listSkillPacks(),
      appApi.listReviewPolicies(),
    ]);
    if (!modelsRes.success || !capabilitiesRes.success || !skillsRes.success || !reviewsRes.success) {
      throw new Error(modelsRes.error || capabilitiesRes.error || skillsRes.error || reviewsRes.error || '加载模型与能力目录失败。');
    }
    setCatalogs({
      capabilities: capabilitiesRes.data || [],
      models: modelsRes.data || [],
      skillPacks: skillsRes.data || [],
      reviewPolicies: reviewsRes.data || [],
    });
  };

  const loadHealth = async () => {
    const res = await appApi.health();
    if (res.success && res.data) {
      setHealth(res.data);
    }
  };

  const loadProjects = async () => {
    const res = await appApi.listProjects();
    if (!res.success || !res.data) throw new Error(res.error || '加载项目列表失败。');
    setProjects(res.data);
  };

  const loadProject = async (projectId: string) => {
    const [projectRes, setupRes, assetsRes, episodesRes, stageRes, membersRes, runsRes] = await Promise.all([
      appApi.getProject(projectId),
      appApi.getProjectSetup(projectId),
      appApi.listAssets(projectId),
      appApi.listEpisodes(projectId),
      appApi.getStageConfig(projectId),
      appApi.listProjectMembers(projectId),
      appApi.listProjectRuns(projectId),
    ]);
    if (!projectRes.success || !projectRes.data) throw new Error(projectRes.error || '加载项目详情失败。');

    const setup = setupRes.data?.setup || projectRes.data.setup;
    const nextLatestScriptSource = setupRes.data?.latestScriptSource || null;
    const previousScriptContent = latestScriptSourceRef.current?.contentText?.trim() || '';
    const nextScriptContent = nextLatestScriptSource?.contentText?.trim() || '';
    setProjectDetail(projectRes.data);
    setProjectMembers(membersRes.data || projectRes.data.members || []);
    setProjectRuns(runsRes.data || EMPTY_RUNS);
    setStageConfig(stageRes.data || setup?.stageConfig || {});
    setAssets(assetsRes.data || []);
    setEpisodes(episodesRes.data || []);
    setLatestScriptSource(nextLatestScriptSource);
    setSetupDraft({
      aspectRatio: setup?.aspectRatio || '9:16',
      styleSummary: setup?.styleSummary || '',
      targetMedium: setup?.targetMedium || '漫剧',
      globalPromptsText: (setup?.globalPrompts || []).join('\n'),
    });
    setScriptText((current) => {
      const normalizedCurrent = current.trim();
      if (!normalizedCurrent || normalizedCurrent === previousScriptContent) {
        return nextScriptContent;
      }
      return current;
    });
  };

  const loadEpisode = async (projectId: string, episodeId: string) => {
    const [contextRes, workspaceRes, runsRes] = await Promise.all([
      appApi.getEpisodeContext(episodeId),
      appApi.getEpisodeWorkspace(episodeId),
      appApi.listProjectRuns(projectId, episodeId),
    ]);
    setEpisodeContext(contextRes.data || null);
    setEpisodeWorkspace(workspaceRes.data || null);
    setEpisodeRuns(runsRes.data || EMPTY_RUNS);
    setSelectedNodeId(workspaceRes.data?.content.nodes?.[0]?.id || null);
    setEpisodeWorkspaceSaveState(workspaceRes.data ? 'saved' : 'idle');
    setEpisodeWorkspaceSavedAt(workspaceRes.data?.updatedAt || null);
  };

  const loadStudio = async () => {
    const res = await appApi.listStudioWorkspaces();
    if (!res.success || !res.data) throw new Error(res.error || '加载画布沙盒失败。');
    setStudioWorkspaces(res.data);
    const nextId = activeStudioId && res.data.some((item) => item.id === activeStudioId) ? activeStudioId : res.data[0]?.id || null;
    setActiveStudioId(nextId);
    setSelectedStudioNodeId(res.data.find((item) => item.id === nextId)?.content.nodes?.[0]?.id || null);
  };

  const refreshRouteState = async (targetRoute: Route) => {
    await loadHealth().catch(() => undefined);
    if ('projectId' in targetRoute) {
      await Promise.all([loadProject(targetRoute.projectId), loadProjects()]);
      if (targetRoute.kind === 'episode-workspace' || targetRoute.kind === 'episode-scenes') {
        await loadEpisode(targetRoute.projectId, targetRoute.episodeId);
      }
      return;
    }
    if (targetRoute.kind === 'studio') {
      await loadStudio();
      return;
    }
    await loadProjects();
  };

  const refreshCurrent = async () => refreshRouteState(route);
  const refreshLatestRoute = async () => refreshRouteState(routeRef.current);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const boot = async () => {
      setCheckingAuth(true);
      try {
        await loadHealth().catch(() => undefined);
        const me = await appApi.me();
        if (me.success && me.data) {
          setUser(me.data);
          await Promise.all([loadCatalogs(), loadProjects()]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '启动工作流失败。');
      } finally {
        setCheckingAuth(false);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    if (!user) return;
    const run = async () => {
      try {
        setError(null);
        if ('projectId' in route) {
          await loadProject(route.projectId);
          if (route.kind === 'episode-workspace' || route.kind === 'episode-scenes') {
            await loadEpisode(route.projectId, route.episodeId);
          }
        } else if (route.kind === 'studio') {
          await loadStudio();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载当前页面失败。');
      }
    };
    void run();
  }, [route, user]);

  const runCapability = async (payload: Record<string, unknown>, fallbackMessage: string) => {
    const res = await appApi.runCapability(payload);
    if (!res.success) throw new Error(res.error || fallbackMessage);
    await refreshCurrent();
    return res.data || null;
  };

  const persistProjectScriptSource = async (options: { requireContent?: boolean } = {}) => {
    if (route.kind !== 'project-setup') {
      return null;
    }

    const draftText = scriptText.trim();
    const storedText = latestScriptSourceRef.current?.contentText?.trim() || '';
    const hasPendingFile = Boolean(scriptFile);
    const hasUnsavedText = Boolean(draftText) && draftText !== storedText;

    if (!hasPendingFile && !hasUnsavedText) {
      if (options.requireContent && !storedText) {
        throw new Error('请先粘贴剧本文本或上传剧本文件。');
      }
      return latestScriptSourceRef.current;
    }

    if (!hasPendingFile && !draftText && options.requireContent) {
      throw new Error('请先粘贴剧本文本或上传剧本文件。');
    }

    setScriptSourceSaving(true);
    try {
      const res = await appApi.uploadScriptSource(route.projectId, { textContent: draftText, file: scriptFile });
      if (!res.success || !res.data) {
        throw new Error(res.error || '保存剧本失败。');
      }
      setLatestScriptSource(res.data);
      setScriptText(res.data.contentText || draftText);
      setScriptFile(null);
      await loadProject(route.projectId);
      await loadProjects();
      return res.data;
    } finally {
      setScriptSourceSaving(false);
    }
  };

  const saveCurrentEpisodeWorkspace = async (): Promise<EpisodeWorkspace | null> => {
    if (route.kind !== 'episode-workspace' || !episodeWorkspace) {
      return episodeWorkspace;
    }

    if (episodeWorkspaceSaveState !== 'dirty') {
      return episodeWorkspace;
    }

    return saveEpisodeWorkspaceContent(episodeWorkspace.content);
  };

  const runEpisodeWorkspaceCapability = async (
    actionKey: string,
    buildPayload: (workspace: EpisodeWorkspace | null) => Record<string, unknown>,
    fallbackMessage: string,
  ) => {
    if (route.kind !== 'episode-workspace') {
      return;
    }

    if (!startActionLock(actionKey)) {
      return;
    }

    try {
      const syncedWorkspace = await saveCurrentEpisodeWorkspace();
      await runCapability(buildPayload(syncedWorkspace), fallbackMessage);
    } finally {
      finishActionLock(actionKey);
    }
  };

  const resolveAssetPromptText = (asset: CanonicalAsset) => assetPrompt(asset);

  const toggleAssetVersions = (asset: CanonicalAsset) => {
    setExpandedAssetId(asset.id);
    setAssetVersionDrawerAssetId((current) => current === asset.id ? null : asset.id);
    setAssetVersionCompareIds((current) => {
      if (current[asset.id]) {
        return current;
      }

      const currentVersion = currentAssetVersion(asset);
      const alternateVersion = asset.versions.find((item) => item.id !== currentVersion?.id) || currentVersion;
      return {
        ...current,
        [asset.id]: {
          leftId: currentVersion?.id || null,
          rightId: alternateVersion?.id || currentVersion?.id || null,
        },
      };
    });
  };

  const setAssetCompareSlot = (
    assetId: string,
    slot: 'leftId' | 'rightId',
    versionId: string,
  ) => {
    setAssetVersionCompareIds((current) => ({
      ...current,
      [assetId]: {
        leftId: current[assetId]?.leftId || null,
        rightId: current[assetId]?.rightId || null,
        [slot]: versionId,
      },
    }));
  };

  const setAssetCurrentVersionSelection = async (asset: CanonicalAsset, versionId: string) => {
    if (route.kind !== 'project-assets') {
      return;
    }

    setAssetVersionSwitchId(versionId);
    try {
      const res = await appApi.setAssetCurrentVersion(asset.id, { versionId });
      if (!res.success) {
        throw new Error(res.error || '设置当前资产版本失败。');
      }
      await refreshCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置当前资产版本失败。');
    } finally {
      setAssetVersionSwitchId(null);
    }
  };

  const uploadAudioReference = async (file: File) => {
    const res = await appApi.uploadAudioReference(file);
    if (!res.success || !res.data) {
      throw new Error(res.error || '上传音频参考失败。');
    }

    return {
      url: res.data.url,
      title: file.name ? `音频参考 · ${file.name}` : `音频参考 · ${res.data.name}`,
    };
  };

  const buildEpisodeWorkbenchState = (
    content: EpisodeWorkspace['content'],
    episode: Episode,
    promptRecipeId?: string,
  ) => {
    const lockedAssets = assets.filter((asset) => asset.isLocked);
    const nextContent = harmonizeEpisodeWorkbenchContent({
      content,
      episode,
      lockedAssets,
      models: catalogs.models,
      stageConfig,
      promptRecipeId,
    });
    const storyboardNodeText = nextContent.nodes.find((item) => item.id === getEpisodePrimaryNodeId('storyboard', episode.id))?.content || '';
    const promptNodeText = nextContent.nodes.find((item) => item.id === getEpisodePrimaryNodeId('prompt', episode.id))?.content || '';

    return syncEpisodeWorkspaceContent({
      ...nextContent,
      shotStrip: buildEpisodeShotStrip({
        episode,
        episodeContext,
        storyboardText: storyboardNodeText,
        videoPromptText: promptNodeText,
        currentStrip: nextContent.shotStrip as EpisodeShotStripState | null | undefined,
      }),
    }, catalogs.models, stageConfig, {
      topLevelIsAuthoritative: true,
    });
  };

  useEffect(() => {
    if (catalogs.models.length === 0) {
      return;
    }

    setEpisodeWorkspace((current) => {
      if (!current) {
        return current;
      }

      const normalizedContent = syncEpisodeWorkspaceContent(current.content, catalogs.models, stageConfig, {
        topLevelIsAuthoritative: true,
      });
      if (JSON.stringify(normalizedContent) === JSON.stringify(current.content)) {
        return current;
      }

      return {
        ...current,
        content: normalizedContent,
      };
    });

    setStudioWorkspaces((current) => current.map((workspace) => {
      const normalizedContent = normalizeCanvasContent(workspace.content, catalogs.models, stageConfig);
      if (JSON.stringify(normalizedContent) === JSON.stringify(workspace.content)) {
        return workspace;
      }

      return {
        ...workspace,
        content: normalizedContent,
      };
    }));
  }, [catalogs.models, stageConfig]);

  useEffect(() => {
    if (route.kind !== 'episode-workspace' || !episodeWorkspace || catalogs.models.length === 0) {
      return;
    }

    const currentEpisode = episodes.find((item) => item.id === route.episodeId) || null;
    if (!currentEpisode) {
      return;
    }

    const nextContent = buildEpisodeWorkbenchState(
      episodeWorkspace.content,
      currentEpisode,
      stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
    );

    if (sameCanvasContent(nextContent, episodeWorkspace.content)) {
      return;
    }

    setEpisodeWorkspace((current) => current ? {
      ...current,
      content: nextContent,
    } : current);
    setEpisodeWorkspaceSaveState((current) => {
      if (current === 'saving' || current === 'dirty') {
        return current;
      }
      return 'saved';
    });
    setSelectedNodeId((current) => {
      if (current && nextContent.nodes.some((node) => node.id === current)) {
        return current;
      }

      return nextContent.nodes.find((node) => node.id === getEpisodePrimaryNodeId('prompt', route.episodeId))?.id
        || nextContent.nodes[0]?.id
        || null;
    });
  }, [buildEpisodeWorkbenchState, catalogs.models, episodeWorkspace, episodes, route, stageConfig]);

  useEffect(() => {
    if (route.kind !== 'episode-workspace' || episodeWorkspaceSaveState !== 'dirty' || !episodeWorkspace) {
      return;
    }

    const timer = window.setTimeout(() => {
      const latestWorkspace = episodeWorkspaceRef.current;
      if (!latestWorkspace) {
        return;
      }

      void saveEpisodeWorkspaceContent(latestWorkspace.content).catch((err) => {
        setError(err instanceof Error ? err.message : '自动保存工作台失败。');
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [episodeWorkspace, episodeWorkspaceSaveState, route]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const hasRunningProjectRun = projectRuns.workflowRuns.some((run) => isRunningStatus(run.status))
      || projectRuns.capabilityRuns.some((run) => isRunningStatus(run.status));
    const hasRunningEpisodeRun = episodeRuns.workflowRuns.some((run) => isRunningStatus(run.status))
      || episodeRuns.capabilityRuns.some((run) => isRunningStatus(run.status));

    const shouldPoll =
      route.kind === 'project-setup'
        ? scriptDecomposeRunning || hasRunningProjectRun
        : route.kind === 'project-assets' || route.kind === 'project-episodes'
          ? hasRunningProjectRun
          : route.kind === 'episode-scenes' || route.kind === 'episode-workspace'
            ? hasRunningEpisodeRun
            : false;

    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      if (routeRef.current.kind === 'episode-workspace' && episodeWorkspaceSaveState === 'dirty') {
        return;
      }
      void refreshLatestRoute().catch((err) => {
        setError(err instanceof Error ? err.message : '刷新运行状态失败。');
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [user, route, scriptDecomposeRunning, projectRuns, episodeRuns, episodeWorkspaceSaveState]);

  const updateNodeInContent = <T extends EpisodeWorkspace['content'] | StudioWorkspace['content']>(
    content: T,
    nodeId: string,
    patch: Partial<CanvasNode>,
  ): T => ({
    ...content,
    nodes: (content.nodes || []).map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    connections: Array.isArray(content.connections) ? content.connections : [],
  } as T);

  const updateEpisodeWorkspaceDraft = (
    buildNextContent: (content: EpisodeWorkspace['content']) => EpisodeWorkspace['content'],
    options?: { selectedNodeId?: string | null; markDirty?: boolean },
  ) => {
    const currentWorkspace = episodeWorkspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    const nextContent = syncEpisodeWorkspaceContent(
      buildNextContent(currentWorkspace.content),
      catalogs.models,
      stageConfig,
      {
        topLevelIsAuthoritative: true,
      },
    );
    if (!sameCanvasContent(nextContent, currentWorkspace.content)) {
      setEpisodeWorkspace((current) => current ? {
        ...current,
        content: nextContent,
      } : current);
      if (options?.markDirty !== false) {
        setEpisodeWorkspaceSaveState('dirty');
      }
    }
    if (options?.selectedNodeId !== undefined) {
      setSelectedNodeId(options.selectedNodeId);
    }
  };

  const saveEpisodeWorkspaceContent = async (nextContent?: EpisodeWorkspace['content']) => {
    if (route.kind !== 'episode-workspace' || !episodeWorkspace) {
      return episodeWorkspace;
    }

    const contentToSave = syncEpisodeWorkspaceContent(nextContent || episodeWorkspace.content, catalogs.models, stageConfig, {
      topLevelIsAuthoritative: true,
    });
    setEpisodeWorkspaceSaveState('saving');
    const res = await appApi.saveEpisodeWorkspace(route.episodeId, contentToSave);
    if (!res.success || !res.data) {
      setEpisodeWorkspaceSaveState('dirty');
      throw new Error(res.error || '保存单集工作台失败。');
    }

    setEpisodeWorkspace({
      ...res.data,
      content: syncEpisodeWorkspaceContent(res.data.content, catalogs.models, stageConfig, {
        topLevelIsAuthoritative: true,
      }),
    });
    setEpisodeWorkspaceSaveState('saved');
    setEpisodeWorkspaceSavedAt(res.data.updatedAt || new Date().toISOString());
    return res.data;
  };

  const saveStudioWorkspaceContent = async (workspaceId: string, nextContent?: StudioWorkspace['content']) => {
    const currentWorkspace = studioWorkspaces.find((item) => item.id === workspaceId) || null;
    if (!currentWorkspace) {
      throw new Error('未找到画布沙盒。');
    }

    const contentToSave = normalizeCanvasContent(nextContent || currentWorkspace.content, catalogs.models, stageConfig);
    const res = await appApi.saveStudioWorkspace(workspaceId, { content: contentToSave });
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Save studio failed.');
    }

    const normalizedWorkspace = {
      ...res.data,
      content: normalizeCanvasContent(res.data.content, catalogs.models, stageConfig),
    };
    setStudioWorkspaces((current) => current.map((item) => (item.id === workspaceId ? normalizedWorkspace : item)));
    return normalizedWorkspace;
  };

  const buildEpisodeShotJobState = (params: {
    sourceNodeId: string;
    providerJobId?: string | null;
    status: string;
    phase?: string;
    progress?: number;
    error?: string | null;
    updatedAt?: string | null;
    previewUrl?: string;
  }) => ({
    sourceNodeId: params.sourceNodeId,
    providerJobId: params.providerJobId || null,
    status: params.status,
    phase: params.phase,
    progress: params.progress,
    error: params.error || null,
    updatedAt: params.updatedAt || new Date().toISOString(),
    previewUrl: params.previewUrl,
  });

  const applyJimengJobPatchToNode = (node: CanvasNode | null, job: JimengJob): Partial<CanvasNode> => ({
    output: {
      ...(node?.output || {}),
      providerJobId: job.id,
      previewUrl: job.videoUrl,
      metadata: {
        ...((node?.output?.metadata || {}) as Record<string, unknown>),
        provider: 'jimeng',
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      },
    },
    runStatus: job.status === 'SUCCEEDED' ? 'success' : job.status === 'FAILED' || job.status === 'CANCELLED' ? 'error' : 'running',
    error: job.error || null,
    lastRunAt: job.updated_at || new Date().toISOString(),
    ...(job.videoUrl ? { content: job.videoUrl } : {}),
  });

  const pollJimengNodeJob = async (
    workspaceKind: 'episode' | 'studio',
    nodeId: string,
    jobId: string,
    workspaceRefId?: string,
    targetShotId?: string | null,
  ) => {
    for (;;) {
      const jobRes = await appApi.getJimengJob(jobId);
      if (!jobRes.success || !jobRes.data) {
        throw new Error(jobRes.error || '获取即梦任务状态失败。');
      }

      const job = jobRes.data;

      if (workspaceKind === 'episode') {
        let nextEpisodeContent: EpisodeWorkspace['content'] | null = null;
        let shouldIgnoreUpdate = false;
        setEpisodeWorkspace((current) => {
          if (!current) {
            return current;
          }

          const currentNode = current.content.nodes.find((item) => item.id === nodeId) || null;
          const currentProviderJobId = typeof currentNode?.output?.providerJobId === 'string'
            ? currentNode.output.providerJobId
            : null;
          if (currentProviderJobId && currentProviderJobId !== job.id) {
            shouldIgnoreUpdate = true;
            return current;
          }

          const nextContent = updateNodeInContent(current.content, nodeId, applyJimengJobPatchToNode(currentNode, job));
          const nextShotStrip = targetShotId
            ? upsertEpisodeShotJob({
                strip: nextContent.shotStrip as EpisodeShotStripState | undefined,
                targetShotId,
                job: buildEpisodeShotJobState({
                  sourceNodeId: nodeId,
                  providerJobId: job.id,
                  status: job.status,
                  phase: job.phase,
                  progress: job.progress,
                  error: job.error,
                  updatedAt: job.updated_at,
                  previewUrl: job.videoUrl,
                }),
              })
            : nextContent.shotStrip;
          nextEpisodeContent = targetShotId
            ? {
                ...nextContent,
                shotStrip: nextShotStrip,
              }
            : nextContent;
          nextEpisodeContent = syncEpisodeWorkspaceContent(nextEpisodeContent, catalogs.models, stageConfig, {
            topLevelIsAuthoritative: true,
          });
          return {
            ...current,
            content: nextEpisodeContent,
          };
        });

        if (shouldIgnoreUpdate) {
          return;
        }

        if ((job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') && nextEpisodeContent) {
          await saveEpisodeWorkspaceContent(
            normalizeCanvasContent(nextEpisodeContent, catalogs.models, stageConfig),
          );
          return;
        }
      } else if (workspaceRefId) {
        let shouldIgnoreUpdate = false;
        setStudioWorkspaces((current) => current.map((item) => {
          if (item.id !== workspaceRefId) {
            return item;
          }

          const currentNode = item.content.nodes.find((entry) => entry.id === nodeId) || null;
          const currentProviderJobId = typeof currentNode?.output?.providerJobId === 'string'
            ? currentNode.output.providerJobId
            : null;
          if (currentProviderJobId && currentProviderJobId !== job.id) {
            shouldIgnoreUpdate = true;
            return item;
          }

          return {
            ...item,
            content: updateNodeInContent(item.content, nodeId, applyJimengJobPatchToNode(currentNode, job)),
          };
        }));
        if (shouldIgnoreUpdate) {
          return;
        }
      }

      if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        if (workspaceKind !== 'episode' && workspaceRefId) {
          const currentStudio = studioWorkspacesRef.current.find((item) => item.id === workspaceRefId) || null;
          if (currentStudio) {
            await saveStudioWorkspaceContent(
              workspaceRefId,
              updateNodeInContent(
                currentStudio.content,
                nodeId,
                applyJimengJobPatchToNode(
                  currentStudio.content.nodes.find((entry) => entry.id === nodeId) || null,
                  job,
                ),
              ),
            );
          }
        }
        return;
      }

      await sleep(3000);
    }
  };

  const runEpisodeCanvasNode = async (nodeId: string, targetShotIdOverride?: string | null) => {
    if (route.kind !== 'episode-workspace' || !episodeWorkspace) {
      return;
    }

    const actionKey = `episode-node:${nodeId}`;
    if (!startActionLock(actionKey)) {
      return;
    }

    try {
      const currentEpisode = episodes.find((item) => item.id === route.episodeId) || null;
      const lockedAssets = assets.filter((asset) => asset.isLocked);
      const videoPromptStage = stageEntry(stageConfig, 'video_prompt_generate');
      const syncedContent = currentEpisode
        ? harmonizeEpisodeWorkbenchContent({
            content: episodeWorkspace.content,
            episode: currentEpisode,
            lockedAssets,
            models: catalogs.models,
            stageConfig,
            promptRecipeId: videoPromptStage.promptRecipeId,
          })
        : episodeWorkspace.content;
      const snapshot = normalizeCanvasContent(syncedContent, catalogs.models, stageConfig);
      const sourceNode = snapshot.nodes.find((item) => item.id === nodeId) || null;
      const targetShotId = sourceNode?.type === 'video'
        ? targetShotIdOverride || findSelectedEpisodeShot(snapshot.shotStrip as EpisodeShotStripState | undefined)?.id || null
        : null;
      const res = await appApi.runCanvasNode({
        workspaceKind: 'episode',
        episodeId: route.episodeId,
        nodeId,
        content: snapshot,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || '节点运行失败。');
      }

      const normalizedContent = normalizeCanvasContent(res.data?.content, catalogs.models, stageConfig);
      const normalizedNode = normalizedContent.nodes.find((item) => item.id === nodeId) || sourceNode;
      const nextContent = syncEpisodeWorkspaceContent(targetShotId
        ? {
            ...normalizedContent,
            shotStrip: upsertEpisodeShotJob({
              strip: normalizedContent.shotStrip as EpisodeShotStripState | undefined,
              targetShotId,
              job: buildEpisodeShotJobState({
                sourceNodeId: nodeId,
                providerJobId: res.data.providerJob?.id || normalizedNode?.output?.providerJobId || null,
                status: res.data.pending
                  ? String(res.data.providerJob?.status || 'RUNNING')
                  : normalizedNode?.runStatus === 'error'
                    ? 'FAILED'
                    : 'SUCCEEDED',
                phase: res.data.pending
                  ? String(res.data.providerJob?.phase || '排队中')
                  : normalizedNode?.runStatus === 'success'
                    ? '已完成'
                    : undefined,
                progress: typeof res.data.providerJob?.progress === 'number' ? res.data.providerJob.progress : undefined,
                error: res.data.providerJob?.error || normalizedNode?.error || null,
                previewUrl: res.data.providerJob?.videoUrl || getNodePrimaryValue(normalizedNode || sourceNode),
              }),
            }),
          }
        : normalizedContent, catalogs.models, stageConfig, {
          topLevelIsAuthoritative: true,
        });

      setEpisodeWorkspace((current) => current ? {
        ...current,
        content: nextContent,
      } : current);
      setEpisodeWorkspaceSaveState('saved');
      setEpisodeWorkspaceSavedAt(new Date().toISOString());

      if (res.data.pending && res.data.providerJob?.id) {
        await pollJimengNodeJob('episode', nodeId, res.data.providerJob.id, undefined, targetShotId);
      }
    } finally {
      finishActionLock(actionKey);
    }
  };

  const runStudioCanvasNode = async (workspaceId: string, nodeId: string) => {
    const currentStudio = studioWorkspaces.find((item) => item.id === workspaceId) || null;
    if (!currentStudio) {
      throw new Error('未找到画布沙盒。');
    }

    const snapshot = normalizeCanvasContent(currentStudio.content, catalogs.models, stageConfig);
    const res = await appApi.runCanvasNode({
      workspaceKind: 'studio',
      workspaceId,
      nodeId,
      content: snapshot,
    });
    if (!res.success || !res.data) {
      throw new Error(res.error || '节点运行失败。');
    }

    setStudioWorkspaces((current) => current.map((item) => item.id === workspaceId ? {
      ...item,
      content: normalizeCanvasContent(res.data?.content, catalogs.models, stageConfig),
    } : item));

    if (res.data.pending && res.data.providerJob?.id) {
      await pollJimengNodeJob('studio', nodeId, res.data.providerJob.id, workspaceId);
    }
  };

  const renderRuns = (runs: ProjectRunBundle, stageKinds?: string[]) => {
    const workflowRuns = stageKinds
      ? runs.workflowRuns.filter((item) => stageKinds.includes(item.stageKind as StageKind))
      : runs.workflowRuns;
    const capabilityMap = new Map(runs.capabilityRuns.map((item) => [item.id, item]));

    if (workflowRuns.length === 0) {
      return <div className="text-sm text-slate-300">暂无运行记录。</div>;
    }

    return (
      <div className="grid gap-3">
        {workflowRuns.map((run) => {
          const linkedRun = run.capabilityRunId ? capabilityMap.get(run.capabilityRunId) : undefined;
          return (
            <div key={run.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">{STAGE_LABELS[run.stageKind as StageKind] || run.stageKind}</div>
                  <div className="mt-1 text-xs text-white/45">{fmt(run.updatedAt)}</div>
                </div>
                <div className={cx(
                  'rounded-full border px-3 py-1 text-xs',
                  run.status === 'error'
                    ? 'border-red-400/20 bg-red-400/10 text-red-100'
                    : run.status === 'completed'
                      ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-200',
                )}>
                  {formatRunStatus(run.status)}
                </div>
              </div>
              {linkedRun?.error ? <div className="mt-3 text-sm text-red-200">{linkedRun.error}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {reviewList(linkedRun).map((review) => (
                  <div key={`${review.policyId}-${review.notes}`} className={cx(
                    'rounded-full border px-3 py-1 text-xs',
                    review.passed
                      ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                      : 'border-red-400/20 bg-red-400/10 text-red-100',
                  )}>
                    {formatReviewPolicyLabel(review.policyId)}
                  </div>
                ))}
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
                  {linkedRun?.outputPayload?.usedLiveModel ? '实时模型' : '兜底输出'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAuth = () => (
    <AppShell
      title="添梯工作流"
      subtitle="项目工作流负责项目、资产和剧集主链，画布沙盒保持独立试验空间。"
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card eyebrow="主流程" title="工作流主链">
          <div className="grid gap-3">
            {[
              '上传剧本并创建项目',
              '运行 Seedance 剧本拆解',
              '锁定人物、场景、道具资产',
              '进入单集工作台按本集上下文生成',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card eyebrow="账号" title={authMode === 'login' ? '登录' : '注册'}>
          <HealthBadge health={health} />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (authSubmitting) return;
              setError(null);
              setAuthSubmitting(true);
              try {
                const res = authMode === 'login'
                  ? await appApi.login({ email: authForm.email, password: authForm.password })
                  : await appApi.register({ email: authForm.email, password: authForm.password, name: authForm.name });
                if (!res.success || !res.data) {
                  setError(res.error || '登录失败。');
                  return;
                }
                setUser(res.data);
                await Promise.all([loadCatalogs(), loadProjects()]);
              } finally {
                setAuthSubmitting(false);
              }
            }}
          >
            {authMode === 'register' ? (
              <input
                value={authForm.name}
                onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                placeholder="姓名"
                autoComplete="name"
              />
            ) : null}
            <input
              value={authForm.email}
              onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
              placeholder="邮箱"
              autoComplete="email"
            />
            <input
              type="password"
              value={authForm.password}
              onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
              placeholder="密码"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            />
            {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
            <button disabled={authSubmitting} className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60">
              {authSubmitting ? (authMode === 'login' ? '登录中...' : '注册中...') : (authMode === 'login' ? '登录' : '创建账号')}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setAuthMode((current) => (current === 'login' ? 'register' : 'login'))}
            className="mt-4 text-sm text-cyan-200"
          >
            {authMode === 'login' ? '还没有账号？去注册' : '已经有账号了？去登录'}
          </button>
        </Card>
      </div>
    </AppShell>
  );

  const renderHome = () => (
    <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
      <Card eyebrow="创建" title="新建项目">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (projectCreating) return;
            try {
              setProjectCreating(true);
              const res = await appApi.createProject({ title: projectTitle.trim() });
              if (!res.success || !res.data) throw new Error(res.error || '创建项目失败。');
              setProjectTitle('');
              await loadProjects();
              navigate(`/projects/${res.data.id}/setup`);
            } catch (err) {
              setError(err instanceof Error ? err.message : '创建项目失败。');
            } finally {
              setProjectCreating(false);
            }
          }}
        >
          <input
            value={projectTitle}
            onChange={(event) => setProjectTitle(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
            placeholder="项目名称"
          />
          <button disabled={projectCreating} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={16} />
            {projectCreating ? '创建中...' : '创建项目'}
          </button>
        </form>
      </Card>

      <Card eyebrow="项目" title="我的项目">
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(`/projects/${project.id}/setup`)}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">{project.title}</div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{formatMemberRoleLabel(project.role)}</div>
              </div>
              <div className="mt-3 text-sm text-slate-300">
                资产 {project.assetCount} · 剧集 {project.episodeCount} · 剧本 {project.hasScript ? '已上传' : '未上传'}
              </div>
              <div className="mt-2 text-xs text-white/45">更新于 {fmt(project.updatedAt)}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );

  const renderSetup = () => {
    const latestScriptDecomposeRun = latestStageCapabilityRun(projectRuns, 'script_decompose');
    const isScriptDecomposeActive = scriptDecomposeRunning || isRunningStatus(latestScriptDecomposeRun?.status);
    const storyBible = projectDetail?.storyBible;
    const storyEpisodePreview = (storyBible?.episodes || episodes).slice(0, 4);
    const projectSettingSummary = [
      `画幅 ${setupDraft.aspectRatio}`,
      setupDraft.targetMedium ? `载体 ${setupDraft.targetMedium}` : null,
      setupDraft.styleSummary ? '已设置整体风格' : null,
      setupDraft.globalPromptsText.trim() ? `${splitLines(setupDraft.globalPromptsText).length} 条全局提示词` : null,
    ].filter(Boolean) as string[];
    const setupFlowSections = buildSetupFlowSections({
      flows: WORKFLOW_STAGE_FLOWS,
      stageLabels: STAGE_LABELS,
      stageConfig,
      catalogModels: catalogs.models,
      skillPacks: catalogs.skillPacks,
      reviewPolicies: catalogs.reviewPolicies,
      getCapabilityModels,
      getResolvedCapabilityModelId,
      stageEntry,
    });

    return (
      <SetupPage
        projectTitle={projectDetail?.title}
        storyBible={storyBible}
        storyEpisodePreview={storyEpisodePreview}
        latestScriptSource={latestScriptSource}
        episodes={episodes}
        assetsCount={assets.length}
        scriptText={scriptText}
        scriptFileName={scriptFile?.name || null}
        setupDraft={setupDraft}
        projectSettingSummary={projectSettingSummary}
        scriptSourceSaving={scriptSourceSaving}
        projectSetupSaving={projectSetupSaving}
        isScriptDecomposeActive={isScriptDecomposeActive}
        onScriptTextChange={setScriptText}
        onScriptFileChange={setScriptFile}
        onSaveScript={async () => {
          try {
            await persistProjectScriptSource({ requireContent: true });
          } catch (err) {
            setError(err instanceof Error ? err.message : '保存剧本失败。');
          }
        }}
        onRunDirectorAnalysis={async () => {
          if (route.kind !== 'project-setup' || isScriptDecomposeActive) return;
          try {
            setScriptDecomposeRunning(true);
            await persistProjectScriptSource({ requireContent: true });
            await runCapability({
              capabilityId: 'script_decompose',
              projectId: route.projectId,
              modelId: getResolvedCapabilityModelId('script_decompose', stageEntry(stageConfig, 'script_decompose').modelId),
              skillPackId: stageEntry(stageConfig, 'script_decompose').skillPackId,
            }, '剧本拆解失败。');
          } catch (err) {
            setError(err instanceof Error ? err.message : '剧本拆解失败。');
          } finally {
            setScriptDecomposeRunning(false);
          }
        }}
        onSetupDraftChange={(patch) => setSetupDraft((current) => ({ ...current, ...patch }))}
        onSaveProjectSetup={async () => {
          try {
            if (route.kind !== 'project-setup') return;
            setProjectSetupSaving(true);
            const res = await appApi.updateProjectSetup(route.projectId, {
              aspectRatio: setupDraft.aspectRatio,
              styleSummary: setupDraft.styleSummary,
              targetMedium: setupDraft.targetMedium,
              globalPrompts: splitLines(setupDraft.globalPromptsText),
            });
            if (!res.success) throw new Error(res.error || '保存项目配置失败。');
            await refreshCurrent();
          } catch (err) {
            setError(err instanceof Error ? err.message : '保存项目配置失败。');
          } finally {
            setProjectSetupSaving(false);
          }
        }}
        onGoAssets={() => {
          if (route.kind === 'project-setup') {
            navigate(`/projects/${route.projectId}/assets`);
          }
        }}
        secondarySections={(
          <SetupSecondarySections
            flowSections={setupFlowSections}
            memberCount={projectMembers.length}
            members={projectMembers.map((member) => ({
              id: member.id,
              name: member.name,
              email: member.email,
              roleLabel: formatMemberRoleLabel(member.role),
            }))}
            memberForm={memberForm}
            onSelectSkillPack={(stageKind, skillPackId) => {
              const typedStageKind = stageKind as StageKind;
              const stageSkills = catalogs.skillPacks.filter((item) => item.stageKind === typedStageKind);
              const nextSkillPack = stageSkills.find((item) => item.id === skillPackId) || null;
              setStageConfig((current) => ({
                ...current,
                [typedStageKind]: applySkillPackSelection(typedStageKind, stageEntry(current, typedStageKind), nextSkillPack),
              }));
            }}
            onSelectModel={(stageKind, modelId) => setStageConfig((current) => {
              const typedStageKind = stageKind as StageKind;
              return {
                ...current,
                [typedStageKind]: applyStageModelSelection(
                  stageEntry(current, typedStageKind),
                  modelId,
                  catalogs.models,
                ),
              };
            })}
            onSelectPromptRecipe={(stageKind, promptRecipeId) => setStageConfig((current) => {
              const typedStageKind = stageKind as StageKind;
              return {
                ...current,
                [typedStageKind]: {
                  ...stageEntry(current, typedStageKind),
                  promptRecipeId: promptRecipeId || undefined,
                },
              };
            })}
            onToggleReviewPolicy={(stageKind, policyId) => setStageConfig((current) => {
              const typedStageKind = stageKind as StageKind;
              const stage = stageEntry(current, typedStageKind);
              const selected = stage.reviewPolicyIds.includes(policyId);
              return {
                ...current,
                [typedStageKind]: {
                  ...stage,
                  reviewPolicyIds: selected
                    ? stage.reviewPolicyIds.filter((item) => item !== policyId)
                    : [...stage.reviewPolicyIds, policyId],
                },
              };
            })}
            onChangeModelParam={(stageKind, fieldKey, nextValue) => setStageConfig((current) => {
              const typedStageKind = stageKind as StageKind;
              return {
                ...current,
                [typedStageKind]: applyStageModelParamChange(
                  {
                    ...stageEntry(current, typedStageKind),
                    modelId: getResolvedCapabilityModelId(
                      stageEntry(current, typedStageKind).capabilityId,
                      stageEntry(current, typedStageKind).modelId,
                    ),
                  },
                  fieldKey,
                  nextValue,
                  catalogs.models,
                ),
              };
            })}
            onSaveStageConfig={async () => {
              try {
                if (route.kind !== 'project-setup') return;
                const normalizedStageConfig = Object.fromEntries(
                  (Object.keys(STAGE_LABELS) as StageKind[]).map((stageKind) => {
                    const stage = stageEntry(stageConfig, stageKind);
                    const resolvedModelId = getResolvedCapabilityModelId(stage.capabilityId, stage.modelId);
                    return [stageKind, {
                      ...stage,
                      modelId: resolvedModelId,
                      modelParams: resolveStageModelParams(
                        { ...stage, modelId: resolvedModelId },
                        catalogs.models,
                      ),
                    }];
                  }),
                );
                const res = await appApi.updateStageConfig(route.projectId, normalizedStageConfig);
                if (!res.success) throw new Error(res.error || '保存阶段配置失败。');
                await refreshCurrent();
              } catch (err) {
                setError(err instanceof Error ? err.message : '保存阶段配置失败。');
              }
            }}
            onMemberFormChange={(patch) => setMemberForm((current) => ({ ...current, ...patch }))}
            onAddMember={async () => {
              try {
                if (route.kind !== 'project-setup') return;
                const res = await appApi.addProjectMember(route.projectId, { email: memberForm.email.trim(), role: memberForm.role });
                if (!res.success) throw new Error(res.error || '添加成员失败。');
                setMemberForm({ email: '', role: 'editor' });
                await refreshCurrent();
              } catch (err) {
                setError(err instanceof Error ? err.message : '添加成员失败。');
              }
            }}
          />
        )}
      />
    );
  };

  const renderAssets = () => {
    const latestAssetExtractRun = latestStageCapabilityRun(projectRuns, 'asset_design');
    const assetExtractRunning = isRunningStatus(latestAssetExtractRun?.status);

    return (
      <AssetsPage
        assets={assets}
        assetFilterType={assetFilterType}
        assetSearchQuery={assetSearchQuery}
        expandedAssetId={expandedAssetId}
        assetVersionDrawerAssetId={assetVersionDrawerAssetId}
        assetVersionCompareIds={assetVersionCompareIds}
        assetVersionSwitchId={assetVersionSwitchId}
        assetExtractRunning={assetExtractRunning}
        assetCreating={assetCreating}
        assetForm={assetForm}
        formatAssetTypeLabel={formatAssetTypeLabel}
        resolveAssetPromptText={resolveAssetPromptText}
        assetPreview={assetPreview}
        assetCapability={assetCapability}
        assetVersionSourceLabel={assetVersionSourceLabel}
        onFilterTypeChange={setAssetFilterType}
        onSearchQueryChange={setAssetSearchQuery}
        onSelectAsset={setExpandedAssetId}
        onGoEpisodes={() => {
          if (route.kind === 'project-assets') {
            navigate(`/projects/${route.projectId}/episodes`);
          }
        }}
        onRunAssetExtract={async () => {
          await runCapability({
            capabilityId: 'asset_extract',
            projectId: route.kind === 'project-assets' ? route.projectId : '',
            modelId: getResolvedCapabilityModelId('asset_extract', stageEntry(stageConfig, 'asset_design').modelId),
            skillPackId: stageEntry(stageConfig, 'asset_design').skillPackId,
          }, 'Asset extraction failed.');
        }}
        onGeneratePreview={async (asset) => {
          await runCapability({
            capabilityId: assetCapability(asset),
            projectId: route.kind === 'project-assets' ? route.projectId : '',
            assetId: asset.id,
            modelId: getResolvedCapabilityModelId(assetCapability(asset) || ''),
            prompt: resolveAssetPromptText(asset),
          }, 'Asset preview generation failed.');
        }}
        onToggleLock={async (asset) => {
          try {
            const res = asset.isLocked ? await appApi.unlockAsset(asset.id) : await appApi.lockAsset(asset.id);
            if (!res.success) throw new Error(res.error || '资产锁定失败。');
            await refreshCurrent();
          } catch (err) {
            setError(err instanceof Error ? err.message : '资产锁定失败。');
          }
        }}
        onToggleVersions={toggleAssetVersions}
        onCloseVersionDrawer={() => setAssetVersionDrawerAssetId(null)}
        onSetCompareSlot={setAssetCompareSlot}
        onSetCurrentVersion={setAssetCurrentVersionSelection}
        onAssetFormChange={(patch) => setAssetForm((current) => ({ ...current, ...patch }))}
        onCreateAsset={async () => {
          if (assetCreating) return;
          try {
            if (route.kind !== 'project-assets') return;
            setAssetCreating(true);
            const res = await appApi.createAsset(route.projectId, assetForm);
            if (!res.success) throw new Error(res.error || '创建资产失败。');
            setAssetForm({ type: 'character', name: '', description: '', promptText: '' });
            await refreshCurrent();
          } catch (err) {
            setError(err instanceof Error ? err.message : '创建资产失败。');
          } finally {
            setAssetCreating(false);
          }
        }}
      />
    );
  };
  const renderEpisodes = () => {
    if (route.kind !== 'project-episodes') {
      return null;
    }

    const latestScriptRun = latestStageCapabilityRun(projectRuns, 'script_decompose');
    const hasSavedScript = Boolean(latestScriptSource?.contentText?.trim());
    const scriptRunRunning = scriptDecomposeRunning || isRunningStatus(latestScriptRun?.status);
    const scriptRunFailed = String(latestScriptRun?.status || '').toLowerCase() === 'error';
    const analyzedEpisodeCount = episodes.filter((episode) => ['ready', 'generated'].includes(episode.status)).length;
    const totalShotCount = episodes.reduce((sum, episode) => (
      sum + buildEpisodeSceneCards(episode, episode.context || null, '').reduce((sceneSum, item) => sceneSum + item.shotCount, 0)
    ), 0);

    return (
      <EpisodesPage
        episodes={episodes}
        hasSavedScript={hasSavedScript}
        scriptRunRunning={scriptRunRunning}
        scriptRunFailed={scriptRunFailed}
        analyzedEpisodeCount={analyzedEpisodeCount}
        totalShotCount={totalShotCount}
        formatEpisodeStatus={formatEpisodeStatus}
        isEpisodeAnalyzeLocked={(episodeId) => isActionLocked(`episode-analyze:${episodeId}`)}
        getEpisodeSceneCards={(episode) => buildEpisodeSceneCards(episode, episode.context || null, '')}
        onGoSetup={() => navigate(`/projects/${route.projectId}/setup`)}
        onRunScriptDecompose={async () => {
          if (scriptRunRunning) return;
          try {
            setScriptDecomposeRunning(true);
            await runCapability({
              capabilityId: 'script_decompose',
              projectId: route.projectId,
              modelId: getResolvedCapabilityModelId('script_decompose', stageEntry(stageConfig, 'script_decompose').modelId),
              skillPackId: stageEntry(stageConfig, 'script_decompose').skillPackId,
            }, '剧本拆解失败。');
          } catch (err) {
            setError(err instanceof Error ? err.message : '剧本拆解失败。');
          } finally {
            setScriptDecomposeRunning(false);
          }
        }}
        onOpenEpisode={async (episode) => {
          const analyzeActionKey = `episode-analyze:${episode.id}`;
          try {
            if (!startActionLock(analyzeActionKey)) return;
            const originProjectId = route.projectId;
            const originPath = window.location.pathname;
            if (!['ready', 'generated'].includes(episode.status)) {
              const stage = stageEntry(stageConfig, 'episode_expand');
              const res = await appApi.analyzeEpisode(route.projectId, episode.id, {
                skillPackId: stage.skillPackId,
                modelId: getResolvedCapabilityModelId('episode_expand', stage.modelId),
              });
              if (!res.success) throw new Error(res.error || '单集分析失败。');
              await refreshCurrent();
            }
            if (
              routeRef.current.kind === 'project-episodes'
              && routeRef.current.projectId === originProjectId
              && window.location.pathname === originPath
            ) {
              navigate(`/projects/${originProjectId}/episodes/${episode.id}/scenes`);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : '单集分析失败。');
          } finally {
            finishActionLock(analyzeActionKey);
          }
        }}
        onEnterWorkspace={(episodeId) => navigate(`/projects/${route.projectId}/episodes/${episodeId}/workspace`)}
      />
    );
  };

  const renderEpisodeScenes = () => {
    if (route.kind !== 'episode-scenes') {
      return null;
    }

    const currentEpisode = route.kind === 'episode-scenes'
      ? episodes.find((item) => item.id === route.episodeId) || null
      : null;
    const storyboardText = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('storyboard-'))?.content || '';
    const sceneCards = buildEpisodeSceneCards(currentEpisode, episodeContext, storyboardText);
    const shotTotal = sceneCards.reduce((sum, scene) => sum + scene.shotCount, 0);

    return (
      <EpisodeScenesPage
        currentEpisode={currentEpisode}
        currentStatusLabel={currentEpisode ? formatEpisodeStatus(currentEpisode.status) : '待分析'}
        sceneCards={sceneCards}
        shotTotal={shotTotal}
        onGoEpisodes={() => navigate(`/projects/${route.projectId}/episodes`)}
        onEnterWorkspace={() => navigate(`/projects/${route.projectId}/episodes/${route.episodeId}/workspace`)}
      />
    );
  };

  const renderEpisodeWorkspace = () => {
    if (route.kind !== 'episode-workspace') {
      return null;
    }

    const currentEpisode = episodes.find((item) => item.id === route.episodeId) || null;
    const videoPromptStage = stageEntry(stageConfig, 'video_prompt_generate');
    const {
      videoPromptSkillPack,
      activePromptRecipe,
      storyboardText,
      videoPromptText,
      selectedWorkspaceNode,
      videoNode,
      lockedAssets,
      assetNodesByAssetId,
      syncedAssetCount,
      syncedAssetVersionCount,
      workspaceVideoInputs,
      connectedAudioReference,
      hasAudioReference,
      shotStrip,
      currentShotViewport,
      activeShot,
      totalTimelineSeconds,
      currentTimelineSeconds,
      previewNode,
      previewAsyncState,
      previewValue,
      previewTitle,
      previewSummary,
      shotStripSummary,
      activeShotRecommendedAssets,
    } = buildEpisodeWorkspaceViewModel({
      currentEpisode,
      episodeContext,
      episodeWorkspace,
      assets,
      selectedNodeId,
      skillPacks: catalogs.skillPacks,
      stageConfig,
    });
    const storyboardStageRun = latestStageCapabilityRun(episodeRuns, 'storyboard_generate');
    const promptStageRun = latestStageCapabilityRun(episodeRuns, 'video_prompt_generate');
    const videoStageRun = latestStageCapabilityRun(episodeRuns, 'video_generate');
    const storyboardGenerationLocked = isActionLocked(`storyboard:${route.episodeId}`) || isRunningStatus(storyboardStageRun?.status);
    const videoPromptGenerationLocked = isActionLocked(`video-prompt:${route.episodeId}`) || isRunningStatus(promptStageRun?.status);
    const primaryVideoNodeLocked = videoNode ? isActionLocked(`episode-node:${videoNode.id}`) : false;
    const workbenchSaveLabel = episodeWorkspaceSaveState === 'saving'
      ? '保存中...'
      : episodeWorkspaceSaveState === 'dirty'
        ? '草稿待自动保存'
        : episodeWorkspaceSaveState === 'saved'
          ? `已保存 · ${fmt(episodeWorkspaceSavedAt)}`
          : '未修改';

    const repairEpisodeWorkbench = (forceLayout = false) => {
      if (!episodeWorkspace || !currentEpisode) {
        return;
      }

      updateEpisodeWorkspaceDraft((currentContent) => {
        const nextContent = harmonizeEpisodeWorkbenchContent({
          content: currentContent,
          episode: currentEpisode,
          lockedAssets,
          models: catalogs.models,
          stageConfig,
          promptRecipeId: videoPromptStage.promptRecipeId,
          forceLayout,
        });
        return {
          ...nextContent,
          shotStrip: buildEpisodeShotStrip({
            episode: currentEpisode,
            episodeContext,
            storyboardText: nextContent.nodes.find((item) => item.id === getEpisodePrimaryNodeId('storyboard', currentEpisode.id))?.content || '',
            videoPromptText: nextContent.nodes.find((item) => item.id === getEpisodePrimaryNodeId('prompt', currentEpisode.id))?.content || '',
            currentStrip: nextContent.shotStrip as EpisodeShotStripState | null | undefined,
          }),
        };
      });
    };

    const applyStagePresetToEpisodeNode = (stageKind: 'video_prompt_generate' | 'video_generate') => {
      if (!episodeWorkspace || !currentEpisode || route.kind !== 'episode-workspace') {
        return;
      }

      const stage = stageEntry(stageConfig, stageKind);
      const resolvedStage: StageConfig = {
        ...stage,
        modelId: getResolvedCapabilityModelId(stage.capabilityId, stage.modelId),
        modelParams: resolveStageModelParams(
          {
            ...stage,
            modelId: getResolvedCapabilityModelId(stage.capabilityId, stage.modelId),
          },
          catalogs.models,
        ),
      };

      const primaryNodeId = stageKind === 'video_generate'
        ? getEpisodePrimaryNodeId('video', route.episodeId)
        : getEpisodePrimaryNodeId('prompt', route.episodeId);

      let nextSelectedId: string | null = null;
      updateEpisodeWorkspaceDraft((currentContent) => {
        const nextContent = harmonizeEpisodeWorkbenchContent({
          content: currentContent,
          episode: currentEpisode,
          lockedAssets,
          models: catalogs.models,
          stageConfig,
          promptRecipeId: videoPromptStage.promptRecipeId,
        });
        const preferredNode = stageKind === 'video_generate'
          ? (selectedWorkspaceNode?.type === 'video' ? nextContent.nodes.find((item) => item.id === selectedWorkspaceNode.id) || null : null)
          : (selectedWorkspaceNode?.id === primaryNodeId ? nextContent.nodes.find((item) => item.id === selectedWorkspaceNode.id) || null : null);
        const targetNode = preferredNode
          || nextContent.nodes.find((item) => item.id === primaryNodeId)
          || null;
        if (!targetNode) {
          return nextContent;
        }

        nextSelectedId = targetNode.id;
        return updateNodeInContent(
          nextContent,
          targetNode.id,
          buildCanvasNodeStagePresetPatch(targetNode, resolvedStage, catalogs.models),
        );
      }, { selectedNodeId: nextSelectedId });
    };

    const focusEpisodeNode = (node: CanvasNode | null, beatId?: string | null) => {
      if (!node) {
        return;
      }
      setSelectedNodeId(node.id);
    };

    const focusLockedAsset = (assetId: string) => {
      const node = assetNodesByAssetId.get(assetId) || null;
      if (!node) {
        return;
      }
      focusEpisodeNode(node);
    };

    const selectShot = (slotId: string) => {
      const currentContent = episodeWorkspaceRef.current?.content;
      if (!currentContent) {
        return;
      }
      const nextDraft = selectEpisodeWorkspaceShotDraft({
        content: currentContent,
        slotId,
        models: catalogs.models,
        stageConfig,
        selectedNodeId,
      });
      updateEpisodeWorkspaceDraft(
        () => nextDraft.content,
        {
          selectedNodeId: nextDraft.selectedNodeId,
          markDirty: false,
        },
      );
    };

    const seekTimeline = (seconds: number, options?: { syncShot?: boolean }) => {
      const currentContent = episodeWorkspaceRef.current?.content;
      if (!currentContent) {
        return;
      }

      const nextDraft = seekEpisodeWorkspaceTimelineDraft({
        content: currentContent,
        seconds,
        syncShot: options?.syncShot,
        models: catalogs.models,
        stageConfig,
        selectedNodeId,
      });

      updateEpisodeWorkspaceDraft(
        () => nextDraft.content,
        {
          selectedNodeId: nextDraft.selectedNodeId,
          markDirty: false,
        },
      );
    };

    const addShotSlot = () => {
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: appendManualEpisodeShotSlot(currentContent.shotStrip as EpisodeShotStripState | undefined),
      }));
    };

    const renameShot = (slotId: string, title: string) => {
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: renameEpisodeShotSlot(currentContent.shotStrip as EpisodeShotStripState | undefined, slotId, title),
      }));
    };

    const deleteShot = (slotId: string) => {
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: deleteEpisodeShotSlot(currentContent.shotStrip as EpisodeShotStripState | undefined, slotId),
      }));
    };

    const moveShot = (fromShotId: string, toShotId?: string | null) => {
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: reorderEpisodeShotSlot({
          strip: currentContent.shotStrip as EpisodeShotStripState | undefined,
          fromShotId,
          toShotId,
        }),
      }));
    };

    const storeVideoNodeToShot = (nodeId: string) => {
      const sourceNode = episodeWorkspace?.content.nodes.find((item) => item.id === nodeId) || null;
      const sourceVideoUrl = sourceNode ? getNodePrimaryValue(sourceNode) : '';
      const targetShot = findSelectedEpisodeShot(episodeWorkspace?.content.shotStrip as EpisodeShotStripState | undefined);

      if (!targetShot) {
        setError('请先在下方视频条选中当前分镜槽。');
        return;
      }

      if (!sourceNode || sourceNode.type !== 'video' || !isVideoSource(sourceVideoUrl)) {
        setError('当前节点还没有可保存的视频结果。');
        return;
      }

      const clip = buildEpisodeShotClip({
        slot: targetShot,
        node: sourceNode,
        videoUrl: sourceVideoUrl,
        fallbackPromptText: targetShot.promptText || workspaceVideoInputs.prompt || videoPromptText,
      });

      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: saveClipToEpisodeShotStrip({
          strip: currentContent.shotStrip as EpisodeShotStripState | undefined,
          targetShotId: targetShot.id,
          clip,
        }),
      }), { selectedNodeId: sourceNode.id });
    };

    const clearShotResult = (slotId: string) => {
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: clearEpisodeShotClip(currentContent.shotStrip as EpisodeShotStripState | undefined, slotId),
      }));
    };

    const retryShotJob = (slotId: string) => {
      const slot = shotStrip.slots.find((item) => item.id === slotId) || null;
      const sourceNodeId = slot?.job?.sourceNodeId || null;
      if (!sourceNodeId) {
        setError('当前分镜没有可重试的生成节点。');
        return;
      }

      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: clearEpisodeShotJob(
          selectEpisodeShotSlot(currentContent.shotStrip as EpisodeShotStripState | undefined, slotId),
          slotId,
        ),
      }), { selectedNodeId: sourceNodeId });

      void runEpisodeCanvasNode(sourceNodeId, slotId).catch((err) => {
      setError(err instanceof Error ? err.message : '分镜重试失败。');
      });
    };

    const cancelShotJob = async (slotId: string) => {
      const slot = shotStrip.slots.find((item) => item.id === slotId) || null;
      const providerJobId = slot?.job?.providerJobId || null;
      if (!providerJobId || !slot?.job) {
        setError('当前分镜没有可取消的排队任务。');
        return;
      }
      if (!canCancelJimengShotJob(slot.job)) {
        setError('即梦当前只支持取消排队中的任务。');
        return;
      }

      try {
        const res = await appApi.cancelJimengJob(providerJobId);
        if (!res.success || !res.data) {
      throw new Error(res.error || '取消即梦任务失败。');
        }

        updateEpisodeWorkspaceDraft((currentContent) => {
          const currentNode = currentContent.nodes.find((item) => item.id === slot.job?.sourceNodeId) || null;
          const nextContent = currentNode
            ? updateNodeInContent(currentContent, currentNode.id, applyJimengJobPatchToNode(currentNode, res.data))
            : currentContent;

          return {
            ...nextContent,
            shotStrip: upsertEpisodeShotJob({
              strip: nextContent.shotStrip as EpisodeShotStripState | undefined,
              targetShotId: slotId,
              job: buildEpisodeShotJobState({
                sourceNodeId: slot.job?.sourceNodeId || '',
                providerJobId: res.data.id,
                status: res.data.status,
                phase: res.data.phase,
                progress: res.data.progress,
                error: res.data.error,
                updatedAt: res.data.updated_at,
                previewUrl: res.data.videoUrl,
              }),
            }),
          };
        }, { selectedNodeId: slot.job?.sourceNodeId || null });
      } catch (err) {
      setError(err instanceof Error ? err.message : '取消即梦任务失败。');
      }
    };

    const applyActiveShotRecommendation = () => {
      if (!activeShot || !episodeWorkspace || route.kind !== 'episode-workspace') {
        return;
      }

      const primaryVideoNodeId = getEpisodePrimaryNodeId('video', route.episodeId);
      updateEpisodeWorkspaceDraft((currentContent) => {
        const currentNode = currentContent.nodes.find((item) => item.id === primaryVideoNodeId) || null;
        if (!currentNode) {
          return currentContent;
        }

        const nextPatch = activeShot.recommendedModelId
          ? buildCanvasNodeModelChangePatch(currentNode, activeShot.recommendedModelId, catalogs.models)
          : {};

        return updateNodeInContent(currentContent, primaryVideoNodeId, {
          ...nextPatch,
          modeId: activeShot.recommendedModeId || nextPatch.modeId || currentNode.modeId,
        });
      }, { selectedNodeId: primaryVideoNodeId });
    };

    const connectActiveShotRecommendedAssets = () => {
      if (!activeShot || !episodeWorkspace || !currentEpisode || route.kind !== 'episode-workspace') {
        return;
      }

      const matchedAssets = activeShotRecommendedAssets
        .map((entry) => entry.asset)
        .filter((asset): asset is CanonicalAsset => Boolean(asset));
      if (matchedAssets.length === 0) {
        setError('当前分镜还没有可匹配的推荐资产。');
        return;
      }

      const primaryVideoNodeId = getEpisodePrimaryNodeId('video', route.episodeId);
      let nextSelectedId: string | null = primaryVideoNodeId;
      let skippedReason: string | null = null;

      updateEpisodeWorkspaceDraft((currentContent) => {
        const syncedContent = harmonizeEpisodeWorkbenchContent({
          content: currentContent,
          episode: currentEpisode,
          lockedAssets,
          models: catalogs.models,
          stageConfig,
          promptRecipeId: videoPromptStage.promptRecipeId,
        });
        const videoNode = syncedContent.nodes.find((node) => node.id === primaryVideoNodeId) || null;
        if (!videoNode) {
          skippedReason = '当前工作台还没有主视频节点。';
          return syncedContent;
        }

        const nextConnections = Array.isArray(syncedContent.connections) ? [...syncedContent.connections] : [];
        for (const asset of matchedAssets) {
          const assetNodeId = getEpisodeAssetNodeId(asset.id);
          const assetNode = syncedContent.nodes.find((node) => node.id === assetNodeId) || null;
          if (!assetNode) {
            skippedReason = `推荐资产 ${asset.name} 还没有同步到工作台。`;
            continue;
          }

          const validation = validateCanvasConnection(assetNode, videoNode, catalogs.models, nextConnections);
          if (!validation.valid || !validation.resolvedInputKey) {
            skippedReason = validation.error || `推荐资产 ${asset.name} 无法接入当前视频节点。`;
            continue;
          }

          const exists = nextConnections.some((connection) => (
            connection.from === assetNode.id
            && connection.to === videoNode.id
            && connection.inputKey === validation.resolvedInputKey
          ));
          if (exists) {
            continue;
          }

          nextConnections.push({
            id: buildCanvasConnectionId(assetNode.id, videoNode.id, validation.resolvedInputKey),
            from: assetNode.id,
            to: videoNode.id,
            inputKey: validation.resolvedInputKey,
            inputType: assetNode.type,
          });
        }

        return {
          ...syncedContent,
          connections: nextConnections,
        };
      }, { selectedNodeId: nextSelectedId });

      if (skippedReason) {
        setError(skippedReason);
      }
    };

    const addEpisodeNode = (type: CanvasNode['type'], position?: { x: number; y: number }) => {
      if (!episodeWorkspace) {
        return;
      }

      const nextDraft = addEpisodeWorkspaceNode({
        content: episodeWorkspace.content,
        type,
        episodeId: route.episodeId,
        models: catalogs.models,
        stageConfig,
        position,
      });

      updateEpisodeWorkspaceDraft(() => nextDraft.content, { selectedNodeId: nextDraft.selectedNodeId });
    };

    return (
      <div className="space-y-6">
        <EpisodeWorkspaceOverviewCard
          title={currentEpisode ? `${currentEpisode.title} · 生成工作台` : '生成工作台'}
          contextSummary={episodeContext?.contextSummary || ''}
          lockedAssets={lockedAssets.map((asset) => ({ id: asset.id, type: asset.type, name: asset.name }))}
          onFocusLockedAsset={focusLockedAsset}
          completedSlots={shotStripSummary.completedSlots}
          totalSlots={shotStripSummary.totalSlots}
          totalSeconds={shotStripSummary.totalSeconds}
          activeShotTitle={activeShot?.title || null}
          promptRecipeName={activePromptRecipe?.name || null}
          promptRecipeDescription={activePromptRecipe?.description || null}
          skillPackName={videoPromptSkillPack?.name || null}
          onGoScenes={() => navigate(`/projects/${route.projectId}/episodes/${route.episodeId}/scenes`)}
          onGenerateStoryboard={() => void runEpisodeWorkspaceCapability(
            `storyboard:${route.episodeId}`,
            () => ({
              capabilityId: 'storyboard_generate',
              projectId: route.projectId,
              episodeId: route.episodeId,
              modelId: getResolvedCapabilityModelId('storyboard_generate', stageEntry(stageConfig, 'video_prompt_generate').modelId),
              skillPackId: stageEntry(stageConfig, 'video_prompt_generate').skillPackId,
              promptRecipeId: stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
            }),
            '分镜生成失败。',
          )}
          onGenerateVideoPrompt={() => void runEpisodeWorkspaceCapability(
            `video-prompt:${route.episodeId}`,
            () => ({
              capabilityId: 'video_prompt_generate',
              projectId: route.projectId,
              episodeId: route.episodeId,
              modelId: getResolvedCapabilityModelId('video_prompt_generate', stageEntry(stageConfig, 'video_prompt_generate').modelId),
              skillPackId: stageEntry(stageConfig, 'video_prompt_generate').skillPackId,
              promptRecipeId: stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
            }),
            '视频提示词生成失败。',
          )}
          onApplyPromptPreset={() => applyStagePresetToEpisodeNode('video_prompt_generate')}
          onRunPrimaryVideo={() => {
            const primaryVideoNode = episodeWorkspace?.content.nodes.find((item) => item.id === getEpisodePrimaryNodeId('video', route.episodeId)) || null;
            if (!primaryVideoNode) {
              setError('当前工作台还没有视频节点。');
              return;
            }
            void runEpisodeCanvasNode(primaryVideoNode.id).catch((err) => {
              setError(err instanceof Error ? err.message : '视频生成失败。');
            });
          }}
          onApplyVideoPreset={() => applyStagePresetToEpisodeNode('video_generate')}
          onSyncAssets={() => repairEpisodeWorkbench(false)}
          onRepairLayout={() => repairEpisodeWorkbench(true)}
          storyboardGenerationLocked={storyboardGenerationLocked}
          videoPromptGenerationLocked={videoPromptGenerationLocked}
          primaryVideoNodeLocked={primaryVideoNodeLocked}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <EpisodeWorkspaceCanvasPanel
            saveState={episodeWorkspaceSaveState}
            saveLabel={workbenchSaveLabel}
            onSave={async () => {
              if (!episodeWorkspace || route.kind !== 'episode-workspace') return;
              try {
                await saveEpisodeWorkspaceContent(episodeWorkspace.content);
              } catch (err) {
                setError(err instanceof Error ? err.message : '保存单集工作台失败。');
              }
            }}
            onSyncWorkbench={() => repairEpisodeWorkbench(false)}
            onRelayout={() => updateEpisodeWorkspaceDraft((currentContent) => layoutEpisodeWorkbenchContent(currentContent, route.episodeId, lockedAssets))}
            onAddNode={addEpisodeNode}
            canvasProps={{
              content: episodeWorkspace?.content || { nodes: [], connections: [] },
              models: catalogs.models,
              stageConfig,
              selectedNodeId,
              currentShotId: shotStrip.selectedShotId,
              currentViewport: currentShotViewport,
              onSelectNode: setSelectedNodeId,
              onChangeContent: updateEpisodeWorkspaceDraft,
              onRunNode: (nodeId) => void runEpisodeCanvasNode(nodeId).catch((err) => setError(err instanceof Error ? err.message : '节点运行失败。')),
              onUploadAudio: uploadAudioReference,
              canStoreVideoToShot: Boolean(activeShot),
              onStoreVideoToShot: storeVideoNodeToShot,
              onError: (message) => setError(message),
            }}
          />

          <section className="space-y-6">
            <EpisodeWorkspacePreviewPanel
              previewTitle={previewTitle}
              previewValue={previewValue}
              previewNodeType={previewNode?.type || null}
              previewAsyncState={previewAsyncState}
              previewSummary={previewSummary || activeShot?.clip?.promptText || null}
              activeShotTitle={activeShot?.title || null}
              activeShotDurationLabel={activeShot?.durationLabel || null}
              promptReady={Boolean(workspaceVideoInputs.prompt)}
              imageReferenceCount={workspaceVideoInputs.imageUrls.length}
              videoReferenceCount={workspaceVideoInputs.videoReferenceUrls.length}
              audioReferenceCount={workspaceVideoInputs.audioReferenceUrls.length}
              syncedAssetCount={syncedAssetCount}
              lockedAssetCount={lockedAssets.length}
              promptText={(workspaceVideoInputs.prompt || videoPromptText) || ''}
              hasAudioReference={hasAudioReference}
              connectedAudioReference={connectedAudioReference}
              assetReferences={workspaceVideoInputs.assetReferences}
              recommendedAssets={activeShotRecommendedAssets.map((entry) => ({ name: entry.name, matched: Boolean(entry.asset) }))}
              canCancelJob={Boolean(activeShot?.job && canCancelJimengShotJob(activeShot.job))}
              canRetryJob={Boolean(activeShot?.job && !canCancelJimengShotJob(activeShot.job) && (activeShot.job.status === 'FAILED' || activeShot.job.status === 'CANCELLED'))}
              canClearShotResult={Boolean(activeShot?.clip)}
              canConnectRecommendedAssets={activeShotRecommendedAssets.length > 0}
              canApplyRecommendation={Boolean(activeShot?.recommendedModelId || activeShot?.recommendedModeId)}
              onCancelJob={() => {
                if (activeShot) {
                  void cancelShotJob(activeShot.id);
                }
              }}
              onRetryJob={() => {
                if (activeShot) {
                  retryShotJob(activeShot.id);
                }
              }}
              onClearShotResult={() => {
                if (activeShot) {
                  clearShotResult(activeShot.id);
                }
              }}
              onConnectRecommendedAssets={connectActiveShotRecommendedAssets}
              onApplyRecommendation={applyActiveShotRecommendation}
            />
          </section>
        </div>

        <EpisodeWorkspaceTimelineCard
          shotStripProps={{
            strip: shotStrip,
            currentSeconds: currentTimelineSeconds,
            totalSeconds: totalTimelineSeconds,
            onSelectShot: selectShot,
            onSeekTimeline: seekTimeline,
            onAddShot: addShotSlot,
            onRenameShot: renameShot,
            onDeleteShot: deleteShot,
            onMoveShot: moveShot,
            onClearShotResult: clearShotResult,
            onRetryShotJob: retryShotJob,
            onCancelShotJob: cancelShotJob,
          }}
        />
      </div>
    );
  };

  const renderStudio = () => (
    <StudioPage
      studioWorkspaces={studioWorkspaces}
      activeStudioId={activeStudioId}
      activeStudio={activeStudio}
      onCreateWorkspace={async () => {
        try {
          const res = await appApi.createStudioWorkspace({ title: `画布沙盒 ${studioWorkspaces.length + 1}` });
          if (!res.success || !res.data) throw new Error(res.error || '创建沙盒失败。');
          await loadStudio();
          setActiveStudioId(res.data.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : '创建沙盒失败。');
        }
      }}
      onSelectWorkspace={(workspaceId, firstNodeId) => {
        setActiveStudioId(workspaceId);
        setSelectedStudioNodeId(firstNodeId);
      }}
      onAddNode={(type) => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio?.id ? {
        ...item,
          content: {
            ...item.content,
            nodes: [
              ...item.content.nodes,
              createCanvasNode(type, item.content.nodes.length, catalogs.models),
            ],
          connections: Array.isArray(item.content.connections) ? item.content.connections : [],
        },
      } : item))}
      onSaveWorkspace={async () => {
        if (!activeStudio) return;
        try {
          await saveStudioWorkspaceContent(activeStudio.id, activeStudio.content);
        } catch (err) {
          setError(err instanceof Error ? err.message : '保存沙盒失败。');
        }
      }}
      canvasProps={activeStudio ? {
        nodes: activeStudio.content.nodes,
        connections: activeStudio.content.connections || [],
        models: catalogs.models,
        selectedNodeId: selectedStudioNodeId,
        onSelectNode: setSelectedStudioNodeId,
        onChangeNodes: (nodes) => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? { ...item, content: { ...item.content, nodes } } : item)),
        onChangeConnections: (connections) => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? { ...item, content: { ...item.content, connections } } : item)),
        stageConfig,
        onRunNode: (nodeId) => void runStudioCanvasNode(activeStudio.id, nodeId).catch((err) => setError(err instanceof Error ? err.message : '节点运行失败。')),
        onUploadAudio: uploadAudioReference,
        onError: (message) => setError(message),
      } : null}
    />
  );

  const currentRunLogConfig = ROUTE_RUN_LOG_CONFIG[route.kind];
  const currentRunLogBundle = currentRunLogConfig.scope === 'episode'
    ? episodeRuns
    : currentRunLogConfig.scope === 'project'
      ? projectRuns
      : EMPTY_RUNS;
  const currentRunLogItems = currentRunLogConfig.stageKinds
    ? currentRunLogBundle.workflowRuns.filter((item) => currentRunLogConfig.stageKinds?.includes(item.stageKind))
    : currentRunLogBundle.workflowRuns;
  const currentRunLogRunningCount = currentRunLogItems.filter((item) => isRunningStatus(item.status)).length;

  if (checkingAuth) {
    return (
      <AppShell title="添梯工作流" subtitle="正在连接工作流服务。">
        <div className="rounded-2xl border border-white/10 bg-black/30 px-6 py-10 text-center text-slate-300">正在启动工作流...</div>
      </AppShell>
    );
  }

  if (!user) return renderAuth();

  const header = (
    <>
      {'projectId' in route ? (
        <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
          <ArrowLeft size={16} />
          返回项目列表
        </button>
      ) : null}
      <button type="button" onClick={() => navigate('/studio')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
        <Sparkles size={16} />
        画布沙盒
      </button>
      <button type="button" onClick={() => void refreshCurrent()} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
        <RefreshCw size={16} />
        刷新
      </button>
      <button type="button" onClick={async () => { await appApi.logout(); setUser(null); setProjects([]); navigate('/'); }} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
        <LogOut size={16} />
        退出登录
      </button>
    </>
  );

  const nav = projectDetail ? (
    <div className="grid gap-3 md:grid-cols-3">
      {([
        { key: 'setup', label: '设定', title: '导演分析剧本', hint: '剧本录入与项目基线' },
        { key: 'assets', label: '资产', title: '资产生产', hint: '统一生成并锁定资产' },
        { key: 'episodes', label: '剧集', title: '按集进入工作台', hint: '分切确认与镜头生成' },
      ] as const).map((section) => {
        const active = (section.key === 'setup' && route.kind === 'project-setup') || (section.key === 'assets' && route.kind === 'project-assets') || (section.key === 'episodes' && (route.kind === 'project-episodes' || route.kind === 'episode-scenes' || route.kind === 'episode-workspace'));
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => navigate(`/projects/${projectDetail.id}/${section.key}`)}
            className={cx(
              'rounded-[22px] border p-4 text-left transition',
              active
                ? 'border-cyan-300/30 bg-cyan-300/[0.1] text-white'
                : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-white/[0.05]',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/70">{section.label}</span>
              {active ? (
                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/12 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                  当前
                </span>
              ) : null}
            </div>
            <div className="mt-3 text-base font-semibold">{section.title}</div>
            <div className="mt-2 text-sm text-white/55">{section.hint}</div>
          </button>
        );
      })}
    </div>
  ) : null;

  const activeEpisodeHeader = 'episodeId' in route
    ? episodes.find((item) => item.id === route.episodeId) || null
    : null;

  const shellTitle = route.kind === 'studio'
    ? '画布沙盒'
    : activeEpisodeHeader
      ? `${projectDetail?.title || '项目工作流'} · 第${activeEpisodeHeader.episodeNumber}集`
      : projectDetail?.title || '项目工作流';

  const shellSubtitle = route.kind === 'studio'
    ? '独立的多模态试验沙盒。'
    : route.kind === 'episode-scenes'
      ? '先查看本集脚本和分切结果，再进入工作台执行生成。'
      : route.kind === 'episode-workspace'
        ? '使用锁定资产、已连接参考和 skill 产出的提示词，在工作台内生成并审看最终分镜结果。'
        : '上传剧本 -> 拆解项目 -> 锁定资产 -> 进入剧集 -> 单集执行。';

  return (
    <AppShell
      title={shellTitle}
      subtitle={shellSubtitle}
      rightSlot={header}
      nav={nav}
    >
      {error ? <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {!health?.database ? <div className="mb-6"><HealthBadge health={health} /></div> : null}
      {route.kind === 'home' ? renderHome() : null}
      {route.kind === 'project-setup' ? renderSetup() : null}
      {route.kind === 'project-assets' ? renderAssets() : null}
      {route.kind === 'project-episodes' ? renderEpisodes() : null}
      {route.kind === 'episode-scenes' ? renderEpisodeScenes() : null}
      {route.kind === 'episode-workspace' ? renderEpisodeWorkspace() : null}
      {route.kind === 'studio' ? renderStudio() : null}
      {currentRunLogConfig.scope !== 'none' ? (
        <RunLogOverlay
          open={runLogOpen}
          title={currentRunLogConfig.title}
          subtitle={currentRunLogConfig.subtitle}
          itemsCount={currentRunLogItems.length}
          runningCount={currentRunLogRunningCount}
          onToggle={() => setRunLogOpen((current) => !current)}
          onClose={() => setRunLogOpen(false)}
        >
          {renderRuns(currentRunLogBundle, currentRunLogConfig.stageKinds)}
        </RunLogOverlay>
      ) : null}
    </AppShell>
  );
};
