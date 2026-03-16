import type { WorkflowDashboardPhase, WorkflowProjectDashboardSeriesSummary, WorkflowProjectDashboardSummary } from '../domain/dashboard';
import type { WorkflowInstance, WorkflowProjectState } from '../domain/types';
import { normalizeWorkflowProjectState } from './projectState';

const EMPTY_TOTALS: WorkflowProjectDashboardSummary['totals'] = {
  workflowCount: 0,
  seriesCount: 0,
  episodeCount: 0,
  plannedEpisodeCount: 0,
  assetCount: 0,
  assetVersionCount: 0,
  bindingCount: 0,
  continuityCount: 0,
  scriptCompletedEpisodeCount: 0,
  assetCompletedEpisodeCount: 0,
  storyboardCompletedEpisodeCount: 0,
  promptCompletedEpisodeCount: 0,
  videoCompletedEpisodeCount: 0,
};

function countCompletedStages(instance: WorkflowInstance): number {
  return Object.values(instance.stageStates).filter(stage => stage?.status === 'completed').length;
}

function getEpisodeInstances(
  workflowState: WorkflowProjectState,
  seriesInstanceId: string,
): WorkflowInstance[] {
  return workflowState.instances
    .filter(instance => instance.parentInstanceId === seriesInstanceId)
    .sort((left, right) => (left.metadata?.episodeNumber ?? 0) - (right.metadata?.episodeNumber ?? 0));
}

function getSeriesAssetCoverageSummary(
  workflowState: WorkflowProjectState,
  seriesInstanceId: string,
  plannedEpisodeCount: number,
): Pick<WorkflowProjectDashboardSeriesSummary, 'coveredAssetCount' | 'uncoveredAssetCount'> {
  const episodes = getEpisodeInstances(workflowState, seriesInstanceId);
  const episodeIds = new Set(episodes.map(episode => episode.id));
  const denominator = plannedEpisodeCount > 0 ? plannedEpisodeCount : episodes.length;
  const relevantBindings = workflowState.assetBindings.filter(binding => episodeIds.has(binding.workflowInstanceId));

  let coveredAssetCount = 0;
  let uncoveredAssetCount = 0;

  workflowState.assets.forEach((asset) => {
    const boundCount = relevantBindings.filter(binding => binding.assetId === asset.id).length;

    if (boundCount > 0) {
      coveredAssetCount += 1;
    }

    if (Math.max(denominator - boundCount, 0) > 0) {
      uncoveredAssetCount += 1;
    }
  });

  return {
    coveredAssetCount,
    uncoveredAssetCount,
  };
}

function buildSeriesSummary(
  workflowState: WorkflowProjectState,
  seriesInstance: WorkflowInstance,
): WorkflowProjectDashboardSeriesSummary {
  const episodes = getEpisodeInstances(workflowState, seriesInstance.id);
  const plannedEpisodeCount = seriesInstance.metadata?.plannedEpisodeCount ?? episodes.length;
  const coverageSummary = getSeriesAssetCoverageSummary(workflowState, seriesInstance.id, plannedEpisodeCount);

  return {
    id: seriesInstance.id,
    title: seriesInstance.title,
    updatedAt: seriesInstance.updatedAt,
    plannedEpisodeCount,
    createdEpisodeCount: episodes.length,
    seriesStageCount: Object.keys(seriesInstance.stageStates).length,
    seriesCompletedStageCount: countCompletedStages(seriesInstance),
    coveredAssetCount: coverageSummary.coveredAssetCount,
    uncoveredAssetCount: coverageSummary.uncoveredAssetCount,
    scriptCompletedEpisodeCount: episodes.filter(episode => episode.stageStates['episode-script']?.status === 'completed').length,
    assetCompletedEpisodeCount: episodes.filter(episode => episode.stageStates['episode-assets']?.status === 'completed').length,
    storyboardCompletedEpisodeCount: episodes.filter(episode => episode.stageStates.storyboard?.status === 'completed').length,
    promptCompletedEpisodeCount: episodes.filter(episode => episode.stageStates.prompt?.status === 'completed').length,
    videoCompletedEpisodeCount: episodes.filter(episode => episode.stageStates.video?.status === 'completed').length,
  };
}

