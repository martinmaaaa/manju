import React from 'react';
import { ChevronRight, Plus } from 'lucide-react';

interface SeriesOverviewHeroProps {
  title: string;
  completedStages: number;
  totalStages: number;
  plannedEpisodeCount: number;
  createdEpisodeCount: number;
  workflowOverview: {
    seriesCompletedStageCount: number;
    seriesStageCount: number;
    plannedEpisodeCount: number;
    createdEpisodeCount: number;
    reusableAssetCount: number;
    autoApplyTemplateCount: number;
    coveredAssetCount: number;
    scriptCompletedEpisodeCount: number;
    assetCompletedEpisodeCount: number;
    storyboardCompletedEpisodeCount: number;
    promptCompletedEpisodeCount: number;
    nextAction: {
      label: string;
      description: string;
    };
  };
  nextActionButtonLabel: string;
  isFocused?: boolean;
  onAddEpisode: () => void;
  onMaterializeSeries: () => void;
  onTriggerNextAction: () => void;
}

export const SeriesOverviewHero: React.FC<SeriesOverviewHeroProps> = ({
  title,
  completedStages,
  totalStages,
  plannedEpisodeCount,
  createdEpisodeCount,
  workflowOverview,
  nextActionButtonLabel,
  isFocused = false,
  onAddEpisode,
  onMaterializeSeries,
  onTriggerNextAction,
}) => (
  <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">系列工作流</div>
          {isFocused && (
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100">
              当前焦点
            </span>
          )}
        </div>
        <h2 className="mt-3 text-3xl font-semibold">{title}</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="tianti-chip">
            阶段进度 {completedStages}/{totalStages}
          </span>
          <span className="tianti-chip">
            规划集数 {plannedEpisodeCount > 0 ? plannedEpisodeCount : '未设'}
          </span>
          <span className="tianti-chip">
            已建单集 {createdEpisodeCount}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAddEpisode}
          className="tianti-button tianti-button-primary px-5 py-3 text-sm font-semibold"
        >
          <Plus size={16} />
          新增单集
        </button>
        <button
          type="button"
          onClick={onMaterializeSeries}
          className="tianti-button tianti-button-secondary px-5 py-3 text-sm"
        >
          打开系列画布
          <ChevronRight size={16} />
        </button>
      </div>
    </div>

    <div className="mt-6 grid gap-4 xl:grid-cols-3">
      <div className="tianti-stat-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">系列设定</div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {workflowOverview.seriesCompletedStageCount}/{workflowOverview.seriesStageCount}
        </div>
        <div className="mt-4 text-xs leading-6 text-slate-400">
          规划 {workflowOverview.plannedEpisodeCount || '未设'} 集 · 已创建 {workflowOverview.createdEpisodeCount} 集
        </div>
      </div>

      <div className="tianti-stat-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">剧本推进</div>
        <div className="mt-3 text-3xl font-semibold text-white">{workflowOverview.scriptCompletedEpisodeCount}</div>
        <div className="mt-4 text-xs leading-6 text-slate-400">
          已完成剧本的单集数 · 当前已创建 {workflowOverview.createdEpisodeCount} 集
        </div>
      </div>

      <div className="tianti-stat-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">分集规划</div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {workflowOverview.createdEpisodeCount}/{workflowOverview.plannedEpisodeCount || 0}
        </div>
        <div className="mt-4 text-xs leading-6 text-slate-400">
          先把集数铺出来，再逐集推进剧本。
        </div>
      </div>
    </div>

    <div className="mt-4 rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-cyan-100/80">下一步</div>
          <div className="mt-3 text-lg font-semibold text-white">{workflowOverview.nextAction.label}</div>
          <div className="mt-2 text-sm leading-7 text-cyan-50/90">{workflowOverview.nextAction.description}</div>
        </div>
        <button
          type="button"
          onClick={onTriggerNextAction}
          className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
        >
          {nextActionButtonLabel}
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  </>
);
