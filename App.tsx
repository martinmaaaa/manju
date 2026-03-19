import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LogOut, Plus, RefreshCw, Sparkles, Upload, UserPlus, Wand2 } from 'lucide-react';
import { AppShell } from './components/workflow2/AppShell';
import { CanvasSurface } from './components/workflow2/CanvasSurface';
import { EpisodeShotStrip } from './components/workflow2/EpisodeShotStrip';
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
import {
  getEpisodeAssetNodeId,
  getEpisodePrimaryNodeId,
  harmonizeEpisodeWorkbenchContent,
  isEpisodeWorkbenchManagedNode,
  layoutEpisodeWorkbenchContent,
} from './services/workflow/runtime/episodeWorkbenchHelpers';
import {
  describeModelRuntime,
  findModelByIdentifier,
  formatModelDisplayName,
  groupModelsByFamily,
  getModelOptionValue,
  summarizeModelConfigFields,
  summarizeModelInputSupport,
} from './services/workflow/runtime/modelDeploymentHelpers';
import {
  applySkillPackSelection,
  applyStageModelParamChange,
  applyStageModelSelection,
  resolveStageModelParams,
  selectSkillPackCapabilitySchemaId,
  selectStagePromptRecipe,
  selectStageSkillPack,
} from './services/workflow/runtime/stageConfigHelpers';
import {
  collectEpisodeWorkspaceVideoInputs,
  isAudioSource,
} from './services/workflow/runtime/workspaceMediaHelpers';
import { SchemaFieldControl } from './components/workflow2/SchemaFieldControl';
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
  ModelDefinition,
  ProjectDetail,
  ProjectMember,
  ProjectRunBundle,
  ProjectSummary,
  ReviewPolicy,
  ReviewResult,
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
  | 'video_prompt_generate'
  | 'video_generate';

const EMPTY_RUNS: ProjectRunBundle = { capabilityRuns: [], workflowRuns: [] };

const STAGE_LABELS: Record<StageKind, string> = {
  script_decompose: 'Script Decompose',
  asset_design: 'Asset Design',
  episode_expand: 'Episode Expand',
  video_prompt_generate: 'Video Prompt',
  video_generate: 'Video Generate',
};

