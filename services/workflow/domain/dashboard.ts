export type WorkflowDashboardPhase =
  | 'empty'
  | 'asset_setup'
  | 'episode_planning'
  | 'in_production'
  | 'ready_for_canvas';

export interface WorkflowProjectDashboardTotals {
  workflowCount: number;
  seriesCount: number;
  episodeCount: number;
  plannedEpisodeCount: number;
  assetCount: number;
  assetVersionCount: number;
  bindingCount: number;
  continuityCount: number;
  scriptCompletedEpisodeCount: number;
  assetCompletedEpisodeCount: number;
  storyboardCompletedEpisodeCount: number;
  promptCompletedEpisodeCount: number;
  videoCompletedEpisodeCount: number;
}

export interface WorkflowProjectDashboardSeriesSummary {
  id: string;
  title: string;
  updatedAt: string;
  plannedEpisodeCount: number;
  createdEpisodeCount: number;
  seriesStageCount: number;
  seriesCompletedStageCount: number;
  coveredAssetCount: number;
  uncoveredAssetCount: number;
  scriptCompletedEpisodeCount: number;
  assetCompletedEpisodeCount: number;
  storyboardCompletedEpisodeCount: number;
  promptCompletedEpisodeCount: number;
  videoCompletedEpisodeCount: number;
}

export interface WorkflowProjectDashboardSummary {
  projectId: string;
  projectTitle: string;
  activeWorkflowId: string | null;
  activeWorkflowTitle: string | null;
  activeSeriesId: string | null;
  activeSeriesTitle: string | null;
  activeEpisodeId: string | null;
  activeEpisodeTitle: string | null;
  phase: WorkflowDashboardPhase;
  totals: WorkflowProjectDashboardTotals;
  series: WorkflowProjectDashboardSeriesSummary[];
}
