import React, { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, ProjectSummary } from '../services/api';
import { FolderHeart, Plus, Trash2, Clock, Loader2, Play, Settings, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { BRAND_LOGO_ALT, BRAND_TAGLINE, BRAND_WORKSPACE_NAME } from '../src/branding';
import { DEFAULT_PROJECT_SETTINGS } from '../services/workflowTemplates';

interface ProjectsDashboardProps {
    onSelectProject: (projectId: string) => void;
    onOpenSettings?: () => void;
}

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({ onSelectProject, onOpenSettings }) => {
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [toast, setToast] = useState<{
        id: number;
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({
            id: Date.now(),
            type,
            message,
        });
    };

    useEffect(() => {
        if (!toast) return;

        const timer = setTimeout(() => {
            setToast((current) => (current?.id === toast.id ? null : current));
        }, 3000);

        return () => clearTimeout(timer);
    }, [toast]);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const res = await getProjects();
            if (res.success && res.data) {
                setProjects(res.data);
            }
        } catch (e) {
            console.error('Failed to load projects', e);
            showToast('error', '加载项目列表失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            if (isCreating && !isSubmitting) {
                setIsCreating(false);
            }

            if (projectToDelete && deletingProjectId !== projectToDelete.id) {
                setProjectToDelete(null);
            }
        };

        if (!isCreating && !projectToDelete) return;

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deletingProjectId, isCreating, isSubmitting, projectToDelete]);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedProjectName = newProjectName.trim();
        if (!trimmedProjectName || isSubmitting) return;

        try {
            setIsSubmitting(true);
            console.log("正在创建项目:", trimmedProjectName);
            const res = await createProject(trimmedProjectName, DEFAULT_PROJECT_SETTINGS);
            console.log("创建项目结果:", res);
            if (res.success && res.data) {
                setProjects((currentProjects) => [res.data!, ...currentProjects]);
                setNewProjectName('');
                setIsCreating(false);
                showToast('success', `项目“${res.data.title || trimmedProjectName}”已创建`);
            } else {
                console.error('创建项目失败:', res);
                showToast('error', `创建项目失败：${res.error || '未知错误'}`);
            }
        } catch (e: any) {
            console.error('Failed to create project exception:', e);
            showToast('error', `创建项目发生异常：${e.message || '请重试'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRequestDeleteProject = (e: React.MouseEvent, project: ProjectSummary) => {
        e.stopPropagation();
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
            const res = await deleteProject(deletingProject.id);
            if (res.success) {
                setProjects((currentProjects) => currentProjects.filter((project) => project.id !== deletingProject.id));
                setProjectToDelete(null);
                showToast('success', `项目“${deletingProject.title || '未命名项目'}”已删除`);
            } else {
                showToast('error', `删除项目失败：${res.error || '请重试'}`);
            }
        } catch (e) {
            console.error('Failed to delete project', e);
            showToast('error', '删除项目失败，请重试');
        } finally {
            setDeletingProjectId(null);
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '刚刚';
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0c] text-white">
                <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                <p className="text-slate-400">正在加载项目列表...</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-[#0a0a0c] text-white overflow-hidden">
            <div className="fixed top-6 right-6 z-[70] pointer-events-none">
                {toast && (
                    <div
                        className={`pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[360px] px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-2 fade-in duration-200 ${
                            toast.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-50'
                                : 'bg-red-500/10 border-red-400/30 text-red-50'
                        }`}
                    >
                        <div className={`mt-0.5 ${toast.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        </div>
                        <div className="flex-1 text-sm leading-6">{toast.message}</div>
                        <button
                            type="button"
                            onClick={() => setToast(null)}
                            className="text-white/50 hover:text-white transition-colors"
                            aria-label="关闭提示"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* 顶部导航区 */}
            <div className="flex-none p-8 flex justify-between items-center border-b border-white/5 bg-white/5 backdrop-blur-md z-10">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt={BRAND_LOGO_ALT} className="h-12 object-contain" />
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                            {BRAND_WORKSPACE_NAME}
                        </h1>
                        <p className="mt-1 text-xs text-slate-400">{BRAND_TAGLINE}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onOpenSettings?.()}
                        className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-full font-bold transition-all hover:scale-105"
                        title="系统设置"
                    >
                        <Settings size={18} />
                        系统设置
                    </button>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-full font-bold transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105"
                    >
                        <Plus size={20} />
                        新建项目
                    </button>
                </div>
            </div>

            {/* 创建项目的弹窗 */}
            {isCreating && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => {
                        if (isSubmitting) return;
                        setIsCreating(false);
                    }}
                >
                    <div
                        className="bg-[#1c1c1e] p-8 rounded-3xl border border-white/10 shadow-2xl w-96 max-w-[90vw] animate-in zoom-in-95 duration-200"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-xl font-bold mb-6 text-white">创建新项目</h2>
                        <form onSubmit={handleCreateProject}>
                            <input
                                type="text"
                                autoFocus
                                placeholder="输入项目名称..."
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                disabled={isSubmitting}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-white placeholder-slate-500"
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isSubmitting) return;
                                        setIsCreating(false);
                                    }}
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 disabled:text-slate-500 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newProjectName.trim() || isSubmitting}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-900 rounded-xl font-bold transition-all"
                                >
                                    {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                                    {isSubmitting ? '创建中...' : '创建'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {projectToDelete && (
                <div
                    className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={closeDeleteDialog}
                >
                    <div
                        className="bg-[#1c1c1e] p-8 rounded-3xl border border-white/10 shadow-2xl w-[420px] max-w-[92vw] animate-in zoom-in-95 duration-200"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-white">删除项目？</h2>
                                <p className="mt-2 text-sm text-slate-400 leading-6">
                                    删除后，项目配置、画布节点和关联数据都会一起移除，此操作无法撤销。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeDeleteDialog}
                                disabled={deletingProjectId === projectToDelete.id}
                                className="text-slate-500 hover:text-white disabled:text-slate-700 transition-colors"
                                aria-label="关闭删除确认"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="rounded-2xl border border-red-400/10 bg-red-500/5 px-4 py-4 mb-6">
                            <div className="text-xs uppercase tracking-[0.2em] text-red-300/80 mb-2">待删除项目</div>
                            <div className="text-base font-semibold text-white break-all">
                                {projectToDelete.title || '未命名项目'}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeDeleteDialog}
                                disabled={deletingProjectId === projectToDelete.id}
                                className="px-5 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 disabled:text-slate-500 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteProject}
                                disabled={deletingProjectId === projectToDelete.id}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-400 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-bold transition-all"
                            >
                                {deletingProjectId === projectToDelete.id && <Loader2 size={16} className="animate-spin" />}
                                {deletingProjectId === projectToDelete.id ? '删除中...' : '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 主内容区（网格列表） */}
            <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                {projects.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                        <div className="w-32 h-32 mb-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                            <FolderHeart size={48} className="text-slate-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-4">没有找到项目</h3>
                        <p className="text-slate-400 mb-8 leading-relaxed">
                            在这个工作区里你还没有创建任何项目视频项目。点击下方按钮开始创作吧。
                        </p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl text-white font-bold transition-all"
                        >
                            <Plus size={20} />
                            创建第一个项目
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-6">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                onClick={() => onSelectProject(project.id)}
                                className="group relative bg-[#1c1c1e] rounded-2xl border border-white/5 overflow-hidden cursor-pointer hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/10 transition-all duration-300 animate-in fade-in zoom-in-95"
                            >
                                {/* 封面区（模拟文件夹外观） */}
                                <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 border-b border-white/5 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] animate-[shimmer_5s_infinite]" />
                                    <FolderHeart size={48} className="text-slate-600 group-hover:scale-110 group-hover:text-cyan-500 transition-all duration-500" />

                                    {/* Hover 悬浮播放按钮 */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-cyan-500 text-slate-900 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-all duration-300 shadow-xl shadow-cyan-500/30">
                                            <Play size={24} className="ml-1" />
                                        </div>
                                    </div>
                                </div>

                                {/* 信息区 */}
                                <div className="p-5">
                                    <h3 className="text-lg font-bold text-white mb-2 truncate group-hover:text-cyan-400 transition-colors">
                                        {project.title || '未命名项目'}
                                    </h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                            <Clock size={12} />
                                            {formatDate(project.updated_at)}
                                        </div>

                                        <button
                                            onClick={(e) => handleRequestDeleteProject(e, project)}
                                            disabled={deletingProjectId === project.id}
                                            className="p-2 -mr-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 disabled:text-slate-600 disabled:hover:bg-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            title="删除项目"
                                        >
                                            {deletingProjectId === project.id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={16} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
