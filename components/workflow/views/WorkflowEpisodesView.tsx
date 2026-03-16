import React, { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  ChevronRight,
  Clapperboard,
  Film,
  Layers3,
  Package2,
  Plus,
  Radar,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wand2,
} from 'lucide-react';
import type {
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowProjectState,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';
import {
  countCompletedStages,
  getEpisodeInstances,
  getSeriesInstances,
  getSeriesWorkflowOverview,
} from '../../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../../services/workflow/registry';
import {
  stageStatusClassNames,
  stageStatusLabels,
  stageStatusOptions,
} from '../panels/episodeWorkspaceShared';
import { SeriesBatchOperationsPanel } from '../SeriesBatchOperationsPanel';
import { bindingModeLabels, type PreferredBindingMode, toPreferredBindingMode } from '../seriesShared';

interface WorkflowEpisodesViewProps {
  workflowState: WorkflowProjectState;
  onAddEpisode: (seriesInstanceId: string) => void;
  onBulkAddEpisodes: (seriesInstanceId: string, count: number) => void;
  onOpenEpisodeWorkspace: (episodeId: string) => void | Promise<void>;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
  onFocusSeries: (seriesInstanceId: string) => void | Promise<void>;
  onUpdateSeriesSettings: (
    seriesInstanceId: string,
    patch: {
      plannedEpisodeCount?: number;
      preferredBindingMode?: WorkflowBindingMode;
    },
  ) => void | Promise<void>;
  onBatchUpdateStages: (
    workflowInstanceIds: string[],
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => void | Promise<void>;
}

type SeriesOverview = NonNullable<ReturnType<typeof getSeriesWorkflowOverview>>;
type SeriesFilterMode = 'all' | 'focused' | 'needs_assets' | 'needs_episodes' | 'needs_video';
type SeriesSortMode = 'focused' | 'recent' | 'stage_progress' | 'episode_backlog' | 'delivery_backlog';
type EpisodeProgressFilter = 'all' | 'incomplete' | 'completed' | 'has_outputs' | 'blocked';
type EpisodeSortMode = 'episode_number' | 'needs_attention' | 'recent' | 'outputs';
type BatchScopeMode = 'filtered' | 'pending' | 'all';
type StageMetricKey =
  | 'scriptCompletedEpisodeCount'
  | 'assetCompletedEpisodeCount'
  | 'storyboardCompletedEpisodeCount'
  | 'promptCompletedEpisodeCount'
  | 'videoCompletedEpisodeCount';

const seriesStageMeta: Array<{
  key: StageMetricKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'scriptCompletedEpisodeCount', label: '剧本', icon: BookOpen },
  { key: 'assetCompletedEpisodeCount', label: '资产', icon: Package2 },
  { key: 'storyboardCompletedEpisodeCount', label: '分镜', icon: Clapperboard },
  { key: 'promptCompletedEpisodeCount', label: '提示词', icon: Wand2 },
  { key: 'videoCompletedEpisodeCount', label: '视频', icon: Film },
];

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}

function countOutputStages(episode: WorkflowInstance): number {
  return Object.values(episode.stageStates).filter((stage) => (
    Object.keys(stage.outputs).length > 0
    || stage.artifactIds.length > 0
    || Boolean(stage.error)
    || Boolean(stage.completedAt)
  )).length;
}

function getCurrentStageTitle(episode: WorkflowInstance): string {
  const template = getWorkflowTemplate(episode.templateId);
  return template.stages.find((stage) => stage.id === episode.currentStageId)?.title ?? '待开始';
}

function getStageProgressRatio(episode: WorkflowInstance): number {
  const totalStages = Object.keys(episode.stageStates).length;
  if (totalStages === 0) return 0;
  return countCompletedStages(episode) / totalStages;
}

