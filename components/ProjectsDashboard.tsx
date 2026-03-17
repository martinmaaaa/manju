import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FolderHeart,
  Loader2,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { createProject, deleteProject, getProjects } from '../services/api';
import type { ProjectSummary } from '../services/api';
import type { WorkflowProjectState } from '../services/workflow/domain/types';
import {
  createInitialManjuProjectWorkflowState,
  withWorkflowProjectState,
} from '../services/workflow/runtime/projectState';
import type {
  WorkflowDashboardPhase,
  WorkflowProjectDashboardSummary,
} from '../services/workflow/domain/dashboard';
import { buildWorkflowProjectDashboardSummary } from '../services/workflow/runtime/projectDashboard';
import {
  BRAND_LOGO_ALT,
  BRAND_TAGLINE,
  BRAND_WORKSPACE_NAME,
} from '../src/branding';
import { DEFAULT_PROJECT_SETTINGS } from '../services/workflowTemplates';

interface ProjectsDashboardProps {
  onSelectProject: (projectId: string) => void;
  onOpenCreatedProject?: (
    project: ProjectSummary,
    workflowState: WorkflowProjectState,
  ) => void | Promise<void>;
  onOpenSettings?: () => void;
}

type ToastState = {
  id: number;
  type: 'success' | 'error';
  message: string;
} | null;

type ProjectCardState = {
  project: ProjectSummary;
  dashboard: WorkflowProjectDashboardSummary;
};

const PRIMARY_WORKFLOW_TITLE = '漫剧工作流';

const DIRTY_PROJECT_NAME_PATTERNS = [
  /^playwright-\d+/i,
  /^uxtrim/i,
  /^ux-check/i,
  /^ui-save-check/i,
  /^fullflow-\d+/i,
  /^utf8/i,
  /^docker db/i,
];

function isDirtyProjectCard({ project, dashboard }: ProjectCardState): boolean {
  const normalizedTitle = (project.title || '').trim();
  const hasZeroWorkflowData =
    dashboard.totals.workflowCount === 0
    && dashboard.totals.episodeCount === 0
    && dashboard.totals.assetCount === 0
    && dashboard.totals.videoCompletedEpisodeCount === 0
    && dashboard.phase === 'empty';
  const hasEncodingNoise =
    normalizedTitle.includes('\uFFFD')
    || /\?{3,}/.test(normalizedTitle)
    || /[\uFFFD]/.test(normalizedTitle);
  const matchesDirtyPattern = DIRTY_PROJECT_NAME_PATTERNS.some((pattern) => pattern.test(normalizedTitle));

  return hasZeroWorkflowData || hasEncodingNoise || matchesDirtyPattern;
}

const PROJECT_PHASE_META: Record<
  WorkflowDashboardPhase,
  {
    label: string;
    description: string;
    className: string;
  }
> = {
  empty: {
    label: '待创建流程',
    description: '还没有进入 v2 工作流主链路。',
    className: 'border-white/10 bg-white/5 text-slate-200',
  },
  asset_setup: {
    label: '待补资产',
    description: '流程已经启动，下一步先沉淀项目级可复用资产。',
    className: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
  },
  episode_planning: {
    label: '待铺排单集',
    description: '资产具备基础后，下一步是把系列拆到单集执行单元。',
    className: 'border-sky-400/20 bg-sky-500/10 text-sky-100',
  },
  in_production: {
    label: '制作进行中',
    description: '当前已经进入脚本、分镜、提示词或视频的推进阶段。',
    className: 'border-violet-400/20 bg-violet-500/10 text-violet-100',
  },
  ready_for_canvas: {
    label: '可投放画布',
    description: '主流程已基本打通，可以继续投放到高级画布执行。',
    className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
  },
};

function getProjectCardState(project: ProjectSummary): ProjectCardState {
  return {
    project,
    dashboard: project.dashboard ?? buildWorkflowProjectDashboardSummary(project),
  };
}

