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
          进入原始画布
          <ChevronRight size={16} />
        </button>
      </div>
    </div>

    <div className="mt-6 grid gap-4 xl:grid-cols-4">
      <div className="tianti-stat-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">系列总控</div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {workflowOverview.seriesCompletedStageCount}/{workflowOverview.seriesStageCount}
        </div>
        <div className="mt-2 text-sm text-slate-300">系列阶段已完成</div>
        <div className="mt-4 text-xs leading-6 text-slate-400">
          规划 {workflowOverview.plannedEpisodeCount || '未设'} 集 · 已创建 {workflowOverview.createdEpisodeCount} 集
        </div>
      </div>

      <div className="tianti-stat-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">资产复用</div>
        <div className="mt-3 text-3xl font-semibold text-white">{workflowOverview.reusableAssetCount}</div>
        <div className="mt-2 text-sm text-slate-300">已纳入模板的复用资产</div>
        <div className="mt-4 text-xs leading-6 text-slate-400">
          自动预铺模板 {workflowOverview.autoApplyTemplateCount} 个 · 已覆盖资产 {workflowOverview.coveredAssetCount} 个
        </div>
      </div>

      <div className="tianti-stat-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">单集执行</div>
        <div className="mt-3 text-3xl font-semibold text-white">{workflowOverview.createdEpisodeCount}</div>
        <div className="mt-2 text-sm text-slate-300">已创建的单集工作单元</div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
          <span>剧本 {workflowOverview.scriptCompletedEpisodeCount}</span>
          <span>资产 {workflowOverview.assetCompletedEpisodeCount}</span>
          <span>分镜 {workflowOverview.storyboardCompletedEpisodeCount}</span>
          <span>提示词 {workflowOverview.promptCompletedEpisodeCount}</span>
        </div>
      </div>

      <div className="tianti-hero-card rounded-[24px] p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-cyan-100/80">下一步</div>
        <div className="mt-3 text-lg font-semibold text-white">{workflowOverview.nextAction.label}</div>
        <div className="mt-2 text-sm leading-6 text-cyan-50/90">{workflowOverview.nextAction.description}</div>
        <button
          type="button"
          onClick={onTriggerNextAction}
          className="tianti-button tianti-button-secondary mt-4 px-4 py-2 text-sm"
        >
          {nextActionButtonLabel}
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  </>
);
