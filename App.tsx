import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Clapperboard,
  FolderKanban,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { AppShell } from './components/workflow2/AppShell';
import { CanvasSurface } from './components/workflow2/CanvasSurface';
import { appApi } from './services/appApi';
import type {
  AuthUser,
  CanvasNode,
  CanonicalAsset,
  CapabilityDefinition,
  Episode,
  EpisodeContext,
  EpisodeWorkspace,
  ModelDefinition,
  ProjectDetail,
  ProjectSetup,
  ProjectSummary,
  ReviewPolicy,
  SkillPack,
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

type StageKind = 'script_decompose' | 'asset_design' | 'episode_expand' | 'video_prompt_generate' | 'video_generate';

const STAGE_LABELS: Record<StageKind, string> = {
  script_decompose: '剧本拆解',
  asset_design: '资产设计',
  episode_expand: '单集分析',
  video_prompt_generate: '视频提示词',
  video_generate: '视频生成',
};

function parseRoute(pathname = '/') {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '') return { kind: 'home' } as Route;
  if (clean === '/studio') return { kind: 'studio' } as Route;

  const workspaceMatch = clean.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)\/workspace$/);
  if (workspaceMatch) {
    return {
      kind: 'episode-workspace',
      projectId: workspaceMatch[1],
      episodeId: workspaceMatch[2],
    } as Route;
  }

  const routeMatch = clean.match(/^\/projects\/([^/]+)\/(setup|assets|episodes)$/);
  if (routeMatch) {
    const projectId = routeMatch[1];
    const section = routeMatch[2];
    if (section === 'setup') return { kind: 'project-setup', projectId };
    if (section === 'assets') return { kind: 'project-assets', projectId };
    return { kind: 'project-episodes', projectId };
  }

  return { kind: 'home' } as Route;
}

