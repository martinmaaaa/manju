import React, { useMemo } from 'react';
import { ChevronRight, Clapperboard, Film, Layers3, Plus, Sparkles } from 'lucide-react';
import type { WorkflowProjectState } from '../../../services/workflow/domain/types';
import {
  countCompletedStages,
  getEpisodeInstances,
  getSeriesInstances,
  getSeriesWorkflowOverview,
} from '../../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../../services/workflow/registry';

interface WorkflowEpisodesViewProps {
  workflowState: WorkflowProjectState;
  onAddEpisode: (seriesInstanceId: string) => void;
  onBulkAddEpisodes: (seriesInstanceId: string, count: number) => void;
  onOpenEpisodeWorkspace: (episodeId: string) => void | Promise<void>;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

export const WorkflowEpisodesView: React.FC<WorkflowEpisodesViewProps> = ({
  workflowState,
  onAddEpisode,
  onBulkAddEpisodes,
  onOpenEpisodeWorkspace,
  onMaterializeWorkflow,
}) => {
  const seriesInstances = useMemo(() => getSeriesInstances(workflowState), [workflowState]);

  if (seriesInstances.length === 0) {
    return (
      <section className="tianti-surface rounded-[32px] border border-dashed p-10 text-center">
        <div className="max-w-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
            <Layers3 className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-white">先创建系列工作流，再批量生成剧集</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            剧集页承担单集编排和节奏管理，适合把一个漫剧拆成 20、40、80 集去持续推进。
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {seriesInstances.map((seriesInstance) => {
        const overview = getSeriesWorkflowOverview(workflowState, seriesInstance.id);
        const episodes = getEpisodeInstances(workflowState, seriesInstance.id);

        return (
          <section
            key={seriesInstance.id}
            className="tianti-hero-card p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Series Workflow</div>
                <h2 className="mt-3 text-2xl font-semibold text-white">{seriesInstance.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  这里负责管理单集规模、推进节奏，以及把单集工作区投放到高级画布执行。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onAddEpisode(seriesInstance.id)}
                  className="tianti-button tianti-button-secondary px-4 py-2.5 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  新增 1 集
                </button>
                <button
                  type="button"
                  onClick={() => onBulkAddEpisodes(seriesInstance.id, 5)}
                  className="tianti-button tianti-button-primary px-4 py-2.5 text-sm font-semibold"
                >
                  <Clapperboard className="h-4 w-4" />
                  批量新增 5 集
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <OverviewCard label="计划剧集" value={overview?.plannedEpisodeCount ?? seriesInstance.metadata?.plannedEpisodeCount ?? 0} />
              <OverviewCard label="已创建剧集" value={overview?.createdEpisodeCount ?? episodes.length} />
              <OverviewCard label="可复用资产" value={overview?.reusableAssetCount ?? 0} />
              <OverviewCard label="下一步" value={overview?.nextAction.label ?? '继续搭建'} tone="highlight" />
            </div>

            {episodes.length === 0 ? (
              <div className="tianti-surface-muted mt-6 rounded-[24px] border border-dashed p-6 text-sm leading-7 text-slate-400">
                当前系列还没有单集工作流，先创建几集，再逐集进入工作区推进剧本、分镜、提示词和视频生成。
              </div>
            ) : (
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {episodes.map((episode) => {
                  const totalStages = Object.keys(episode.stageStates).length;
                  const completedStages = countCompletedStages(episode);
                  const currentStage = getWorkflowTemplate(episode.templateId).stages.find(
                    stage => stage.id === episode.currentStageId,
                  );

                  return (
                    <article
                      key={episode.id}
                      className="tianti-surface-muted rounded-[24px] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold text-white">{episode.title}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              进度 {completedStages}/{totalStages}
                            </span>
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              当前阶段 {currentStage?.title ?? '待开始'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onMaterializeWorkflow(episode.id)}
                          className="tianti-button tianti-button-ghost px-3 py-2 text-xs text-cyan-50"
                        >
                          <Film className="h-4 w-4" />
                          投放画布
                        </button>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="text-sm text-slate-300">
                          从这里进入单集工作区，继续完成分镜、提示词和视频交付。
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenEpisodeWorkspace(episode.id)}
                          className="tianti-button tianti-button-primary px-4 py-2 text-sm font-semibold"
                        >
                          进入工作区
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-6 rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-50 shadow-[0_16px_40px_rgba(16,185,129,0.12)]">
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4" />
                优化建议
              </div>
              <div className="mt-2 text-emerald-100/90">
                下一步可以继续把剧集页升级成“批量排期 + 批量状态推进 + 批量素材复用”的长剧生产台。
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

const OverviewCard: React.FC<{ label: string; value: number | string; tone?: 'default' | 'highlight' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div
    className={`rounded-[22px] px-4 py-4 ${
      tone === 'highlight'
        ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-50 shadow-[0_16px_40px_rgba(73,200,255,0.12)]'
        : 'tianti-stat-card text-white'
    }`}
  >
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-2xl font-semibold">{value}</div>
  </div>
);
