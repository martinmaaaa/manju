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
import {
  BRAND_LOGO_ALT,
  BRAND_TAGLINE,
  BRAND_WELCOME_SUBTITLE,
  BRAND_WORKSPACE_NAME,
} from '../src/branding';
import { DEFAULT_PROJECT_SETTINGS } from '../services/workflowTemplates';

interface ProjectsDashboardProps {
  onSelectProject: (projectId: string) => void;
  onOpenSettings?: () => void;
}

type ToastState = {
  id: number;
  type: 'success' | 'error';
  message: string;
} | null;

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
  onSelectProject,
  onOpenSettings,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  const latestProject = useMemo(
    () => projects.reduce<ProjectSummary | null>((latest, project) => {
      if (!latest) return project;
      return new Date(project.updated_at).getTime() > new Date(latest.updated_at).getTime()
        ? project
        : latest;
    }, null),
    [projects],
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
      const response = await createProject(trimmedProjectName, DEFAULT_PROJECT_SETTINGS);

      if (response.success && response.data) {
        setProjects((currentProjects) => [response.data!, ...currentProjects]);
        setNewProjectName('');
        setIsCreating(false);
        showToast('success', `项目“${response.data.title || trimmedProjectName}”已创建。`);
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
        showToast(
          'success',
          `项目“${deletingProject.title || '未命名项目'}”已删除。`,
        );
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return '刚刚';

    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
                创作工作流入口
              </div>
              <h2 className="mt-5 text-3xl font-semibold leading-tight text-white">
                从项目开始，逐步进入添梯的工作流创作体系。
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                {BRAND_WELCOME_SUBTITLE}
              </p>
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
                  onClick={() => latestProject && onSelectProject(latestProject.id)}
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
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">项目总数</div>
                <div className="mt-3 text-3xl font-semibold text-white">{projects.length}</div>
                <div className="mt-2 text-sm text-slate-400">工作流、资产与画布都从这里进入。</div>
              </div>
              <div className="tianti-stat-card px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">最近更新</div>
                <div className="mt-3 truncate text-lg font-semibold text-white">
                  {latestProject?.title || '暂无项目'}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {latestProject ? formatDate(latestProject.updated_at) : '创建项目后会显示在这里。'}
                </div>
              </div>
              <div className="tianti-stat-card px-5 py-5">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">建议路径</div>
                <div className="mt-3 text-lg font-semibold text-white">项目 → 工作流 → 画布</div>
                <div className="mt-2 text-sm text-slate-400">
                  先进入工作流中心，再按需投放到高级画布执行。
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
                按更新时间排序，共 {projects.length} 个项目
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="tianti-surface flex min-h-[360px] flex-col items-center justify-center rounded-[32px] px-8 py-12 text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-500">
                  <FolderHeart size={40} />
                </div>
                <h4 className="mt-6 text-2xl font-semibold text-white">还没有项目</h4>
                <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
                  先创建一个项目，再从工作流中心进入剧本、资产、分镜和提示词的完整创作路径。
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
                {projects.map((project) => (
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
                            进入后默认先到工作流中心，再按需切换到高级画布。
                          </p>
                        </div>
                        <div className="mt-0.5 text-cyan-200 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                          <ArrowUpRight size={18} />
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                          <Clock size={13} />
                          {formatDate(project.updated_at)}
                        </div>
                        <span className="tianti-chip">可继续创作</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
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
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  命名后即可进入工作流中心，开始配置剧本、资产和画布执行链路。
                </p>
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
                  placeholder="例如：漫剧主线 001 / 角色资产测试"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  disabled={isSubmitting}
                  className="tianti-input w-full px-4 py-3 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="tianti-surface-muted rounded-[24px] px-4 py-4 text-sm leading-7 text-slate-300">
                新项目会自动挂载默认工作流模板，后续可在工作流中心继续补充资产策略和剧集结构。
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
                  {isSubmitting ? '创建中...' : '立即创建'}
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
                  删除后，项目配置、画布节点以及关联的工作流数据会一起移除，且无法撤销。
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
