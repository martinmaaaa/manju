import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Layers3,
  Settings,
} from 'lucide-react';
import type {
  ContinuityState,
  WorkflowAssetBatchTemplate,
  WorkflowAssetBatchTemplateSuggestion,
  WorkflowAssetBatchTemplateTarget,
  WorkflowAssetType,
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowProjectState,
  WorkflowSeriesOverview,
  WorkflowStageDefinition,
  WorkflowStageStatus,
  WorkflowTemplateDefinition,
  WorkflowTemplateId,
} from '../../services/workflow/domain/types';
import {
  getAssetSummaryForState,
  getEpisodeBindings,
  getEpisodeContinuityStates,
  getEpisodeInstances,
  getSeriesAssetCoverage,
  getSeriesInstances,
  getSeriesWorkflowOverview,
  getSuggestedAssetBatchTemplateTargetsForAsset,
  getSuggestedSeriesAssetBatchTemplates,
} from '../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../services/workflow/registry';
import { ContinuityPanel } from './panels/ContinuityPanel';
import { EpisodeAssetBindingPanel } from './panels/EpisodeAssetBindingPanel';
import { EpisodeOutputsPanel } from './panels/EpisodeOutputsPanel';
import { EpisodeStagePanel } from './panels/EpisodeStagePanel';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import { SeriesCompactCard } from './SeriesCompactCard';
import { WorkflowOverviewCenter } from './WorkflowOverviewCenter';
import { WorkflowWorkbenchPanel, type WorkflowWorkbenchTabKey } from './WorkflowWorkbenchPanel';
import { WorkflowCenterSidebar } from './WorkflowCenterSidebar';
import { SeriesWorkflowCard } from './SeriesWorkflowCard';
import type { AppView } from '../../stores/ui.store';

type ProjectWorkspaceView = Extract<AppView, 'pipeline' | 'assets' | 'episodes' | 'workspace' | 'canvas'>;

interface WorkflowCenterProps {
  projectTitle: string;
  workflowState: WorkflowProjectState;
  activeView: ProjectWorkspaceView;
  templates: WorkflowTemplateDefinition[];
  onNavigate: (view: ProjectWorkspaceView) => void;
  onBackToProjects: () => void;
  onOpenCanvas: () => void;
  onOpenSettings: () => void;
  onCreateWorkflow: (templateId: WorkflowTemplateId) => void;
  onFocusSeries: (seriesInstanceId: string) => void;
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
  onCreateAsset: (
    type: WorkflowAssetType,
    name: string,
    tags: string[],
    options?: {
      seriesInstanceId?: string;
      autoApplySuggestedTemplates?: boolean;
    },
  ) => Promise<{
    assetId: string;
    assetName: string;
    appliedTemplateNames: string[];
    suggestedTargets: WorkflowAssetBatchTemplateTarget[];
  } | void> | void;
  onCreateAssetVersion: (assetId: string, notes?: string) => void;
  onBindAsset: (episodeId: string, assetId: string, mode: WorkflowBindingMode) => void;
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
    seriesInstanceId: string,
    name: string,
    assetIds: string[],
    templateId?: string,
    autoApplyToNewEpisodes?: boolean,
  ) => void;
  onSaveSeriesAssetBatchTemplates: (
    seriesInstanceId: string,
    templates: Array<{
      id?: string;
      name: string;
      assetIds: string[];
      autoApplyToNewEpisodes?: boolean;
    }>,
  ) => void;
  onDeleteSeriesAssetBatchTemplate: (
    seriesInstanceId: string,
    templateId: string,
  ) => void;
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

