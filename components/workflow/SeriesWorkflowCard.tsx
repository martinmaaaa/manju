import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Clapperboard,
  Film,
  Package2,
  Plus,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type {
  WorkflowAssetBatchTemplate,
  WorkflowAssetBatchTemplateSuggestion,
  WorkflowBindingMode,
  WorkflowInstance,
} from '../../services/workflow/domain/types';
import {
  countCompletedStages,
  getSeriesAssetCoverage,
  getSeriesWorkflowOverview,
} from '../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../services/workflow/registry';
import { AssetCoverageMatrixPanel } from './AssetCoverageMatrixPanel';
import { SeriesEpisodesPanel } from './SeriesEpisodesPanel';

type PreferredBindingMode = Extract<WorkflowBindingMode, 'follow_latest' | 'pinned'>;

const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'series-bible': BookOpen,
  'character-assets': Users,
  'scene-assets': Clapperboard,
  'prop-assets': Package2,
  'episode-plan': Sparkles,
  'episode-script': BookOpen,
  'episode-assets': Users,
  storyboard: Clapperboard,
  prompt: Wand2,
  video: Film,
};

const bindingModeLabels: Record<PreferredBindingMode, string> = {
  follow_latest: '跟随最新',
  pinned: '固定版本',
};

function toPreferredBindingMode(mode?: WorkflowBindingMode): PreferredBindingMode {
  return mode === 'pinned' ? 'pinned' : 'follow_latest';
}

type SeriesAssetCoverageEntry = ReturnType<typeof getSeriesAssetCoverage>[number];

interface SeriesCardProps {
  instance: WorkflowInstance;
  episodes: WorkflowInstance[];
  assetCoverage: SeriesAssetCoverageEntry[];
  assetBatchTemplates: WorkflowAssetBatchTemplate[];
  suggestedAssetBatchTemplates: WorkflowAssetBatchTemplateSuggestion[];
  workflowOverview: NonNullable<ReturnType<typeof getSeriesWorkflowOverview>>;
  onAddEpisode: (seriesInstanceId: string) => void;
  onBulkAddEpisodes: (seriesInstanceId: string, count: number) => void;
  onUpdateSeriesSettings: (
    seriesInstanceId: string,
    patch: {
      plannedEpisodeCount?: number;
      preferredBindingMode?: WorkflowBindingMode;
    },
  ) => void;
  onSelectEpisode: (episodeId: string) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
  onSyncAssetCoverage: (
    assetId: string,
    scopedEpisodeIds: string[],
    desiredEpisodeIds: string[],
    mode: WorkflowBindingMode,
  ) => void;
  onBatchSyncAssetCoverage: (
    assetIds: string[],
    scopedEpisodeIds: string[],
    desiredEpisodeIds: string[],
    mode: WorkflowBindingMode,
  ) => void;
  onSaveSeriesAssetBatchTemplate: (
    name: string,
    assetIds: string[],
    templateId?: string,
    autoApplyToNewEpisodes?: boolean,
  ) => void;
  onSaveSeriesAssetBatchTemplates: (
    templates: Array<{
      id?: string;
      name: string;
      assetIds: string[];
      autoApplyToNewEpisodes?: boolean;
    }>,
  ) => void;
  onDeleteSeriesAssetBatchTemplate: (templateId: string) => void;
  onFocusAssetCenter: () => void;
}