export const WorkflowEpisodesView: React.FC<WorkflowEpisodesViewProps> = ({
  workflowState,
  onAddEpisode,
  onBulkAddEpisodes,
  onOpenEpisodeWorkspace,
  onMaterializeWorkflow,
  onFocusSeries,
  onUpdateSeriesSettings,
  onBatchUpdateStages,
}) => {
  const [seriesQuery, setSeriesQuery] = useState('');
  const [seriesFilterMode, setSeriesFilterMode] = useState<SeriesFilterMode>('all');
  const [seriesSortMode, setSeriesSortMode] = useState<SeriesSortMode>('focused');
  const seriesInstances = useMemo(() => getSeriesInstances(workflowState), [workflowState]);
  const seriesSnapshots = useMemo(() => (
    [...seriesInstances]
      .map((seriesInstance) => {
        const overview = getSeriesWorkflowOverview(workflowState, seriesInstance.id);
        if (!overview) return null;

        return {
          instance: seriesInstance,
          overview,
          episodes: getEpisodeInstances(workflowState, seriesInstance.id)
            .sort((left, right) => (left.metadata?.episodeNumber ?? 0) - (right.metadata?.episodeNumber ?? 0)),
        };
      })
      .filter(Boolean) as Array<{
      instance: WorkflowInstance;
      overview: SeriesOverview;
      episodes: WorkflowInstance[];
    }>
  ), [seriesInstances, workflowState]);
  const filteredSeriesSnapshots = useMemo(() => {
    const normalizedQuery = seriesQuery.trim().toLowerCase();

    const filtered = seriesSnapshots.filter((snapshot) => {
      const matchesQuery = normalizedQuery.length === 0
        || snapshot.instance.title.toLowerCase().includes(normalizedQuery);
      if (!matchesQuery) return false;

      switch (seriesFilterMode) {
        case 'focused':
          return snapshot.instance.id === workflowState.activeSeriesId;
        case 'needs_assets':
          return snapshot.overview.uncoveredAssetCount > 0;
        case 'needs_episodes':
          return snapshot.overview.plannedEpisodeCount > snapshot.overview.createdEpisodeCount;
        case 'needs_video':
          return snapshot.overview.videoCompletedEpisodeCount < snapshot.overview.createdEpisodeCount;
        default:
          return true;
      }
    });

    return filtered.sort((left, right) => {
      if (seriesSortMode === 'focused') {
        if (left.instance.id === workflowState.activeSeriesId) return -1;
        if (right.instance.id === workflowState.activeSeriesId) return 1;
        return new Date(right.instance.updatedAt).getTime() - new Date(left.instance.updatedAt).getTime();
      }

      if (seriesSortMode === 'recent') {
        return new Date(right.instance.updatedAt).getTime() - new Date(left.instance.updatedAt).getTime();
      }

      if (seriesSortMode === 'stage_progress') {
        const leftRate = toPercent(left.overview.seriesCompletedStageCount, left.overview.seriesStageCount);
        const rightRate = toPercent(right.overview.seriesCompletedStageCount, right.overview.seriesStageCount);
        return leftRate - rightRate;
      }

      if (seriesSortMode === 'episode_backlog') {
        const leftGap = Math.max(left.overview.plannedEpisodeCount - left.overview.createdEpisodeCount, 0);
        const rightGap = Math.max(right.overview.plannedEpisodeCount - right.overview.createdEpisodeCount, 0);
        if (leftGap !== rightGap) return rightGap - leftGap;
        return new Date(right.instance.updatedAt).getTime() - new Date(left.instance.updatedAt).getTime();
      }

      const leftDeliveryGap = Math.max(left.overview.createdEpisodeCount - left.overview.videoCompletedEpisodeCount, 0);
      const rightDeliveryGap = Math.max(right.overview.createdEpisodeCount - right.overview.videoCompletedEpisodeCount, 0);
      if (leftDeliveryGap !== rightDeliveryGap) return rightDeliveryGap - leftDeliveryGap;
      return new Date(right.instance.updatedAt).getTime() - new Date(left.instance.updatedAt).getTime();
    });
  }, [seriesFilterMode, seriesQuery, seriesSnapshots, seriesSortMode, workflowState.activeSeriesId]);

  const totalPlannedEpisodeCount = useMemo(() => (
    filteredSeriesSnapshots.reduce((sum, snapshot) => sum + snapshot.overview.plannedEpisodeCount, 0)
  ), [filteredSeriesSnapshots]);
  const totalCreatedEpisodeCount = useMemo(() => (
    filteredSeriesSnapshots.reduce((sum, snapshot) => sum + snapshot.overview.createdEpisodeCount, 0)
  ), [filteredSeriesSnapshots]);
  const totalVideoCompleted = useMemo(() => (
    filteredSeriesSnapshots.reduce((sum, snapshot) => sum + snapshot.overview.videoCompletedEpisodeCount, 0)
  ), [filteredSeriesSnapshots]);
  const focusSeries = filteredSeriesSnapshots.find((snapshot) => snapshot.instance.id === workflowState.activeSeriesId)
    ?? filteredSeriesSnapshots[0]
    ?? null;
  const activeEpisode = workflowState.activeEpisodeId
    ? workflowState.instances.find((instance) => instance.id === workflowState.activeEpisodeId) ?? null
    : null;

  if (seriesSnapshots.length === 0) {
    return (
      <section className="tianti-surface rounded-[32px] border border-dashed p-10 text-center">
        <div className="max-w-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
            <Layers3 className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-white">先创建系列工作流，再开始批量铺排剧集</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            剧集页现在承担的是“批量生产控制台”的角色：规划集数、按批次扩单集、看分阶段漏斗，再把单集工作区持续往下压。
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="tianti-hero-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Episode Control Desk</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">剧集批量操作台</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              这里不再是简单的剧集列表，而是整部漫剧的批量编排面板：先把集数与节奏定住，再用统一模板持续向下铺开单集生产。
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="tianti-chip is-accent">系列 {filteredSeriesSnapshots.length}</span>
            <span className="tianti-chip">
              剧集 {totalCreatedEpisodeCount}{totalPlannedEpisodeCount > 0 ? ` / ${totalPlannedEpisodeCount}` : ''}
            </span>
            <span className="tianti-chip">视频完成 {totalVideoCompleted}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <EpisodesSummaryCard label="当前焦点" value={focusSeries?.instance.title ?? '未锁定'} hint={focusSeries?.overview.nextAction.label ?? '等待系列创建'} highlight />
          <EpisodesSummaryCard label="铺排进度" value={String(totalCreatedEpisodeCount)} hint={totalPlannedEpisodeCount > 0 ? `总规划 ${totalPlannedEpisodeCount} 集` : '总规划未设上限'} />
          <EpisodesSummaryCard label="交付进度" value={`${totalVideoCompleted}`} hint={`视频完成率 ${toPercent(totalVideoCompleted, totalCreatedEpisodeCount)}%`} />
          <EpisodesSummaryCard label="当前单集" value={activeEpisode?.title ?? '未锁定'} hint={activeEpisode ? `当前阶段 ${getCurrentStageTitle(activeEpisode)}` : '可从下方任意剧集进入工作区'} />
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_180px_180px]">
          <label className="block">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40"><Search className="h-4 w-4" />系列搜索</div>
            <input value={seriesQuery} onChange={(event) => setSeriesQuery(event.target.value)} placeholder="搜索系列名称" className="tianti-input w-full px-4 py-2.5 text-sm" />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40"><SlidersHorizontal className="h-4 w-4" />系列筛选</div>
            <select value={seriesFilterMode} onChange={(event) => setSeriesFilterMode(event.target.value as SeriesFilterMode)} className="tianti-input w-full px-4 py-2.5 text-sm">
              <option value="all">全部系列</option>
              <option value="focused">仅当前焦点</option>
              <option value="needs_assets">资产有缺口</option>
              <option value="needs_episodes">待补齐剧集</option>
              <option value="needs_video">待完成视频</option>
            </select>
          </label>

          <label className="block">
            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">系列排序</div>
            <select value={seriesSortMode} onChange={(event) => setSeriesSortMode(event.target.value as SeriesSortMode)} className="tianti-input w-full px-4 py-2.5 text-sm">
              <option value="focused">焦点优先</option>
              <option value="recent">最近更新</option>
              <option value="stage_progress">阶段进度低优先</option>
              <option value="episode_backlog">待补集数多优先</option>
              <option value="delivery_backlog">待交付多优先</option>
            </select>
          </label>
        </div>
      </section>
      {filteredSeriesSnapshots.length === 0 ? (
        <section className="tianti-surface rounded-[28px] border border-dashed border-white/10 p-8 text-center">
          <div className="mx-auto max-w-xl text-sm leading-7 text-slate-300">
            当前筛选条件下没有系列结果。你可以放宽筛选，或切回“全部系列”继续批量编排。
          </div>
        </section>
      ) : (
        filteredSeriesSnapshots.map((snapshot) => (
          <SeriesEpisodeConsole
            key={snapshot.instance.id}
            seriesInstance={snapshot.instance}
            overview={snapshot.overview}
            episodes={snapshot.episodes}
            isActive={snapshot.instance.id === workflowState.activeSeriesId}
            activeEpisodeId={workflowState.activeEpisodeId}
            onAddEpisode={onAddEpisode}
            onBulkAddEpisodes={onBulkAddEpisodes}
            onOpenEpisodeWorkspace={onOpenEpisodeWorkspace}
            onMaterializeWorkflow={onMaterializeWorkflow}
            onFocusSeries={onFocusSeries}
            onUpdateSeriesSettings={onUpdateSeriesSettings}
            onBatchUpdateStages={onBatchUpdateStages}
          />
        ))
      )}
    </div>
  );
};