function createNode(type: CanvasNode['type'], index: number): CanvasNode {
  return {
    id: `${type}-${Date.now()}-${index}`,
    type,
    title: {
      text: '文本节点',
      image: '图片节点',
      audio: '音频节点',
      video: '视频节点',
    }[type],
    x: 80 + (index % 3) * 320,
    y: 100 + Math.floor(index / 3) * 260,
    width: type === 'video' ? 340 : 300,
    height: type === 'text' ? 220 : 240,
    content: '',
  };
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value?: string | null) {
  if (!value) return '刚刚';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stageCapabilities(catalogs: { models: ModelDefinition[] }, config: StageConfigMap, stageKind: StageKind) {
  const capabilityId = config[stageKind]?.capabilityId || stageKind;
  return catalogs.models.filter((item) => item.capabilities.includes(capabilityId));
}

export const App = () => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [catalogs, setCatalogs] = useState<{
    models: ModelDefinition[];
    capabilities: CapabilityDefinition[];
    skillPacks: SkillPack[];
    reviewPolicies: ReviewPolicy[];
  }>({
    models: [],
    capabilities: [],
    skillPacks: [],
    reviewPolicies: [],
  });

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [projectSetup, setProjectSetup] = useState<ProjectSetup | null>(null);
  const [stageConfig, setStageConfig] = useState<StageConfigMap>({});
  const [assets, setAssets] = useState<CanonicalAsset[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);

  const [scriptText, setScriptText] = useState('');
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [setupDraft, setSetupDraft] = useState({
    aspectRatio: '9:16',
    styleSummary: '',
    targetMedium: '漫剧',
    globalPromptsText: '',
  });

  const [assetForm, setAssetForm] = useState({
    type: 'character',
    name: '',
    description: '',
    promptText: '',
  });

  const [episodeContext, setEpisodeContext] = useState<EpisodeContext | null>(null);
  const [episodeWorkspace, setEpisodeWorkspace] = useState<EpisodeWorkspace | null>(null);
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState<string | null>(null);

  const [studioWorkspaces, setStudioWorkspaces] = useState<StudioWorkspace[]>([]);
  const [activeStudioId, setActiveStudioId] = useState<string | null>(null);
  const [selectedStudioNodeId, setSelectedStudioNodeId] = useState<string | null>(null);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  };

  const loadCatalogs = async () => {
    const [modelsRes, capabilitiesRes, skillPacksRes, reviewPoliciesRes] = await Promise.all([
      appApi.listModels(),
      appApi.listCapabilities(),
      appApi.listSkillPacks(),
      appApi.listReviewPolicies(),
    ]);

    if (!modelsRes.success || !capabilitiesRes.success || !skillPacksRes.success || !reviewPoliciesRes.success) {
      throw new Error(modelsRes.error || capabilitiesRes.error || skillPacksRes.error || reviewPoliciesRes.error || '目录加载失败');
    }

    setCatalogs({
      models: modelsRes.data || [],
      capabilities: capabilitiesRes.data || [],
      skillPacks: skillPacksRes.data || [],
      reviewPolicies: reviewPoliciesRes.data || [],
    });
  };

  const loadProjects = async () => {
    const response = await appApi.listProjects();
    if (!response.success || !response.data) {
      throw new Error(response.error || '项目列表加载失败');
    }
    setProjects(response.data);
  };

  const loadProjectBundle = async (projectId: string) => {
    setProjectLoading(true);
    setProjectError(null);
    try {
      const [projectRes, setupRes, assetsRes, episodesRes, stageConfigRes] = await Promise.all([
        appApi.getProject(projectId),
        appApi.getProjectSetup(projectId),
        appApi.listAssets(projectId),
        appApi.listEpisodes(projectId),
        appApi.getStageConfig(projectId),
      ]);

      if (!projectRes.success || !projectRes.data) {
        throw new Error(projectRes.error || '项目详情加载失败');
      }

      setProjectDetail(projectRes.data);
      setProjectSetup(setupRes.data?.setup || projectRes.data.setup);
      setStageConfig(stageConfigRes.data || projectRes.data.setup?.stageConfig || {});
      setAssets(assetsRes.data || []);
      setEpisodes(episodesRes.data || []);

      const setup = setupRes.data?.setup || projectRes.data.setup;
      setSetupDraft({
        aspectRatio: setup?.aspectRatio || '9:16',
        styleSummary: setup?.styleSummary || '',
        targetMedium: setup?.targetMedium || '漫剧',
        globalPromptsText: (setup?.globalPrompts || []).join('\n'),
      });
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '项目加载失败');
    } finally {
      setProjectLoading(false);
    }
  };

  const loadEpisodeWorkspaceBundle = async (episodeId: string) => {
    const [contextRes, workspaceRes] = await Promise.all([
      appApi.getEpisodeContext(episodeId),
      appApi.getEpisodeWorkspace(episodeId),
    ]);

    setEpisodeContext(contextRes.data || null);
    setEpisodeWorkspace(workspaceRes.data || null);
    setSelectedCanvasNodeId(workspaceRes.data?.content?.nodes?.[0]?.id || null);
  };

  const loadStudio = async () => {
    const listRes = await appApi.listStudioWorkspaces();
    if (!listRes.success || !listRes.data) {
      throw new Error(listRes.error || 'Studio 加载失败');
    }
    setStudioWorkspaces(listRes.data);
    const nextId = activeStudioId && listRes.data.find((item) => item.id === activeStudioId)
      ? activeStudioId
      : listRes.data[0]?.id || null;
    setActiveStudioId(nextId);
    setSelectedStudioNodeId(listRes.data[0]?.content?.nodes?.[0]?.id || null);
  };

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const boot = async () => {
      setCheckingAuth(true);
      try {
        const meRes = await appApi.me();
        if (meRes.success && meRes.data) {
          setUser(meRes.data);
          await Promise.all([loadCatalogs(), loadProjects()]);
        }
      } finally {
        setCheckingAuth(false);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    if (!user) return;
    if ('projectId' in route) {
      void loadProjectBundle(route.projectId);
    } else {
      setProjectDetail(null);
      setProjectSetup(null);
      setStageConfig({});
      setAssets([]);
      setEpisodes([]);
    }

    if (route.kind === 'episode-workspace') {
      void loadEpisodeWorkspaceBundle(route.episodeId);
    } else {
      setEpisodeContext(null);
      setEpisodeWorkspace(null);
      setSelectedCanvasNodeId(null);
    }

    if (route.kind === 'studio') {
      void loadStudio().catch((error) => setProjectError(error instanceof Error ? error.message : 'Studio 加载失败'));
    }
  }, [route, user]);

  useEffect(() => {
    if (!activeStudioId || route.kind !== 'studio') return;
    void appApi.getStudioWorkspace(activeStudioId).then((response) => {
      if (response.success && response.data) {
        setStudioWorkspaces((current) => current.map((item) => (item.id === response.data?.id ? response.data : item)));
        setSelectedStudioNodeId(response.data.content?.nodes?.[0]?.id || null);
      }
    });
  }, [activeStudioId, route.kind]);

  const refreshProject = async () => {
    if (!('projectId' in route)) return;
    await Promise.all([loadProjectBundle(route.projectId), loadProjects()]);
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);

    const response = authMode === 'login'
      ? await appApi.login({ email: authForm.email, password: authForm.password })
      : await appApi.register({ email: authForm.email, password: authForm.password, name: authForm.name });

    if (!response.success || !response.data) {
      setAuthError(response.error || '认证失败');
      return;
    }

    setUser(response.data);
    await Promise.all([loadCatalogs(), loadProjects()]);
  };

  const handleLogout = async () => {
    await appApi.logout();
    setUser(null);
    setProjects([]);
    navigate('/');
  };

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectTitle.trim()) return;
    const response = await appApi.createProject({ title: projectTitle.trim() });
    if (!response.success || !response.data) {
      setProjectError(response.error || '项目创建失败');
      return;
    }
    setProjectTitle('');
    await loadProjects();
    navigate(`/projects/${response.data.id}/setup`);
  };

  const handleUploadScript = async () => {
    if (!projectDetail) return;
    const response = await appApi.uploadScriptSource(projectDetail.id, {
      textContent: scriptText,
      file: scriptFile,
    });
    if (!response.success) {
      setProjectError(response.error || '剧本上传失败');
      return;
    }
    setScriptText('');
    setScriptFile(null);
    await refreshProject();
  };

  const handleSaveSetup = async () => {
    if (!projectDetail) return;
    const response = await appApi.updateProjectSetup(projectDetail.id, {
      aspectRatio: setupDraft.aspectRatio,
      styleSummary: setupDraft.styleSummary,
      targetMedium: setupDraft.targetMedium,
      globalPrompts: splitLines(setupDraft.globalPromptsText),
    });
    if (!response.success) {
      setProjectError(response.error || '项目设定保存失败');
      return;
    }
    await refreshProject();
  };

  const handleSaveStageConfig = async () => {
    if (!projectDetail) return;
    const response = await appApi.updateStageConfig(projectDetail.id, stageConfig);
    if (!response.success) {
      setProjectError(response.error || '阶段配置保存失败');
      return;
    }
    await refreshProject();
  };

  const handleRunDecompose = async () => {
    if (!projectDetail) return;
    const stage = stageConfig.script_decompose;
    const response = await appApi.runCapability({
      capabilityId: 'script_decompose',
      projectId: projectDetail.id,
      modelId: stage?.modelId,
      skillPackId: stage?.skillPackId,
    });
    if (!response.success) {
      setProjectError(response.error || '剧本拆解失败');
      return;
    }
    await refreshProject();
  };

  const handleCreateAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectDetail || !assetForm.name.trim()) return;
    const response = await appApi.createAsset(projectDetail.id, {
      type: assetForm.type,
      name: assetForm.name,
      description: assetForm.description,
      promptText: assetForm.promptText,
    });
    if (!response.success) {
      setProjectError(response.error || '资产创建失败');
      return;
    }
    setAssetForm({ type: 'character', name: '', description: '', promptText: '' });
    await refreshProject();
  };

  const handleSetAssetLock = async (asset: CanonicalAsset, locked: boolean) => {
    const response = locked ? await appApi.lockAsset(asset.id) : await appApi.unlockAsset(asset.id);
    if (!response.success) {
      setProjectError(response.error || '资产状态更新失败');
      return;
    }
    await refreshProject();
  };

  const handleAnalyzeEpisode = async (episode: Episode) => {
    if (!projectDetail) return;
    const stage = stageConfig.episode_expand;
    const response = await appApi.analyzeEpisode(projectDetail.id, episode.id, {
      skillPackId: stage?.skillPackId,
      modelId: stage?.modelId,
    });
    if (!response.success) {
      setProjectError(response.error || '单集分析失败');
      return;
    }
    await refreshProject();
    navigate(`/projects/${projectDetail.id}/episodes/${episode.id}/workspace`);
  };

  const handleGenerateEpisodePrompt = async () => {
    if (!projectDetail || route.kind !== 'episode-workspace') return;
    const stage = stageConfig.video_prompt_generate;
    const response = await appApi.runCapability({
      capabilityId: 'video_prompt_generate',
      projectId: projectDetail.id,
      episodeId: route.episodeId,
      modelId: stage?.modelId,
      skillPackId: stage?.skillPackId,
      promptRecipeId: stage?.promptRecipeId,
    });
    if (!response.success) {
      setProjectError(response.error || '提示词生成失败');
      return;
    }
    await loadEpisodeWorkspaceBundle(route.episodeId);
  };

  const handleSaveEpisodeWorkspace = async (content: EpisodeWorkspace['content']) => {
    if (route.kind !== 'episode-workspace') return;
    const response = await appApi.saveEpisodeWorkspace(route.episodeId, content);
    if (!response.success || !response.data) {
      setProjectError(response.error || '单集工作台保存失败');
      return;
    }
    setEpisodeWorkspace(response.data);
  };

  const handleCreateStudioWorkspace = async () => {
    const response = await appApi.createStudioWorkspace({ title: `Studio ${studioWorkspaces.length + 1}` });
    if (!response.success || !response.data) {
      setProjectError(response.error || 'Studio 创建失败');
      return;
    }
    await loadStudio();
    setActiveStudioId(response.data.id);
  };

  const handleImportAssetsToStudio = async () => {
    if (!activeStudioId || !projectDetail) return;
    const response = await appApi.importProjectAssetsToStudio(activeStudioId, projectDetail.id);
    if (!response.success || !response.data) {
      setProjectError(response.error || '导入资产失败');
      return;
    }
    setStudioWorkspaces((current) => current.map((item) => (item.id === response.data?.id ? response.data : item)));
  };

  const activeStudio = studioWorkspaces.find((item) => item.id === activeStudioId) || null;

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#030507] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-[28px] border border-white/10 bg-black/30 px-8 py-10 text-center backdrop-blur">
            <div className="text-xs uppercase tracking-[0.34em] text-cyan-300/70">Booting</div>
            <h2 className="mt-4 text-2xl font-semibold">正在载入在线工作流系统</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AppShell
        title="漫剧在线工作流"
        subtitle="项目主线负责结构化生产，Canvas Studio 保留多模态自由创作，但不污染项目主数据。"
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
            <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Workflow-first</div>
            <h2 className="mt-3 text-3xl font-semibold">项目主线 + Studio 沙盒</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                ['剧本拆解', '从文本、docx、pdf 进入项目，并生成故事圣经、资产候选和剧集壳子。'],
                ['资产锁定', '角色、场景、道具与风格成为 canonical assets，单集不能绕开锁定版本。'],
                ['单集工作台', '只承接项目设定、前文摘要和锁定资产，不继承旧画布。'],
                ['Canvas Studio', '文本/图片/音频/视频自由创作，可复制导入项目资产，但永不回写。'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-[24px] border border-white/8 bg-black/25 p-5">
                  <div className="text-lg font-semibold text-white">{title}</div>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-black/30 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </div>
            <h2 className="mt-3 text-3xl font-semibold">{authMode === 'login' ? '登录系统' : '注册账号'}</h2>
            <form className="mt-8 space-y-4" onSubmit={handleAuthSubmit}>
              {authMode === 'register' ? (
                <label className="block">
                  <div className="mb-2 text-sm text-slate-300">昵称</div>
                  <input
                    value={authForm.name}
                    onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30"
                    placeholder="请输入昵称"
                  />
                </label>
              ) : null}
              <label className="block">
                <div className="mb-2 text-sm text-slate-300">邮箱</div>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30"
                  placeholder="name@example.com"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-sm text-slate-300">密码</div>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30"
                  placeholder="至少 6 位"
                />
              </label>
              {authError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{authError}</div> : null}
              <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90">
                <Sparkles size={16} />
                {authMode === 'login' ? '登录并进入工作流' : '注册并进入工作流'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setAuthMode((current) => (current === 'login' ? 'register' : 'login'))}
              className="mt-5 text-sm text-slate-300 underline-offset-4 hover:text-white hover:underline"
            >
              {authMode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </button>
          </section>
        </div>
      </AppShell>
    );
  }

  const projectNav = projectDetail ? (
    <div className="flex flex-wrap items-center gap-3">
      {[
        ['setup', '项目设定'],
        ['assets', '资产锁定'],
        ['episodes', '剧集列表'],
      ].map(([section, label]) => {
        const active = route.kind === `project-${section}` || (section === 'episodes' && route.kind === 'episode-workspace');
        return (
          <button
            key={section}
            type="button"
            onClick={() => navigate(`/projects/${projectDetail.id}/${section}`)}
            className={`rounded-full px-4 py-2 text-sm transition ${active ? 'bg-white text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  ) : null;

  const rightActions = (
    <>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20"
      >
        <FolderKanban size={16} />
        项目列表
      </button>
      <button
        type="button"
        onClick={() => navigate('/studio')}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
          route.kind === 'studio' ? 'bg-amber-300 text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20'
        }`}
      >
        <Clapperboard size={16} />
        Canvas Studio
      </button>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20"
      >
        <LogOut size={16} />
        退出
      </button>
    </>
  );

  if (route.kind === 'home') {
    return (
      <AppShell
        title={`欢迎回来，${user.name}`}
        subtitle="从项目主线推进剧本拆解、资产锁定和剧集制作，也可以进入独立 Studio 做纯沙盒创作。"
        rightSlot={rightActions}
      >
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[32px] border border-white/10 bg-black/30 p-6">
            <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">New Project</div>
            <h2 className="mt-3 text-2xl font-semibold">创建漫剧项目</h2>
            <form className="mt-6 flex flex-col gap-3" onSubmit={handleCreateProject}>
              <input
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30"
                placeholder="输入新项目名称，例如《错嫁凌王》"
              />
              <button className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90">
                <Plus size={16} />
                创建并进入项目设定
              </button>
            </form>
            {projectError ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{projectError}</div> : null}
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Projects</div>
                <h2 className="mt-3 text-2xl font-semibold">项目主线</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadProjects()}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20"
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => navigate(`/projects/${project.id}/setup`)}
                  className="rounded-[28px] border border-white/8 bg-black/25 p-5 text-left transition hover:border-white/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xl font-semibold">{project.title}</div>
                      <div className="mt-2 text-sm text-slate-300">
                        {project.hasScript ? '已上传剧本' : '待上传剧本'} · {project.assetCount} 个资产 · {project.episodeCount} 集
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                      {project.role}
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-white/45">更新于 {formatDate(project.updatedAt)}</div>
                </button>
              ))}
              {projects.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-white/15 bg-black/20 px-6 py-10 text-center text-sm text-slate-300">
                  还没有项目。先创建一个项目，再上传剧本进入主流程。
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  if (route.kind === 'studio') {
    return (
      <AppShell
        title="Canvas Studio"
        subtitle="独立多模态沙盒。你可以复制导入项目资产到这里，但所有内容都只留在 Studio，不会回写项目。"
        rightSlot={
          <>
            {rightActions}
            <button type="button" onClick={handleCreateStudioWorkspace} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
              新建 Studio
            </button>
          </>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <aside className="rounded-[32px] border border-white/10 bg-black/30 p-5">
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">Workspaces</div>
            <div className="mt-4 grid gap-3">
              {studioWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setActiveStudioId(workspace.id)}
                  className={`rounded-[24px] border px-4 py-4 text-left transition ${
                    activeStudioId === workspace.id ? 'border-amber-300/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <div className="font-semibold text-white">{workspace.title}</div>
                  <div className="mt-2 text-xs text-slate-300">
                    {workspace.content.nodes?.length || 0} 个节点 · {workspace.importedAssets.length} 个导入资产
                  </div>
                </button>
              ))}
            </div>
            {projectDetail ? (
              <button type="button" onClick={handleImportAssetsToStudio} className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 transition hover:border-white/20">
                复制导入当前项目资产
              </button>
            ) : null}
          </aside>

          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              {(['text', 'image', 'audio', 'video'] as CanvasNode['type'][]).map((type, index) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    if (!activeStudio) return;
                    const nextNodes = [...(activeStudio.content.nodes || []), createNode(type, (activeStudio.content.nodes || []).length + index)];
                    const nextWorkspace = { ...activeStudio, content: { ...activeStudio.content, nodes: nextNodes } };
                    setStudioWorkspaces((current) => current.map((item) => (item.id === nextWorkspace.id ? nextWorkspace : item)));
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:border-white/20"
                >
                  添加{type}
                </button>
              ))}
              {activeStudio ? (
                <button
                  type="button"
                  onClick={() => void appApi.saveStudioWorkspace(activeStudio.id, activeStudio).then((response) => {
                    if (response.success && response.data) {
                      setStudioWorkspaces((current) => current.map((item) => (item.id === response.data?.id ? response.data : item)));
                    }
                  })}
                  className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-black"
                >
                  保存 Studio
                </button>
              ) : null}
            </div>

            {activeStudio ? (
              <>
                <CanvasSurface
                  nodes={activeStudio.content.nodes || []}
                  selectedNodeId={selectedStudioNodeId}
                  onSelectNode={setSelectedStudioNodeId}
                  onChangeNodes={(nodes) => setStudioWorkspaces((current) => current.map((item) => (item.id === activeStudio.id ? { ...item, content: { ...item.content, nodes } } : item)))}
                />
                <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">Imported Assets</div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {activeStudio.importedAssets.map((asset) => (
                      <div key={`${activeStudio.id}-${asset.id}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
                        {asset.type} · {asset.name}
                      </div>
                    ))}
                    {activeStudio.importedAssets.length === 0 ? <div className="text-sm text-slate-400">还没有导入任何项目资产。</div> : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[32px] border border-dashed border-white/15 bg-black/20 px-8 py-16 text-center text-slate-300">
                先创建一个 Studio 工作区，或者从项目页进入后复制导入项目资产。
              </div>
            )}
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={projectDetail?.title || '项目工作流'}
      subtitle={route.kind === 'project-setup' ? '上传剧本、设定风格与阶段技能，运行项目拆解。' : route.kind === 'project-assets' ? '在这里沉淀并锁定角色、场景、道具和风格。' : route.kind === 'project-episodes' ? '先看剧集列表，再逐集分析进入工作台。' : '单集工作台只承接当前集上下文。'}
      nav={projectNav}
      rightSlot={<>{projectDetail ? <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20"><ArrowLeft size={16} />返回项目列表</button> : null}{rightActions}</>}
    >
      {projectLoading ? <div className="rounded-[32px] border border-white/10 bg-black/20 px-8 py-16 text-center text-slate-300">正在加载项目…</div> : null}
      {projectError ? <div className="mb-6 rounded-[28px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">{projectError}</div> : null}

      {!projectLoading && route.kind === 'project-setup' && projectDetail ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[32px] border border-white/10 bg-black/30 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Script Intake</div>
                <h2 className="mt-3 text-2xl font-semibold">剧本入口</h2>
              </div>
              <button type="button" onClick={handleRunDecompose} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"><Wand2 size={15} />运行剧本拆解</button>
            </div>
            <div className="mt-5 grid gap-4">
              <textarea value={scriptText} onChange={(event) => setScriptText(event.target.value)} className="min-h-[220px] rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-100 outline-none focus:border-white/30" placeholder="输入剧本正文，或者上传 docx / pdf。" />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20">
                  <Upload size={16} />上传 docx / pdf
                  <input type="file" accept=".doc,.docx,.pdf,.txt,.md" className="hidden" onChange={(event) => setScriptFile(event.target.files?.[0] || null)} />
                </label>
                {scriptFile ? <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">{scriptFile.name}</div> : null}
                <button type="button" onClick={handleUploadScript} className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black">保存剧本源</button>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <section className="rounded-[32px] border border-white/10 bg-black/30 p-6">
              <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Project Setup</div>
              <h2 className="mt-3 text-2xl font-semibold">项目设定</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <select value={setupDraft.aspectRatio} onChange={(event) => setSetupDraft((current) => ({ ...current, aspectRatio: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">{['1:1', '3:4', '4:3', '9:16', '16:9'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</select>
                <input value={setupDraft.targetMedium} onChange={(event) => setSetupDraft((current) => ({ ...current, targetMedium: event.target.value }))} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30" placeholder="目标媒介" />
                <textarea value={setupDraft.styleSummary} onChange={(event) => setSetupDraft((current) => ({ ...current, styleSummary: event.target.value }))} className="min-h-[120px] rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30 md:col-span-2" placeholder="风格说明" />
                <textarea value={setupDraft.globalPromptsText} onChange={(event) => setSetupDraft((current) => ({ ...current, globalPromptsText: event.target.value }))} className="min-h-[120px] rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30 md:col-span-2" placeholder="全局提示词，每行一条" />
              </div>
              <button type="button" onClick={handleSaveSetup} className="mt-5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:border-white/20">保存项目设定</button>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-black/30 p-6">
              <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Stage Skills</div>
              <div className="mt-5 grid gap-4">
                {(Object.keys(STAGE_LABELS) as StageKind[]).map((stageKind) => {
                  const config = stageConfig[stageKind];
                  const stageSkills = catalogs.skillPacks.filter((item) => item.stageKind === stageKind);
                  const activeSkill = stageSkills.find((item) => item.id === config?.skillPackId);
                  return (
                    <div key={stageKind} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-lg font-semibold text-white">{STAGE_LABELS[stageKind]}</div>
                      <div className="mt-2 text-sm text-slate-300">{activeSkill?.description || '当前阶段未绑定技能包。'}</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <select value={config?.skillPackId || ''} onChange={(event) => setStageConfig((current) => ({ ...current, [stageKind]: { ...(current[stageKind] || { reviewPolicyIds: [], capabilityId: stageKind, modelId: '' }), skillPackId: event.target.value } }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none">
                          <option value="">不绑定技能包</option>
                          {stageSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                        </select>
                        <select value={config?.modelId || ''} onChange={(event) => setStageConfig((current) => ({ ...current, [stageKind]: { ...(current[stageKind] || { reviewPolicyIds: [], capabilityId: stageKind, modelId: '' }), modelId: event.target.value } }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none">
                          <option value="">选择模型</option>
                          {stageCapabilities(catalogs, stageConfig, stageKind).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                        </select>
                      </div>
                      {activeSkill?.promptRecipes?.length ? (
                        <select
                          value={config?.promptRecipeId || activeSkill.promptRecipes[0].id}
                          onChange={(event) => setStageConfig((current) => ({
                            ...current,
                            [stageKind]: {
                              ...(current[stageKind] || { reviewPolicyIds: [], capabilityId: stageKind, modelId: '' }),
                              promptRecipeId: event.target.value,
                            },
                          }))}
                          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                        >
                          {activeSkill.promptRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                        </select>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {catalogs.reviewPolicies.map((policy) => {
                          const selected = config?.reviewPolicyIds?.includes(policy.id);
                          return (
                            <button
                              key={policy.id}
                              type="button"
                              onClick={() => setStageConfig((current) => {
                                const existing = current[stageKind]?.reviewPolicyIds || [];
                                const nextIds = selected ? existing.filter((id) => id !== policy.id) : [...existing, policy.id];
                                return {
                                  ...current,
                                  [stageKind]: {
                                    ...(current[stageKind] || { reviewPolicyIds: [], capabilityId: stageKind, modelId: '' }),
                                    reviewPolicyIds: nextIds,
                                  },
                                };
                              })}
                              className={`rounded-full px-3 py-2 text-xs transition ${
                                selected ? 'bg-emerald-300 text-black' : 'border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20'
                              }`}
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
              <button type="button" onClick={handleSaveStageConfig} className="mt-5 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black">保存阶段配置</button>
            </section>
          </section>
        </div>
      ) : null}

      {!projectLoading && route.kind === 'project-assets' && projectDetail ? (
        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
          <section className="rounded-[32px] border border-white/10 bg-black/30 p-6">
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">Asset Intake</div>
            <form className="mt-6 space-y-4" onSubmit={handleCreateAsset}>
              <select value={assetForm.type} onChange={(event) => setAssetForm((current) => ({ ...current, type: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">{['character', 'scene', 'prop', 'style'].map((type) => <option key={type} value={type}>{type}</option>)}</select>
              <input value={assetForm.name} onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30" placeholder="资产名称" />
              <textarea value={assetForm.description} onChange={(event) => setAssetForm((current) => ({ ...current, description: event.target.value }))} className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30" placeholder="资产描述" />
              <textarea value={assetForm.promptText} onChange={(event) => setAssetForm((current) => ({ ...current, promptText: event.target.value }))} className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/30" placeholder="提示词" />
              <button className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black">保存资产</button>
            </form>
          </section>
          <section className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">Canonical Assets</div><h2 className="mt-3 text-2xl font-semibold">资产锁定中心</h2></div>
              <button type="button" onClick={() => void refreshProject()} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20"><RefreshCw size={14} />刷新</button>
            </div>
            <div className="mt-5 grid gap-4">
              {assets.map((asset) => (
                <div key={asset.id} className="rounded-[28px] border border-white/8 bg-black/25 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div><div className="text-[11px] uppercase tracking-[0.3em] text-white/45">{asset.type}</div><div className="mt-2 text-xl font-semibold">{asset.name}</div><p className="mt-3 text-sm leading-7 text-slate-300">{asset.description || '暂无描述'}</p></div>
                    <div className={`rounded-full px-3 py-1 text-xs ${asset.isLocked ? 'bg-emerald-300 text-black' : 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>{asset.isLocked ? '已锁定' : '未锁定'}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => handleSetAssetLock(asset, !asset.isLocked)} className={`rounded-full px-4 py-2 text-sm transition ${asset.isLocked ? 'border border-white/10 bg-white/[0.04] text-slate-100' : 'bg-emerald-300 text-black'}`}>{asset.isLocked ? '解锁' : '锁定'}</button>
                    <div className="text-xs text-white/45">版本 {asset.versions.length} · 更新于 {formatDate(asset.updatedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {!projectLoading && route.kind === 'project-episodes' && projectDetail ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {episodes.map((episode) => (
            <div key={episode.id} className="rounded-[32px] border border-white/10 bg-black/30 p-6">
              <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Episode {episode.episodeNumber}</div>
              <h2 className="mt-3 text-2xl font-semibold">{episode.title}</h2>
              <p className="mt-4 line-clamp-5 text-sm leading-7 text-slate-300">{episode.synopsis}</p>
              <div className="mt-6 flex items-center gap-3">
                <button type="button" onClick={() => handleAnalyzeEpisode(episode)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">分析本集</button>
                <button type="button" onClick={() => navigate(`/projects/${projectDetail.id}/episodes/${episode.id}/workspace`)} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:border-white/20">进入工作台</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!projectLoading && route.kind === 'episode-workspace' && projectDetail ? (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-5">
            <section className="rounded-[32px] border border-white/10 bg-black/30 p-5">
              <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">Context</div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">{episodeContext?.contextSummary || '请先运行单集分析。'}</p>
              <button type="button" onClick={handleGenerateEpisodePrompt} className="mt-5 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-black">生成视频提示词</button>
            </section>
            <section className="rounded-[32px] border border-white/10 bg-black/30 p-5">
              <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/70">Locked Assets</div>
              <div className="mt-4 grid gap-3">
                {assets.filter((asset) => asset.isLocked).map((asset) => <div key={asset.id} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3"><div className="text-xs uppercase tracking-[0.26em] text-white/35">{asset.type}</div><div className="mt-2 font-semibold">{asset.name}</div></div>)}
              </div>
            </section>
          </aside>
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              {(['text', 'image', 'audio', 'video'] as CanvasNode['type'][]).map((type, index) => (
                <button key={type} type="button" onClick={() => setEpisodeWorkspace((current) => current ? { ...current, content: { ...current.content, nodes: [...(current.content.nodes || []), createNode(type, (current.content.nodes || []).length + index)] } } : current)} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 transition hover:border-white/20">
                  添加{type}
                </button>
              ))}
              <button type="button" onClick={() => episodeWorkspace && void handleSaveEpisodeWorkspace(episodeWorkspace.content)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">保存工作台</button>
            </div>
            <CanvasSurface nodes={episodeWorkspace?.content.nodes || []} selectedNodeId={selectedCanvasNodeId} onSelectNode={setSelectedCanvasNodeId} onChangeNodes={(nodes) => setEpisodeWorkspace((current) => current ? { ...current, content: { ...current.content, nodes } } : current)} />
          </section>
        </div>
      ) : null}
    </AppShell>
  );
};
