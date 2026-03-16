import React, { useEffect, useMemo, useState } from 'react';
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
import { SeriesBatchOperationsPanel } from './SeriesBatchOperationsPanel';
import { SeriesEpisodesPanel } from './SeriesEpisodesPanel';
import { SeriesOverviewHero } from './SeriesOverviewHero';
import { SeriesStageRail } from './SeriesStageRail';
import { type PreferredBindingMode, toPreferredBindingMode } from './seriesShared';

type SeriesAssetCoverageEntry = ReturnType<typeof getSeriesAssetCoverage>[number];

interface SeriesCardProps {
  instance: WorkflowInstance;
  episodes: WorkflowInstance[];
  assetCoverage: SeriesAssetCoverageEntry[];
  assetBatchTemplates: WorkflowAssetBatchTemplate[];
  suggestedAssetBatchTemplates: WorkflowAssetBatchTemplateSuggestion[];
  workflowOverview: NonNullable<ReturnType<typeof getSeriesWorkflowOverview>>;
  isFocused?: boolean;
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
  isFocused = false,
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
    <section className={`rounded-[32px] p-8 ${
      isFocused
        ? 'tianti-surface border border-cyan-500/20 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
        : 'tianti-surface'
    }`}>
      <SeriesOverviewHero
        title={instance.title}
        completedStages={completedStages}
        totalStages={Object.keys(instance.stageStates).length}
        plannedEpisodeCount={plannedEpisodeCount}
        createdEpisodeCount={episodes.length}
        workflowOverview={workflowOverview}
        nextActionButtonLabel={nextActionButtonLabel}
        isFocused={isFocused}
        onAddEpisode={() => onAddEpisode(instance.id)}
        onMaterializeSeries={() => onMaterializeWorkflow(instance.id)}
        onTriggerNextAction={handleNextAction}
      />

      <SeriesBatchOperationsPanel
        plannedEpisodeCount={plannedEpisodeCount}
        createdEpisodeCount={episodes.length}
        remainingEpisodeCount={remainingEpisodeCount}
        hasBatchCapacity={hasBatchCapacity}
        plannedEpisodeInput={plannedEpisodeInput}
        batchEpisodeInput={batchEpisodeInput}
        savedBindingMode={preferredBindingMode}
        preferredBindingModeInput={preferredBindingModeInput}
        onPlannedEpisodeInputChange={setPlannedEpisodeInput}
        onBatchEpisodeInputChange={setBatchEpisodeInput}
        onPreferredBindingModeInputChange={setPreferredBindingModeInput}
        onSaveSeriesSettings={handleSaveSeriesSettings}
        onBulkCreate={handleBulkCreate}
        onFillRemaining={() => onBulkAddEpisodes(instance.id, remainingEpisodeCount)}
      />

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

      <SeriesStageRail
        stageStates={instance.stageStates}
        stageTitleMap={stageTitleMap}
      />

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

