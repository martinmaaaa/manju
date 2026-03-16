import type {
  ContinuityState,
  EpisodeAssetBinding,
  WorkflowAsset,
  WorkflowAssetType,
  WorkflowBindingMode,
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
  assets: [],
  assetVersions: [],
  assetBindings: [],
  continuityStates: [],
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

function updateBindingsForLatestVersion(
  state: WorkflowProjectState,
  assetId: string,
  versionId: string,
): EpisodeAssetBinding[] {
  return state.assetBindings.map(binding => (
    binding.assetId === assetId && binding.mode === 'follow_latest'
      ? { ...binding, versionId }
      : binding
  ));
}

function syncEpisodeBindingOutputs(
  state: WorkflowProjectState,
  workflowInstanceId: string,
): WorkflowProjectState {
  const boundAssetIds = state.assetBindings
    .filter(binding => binding.workflowInstanceId === workflowInstanceId)
    .map(binding => binding.assetId);

  return {
    ...state,
    instances: state.instances.map(instance => instance.id === workflowInstanceId
      ? {
          ...instance,
          updatedAt: new Date().toISOString(),
          stageStates: {
            ...instance.stageStates,
            'episode-assets': instance.stageStates['episode-assets']
              ? {
                  ...instance.stageStates['episode-assets'],
                  status: boundAssetIds.length > 0 ? 'in_progress' : instance.stageStates['episode-assets'].status,
                  outputs: {
                    ...instance.stageStates['episode-assets'].outputs,
                    boundAssetIds,
                  },
                }
              : instance.stageStates['episode-assets'],
          },
        }
      : instance),
  };
}

function getNextStageId(instance: WorkflowInstance, stageId: string): string | undefined {
  const stageIds = Object.keys(instance.stageStates);
  const currentIndex = stageIds.indexOf(stageId);
  if (currentIndex === -1) return undefined;
  return stageIds[currentIndex + 1];
}

function getPreferredBindingMode(instance?: WorkflowInstance): WorkflowBindingMode {
  return instance?.metadata?.preferredBindingMode === 'pinned' ? 'pinned' : 'follow_latest';
}

function bootstrapEpisodeStageStates(
  stageStates: Record<string, WorkflowStageState>,
  bindingMode: WorkflowBindingMode,
  episodeNumber: number,
): Record<string, WorkflowStageState> {
  return {
    ...stageStates,
    'episode-script': stageStates['episode-script']
      ? {
          ...stageStates['episode-script'],
          formData: {
            templateId: 'manju-standard-script',
            templateLabel: '漫剧单集标准模板',
            beatTemplate: ['hook', 'conflict', 'twist', 'cliffhanger'],
            episodeNumber,
            ...stageStates['episode-script'].formData,
          },
        }
      : stageStates['episode-script'],
    'episode-assets': stageStates['episode-assets']
      ? {
          ...stageStates['episode-assets'],
          formData: {
            templateId: 'series-reuse-assets',
            templateLabel: '系列资产复用模板',
            defaultBindingMode: bindingMode,
            requiredAssetTypes: ['character', 'scene', 'prop', 'style'],
            ...stageStates['episode-assets'].formData,
          },
        }
      : stageStates['episode-assets'],
    storyboard: stageStates.storyboard
      ? {
          ...stageStates.storyboard,
          formData: {
            templateId: 'manju-standard-storyboard',
            templateLabel: '短漫分镜模板',
            panelTarget: 12,
            ...stageStates.storyboard.formData,
          },
        }
      : stageStates.storyboard,
    prompt: stageStates.prompt
      ? {
          ...stageStates.prompt,
          formData: {
            templateId: 'manju-standard-prompt-pack',
            templateLabel: '系列统一提示词包',
            ...stageStates.prompt.formData,
          },
        }
      : stageStates.prompt,
    video: stageStates.video
      ? {
          ...stageStates.video,
          formData: {
            templateId: 'manju-standard-video-delivery',
            templateLabel: '标准视频投放模板',
            targetPlatform: 'jimeng',
            ...stageStates.video.formData,
          },
        }
      : stageStates.video,
  };
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
    assets: Array.isArray(candidate.assets) ? candidate.assets : [],
    assetVersions: Array.isArray(candidate.assetVersions) ? candidate.assetVersions : [],
    assetBindings: Array.isArray(candidate.assetBindings) ? candidate.assetBindings : [],
    continuityStates: Array.isArray(candidate.continuityStates) ? candidate.continuityStates : [],
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

export function createEpisodeInstance(
  state: WorkflowProjectState,
  parentInstanceId: string,
): WorkflowInstance {
  const siblingCount = state.instances.filter(instance => instance.parentInstanceId === parentInstanceId).length;
  const episodeNumber = siblingCount + 1;
  const parentSeries = state.instances.find(instance => instance.id === parentInstanceId);
  const preferredBindingMode = getPreferredBindingMode(parentSeries);
  const episode = createWorkflowInstance('manju-episode', `第 ${episodeNumber} 集`, {
    parentInstanceId,
    status: 'idle',
    metadata: {
      episodeNumber,
      canvasMaterializationTemplateId: 'short-drama-standard',
      preferredBindingMode,
    },
  });

  return {
    ...episode,
    stageStates: bootstrapEpisodeStageStates(episode.stageStates, preferredBindingMode, episodeNumber),
  };
}

export function createEpisodeInstances(
  state: WorkflowProjectState,
  parentInstanceId: string,
  count: number,
): WorkflowInstance[] {
  const safeCount = Math.max(0, Math.floor(count));
  const episodes: WorkflowInstance[] = [];
  let draftState = state;

  for (let index = 0; index < safeCount; index += 1) {
    const episode = createEpisodeInstance(draftState, parentInstanceId);
    episodes.push(episode);
    draftState = {
      ...draftState,
      instances: [episode, ...draftState.instances],
    };
  }

  return episodes;
}

export function updateSeriesWorkflowSettings(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  patch: {
    plannedEpisodeCount?: number;
    preferredBindingMode?: WorkflowBindingMode;
  },
): WorkflowProjectState {
  const timestamp = new Date().toISOString();

  return {
    ...state,
    instances: state.instances.map(instance => {
      if (instance.id === seriesInstanceId) {
        return {
          ...instance,
          updatedAt: timestamp,
          metadata: {
            ...instance.metadata,
            ...(patch.plannedEpisodeCount !== undefined ? { plannedEpisodeCount: patch.plannedEpisodeCount } : {}),
            ...(patch.preferredBindingMode ? { preferredBindingMode: patch.preferredBindingMode } : {}),
          },
        };
      }

      if (instance.parentInstanceId === seriesInstanceId) {
        return {
          ...instance,
          updatedAt: timestamp,
          metadata: {
            ...instance.metadata,
            ...(patch.preferredBindingMode ? { preferredBindingMode: patch.preferredBindingMode } : {}),
          },
          stageStates: patch.preferredBindingMode
            ? {
                ...instance.stageStates,
                'episode-assets': instance.stageStates['episode-assets']
                  ? {
                      ...instance.stageStates['episode-assets'],
                      formData: {
                        ...instance.stageStates['episode-assets'].formData,
                        defaultBindingMode: patch.preferredBindingMode,
                      },
                    }
                  : instance.stageStates['episode-assets'],
              }
            : instance.stageStates,
        };
      }

      return instance;
    }),
  };
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

export function getSeriesAssetCoverage(
  state: WorkflowProjectState,
  seriesInstanceId: string,
) {
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  const episodes = getEpisodeInstances(state, seriesInstanceId);
  const episodeIds = new Set(episodes.map(episode => episode.id));
  const plannedEpisodeCount = series?.metadata?.plannedEpisodeCount ?? episodes.length;
  const relevantBindings = state.assetBindings.filter(binding => episodeIds.has(binding.workflowInstanceId));

  return state.assets
    .map((asset) => {
      const episodeBindings = relevantBindings
        .filter(binding => binding.assetId === asset.id)
        .map((binding) => {
          const episode = episodes.find(item => item.id === binding.workflowInstanceId);

          return episode ? {
            episodeId: episode.id,
            episodeNumber: episode.metadata?.episodeNumber ?? 0,
            episodeTitle: episode.title,
            mode: binding.mode,
            versionId: binding.versionId,
          } : null;
        })
        .filter(Boolean)
        .sort((left, right) => (left!.episodeNumber - right!.episodeNumber)) as Array<{
          episodeId: string;
          episodeNumber: number;
          episodeTitle: string;
          mode: WorkflowBindingMode;
          versionId: string;
        }>;

      const boundEpisodeNumbers = episodeBindings.map(binding => binding.episodeNumber);
      const denominator = plannedEpisodeCount > 0 ? plannedEpisodeCount : episodes.length;

      return {
        asset,
        episodes: episodeBindings,
        boundEpisodeNumbers,
        boundCount: episodeBindings.length,
        missingCount: Math.max(denominator - episodeBindings.length, 0),
        plannedEpisodeCount,
        existingEpisodeCount: episodes.length,
        coverageRate: denominator > 0 ? episodeBindings.length / denominator : 0,
      };
    })
    .sort((left, right) => {
      if (left.asset.type !== right.asset.type) {
        return left.asset.type.localeCompare(right.asset.type);
      }

      return left.asset.name.localeCompare(right.asset.name, 'zh-CN');
    });
}

export function countCompletedStages(instance: WorkflowInstance): number {
  return Object.values(instance.stageStates).filter(stage => stage.status === 'completed').length;
}

export function createWorkflowAsset(
  projectId: string,
  type: WorkflowAssetType,
  name: string,
  tags: string[] = [],
): { asset: WorkflowAsset; versionId: string } {
  const timestamp = new Date().toISOString();
  const assetId = createId(type);
  const versionId = createId(`${type}-version`);

  return {
    asset: {
      id: assetId,
      projectId,
      type,
      name,
      currentVersionId: versionId,
      tags,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    versionId,
  };
}

export function appendWorkflowAsset(
  state: WorkflowProjectState,
  projectId: string,
  type: WorkflowAssetType,
  name: string,
  tags: string[] = [],
): WorkflowProjectState {
  const { asset, versionId } = createWorkflowAsset(projectId, type, name, tags);
  const timestamp = asset.createdAt;
  const assets = [asset, ...state.assets];

  return {
    ...state,
    assets,
    assetVersions: [
      {
        id: versionId,
        assetId: asset.id,
        version: 1,
        files: [],
        promptPack: {},
        metadata: {},
        createdAt: timestamp,
      },
      ...state.assetVersions,
    ],
    instances: state.instances.map(instance => instance.scope === 'series'
      ? {
          ...instance,
          updatedAt: timestamp,
          metadata: {
            ...instance.metadata,
            assetSummary: getAssetSummaryForState({ assets }),
          },
        }
      : instance),
  };
}

export function appendWorkflowAssetVersion(
  state: WorkflowProjectState,
  assetId: string,
  notes?: string,
): WorkflowProjectState {
  const asset = state.assets.find(item => item.id === assetId);
  if (!asset) return state;

  const currentVersions = state.assetVersions.filter(version => version.assetId === assetId);
  const nextVersionNumber = currentVersions.length > 0
    ? Math.max(...currentVersions.map(version => version.version)) + 1
    : 1;
  const versionId = createId(`${asset.type}-version`);
  const timestamp = new Date().toISOString();
  const assetVersions = [
    {
      id: versionId,
      assetId,
      version: nextVersionNumber,
      files: [],
      promptPack: {},
      metadata: notes ? { notes } : {},
      createdAt: timestamp,
    },
    ...state.assetVersions,
  ];

  const assets = state.assets.map(item => item.id === assetId
    ? { ...item, currentVersionId: versionId, updatedAt: timestamp }
    : item);

  return {
    ...state,
    assets,
    assetVersions,
    assetBindings: updateBindingsForLatestVersion(state, assetId, versionId),
    instances: state.instances.map(instance => instance.scope === 'series'
      ? {
          ...instance,
          updatedAt: timestamp,
          metadata: {
            ...instance.metadata,
            assetSummary: getAssetSummaryForState({ assets }),
          },
        }
      : instance),
  };
}

export function createEpisodeAssetBinding(
  workflowInstanceId: string,
  assetId: string,
  versionId: string,
  mode: WorkflowBindingMode = 'follow_latest',
): EpisodeAssetBinding {
  return {
    id: createId('binding'),
    workflowInstanceId,
    assetId,
    versionId,
    mode,
    createdAt: new Date().toISOString(),
  };
}

export function bindAssetToEpisode(
  state: WorkflowProjectState,
  workflowInstanceId: string,
  assetId: string,
  mode: WorkflowBindingMode = 'follow_latest',
): WorkflowProjectState {
  const asset = state.assets.find(item => item.id === assetId);
  if (!asset || !asset.currentVersionId) return state;

  const existing = state.assetBindings.find(binding => binding.workflowInstanceId === workflowInstanceId && binding.assetId === assetId);
  const nextBindings = existing
    ? state.assetBindings.map(binding => binding.id === existing.id
      ? { ...binding, versionId: asset.currentVersionId!, mode }
      : binding)
    : [createEpisodeAssetBinding(workflowInstanceId, assetId, asset.currentVersionId, mode), ...state.assetBindings];

  return syncEpisodeBindingOutputs({
    ...state,
    assetBindings: nextBindings,
  }, workflowInstanceId);
}

export function unbindAssetFromEpisode(
  state: WorkflowProjectState,
  bindingId: string,
): WorkflowProjectState {
  const target = state.assetBindings.find(binding => binding.id === bindingId);
  if (!target) return state;

  return syncEpisodeBindingOutputs({
    ...state,
    assetBindings: state.assetBindings.filter(binding => binding.id !== bindingId),
  }, target.workflowInstanceId);
}

export function setActiveEpisode(
  state: WorkflowProjectState,
  episodeId: string | null,
): WorkflowProjectState {
  const episode = episodeId ? state.instances.find(instance => instance.id === episodeId) : null;

  return {
    ...state,
    activeEpisodeId: episodeId,
    activeSeriesId: episode?.parentInstanceId ?? state.activeSeriesId,
  };
}

export function updateWorkflowStageState(
  state: WorkflowProjectState,
  workflowInstanceId: string,
  stageId: string,
  patch: Partial<WorkflowStageState>,
): WorkflowProjectState {
  return {
    ...state,
    instances: state.instances.map(instance => {
      if (instance.id !== workflowInstanceId) return instance;

      const currentStage = instance.stageStates[stageId];
      if (!currentStage) return instance;

      return {
        ...instance,
        updatedAt: new Date().toISOString(),
        currentStageId: patch.status === 'completed'
          ? getNextStageId(instance, stageId) ?? instance.currentStageId
          : instance.currentStageId,
        stageStates: {
          ...instance.stageStates,
          [stageId]: {
            ...currentStage,
            ...patch,
            formData: {
              ...currentStage.formData,
              ...(patch.formData ?? {}),
            },
            outputs: {
              ...currentStage.outputs,
              ...(patch.outputs ?? {}),
            },
          },
        },
      };
    }),
  };
}

export function upsertContinuityState(
  state: WorkflowProjectState,
  workflowInstanceId: string,
  subjectType: ContinuityState['subjectType'],
  subjectId: string,
  patch: Record<string, unknown>,
): WorkflowProjectState {
  const existing = state.continuityStates.find(item =>
    item.workflowInstanceId === workflowInstanceId &&
    item.subjectType === subjectType &&
    item.subjectId === subjectId,
  );
  const timestamp = new Date().toISOString();

  const continuityStates = existing
    ? state.continuityStates.map(item => item.id === existing.id
      ? {
          ...item,
          state: {
            ...item.state,
            ...patch,
          },
          updatedAt: timestamp,
        }
      : item)
    : [
        {
          id: createId('continuity'),
          workflowInstanceId,
          subjectType,
          subjectId,
          state: patch,
          updatedAt: timestamp,
        },
        ...state.continuityStates,
      ];

  return {
    ...state,
    continuityStates,
    instances: state.instances.map(instance => instance.id === workflowInstanceId
      ? { ...instance, updatedAt: timestamp }
      : instance),
  };
}

export function getEpisodeContinuityStates(
  state: WorkflowProjectState,
  workflowInstanceId: string,
): ContinuityState[] {
  return state.continuityStates.filter(item => item.workflowInstanceId === workflowInstanceId);
}

export function getEpisodeBindings(
  state: WorkflowProjectState,
  workflowInstanceId: string,
): EpisodeAssetBinding[] {
  return state.assetBindings.filter(binding => binding.workflowInstanceId === workflowInstanceId);
}

export function getAssetSummaryForState(state: Pick<WorkflowProjectState, 'assets'>) {
  return state.assets.reduce((summary, asset) => {
    summary[asset.type] += 1;
    return summary;
  }, {
    character: 0,
    scene: 0,
    prop: 0,
    style: 0,
  });
}

export function getAssetVersions(
  state: WorkflowProjectState,
  assetId: string,
) {
  return state.assetVersions
    .filter(version => version.assetId === assetId)
    .sort((left, right) => right.version - left.version);
}
