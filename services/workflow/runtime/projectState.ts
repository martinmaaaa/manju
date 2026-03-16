import type {
  ContinuityState,
  EpisodeAssetBinding,
  WorkflowAsset,
  WorkflowAssetBatchTemplate,
  WorkflowAssetBatchTemplateSuggestion,
  WorkflowAssetBatchTemplateTarget,
  WorkflowAssetType,
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowProjectState,
  WorkflowSeriesNextAction,
  WorkflowSeriesOverview,
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

function includesKeyword(source: string, keywords: string[]): boolean {
  const normalized = source.trim().toLowerCase();
  return keywords.some(keyword => normalized.includes(keyword.toLowerCase()));
}

function matchesAnyKeyword(tags: string[], keywords: string[]): boolean {
  return tags.some(tag => includesKeyword(tag, keywords));
}

function areSameAssetSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every((assetId, index) => assetId === normalizedRight[index]);
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
    instances: Array.isArray(candidate.instances)
      ? candidate.instances.map(instance => ({
          ...instance,
          metadata: instance.metadata
            ? {
                ...instance.metadata,
                assetBatchTemplates: Array.isArray(instance.metadata.assetBatchTemplates)
                  ? instance.metadata.assetBatchTemplates.map(template => ({
                      ...template,
                      autoApplyToNewEpisodes: Boolean(template.autoApplyToNewEpisodes),
                    }))
                  : [],
              }
            : instance.metadata,
        }))
      : [],
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
      assetBatchTemplates: [],
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

function touchSeriesInstance(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  timestamp: string,
): WorkflowProjectState {
  return {
    ...state,
    instances: state.instances.map(instance => (
      instance.id === seriesInstanceId
        ? { ...instance, updatedAt: timestamp }
        : instance
    )),
  };
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

export function upsertSeriesAssetBatchTemplate(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  template: {
    id?: string;
    name: string;
    assetIds: string[];
    autoApplyToNewEpisodes?: boolean;
  },
): WorkflowProjectState {
  const name = template.name.trim();
  const availableAssetIds = new Set(state.assets.map(asset => asset.id));
  const assetIds = Array.from(new Set(template.assetIds)).filter(assetId => availableAssetIds.has(assetId));
  if (!name || assetIds.length === 0) return state;

  const timestamp = new Date().toISOString();

  return {
    ...state,
    instances: state.instances.map(instance => {
      if (instance.id !== seriesInstanceId) {
        return instance;
      }

      const currentTemplates = instance.metadata?.assetBatchTemplates ?? [];
      const targetTemplateId = template.id
        ?? currentTemplates.find(item => item.name.trim() === name)?.id;
      const existingTemplate = targetTemplateId
        ? currentTemplates.find(item => item.id === targetTemplateId)
        : null;
      const nextTemplate: WorkflowAssetBatchTemplate = targetTemplateId
        ? {
            id: targetTemplateId,
            name,
            assetIds,
            autoApplyToNewEpisodes: template.autoApplyToNewEpisodes ?? existingTemplate?.autoApplyToNewEpisodes ?? false,
            createdAt: existingTemplate?.createdAt ?? timestamp,
            updatedAt: timestamp,
          }
        : {
            id: createId('asset-batch'),
            name,
            assetIds,
            autoApplyToNewEpisodes: template.autoApplyToNewEpisodes ?? false,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      const hasExistingTemplate = targetTemplateId
        ? currentTemplates.some(item => item.id === targetTemplateId)
        : false;

      const nextTemplates = targetTemplateId
        ? hasExistingTemplate
          ? currentTemplates.map(item => item.id === targetTemplateId ? nextTemplate : item)
          : [nextTemplate, ...currentTemplates]
        : [nextTemplate, ...currentTemplates];

      return {
        ...instance,
        updatedAt: timestamp,
        metadata: {
          ...instance.metadata,
          assetBatchTemplates: nextTemplates,
        },
      };
    }),
  };
}

export function upsertSeriesAssetBatchTemplates(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  templates: Array<{
    id?: string;
    name: string;
    assetIds: string[];
    autoApplyToNewEpisodes?: boolean;
  }>,
): WorkflowProjectState {
  if (templates.length === 0) return state;

  return templates.reduce((draftState, template) => (
    upsertSeriesAssetBatchTemplate(draftState, seriesInstanceId, template)
  ), state);
}

export function removeSeriesAssetBatchTemplate(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  templateId: string,
): WorkflowProjectState {
  const timestamp = new Date().toISOString();

  return {
    ...state,
    instances: state.instances.map(instance => {
      if (instance.id !== seriesInstanceId) {
        return instance;
      }

      return {
        ...instance,
        updatedAt: timestamp,
        metadata: {
          ...instance.metadata,
          assetBatchTemplates: (instance.metadata?.assetBatchTemplates ?? []).filter(item => item.id !== templateId),
        },
      };
    }),
  };
}

export function getSeriesInstances(state: WorkflowProjectState): WorkflowInstance[] {
  return state.instances.filter(instance => instance.scope === 'series');
}

export function getAutoApplySeriesAssetBatchTemplates(
  state: WorkflowProjectState,
  seriesInstanceId: string,
): WorkflowAssetBatchTemplate[] {
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  return (series?.metadata?.assetBatchTemplates ?? []).filter(template => template.autoApplyToNewEpisodes);
}

export function applySeriesAssetBatchTemplatesToEpisode(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  episodeId: string,
  templateIds?: string[],
  mode?: WorkflowBindingMode,
): WorkflowProjectState {
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  if (!series) return state;

  const templates = templateIds && templateIds.length > 0
    ? (series.metadata?.assetBatchTemplates ?? []).filter(template => templateIds.includes(template.id))
    : getAutoApplySeriesAssetBatchTemplates(state, seriesInstanceId);
  const assetIds = Array.from(new Set(
    templates.flatMap(template => template.assetIds).filter(assetId => state.assets.some(asset => asset.id === assetId)),
  ));

  if (assetIds.length === 0) return state;

  return syncMultipleAssetBindingsForEpisodes(
    state,
    assetIds,
    [episodeId],
    [episodeId],
    mode ?? getPreferredBindingMode(series),
  );
}

export function appendEpisodeInstanceToSeries(
  state: WorkflowProjectState,
  seriesInstanceId: string,
): {
  state: WorkflowProjectState;
  episode: WorkflowInstance | null;
} {
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  if (!series) {
    return { state, episode: null };
  }

  const timestamp = new Date().toISOString();
  const episode = createEpisodeInstance(state, seriesInstanceId);
  const touchedState = touchSeriesInstance(state, seriesInstanceId, timestamp);
  const withEpisode: WorkflowProjectState = {
    ...touchedState,
    instances: [episode, ...touchedState.instances],
  };

  return {
    state: applySeriesAssetBatchTemplatesToEpisode(withEpisode, seriesInstanceId, episode.id),
    episode,
  };
}

export function appendEpisodeInstancesToSeries(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  count: number,
): {
  state: WorkflowProjectState;
  episodes: WorkflowInstance[];
} {
  const safeCount = Math.max(0, Math.floor(count));
  const episodes: WorkflowInstance[] = [];
  let draftState = state;

  for (let index = 0; index < safeCount; index += 1) {
    const next = appendEpisodeInstanceToSeries(draftState, seriesInstanceId);
    if (!next.episode) {
      return {
        state: draftState,
        episodes,
      };
    }

    episodes.push(next.episode);
    draftState = next.state;
  }

  return {
    state: draftState,
    episodes,
  };
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

function createEpisodeStageAction(
  key: WorkflowSeriesNextAction['key'],
  label: string,
  description: string,
  episodeId: string,
  stageId: string,
): WorkflowSeriesNextAction {
  return {
    key,
    label,
    description,
    episodeId,
    stageId,
  };
}

export function getSeriesWorkflowOverview(
  state: WorkflowProjectState,
  seriesInstanceId: string,
): WorkflowSeriesOverview | null {
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  if (!series) return null;

  const episodes = getEpisodeInstances(state, seriesInstanceId);
  const coverage = getSeriesAssetCoverage(state, seriesInstanceId);
  const assetBatchTemplates = series.metadata?.assetBatchTemplates ?? [];
  const reusableAssetCount = new Set(assetBatchTemplates.flatMap(template => template.assetIds)).size;
  const autoApplyTemplateCount = assetBatchTemplates.filter(template => template.autoApplyToNewEpisodes).length;
  const coveredAssetCount = coverage.filter(entry => entry.boundCount > 0).length;
  const uncoveredAssetCount = coverage.filter(entry => entry.missingCount > 0).length;
  const plannedEpisodeCount = series.metadata?.plannedEpisodeCount ?? episodes.length;
  const seriesStageCount = Object.keys(series.stageStates).length;
  const seriesCompletedStageCount = countCompletedStages(series);

  const scriptCompletedEpisodeCount = episodes.filter(episode => episode.stageStates['episode-script']?.status === 'completed').length;
  const assetCompletedEpisodeCount = episodes.filter(episode => episode.stageStates['episode-assets']?.status === 'completed').length;
  const storyboardCompletedEpisodeCount = episodes.filter(episode => episode.stageStates.storyboard?.status === 'completed').length;
  const promptCompletedEpisodeCount = episodes.filter(episode => episode.stageStates.prompt?.status === 'completed').length;
  const videoCompletedEpisodeCount = episodes.filter(episode => episode.stageStates.video?.status === 'completed').length;

  let nextAction: WorkflowSeriesNextAction;

  if (state.assets.length === 0) {
    nextAction = {
      key: 'create_series_assets',
      label: '先沉淀系列资产',
      description: '优先创建主角、常驻场景和高频道具，后续单集才能稳定复用。',
    };
  } else if (assetBatchTemplates.length === 0) {
    nextAction = {
      key: 'organize_asset_templates',
      label: '整理资产模板',
      description: '把已创建资产归入主角组、常驻场景、高频道具等模板，后续新单集可自动预铺。',
    };
  } else if (episodes.length === 0) {
    nextAction = {
      key: 'create_episodes',
      label: '开始铺开单集',
      description: '先创建一批单集执行单元，把系列规划真正落到可执行流程里。',
    };
  } else {
    const scriptPendingEpisode = episodes.find(episode => episode.stageStates['episode-script']?.status !== 'completed');
    const assetPendingEpisode = episodes.find(episode => episode.stageStates['episode-script']?.status === 'completed' && episode.stageStates['episode-assets']?.status !== 'completed');
    const storyboardPendingEpisode = episodes.find(episode => episode.stageStates['episode-assets']?.status === 'completed' && episode.stageStates.storyboard?.status !== 'completed');
    const promptPendingEpisode = episodes.find(episode => episode.stageStates.storyboard?.status === 'completed' && episode.stageStates.prompt?.status !== 'completed');
    const videoPendingEpisode = episodes.find(episode => episode.stageStates.prompt?.status === 'completed' && episode.stageStates.video?.status !== 'completed');

    if (scriptPendingEpisode) {
      nextAction = createEpisodeStageAction(
        'open_episode_script',
        `继续 ${scriptPendingEpisode.title} 的剧本`,
        '优先把单集剧本写完整，再推进资产绑定与分镜。',
        scriptPendingEpisode.id,
        'episode-script',
      );
    } else if (assetPendingEpisode) {
      nextAction = createEpisodeStageAction(
        'open_episode_assets',
        `补齐 ${assetPendingEpisode.title} 的资产绑定`,
        '把人物、场景、道具和风格版本绑定完整，才能稳定推进分镜。',
        assetPendingEpisode.id,
        'episode-assets',
      );
    } else if (storyboardPendingEpisode) {
      nextAction = createEpisodeStageAction(
        'open_episode_storyboard',
        `推进 ${storyboardPendingEpisode.title} 的分镜`,
        '当前单集已经具备脚本和资产，可以进入分镜拆解。',
        storyboardPendingEpisode.id,
        'storyboard',
      );
    } else if (promptPendingEpisode) {
      nextAction = createEpisodeStageAction(
        'open_episode_prompt',
        `整理 ${promptPendingEpisode.title} 的提示词`,
        '把分镜转成稳定的提示词包，方便后续直接投放到视频节点。',
        promptPendingEpisode.id,
        'prompt',
      );
    } else if (videoPendingEpisode) {
      nextAction = createEpisodeStageAction(
        'open_episode_video',
        `生成 ${videoPendingEpisode.title} 的视频`,
        '当前单集已具备提示词，可以进入即梦视频执行环节。',
        videoPendingEpisode.id,
        'video',
      );
    } else {
      nextAction = {
        key: 'materialize_series',
        label: '投放到原始画布执行',
        description: '当前流程链路已基本打通，可以投放到画布做批量执行和高级调试。',
      };
    }
  }

  return {
    seriesStageCount,
    seriesCompletedStageCount,
    plannedEpisodeCount,
    createdEpisodeCount: episodes.length,
    scriptCompletedEpisodeCount,
    assetCompletedEpisodeCount,
    storyboardCompletedEpisodeCount,
    promptCompletedEpisodeCount,
    videoCompletedEpisodeCount,
    autoApplyTemplateCount,
    reusableAssetCount,
    coveredAssetCount,
    uncoveredAssetCount,
    nextAction,
  };
}

export function getSuggestedSeriesAssetBatchTemplates(
  state: WorkflowProjectState,
  seriesInstanceId: string,
): WorkflowAssetBatchTemplateSuggestion[] {
  const coverage = getSeriesAssetCoverage(state, seriesInstanceId);
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  const existingTemplates = series?.metadata?.assetBatchTemplates ?? [];

  const sortEntries = (entries: typeof coverage) => [...entries].sort((left, right) => {
    if (right.boundCount !== left.boundCount) {
      return right.boundCount - left.boundCount;
    }

    if (right.coverageRate !== left.coverageRate) {
      return right.coverageRate - left.coverageRate;
    }

    return left.asset.name.localeCompare(right.asset.name, 'zh-CN');
  });

  const createSuggestion = (
    key: string,
    name: string,
    entries: typeof coverage,
    reason: string,
    preferredCount: number,
    minimumCount = 1,
    autoApplyToNewEpisodes = false,
  ): WorkflowAssetBatchTemplateSuggestion | null => {
    const assetIds = sortEntries(entries)
      .slice(0, preferredCount)
      .map(entry => entry.asset.id);

    if (assetIds.length < minimumCount) {
      return null;
    }

    if (existingTemplates.some(template => template.name === name || areSameAssetSet(template.assetIds, assetIds))) {
      return null;
    }

    return {
      key,
      name,
      assetIds,
      reason,
      autoApplyToNewEpisodes,
    };
  };

  const characterEntries = coverage.filter(entry => entry.asset.type === 'character');
  const sceneEntries = coverage.filter(entry => entry.asset.type === 'scene');
  const propEntries = coverage.filter(entry => entry.asset.type === 'prop');
  const styleEntries = coverage.filter(entry => entry.asset.type === 'style');

  const leadCharacterEntries = characterEntries.filter(entry => (
    matchesAnyKeyword(entry.asset.tags, ['主角', '主角团', '主演', 'lead', 'hero', 'main', '核心', '常驻'])
  ));
  const recurringSceneEntries = sceneEntries.filter(entry => (
    matchesAnyKeyword(entry.asset.tags, ['常驻', '主场景', '固定', 'main', '核心', '长期', 'recurring'])
  ));
  const frequentPropEntries = propEntries.filter(entry => (
    matchesAnyKeyword(entry.asset.tags, ['高频', '常用', '核心', '固定', 'main', 'recurring'])
  ));

  const suggestions = [
    createSuggestion(
      'main-characters',
      '主角组',
      leadCharacterEntries.length > 0 ? leadCharacterEntries : characterEntries,
      leadCharacterEntries.length > 0 ? '根据主角/核心标签识别' : '根据当前覆盖率最高的人物识别',
      Math.min(Math.max(leadCharacterEntries.length || 3, 2), 6),
      2,
      true,
    ),
    createSuggestion(
      'recurring-scenes',
      '常驻场景',
      recurringSceneEntries.length > 0 ? recurringSceneEntries : sceneEntries,
      recurringSceneEntries.length > 0 ? '根据常驻/固定场景标签识别' : '根据当前覆盖率最高的场景识别',
      Math.min(Math.max(recurringSceneEntries.length || 2, 1), 4),
      1,
      true,
    ),
    createSuggestion(
      'frequent-props',
      '高频道具',
      frequentPropEntries.length > 0 ? frequentPropEntries : propEntries,
      frequentPropEntries.length > 0 ? '根据高频/常用标签识别' : '根据当前覆盖率最高的道具识别',
      Math.min(Math.max(frequentPropEntries.length || 3, 2), 6),
      2,
    ),
    createSuggestion(
      'style-pack',
      '风格统一包',
      styleEntries,
      '归拢统一风格与画面基线',
      styleEntries.length,
      1,
      true,
    ),
  ].filter((suggestion): suggestion is WorkflowAssetBatchTemplateSuggestion => Boolean(suggestion));

  return suggestions.filter((suggestion, index) => (
    suggestions.findIndex(item => item.name === suggestion.name || areSameAssetSet(item.assetIds, suggestion.assetIds)) === index
  ));
}

export function getSuggestedAssetBatchTemplateTargetsForAsset(
  state: WorkflowProjectState,
  seriesInstanceId: string,
  assetId: string,
): WorkflowAssetBatchTemplateTarget[] {
  const asset = state.assets.find(item => item.id === assetId);
  const series = state.instances.find(instance => instance.id === seriesInstanceId);
  if (!asset || !series) return [];

  const existingTemplates = series.metadata?.assetBatchTemplates ?? [];
  const nameSource = `${asset.name} ${asset.tags.join(' ')}`;
  const genericTargets: Array<{
    key: string;
    name: string;
    reason: string;
    autoApplyToNewEpisodes: boolean;
  }> = [];

  if (asset.type === 'character' && (
    matchesAnyKeyword(asset.tags, ['主角', '主角团', '主演', 'lead', 'hero', 'main', '核心', '常驻'])
    || includesKeyword(nameSource, ['主角', 'lead', 'hero', 'main'])
  )) {
    genericTargets.push({
      key: 'main-characters',
      name: '主角组',
      reason: '标签/名称匹配主角或核心人物，可加入长期复用人物组。',
      autoApplyToNewEpisodes: true,
    });
  }

  if (asset.type === 'scene' && (
    matchesAnyKeyword(asset.tags, ['常驻', '主场景', '固定', 'main', '核心', '长期', 'recurring'])
    || includesKeyword(nameSource, ['常驻', '固定', 'main', 'recurring'])
  )) {
    genericTargets.push({
      key: 'recurring-scenes',
      name: '常驻场景',
      reason: '该场景具备常驻/固定特征，适合自动铺到后续单集。',
      autoApplyToNewEpisodes: true,
    });
  }

  if (asset.type === 'prop' && (
    matchesAnyKeyword(asset.tags, ['高频', '常用', '核心', '固定', 'main', 'recurring'])
    || includesKeyword(nameSource, ['高频', '常用', '固定'])
  )) {
    genericTargets.push({
      key: 'frequent-props',
      name: '高频道具',
      reason: '道具标签显示其高频复用，适合纳入常用道具模板。',
      autoApplyToNewEpisodes: true,
    });
  }

  if (asset.type === 'style') {
    genericTargets.push({
      key: 'style-pack',
      name: '风格统一包',
      reason: '风格资产通常应进入统一风格包，保持系列画面一致。',
      autoApplyToNewEpisodes: true,
    });
  }

  return genericTargets
    .map(target => {
      const existingTemplate = existingTemplates.find(template => template.name === target.name);
      if (existingTemplate?.assetIds.includes(assetId)) {
        return null;
      }

      return {
        key: target.key,
        name: target.name,
        reason: target.reason,
        templateId: existingTemplate?.id,
        autoApplyToNewEpisodes: existingTemplate?.autoApplyToNewEpisodes ?? target.autoApplyToNewEpisodes,
      };
    })
    .filter(Boolean) as WorkflowAssetBatchTemplateTarget[];
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

function appendCreatedWorkflowAsset(
  state: WorkflowProjectState,
  asset: WorkflowAsset,
  versionId: string,
): WorkflowProjectState {
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

export function appendWorkflowAsset(
  state: WorkflowProjectState,
  projectId: string,
  type: WorkflowAssetType,
  name: string,
  tags: string[] = [],
): WorkflowProjectState {
  const { asset, versionId } = createWorkflowAsset(projectId, type, name, tags);

  return appendCreatedWorkflowAsset(state, asset, versionId);
}

export function appendWorkflowAssetAndApplySuggestedTemplates(
  state: WorkflowProjectState,
  projectId: string,
  seriesInstanceId: string | null | undefined,
  type: WorkflowAssetType,
  name: string,
  tags: string[] = [],
  autoApplySuggestedTemplates = false,
): {
  state: WorkflowProjectState;
  asset: WorkflowAsset;
  appliedTargets: WorkflowAssetBatchTemplateTarget[];
  suggestedTargets: WorkflowAssetBatchTemplateTarget[];
} {
  const { asset, versionId } = createWorkflowAsset(projectId, type, name, tags);
  let nextState = appendCreatedWorkflowAsset(state, asset, versionId);
  let suggestedTargets: WorkflowAssetBatchTemplateTarget[] = [];
  let appliedTargets: WorkflowAssetBatchTemplateTarget[] = [];

  if (seriesInstanceId) {
    const series = nextState.instances.find(instance => instance.id === seriesInstanceId);

    if (series) {
      suggestedTargets = getSuggestedAssetBatchTemplateTargetsForAsset(nextState, seriesInstanceId, asset.id);

      if (autoApplySuggestedTemplates && suggestedTargets.length > 0) {
        const existingTemplates = series.metadata?.assetBatchTemplates ?? [];
        appliedTargets = suggestedTargets;
        nextState = upsertSeriesAssetBatchTemplates(
          nextState,
          seriesInstanceId,
          suggestedTargets.map(target => {
            const existingTemplate = existingTemplates.find(template => (
              (target.templateId && template.id === target.templateId) || template.name === target.name
            ));

            return {
              id: existingTemplate?.id ?? target.templateId,
              name: target.name,
              assetIds: Array.from(new Set([...(existingTemplate?.assetIds ?? []), asset.id])),
              autoApplyToNewEpisodes: existingTemplate?.autoApplyToNewEpisodes ?? target.autoApplyToNewEpisodes,
            };
          }),
        );
      }
    }
  }

  return {
    state: nextState,
    asset,
    appliedTargets,
    suggestedTargets,
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

export function syncAssetBindingsForEpisodes(
  state: WorkflowProjectState,
  assetId: string,
  scopedEpisodeIds: string[],
  desiredEpisodeIds: string[],
  mode: WorkflowBindingMode = 'follow_latest',
): WorkflowProjectState {
  const asset = state.assets.find(item => item.id === assetId);
  if (!asset || !asset.currentVersionId) return state;

  const scope = Array.from(new Set(scopedEpisodeIds));
  if (scope.length === 0) return state;

  const scopeSet = new Set(scope);
  const desiredSet = new Set(desiredEpisodeIds.filter(id => scopeSet.has(id)));

  let nextBindings = state.assetBindings
    .filter(binding => !(binding.assetId === assetId && scopeSet.has(binding.workflowInstanceId) && !desiredSet.has(binding.workflowInstanceId)))
    .map(binding => (
      binding.assetId === assetId && desiredSet.has(binding.workflowInstanceId)
        ? {
            ...binding,
            versionId: asset.currentVersionId!,
            mode,
            derivedFromVersionId: mode === 'derived' ? binding.derivedFromVersionId : undefined,
          }
        : binding
    ));

  const existingEpisodeIds = new Set(
    nextBindings
      .filter(binding => binding.assetId === assetId && desiredSet.has(binding.workflowInstanceId))
      .map(binding => binding.workflowInstanceId),
  );

  nextBindings = [
    ...Array.from(desiredSet)
      .filter(episodeId => !existingEpisodeIds.has(episodeId))
      .map(episodeId => createEpisodeAssetBinding(episodeId, assetId, asset.currentVersionId!, mode)),
    ...nextBindings,
  ];

  return scope.reduce((draftState, episodeId) => syncEpisodeBindingOutputs({
    ...draftState,
    assetBindings: nextBindings,
  }, episodeId), {
    ...state,
    assetBindings: nextBindings,
  });
}

export function syncMultipleAssetBindingsForEpisodes(
  state: WorkflowProjectState,
  assetIds: string[],
  scopedEpisodeIds: string[],
  desiredEpisodeIds: string[],
  mode: WorkflowBindingMode = 'follow_latest',
): WorkflowProjectState {
  const uniqueAssetIds = Array.from(new Set(assetIds));
  if (uniqueAssetIds.length === 0) return state;

  return uniqueAssetIds.reduce((draftState, assetId) => (
    syncAssetBindingsForEpisodes(draftState, assetId, scopedEpisodeIds, desiredEpisodeIds, mode)
  ), state);
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