export const SeriesWorkflowCard: React.FC<SeriesCardProps> = ({
  instance,
  episodes,
  assetCoverage,
  assetBatchTemplates,
  suggestedAssetBatchTemplates,
  workflowOverview,
  onAddEpisode,
  onBulkAddEpisodes,
  onUpdateSeriesSettings,
  onSelectEpisode,
  onMaterializeWorkflow,
  onSyncAssetCoverage,
  onBatchSyncAssetCoverage,
  onSaveSeriesAssetBatchTemplate,
  onSaveSeriesAssetBatchTemplates,
  onDeleteSeriesAssetBatchTemplate,
  onFocusAssetCenter,
}) => {
  const completedStages = countCompletedStages(instance);
  const plannedEpisodeCount = instance.metadata?.plannedEpisodeCount ?? 0;
  const remainingEpisodeCount = plannedEpisodeCount > 0
    ? Math.max(plannedEpisodeCount - episodes.length, 0)
    : 0;
  const hasBatchCapacity = plannedEpisodeCount > 0 ? remainingEpisodeCount > 0 : true;
  const preferredBindingMode = toPreferredBindingMode(instance.metadata?.preferredBindingMode);
  const [batchEpisodeInput, setBatchEpisodeInput] = useState(() => String(remainingEpisodeCount > 0 ? Math.min(remainingEpisodeCount, 10) : 5));
  const [plannedEpisodeInput, setPlannedEpisodeInput] = useState(() => String(plannedEpisodeCount || Math.max(episodes.length, 80)));
  const [preferredBindingModeInput, setPreferredBindingModeInput] = useState<PreferredBindingMode>(preferredBindingMode);
  const stageTitleMap = useMemo(() => getWorkflowTemplate(instance.templateId).stages.reduce<Record<string, string>>((accumulator, stage) => {
    accumulator[stage.id] = stage.title;
    return accumulator;
  }, {}), [instance.templateId]);

  useEffect(() => {
    setBatchEpisodeInput(String(remainingEpisodeCount > 0 ? Math.min(remainingEpisodeCount, 10) : 5));
    setPlannedEpisodeInput(String(plannedEpisodeCount || Math.max(episodes.length, 80)));
    setPreferredBindingModeInput(preferredBindingMode);
  }, [episodes.length, plannedEpisodeCount, preferredBindingMode, remainingEpisodeCount]);

  const handleBulkCreate = () => {
    const parsedCount = Number.parseInt(batchEpisodeInput, 10);
    if (Number.isNaN(parsedCount) || parsedCount <= 0) return;

    const safeCount = plannedEpisodeCount > 0
      ? Math.min(parsedCount, remainingEpisodeCount)
      : parsedCount;
    if (safeCount <= 0) return;

    onBulkAddEpisodes(instance.id, safeCount);
  };

  const handleSaveSeriesSettings = () => {
    const parsedPlannedCount = Number.parseInt(plannedEpisodeInput, 10);
    if (Number.isNaN(parsedPlannedCount) || parsedPlannedCount <= 0) return;

    onUpdateSeriesSettings(instance.id, {
      plannedEpisodeCount: Math.max(parsedPlannedCount, episodes.length),
      preferredBindingMode: preferredBindingModeInput,
    });
  };

  const handleNextAction = () => {
    switch (workflowOverview.nextAction.key) {
      case 'create_series_assets':
      case 'organize_asset_templates':
        onFocusAssetCenter();
        return;
      case 'create_episodes':
        onAddEpisode(instance.id);
        return;
      case 'open_episode_script':
      case 'open_episode_assets':
      case 'open_episode_storyboard':
      case 'open_episode_prompt':
      case 'open_episode_video':
        if (workflowOverview.nextAction.episodeId) {
          onSelectEpisode(workflowOverview.nextAction.episodeId);
        }
        return;
      case 'materialize_series':
        onMaterializeWorkflow(instance.id);
        return;
      default:
    }
  };

  const nextActionButtonLabel = (() => {
    switch (workflowOverview.nextAction.key) {
      case 'create_series_assets':
      case 'organize_asset_templates':
        return '去资产中心';
      case 'create_episodes':
        return '新增单集';
      case 'materialize_series':
        return '投放画布';
      default:
        return '打开对应单集';
    }
  })();

  return (
    <section className="tianti-surface rounded-[32px] p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">系列工作流</div>
          <h2 className="mt-3 text-3xl font-semibold">{instance.title}</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
            <span className="tianti-chip">
              阶段进度 {completedStages}/{Object.keys(instance.stageStates).length}
            </span>
            <span className="tianti-chip">
              规划集数 {plannedEpisodeCount}
            </span>
            <span className="tianti-chip">
              已建单集 {episodes.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onAddEpisode(instance.id)}
            className="tianti-button tianti-button-primary px-5 py-3 text-sm font-semibold"
          >
            <Plus size={16} />
            新增单集
          </button>
          <button
            type="button"
            onClick={() => onMaterializeWorkflow(instance.id)}
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
            规划 {workflowOverview.plannedEpisodeCount} 集 · 已创建 {workflowOverview.createdEpisodeCount} 集
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
            onClick={handleNextAction}
            className="tianti-button tianti-button-secondary mt-4 px-4 py-2 text-sm"
          >
            {nextActionButtonLabel}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className="tianti-surface-muted rounded-[28px] p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-white/40">系列默认配置</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <div className="text-sm text-slate-300">规划总集数</div>
              <input
                type="number"
                min={Math.max(1, episodes.length)}
                value={plannedEpisodeInput}
                onChange={(event) => setPlannedEpisodeInput(event.target.value)}
                className="tianti-input mt-2 w-full px-4 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <div className="text-sm text-slate-300">默认绑定策略</div>
              <select
                value={preferredBindingModeInput}
                onChange={(event) => setPreferredBindingModeInput(event.target.value as PreferredBindingMode)}
                className="tianti-input mt-2 w-full px-4 py-2.5 text-sm"
              >
                {Object.entries(bindingModeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-slate-300">
            新建单集会自动预填：标准剧本模板、资产复用模板、标准分镜模板、统一 Prompt 包、视频投放模板。
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveSeriesSettings}
              className="tianti-button tianti-button-primary px-5 py-3 text-sm font-medium"
            >
              保存系列配置
            </button>
            <div className="text-xs text-slate-400">
              当前默认策略：{bindingModeLabels[preferredBindingMode]}
            </div>
          </div>
        </section>

        <section className="tianti-surface-muted rounded-[28px] p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-white/40">批量建集</div>
          <div className="mt-3 text-sm leading-7 text-slate-300">
            支持一次性铺开多个单集；若已设置总集数，也可以一键补齐剩余集数。
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[132px]">
              <div className="text-sm text-slate-300">新增数量</div>
              <input
                type="number"
                min={1}
                max={remainingEpisodeCount > 0 ? remainingEpisodeCount : undefined}
                value={batchEpisodeInput}
                onChange={(event) => setBatchEpisodeInput(event.target.value)}
                disabled={!hasBatchCapacity}
                className="tianti-input mt-2 w-full px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
            <button
              type="button"
              onClick={handleBulkCreate}
              disabled={!hasBatchCapacity}
              className="tianti-button tianti-button-secondary px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={16} />
              批量新增
            </button>
            {remainingEpisodeCount > 0 && (
              <button
                type="button"
                onClick={() => onBulkAddEpisodes(instance.id, remainingEpisodeCount)}
                className="tianti-button tianti-button-ghost px-5 py-3 text-sm"
              >
                一键补齐剩余 {remainingEpisodeCount} 集
              </button>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-400">
            {plannedEpisodeCount > 0
              ? `当前规划 ${plannedEpisodeCount} 集，已创建 ${episodes.length} 集`
              : `已创建 ${episodes.length} 集，可继续批量追加`}
          </div>
        </section>
      </div>

      <AssetCoverageMatrixPanel
        assetCoverage={assetCoverage}
        assetBatchTemplates={assetBatchTemplates}
        suggestedAssetBatchTemplates={suggestedAssetBatchTemplates}
        episodes={episodes}
        plannedEpisodeCount={plannedEpisodeCount}
        defaultBindingMode={preferredBindingMode}
        onSyncAssetCoverage={onSyncAssetCoverage}
        onBatchSyncAssetCoverage={onBatchSyncAssetCoverage}
        onSaveAssetBatchTemplate={onSaveSeriesAssetBatchTemplate}
        onSaveAssetBatchTemplates={onSaveSeriesAssetBatchTemplates}
        onDeleteAssetBatchTemplate={onDeleteSeriesAssetBatchTemplate}
        onSelectEpisode={onSelectEpisode}
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        {Object.entries(instance.stageStates).map(([stageId, stage]) => {
          const Icon = stageIcons[stageId] ?? Sparkles;

          return (
            <div key={stageId} className="tianti-surface-muted rounded-[24px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-2xl bg-white/5 p-3 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="tianti-chip">
                  {stage.status}
                </span>
              </div>
              <div className="mt-4 text-sm font-semibold text-white">{stageTitleMap[stageId] ?? stageId}</div>
            </div>
          );
        })}
      </div>

      <SeriesEpisodesPanel
        episodes={episodes}
        seriesUpdatedAt={instance.updatedAt}
        stageTitleMap={stageTitleMap}
        onSelectEpisode={onSelectEpisode}
        onMaterializeWorkflow={onMaterializeWorkflow}
      />
    </section>
  );
};

