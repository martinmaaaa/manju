/**
 * API 服务统一导出
 */

export { apiRequest, isApiAvailable } from './client';
export type { ApiResponse } from './client';

export {
  getProjects,
  getProject,
  getProjectDashboard,
  getProjectWorkflowEntities,
  createProject,
  updateProject,
  deleteProject,
  saveProjectSnapshot,
} from './projectApi';
export type {
  ProjectSummary,
  ProjectDetail,
  SnapshotPayload,
  WorkflowEpisodeRecord,
  WorkflowProjectEntities,
} from './projectApi';

export { createNode, updateNode, batchUpdateNodes, deleteNode } from './nodeApi';

export { createConnection, deleteConnection } from './connectionApi';

export {
  createEpisodeAssetBinding,
  createEpisodeShot,
  createShotOutput,
  deleteEpisodeAssetBinding,
  deleteWorkflowShot,
  getEpisodeWorkspace,
  listEpisodeShots,
  listShotOutputs,
  listWorkflowStageRuns,
  selectShotOutput,
  updateEpisodeAssetBinding,
  updateWorkflowShot,
  updateWorkflowStageRun,
} from './workspaceApi';
export type {
  EpisodeAssetBindingMutation,
  EpisodeWorkspaceData,
  WorkflowShotMutation,
  WorkflowShotOutputMutation,
  WorkflowStageRunMutation,
} from './workspaceApi';

export {
  cancelGenerationJob,
  createGenerationJob,
  getGenerationJob,
  listGenerationJobs,
  listProjectGenerationJobs,
  requeueGenerationJob,
  retryGenerationJob,
  updateGenerationJob,
} from './generationJobApi';
export type { GenerationJob, GenerationJobMutation, GenerationJobQuery } from './generationJobApi';
