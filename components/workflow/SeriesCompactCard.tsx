import React from 'react';
import { ChevronRight, Clock3 } from 'lucide-react';
import type { WorkflowInstance, WorkflowSeriesOverview } from '../../services/workflow/domain/types';

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SeriesCompactCardProps {
  instance: WorkflowInstance;
  workflowOverview: WorkflowSeriesOverview;
  onFocus: () => void;
  onRunNextAction: () => void;
}

export const SeriesCompactCard: React.FC<SeriesCompactCardProps> = ({
  instance,
  workflowOverview,
  onFocus,
  onRunNextAction,
}) => {
  const stageProgress = workflowOverview.seriesStageCount > 0
    ? Math.round((workflowOverview.seriesCompletedStageCount / workflowOverview.seriesStageCount) * 100)
    : 0;
  const episodePlan = workflowOverview.plannedEpisodeCount > 0
    ? workflowOverview.plannedEpisodeCount
    : workflowOverview.createdEpisodeCount;
  const episodeProgress = episodePlan > 0
    ? Math.round((workflowOverview.createdEpisodeCount / episodePlan) * 100)
    : 0;

  return (
    <article className="tianti-surface rounded-[24px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-white">{instance.title}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <Clock3 className="h-3.5 w-3.5 text-cyan-200" />
            最近更新 {formatUpdatedAt(instance.updatedAt)}
          </div>
        </div>
        <span className="tianti-chip is-accent">
          阶段 {workflowOverview.seriesCompletedStageCount}/{workflowOverview.seriesStageCount}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-white/40">剧集铺开</div>
          <div className="mt-2 text-sm text-white">
            {workflowOverview.createdEpisodeCount}/{episodePlan || 0}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400"
              style={{ width: `${Math.max(episodeProgress, workflowOverview.createdEpisodeCount > 0 ? 8 : 0)}%` }}
            />
          </div>
        </div>

        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-white/40">资产复用</div>
          <div className="mt-2 text-sm text-white">
            复用 {workflowOverview.reusableAssetCount} · 缺口 {workflowOverview.uncoveredAssetCount}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400"
              style={{ width: `${Math.max(stageProgress, workflowOverview.reusableAssetCount > 0 ? 8 : 0)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[18px] border border-cyan-500/15 bg-cyan-500/5 px-4 py-3">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">推荐动作</div>
        <div className="mt-2 text-sm font-medium text-white">{workflowOverview.nextAction.label}</div>
        <div className="mt-1 text-xs leading-6 text-slate-300">{workflowOverview.nextAction.description}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onFocus}
          className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
        >
          展开详情
        </button>
        <button
          type="button"
          onClick={onRunNextAction}
          className="tianti-button tianti-button-primary px-4 py-2 text-sm"
        >
          推进下一步
          <ChevronRight size={15} />
        </button>
      </div>
    </article>
  );
};
