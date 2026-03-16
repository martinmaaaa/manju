import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clapperboard,
  Film,
  Layers3,
  Package2,
  Plus,
  Settings,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type {
  ContinuityState,
  WorkflowAssetType,
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowProjectState,
  WorkflowStageDefinition,
  WorkflowStageStatus,
  WorkflowTemplateDefinition,
  WorkflowTemplateId,
} from '../../services/workflow/domain/types';
import {
  countCompletedStages,
  getAssetSummaryForState,
  getEpisodeBindings,
  getEpisodeContinuityStates,
  getEpisodeInstances,
  getSeriesAssetCoverage,
  getSeriesInstances,
} from '../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../services/workflow/registry';
import { AssetCenterPanel } from './panels/AssetCenterPanel';
import { ContinuityPanel } from './panels/ContinuityPanel';
import { EpisodeWorkspace } from './panels/EpisodeWorkspace';

type PreferredBindingMode = Extract<WorkflowBindingMode, 'follow_latest' | 'pinned'>;

interface WorkflowCenterProps {
  projectTitle: string;
  workflowState: WorkflowProjectState;
  templates: WorkflowTemplateDefinition[];
  onBackToProjects: () => void;
  onOpenCanvas: () => void;
  onOpenSettings: () => void;
  onCreateWorkflow: (templateId: WorkflowTemplateId) => void;
  onAddEpisode: (seriesInstanceId: string) => void;
  onBulkAddEpisodes: (seriesInstanceId: string, count: number) => void;
  onUpdateSeriesSettings: (
    seriesInstanceId: string,
    patch: {
      plannedEpisodeCount?: number;
      preferredBindingMode?: WorkflowBindingMode;
    },
  ) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
  onSelectEpisode: (episodeId: string) => void;
  onCreateAsset: (type: WorkflowAssetType, name: string, tags: string[]) => void;
  onCreateAssetVersion: (assetId: string, notes?: string) => void;
  onBindAsset: (episodeId: string, assetId: string, mode: WorkflowBindingMode) => void;
  onUnbindAsset: (bindingId: string) => void;
  onUpdateContinuity: (
    workflowInstanceId: string,
    subjectType: ContinuityState['subjectType'],
    subjectId: string,
    patch: Record<string, unknown>,
  ) => void;
  onUpdateStage: (
    workflowInstanceId: string,
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => void;
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
  onBulkAddEpisodes,
  onUpdateSeriesSettings,
  onMaterializeWorkflow,
  onSelectEpisode,
  onCreateAsset,
  onCreateAssetVersion,
  onBindAsset,
  onUnbindAsset,
  onUpdateContinuity,
  onUpdateStage,
}) => {
  const seriesInstances = getSeriesInstances(workflowState);
  const assetSummary = getAssetSummaryForState(workflowState);

  const activeEpisode = useMemo(() => {
    if (workflowState.activeEpisodeId) {
      return workflowState.instances.find(instance => instance.id === workflowState.activeEpisodeId) ?? null;
    }

    const firstSeries = seriesInstances[0];
    if (!firstSeries) return null;
    return getEpisodeInstances(workflowState, firstSeries.id)[0] ?? null;
  }, [seriesInstances, workflowState]);

  const activeEpisodeBindings = activeEpisode
    ? getEpisodeBindings(workflowState, activeEpisode.id)
    : [];

  const activeEpisodeStages: WorkflowStageDefinition[] = activeEpisode
    ? getWorkflowTemplate(activeEpisode.templateId).stages
    : [];

  const activeEpisodeContinuity = activeEpisode
    ? getEpisodeContinuityStates(workflowState, activeEpisode.id)
    : [];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0c] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.12),_transparent_30%)]" />
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
                先选择整套工作流，再推进系列资产、分集制作与连续性管理。原始节点画布仍保留，用于高级调试和执行。
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

            <AssetCenterPanel
              assets={workflowState.assets}
              assetVersions={workflowState.assetVersions}
              onCreateAsset={onCreateAsset}
              onCreateAssetVersion={onCreateAssetVersion}
            />

            <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.22em] text-white/45">资产概览</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <SummaryBadge label="人物" value={assetSummary.character} />
                <SummaryBadge label="场景" value={assetSummary.scene} />
                <SummaryBadge label="道具" value={assetSummary.prop} />
                <SummaryBadge label="风格" value={assetSummary.style} />
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
                  assetCoverage={getSeriesAssetCoverage(workflowState, seriesInstance.id)}
                  onAddEpisode={onAddEpisode}
                  onBulkAddEpisodes={onBulkAddEpisodes}
                  onUpdateSeriesSettings={onUpdateSeriesSettings}
                  onSelectEpisode={onSelectEpisode}
                  onMaterializeWorkflow={onMaterializeWorkflow}
                />
              ))
            )}

            {activeEpisode && (
              <>
                <EpisodeWorkspace
                  episode={activeEpisode}
                  stageDefinitions={activeEpisodeStages}
                  assets={workflowState.assets}
                  bindings={activeEpisodeBindings}
                  onBindAsset={onBindAsset}
                  onUnbindAsset={onUnbindAsset}
                  onUpdateStage={onUpdateStage}
                  onMaterializeWorkflow={onMaterializeWorkflow}
                />
                <ContinuityPanel
                  episodeId={activeEpisode.id}
                  assets={workflowState.assets}
                  bindings={activeEpisodeBindings}
                  continuityStates={activeEpisodeContinuity}
                  onUpdateContinuity={onUpdateContinuity}
                />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

const SummaryBadge: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
  </div>
);

interface SeriesCardProps {
  instance: WorkflowInstance;
  episodes: WorkflowInstance[];
  assetCoverage: SeriesAssetCoverageEntry[];
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
}

const SeriesCard: React.FC<SeriesCardProps> = ({
  instance,
  episodes,
  assetCoverage,
  onAddEpisode,
  onBulkAddEpisodes,
  onUpdateSeriesSettings,
  onSelectEpisode,
  onMaterializeWorkflow,
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
  const [coverageAssetTypeFilter, setCoverageAssetTypeFilter] = useState<'all' | WorkflowAssetType>('all');
  const [showOnlyUncovered, setShowOnlyUncovered] = useState(false);
  const stageTitleMap = useMemo(() => getWorkflowTemplate(instance.templateId).stages.reduce<Record<string, string>>((accumulator, stage) => {
    accumulator[stage.id] = stage.title;
    return accumulator;
  }, {}), [instance.templateId]);
  const filteredAssetCoverage = useMemo(() => assetCoverage.filter((entry) => {
    if (coverageAssetTypeFilter !== 'all' && entry.asset.type !== coverageAssetTypeFilter) {
      return false;
    }

    if (showOnlyUncovered && entry.missingCount === 0) {
      return false;
    }

    return true;
  }), [assetCoverage, coverageAssetTypeFilter, showOnlyUncovered]);

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
              规划集数 {plannedEpisodeCount}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              已建单集 {episodes.length}
            </span>
          </div>
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

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-[24px] border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-white/40">系列默认配置</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <div className="text-sm text-slate-300">规划总集数</div>
              <input
                type="number"
                min={Math.max(1, episodes.length)}
                value={plannedEpisodeInput}
                onChange={(event) => setPlannedEpisodeInput(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/40"
              />
            </label>
            <label className="block">
              <div className="text-sm text-slate-300">默认绑定策略</div>
              <select
                value={preferredBindingModeInput}
                onChange={(event) => setPreferredBindingModeInput(event.target.value as PreferredBindingMode)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/40"
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
              className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-5 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/20"
            >
              保存系列配置
            </button>
            <div className="text-xs text-slate-400">
              当前默认策略：{bindingModeLabels[preferredBindingMode]}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-white/10 bg-black/20 p-5">
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
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>
            <button
              type="button"
              onClick={handleBulkCreate}
              disabled={!hasBatchCapacity}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={16} />
              批量新增
            </button>
            {remainingEpisodeCount > 0 && (
              <button
                type="button"
                onClick={() => onBulkAddEpisodes(instance.id, remainingEpisodeCount)}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
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
        assetCoverage={filteredAssetCoverage}
        episodes={episodes}
        plannedEpisodeCount={plannedEpisodeCount}
        assetTypeFilter={coverageAssetTypeFilter}
        showOnlyUncovered={showOnlyUncovered}
        onAssetTypeFilterChange={setCoverageAssetTypeFilter}
        onShowOnlyUncoveredChange={setShowOnlyUncovered}
        onSelectEpisode={onSelectEpisode}
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        {Object.entries(instance.stageStates).map(([stageId, stage]) => {
          const Icon = stageIcons[stageId] ?? Sparkles;

          return (
            <div key={stageId} className="rounded-[24px] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-2xl bg-white/5 p-3 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] tracking-[0.16em] text-slate-300">
                  {stage.status}
                </span>
              </div>
              <div className="mt-4 text-sm font-semibold text-white">{stageTitleMap[stageId] ?? stageId}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">分集工作区</div>
            <div className="mt-2 text-sm text-slate-300">
              单集默认先走阶段视图；只有需要调试或一键执行时，才投放到原始画布。
            </div>
          </div>
          <div className="text-xs text-white/40">最近更新 {formatUpdatedAt(instance.updatedAt)}</div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {episodes.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm leading-7 text-slate-400">
              还没有单集工作流。先点击“新增单集”或“批量新增”，再进入单集工作区推进每一集内容。
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
                <div className="mt-3 text-xs text-slate-400">
                  默认绑定：{bindingModeLabels[toPreferredBindingMode(episode.metadata?.preferredBindingMode)]}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.keys(episode.stageStates).map((stageId) => (
                    <span key={stageId} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-300">
                      {stageTitleMap[stageId] ?? stageId}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectEpisode(episode.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:text-white"
                  >
                    打开单集
                  </button>
                  <button
                    type="button"
                    onClick={() => onMaterializeWorkflow(episode.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/20"
                  >
                    投放画布
                    <ChevronRight size={15} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

const assetTypeLabels: Record<WorkflowAssetType, string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  style: '风格',
};

interface AssetCoverageMatrixPanelProps {
  assetCoverage: SeriesAssetCoverageEntry[];
  episodes: WorkflowInstance[];
  plannedEpisodeCount: number;
  assetTypeFilter: 'all' | WorkflowAssetType;
  showOnlyUncovered: boolean;
  onAssetTypeFilterChange: (value: 'all' | WorkflowAssetType) => void;
  onShowOnlyUncoveredChange: (value: boolean) => void;
  onSelectEpisode: (episodeId: string) => void;
}

const AssetCoverageMatrixPanel: React.FC<AssetCoverageMatrixPanelProps> = ({
  assetCoverage,
  episodes,
  plannedEpisodeCount,
  assetTypeFilter,
  showOnlyUncovered,
  onAssetTypeFilterChange,
  onShowOnlyUncoveredChange,
  onSelectEpisode,
}) => {
  const existingEpisodeNumbers = useMemo(() => new Set(
    episodes.map(episode => episode.metadata?.episodeNumber ?? 0),
  ), [episodes]);
  const slotCount = Math.max(plannedEpisodeCount, episodes.length);
  const assetTypeOptions: Array<'all' | WorkflowAssetType> = ['all', 'character', 'scene', 'prop', 'style'];

  return (
    <section className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">资产出场矩阵</div>
          <div className="mt-2 text-sm leading-7 text-slate-300">
            用于查看系列资产在各集的绑定覆盖情况，快速发现哪些人物、场景、道具还没铺到对应集数。
          </div>
        </div>
        <div className="text-xs text-slate-400">
          已创建 {episodes.length} 集 / 规划 {plannedEpisodeCount || episodes.length} 集
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {assetTypeOptions.map(option => {
          const active = assetTypeFilter === option;
          const label = option === 'all' ? '全部' : assetTypeLabels[option];

          return (
            <button
              key={option}
              type="button"
              onClick={() => onAssetTypeFilterChange(option)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                active
                  ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
              }`}
            >
              {label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onShowOnlyUncoveredChange(!showOnlyUncovered)}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            showOnlyUncovered
              ? 'border-amber-500/30 bg-amber-500/15 text-amber-100'
              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
          }`}
        >
          只看未覆盖
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {assetCoverage.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
            当前筛选下没有资产覆盖记录。
          </div>
        ) : (
          assetCoverage.map((entry) => (
            <article key={entry.asset.id} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-white">{entry.asset.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {assetTypeLabels[entry.asset.type]} · 覆盖 {entry.boundCount}/{entry.plannedEpisodeCount || entry.existingEpisodeCount || 0}
                    {entry.asset.tags.length > 0 ? ` · ${entry.asset.tags.join(' / ')}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-cyan-100">{Math.round(entry.coverageRate * 100)}%</div>
                  <div className="mt-1 text-xs text-slate-400">
                    缺口 {entry.missingCount} 集
                  </div>
                </div>
              </div>

              {slotCount > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="grid min-w-[720px] grid-cols-10 gap-2 xl:grid-cols-20">
                    {Array.from({ length: slotCount }, (_, index) => {
                      const episodeNumber = index + 1;
                      const binding = entry.episodes.find(item => item.episodeNumber === episodeNumber);
                      const exists = existingEpisodeNumbers.has(episodeNumber);

                      return (
                        <div
                          key={`${entry.asset.id}-${episodeNumber}`}
                          className={`rounded-xl border px-2 py-2 text-center text-[11px] transition ${
                            binding
                              ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100'
                              : exists
                                ? 'border-white/10 bg-white/5 text-slate-400'
                                : 'border-dashed border-white/10 bg-transparent text-slate-600'
                          }`}
                          title={binding ? `${binding.episodeTitle} · ${binding.mode}` : exists ? `第 ${episodeNumber} 集未绑定` : `第 ${episodeNumber} 集未创建`}
                        >
                          <div>E{episodeNumber}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {entry.episodes.length === 0 ? (
                  <span className="text-xs text-slate-500">尚未绑定到任何单集</span>
                ) : (
                  entry.episodes.map((item) => (
                    <button
                      key={`${entry.asset.id}-${item.episodeId}`}
                      type="button"
                      onClick={() => onSelectEpisode(item.episodeId)}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-300 transition hover:border-cyan-500/30 hover:text-white"
                    >
                      第 {item.episodeNumber} 集 · {item.mode}
                    </button>
                  ))
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};