const STAGE_CAPABILITIES: Record<StageKind, string> = {
  script_decompose: 'script_decompose',
  asset_design: 'asset_extract',
  episode_expand: 'episode_expand',
  video_prompt_generate: 'video_prompt_generate',
  video_generate: 'video_generate',
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
  if (!value) return 'No timestamp';
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
  return String(
    (version.sourcePayload as Record<string, unknown>)?.source
    || (version.metadata as Record<string, unknown>)?.source
    || 'manual',
  )
    .replace(/[_-]+/g, ' ')
    .trim();
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

function isImageSource(value: string) {
  return /^data:image\/[\w.+-]+;base64,/i.test(value) || /^https?:\/\//i.test(value);
}

function isVideoSource(value: string) {
  return /^data:video\/[\w.+-]+;base64,/i.test(value) || /^https?:\/\//i.test(value);
}

function Card({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-black/30 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">{eyebrow}</div>
          <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function HealthBadge({ health }: { health: { server: boolean; database: boolean; databaseHost: string } | null }) {
  if (!health) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full px-2 py-1 text-xs', health.server ? 'bg-emerald-300/15 text-emerald-100' : 'bg-red-400/15 text-red-100')}>
          server {health.server ? 'up' : 'down'}
        </span>
        <span className={cx('rounded-full px-2 py-1 text-xs', health.database ? 'bg-emerald-300/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100')}>
          db {health.database ? 'ready' : 'unavailable'}
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
    targetMedium: 'manga video',
    globalPromptsText: '',
  });
  const [scriptText, setScriptText] = useState('');
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [memberForm, setMemberForm] = useState({ email: '', role: 'editor' as 'owner' | 'admin' | 'editor' });
  const [assetForm, setAssetForm] = useState({
    type: 'character' as 'character' | 'scene' | 'prop' | 'style',
    name: '',
    description: '',
    promptText: '',
  });
  const [assetPromptDrafts, setAssetPromptDrafts] = useState<Record<string, string>>({});
  const [assetPromptTargetId, setAssetPromptTargetId] = useState<string | null>(null);
  const [assetPromptSaveId, setAssetPromptSaveId] = useState<string | null>(null);
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [assetVersionCompareIds, setAssetVersionCompareIds] = useState<Record<string, { leftId: string | null; rightId: string | null }>>({});
  const [assetVersionSwitchId, setAssetVersionSwitchId] = useState<string | null>(null);

  const [episodeContext, setEpisodeContext] = useState<EpisodeContext | null>(null);
  const [episodeWorkspace, setEpisodeWorkspace] = useState<EpisodeWorkspace | null>(null);
  const [episodeRuns, setEpisodeRuns] = useState<ProjectRunBundle>(EMPTY_RUNS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [episodeSidebarTab, setEpisodeSidebarTab] = useState<'assets' | 'inspector'>('assets');
  const [selectedAssetCardId, setSelectedAssetCardId] = useState<string | null>(null);
  const [episodeWorkspaceSaveState, setEpisodeWorkspaceSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [episodeWorkspaceSavedAt, setEpisodeWorkspaceSavedAt] = useState<string | null>(null);
  const episodeWorkspaceRef = React.useRef<EpisodeWorkspace | null>(null);

  const [studioWorkspaces, setStudioWorkspaces] = useState<StudioWorkspace[]>([]);
  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState<string | null>(null);
  const studioWorkspacesRef = React.useRef<StudioWorkspace[]>([]);

  const activeStudio = useMemo(
    () => studioWorkspaces.find((item) => item.id === activeStudioId) || null,
    [studioWorkspaces, activeStudioId],
  );

  useEffect(() => {
    episodeWorkspaceRef.current = episodeWorkspace;
  }, [episodeWorkspace]);

  useEffect(() => {
    studioWorkspacesRef.current = studioWorkspaces;
  }, [studioWorkspaces]);

  const getCapabilityDefinition = (capabilityId: string) => selectCapability(catalogs.capabilities, capabilityId);
  const getCapabilityModels = (capabilityId: string) => selectAllowedModels(catalogs.models, getCapabilityDefinition(capabilityId));
  const getResolvedCapabilityModelId = (capabilityId: string, preferredModelId?: string) =>
    resolveCapabilityModelId(catalogs.models, getCapabilityDefinition(capabilityId), preferredModelId);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  };

  const loadCatalogs = async () => {
    const [modelsRes, capabilitiesRes, skillsRes, reviewsRes] = await Promise.all([
      appApi.listModels(),
      appApi.listCapabilities(),
      appApi.listSkillPacks(),
      appApi.listReviewPolicies(),
    ]);
    if (!modelsRes.success || !capabilitiesRes.success || !skillsRes.success || !reviewsRes.success) {
      throw new Error(modelsRes.error || capabilitiesRes.error || skillsRes.error || reviewsRes.error || 'Failed to load catalogs.');
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
    if (!res.success || !res.data) throw new Error(res.error || 'Failed to load projects.');
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
    if (!projectRes.success || !projectRes.data) throw new Error(projectRes.error || 'Failed to load project detail.');

    const setup = setupRes.data?.setup || projectRes.data.setup;
    setProjectDetail(projectRes.data);
    setProjectMembers(membersRes.data || projectRes.data.members || []);
    setProjectRuns(runsRes.data || EMPTY_RUNS);
    setStageConfig(stageRes.data || setup?.stageConfig || {});
    setAssets(assetsRes.data || []);
    setEpisodes(episodesRes.data || []);
    setSetupDraft({
      aspectRatio: setup?.aspectRatio || '9:16',
      styleSummary: setup?.styleSummary || '',
      targetMedium: setup?.targetMedium || 'manga video',
      globalPromptsText: (setup?.globalPrompts || []).join('\n'),
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
    setEpisodeSidebarTab('assets');
    setSelectedAssetCardId(null);
    setEpisodeWorkspaceSaveState(workspaceRes.data ? 'saved' : 'idle');
    setEpisodeWorkspaceSavedAt(workspaceRes.data?.updatedAt || null);
  };

  const loadStudio = async () => {
    const res = await appApi.listStudioWorkspaces();
    if (!res.success || !res.data) throw new Error(res.error || 'Failed to load studio.');
    setStudioWorkspaces(res.data);
    const nextId = activeStudioId && res.data.some((item) => item.id === activeStudioId) ? activeStudioId : res.data[0]?.id || null;
    setActiveStudioId(nextId);
    setSelectedStudioNodeId(res.data.find((item) => item.id === nextId)?.content.nodes?.[0]?.id || null);
  };

  const refreshCurrent = async () => {
    await loadHealth().catch(() => undefined);
    if ('projectId' in route) {
      await Promise.all([loadProject(route.projectId), loadProjects()]);
      if (route.kind === 'episode-workspace' || route.kind === 'episode-scenes') {
        await loadEpisode(route.projectId, route.episodeId);
      }
      return;
    }
    if (route.kind === 'studio') {
      await loadStudio();
      return;
    }
    await loadProjects();
  };

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
        setError(err instanceof Error ? err.message : 'Boot failed.');
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
        setError(err instanceof Error ? err.message : 'Load failed.');
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
    buildPayload: (workspace: EpisodeWorkspace | null) => Record<string, unknown>,
    fallbackMessage: string,
  ) => {
    if (route.kind !== 'episode-workspace') {
      return;
    }

    const syncedWorkspace = await saveCurrentEpisodeWorkspace();
    await runCapability(buildPayload(syncedWorkspace), fallbackMessage);
  };

  const resolveAssetPromptText = (asset: CanonicalAsset) => assetPromptDrafts[asset.id] || assetPrompt(asset);

  const generateImagePrompt = async (params: { asset?: CanonicalAsset }) => {
    if (route.kind !== 'project-assets') {
      return;
    }

    const stage = stageEntry(stageConfig, 'asset_design');
    const targetId = params.asset?.id || 'asset-form';
    setAssetPromptTargetId(targetId);

    try {
      const run = await runCapability({
        capabilityId: 'image_prompt_generate',
        projectId: route.projectId,
        modelId: getResolvedCapabilityModelId('image_prompt_generate', stage.modelId),
        skillPackId: stage.skillPackId,
        assetId: params.asset?.id,
        assetType: params.asset?.type || assetForm.type,
        assetName: params.asset?.name || assetForm.name,
        assetDescription: params.asset?.description || assetForm.description,
      }, 'Image prompt generation failed.');
      const prompt = String((run as CapabilityRun | null)?.outputPayload?.prompt || '').trim();
      if (!prompt) {
        throw new Error('Image prompt generation returned empty prompt.');
      }

      if (params.asset) {
        setAssetPromptDrafts((current) => ({
          ...current,
          [params.asset!.id]: prompt,
        }));
      } else {
        setAssetForm((current) => ({
          ...current,
          promptText: prompt,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image prompt generation failed.');
    } finally {
      setAssetPromptTargetId(null);
    }
  };

  const saveAssetPromptDraft = async (asset: CanonicalAsset) => {
    if (route.kind !== 'project-assets') {
      return;
    }

    const promptText = String(assetPromptDrafts[asset.id] || '').trim();
    if (!promptText) {
      return;
    }

    setAssetPromptSaveId(asset.id);
    try {
      const res = await appApi.saveAssetPromptVersion(asset.id, {
        promptText,
        description: asset.description,
        previewUrl: assetPreview(asset),
        metadata: asset.metadata,
        source: 'image_prompt_generate',
      });
      if (!res.success) {
        throw new Error(res.error || 'Save asset prompt failed.');
      }

      setAssetPromptDrafts((current) => {
        const next = { ...current };
        delete next[asset.id];
        return next;
      });
      await refreshCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save asset prompt failed.');
    } finally {
      setAssetPromptSaveId(null);
    }
  };

  const toggleAssetVersions = (asset: CanonicalAsset) => {
    setExpandedAssetId((current) => current === asset.id ? null : asset.id);
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
        throw new Error(res.error || 'Set current asset version failed.');
      }
      await refreshCurrent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Set current asset version failed.');
    } finally {
      setAssetVersionSwitchId(null);
    }
  };

  const renderAssetVersionCompareCard = (
    title: string,
    version: AssetVersion | null,
    currentVersionId: string | null,
  ) => {
    if (!version) {
      return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
          No version selected.
        </div>
      );
    }

    const isCurrent = version.id === currentVersionId;
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">{title}</div>
            <div className="mt-2 text-sm font-semibold text-white">V{version.versionNumber}</div>
          </div>
          {isCurrent ? (
            <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
              current
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-xs leading-6 text-white/45">
          <div>{fmt(version.createdAt)}</div>
          <div>{assetVersionSourceLabel(version) || 'manual'}</div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {version.previewUrl ? (
            <img src={version.previewUrl} alt={`Version ${version.versionNumber}`} className="h-48 w-full object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-white/35">No preview</div>
          )}
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          {version.promptText || 'No prompt text.'}
        </div>
      </div>
    );
  };

  const uploadAudioReference = async (file: File) => {
    const res = await appApi.uploadAudioReference(file);
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Upload audio reference failed.');
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

    return {
      ...nextContent,
      shotStrip: buildEpisodeShotStrip({
        episode,
        episodeContext,
        storyboardText: storyboardNodeText,
        videoPromptText: promptNodeText,
        currentStrip: nextContent.shotStrip as EpisodeShotStripState | null | undefined,
      }),
    };
  };

  useEffect(() => {
    if (catalogs.models.length === 0) {
      return;
    }

    setEpisodeWorkspace((current) => {
      if (!current) {
        return current;
      }

      const normalizedContent = normalizeCanvasContent(current.content, catalogs.models, stageConfig);
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
    setEpisodeWorkspaceSaveState((current) => (current === 'saving' ? current : 'dirty'));
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

  const updateNodeInContent = (
    content: EpisodeWorkspace['content'] | StudioWorkspace['content'],
    nodeId: string,
    patch: Partial<CanvasNode>,
  ) => ({
    ...content,
    nodes: (content.nodes || []).map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    connections: Array.isArray(content.connections) ? content.connections : [],
  });

  const updateEpisodeWorkspaceDraft = (
    buildNextContent: (content: EpisodeWorkspace['content']) => EpisodeWorkspace['content'],
    options?: { selectedNodeId?: string | null },
  ) => {
    const currentWorkspace = episodeWorkspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    const nextContent = buildNextContent(currentWorkspace.content);
    if (!sameCanvasContent(nextContent, currentWorkspace.content)) {
      setEpisodeWorkspace((current) => current ? {
        ...current,
        content: nextContent,
      } : current);
      setEpisodeWorkspaceSaveState('dirty');
    }
    if (options?.selectedNodeId !== undefined) {
      setSelectedNodeId(options.selectedNodeId);
    }
  };

  const saveEpisodeWorkspaceContent = async (nextContent?: EpisodeWorkspace['content']) => {
    if (route.kind !== 'episode-workspace' || !episodeWorkspace) {
      return episodeWorkspace;
    }

    const contentToSave = normalizeCanvasContent(nextContent || episodeWorkspace.content, catalogs.models, stageConfig);
    setEpisodeWorkspaceSaveState('saving');
    const res = await appApi.saveEpisodeWorkspace(route.episodeId, contentToSave);
    if (!res.success || !res.data) {
      setEpisodeWorkspaceSaveState('dirty');
      throw new Error(res.error || 'Save episode workspace failed.');
    }

    setEpisodeWorkspace({
      ...res.data,
      content: normalizeCanvasContent(res.data.content, catalogs.models, stageConfig),
    });
    setEpisodeWorkspaceSaveState('saved');
    setEpisodeWorkspaceSavedAt(res.data.updatedAt || new Date().toISOString());
    return res.data;
  };

  const saveStudioWorkspaceContent = async (workspaceId: string, nextContent?: StudioWorkspace['content']) => {
    const currentWorkspace = studioWorkspaces.find((item) => item.id === workspaceId) || null;
    if (!currentWorkspace) {
      throw new Error('Studio workspace not found.');
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
      throw new Error(res.error || 'Canvas node run failed.');
    }

    const normalizedContent = normalizeCanvasContent(res.data?.content, catalogs.models, stageConfig);
    const normalizedNode = normalizedContent.nodes.find((item) => item.id === nodeId) || sourceNode;
    const nextContent = targetShotId
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
      : normalizedContent;

    setEpisodeWorkspace((current) => current ? {
      ...current,
      content: nextContent,
    } : current);
    setEpisodeWorkspaceSaveState('saved');
    setEpisodeWorkspaceSavedAt(new Date().toISOString());

    if (res.data.pending && res.data.providerJob?.id) {
      await pollJimengNodeJob('episode', nodeId, res.data.providerJob.id, undefined, targetShotId);
    }
  };

  const runStudioCanvasNode = async (workspaceId: string, nodeId: string) => {
    const currentStudio = studioWorkspaces.find((item) => item.id === workspaceId) || null;
    if (!currentStudio) {
      throw new Error('Studio workspace not found.');
    }

    const snapshot = normalizeCanvasContent(currentStudio.content, catalogs.models, stageConfig);
    const res = await appApi.runCanvasNode({
      workspaceKind: 'studio',
      workspaceId,
      nodeId,
      content: snapshot,
    });
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Canvas node run failed.');
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
      return <div className="text-sm text-slate-300">No run records yet.</div>;
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
                  {run.status}
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
                    {review.policyId}
                  </div>
                ))}
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
                  {linkedRun?.outputPayload?.usedLiveModel ? 'live model' : 'fallback'}
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
      title="Momo Workflow"
      subtitle="Project Workflow handles projects, assets, and episodes. Canvas Studio stays independent."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card eyebrow="Workflow" title="Main pipeline">
          <div className="grid gap-3">
            {[
              'Upload script and create project',
              'Run Seedance-based script decomposition',
              'Lock canonical assets for characters, scenes, and props',
              'Enter per-episode workspace with local-only context',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card eyebrow="Auth" title={authMode === 'login' ? 'Login' : 'Register'}>
          <HealthBadge health={health} />
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              const res = authMode === 'login'
                ? await appApi.login({ email: authForm.email, password: authForm.password })
                : await appApi.register({ email: authForm.email, password: authForm.password, name: authForm.name });
              if (!res.success || !res.data) {
                setError(res.error || 'Auth failed.');
                return;
              }
              setUser(res.data);
              await Promise.all([loadCatalogs(), loadProjects()]);
            }}
          >
            {authMode === 'register' ? (
              <input
                value={authForm.name}
                onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                placeholder="Name"
              />
            ) : null}
            <input
              value={authForm.email}
              onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
              placeholder="Email"
            />
            <input
              type="password"
              value={authForm.password}
              onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
              placeholder="Password"
            />
            {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
            <button className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black">
              {authMode === 'login' ? 'Login' : 'Create account'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setAuthMode((current) => (current === 'login' ? 'register' : 'login'))}
            className="mt-4 text-sm text-cyan-200"
          >
            {authMode === 'login' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </Card>
      </div>
    </AppShell>
  );

  const renderHome = () => (
    <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
      <Card eyebrow="Create" title="New project">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const res = await appApi.createProject({ title: projectTitle.trim() });
              if (!res.success || !res.data) throw new Error(res.error || 'Create project failed.');
              setProjectTitle('');
              await loadProjects();
              navigate(`/projects/${res.data.id}/setup`);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Create project failed.');
            }
          }}
        >
          <input
            value={projectTitle}
            onChange={(event) => setProjectTitle(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
            placeholder="Project title"
          />
          <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black">
            <Plus size={16} />
            Create project
          </button>
        </form>
      </Card>

      <Card eyebrow="Projects" title="My projects">
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
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{project.role}</div>
              </div>
              <div className="mt-3 text-sm text-slate-300">
                Assets {project.assetCount} · Episodes {project.episodeCount} · Script {project.hasScript ? 'Yes' : 'No'}
              </div>
              <div className="mt-2 text-xs text-white/45">Updated {fmt(project.updatedAt)}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );

  const renderSetup = () => (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-6">
        <Card
          eyebrow="Script Intake"
          title="Upload script"
          action={(
            <button
              type="button"
              onClick={() => void runCapability({
                capabilityId: 'script_decompose',
                projectId: route.kind === 'project-setup' ? route.projectId : '',
                modelId: getResolvedCapabilityModelId('script_decompose', stageEntry(stageConfig, 'script_decompose').modelId),
                skillPackId: stageEntry(stageConfig, 'script_decompose').skillPackId,
              }, 'Script decomposition failed.')}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              <Wand2 size={16} />
              Run decomposition
            </button>
          )}
        >
          <textarea
            value={scriptText}
            onChange={(event) => setScriptText(event.target.value)}
            className="min-h-[220px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-100 outline-none"
            placeholder="Paste script text here, or upload docx / pdf / txt / md."
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
              <Upload size={16} />
              Upload file
              <input
                type="file"
                accept=".doc,.docx,.pdf,.txt,.md"
                className="hidden"
                onChange={(event) => setScriptFile(event.target.files?.[0] || null)}
              />
            </label>
            {scriptFile ? <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">{scriptFile.name}</div> : null}
            <button
              type="button"
              onClick={async () => {
                try {
                  if (route.kind !== 'project-setup') return;
                  const res = await appApi.uploadScriptSource(route.projectId, { textContent: scriptText, file: scriptFile });
                  if (!res.success) throw new Error(res.error || 'Upload script failed.');
                  setScriptText('');
                  setScriptFile(null);
                  await refreshCurrent();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Upload script failed.');
                }
              }}
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black"
            >
              Save script source
            </button>
          </div>
        </Card>

        <Card eyebrow="Project Setup" title="Project setup">
          <div className="grid gap-4 md:grid-cols-2">
            <select value={setupDraft.aspectRatio} onChange={(event) => setSetupDraft((current) => ({ ...current, aspectRatio: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
              {['1:1', '3:4', '4:3', '9:16', '16:9'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <input value={setupDraft.targetMedium} onChange={(event) => setSetupDraft((current) => ({ ...current, targetMedium: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="Target medium" />
            <textarea value={setupDraft.styleSummary} onChange={(event) => setSetupDraft((current) => ({ ...current, styleSummary: event.target.value }))} className="min-h-[120px] rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none md:col-span-2" placeholder="Style summary" />
            <textarea value={setupDraft.globalPromptsText} onChange={(event) => setSetupDraft((current) => ({ ...current, globalPromptsText: event.target.value }))} className="min-h-[120px] rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none md:col-span-2" placeholder="Global prompts, one per line" />
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                if (route.kind !== 'project-setup') return;
                const res = await appApi.updateProjectSetup(route.projectId, {
                  aspectRatio: setupDraft.aspectRatio,
                  styleSummary: setupDraft.styleSummary,
                  targetMedium: setupDraft.targetMedium,
                  globalPrompts: splitLines(setupDraft.globalPromptsText),
                });
                if (!res.success) throw new Error(res.error || 'Save project setup failed.');
                await refreshCurrent();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Save project setup failed.');
              }
            }}
            className="mt-5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
          >
            Save project setup
          </button>
        </Card>
      </section>

      <section className="space-y-6">
        <Card eyebrow="Stage Config" title="Stage configuration">
          <div className="grid gap-4">
            {(Object.keys(STAGE_LABELS) as StageKind[]).map((stageKind) => {
              const stage = stageEntry(stageConfig, stageKind);
              const stageSkills = catalogs.skillPacks.filter((item) => item.stageKind === stageKind);
              const stageCapability = getCapabilityDefinition(stage.capabilityId);
              const stageModels = getCapabilityModels(stage.capabilityId);
              const groupedStageModels = groupModelsByFamily(stageModels);
              const resolvedStageModelId = getResolvedCapabilityModelId(stage.capabilityId, stage.modelId);
              const selectedStageModel = findModelByIdentifier(stageModels, resolvedStageModelId);
              const resolvedStageModelParams = resolveStageModelParams({
                ...stage,
                modelId: resolvedStageModelId,
              }, catalogs.models);
              const selectedSkillPack = selectStageSkillPack(catalogs.skillPacks, stageKind, stage);
              const selectedPromptRecipe = selectStagePromptRecipe(stageKind, stage, selectedSkillPack);
              return (
                <div key={stageKind} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="font-semibold text-white">{STAGE_LABELS[stageKind]}</div>
                  {stageCapability ? <div className="mt-2 text-xs text-white/45">Capability: {stageCapability.name}</div> : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <select
                      value={stage.skillPackId || ''}
                      onChange={(event) => {
                        const nextSkillPack = stageSkills.find((item) => item.id === event.target.value) || null;
                        setStageConfig((current) => ({
                          ...current,
                          [stageKind]: applySkillPackSelection(stageKind, stageEntry(current, stageKind), nextSkillPack),
                        }));
                      }}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                    >
                      <option value="">Choose skill pack</option>
                      {stageSkills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <select
                      value={resolvedStageModelId || ''}
                      onChange={(event) => setStageConfig((current) => ({
                        ...current,
                        [stageKind]: applyStageModelSelection(
                          stageEntry(current, stageKind),
                          event.target.value,
                          catalogs.models,
                        ),
                      }))}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                    >
                      <option value="">Choose model</option>
                      {groupedStageModels.map((group) => (
                        <optgroup key={group.familyId} label={group.familyName}>
                          {group.deployments.map((item) => (
                            <option key={item.deploymentId} value={getModelOptionValue(item)}>
                              {formatModelDisplayName(item)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {selectedStageModel ? (
                    <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/65">Model deployment</div>
                      <div className="mt-3 text-sm font-semibold text-white">{formatModelDisplayName(selectedStageModel)}</div>
                      <div className="mt-2 text-xs text-cyan-100/70">{describeModelRuntime(selectedStageModel)}</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Inputs</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {summarizeModelInputSupport(selectedStageModel).map((item) => (
                              <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Params</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {summarizeModelConfigFields(selectedStageModel).map((item) => (
                              <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Deployment</div>
                          <div className="mt-2 text-xs leading-6 text-slate-300">
                            <div>{selectedStageModel.deploymentId}</div>
                            <div className="text-white/45">{selectedStageModel.providerModelId}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {selectedStageModel && Object.keys(selectedStageModel.configSchema || {}).length > 0 ? (
                    <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      {Object.entries(selectedStageModel.configSchema).map(([fieldKey, definition]) => (
                        <SchemaFieldControl
                          key={fieldKey}
                          fieldKey={fieldKey}
                          definition={definition}
                          value={resolvedStageModelParams[fieldKey]}
                          onChange={(nextValue) => setStageConfig((current) => ({
                            ...current,
                            [stageKind]: applyStageModelParamChange(
                              {
                                ...stageEntry(current, stageKind),
                                modelId: getResolvedCapabilityModelId(
                                  stageEntry(current, stageKind).capabilityId,
                                  stageEntry(current, stageKind).modelId,
                                ),
                              },
                              fieldKey,
                              nextValue,
                              catalogs.models,
                            ),
                          }))}
                        />
                      ))}
                    </div>
                  ) : null}
                  {selectedSkillPack ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">
                      <div className="font-semibold text-white">{selectedSkillPack.name}</div>
                      <div className="mt-2 leading-7">{selectedSkillPack.description}</div>
                      <div className="mt-2 text-xs leading-6 text-white/55">Method: {selectedSkillPack.promptMethodology}</div>
                      {selectSkillPackCapabilitySchemaId(selectedSkillPack, stage.capabilityId) ? (
                        <div className="mt-2 text-xs leading-6 text-white/45">
                          Capability schema: {selectSkillPackCapabilitySchemaId(selectedSkillPack, stage.capabilityId)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {stageKind === 'video_prompt_generate' && selectedSkillPack?.promptRecipes.length ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Prompt Recipe</div>
                      <select
                        value={selectedPromptRecipe?.id || ''}
                        onChange={(event) => setStageConfig((current) => ({
                          ...current,
                          [stageKind]: {
                            ...stageEntry(current, stageKind),
                            promptRecipeId: event.target.value || undefined,
                          },
                        }))}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                      >
                        {selectedSkillPack.promptRecipes.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      {selectedPromptRecipe ? <div className="mt-3 text-sm leading-7 text-slate-300">{selectedPromptRecipe.description}</div> : null}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {catalogs.reviewPolicies.map((policy) => {
                      const selected = stage.reviewPolicyIds.includes(policy.id);
                      return (
                        <button
                          key={policy.id}
                          type="button"
                          onClick={() => setStageConfig((current) => ({
                            ...current,
                            [stageKind]: {
                              ...stageEntry(current, stageKind),
                              reviewPolicyIds: selected
                                ? stage.reviewPolicyIds.filter((item) => item !== policy.id)
                                : [...stage.reviewPolicyIds, policy.id],
                            },
                          }))}
                          className={cx(
                            'rounded-full px-3 py-1 text-xs',
                            selected ? 'bg-emerald-300 text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200',
                          )}
                        >
                          {policy.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={async () => {
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
                if (!res.success) throw new Error(res.error || 'Save stage config failed.');
                await refreshCurrent();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Save stage config failed.');
              }
            }}
            className="mt-5 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black"
          >
            Save stage config
          </button>
        </Card>

        <Card eyebrow="Members" title="Project members">
          <div className="grid gap-3">
            {projectMembers.map((member) => (
              <div key={member.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{member.name || member.email}</div>
                    <div className="mt-1 text-xs text-white/45">{member.email}</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{member.role}</div>
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                if (route.kind !== 'project-setup') return;
                const res = await appApi.addProjectMember(route.projectId, { email: memberForm.email.trim(), role: memberForm.role });
                if (!res.success) throw new Error(res.error || 'Add member failed.');
                setMemberForm({ email: '', role: 'editor' });
                await refreshCurrent();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Add member failed.');
              }
            }}
          >
            <input value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="Member email" />
            <select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value as 'owner' | 'admin' | 'editor' }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
              <option value="editor">editor</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
            <button className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black">
              <UserPlus size={16} />
              Add
            </button>
          </form>
        </Card>

        <Card eyebrow="Runs" title="Recent runs">
          {renderRuns(projectRuns)}
        </Card>
      </section>
    </div>
  );

  const renderAssets = () => (
    <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <Card
        eyebrow="Asset Intake"
        title="Asset lock"
        action={(
          <button
            type="button"
            onClick={() => void runCapability({
              capabilityId: 'asset_extract',
              projectId: route.kind === 'project-assets' ? route.projectId : '',
              modelId: getResolvedCapabilityModelId('asset_extract', stageEntry(stageConfig, 'asset_design').modelId),
              skillPackId: stageEntry(stageConfig, 'asset_design').skillPackId,
            }, 'Asset extraction failed.')}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Run asset extract
          </button>
        )}
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              if (route.kind !== 'project-assets') return;
              const res = await appApi.createAsset(route.projectId, assetForm);
              if (!res.success) throw new Error(res.error || 'Create asset failed.');
              setAssetForm({ type: 'character', name: '', description: '', promptText: '' });
              await refreshCurrent();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Create asset failed.');
            }
          }}
        >
          <select value={assetForm.type} onChange={(event) => setAssetForm((current) => ({ ...current, type: event.target.value as 'character' | 'scene' | 'prop' | 'style' }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
            {['character', 'scene', 'prop', 'style'].map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input value={assetForm.name} onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="Asset name" />
          <textarea value={assetForm.description} onChange={(event) => setAssetForm((current) => ({ ...current, description: event.target.value }))} className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="Asset description" />
          <textarea value={assetForm.promptText} onChange={(event) => setAssetForm((current) => ({ ...current, promptText: event.target.value }))} className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="Asset prompt" />
          <button
            type="button"
            onClick={() => void generateImagePrompt({})}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100"
          >
            {assetPromptTargetId === 'asset-form' ? 'Generating image prompt...' : 'Generate image prompt'}
          </button>
          <button className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-black">Create asset</button>
        </form>
        <div className="mt-6">{renderRuns(projectRuns, ['asset_design'])}</div>
      </Card>

      <Card eyebrow="Canonical Assets" title="Asset library">
        <div className="grid gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:grid-cols-[180px_1fr]">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                {assetPreview(asset) ? (
                  <img src={assetPreview(asset)} alt={asset.name} className="h-full min-h-[180px] w-full object-cover" />
                ) : (
                  <div className="flex min-h-[180px] items-center justify-center text-sm text-white/35">No preview</div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">{asset.type}</div>
                    <div className="mt-2 text-xl font-semibold text-white">{asset.name}</div>
                  </div>
                  <div className={cx('rounded-full border px-3 py-1 text-xs', asset.isLocked ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>
                    {asset.isLocked ? 'locked' : 'unlocked'}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{asset.description || 'No description.'}</p>
                {resolveAssetPromptText(asset) ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">
                    {resolveAssetPromptText(asset)}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void generateImagePrompt({ asset })}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                  >
                    {assetPromptTargetId === asset.id ? 'Generating prompt...' : 'Generate image prompt'}
                  </button>
                  {assetPromptDrafts[asset.id] ? (
                    <button
                      type="button"
                      onClick={() => void saveAssetPromptDraft(asset)}
                      className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black"
                    >
                      {assetPromptSaveId === asset.id ? 'Saving prompt...' : 'Save prompt to asset'}
                    </button>
                  ) : null}
                  {assetCapability(asset) ? (
                    <button
                      type="button"
                      onClick={() => void runCapability({
                        capabilityId: assetCapability(asset),
                        projectId: route.kind === 'project-assets' ? route.projectId : '',
                        assetId: asset.id,
                        modelId: getResolvedCapabilityModelId(assetCapability(asset) || ''),
                        prompt: resolveAssetPromptText(asset),
                      }, 'Asset preview generation failed.')}
                      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Generate preview
                    </button>
                  ) : null}
                  {assetPromptDrafts[asset.id] ? (
                    <button
                      type="button"
                      onClick={() => setAssetPromptDrafts((current) => {
                        const next = { ...current };
                        delete next[asset.id];
                        return next;
                      })}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                    >
                      Clear prompt draft
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleAssetVersions(asset)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                  >
                    {expandedAssetId === asset.id ? 'Hide versions' : 'Versions'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = asset.isLocked ? await appApi.unlockAsset(asset.id) : await appApi.lockAsset(asset.id);
                        if (!res.success) throw new Error(res.error || 'Asset lock failed.');
                        await refreshCurrent();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Asset lock failed.');
                      }
                    }}
                    className={cx('rounded-full px-4 py-2 text-sm', asset.isLocked ? 'border border-white/10 bg-white/[0.04] text-slate-100' : 'bg-emerald-300 text-black')}
                  >
                    {asset.isLocked ? 'Unlock asset' : 'Lock asset'}
                  </button>
                  <div className="text-xs text-white/45">Versions {asset.versions.length} · Updated {fmt(asset.updatedAt)}</div>
                </div>
                {expandedAssetId === asset.id ? (() => {
                  const activeVersion = currentAssetVersion(asset);
                  const orderedVersions = [...asset.versions].sort((left, right) => right.versionNumber - left.versionNumber);
                  const compareState = assetVersionCompareIds[asset.id] || {
                    leftId: activeVersion?.id || null,
                    rightId: orderedVersions.find((item) => item.id !== activeVersion?.id)?.id || activeVersion?.id || null,
                  };
                  const leftVersion = asset.versions.find((item) => item.id === compareState.leftId) || null;
                  const rightVersion = asset.versions.find((item) => item.id === compareState.rightId) || null;

                  return (
                    <div className="mt-5 grid gap-5 rounded-[28px] border border-white/10 bg-black/25 p-5 xl:grid-cols-[0.94fr_1.06fr]">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Version history</div>
                            <div className="mt-2 text-sm text-slate-300">Prompt and preview revisions for this asset.</div>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                            {orderedVersions.length} versions
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {orderedVersions.map((version) => {
                            const isCurrent = version.id === asset.currentVersionId;
                            const isCompareLeft = compareState.leftId === version.id;
                            const isCompareRight = compareState.rightId === version.id;

                            return (
                              <div
                                key={version.id}
                                className={cx(
                                  'rounded-2xl border p-4 transition',
                                  isCurrent ? 'border-emerald-300/25 bg-emerald-300/8' : 'border-white/10 bg-white/[0.03]',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-white">V{version.versionNumber}</div>
                                    <div className="mt-1 text-xs text-white/45">
                                      {fmt(version.createdAt)} · {assetVersionSourceLabel(version)}
                                    </div>
                                  </div>
                                  {isCurrent ? (
                                    <div className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                                      current
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-3 line-clamp-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-300">
                                  {version.promptText || 'No prompt text.'}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setAssetCompareSlot(asset.id, 'leftId', version.id)}
                                    className={cx(
                                      'rounded-full border px-3 py-1.5 text-xs',
                                      isCompareLeft ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100' : 'border-white/10 bg-white/[0.04] text-slate-200',
                                    )}
                                  >
                                    Compare A
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAssetCompareSlot(asset.id, 'rightId', version.id)}
                                    className={cx(
                                      'rounded-full border px-3 py-1.5 text-xs',
                                      isCompareRight ? 'border-fuchsia-300/30 bg-fuchsia-300/12 text-fuchsia-100' : 'border-white/10 bg-white/[0.04] text-slate-200',
                                    )}
                                  >
                                    Compare B
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isCurrent || assetVersionSwitchId === version.id}
                                    onClick={() => void setAssetCurrentVersionSelection(asset, version.id)}
                                    className={cx(
                                      'rounded-full px-3 py-1.5 text-xs',
                                      isCurrent
                                        ? 'border border-white/10 bg-white/[0.04] text-white/45'
                                        : 'bg-white text-black',
                                    )}
                                  >
                                    {assetVersionSwitchId === version.id ? 'Switching...' : isCurrent ? 'Current version' : 'Set as current'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Version compare</div>
                        <div className="mt-2 text-sm text-slate-300">Use A/B compare to review prompt changes and preview drift before switching the active version.</div>
                        <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                          {renderAssetVersionCompareCard('Compare A', leftVersion, asset.currentVersionId)}
                          {renderAssetVersionCompareCard('Compare B', rightVersion, asset.currentVersionId)}
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
  const renderEpisodes = () => (
    <div className="space-y-6">
      <Card eyebrow="Runs" title="Episode stage status">
        {renderRuns(projectRuns, ['episode_expand', 'video_prompt_generate', 'video_generate'])}
      </Card>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {episodes.map((episode) => {
          const previewCards = buildEpisodeSceneCards(episode, episode.context || null, '').slice(0, 3);
          const shotTotal = previewCards.reduce((sum, item) => sum + item.shotCount, 0);
          return (
            <div key={episode.id} className="rounded-[28px] border border-white/10 bg-black/30 p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Episode {episode.episodeNumber}</div>
                <div className={cx('rounded-full border px-3 py-1 text-xs', ['ready', 'generated'].includes(episode.status) ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>
                  {episode.status}
                </div>
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-white">{episode.title}</h2>
              <p className="mt-4 line-clamp-5 text-sm leading-7 text-slate-300">{episode.synopsis}</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                {previewCards.length > 0 ? `${previewCards.length} 个分切片段 · 约 ${shotTotal} 个镜头` : 'No episode context yet.'}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (route.kind !== 'project-episodes') return;
                      if (!['ready', 'generated'].includes(episode.status)) {
                        const stage = stageEntry(stageConfig, 'episode_expand');
                        const res = await appApi.analyzeEpisode(route.projectId, episode.id, {
                          skillPackId: stage.skillPackId,
                          modelId: getResolvedCapabilityModelId('episode_expand', stage.modelId),
                        });
                        if (!res.success) throw new Error(res.error || 'Episode analysis failed.');
                        await refreshCurrent();
                      }
                      navigate(`/projects/${route.projectId}/episodes/${episode.id}/scenes`);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Episode analysis failed.');
                    }
                  }}
                  className="rounded-full bg-[#173515] px-4 py-2 text-sm font-semibold text-emerald-100"
                >
                  查看详情
                </button>
                <button
                  type="button"
                  onClick={() => route.kind === 'project-episodes' && navigate(`/projects/${route.projectId}/episodes/${episode.id}/workspace`)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                >
                  进入工作台
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderEpisodeScenes = () => {
    const currentEpisode = route.kind === 'episode-scenes'
      ? episodes.find((item) => item.id === route.episodeId) || null
      : null;
    const storyboardText = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('storyboard-'))?.content || '';
    const sceneCards = buildEpisodeSceneCards(currentEpisode, episodeContext, storyboardText);

    return (
      <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <Card
          eyebrow="Script"
          title={currentEpisode ? `${currentEpisode.title} · 脚本内容` : '单集脚本'}
          action={(
            <button
              type="button"
              onClick={() => route.kind === 'episode-scenes' && navigate(`/projects/${route.projectId}/episodes/${route.episodeId}/workspace`)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              进入工作台
            </button>
          )}
        >
          <div className="min-h-[680px] whitespace-pre-wrap rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5 text-sm leading-7 text-slate-200">
            {currentEpisode?.sourceText || currentEpisode?.synopsis || 'No episode script available yet.'}
          </div>
        </Card>

        <Card eyebrow="Scenes" title="场景列表">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            {sceneCards.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => route.kind === 'episode-scenes' && navigate(`/projects/${route.projectId}/episodes/${route.episodeId}/workspace`)}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
              >
                <div className="text-xl font-semibold text-white">{scene.title}</div>
                <div className="mt-3 text-sm leading-7 text-slate-300">{scene.summary}</div>
                <div className="mt-6 flex items-center justify-between text-xs text-cyan-200">
                  <span>{scene.shotCount} 个镜头</span>
                  <span>{scene.durationLabel}</span>
                </div>
              </button>
            ))}
          </div>
          {sceneCards.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-sm text-slate-300">
              先运行单集分析或分镜生成，才能看到分切结果。
            </div>
          ) : null}
        </Card>
      </div>
    );
  };

  const renderEpisodeWorkspace = () => {
    const currentEpisode = route.kind === 'episode-workspace'
      ? episodes.find((item) => item.id === route.episodeId) || null
      : null;
    const videoPromptStage = stageEntry(stageConfig, 'video_prompt_generate');
    const videoPromptSkillPack = selectStageSkillPack(catalogs.skillPacks, 'video_prompt_generate', videoPromptStage);
    const activePromptRecipe = selectStagePromptRecipe('video_prompt_generate', videoPromptStage, videoPromptSkillPack);
    const storyboardText = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('storyboard-'))?.content || '';
    const videoPromptText = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('prompt-'))?.content || '';
    const storyboardNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('storyboard-')) || null;
    const audioReference = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('audio-'))?.content || '';
    const episodeConnections = episodeWorkspace?.content.connections || [];
    const selectedWorkspaceNode = episodeWorkspace?.content.nodes.find((item) => item.id === selectedNodeId) || null;
    const videoNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('video-')) || null;
    const imageNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('visual-')) || null;
    const promptNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('prompt-')) || null;
    const lockedAssets = assets.filter((asset) => asset.isLocked);
    const assetNodesByAssetId = new Map(
      (episodeWorkspace?.content.nodes || [])
        .filter((node) => String(node.metadata?.lockedAssetId || '').trim())
        .map((node) => [String(node.metadata?.lockedAssetId || '').trim(), node]),
    );
    const assetSyncStateByAssetId = new Map(lockedAssets.map((asset) => {
      const assetNode = assetNodesByAssetId.get(asset.id) || null;
      const assetVersion = assetVersionDisplay(asset);
      const nodeVersion = nodeAssetVersionDisplay(assetNode);
      const isSynced = Boolean(assetNode) && assetVersion.versionId === nodeVersion.versionId;
      return [asset.id, {
        assetNode,
        assetVersion,
        nodeVersion,
        isSynced,
      }];
    }));
    const syncedAssetCount = lockedAssets.filter((asset) => assetNodesByAssetId.has(asset.id)).length;
    const syncedAssetVersionCount = lockedAssets.filter((asset) => assetSyncStateByAssetId.get(asset.id)?.isSynced).length;
    const workspaceVideoInputs = collectEpisodeWorkspaceVideoInputs(episodeWorkspace);
    const connectedAudioReference = workspaceVideoInputs.audioReferenceUrls[0] || audioReference;
    const hasAudioReference = isAudioSource(connectedAudioReference);
    const shotStrip = (episodeWorkspace?.content.shotStrip as EpisodeShotStripState | undefined) || buildEpisodeShotStrip({
      episode: currentEpisode,
      episodeContext,
      storyboardText,
      videoPromptText,
    });
    const activeShot = findSelectedEpisodeShot(shotStrip);
    const activeShotJob = activeShot?.job || null;
    const previewNode = selectedWorkspaceNode || videoNode || imageNode || null;
    const selectedPreviewModel = previewNode?.modelId ? findModelByIdentifier(catalogs.models, previewNode.modelId) : null;
    const previewNodeMetadata = (previewNode?.output?.metadata || {}) as Record<string, unknown>;
    const previewAsyncState = activeShotJob || (
      previewNode?.type === 'video' && (
        typeof previewNodeMetadata.status === 'string'
        || previewNode.runStatus === 'running'
        || previewNode.runStatus === 'error'
      )
        ? buildEpisodeShotJobState({
            sourceNodeId: previewNode.id,
            providerJobId: typeof previewNode.output?.providerJobId === 'string' ? previewNode.output.providerJobId : null,
            status: typeof previewNodeMetadata.status === 'string'
              ? previewNodeMetadata.status
              : previewNode.runStatus === 'error'
                ? 'FAILED'
                : 'RUNNING',
            phase: typeof previewNodeMetadata.phase === 'string' ? previewNodeMetadata.phase : undefined,
            progress: typeof previewNodeMetadata.progress === 'number' ? previewNodeMetadata.progress : undefined,
            error: previewNode.error || null,
            updatedAt: previewNode.lastRunAt,
            previewUrl: getNodePrimaryValue(previewNode),
          })
        : null
    );
    const previewValue = activeShot?.clip?.videoUrl || activeShotJob?.previewUrl || (previewNode ? getNodePrimaryValue(previewNode) : '');
    const previewTitle = activeShot?.title || previewNode?.title || 'Current preview';
    const previewSummary = activeShot?.summary || activeShot?.clip?.promptText || '';
    const assetGroups = [
      { key: 'character', label: '人物资产', items: lockedAssets.filter((asset) => asset.type === 'character') },
      { key: 'scene', label: '场景资产', items: lockedAssets.filter((asset) => asset.type === 'scene') },
      { key: 'prop', label: '道具资产', items: lockedAssets.filter((asset) => asset.type === 'prop') },
    ].filter((group) => group.items.length > 0);
    const shotStripSummary = summarizeEpisodeShotStrip(shotStrip);
    const activeShotRecommendedModel = activeShot?.recommendedModelId
      ? findModelByIdentifier(catalogs.models, activeShot.recommendedModelId)
      : null;
    const promptStageRun = latestStageCapabilityRun(episodeRuns, 'video_prompt_generate');
    const videoStageRun = latestStageCapabilityRun(episodeRuns, 'video_generate');
    const reviewPolicyNameMap = new Map(catalogs.reviewPolicies.map((policy) => [policy.id, policy.name]));
    const reviewGateWarnings = [
      { stageLabel: '视频提示词', run: promptStageRun },
      { stageLabel: '视频生成', run: videoStageRun },
    ].flatMap(({ stageLabel, run }) => {
      const failedReviews = failedReviewList(run);
      const reviewIssues = failedReviews.map((review) => ({
        stageLabel,
        label: reviewPolicyNameMap.get(review.policyId) || review.policyId,
        notes: review.notes,
      }));

      if (reviewIssues.length > 0) {
        return reviewIssues;
      }

      if (run?.status === 'failed' && run.error) {
        return [{
          stageLabel,
          label: '运行失败',
          notes: run.error,
        }];
      }

      return [];
    });
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
      setSelectedAssetCardId(assetId);
      const node = assetNodesByAssetId.get(assetId) || null;
      if (!node) {
        return;
      }
      focusEpisodeNode(node);
    };

    const selectShot = (slotId: string) => {
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        shotStrip: selectEpisodeShotSlot(currentContent.shotStrip as EpisodeShotStripState | undefined, slotId),
      }));
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
        setError(err instanceof Error ? err.message : 'Shot retry failed.');
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
          throw new Error(res.error || 'Cancel Jimeng job failed.');
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
        setError(err instanceof Error ? err.message : 'Cancel Jimeng job failed.');
      }
    };

    const normalizeAssetReferenceName = (value: string) => String(value || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .trim();

    const activeShotRecommendedAssets = activeShot?.referenceAssetNames?.length
      ? activeShot.referenceAssetNames.map((name) => {
          const normalized = normalizeAssetReferenceName(name);
          const matchedAsset = lockedAssets.find((asset) => {
            const assetName = normalizeAssetReferenceName(asset.name);
            return assetName === normalized || assetName.includes(normalized) || normalized.includes(assetName);
          }) || null;
          return {
            name,
            asset: matchedAsset,
          };
        })
      : [];

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

    const prepareActiveShotWorkbench = () => {
      if (!activeShot || !episodeWorkspace || !currentEpisode || route.kind !== 'episode-workspace') {
        return;
      }

      const primaryVideoNodeId = getEpisodePrimaryNodeId('video', route.episodeId);
      const primaryPromptNodeId = getEpisodePrimaryNodeId('prompt', route.episodeId);
      const matchedAssets = activeShotRecommendedAssets
        .map((entry) => entry.asset)
        .filter((asset): asset is CanonicalAsset => Boolean(asset));
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

        const promptNode = syncedContent.nodes.find((node) => node.id === primaryPromptNodeId) || null;
        const videoNode = syncedContent.nodes.find((node) => node.id === primaryVideoNodeId) || null;
        let nextContent = syncedContent;

        if (promptNode && activeShot.promptText) {
          nextContent = updateNodeInContent(nextContent, promptNode.id, {
            content: activeShot.promptText,
            output: {
              ...(promptNode.output || {}),
              text: activeShot.promptText,
            },
          });
        }

        if (videoNode) {
          const currentVideoNode = nextContent.nodes.find((node) => node.id === primaryVideoNodeId) || videoNode;
          const nextPatch = activeShot.recommendedModelId
            ? buildCanvasNodeModelChangePatch(currentVideoNode, activeShot.recommendedModelId, catalogs.models)
            : {};
          nextContent = updateNodeInContent(nextContent, primaryVideoNodeId, {
            ...nextPatch,
            modeId: activeShot.recommendedModeId || nextPatch.modeId || currentVideoNode.modeId,
          });
        } else {
          skippedReason = '当前工作台还没有主视频节点。';
          return nextContent;
        }

        const resolvedVideoNode = nextContent.nodes.find((node) => node.id === primaryVideoNodeId) || null;
        if (!resolvedVideoNode) {
          return nextContent;
        }

        const nextConnections = Array.isArray(nextContent.connections) ? [...nextContent.connections] : [];
        for (const asset of matchedAssets) {
          const assetNodeId = getEpisodeAssetNodeId(asset.id);
          const assetNode = nextContent.nodes.find((node) => node.id === assetNodeId) || null;
          if (!assetNode) {
            skippedReason = `推荐资产 ${asset.name} 还没有同步到工作台。`;
            continue;
          }

          const validation = validateCanvasConnection(assetNode, resolvedVideoNode, catalogs.models, nextConnections);
          if (!validation.valid || !validation.resolvedInputKey) {
            skippedReason = validation.error || `推荐资产 ${asset.name} 无法接入当前视频节点。`;
            continue;
          }

          const exists = nextConnections.some((connection) => (
            connection.from === assetNode.id
            && connection.to === resolvedVideoNode.id
            && connection.inputKey === validation.resolvedInputKey
          ));
          if (exists) {
            continue;
          }

          nextConnections.push({
            id: buildCanvasConnectionId(assetNode.id, resolvedVideoNode.id, validation.resolvedInputKey),
            from: assetNode.id,
            to: resolvedVideoNode.id,
            inputKey: validation.resolvedInputKey,
            inputType: assetNode.type,
          });
        }

        return {
          ...nextContent,
          connections: nextConnections,
        };
      }, { selectedNodeId: primaryVideoNodeId });

      if (skippedReason) {
        setError(skippedReason);
      }
    };

    const addEpisodeNode = (type: CanvasNode['type']) => {
      if (!episodeWorkspace) {
        return;
      }

      const nextNode = createCanvasNode(type, episodeWorkspace.content.nodes.length, catalogs.models, stageConfig);
      const customNodeCount = (episodeWorkspace.content.nodes || []).filter((node) => !isEpisodeWorkbenchManagedNode(node, route.episodeId)).length;
      nextNode.x = 1240 + (customNodeCount % 2) * 340;
      nextNode.y = 80 + Math.floor(customNodeCount / 2) * 280;
      updateEpisodeWorkspaceDraft((currentContent) => ({
        ...currentContent,
        nodes: [...currentContent.nodes, nextNode],
        connections: Array.isArray(currentContent.connections) ? currentContent.connections : [],
      }), { selectedNodeId: nextNode.id });
    };

    return (
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card eyebrow="Episode" title={currentEpisode ? `${currentEpisode.title} · 生成工作台` : '生成工作台'}>
            <div className="text-sm leading-7 text-slate-300">
              {episodeContext?.contextSummary || 'Run episode analysis first to prepare this workbench.'}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {lockedAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => focusLockedAsset(asset.id)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.08]"
                >
                  {asset.type} · {asset.name}
                </button>
              ))}
              {!lockedAssets.length ? <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">No locked assets yet</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
                分镜 {shotStripSummary.completedSlots} / {shotStripSummary.totalSlots} 已成片
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
                当前集时长 {Math.floor(shotStripSummary.totalSeconds / 60).toString().padStart(2, '0')}:{String(shotStripSummary.totalSeconds % 60).padStart(2, '0')}
              </div>
              {activeShot ? (
                <div className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-xs text-cyan-100">
                  当前分镜：{activeShot.title}
                </div>
              ) : null}
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Video Prompt Method</div>
              <div className="mt-2 text-sm font-semibold text-white">{activePromptRecipe?.name || 'No prompt recipe selected'}</div>
              <div className="mt-2 text-sm leading-7 text-slate-300">
                {activePromptRecipe?.description || 'Choose a prompt recipe in Stage configuration before generating video prompts.'}
              </div>
              {videoPromptSkillPack ? <div className="mt-2 text-xs leading-6 text-white/55">Skill pack: {videoPromptSkillPack.name}</div> : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => route.kind === 'episode-workspace' && navigate(`/projects/${route.projectId}/episodes/${route.episodeId}/scenes`)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                查看分切
              </button>
              <button
                type="button"
                onClick={() => void runEpisodeWorkspaceCapability(
                  () => ({
                    capabilityId: 'storyboard_generate',
                    projectId: route.projectId,
                    episodeId: route.episodeId,
                    modelId: getResolvedCapabilityModelId('storyboard_generate', stageEntry(stageConfig, 'video_prompt_generate').modelId),
                    skillPackId: stageEntry(stageConfig, 'video_prompt_generate').skillPackId,
                    promptRecipeId: stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
                  }),
                  'Storyboard generation failed.',
                )}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                生成分镜
              </button>
              <button
                type="button"
                onClick={() => void runEpisodeWorkspaceCapability(
                  () => ({
                    capabilityId: 'video_prompt_generate',
                    projectId: route.projectId,
                    episodeId: route.episodeId,
                    modelId: getResolvedCapabilityModelId('video_prompt_generate', stageEntry(stageConfig, 'video_prompt_generate').modelId),
                    skillPackId: stageEntry(stageConfig, 'video_prompt_generate').skillPackId,
                    promptRecipeId: stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
                  }),
                  'Video prompt generation failed.',
                )}
                className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black"
              >
                生成视频提示词
              </button>
              <button
                type="button"
                onClick={() => applyStagePresetToEpisodeNode('video_prompt_generate')}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                应用提示词预设
              </button>
              <button
                type="button"
                onClick={() => {
                  const primaryVideoNode = episodeWorkspace?.content.nodes.find((item) => item.id === getEpisodePrimaryNodeId('video', route.episodeId)) || null;
                  if (!primaryVideoNode) {
                    setError('当前工作台还没有视频节点。');
                    return;
                  }
                  void runEpisodeCanvasNode(primaryVideoNode.id).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Video generation failed.');
                  });
                }}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
              >
                运行主视频节点
              </button>
              <button
                type="button"
                onClick={() => applyStagePresetToEpisodeNode('video_generate')}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                应用视频预设
              </button>
              <button
                type="button"
                onClick={() => repairEpisodeWorkbench(false)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                同步资产与主链
              </button>
              <button
                type="button"
                onClick={() => repairEpisodeWorkbench(true)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                整理布局
              </button>
            </div>
          </Card>

          <Card eyebrow="References" title="Assets / prompt / output">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Audio reference</div>
                {hasAudioReference ? (
                  <audio controls src={connectedAudioReference} className="mt-3 w-full" />
                ) : (
                  <div className="mt-2 text-sm leading-7 text-slate-300">把音频节点连到视频节点的全能参考槽位后，这里会显示当前接入的音频参考。</div>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Video prompt</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                  {(workspaceVideoInputs.prompt || videoPromptText) || 'Run video prompt generation to prepare the final motion prompt.'}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Video inputs</div>
                <div className="mt-3 grid gap-3 text-sm text-slate-200">
                  <div className="flex items-center justify-between">
                    <span>提示词</span>
                    <span>{workspaceVideoInputs.prompt ? '已就绪' : '待补充'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>图片参考</span>
                    <span>{workspaceVideoInputs.imageUrls.length} 张</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>视频参考</span>
                    <span>{workspaceVideoInputs.videoReferenceUrls.length} 条</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>音频参考</span>
                    <span>{workspaceVideoInputs.audioReferenceUrls.length} 条</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>锁定资产节点</span>
                    <span>{syncedAssetCount} / {lockedAssets.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>当前资产版本已同步</span>
                    <span>{syncedAssetVersionCount} / {lockedAssets.length}</span>
                  </div>
                </div>
                {workspaceVideoInputs.assetReferences.length ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Connected asset versions</div>
                    {workspaceVideoInputs.assetReferences.map((reference) => (
                      <div
                        key={`${reference.assetId}-${reference.versionId || 'none'}-${reference.inputKey}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-slate-200"
                      >
                        <div>
                          <div className="font-semibold text-white">{reference.assetName || reference.assetId}</div>
                          <div className="mt-1 text-white/45">
                            {reference.assetType} · {reference.inputKey} · {reference.versionLabel}
                          </div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60">
                          {reference.versionNumber ? `V${reference.versionNumber}` : 'No version'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        {reviewGateWarnings.length ? (
          <Card eyebrow="Review Gate" title="当前阻塞与修改建议">
            <div className="grid gap-3">
              {reviewGateWarnings.map((issue, index) => (
                <div key={`${issue.stageLabel}-${issue.label}-${index}`} className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-amber-100/80">{issue.stageLabel}</div>
                  <div className="mt-2 text-sm font-semibold text-white">{issue.label}</div>
                  <div className="mt-2 text-sm leading-7 text-amber-50/90">{issue.notes}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card
            eyebrow="Workbench"
            title="Video generation workspace"
            action={(
              <div className="flex items-center gap-3">
                <div className={cx(
                  'rounded-full border px-3 py-1 text-xs',
                  episodeWorkspaceSaveState === 'saving'
                    ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
                    : episodeWorkspaceSaveState === 'dirty'
                      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
                )}>
                  {workbenchSaveLabel}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!episodeWorkspace || route.kind !== 'episode-workspace') return;
                    try {
                      await saveEpisodeWorkspaceContent(episodeWorkspace.content);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Save episode workspace failed.');
                    }
                  }}
                  disabled={episodeWorkspaceSaveState === 'saving'}
                  className={cx(
                    'rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition',
                    episodeWorkspaceSaveState === 'saving' && 'cursor-not-allowed opacity-60',
                  )}
                >
                  立即保存
                </button>
              </div>
            )}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => repairEpisodeWorkbench(false)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                修复工作台
              </button>
              <button
                type="button"
                onClick={() => updateEpisodeWorkspaceDraft((currentContent) => layoutEpisodeWorkbenchContent(currentContent, route.episodeId, lockedAssets))}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                重排节点
              </button>
              {(['text', 'image', 'video'] as CanvasNode['type'][]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addEpisodeNode(type)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                >
                  添加{type === 'text' ? '文本' : type === 'image' ? '图片' : '视频'}节点
                </button>
              ))}
            </div>
            <CanvasSurface
              nodes={episodeWorkspace?.content.nodes || []}
              connections={episodeConnections}
              models={catalogs.models}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onChangeNodes={(nodes) => updateEpisodeWorkspaceDraft((currentContent) => ({ ...currentContent, nodes }))}
              onChangeConnections={(connections) => updateEpisodeWorkspaceDraft((currentContent) => ({ ...currentContent, connections }))}
              stageConfig={stageConfig}
              onRunNode={(nodeId) => void runEpisodeCanvasNode(nodeId).catch((err) => setError(err instanceof Error ? err.message : 'Canvas node run failed.'))}
              onUploadAudio={uploadAudioReference}
              canStoreVideoToShot={Boolean(activeShot)}
              onStoreVideoToShot={storeVideoNodeToShot}
              onError={(message) => setError(message)}
            />
          </Card>

          <section className="space-y-6">
            <Card eyebrow="Preview" title={previewTitle}>
              {isImageSource(previewValue) ? (
                <img src={previewValue} alt={previewTitle} className="h-[280px] w-full rounded-[24px] object-cover" />
              ) : isVideoSource(previewValue) ? (
                <video src={previewValue} controls className="h-[280px] w-full rounded-[24px] bg-black object-cover" />
              ) : previewNode?.type === 'audio' && isAudioSource(previewValue) ? (
                <audio src={previewValue} controls className="w-full" />
              ) : (
                <div className="min-h-[280px] whitespace-pre-wrap rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
                  {previewValue || 'Select a node on the canvas to inspect it here.'}
                </div>
              )}
              {previewAsyncState ? (
                <div className={cx(
                  'mt-4 rounded-2xl border px-4 py-4 text-sm',
                  previewAsyncState.status === 'FAILED' || previewAsyncState.status === 'CANCELLED'
                    ? 'border-red-400/20 bg-red-400/10 text-red-100'
                    : previewAsyncState.status === 'SUCCEEDED'
                      ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                      : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
                )}>
                  <div className="flex items-center justify-between gap-3">
                    <span>{previewAsyncState.phase || previewAsyncState.status}</span>
                    <span>
                      {typeof previewAsyncState.progress === 'number'
                        ? `${previewAsyncState.progress}%`
                        : previewAsyncState.status === 'SUCCEEDED'
                          ? '结果已可预览'
                          : '异步任务'}
                    </span>
                  </div>
                  {previewAsyncState.error ? (
                    <div className="mt-2 text-xs text-red-100/90">{previewAsyncState.error}</div>
                  ) : previewAsyncState.status === 'SUCCEEDED' && activeShot && !activeShot.clip ? (
                    <div className="mt-2 text-xs text-emerald-100/90">当前结果已完成，右键画布里的视频节点后可存储到这个分镜槽。</div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeShot?.job && canCancelJimengShotJob(activeShot.job) ? (
                      <button
                        type="button"
                        onClick={() => void cancelShotJob(activeShot.id)}
                        className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
                      >
                        取消排队
                      </button>
                    ) : null}
                    {activeShot?.job && !canCancelJimengShotJob(activeShot.job) && (activeShot.job.status === 'FAILED' || activeShot.job.status === 'CANCELLED') ? (
                      <button
                        type="button"
                        onClick={() => retryShotJob(activeShot.id)}
                        className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-black"
                      >
                        重试当前分镜
                      </button>
                    ) : null}
                    {activeShot?.clip ? (
                      <button
                        type="button"
                        onClick={() => clearShotResult(activeShot.id)}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                      >
                        清空当前分镜结果
                      </button>
                    ) : null}
                    {activeShot?.promptText ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-slate-300">
                        {activeShot.promptText}
                      </div>
                    ) : null}
                    {activeShot?.referenceAssetNames?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeShotRecommendedAssets.map((entry) => (
                          <span
                            key={entry.name}
                            className={cx(
                              'rounded-full border px-3 py-1 text-xs',
                              entry.asset
                                ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                                : 'border-amber-300/25 bg-amber-300/10 text-amber-100',
                            )}
                          >
                            {entry.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {activeShotRecommendedAssets.length ? (
                      <button
                        type="button"
                        onClick={connectActiveShotRecommendedAssets}
                        className="mt-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100"
                      >
                        接入推荐资产
                      </button>
                    ) : null}
                    {(activeShot?.recommendedModelId || activeShot?.recommendedModeId) ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Shot recommendation</div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-300">
                          <div className="flex items-center justify-between gap-3">
                            <span>模型</span>
                            <span className="text-right text-slate-100">
                              {activeShotRecommendedModel ? formatModelDisplayName(activeShotRecommendedModel) : (activeShot?.recommendedModelId || '未指定')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>模式</span>
                            <span className="text-right text-slate-100">{activeShot?.recommendedModeId || '未指定'}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={prepareActiveShotWorkbench}
                          className="mt-3 rounded-full bg-cyan-300 px-3 py-2 text-xs font-semibold text-black"
                        >
                          准备当前分镜
                        </button>
                        <button
                          type="button"
                          onClick={applyActiveShotRecommendation}
                          className="mt-3 rounded-full bg-white px-3 py-2 text-xs font-semibold text-black"
                        >
                          应用到主视频节点
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
                {previewSummary || activeShot?.clip?.promptText || '当前预览会优先显示下方已选分镜的视频结果。'}
              </div>
            </Card>

            <Card eyebrow="Sidebar" title={episodeSidebarTab === 'assets' ? 'Episode assets' : 'Inspector'}>
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEpisodeSidebarTab('assets')}
                  className={cx(
                    'rounded-full px-4 py-2 text-sm transition',
                    episodeSidebarTab === 'assets'
                      ? 'bg-white text-black'
                      : 'border border-white/10 bg-white/[0.04] text-slate-200',
                  )}
                >
                  资产
                </button>
                <button
                  type="button"
                  onClick={() => setEpisodeSidebarTab('inspector')}
                  className={cx(
                    'rounded-full px-4 py-2 text-sm transition',
                    episodeSidebarTab === 'inspector'
                      ? 'bg-white text-black'
                      : 'border border-white/10 bg-white/[0.04] text-slate-200',
                  )}
                >
                  检查器
                </button>
              </div>

              {episodeSidebarTab === 'assets' ? (
                <div className="space-y-4">
                  {assetGroups.map((group) => (
                    <div key={group.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">{group.label}</div>
                      <div className="mt-4 grid gap-3">
                        {group.items.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => focusLockedAsset(asset.id)}
                            className={cx(
                              'grid gap-3 rounded-2xl border p-3 text-left transition',
                              selectedAssetCardId === asset.id
                                ? 'border-cyan-300/35 bg-cyan-300/[0.08]'
                                : 'border-white/10 bg-black/20 hover:border-cyan-300/30',
                            )}
                          >
                            {assetPreview(asset) ? (
                              <img
                                src={assetPreview(asset) || ''}
                                alt={asset.name}
                                className="h-28 w-full rounded-[18px] object-cover"
                              />
                            ) : (
                              <div className="flex h-28 items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] text-sm text-slate-400">
                                暂无预览
                              </div>
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-white">{asset.name}</div>
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                                  {assetVersionDisplay(asset).versionNumber ? `V${assetVersionDisplay(asset).versionNumber}` : 'No version'}
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em]">
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">
                                  {assetVersionDisplay(asset).versionLabel}
                                </span>
                                <span className={cx(
                                  'rounded-full border px-2 py-1',
                                  assetSyncStateByAssetId.get(asset.id)?.isSynced
                                    ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                                    : 'border-amber-300/25 bg-amber-300/10 text-amber-100',
                                )}>
                                  {assetSyncStateByAssetId.get(asset.id)?.isSynced
                                    ? `宸插悓姝?${nodeAssetVersionDisplay(assetSyncStateByAssetId.get(asset.id)?.assetNode).versionNumber ? `V${nodeAssetVersionDisplay(assetSyncStateByAssetId.get(asset.id)?.assetNode).versionNumber}` : ''}`
                                    : `寰呭悓姝?${assetVersionDisplay(asset).versionNumber ? `V${assetVersionDisplay(asset).versionNumber}` : ''}`}
                                </span>
                              </div>
                              <div className="mt-2 text-sm leading-6 text-slate-300 line-clamp-3">
                                {asset.description || assetPrompt(asset) || '暂无资产说明。'}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!assetGroups.length ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-sm text-slate-300">
                      当前这一集还没有锁定资产。
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Selected node</div>
                    <div className="mt-2 text-sm font-semibold text-white">{previewNode?.title || 'None'}</div>
                    <div className="mt-2 text-sm text-slate-300">{previewNode?.type || 'Select a node from the canvas.'}</div>
                    {selectedPreviewModel ? (
                      <div className="mt-3 grid gap-2 text-xs text-slate-300">
                        <div className="flex items-center justify-between gap-3">
                          <span>模型</span>
                          <span className="text-slate-100">{formatModelDisplayName(selectedPreviewModel)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>运行方式</span>
                          <span className="text-right text-slate-100">{describeModelRuntime(selectedPreviewModel)}</span>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {storyboardNode ? (
                        <button
                          type="button"
                          onClick={() => focusEpisodeNode(storyboardNode)}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                        >
                          选中分镜节点
                        </button>
                      ) : null}
                      {promptNode ? (
                        <button
                          type="button"
                          onClick={() => focusEpisodeNode(promptNode)}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                        >
                          选中提示词节点
                        </button>
                      ) : null}
                      {videoNode ? (
                        <button
                          type="button"
                          onClick={() => focusEpisodeNode(videoNode)}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                        >
                          选中视频节点
                        </button>
                      ) : null}
                      {selectedWorkspaceNode?.modelId ? (
                        <button
                          type="button"
                          onClick={() => void runEpisodeCanvasNode(selectedWorkspaceNode.id).catch((err) => setError(err instanceof Error ? err.message : 'Canvas node run failed.'))}
                          className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-black"
                        >
                          运行当前节点
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Current shot</div>
                    <div className="mt-2 text-sm font-semibold text-white">{activeShot?.title || 'No shot selected'}</div>
                    <div className="mt-2 text-sm leading-7 text-slate-300">{activeShot?.summary || '点击下方分镜视频条，把当前工作台聚焦到某个镜头片段。'}</div>
                    {activeShot ? (
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span>{activeShot.source === 'manual' ? '手动分镜' : '自动分镜'}</span>
                        <span>{activeShot.durationLabel || '未定长'}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </Card>
          </section>
        </div>

        <Card eyebrow="Shot Strip" title="分镜视频条">
          <EpisodeShotStrip
            strip={shotStrip}
            onSelectShot={selectShot}
            onAddShot={addShotSlot}
            onRenameShot={renameShot}
            onDeleteShot={deleteShot}
            onMoveShot={moveShot}
            onClearShotResult={clearShotResult}
            onRetryShotJob={retryShotJob}
            onCancelShotJob={cancelShotJob}
          />
        </Card>

        <Card eyebrow="Runs" title="Episode run log">
          {renderRuns(episodeRuns, ['episode_expand', 'storyboard_generate', 'video_prompt_generate', 'video_generate'])}
        </Card>
      </div>
    );
  };

  const renderStudio = () => (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card
        eyebrow="Studio"
        title="Multimodal sandbox"
        action={(
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await appApi.createStudioWorkspace({ title: `Studio ${studioWorkspaces.length + 1}` });
                if (!res.success || !res.data) throw new Error(res.error || 'Create studio failed.');
                await loadStudio();
                setActiveStudioId(res.data.id);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Create studio failed.');
              }
            }}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            New
          </button>
        )}
      >
        <div className="grid gap-3">
          {studioWorkspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => {
                setActiveStudioId(workspace.id);
                setSelectedStudioNodeId(workspace.content.nodes?.[0]?.id || null);
              }}
              className={cx('rounded-2xl border px-4 py-4 text-left', workspace.id === activeStudioId ? 'border-cyan-300/20 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03]')}
            >
              <div className="font-semibold text-white">{workspace.title}</div>
              <div className="mt-1 text-xs text-white/45">{fmt(workspace.updatedAt)}</div>
            </button>
          ))}
        </div>
      </Card>

      {activeStudio ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            {(['text', 'image', 'video'] as CanvasNode['type'][]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? {
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
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                Add {type}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                try {
                  await saveStudioWorkspaceContent(activeStudio.id, activeStudio.content);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Save studio failed.');
                }
              }}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Save studio
            </button>
          </div>
          <CanvasSurface
            nodes={activeStudio.content.nodes}
            connections={activeStudio.content.connections || []}
            models={catalogs.models}
            selectedNodeId={selectedStudioNodeId}
            onSelectNode={setSelectedStudioNodeId}
            onChangeNodes={(nodes) => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? { ...item, content: { ...item.content, nodes } } : item))}
            onChangeConnections={(connections) => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? { ...item, content: { ...item.content, connections } } : item))}
            stageConfig={stageConfig}
            onRunNode={(nodeId) => void runStudioCanvasNode(activeStudio.id, nodeId).catch((err) => setError(err instanceof Error ? err.message : 'Canvas node run failed.'))}
            onUploadAudio={uploadAudioReference}
            onError={(message) => setError(message)}
          />
        </section>
      ) : null}
    </div>
  );

  if (checkingAuth) {
    return (
      <AppShell title="Momo Workflow" subtitle="Connecting to workflow services.">
        <div className="rounded-2xl border border-white/10 bg-black/30 px-6 py-10 text-center text-slate-300">Booting workflow…</div>
      </AppShell>
    );
  }

  if (!user) return renderAuth();

  const header = (
    <>
      {'projectId' in route ? (
        <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
          <ArrowLeft size={16} />
          Back to projects
        </button>
      ) : null}
      <button type="button" onClick={() => navigate('/studio')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
        <Sparkles size={16} />
        Canvas Studio
      </button>
      <button type="button" onClick={() => void refreshCurrent()} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
        <RefreshCw size={16} />
        Refresh
      </button>
      <button type="button" onClick={async () => { await appApi.logout(); setUser(null); setProjects([]); navigate('/'); }} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
        <LogOut size={16} />
        Logout
      </button>
    </>
  );

  const nav = projectDetail ? (
    <div className="flex flex-wrap gap-2">
      {(['setup', 'assets', 'episodes'] as const).map((section) => {
        const active = (section === 'setup' && route.kind === 'project-setup') || (section === 'assets' && route.kind === 'project-assets') || (section === 'episodes' && (route.kind === 'project-episodes' || route.kind === 'episode-scenes' || route.kind === 'episode-workspace'));
        return (
          <button key={section} type="button" onClick={() => navigate(`/projects/${projectDetail.id}/${section}`)} className={cx('rounded-full px-4 py-2 text-sm', active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200')}>
            {section}
          </button>
        );
      })}
    </div>
  ) : null;

  const activeEpisodeHeader = 'episodeId' in route
    ? episodes.find((item) => item.id === route.episodeId) || null
    : null;

  const shellTitle = route.kind === 'studio'
    ? 'Canvas Studio'
    : activeEpisodeHeader
      ? `${projectDetail?.title || 'Workflow'} · 第${activeEpisodeHeader.episodeNumber}集`
      : projectDetail?.title || 'Workflow';

  const shellSubtitle = route.kind === 'studio'
    ? 'Independent multimodal sandbox.'
    : route.kind === 'episode-scenes'
      ? 'Review script content and scene/shot breakdown before entering the generation workbench.'
      : route.kind === 'episode-workspace'
        ? 'Use locked assets, connected references, and skill-generated prompts to produce video and review the shot strip.'
        : 'Upload script -> decompose -> lock assets -> enter episodes -> work per episode.';

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
    </AppShell>
  );
};