function formatDate(dateString?: string): string {
  if (!dateString) return '刚刚';

  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
  onSelectProject,
  onOpenCreatedProject,
  onOpenSettings,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isCleaningDirtyProjects, setIsCleaningDirtyProjects] = useState(false);
  const [showDirtyProjects, setShowDirtyProjects] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  const projectCards = useMemo(
    () => projects.map(getProjectCardState),
    [projects],
  );

  const cleanProjectCards = useMemo(
    () => projectCards.filter((card) => !isDirtyProjectCard(card)),
    [projectCards],
  );

  const dirtyProjectCards = useMemo(
    () => projectCards.filter(isDirtyProjectCard),
    [projectCards],
  );

  const latestProject = useMemo(
    () => {
      const source = cleanProjectCards.length > 0 ? cleanProjectCards : projectCards;
      return source.reduce<ProjectCardState | null>((latest, current) => {
        if (!latest) return current;
        return new Date(current.project.updated_at).getTime() > new Date(latest.project.updated_at).getTime()
          ? current
          : latest;
      }, null);
    },
    [cleanProjectCards, projectCards],
  );

  const workflowTotals = useMemo(
    () => cleanProjectCards.reduce((accumulator, current) => ({
      workflowCount: accumulator.workflowCount + current.dashboard.totals.workflowCount,
      seriesCount: accumulator.seriesCount + current.dashboard.totals.seriesCount,
      episodeCount: accumulator.episodeCount + current.dashboard.totals.episodeCount,
      assetCount: accumulator.assetCount + current.dashboard.totals.assetCount,
      videoCompletedEpisodeCount:
        accumulator.videoCompletedEpisodeCount + current.dashboard.totals.videoCompletedEpisodeCount,
    }), {
      workflowCount: 0,
      seriesCount: 0,
      episodeCount: 0,
      assetCount: 0,
      videoCompletedEpisodeCount: 0,
    }),
    [cleanProjectCards],
  );

  const showToast = (type: NonNullable<ToastState>['type'], message: string) => {
    setToast({
      id: Date.now(),
      type,
      message,
    });
  };

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);

      try {
        const response = await getProjects();
        if (response.success && response.data) {
          setProjects(response.data);
          return;
        }

        showToast('error', response.error || '加载项目列表失败，请稍后重试。');
      } catch (error) {
        console.error('Failed to load projects', error);
        showToast('error', '加载项目列表失败，请稍后重试。');
      } finally {
        setLoading(false);
      }
    };

    void loadProjects();
  }, []);

  useEffect(() => {
    if (!isCreating && !projectToDelete) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (isCreating && !isSubmitting) {
        setIsCreating(false);
      }

      if (projectToDelete && deletingProjectId !== projectToDelete.id) {
        setProjectToDelete(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deletingProjectId, isCreating, isSubmitting, projectToDelete]);

  const handleCreateProject = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedProjectName = newProjectName.trim();
    if (!trimmedProjectName || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const initialWorkflowState = createInitialManjuProjectWorkflowState(trimmedProjectName);
      const nextSettings = withWorkflowProjectState(DEFAULT_PROJECT_SETTINGS, initialWorkflowState);
      const response = await createProject(trimmedProjectName, nextSettings, initialWorkflowState);

      if (response.success && response.data) {
        setProjects((currentProjects) => [response.data, ...currentProjects]);
        setNewProjectName('');
        setIsCreating(false);
        showToast('success', `项目“${response.data.title || trimmedProjectName}”已创建。`);
        if (onOpenCreatedProject) {
          await Promise.resolve(onOpenCreatedProject(response.data, initialWorkflowState));
        } else {
          await Promise.resolve(onSelectProject(response.data.id));
        }
        return;
      }

      showToast('error', `创建项目失败：${response.error || '未知错误'}`);
    } catch (error: any) {
      console.error('Failed to create project', error);
      showToast('error', `创建项目异常：${error?.message || '请稍后再试'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestDeleteProject = (event: React.MouseEvent, project: ProjectSummary) => {
    event.stopPropagation();
    if (deletingProjectId) return;
    setProjectToDelete(project);
  };

  const closeDeleteDialog = () => {
    if (projectToDelete && deletingProjectId === projectToDelete.id) return;
    setProjectToDelete(null);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || deletingProjectId) return;

    const deletingProject = projectToDelete;

    try {
      setDeletingProjectId(deletingProject.id);
      const response = await deleteProject(deletingProject.id);

      if (response.success) {
        setProjects((currentProjects) =>
          currentProjects.filter((project) => project.id !== deletingProject.id),
        );
        setProjectToDelete(null);
        showToast('success', `项目“${deletingProject.title || '未命名项目'}”已删除。`);
        return;
      }

      showToast('error', `删除项目失败：${response.error || '请稍后重试'}`);
    } catch (error) {
      console.error('Failed to delete project', error);
      showToast('error', '删除项目失败，请稍后重试。');
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleCleanDirtyProjects = async () => {
    if (dirtyProjectCards.length === 0 || isCleaningDirtyProjects) return;

    try {
      setIsCleaningDirtyProjects(true);
      const projectIds = dirtyProjectCards.map((card) => card.project.id);
      const results = await Promise.all(projectIds.map((projectId) => deleteProject(projectId)));
      const deletedCount = results.filter((result) => result.success).length;
      const failedCount = results.length - deletedCount;

      if (deletedCount > 0) {
        setProjects((currentProjects) =>
          currentProjects.filter((project) => !projectIds.includes(project.id)),
        );
      }

      if (failedCount === 0) {
        showToast('success', `已清理 ${deletedCount} 条首页脏数据。`);
      } else {
        showToast('error', `清理完成 ${deletedCount} 条，仍有 ${failedCount} 条未删除。`);
      }
    } catch (error) {
      console.error('Failed to clean dirty projects', error);
      showToast('error', '清理脏数据失败，请稍后重试。');
    } finally {
      setIsCleaningDirtyProjects(false);
    }
  };

  if (loading) {
    return (
      <div className="tianti-shell flex h-full w-full flex-col items-center justify-center text-white">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-cyan-400" />
        <p className="text-sm text-slate-400">正在加载项目列表...</p>
      </div>
    );
  }

  return (
    <div className="tianti-shell flex h-full w-full flex-col overflow-hidden text-white">
      <div className="fixed right-6 top-6 z-[70] pointer-events-none">
        {toast && (
          <div
            className={`tianti-surface pointer-events-auto flex min-w-[280px] max-w-[360px] items-start gap-3 rounded-2xl px-4 py-3 ${
              toast.type === 'success'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50'
                : 'border-red-400/30 bg-red-500/10 text-red-50'
            }`}
          >
            <div className={`mt-0.5 ${toast.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </div>
            <div className="flex-1 text-sm leading-6">{toast.message}</div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-white/50 transition-colors hover:text-white"
              aria-label="关闭提示"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <header className="tianti-shell-header z-10">
        <div className="tianti-shell-container flex items-center justify-between gap-4 px-6 py-6 lg:px-8">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt={BRAND_LOGO_ALT} className="h-12 object-contain" />
            <div>
              <h1 className="bg-gradient-to-r from-cyan-300 via-white to-violet-300 bg-clip-text text-2xl font-semibold text-transparent">
                {BRAND_WORKSPACE_NAME}
              </h1>
              <p className="mt-1 text-xs text-slate-400">{BRAND_TAGLINE}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className="tianti-button tianti-button-secondary px-5 py-3 text-sm font-medium"
              title="系统设置"
            >
              <Settings size={18} />
              系统设置
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="tianti-button tianti-button-primary px-6 py-3 text-sm font-semibold"
            >
              <Plus size={18} />
              新建项目
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="tianti-shell-container px-6 py-8 lg:px-8">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="tianti-hero-card rounded-[32px] p-8">
              <div className="tianti-chip is-accent">
                <Sparkles size={14} />
                工作流入口
              </div>
              <h2 className="mt-5 text-3xl font-semibold leading-tight text-white">从项目直接进入漫剧主工作流。</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">创建后自动带出系列工作流，先做系列设定、剧本和分集规划。</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="tianti-button tianti-button-primary px-6 py-3 text-sm font-semibold"
                >
                  <Plus size={16} />
                  创建新项目
                </button>
                <button
                  type="button"
                  onClick={() => latestProject && onSelectProject(latestProject.project.id)}
                  disabled={!latestProject}
                  className="tianti-button tianti-button-secondary px-6 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  打开最近项目
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <div className="tianti-stat-card px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">有效项目</div>
                <div className="mt-3 text-3xl font-semibold text-white">{cleanProjectCards.length}</div>
                <div className="mt-2 text-sm text-slate-400">
                  {dirtyProjectCards.length > 0 ? `已隐藏 ${dirtyProjectCards.length} 条脏数据` : '工作区入口'}
                </div>
              </div>
              <div className="tianti-stat-card px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">最近更新</div>
                <div className="mt-3 truncate text-lg font-semibold text-white">
                  {latestProject?.project.title || '暂无项目'}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {latestProject ? formatDate(latestProject.project.updated_at) : '暂无'}
                </div>
              </div>
              <div className="tianti-stat-card px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">V2 进度</div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {workflowTotals.workflowCount} 流程 / {workflowTotals.seriesCount} 系列
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {workflowTotals.episodeCount} 单集 · {workflowTotals.assetCount} 资产 · {workflowTotals.videoCompletedEpisodeCount} 视频
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-white/45">Project Library</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">项目仓库</h3>
              </div>
              <div className="text-sm text-slate-400">
                按更新时间排序，展示 {cleanProjectCards.length} 个有效项目
              </div>
            </div>

            {cleanProjectCards.length === 0 ? (
              <div className="tianti-surface flex min-h-[360px] flex-col items-center justify-center rounded-[32px] px-8 py-12 text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-500">
                  <FolderHeart size={40} />
                </div>
                <h4 className="mt-6 text-2xl font-semibold text-white">还没有项目</h4>
                <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
                  先创建一个漫剧项目，再从系列设定进入分集规划和单集剧本。
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="tianti-button tianti-button-primary mt-6 px-6 py-3 text-sm font-semibold"
                >
                  <Plus size={18} />
                  创建第一个项目
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {cleanProjectCards.map(({ project, dashboard }) => {
                  const phaseMeta = PROJECT_PHASE_META[dashboard.phase];
                  const episodeProgressLabel = dashboard.totals.plannedEpisodeCount > 0
                    ? `${dashboard.totals.episodeCount}/${dashboard.totals.plannedEpisodeCount}`
                    : String(dashboard.totals.episodeCount);

                  return (
                    <article
                      key={project.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectProject(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectProject(project.id);
                        }
                      }}
                      className="tianti-surface group cursor-pointer overflow-hidden rounded-[28px] transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-[0_24px_80px_rgba(10,132,255,0.18)]"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(115,224,255,0.18),transparent_36%),linear-gradient(180deg,rgba(11,16,28,0.92),rgba(6,10,18,0.96))]">
                        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.08),transparent)] opacity-0 transition duration-700 group-hover:translate-x-full group-hover:opacity-100" />
                        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                          <span className="tianti-chip is-accent">工作流项目</span>
                          <button
                            type="button"
                            onClick={(event) => handleRequestDeleteProject(event, project)}
                            disabled={deletingProjectId === project.id}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30 text-slate-300 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title="删除项目"
                          >
                            {deletingProjectId === project.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>

                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-100 shadow-[0_10px_30px_rgba(73,200,255,0.18)] transition duration-300 group-hover:scale-105">
                            <FolderHeart size={32} />
                          </div>
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h4 className="truncate text-lg font-semibold text-white transition-colors group-hover:text-cyan-200">
                              {project.title || '未命名项目'}
                            </h4>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                              {dashboard.activeWorkflowTitle || phaseMeta.label}
                            </p>
                          </div>
                          <div className="mt-0.5 text-cyan-200 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                            <ArrowUpRight size={18} />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${phaseMeta.className}`}>
                            {phaseMeta.label}
                          </span>
                          {dashboard.activeEpisodeTitle && (
                            <span className="tianti-chip">当前单集 {dashboard.activeEpisodeTitle}</span>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">流程</div>
                            <div className="mt-2 text-base font-semibold text-white">{dashboard.totals.workflowCount}</div>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">单集</div>
                            <div className="mt-2 text-base font-semibold text-white">{episodeProgressLabel}</div>
                          </div>
                          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-white/35">资产</div>
                            <div className="mt-2 text-base font-semibold text-white">{dashboard.totals.assetCount}</div>
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                            <Clock size={13} />
                            {formatDate(project.updated_at)}
                          </div>
                          <span className="tianti-chip">视频完成 {dashboard.totals.videoCompletedEpisodeCount}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {dirtyProjectCards.length > 0 && (
              <section className="mt-8 rounded-[28px] border border-amber-500/15 bg-amber-500/8 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-amber-100/80">Dirty Data</div>
                    <h4 className="mt-2 text-xl font-semibold text-white">首页脏数据已隐藏</h4>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                      已把旧测试项目、乱码标题和未初始化的空项目从首页主列表移走，避免干扰当前 v2 主链路。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDirtyProjects((current) => !current)}
                      className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
                    >
                      {showDirtyProjects ? '收起脏数据' : `查看脏数据 ${dirtyProjectCards.length}`}
                    </button>
                    <button
                      type="button"
                      onClick={handleCleanDirtyProjects}
                      disabled={isCleaningDirtyProjects}
                      className="tianti-button px-4 py-2 text-sm font-semibold text-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        borderColor: 'rgba(251, 191, 36, 0.24)',
                        background: 'rgba(245, 158, 11, 0.16)',
                      }}
                    >
                      {isCleaningDirtyProjects && <Loader2 size={16} className="animate-spin" />}
                      {isCleaningDirtyProjects ? '清理中...' : '一键清理脏数据'}
                    </button>
                  </div>
                </div>

                {showDirtyProjects && (
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {dirtyProjectCards.map(({ project, dashboard }) => (
                      <article
                        key={`dirty-${project.id}`}
                        className="rounded-[22px] border border-amber-500/15 bg-black/20 p-4"
                      >
                        <div className="text-sm font-semibold text-white">{project.title || '未命名项目'}</div>
                        <div className="mt-2 text-xs text-slate-400">
                          阶段 {PROJECT_PHASE_META[dashboard.phase].label} · 更新时间 {formatDate(project.updated_at)}
                        </div>
                        <div className="mt-3 text-xs leading-6 text-slate-500">
                          这类项目通常来自旧测试、乱码数据或未初始化的空壳项目。
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </section>
        </div>
      </main>

      {isCreating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={() => {
            if (isSubmitting) return;
            setIsCreating(false);
          }}
        >
          <div
            className="tianti-surface-strong w-[460px] max-w-[92vw] rounded-[32px] p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Create Project</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">创建新项目</h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">创建后直接进入漫剧工作流中心。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) return;
                  setIsCreating(false);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:text-white"
                aria-label="关闭创建弹窗"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="mt-6 space-y-5">
              <div>
                <div className="mb-2 text-sm text-slate-300">项目名称</div>
                <input
                  type="text"
                  autoFocus
                  placeholder="例如：校园漫剧主线 / 古风系列 A"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  disabled={isSubmitting}
                  className="tianti-input w-full px-4 py-3 text-white placeholder:text-slate-500"
                />
              </div>

              <div>
                <div className="mb-2 text-sm text-slate-300">工作流</div>
                <div className="rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">{PRIMARY_WORKFLOW_TITLE}</div>
                      <div className="mt-2 text-sm leading-7 text-slate-300">
                        当前只保留漫剧主线，创建后会直接带出系列工作流，进入系列设定、剧本和分集规划。
                      </div>
                    </div>
                    <span className="tianti-chip is-accent">当前可用</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isSubmitting) return;
                    setIsCreating(false);
                  }}
                  disabled={isSubmitting}
                  className="tianti-button tianti-button-secondary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim() || isSubmitting}
                  className="tianti-button tianti-button-primary px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting ? '创建中...' : '创建漫剧项目'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projectToDelete && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={closeDeleteDialog}
        >
          <div
            className="tianti-surface-strong w-[460px] max-w-[92vw] rounded-[32px] p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-red-200/80">Delete Project</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">确认删除项目</h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  删除后，项目配置、画布节点以及关联的工作流数据都会一并移除，且无法撤销。
                </p>
              </div>
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deletingProjectId === projectToDelete.id}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:text-white disabled:opacity-40"
                aria-label="关闭删除弹窗"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 rounded-[24px] border border-red-400/15 bg-red-500/10 px-5 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-red-200/80">待删除项目</div>
              <div className="mt-2 break-all text-lg font-semibold text-white">
                {projectToDelete.title || '未命名项目'}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deletingProjectId === projectToDelete.id}
                className="tianti-button tianti-button-secondary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteProject}
                disabled={deletingProjectId === projectToDelete.id}
                className="tianti-button px-5 py-2.5 text-sm font-semibold text-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: 'rgba(248, 113, 113, 0.24)',
                  background: 'rgba(248, 113, 113, 0.14)',
                }}
              >
                {deletingProjectId === projectToDelete.id && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {deletingProjectId === projectToDelete.id ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
