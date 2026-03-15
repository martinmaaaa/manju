import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clapperboard,
  Film,
  FolderHeart,
  Layers3,
  Package2,
  Plus,
  Settings,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type { WorkflowInstance, WorkflowProjectState, WorkflowTemplateDefinition, WorkflowTemplateId } from '../../services/workflow/domain/types';
import { countCompletedStages, getEpisodeInstances, getSeriesInstances } from '../../services/workflow/runtime/projectState';

interface WorkflowCenterProps {
  projectTitle: string;
  workflowState: WorkflowProjectState;
  templates: WorkflowTemplateDefinition[];
  onBackToProjects: () => void;
  onOpenCanvas: () => void;
  onOpenSettings: () => void;
  onCreateWorkflow: (templateId: WorkflowTemplateId) => void;
  onAddEpisode: (seriesInstanceId: string) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

const templateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'manju-series': Layers3,
  'manju-episode': Clapperboard,
  'manju-commentary': Film,
  'character-assets': Users,
};

const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'series-bible': BookOpen,
  'character-assets': Users,
  'scene-assets': Clapperboard,
  'prop-assets': Package2,
  'episode-plan': Sparkles,
  'episode-script': BookOpen,
  'episode-assets': FolderHeart,
  storyboard: Clapperboard,
  prompt: Wand2,
  video: Film,
};

function formatAssetSummary(instance: WorkflowInstance): string {
  const summary = instance.metadata?.assetSummary;
  if (!summary) return '人物 0 · 场景 0 · 道具 0';

  return `人物 ${summary.character ?? 0} · 场景 ${summary.scene ?? 0} · 道具 ${summary.prop ?? 0}`;
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const WorkflowCenter: React.FC<WorkflowCenterProps> = ({
  projectTitle,
  workflowState,
  templates,
  onBackToProjects,
  onOpenCanvas,
  onOpenSettings,
  onCreateWorkflow,
  onAddEpisode,
  onMaterializeWorkflow,
}) => {
  const seriesInstances = getSeriesInstances(workflowState);

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a0a0c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.12),_transparent_30%)] pointer-events-none" />
      <div className="relative flex h-full flex-col overflow-hidden">
        <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0c]/85 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBackToProjects}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                <ArrowLeft size={16} />
                返回项目
              </button>
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Workflow Center</div>
                <h1 className="mt-1 text-2xl font-semibold text-white">{projectTitle || '未命名项目'}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                <Settings size={16} />
                系统设置
              </button>
              <button
                type="button"
                onClick={onOpenCanvas}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-5 py-2.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/20"
              >
                进入原始画布
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[320px_minmax(0,1fr)] gap-8 overflow-hidden px-8 py-8">
          <aside className="flex h-full flex-col gap-6 overflow-y-auto pr-2">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">产品定位</div>
              <h2 className="mt-3 text-2xl font-semibold">工作流优先的创作中心</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                先选整套工作流，再进入单集或高级画布。节点依旧保留，但退到工作流内部执行层。
              </p>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.22em] text-white/45">工作流模板</div>
              <div className="mt-4 space-y-3">
                {templates
                  .filter(template => template.id !== 'manju-episode')
                  .map((template) => {
                    const Icon = templateIcons[template.id] ?? Layers3;

                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => onCreateWorkflow(template.id)}
                        className="w-full rounded-[22px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-cyan-500/40 hover:bg-white/[0.05]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-200">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{template.name}</div>
                            <div className="mt-1 text-xs leading-5 text-slate-400">{template.summary}</div>
                          </div>
                        </div>
                        <div className="mt-3 text-[11px] leading-5 text-white/45">{template.recommendedFor}</div>
                      </button>
                    );
                  })}
              </div>
            </section>
          </aside>

          <main className="flex h-full flex-col gap-6 overflow-y-auto pr-2">
            {seriesInstances.length === 0 ? (
              <section className="flex min-h-[320px] items-center justify-center rounded-[32px] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
                    <Layers3 className="h-8 w-8" />
                  </div>
                  <h2 className="mt-6 text-2xl font-semibold">先创建一个系列工作流</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    系列工作流会承接人物、场景、道具等可复用资产，再逐步生成单集工作流并投放到画布执行。
                  </p>
                </div>
              </section>
            ) : (
              seriesInstances.map((seriesInstance) => (
                <SeriesCard
                  key={seriesInstance.id}
                  instance={seriesInstance}
                  episodes={getEpisodeInstances(workflowState, seriesInstance.id)}
                  onAddEpisode={onAddEpisode}
                  onMaterializeWorkflow={onMaterializeWorkflow}
                />
              ))
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

interface SeriesCardProps {
  instance: WorkflowInstance;
  episodes: WorkflowInstance[];
  onAddEpisode: (seriesInstanceId: string) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

const SeriesCard: React.FC<SeriesCardProps> = ({
  instance,
  episodes,
  onAddEpisode,
  onMaterializeWorkflow,
}) => {
  const completedStages = countCompletedStages(instance);

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">系列工作流</div>
          <h2 className="mt-3 text-3xl font-semibold">{instance.title}</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              阶段进度 {completedStages}/{Object.keys(instance.stageStates).length}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              规划集数 {instance.metadata?.plannedEpisodeCount ?? 0}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              已建单集 {episodes.length}
            </span>
          </div>
          <div className="mt-4 text-sm leading-7 text-slate-300">{formatAssetSummary(instance)}</div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onAddEpisode(instance.id)}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            <Plus size={16} />
            新增单集
          </button>
          <button
            type="button"
            onClick={() => onMaterializeWorkflow(instance.id)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:border-white/20 hover:text-white"
          >
            进入原始画布
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        {Object.values(instance.stageStates).map((stage) => {
          const Icon = stageIcons[stage.stageId] ?? Sparkles;

          return (
            <div key={stage.stageId} className="rounded-[24px] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-2xl bg-white/5 p-3 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] tracking-[0.16em] text-slate-300">
                  {stage.status}
                </span>
              </div>
              <div className="mt-4 text-sm font-semibold text-white">{stage.stageId}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">分集工作区</div>
            <div className="mt-2 text-sm text-slate-300">
              当前已创建 {episodes.length} 集。单集工作流默认先看阶段，再决定是否进入节点画布。
            </div>
          </div>
          <div className="text-xs text-white/40">最近更新 {formatUpdatedAt(instance.updatedAt)}</div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {episodes.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm leading-7 text-slate-400">
              还没有单集工作流，先点击“新增单集”，再把具体单集投放到画布执行。
            </div>
          ) : (
            episodes.map((episode) => (
              <article key={episode.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{episode.title}</div>
                    <div className="mt-1 text-xs text-white/40">
                      阶段 {countCompletedStages(episode)}/{Object.keys(episode.stageStates).length}
                    </div>
                  </div>
                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-200">
                    Episode {episode.metadata?.episodeNumber ?? '--'}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.values(episode.stageStates).map((stage) => (
                    <span key={stage.stageId} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-300">
                      {stage.stageId}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onMaterializeWorkflow(episode.id)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/20"
                >
                  整套投放到画布
                  <ChevronRight size={15} />
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
