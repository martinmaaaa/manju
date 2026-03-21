import type { ModelDefinition, SkillPack, StageConfig, StageConfigMap } from '../../../types/workflowApp';
import {
  applySkillPackSelection,
  applyStageModelParamChange,
  applyStageModelSelection,
  resolveStageModelParams,
} from './stageConfigHelpers';

export interface SetupDraftState {
  aspectRatio: string;
  styleSummary: string;
  targetMedium: string;
  globalPromptsText: string;
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildProjectSettingSummary(setupDraft: SetupDraftState) {
  return [
    `Aspect ${setupDraft.aspectRatio}`,
    setupDraft.targetMedium ? `Medium ${setupDraft.targetMedium}` : null,
    setupDraft.styleSummary ? 'Style configured' : null,
    setupDraft.globalPromptsText.trim() ? `${splitLines(setupDraft.globalPromptsText).length} global prompts` : null,
  ].filter(Boolean) as string[];
}

export function buildProjectSetupPayload(setupDraft: SetupDraftState) {
  return {
    aspectRatio: setupDraft.aspectRatio,
    styleSummary: setupDraft.styleSummary,
    targetMedium: setupDraft.targetMedium,
    globalPrompts: splitLines(setupDraft.globalPromptsText),
  };
}

export function applySetupStageSkillPackChange<StageKind extends string>(params: {
  stageConfig: StageConfigMap;
  stageKind: StageKind;
  skillPackId: string;
  skillPacks: SkillPack[];
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
}) {
  const stageSkills = params.skillPacks.filter((item) => item.stageKind === params.stageKind);
  const nextSkillPack = stageSkills.find((item) => item.id === params.skillPackId) || null;
  return {
    ...params.stageConfig,
    [params.stageKind]: applySkillPackSelection(
      params.stageKind,
      params.stageEntry(params.stageConfig, params.stageKind),
      nextSkillPack,
    ),
  };
}

export function applySetupStageModelChange<StageKind extends string>(params: {
  stageConfig: StageConfigMap;
  stageKind: StageKind;
  modelId: string;
  models: ModelDefinition[];
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
}) {
  return {
    ...params.stageConfig,
    [params.stageKind]: applyStageModelSelection(
      params.stageEntry(params.stageConfig, params.stageKind),
      params.modelId,
      params.models,
    ),
  };
}

export function applySetupPromptRecipeChange<StageKind extends string>(params: {
  stageConfig: StageConfigMap;
  stageKind: StageKind;
  promptRecipeId: string;
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
}) {
  return {
    ...params.stageConfig,
    [params.stageKind]: {
      ...params.stageEntry(params.stageConfig, params.stageKind),
      promptRecipeId: params.promptRecipeId || undefined,
    },
  };
}

export function applySetupReviewPolicyToggle<StageKind extends string>(params: {
  stageConfig: StageConfigMap;
  stageKind: StageKind;
  policyId: string;
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
}) {
  const stage = params.stageEntry(params.stageConfig, params.stageKind);
  const selected = stage.reviewPolicyIds.includes(params.policyId);
  return {
    ...params.stageConfig,
    [params.stageKind]: {
      ...stage,
      reviewPolicyIds: selected
        ? stage.reviewPolicyIds.filter((item) => item !== params.policyId)
        : [...stage.reviewPolicyIds, params.policyId],
    },
  };
}

export function applySetupModelParamChange<StageKind extends string>(params: {
  stageConfig: StageConfigMap;
  stageKind: StageKind;
  fieldKey: string;
  nextValue: string | number | boolean;
  models: ModelDefinition[];
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
  getResolvedCapabilityModelId: (capabilityId: string, preferredModelId?: string | null) => string;
}) {
  const stage = params.stageEntry(params.stageConfig, params.stageKind);
  return {
    ...params.stageConfig,
    [params.stageKind]: applyStageModelParamChange(
      {
        ...stage,
        modelId: params.getResolvedCapabilityModelId(stage.capabilityId, stage.modelId),
      },
      params.fieldKey,
      params.nextValue,
      params.models,
    ),
  };
}

export function buildPersistedStageConfig<StageKind extends string>(params: {
  stageConfig: StageConfigMap;
  stageKinds: StageKind[];
  models: ModelDefinition[];
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
  getResolvedCapabilityModelId: (capabilityId: string, preferredModelId?: string | null) => string;
}) {
  return Object.fromEntries(
    params.stageKinds.map((stageKind) => {
      const stage = params.stageEntry(params.stageConfig, stageKind);
      const resolvedModelId = params.getResolvedCapabilityModelId(stage.capabilityId, stage.modelId);
      return [stageKind, {
        ...stage,
        modelId: resolvedModelId,
        modelParams: resolveStageModelParams(
          { ...stage, modelId: resolvedModelId },
          params.models,
        ),
      }];
    }),
  );
}
