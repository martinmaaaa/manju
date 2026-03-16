import React, { useMemo } from 'react';
import { useRef } from 'react';
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
import { EpisodeWorkspace } from './panels/EpisodeWorkspace';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
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
  const assetCenterSeries = useMemo(() => (
    seriesInstances.find(instance => instance.id === workflowState.activeSeriesId) ?? seriesInstances[0] ?? null
  ), [seriesInstances, workflowState.activeSeriesId]);
  const assetCenterTemplates = assetCenterSeries?.metadata?.assetBatchTemplates ?? [];
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
              seriesInstances.map((seriesInstance) => (
                <SeriesWorkflowCard
                  key={seriesInstance.id}
                  instance={seriesInstance}
                  episodes={getEpisodeInstances(workflowState, seriesInstance.id)}
                  assetCoverage={getSeriesAssetCoverage(workflowState, seriesInstance.id)}
                  assetBatchTemplates={seriesInstance.metadata?.assetBatchTemplates ?? []}
                  suggestedAssetBatchTemplates={getSuggestedSeriesAssetBatchTemplates(workflowState, seriesInstance.id)}
                  workflowOverview={getSeriesWorkflowOverview(workflowState, seriesInstance.id)!}
                  onAddEpisode={onAddEpisode}
                  onBulkAddEpisodes={onBulkAddEpisodes}
                  onUpdateSeriesSettings={onUpdateSeriesSettings}
                  onSelectEpisode={onSelectEpisode}
                  onMaterializeWorkflow={onMaterializeWorkflow}
                  onSyncAssetCoverage={onSyncAssetCoverage}
                  onBatchSyncAssetCoverage={onBatchSyncAssetCoverage}
                  onSaveSeriesAssetBatchTemplate={(name, assetIds, templateId, autoApplyToNewEpisodes) => onSaveSeriesAssetBatchTemplate(seriesInstance.id, name, assetIds, templateId, autoApplyToNewEpisodes)}
                  onSaveSeriesAssetBatchTemplates={(templates) => onSaveSeriesAssetBatchTemplates(seriesInstance.id, templates)}
                  onDeleteSeriesAssetBatchTemplate={(templateId) => onDeleteSeriesAssetBatchTemplate(seriesInstance.id, templateId)}
                  onFocusAssetCenter={() => assetCenterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
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