export const WorkflowCenter: React.FC<WorkflowCenterProps> = ({
  projectTitle,
  workflowState,
  activeView,
  templates,
  onNavigate,
  onBackToProjects,
  onOpenCanvas,
  onOpenSettings,
  onCreateWorkflow,
  onFocusSeries,
  onAddEpisode,
  onBulkAddEpisodes,
  onUpdateSeriesSettings,
  onMaterializeWorkflow,
  onSelectEpisode,
  onCreateAsset,
  onCreateAssetVersion,
  onBindAsset,
  onSyncAssetCoverage,
  onBatchSyncAssetCoverage,
  onSaveSeriesAssetBatchTemplate,
  onSaveSeriesAssetBatchTemplates,
  onDeleteSeriesAssetBatchTemplate,
  onUnbindAsset,
  onUpdateContinuity,
  onUpdateStage,
}) => {
  const seriesInstances = getSeriesInstances(workflowState);
  const assetSummary = getAssetSummaryForState(workflowState);
  const assetCenterRef = useRef<HTMLDivElement | null>(null);
  const seriesCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollSeriesIdRef = useRef<string | null>(null);
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<WorkflowWorkbenchTabKey>('stages');
  const seriesSnapshots = useMemo(() => seriesInstances.map((seriesInstance) => {
    const episodes = getEpisodeInstances(workflowState, seriesInstance.id);
    const assetCoverage = getSeriesAssetCoverage(workflowState, seriesInstance.id);
    const assetBatchTemplates = seriesInstance.metadata?.assetBatchTemplates ?? [];
    const suggestedAssetBatchTemplates = getSuggestedSeriesAssetBatchTemplates(workflowState, seriesInstance.id);
    const workflowOverview = getSeriesWorkflowOverview(workflowState, seriesInstance.id);

    return workflowOverview
      ? {
        instance: seriesInstance,
        episodes,
        assetCoverage,
        assetBatchTemplates,
        suggestedAssetBatchTemplates,
        workflowOverview,
      }
      : null;
  }).filter((snapshot): snapshot is {
    instance: WorkflowInstance;
    episodes: WorkflowInstance[];
    assetCoverage: ReturnType<typeof getSeriesAssetCoverage>;
    assetBatchTemplates: WorkflowAssetBatchTemplate[];
    suggestedAssetBatchTemplates: WorkflowAssetBatchTemplateSuggestion[];
    workflowOverview: WorkflowSeriesOverview;
  } => Boolean(snapshot)), [seriesInstances, workflowState]);
  const activeSeriesSnapshot = useMemo(() => (
    seriesSnapshots.find(snapshot => snapshot.instance.id === workflowState.activeSeriesId) ?? seriesSnapshots[0] ?? null
  ), [seriesSnapshots, workflowState.activeSeriesId]);
  const assetCenterSeries = activeSeriesSnapshot?.instance ?? null;
  const assetCenterTemplates = activeSeriesSnapshot?.assetBatchTemplates ?? [];
  const assetCenterTargetsByAssetId = useMemo(() => {
    if (!assetCenterSeries) return {} as Record<string, WorkflowAssetBatchTemplateTarget[]>;

    return workflowState.assets.reduce<Record<string, WorkflowAssetBatchTemplateTarget[]>>((accumulator, asset) => {
      accumulator[asset.id] = getSuggestedAssetBatchTemplateTargetsForAsset(workflowState, assetCenterSeries.id, asset.id);
      return accumulator;
    }, {});
  }, [assetCenterSeries, workflowState]);

  const activeEpisode = useMemo(() => {
    if (workflowState.activeEpisodeId) {
      return workflowState.instances.find(instance => instance.id === workflowState.activeEpisodeId) ?? null;
    }

    const firstSeries = activeSeriesSnapshot?.instance ?? seriesInstances[0];
    if (!firstSeries) return null;
    return getEpisodeInstances(workflowState, firstSeries.id)[0] ?? null;
  }, [activeSeriesSnapshot, seriesInstances, workflowState]);

  const handleFocusSeries = (seriesInstanceId: string) => {
    pendingScrollSeriesIdRef.current = seriesInstanceId;
    onFocusSeries(seriesInstanceId);
  };

  useEffect(() => {
    if (!activeSeriesSnapshot) return;
    if (pendingScrollSeriesIdRef.current !== activeSeriesSnapshot.instance.id) return;

    seriesCardRefs.current[activeSeriesSnapshot.instance.id]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    pendingScrollSeriesIdRef.current = null;
  }, [activeSeriesSnapshot]);

  const handleRunSeriesNextAction = (seriesInstanceId: string) => {
    const target = seriesSnapshots.find(snapshot => snapshot.instance.id === seriesInstanceId);
    if (!target) return;

    switch (target.workflowOverview.nextAction.key) {
      case 'create_series_assets':
      case 'organize_asset_templates':
        handleFocusSeries(seriesInstanceId);
        assetCenterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      case 'create_episodes':
        onAddEpisode(seriesInstanceId);
        return;
      case 'open_episode_script':
      case 'open_episode_assets':
      case 'open_episode_storyboard':
      case 'open_episode_prompt':
      case 'open_episode_video':
        if (target.workflowOverview.nextAction.episodeId) {
          onSelectEpisode(target.workflowOverview.nextAction.episodeId);
        }
        return;
      case 'materialize_series':
        onMaterializeWorkflow(seriesInstanceId);
        return;
      default:
    }
  };

  const totalPlannedEpisodeCount = useMemo(() => (
    seriesSnapshots.reduce((sum, snapshot) => sum + snapshot.workflowOverview.plannedEpisodeCount, 0)
  ), [seriesSnapshots]);
  const totalCreatedEpisodeCount = useMemo(() => (
    seriesSnapshots.reduce((sum, snapshot) => sum + snapshot.workflowOverview.createdEpisodeCount, 0)
  ), [seriesSnapshots]);
  const productionTotals = useMemo(() => (
    seriesSnapshots.reduce((sum, snapshot) => ({
      script: sum.script + snapshot.workflowOverview.scriptCompletedEpisodeCount,
      asset: sum.asset + snapshot.workflowOverview.assetCompletedEpisodeCount,
      storyboard: sum.storyboard + snapshot.workflowOverview.storyboardCompletedEpisodeCount,
      prompt: sum.prompt + snapshot.workflowOverview.promptCompletedEpisodeCount,
      video: sum.video + snapshot.workflowOverview.videoCompletedEpisodeCount,
    }), {
      script: 0,
      asset: 0,
      storyboard: 0,
      prompt: 0,
      video: 0,
    })
  ), [seriesSnapshots]);
  const inactiveSeriesSnapshots = useMemo(() => (
    seriesSnapshots.filter(snapshot => snapshot.instance.id !== activeSeriesSnapshot?.instance.id)
  ), [activeSeriesSnapshot, seriesSnapshots]);
  const activeEpisodeStageProgressLabel = activeEpisode
    ? `阶段 ${Object.values(activeEpisode.stageStates).filter(stage => stage.status === 'completed').length}/${Object.keys(activeEpisode.stageStates).length}`
    : undefined;

  useEffect(() => {
    setActiveWorkbenchTab('stages');
  }, [activeEpisode?.id]);

  const activeEpisodeBindings = activeEpisode
    ? getEpisodeBindings(workflowState, activeEpisode.id)
    : [];

  const activeEpisodeStages: WorkflowStageDefinition[] = activeEpisode
    ? getWorkflowTemplate(activeEpisode.templateId).stages
    : [];

  const activeEpisodeContinuity = activeEpisode
    ? getEpisodeContinuityStates(workflowState, activeEpisode.id)
    : [];
  const activeEpisodeOutputStageCount = activeEpisode
    ? Object.values(activeEpisode.stageStates).filter((stage) => (
        Object.keys(stage.outputs).length > 0
        || stage.artifactIds.length > 0
        || Boolean(stage.error)
        || Boolean(stage.completedAt)
      )).length
    : 0;

  return (
    <div className="tianti-shell">
      <div className="relative flex h-screen flex-col overflow-hidden">
        <div className="tianti-shell-header">
          <div className="tianti-shell-container flex items-center justify-between gap-4 px-6 py-5 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBackToProjects}
                className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
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
                className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
              >
                <Settings size={16} />
                系统设置
              </button>
              <button
                type="button"
                onClick={onOpenCanvas}
                className="tianti-button tianti-button-ghost px-5 py-2.5 text-sm"
              >
                高级画布
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="tianti-shell-container px-6 pb-5 lg:px-8">
            <ProjectWorkspaceNav
              currentView={activeView}
              onChange={onNavigate}
              hasActiveEpisode={Boolean(activeEpisode)}
            />
          </div>
        </div>

        <div className="tianti-shell-container grid h-full w-full grid-cols-[320px_minmax(0,1fr)] gap-8 overflow-hidden px-6 py-8 lg:px-8">
          <WorkflowCenterSidebar
            templates={templates}
            assetSummary={assetSummary}
            assets={workflowState.assets}
            assetVersions={workflowState.assetVersions}
            assetCenterSeriesTitle={assetCenterSeries?.title}
            canAutoAttachSuggestedTemplates={Boolean(assetCenterSeries)}
            assetBatchTemplates={assetCenterTemplates}
            assetBatchTargetsByAssetId={assetCenterTargetsByAssetId}
            assetCenterRef={assetCenterRef}
            onCreateWorkflow={onCreateWorkflow}
            onCreateAsset={(type, name, tags, autoApplySuggestedTemplates) =>
              onCreateAsset(type, name, tags, {
                seriesInstanceId: assetCenterSeries?.id,
                autoApplySuggestedTemplates,
              })
            }
            onCreateAssetVersion={onCreateAssetVersion}
            onApplyAssetBatchTemplateTarget={(assetId, target) => {
              if (!assetCenterSeries) return;

              const existingTemplate = assetCenterTemplates.find(
                (template) =>
                  (target.templateId && template.id === target.templateId) ||
                  template.name === target.name,
              );
              const assetIds = Array.from(
                new Set([...(existingTemplate?.assetIds ?? []), assetId]),
              );

              onSaveSeriesAssetBatchTemplate(
                assetCenterSeries.id,
                target.name,
                assetIds,
                existingTemplate?.id ?? target.templateId,
                target.autoApplyToNewEpisodes,
              );
            }}
          />

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
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="space-y-6">
                  <WorkflowOverviewCenter
                    projectTitle={projectTitle}
                    totalSeriesCount={seriesSnapshots.length}
                    totalAssetsCount={workflowState.assets.length}
                    totalPlannedEpisodeCount={totalPlannedEpisodeCount}
                    totalCreatedEpisodeCount={totalCreatedEpisodeCount}
                    activeSeriesTitle={activeSeriesSnapshot?.instance.title}
                    activeEpisodeTitle={activeEpisode?.title}
                    seriesItems={seriesSnapshots.map((snapshot) => ({
                      id: snapshot.instance.id,
                      title: snapshot.instance.title,
                      updatedAt: snapshot.instance.updatedAt,
                      isActive: snapshot.instance.id === activeSeriesSnapshot?.instance.id,
                      overview: snapshot.workflowOverview,
                    }))}
                    productionTotals={productionTotals}
                    onFocusSeries={handleFocusSeries}
                    onRunNextAction={handleRunSeriesNextAction}
                  />

                  {activeSeriesSnapshot && (
                    <div
                      ref={(node) => {
                        seriesCardRefs.current[activeSeriesSnapshot.instance.id] = node;
                      }}
                    >
                      <SeriesWorkflowCard
                        instance={activeSeriesSnapshot.instance}
                        episodes={activeSeriesSnapshot.episodes}
                        assetCoverage={activeSeriesSnapshot.assetCoverage}
                        assetBatchTemplates={activeSeriesSnapshot.assetBatchTemplates}
                        suggestedAssetBatchTemplates={activeSeriesSnapshot.suggestedAssetBatchTemplates}
                        workflowOverview={activeSeriesSnapshot.workflowOverview}
                        isFocused
                        onAddEpisode={onAddEpisode}
                        onBulkAddEpisodes={onBulkAddEpisodes}
                        onUpdateSeriesSettings={onUpdateSeriesSettings}
                        onSelectEpisode={onSelectEpisode}
                        onMaterializeWorkflow={onMaterializeWorkflow}
                        onSyncAssetCoverage={onSyncAssetCoverage}
                        onBatchSyncAssetCoverage={onBatchSyncAssetCoverage}
                        onSaveSeriesAssetBatchTemplate={(name, assetIds, templateId, autoApplyToNewEpisodes) => onSaveSeriesAssetBatchTemplate(activeSeriesSnapshot.instance.id, name, assetIds, templateId, autoApplyToNewEpisodes)}
                        onSaveSeriesAssetBatchTemplates={(templates) => onSaveSeriesAssetBatchTemplates(activeSeriesSnapshot.instance.id, templates)}
                        onDeleteSeriesAssetBatchTemplate={(templateId) => onDeleteSeriesAssetBatchTemplate(activeSeriesSnapshot.instance.id, templateId)}
                        onFocusAssetCenter={() => assetCenterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      />
                    </div>
                  )}

                  {inactiveSeriesSnapshots.length > 0 && (
                    <section className="tianti-surface-muted rounded-[30px] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-white/45">其他系列工作流</div>
                          <div className="mt-2 text-sm leading-7 text-slate-300">
                            非焦点系列先收成轻量卡片，避免总览页被多套长流程淹没；需要时再切换展开。
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">共 {inactiveSeriesSnapshots.length} 套待切换系列</div>
                      </div>

                      <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        {inactiveSeriesSnapshots.map((snapshot) => (
                          <SeriesCompactCard
                            key={snapshot.instance.id}
                            instance={snapshot.instance}
                            workflowOverview={snapshot.workflowOverview}
                            onFocus={() => handleFocusSeries(snapshot.instance.id)}
                            onRunNextAction={() => handleRunSeriesNextAction(snapshot.instance.id)}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                <div className="xl:sticky xl:top-0 xl:h-fit">
                  <WorkflowWorkbenchPanel
                    activeEpisodeTitle={activeEpisode?.title}
                    stageProgressLabel={activeEpisodeStageProgressLabel}
                    bindingCount={activeEpisodeBindings.length}
                    continuityCount={activeEpisodeContinuity.length}
                    outputCount={activeEpisodeOutputStageCount}
                    tabs={[
                      {
                        key: 'stages',
                        label: '阶段',
                        count: activeEpisode ? Object.keys(activeEpisode.stageStates).length : 0,
                      },
                      {
                        key: 'bindings',
                        label: '绑定',
                        count: activeEpisodeBindings.length,
                      },
                      {
                        key: 'continuity',
                        label: '连续性',
                        count: activeEpisodeContinuity.length,
                      },
                      {
                        key: 'outputs',
                        label: '产出',
                        count: activeEpisodeOutputStageCount,
                      },
                    ]}
                    activeTab={activeWorkbenchTab}
                    onTabChange={setActiveWorkbenchTab}
                  >
                    {activeEpisode ? (
                      <div className="space-y-5">
                        {activeWorkbenchTab === 'stages' && (
                          <EpisodeStagePanel
                            episode={activeEpisode}
                            stageDefinitions={activeEpisodeStages}
                            compact
                            onUpdateStage={onUpdateStage}
                            onMaterializeWorkflow={onMaterializeWorkflow}
                          />
                        )}
                        {activeWorkbenchTab === 'bindings' && (
                          <EpisodeAssetBindingPanel
                            episode={activeEpisode}
                            assets={workflowState.assets}
                            bindings={activeEpisodeBindings}
                            compact
                            onBindAsset={onBindAsset}
                            onUnbindAsset={onUnbindAsset}
                          />
                        )}
                        {activeWorkbenchTab === 'continuity' && (
                          <ContinuityPanel
                            episodeId={activeEpisode.id}
                            assets={workflowState.assets}
                            bindings={activeEpisodeBindings}
                            continuityStates={activeEpisodeContinuity}
                            compact
                            onUpdateContinuity={onUpdateContinuity}
                          />
                        )}
                        {activeWorkbenchTab === 'outputs' && (
                          <EpisodeOutputsPanel
                            episode={activeEpisode}
                            stageDefinitions={activeEpisodeStages}
                            compact
                          />
                        )}
                      </div>
                    ) : undefined}
                  </WorkflowWorkbenchPanel>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

