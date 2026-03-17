import React, { useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Layers3,
  Settings,
} from 'lucide-react';
import type {
  ContinuityState,
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
  getEpisodeInstances,
  getSeriesInstances,
  getSeriesWorkflowOverview,
} from '../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../services/workflow/registry';
import { EpisodeStagePanel } from './panels/EpisodeStagePanel';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import { SeriesCompactCard } from './SeriesCompactCard';
import { WorkflowOverviewCenter } from './WorkflowOverviewCenter';
import { WorkflowWorkbenchPanel } from './WorkflowWorkbenchPanel';
import { WorkflowCenterSidebar } from './WorkflowCenterSidebar';
import { SeriesWorkflowCard } from './SeriesWorkflowCard';
import type { AppView } from '../../stores/ui.store';

type ProjectWorkspaceView = Extract<AppView, 'pipeline' | 'assets' | 'episodes' | 'jobs' | 'workspace' | 'canvas'>;

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
  const seriesCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollSeriesIdRef = useRef<string | null>(null);
  const seriesSnapshots = useMemo(() => seriesInstances.map((seriesInstance) => {
    const episodes = getEpisodeInstances(workflowState, seriesInstance.id);
    const workflowOverview = getSeriesWorkflowOverview(workflowState, seriesInstance.id);

    return workflowOverview
      ? {
        instance: seriesInstance,
        episodes,
        workflowOverview,
      }
      : null;
  }).filter((snapshot): snapshot is {
    instance: WorkflowInstance;
    episodes: WorkflowInstance[];
    workflowOverview: WorkflowSeriesOverview;
  } => Boolean(snapshot)), [seriesInstances, workflowState]);
  const activeSeriesSnapshot = useMemo(() => (
    seriesSnapshots.find(snapshot => snapshot.instance.id === workflowState.activeSeriesId) ?? seriesSnapshots[0] ?? null
  ), [seriesSnapshots, workflowState.activeSeriesId]);

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
  const scriptCompletedEpisodeCount = useMemo(() => (
    seriesSnapshots.reduce(
      (sum, snapshot) => sum + snapshot.workflowOverview.scriptCompletedEpisodeCount,
      0,
    )
  ), [seriesSnapshots]);
  const inactiveSeriesSnapshots = useMemo(() => (
    seriesSnapshots.filter(snapshot => snapshot.instance.id !== activeSeriesSnapshot?.instance.id)
  ), [activeSeriesSnapshot, seriesSnapshots]);
  const activeEpisodeStageProgressLabel = activeEpisode
    ? `阶段 ${Object.values(activeEpisode.stageStates).filter(stage => stage.status === 'completed').length}/${Object.keys(activeEpisode.stageStates).length}`
    : undefined;

  const activeEpisodeStages: WorkflowStageDefinition[] = activeEpisode
    ? getWorkflowTemplate(activeEpisode.templateId).stages
    : [];

  void onCreateAsset;
  void onCreateAssetVersion;
  void onBindAsset;
  void onSyncAssetCoverage;
  void onBatchSyncAssetCoverage;
  void onSaveSeriesAssetBatchTemplate;
  void onSaveSeriesAssetBatchTemplates;
  void onDeleteSeriesAssetBatchTemplate;
  void onUnbindAsset;
  void onUpdateContinuity;

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
            onCreateWorkflow={onCreateWorkflow}
          />

          <main className="flex h-full flex-col gap-6 overflow-y-auto pr-2">
            {seriesInstances.length === 0 ? (
              <section className="flex min-h-[320px] items-center justify-center rounded-[32px] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
                    <Layers3 className="h-8 w-8" />
                  </div>
                  <h2 className="mt-6 text-2xl font-semibold">先创建一个系列工作流</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-300">从系列开始，先把剧本与分集规划走通。</p>
                </div>
              </section>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="space-y-6">
                  <WorkflowOverviewCenter
                    projectTitle={projectTitle}
                    totalSeriesCount={seriesSnapshots.length}
                    totalPlannedEpisodeCount={totalPlannedEpisodeCount}
                    totalCreatedEpisodeCount={totalCreatedEpisodeCount}
                    scriptCompletedEpisodeCount={scriptCompletedEpisodeCount}
                    activeSeriesTitle={activeSeriesSnapshot?.instance.title}
                    activeEpisodeTitle={activeEpisode?.title}
                    seriesItems={seriesSnapshots.map((snapshot) => ({
                      id: snapshot.instance.id,
                      title: snapshot.instance.title,
                      updatedAt: snapshot.instance.updatedAt,
                      isActive: snapshot.instance.id === activeSeriesSnapshot?.instance.id,
                      overview: snapshot.workflowOverview,
                    }))}
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
                        workflowOverview={activeSeriesSnapshot.workflowOverview}
                        isFocused
                        onAddEpisode={onAddEpisode}
                        onBulkAddEpisodes={onBulkAddEpisodes}
                        onUpdateSeriesSettings={onUpdateSeriesSettings}
                        onSelectEpisode={onSelectEpisode}
                        onMaterializeWorkflow={onMaterializeWorkflow}
                      />
                    </div>
                  )}

                  {inactiveSeriesSnapshots.length > 0 && (
                    <section className="tianti-surface-muted rounded-[30px] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-white/45">其他系列工作流</div>
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
                    tabs={[
                      {
                        key: 'stages',
                        label: '阶段',
                        count: activeEpisode ? Object.keys(activeEpisode.stageStates).length : 0,
                      },
                    ]}
                    activeTab="stages"
                  >
                    {activeEpisode ? (
                      <EpisodeStagePanel
                        episode={activeEpisode}
                        stageDefinitions={activeEpisodeStages}
                        compact
                        onUpdateStage={onUpdateStage}
                        onMaterializeWorkflow={onMaterializeWorkflow}
                      />
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

