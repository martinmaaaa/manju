import React, { useState, useEffect } from 'react';
import { getProjects, createProject, deleteProject, ProjectSummary } from '../services/api';
import { useLanguage } from '../src/i18n/LanguageContext';
import { FolderHeart, Plus, Trash2, Clock, Loader2, Play, Settings } from 'lucide-react';

interface ProjectsDashboardProps {
    onSelectProject: (projectId: string) => void;
    onOpenSettings?: () => void;
}

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({ onSelectProject, onOpenSettings }) => {
    const { t } = useLanguage();
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');

    const loadProjects = async () => {
        setLoading(true);
        try {
            const res = await getProjects();
            if (res.success && res.data) {
                setProjects(res.data);
            }
        } catch (e) {
            console.error('Failed to load projects', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        try {
            console.log("正在创建项目:", newProjectName.trim());
            const res = await createProject(newProjectName.trim());
            console.log("创建项目结果:", res);
            if (res.success && res.data) {
                setProjects([res.data, ...projects]);
                setNewProjectName('');
                setIsCreating(false);
            } else {
                console.error('创建项目失败:', res);
                alert(`创建项目失败: ${res.error || '未知错误'}`);
            }
        } catch (e: any) {
            console.error('Failed to create project exception:', e);
            alert(`创建项目发生异常: ${e.message || '请重试'}`);
        }
    };

    const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('确定要删除这个项目吗？相关的画布数据也将被一并删除。')) return;

        try {
            const res = await deleteProject(id);
            if (res.success) {
                setProjects(projects.filter(p => p.id !== id));
            }
        } catch (e) {
            console.error('Failed to delete project', e);
            alert('删除项目失败，请重试');
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
            {/* 顶部导航区 */}
            <div className="flex-none p-8 flex justify-between items-center border-b border-white/5 bg-white/5 backdrop-blur-md z-10">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="AIYOU Logo" className="h-12 object-contain" />
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                        我的项目
                    </h1>
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
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#1c1c1e] p-8 rounded-3xl border border-white/10 shadow-2xl w-96 max-w-[90vw] animate-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-bold mb-6 text-white">创建新项目</h2>
                        <form onSubmit={handleCreateProject}>
                            <input
                                type="text"
                                autoFocus
                                placeholder="输入项目名称..."
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-white placeholder-slate-500"
                            />
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="px-5 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newProjectName.trim()}
                                    className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-900 rounded-xl font-bold transition-all"
                                >
                                    创建
                                </button>
                            </div>
                        </form>
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
                                            onClick={(e) => handleDeleteProject(e, project.id)}
                                            className="p-2 -mr-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            title="删除项目"
                                        >
                                            <Trash2 size={16} />
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