const SeriesEpisodeConsole: React.FC<{
  seriesInstance: WorkflowInstance;
  overview: SeriesOverview;
  episodes: WorkflowInstance[];
  isActive: boolean;
  activeEpisodeId: string | null;
  onAddEpisode: (seriesInstanceId: string) => void;
  onBulkAddEpisodes: (seriesInstanceId: string, count: number) => void;
  onOpenEpisodeWorkspace: (episodeId: string) => void | Promise<void>;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
  onFocusSeries: (seriesInstanceId: string) => void | Promise<void>;
  onUpdateSeriesSettings: (
    seriesInstanceId: string,
    patch: {
      plannedEpisodeCount?: number;
      preferredBindingMode?: WorkflowBindingMode;
    },
  ) => void | Promise<void>;
  onBatchUpdateStages: (
    workflowInstanceIds: string[],
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => void | Promise<void>;
}> = ({
  seriesInstance,
  overview,
  episodes,
  isActive,
  activeEpisodeId,
  onAddEpisode,
  onBulkAddEpisodes,
  onOpenEpisodeWorkspace,
  onMaterializeWorkflow,
  onFocusSeries,
  onUpdateSeriesSettings,
  onBatchUpdateStages,
}) => {
  const plannedEpisodeCount = seriesInstance.metadata?.plannedEpisodeCount ?? 0;
  const remainingEpisodeCount = plannedEpisodeCount > 0 ? Math.max(plannedEpisodeCount - episodes.length, 0) : 0;
  const hasBatchCapacity = plannedEpisodeCount > 0 ? remainingEpisodeCount > 0 : true;
  const preferredBindingMode = toPreferredBindingMode(seriesInstance.metadata?.preferredBindingMode);
  const stageDefinitions = useMemo(() => getWorkflowTemplate(episodes[0]?.templateId ?? 'manju-episode').stages, [episodes]);
  const [plannedEpisodeInput, setPlannedEpisodeInput] = useState(() => String(plannedEpisodeCount || Math.max(episodes.length, 80)));
  const [batchEpisodeInput, setBatchEpisodeInput] = useState(() => String(remainingEpisodeCount > 0 ? Math.min(remainingEpisodeCount, 10) : 5));
  const [preferredBindingModeInput, setPreferredBindingModeInput] = useState<PreferredBindingMode>(preferredBindingMode);
  const [episodeQuery, setEpisodeQuery] = useState('');
  const [episodeStageFilter, setEpisodeStageFilter] = useState<string>('all');
  const [episodeProgressFilter, setEpisodeProgressFilter] = useState<EpisodeProgressFilter>('all');
  const [episodeSortMode, setEpisodeSortMode] = useState<EpisodeSortMode>('episode_number');
  const [batchStageId, setBatchStageId] = useState(stageDefinitions[0]?.id ?? 'episode-script');
  const [batchStageStatus, setBatchStageStatus] = useState<WorkflowStageStatus>('in_progress');
  const [batchScopeMode, setBatchScopeMode] = useState<BatchScopeMode>('filtered');

  useEffect(() => {
    setPlannedEpisodeInput(String(plannedEpisodeCount || Math.max(episodes.length, 80)));
    setBatchEpisodeInput(String(remainingEpisodeCount > 0 ? Math.min(remainingEpisodeCount, 10) : 5));
    setPreferredBindingModeInput(preferredBindingMode);
  }, [episodes.length, plannedEpisodeCount, preferredBindingMode, remainingEpisodeCount]);

  useEffect(() => {
    if (!stageDefinitions.some((stage) => stage.id === batchStageId)) {
      setBatchStageId(stageDefinitions[0]?.id ?? 'episode-script');
    }
  }, [batchStageId, stageDefinitions]);

  const focusEpisode = useMemo(() => {
    const currentActiveEpisode = episodes.find((episode) => episode.id === activeEpisodeId);
    if (currentActiveEpisode) return currentActiveEpisode;

    return episodes.find((episode) => {
      const totalStages = Object.keys(episode.stageStates).length;
      return countCompletedStages(episode) < totalStages;
    }) ?? episodes[0] ?? null;
  }, [activeEpisodeId, episodes]);
  const filteredEpisodes = useMemo(() => {
    const normalizedQuery = episodeQuery.trim().toLowerCase();

    const filtered = episodes.filter((episode) => {
      const matchesQuery = normalizedQuery.length === 0
        || episode.title.toLowerCase().includes(normalizedQuery)
        || String(episode.metadata?.episodeNumber ?? '').includes(normalizedQuery);
      if (!matchesQuery) return false;

      if (episodeStageFilter !== 'all' && episode.currentStageId !== episodeStageFilter) {
        return false;
      }

      if (episodeProgressFilter === 'incomplete') {
        return countCompletedStages(episode) < Object.keys(episode.stageStates).length;
      }

      if (episodeProgressFilter === 'completed') {
        return countCompletedStages(episode) === Object.keys(episode.stageStates).length;
      }

      if (episodeProgressFilter === 'has_outputs') {
        return countOutputStages(episode) > 0;
      }

      if (episodeProgressFilter === 'blocked') {
        return Object.values(episode.stageStates).some((stage) => stage.status === 'error');
      }

      return true;
    });

    return filtered.sort((left, right) => {
      if (episodeSortMode === 'recent') {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }

      if (episodeSortMode === 'outputs') {
        const outputGap = countOutputStages(right) - countOutputStages(left);
        if (outputGap !== 0) return outputGap;
      }

      if (episodeSortMode === 'needs_attention') {
        const leftError = Object.values(left.stageStates).some((stage) => stage.status === 'error') ? 1 : 0;
        const rightError = Object.values(right.stageStates).some((stage) => stage.status === 'error') ? 1 : 0;
        if (leftError !== rightError) return rightError - leftError;

        const leftProgress = getStageProgressRatio(left);
        const rightProgress = getStageProgressRatio(right);
        if (leftProgress !== rightProgress) return leftProgress - rightProgress;
      }

      return (left.metadata?.episodeNumber ?? 0) - (right.metadata?.episodeNumber ?? 0);
    });
  }, [episodeProgressFilter, episodeQuery, episodeSortMode, episodeStageFilter, episodes]);

  const batchScopedEpisodes = useMemo(() => {
    const sourceEpisodes = batchScopeMode === 'all' ? episodes : filteredEpisodes;
    if (batchScopeMode !== 'pending') return sourceEpisodes;

    return sourceEpisodes.filter((episode) => episode.stageStates[batchStageId]?.status !== 'completed');
  }, [batchScopeMode, batchStageId, episodes, filteredEpisodes]);

  const batchTargetEpisodeIds = batchScopedEpisodes.filter((episode) => Boolean(episode.stageStates[batchStageId])).map((episode) => episode.id);

  const handleSaveSeriesSettings = () => {
    const parsedPlannedCount = Number.parseInt(plannedEpisodeInput, 10);
    if (Number.isNaN(parsedPlannedCount) || parsedPlannedCount <= 0) return;

    onUpdateSeriesSettings(seriesInstance.id, {
      plannedEpisodeCount: Math.max(parsedPlannedCount, episodes.length),
      preferredBindingMode: preferredBindingModeInput,
    });
  };

  const handleBulkCreate = () => {
    const parsedCount = Number.parseInt(batchEpisodeInput, 10);
    if (Number.isNaN(parsedCount) || parsedCount <= 0) return;

    const safeCount = plannedEpisodeCount > 0 ? Math.min(parsedCount, remainingEpisodeCount) : parsedCount;
    if (safeCount <= 0) return;

    onBulkAddEpisodes(seriesInstance.id, safeCount);
  };

  const handleBatchStageApply = () => {
    if (!batchStageId || batchTargetEpisodeIds.length === 0) return;
    onBatchUpdateStages(batchTargetEpisodeIds, batchStageId, { status: batchStageStatus });
  };

  return (
    <section className={`rounded-[30px] p-6 ${isActive ? 'tianti-hero-card border border-cyan-500/20 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]' : 'tianti-surface'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Series Control Desk</div>
            {isActive && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100">当前焦点</span>}
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-white">{seriesInstance.title}</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
            <span className="tianti-chip">默认绑定 {bindingModeLabels[preferredBindingMode]}</span>
            <span className="tianti-chip">资产缺口 {overview.uncoveredAssetCount}</span>
            <span className="tianti-chip">待交付 {Math.max(overview.createdEpisodeCount - overview.videoCompletedEpisodeCount, 0)}</span>
            <span className="tianti-chip">最近更新 {formatUpdatedAt(seriesInstance.updatedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => onFocusSeries(seriesInstance.id)} className="tianti-button tianti-button-secondary px-4 py-2 text-sm">聚焦系列</button>
          <button type="button" onClick={() => onAddEpisode(seriesInstance.id)} className="tianti-button tianti-button-primary px-4 py-2 text-sm font-semibold"><Plus className="h-4 w-4" />新增 1 集</button>
        </div>
      </div>

      <div className="mt-6">
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
          onFillRemaining={() => onBulkAddEpisodes(seriesInstance.id, remainingEpisodeCount)}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <section className="tianti-surface-muted rounded-[24px] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45"><Radar className="h-4 w-4 text-cyan-200" />阶段漏斗</div>
            <div className="mt-3 text-sm leading-7 text-slate-300">从这里看这一套系列的剧本、资产、分镜、提示词和视频交付落点，判断下一批单集该往哪里压。</div>
            <div className="mt-4 space-y-3">
              {seriesStageMeta.map((item) => {
                const Icon = item.icon;
                const value = overview[item.key];
                const percentage = toPercent(value, overview.createdEpisodeCount);
                return (
                  <div key={item.key} className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-white"><Icon className="h-4 w-4 text-cyan-200" />{item.label}</div>
                      <div className="text-xs text-slate-400">{value}/{overview.createdEpisodeCount || 0}</div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400" style={{ width: `${Math.max(percentage, value > 0 ? 8 : 0)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="tianti-surface-muted rounded-[24px] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45"><Sparkles className="h-4 w-4 text-cyan-200" />批量阶段操作</div>
            <div className="mt-3 text-sm leading-7 text-slate-300">先筛选剧集，再统一推进某个阶段状态。适合批量把一批剧集标记成“剧本完成”“分镜进行中”这类生产动作。</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">目标阶段</div>
                <select value={batchStageId} onChange={(event) => setBatchStageId(event.target.value)} className="tianti-input w-full px-4 py-2.5 text-sm">
                  {stageDefinitions.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">更新状态</div>
                <select value={batchStageStatus} onChange={(event) => setBatchStageStatus(event.target.value as WorkflowStageStatus)} className="tianti-input w-full px-4 py-2.5 text-sm">
                  {stageStatusOptions.map((status) => <option key={status} value={status}>{stageStatusLabels[status]}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">作用范围</div>
                <select value={batchScopeMode} onChange={(event) => setBatchScopeMode(event.target.value as BatchScopeMode)} className="tianti-input w-full px-4 py-2.5 text-sm">
                  <option value="filtered">当前筛选结果</option>
                  <option value="pending">仅未完成该阶段</option>
                  <option value="all">整个系列</option>
                </select>
              </label>
              <div className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-white/40">将要作用</div>
                <div className="mt-2 text-lg font-semibold text-white">{batchTargetEpisodeIds.length} 集</div>
                <div className="mt-1 text-xs leading-6 text-slate-400">目标阶段：{stageDefinitions.find((stage) => stage.id === batchStageId)?.title ?? batchStageId}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handleBatchStageApply} disabled={batchTargetEpisodeIds.length === 0} className="tianti-button tianti-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">批量更新阶段</button>
              <span className={`tianti-chip ${stageStatusClassNames[batchStageStatus]}`}>将更新为 {stageStatusLabels[batchStageStatus]}</span>
            </div>
          </section>

          <section className="tianti-surface-muted rounded-[24px] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45"><Target className="h-4 w-4 text-cyan-200" />当前推荐处理</div>
            {focusEpisode ? (
              <>
                <div className="mt-3 text-lg font-semibold text-white">{focusEpisode.title}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="tianti-chip is-accent">当前阶段 {getCurrentStageTitle(focusEpisode)}</span>
                  <span className="tianti-chip">阶段 {countCompletedStages(focusEpisode)}/{Object.keys(focusEpisode.stageStates).length}</span>
                  <span className="tianti-chip">产出 {countOutputStages(focusEpisode)}</span>
                </div>
                <div className="mt-3 text-sm leading-7 text-slate-300">优先把当前推荐单集继续往下推进；完成后，这一批剧集的模板稳定性和最终交付节奏会更清楚。</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={() => onOpenEpisodeWorkspace(focusEpisode.id)} className="tianti-button tianti-button-primary px-4 py-2 text-sm font-semibold">进入工作区<ChevronRight className="h-4 w-4" /></button>
                  <button type="button" onClick={() => onMaterializeWorkflow(focusEpisode.id)} className="tianti-button tianti-button-secondary px-4 py-2 text-sm">投放画布</button>
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm leading-7 text-slate-400">当前系列还没有单集，先按批次铺开几集，再把推荐处理压给单集工作区。</div>
            )}
          </section>
        </div>

        <section className="tianti-surface-muted rounded-[24px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/45">剧集队列</div>
              <div className="mt-2 text-sm leading-7 text-slate-300">用队列而不是大卡片列表来管理 80 集长链路；越往后越适合批量浏览、挑选与回到工作区执行。</div>
            </div>
            <div className="text-xs text-slate-400">当前显示 {filteredEpisodes.length} / {episodes.length} 集</div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_220px_220px_200px]">
            <label className="block">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40"><Search className="h-4 w-4" />剧集搜索</div>
              <input value={episodeQuery} onChange={(event) => setEpisodeQuery(event.target.value)} placeholder="搜索标题或集数" className="tianti-input w-full px-4 py-2.5 text-sm" />
            </label>
            <label className="block">
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">当前阶段筛选</div>
              <select value={episodeStageFilter} onChange={(event) => setEpisodeStageFilter(event.target.value)} className="tianti-input w-full px-4 py-2.5 text-sm">
                <option value="all">全部阶段</option>
                {stageDefinitions.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">剧集状态筛选</div>
              <select value={episodeProgressFilter} onChange={(event) => setEpisodeProgressFilter(event.target.value as EpisodeProgressFilter)} className="tianti-input w-full px-4 py-2.5 text-sm">
                <option value="all">全部剧集</option>
                <option value="incomplete">未完成</option>
                <option value="completed">已完成</option>
                <option value="has_outputs">有产出</option>
                <option value="blocked">异常阻塞</option>
              </select>
            </label>
            <label className="block">
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/40">剧集排序</div>
              <select value={episodeSortMode} onChange={(event) => setEpisodeSortMode(event.target.value as EpisodeSortMode)} className="tianti-input w-full px-4 py-2.5 text-sm">
                <option value="episode_number">按集数</option>
                <option value="needs_attention">需关注优先</option>
                <option value="recent">最近更新</option>
                <option value="outputs">产出较多优先</option>
              </select>
            </label>
          </div>
          {filteredEpisodes.length === 0 ? (
            <div className="mt-5 rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm leading-7 text-slate-400">
              当前筛选条件下没有剧集结果。可以清空搜索或调整阶段 / 状态筛选。
            </div>
          ) : (
            <div className="mt-5 max-h-[640px] space-y-3 overflow-y-auto pr-1">
              {filteredEpisodes.map((episode) => {
                const totalStages = Object.keys(episode.stageStates).length;
                const completedStages = countCompletedStages(episode);
                const outputStageCount = countOutputStages(episode);

                return (
                  <article
                    key={episode.id}
                    className={`rounded-[22px] border p-4 ${
                      episode.id === activeEpisodeId
                        ? 'border-cyan-500/30 bg-cyan-500/10'
                        : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{episode.title}</div>
                          {episode.id === activeEpisodeId && (
                            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100">当前单集</span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="tianti-chip">阶段 {completedStages}/{totalStages}</span>
                          <span className="tianti-chip">当前 {getCurrentStageTitle(episode)}</span>
                          <span className="tianti-chip">产出 {outputStageCount}</span>
                          <span className="tianti-chip">更新 {formatUpdatedAt(episode.updatedAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onOpenEpisodeWorkspace(episode.id)} className="tianti-button tianti-button-secondary px-3 py-2 text-xs">打开工作区</button>
                        <button type="button" onClick={() => onMaterializeWorkflow(episode.id)} className="tianti-button tianti-button-primary px-3 py-2 text-xs"><Film className="h-4 w-4" />投放</button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {stageDefinitions.map((stage) => {
                        const stageState = episode.stageStates[stage.id];
                        if (!stageState) return null;

                        return (
                          <span key={`${episode.id}-${stage.id}`} className={`tianti-chip ${stageStatusClassNames[stageState.status]}`}>
                            {stage.title} · {stageStatusLabels[stageState.status]}
                          </span>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="mt-6 rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-50 shadow-[0_16px_40px_rgba(16,185,129,0.12)]">
        <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" />批量执行建议</div>
        <div className="mt-2 text-emerald-100/90">建议先用 10 集小批次验证人物资产与提示词模板，再逐步扩到 20 集批次；这样更适合长篇漫剧的稳定复用和最终视频交付。</div>
      </div>
    </section>
  );
};

const EpisodesSummaryCard: React.FC<{
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}> = ({ label, value, hint, highlight = false }) => (
  <div
    className={`rounded-[22px] px-4 py-4 ${
      highlight
        ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-50 shadow-[0_16px_40px_rgba(73,200,255,0.12)]'
        : 'tianti-stat-card text-white'
    }`}
  >
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-2xl font-semibold">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{hint}</div>
  </div>
);
