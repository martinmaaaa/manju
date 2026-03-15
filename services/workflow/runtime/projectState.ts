import type {
  WorkflowInstance,
  WorkflowProjectState,
  WorkflowStageState,
  WorkflowTemplateDefinition,
  WorkflowTemplateId,
} from '../domain/types';
import { getWorkflowTemplate } from '../registry';

const DEFAULT_WORKFLOW_PROJECT_STATE: WorkflowProjectState = {
  version: 1,
  instances: [],
  activeSeriesId: null,
  activeEpisodeId: null,
};

function createStageStates(template: WorkflowTemplateDefinition): Record<string, WorkflowStageState> {
  return template.stages.reduce<Record<string, WorkflowStageState>>((accumulator, stage, index) => {
    accumulator[stage.id] = {
      stageId: stage.id,
      status: index === 0 ? 'in_progress' : 'not_started',
      formData: {},
      outputs: {},
      artifactIds: [],
    };
    return accumulator;
  }, {});
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function normalizeWorkflowProjectState(settings?: Record<string, unknown> | null): WorkflowProjectState {
  const rawState = settings?.workflowState;

  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return DEFAULT_WORKFLOW_PROJECT_STATE;
  }

  const candidate = rawState as Partial<WorkflowProjectState>;
  return {
    version: 1,
    instances: Array.isArray(candidate.instances) ? candidate.instances : [],
    activeSeriesId: typeof candidate.activeSeriesId === 'string' ? candidate.activeSeriesId : null,
    activeEpisodeId: typeof candidate.activeEpisodeId === 'string' ? candidate.activeEpisodeId : null,
  };
}

export function withWorkflowProjectState(
  settings: Record<string, unknown> | null | undefined,
  workflowState: WorkflowProjectState,
): Record<string, unknown> {
  return {
    ...(settings && typeof settings === 'object' ? settings : {}),
    workflowState,
  };
}

export function createWorkflowInstance(
  templateId: WorkflowTemplateId,
  title: string,
  overrides?: Partial<WorkflowInstance>,
): WorkflowInstance {
  const template = getWorkflowTemplate(templateId);
  const timestamp = new Date().toISOString();

  return {
    id: createId(template.scope),
    templateId: template.id,
    scope: template.scope,
    title,
    status: 'idle',
    currentStageId: template.stages[0]?.id,
    stageStates: createStageStates(template),
    artifactIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      canvasMaterializationTemplateId: template.canvasMaterializationTemplateId,
      plannedEpisodeCount: template.defaultEpisodeCount,
      assetSummary: {
        character: 0,
        scene: 0,
        prop: 0,
        style: 0,
      },
      ...overrides?.metadata,
    },
    ...overrides,
  };
}

export function appendWorkflowInstance(
  state: WorkflowProjectState,
  instance: WorkflowInstance,
): WorkflowProjectState {
  return {
    ...state,
    instances: [instance, ...state.instances],
  };
}

export function createEpisodeInstance(
  state: WorkflowProjectState,
  parentInstanceId: string,
): WorkflowInstance {
  const siblingCount = state.instances.filter(instance => instance.parentInstanceId === parentInstanceId).length;
  const episodeNumber = siblingCount + 1;

  return createWorkflowInstance(
    'manju-episode',
    `第 ${episodeNumber} 集`,
    {
      parentInstanceId,
      status: 'idle',
      metadata: {
        episodeNumber,
        canvasMaterializationTemplateId: 'short-drama-standard',
      },
    },
  );
}

export function getSeriesInstances(state: WorkflowProjectState): WorkflowInstance[] {
  return state.instances.filter(instance => instance.scope === 'series');
}

export function getEpisodeInstances(
  state: WorkflowProjectState,
  seriesInstanceId: string,
): WorkflowInstance[] {
  return state.instances
    .filter(instance => instance.parentInstanceId === seriesInstanceId)
    .sort((left, right) => (left.metadata?.episodeNumber ?? 0) - (right.metadata?.episodeNumber ?? 0));
}

export function countCompletedStages(instance: WorkflowInstance): number {
  return Object.values(instance.stageStates).filter(stage => stage.status === 'completed').length;
}