function resolveDashboardPhase(
  workflowState: WorkflowProjectState,
  totals: WorkflowProjectDashboardSummary['totals'],
  rootWorkflows: WorkflowInstance[],
): WorkflowDashboardPhase {
  if (totals.workflowCount === 0) {
    return 'empty';
  }

  if (totals.seriesCount === 0) {
    const allStandaloneCompleted = rootWorkflows.every(
      workflow => countCompletedStages(workflow) >= Object.keys(workflow.stageStates).length,
    );
    return allStandaloneCompleted ? 'ready_for_canvas' : 'in_production';
  }

  if (workflowState.assets.length === 0) {
    return 'asset_setup';
  }

  if (totals.episodeCount === 0 || totals.plannedEpisodeCount > totals.episodeCount) {
    return 'episode_planning';
  }

  if (totals.videoCompletedEpisodeCount < totals.episodeCount) {
    return 'in_production';
  }

  return 'ready_for_canvas';
}

export function buildWorkflowProjectDashboardSummary(project: {
  id: string;
  title: string;
  settings?: Record<string, unknown> | null;
  workflow_state?: WorkflowProjectState;
}): WorkflowProjectDashboardSummary {
  const workflowState = project.workflow_state ?? normalizeWorkflowProjectState(project.settings ?? null);
  const rootWorkflows = workflowState.instances.filter(instance => !instance.parentInstanceId);
  const seriesInstances = rootWorkflows
    .filter(instance => instance.scope === 'series')
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const series = seriesInstances.map(instance => buildSeriesSummary(workflowState, instance));
  const activeSeries = seriesInstances.find(instance => instance.id === workflowState.activeSeriesId) ?? seriesInstances[0] ?? null;
  const activeWorkflow = activeSeries ?? rootWorkflows[0] ?? null;
  const activeEpisode = workflowState.activeEpisodeId
    ? workflowState.instances.find(instance => instance.id === workflowState.activeEpisodeId) ?? null
    : (activeSeries ? getEpisodeInstances(workflowState, activeSeries.id)[0] ?? null : null);
  const totals = series.reduce<WorkflowProjectDashboardSummary['totals']>((accumulator, seriesSummary) => ({
    ...accumulator,
    plannedEpisodeCount: accumulator.plannedEpisodeCount + seriesSummary.plannedEpisodeCount,
    episodeCount: accumulator.episodeCount + seriesSummary.createdEpisodeCount,
    scriptCompletedEpisodeCount: accumulator.scriptCompletedEpisodeCount + seriesSummary.scriptCompletedEpisodeCount,
    assetCompletedEpisodeCount: accumulator.assetCompletedEpisodeCount + seriesSummary.assetCompletedEpisodeCount,
    storyboardCompletedEpisodeCount: accumulator.storyboardCompletedEpisodeCount + seriesSummary.storyboardCompletedEpisodeCount,
    promptCompletedEpisodeCount: accumulator.promptCompletedEpisodeCount + seriesSummary.promptCompletedEpisodeCount,
    videoCompletedEpisodeCount: accumulator.videoCompletedEpisodeCount + seriesSummary.videoCompletedEpisodeCount,
  }), {
    ...EMPTY_TOTALS,
    workflowCount: rootWorkflows.length,
    seriesCount: series.length,
    assetCount: workflowState.assets.length,
    assetVersionCount: workflowState.assetVersions.length,
    bindingCount: workflowState.assetBindings.length,
    continuityCount: workflowState.continuityStates.length,
  });

  return {
    projectId: project.id,
    projectTitle: project.title,
    activeWorkflowId: activeWorkflow?.id ?? null,
    activeWorkflowTitle: activeWorkflow?.title ?? null,
    activeSeriesId: activeSeries?.id ?? null,
    activeSeriesTitle: activeSeries?.title ?? null,
    activeEpisodeId: activeEpisode?.id ?? null,
    activeEpisodeTitle: activeEpisode?.title ?? null,
    phase: resolveDashboardPhase(workflowState, totals, rootWorkflows),
    totals,
    series,
  };
}
