import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LogOut, Plus, RefreshCw, Sparkles, Upload, UserPlus, Wand2 } from 'lucide-react';
import { AppShell } from './components/workflow2/AppShell';
import { CanvasSurface } from './components/workflow2/CanvasSurface';
import { appApi } from './services/appApi';
import {
  resolveCapabilityModelId,
  selectAllowedModels,
  selectCapability,
} from './services/workflow/runtime/capabilityCatalogHelpers';
import {
  buildCanvasNodeStagePresetPatch,
  createCanvasNode,
  getNodePrimaryValue,
  normalizeCanvasContent,
} from './services/workflow/runtime/canvasGraphHelpers';
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
  CapabilityDefinition,
  CanvasNode,
  CanonicalAsset,
  CapabilityRun,
  Episode,
  EpisodeContext,
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

function assetCapability(asset: CanonicalAsset) {
  if (asset.type === 'character') return 'character_generate';
  if (asset.type === 'scene') return 'scene_generate';
  if (asset.type === 'prop') return 'prop_generate';
  return null;
}

function reviewList(run: CapabilityRun | undefined): ReviewResult[] {
  return Array.isArray(run?.outputPayload?.reviews) ? (run.outputPayload.reviews as ReviewResult[]) : [];
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

  const [episodeContext, setEpisodeContext] = useState<EpisodeContext | null>(null);
  const [episodeWorkspace, setEpisodeWorkspace] = useState<EpisodeWorkspace | null>(null);
  const [episodeRuns, setEpisodeRuns] = useState<ProjectRunBundle>(EMPTY_RUNS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
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
    setSelectedBeatId(null);
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

    const nextContent = harmonizeEpisodeWorkbenchContent({
      content: episodeWorkspace.content,
      episode: currentEpisode,
      lockedAssets: assets.filter((asset) => asset.isLocked),
      models: catalogs.models,
      stageConfig,
      promptRecipeId: stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
    });

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
  }, [assets, catalogs.models, episodeWorkspace, episodes, route, stageConfig]);

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

  const pollJimengNodeJob = async (
    workspaceKind: 'episode' | 'studio',
    nodeId: string,
    jobId: string,
    workspaceRefId?: string,
  ) => {
    for (;;) {
      const jobRes = await appApi.getJimengJob(jobId);
      if (!jobRes.success || !jobRes.data) {
        throw new Error(jobRes.error || '获取即梦任务状态失败。');
      }

      const job = jobRes.data;
      const patch: Partial<CanvasNode> = {
        output: {
          providerJobId: job.id,
          previewUrl: job.videoUrl,
          metadata: {
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
      };

      if (workspaceKind === 'episode') {
        setEpisodeWorkspace((current) => current ? { ...current, content: updateNodeInContent(current.content, nodeId, patch) } : current);
      } else if (workspaceRefId) {
        setStudioWorkspaces((current) => current.map((item) => item.id === workspaceRefId ? { ...item, content: updateNodeInContent(item.content, nodeId, patch) } : item));
      }

      if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        if (workspaceKind === 'episode') {
          const latestEpisodeWorkspace = episodeWorkspaceRef.current;
          await saveEpisodeWorkspaceContent(
            updateNodeInContent(
              normalizeCanvasContent(latestEpisodeWorkspace?.content, catalogs.models, stageConfig),
              nodeId,
              patch,
            ),
          );
        } else if (workspaceRefId) {
          const currentStudio = studioWorkspacesRef.current.find((item) => item.id === workspaceRefId) || null;
          if (currentStudio) {
            await saveStudioWorkspaceContent(
              workspaceRefId,
              updateNodeInContent(currentStudio.content, nodeId, patch),
            );
          }
        }
        return;
      }

      await sleep(3000);
    }
  };

  const runEpisodeCanvasNode = async (nodeId: string) => {
    if (route.kind !== 'episode-workspace' || !episodeWorkspace) {
      return;
    }

    const snapshot = normalizeCanvasContent(episodeWorkspace.content, catalogs.models, stageConfig);
    const res = await appApi.runCanvasNode({
      workspaceKind: 'episode',
      episodeId: route.episodeId,
      nodeId,
      content: snapshot,
    });
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Canvas node run failed.');
    }

    setEpisodeWorkspace((current) => current ? {
      ...current,
      content: normalizeCanvasContent(res.data?.content, catalogs.models, stageConfig),
    } : current);
    setEpisodeWorkspaceSaveState('saved');
    setEpisodeWorkspaceSavedAt(new Date().toISOString());

    if (res.data.pending && res.data.providerJob?.id) {
      await pollJimengNodeJob('episode', nodeId, res.data.providerJob.id);
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
                {assetPrompt(asset) ? <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-300">{assetPrompt(asset)}</div> : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  {assetCapability(asset) ? (
                    <button
                      type="button"
                      onClick={() => void runCapability({
                        capabilityId: assetCapability(asset),
                        projectId: route.kind === 'project-assets' ? route.projectId : '',
                        assetId: asset.id,
                        modelId: getResolvedCapabilityModelId(assetCapability(asset) || ''),
                        prompt: assetPrompt(asset),
                      }, 'Asset preview generation failed.')}
                      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                      Generate preview
                    </button>
                  ) : null}
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
    const hasAudioReference = isAudioSource(audioReference);
    const sceneCards = buildEpisodeSceneCards(currentEpisode, episodeContext, storyboardText);
    const episodeConnections = episodeWorkspace?.content.connections || [];
    const selectedWorkspaceNode = episodeWorkspace?.content.nodes.find((item) => item.id === selectedNodeId) || null;
    const videoNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('video-')) || null;
    const imageNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('visual-')) || null;
    const promptNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('prompt-')) || null;
    const previewNode = selectedWorkspaceNode || videoNode || imageNode || null;
    const previewValue = previewNode ? getNodePrimaryValue(previewNode) : '';
    const selectedPreviewModel = previewNode?.modelId ? findModelByIdentifier(catalogs.models, previewNode.modelId) : null;
    const lockedAssets = assets.filter((asset) => asset.isLocked);
    const assetNodesByAssetId = new Map(
      (episodeWorkspace?.content.nodes || [])
        .filter((node) => String(node.metadata?.lockedAssetId || '').trim())
        .map((node) => [String(node.metadata?.lockedAssetId || '').trim(), node]),
    );
    const syncedAssetCount = lockedAssets.filter((asset) => assetNodesByAssetId.has(asset.id)).length;
    const workspaceVideoInputs = collectEpisodeWorkspaceVideoInputs(episodeWorkspace);
    const activeScene = sceneCards.find((item) => item.id === selectedBeatId) || sceneCards[0] || null;
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

      updateEpisodeWorkspaceDraft((currentContent) => harmonizeEpisodeWorkbenchContent({
        content: currentContent,
        episode: currentEpisode,
        lockedAssets,
        models: catalogs.models,
        stageConfig,
        promptRecipeId: videoPromptStage.promptRecipeId,
        forceLayout,
      }));
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
      if (beatId !== undefined) {
        setSelectedBeatId(beatId);
      }
    };

    const focusLockedAsset = (assetId: string) => {
      const node = assetNodesByAssetId.get(assetId) || null;
      if (!node) {
        return;
      }
      focusEpisodeNode(node);
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
                生成视频
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
                  <audio controls src={audioReference} className="mt-3 w-full" />
                ) : (
                  <div className="mt-2 text-sm leading-7 text-slate-300">在画布音频节点上传音频文件，把它作为这一集工作台保留的音色参考素材。</div>
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
                    <span>锁定资产节点</span>
                    <span>{syncedAssetCount} / {lockedAssets.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

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
              onError={(message) => setError(message)}
            />
          </Card>

          <section className="space-y-6">
            <Card eyebrow="Preview" title={previewNode?.title || 'Current preview'}>
              {previewNode?.type === 'image' && isImageSource(previewValue) ? (
                <img src={previewValue} alt={previewNode.title} className="h-[280px] w-full rounded-[24px] object-cover" />
              ) : previewNode?.type === 'video' && isVideoSource(previewValue) ? (
                <video src={previewValue} controls className="h-[280px] w-full rounded-[24px] bg-black object-cover" />
              ) : previewNode?.type === 'audio' && isAudioSource(previewValue) ? (
                <audio src={previewValue} controls className="w-full" />
              ) : (
                <div className="min-h-[280px] whitespace-pre-wrap rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
                  {previewValue || 'Select a node on the canvas to inspect it here.'}
                </div>
              )}
            </Card>

            <Card eyebrow="Inspector" title="Current materials">
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
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Active beat</div>
                  <div className="mt-2 text-sm font-semibold text-white">{activeScene?.title || 'No beat selected'}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">{activeScene?.summary || '点击下方时间线片段，把当前镜头节拍和工作台节点联动起来。'}</div>
                  {activeScene ? (
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>{activeScene.shotCount} 镜头</span>
                      <span>{activeScene.durationLabel}</span>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">Locked assets</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lockedAssets.slice(0, 8).map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => focusLockedAsset(asset.id)}
                        className={cx(
                          'rounded-full border px-3 py-2 text-xs transition',
                          assetNodesByAssetId.has(asset.id)
                            ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100'
                            : 'border-white/10 bg-black/20 text-slate-200 hover:border-cyan-300/30',
                        )}
                      >
                        {asset.name}
                      </button>
                    ))}
                    {!lockedAssets.length ? <div className="text-sm text-slate-400">No locked assets.</div> : null}
                  </div>
                </div>
              </div>
            </Card>
          </section>
        </div>

        <Card eyebrow="Timeline" title="Beat timeline">
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-3">
              {sceneCards.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => {
                    setSelectedBeatId(scene.id);
                    focusEpisodeNode(storyboardNode || promptNode || videoNode, scene.id);
                  }}
                  className={cx(
                    'w-[180px] rounded-[20px] border p-4 text-left transition',
                    activeScene?.id === scene.id
                      ? 'border-cyan-300/35 bg-cyan-300/[0.08]'
                      : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/30',
                  )}
                >
                  <div className="text-xs uppercase tracking-[0.24em] text-white/35">{scene.title}</div>
                  <div className="mt-3 line-clamp-4 text-sm leading-6 text-slate-200">{scene.summary}</div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span>{scene.shotCount} 镜头</span>
                    <span>{scene.durationLabel}</span>
                  </div>
                </button>
              ))}
              {!sceneCards.length ? (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-sm text-slate-300">
                  分镜节拍会显示在这里，便于在生成前预览整集时间线。
                </div>
              ) : null}
            </div>
          </div>
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
        ? 'Use locked assets, connected references, and skill-generated prompts to produce video and review the beat timeline.'
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
