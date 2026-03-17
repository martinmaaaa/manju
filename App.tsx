import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LogOut, Plus, RefreshCw, Sparkles, Upload, UserPlus, Wand2 } from 'lucide-react';
import { AppShell } from './components/workflow2/AppShell';
import { CanvasSurface } from './components/workflow2/CanvasSurface';
import { appApi } from './services/appApi';
import type {
  AuthUser,
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

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createNode(type: CanvasNode['type'], index: number): CanvasNode {
  return {
    id: `${type}-${Date.now()}-${index}`,
    type,
    title: `${type} node`,
    x: 80 + (index % 3) * 320,
    y: 90 + Math.floor(index / 3) * 260,
    width: type === 'video' ? 340 : 300,
    height: type === 'text' ? 220 : 240,
    content: '',
  };
}

function stageEntry(stageConfig: StageConfigMap, stageKind: StageKind): StageConfig {
  return {
    capabilityId: STAGE_CAPABILITIES[stageKind],
    modelId: '',
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
    models: ModelDefinition[];
    skillPacks: SkillPack[];
    reviewPolicies: ReviewPolicy[];
  }>({
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

  const [studioWorkspaces, setStudioWorkspaces] = useState<StudioWorkspace[]>([]);
  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState<string | null>(null);

  const activeStudio = useMemo(
    () => studioWorkspaces.find((item) => item.id === activeStudioId) || null,
    [studioWorkspaces, activeStudioId],
  );

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  };

  const loadCatalogs = async () => {
    const [modelsRes, skillsRes, reviewsRes] = await Promise.all([
      appApi.listModels(),
      appApi.listSkillPacks(),
      appApi.listReviewPolicies(),
    ]);
    if (!modelsRes.success || !skillsRes.success || !reviewsRes.success) {
      throw new Error(modelsRes.error || skillsRes.error || reviewsRes.error || 'Failed to load catalogs.');
    }
    setCatalogs({
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
      if (route.kind === 'episode-workspace') {
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
          if (route.kind === 'episode-workspace') await loadEpisode(route.projectId, route.episodeId);
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

  const renderRuns = (runs: ProjectRunBundle, stageKinds?: StageKind[]) => {
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
                modelId: stageEntry(stageConfig, 'script_decompose').modelId,
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
              const stageModels = catalogs.models.filter((item) => item.capabilities.includes(stage.capabilityId));
              return (
                <div key={stageKind} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="font-semibold text-white">{STAGE_LABELS[stageKind]}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <select value={stage.skillPackId || ''} onChange={(event) => setStageConfig((current) => ({ ...current, [stageKind]: { ...stageEntry(current, stageKind), skillPackId: event.target.value } }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
                      <option value="">Choose skill pack</option>
                      {stageSkills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <select value={stage.modelId || ''} onChange={(event) => setStageConfig((current) => ({ ...current, [stageKind]: { ...stageEntry(current, stageKind), modelId: event.target.value } }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
                      <option value="">Choose model</option>
                      {stageModels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
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
                const res = await appApi.updateStageConfig(route.projectId, stageConfig);
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
              modelId: stageEntry(stageConfig, 'asset_design').modelId,
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
                        modelId: catalogs.models.find((item) => item.capabilities.includes(assetCapability(asset) || ''))?.id,
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
        {episodes.map((episode) => (
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
              {episode.context?.contextSummary || 'No episode context yet.'}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (route.kind !== 'project-episodes') return;
                    const stage = stageEntry(stageConfig, 'episode_expand');
                    const res = await appApi.analyzeEpisode(route.projectId, episode.id, { skillPackId: stage.skillPackId, modelId: stage.modelId });
                    if (!res.success) throw new Error(res.error || 'Episode analysis failed.');
                    await refreshCurrent();
                    navigate(`/projects/${route.projectId}/episodes/${episode.id}/workspace`);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Episode analysis failed.');
                  }
                }}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
              >
                Analyze episode
              </button>
              <button
                type="button"
                onClick={() => route.kind === 'project-episodes' && navigate(`/projects/${route.projectId}/episodes/${episode.id}/workspace`)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                Open workspace
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderEpisodeWorkspace = () => (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <section className="space-y-5">
        <Card eyebrow="Context" title="Episode context">
          <div className="text-sm leading-7 text-slate-300">{episodeContext?.contextSummary || 'Run episode analysis first.'}</div>
          {episodeContext?.precedingSummary ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">{episodeContext.precedingSummary}</div> : null}
          <div className="mt-5 grid gap-3">
            <button
              type="button"
              onClick={() => void runCapability({
                capabilityId: 'video_prompt_generate',
                projectId: route.kind === 'episode-workspace' ? route.projectId : '',
                episodeId: route.kind === 'episode-workspace' ? route.episodeId : '',
                modelId: stageEntry(stageConfig, 'video_prompt_generate').modelId,
                skillPackId: stageEntry(stageConfig, 'video_prompt_generate').skillPackId,
                promptRecipeId: stageEntry(stageConfig, 'video_prompt_generate').promptRecipeId,
              }, 'Video prompt generation failed.')}
              className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-black"
            >
              Generate video prompt
            </button>
            <button
              type="button"
              onClick={() => void runCapability({
                capabilityId: 'video_generate',
                projectId: route.kind === 'episode-workspace' ? route.projectId : '',
                episodeId: route.kind === 'episode-workspace' ? route.episodeId : '',
                modelId: stageEntry(stageConfig, 'video_generate').modelId,
                prompt: episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('prompt-'))?.content || '',
              }, 'Video generation failed.')}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
            >
              Generate video
            </button>
          </div>
        </Card>

        <Card eyebrow="Locked Assets" title="Episode assets">
          <div className="grid gap-3">
            {assets.filter((asset) => asset.isLocked).map((asset) => (
              <div key={asset.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">{asset.type}</div>
                <div className="mt-2 font-semibold text-white">{asset.name}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card eyebrow="Runs" title="Episode run log">
          {renderRuns(episodeRuns, ['episode_expand', 'video_prompt_generate', 'video_generate'])}
        </Card>
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          {(['text', 'image', 'audio', 'video'] as CanvasNode['type'][]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEpisodeWorkspace((current) => current ? { ...current, content: { ...current.content, nodes: [...current.content.nodes, createNode(type, current.content.nodes.length)] } } : current)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
            >
              Add {type}
            </button>
          ))}
          <button
            type="button"
            onClick={async () => {
              if (!episodeWorkspace || route.kind !== 'episode-workspace') return;
              try {
                const res = await appApi.saveEpisodeWorkspace(route.episodeId, episodeWorkspace.content);
                if (!res.success || !res.data) throw new Error(res.error || 'Save episode workspace failed.');
                setEpisodeWorkspace(res.data);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Save episode workspace failed.');
              }
            }}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Save workspace
          </button>
        </div>
        <CanvasSurface
          nodes={episodeWorkspace?.content.nodes || []}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onChangeNodes={(nodes) => setEpisodeWorkspace((current) => current ? { ...current, content: { ...current.content, nodes } } : current)}
        />
      </section>
    </div>
  );

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
            {(['text', 'image', 'audio', 'video'] as CanvasNode['type'][]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? { ...item, content: { ...item.content, nodes: [...item.content.nodes, createNode(type, item.content.nodes.length)] } } : item))}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
              >
                Add {type}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await appApi.saveStudioWorkspace(activeStudio.id, activeStudio);
                  if (!res.success || !res.data) throw new Error(res.error || 'Save studio failed.');
                  setStudioWorkspaces((current) => current.map((item) => item.id === res.data?.id ? res.data : item));
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
            selectedNodeId={selectedStudioNodeId}
            onSelectNode={setSelectedStudioNodeId}
            onChangeNodes={(nodes) => setStudioWorkspaces((current) => current.map((item) => item.id === activeStudio.id ? { ...item, content: { ...item.content, nodes } } : item))}
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
        const active = (section === 'setup' && route.kind === 'project-setup') || (section === 'assets' && route.kind === 'project-assets') || (section === 'episodes' && (route.kind === 'project-episodes' || route.kind === 'episode-workspace'));
        return (
          <button key={section} type="button" onClick={() => navigate(`/projects/${projectDetail.id}/${section}`)} className={cx('rounded-full px-4 py-2 text-sm', active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200')}>
            {section}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <AppShell
      title={route.kind === 'studio' ? 'Canvas Studio' : projectDetail?.title || 'Workflow'}
      subtitle={route.kind === 'studio' ? 'Independent multimodal sandbox.' : 'Upload script -> decompose -> lock assets -> enter episodes -> work per episode.'}
      rightSlot={header}
      nav={nav}
    >
      {error ? <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {!health?.database ? <div className="mb-6"><HealthBadge health={health} /></div> : null}
      {route.kind === 'home' ? renderHome() : null}
      {route.kind === 'project-setup' ? renderSetup() : null}
      {route.kind === 'project-assets' ? renderAssets() : null}
      {route.kind === 'project-episodes' ? renderEpisodes() : null}
      {route.kind === 'episode-workspace' ? renderEpisodeWorkspace() : null}
      {route.kind === 'studio' ? renderStudio() : null}
    </AppShell>
  );
};
