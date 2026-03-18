import type { ModelDefinition, SkillPack, SkillPackPromptRecipe, StageConfig } from '../../../types/workflowApp';
import { mergeNodeParamsWithModelDefaults } from './canvasGraphHelpers';
import { findModelByIdentifier } from './modelDeploymentHelpers';

const PROMPT_RECIPE_STAGE_KIND = 'video_prompt_generate';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeStageParams(
  model: ModelDefinition | null | undefined,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!model || !isObject(model.configSchema) || !isObject(params)) {
    return {};
  }

  return Object.keys(model.configSchema).reduce<Record<string, unknown>>((acc, key) => {
    if (key in params) {
      acc[key] = params[key];
    }
    return acc;
  }, {});
}

export function selectStageSkillPack(
  skillPacks: SkillPack[],
  stageKind: string,
  stage: StageConfig,
): SkillPack | null {
  return skillPacks.find((item) => item.stageKind === stageKind && item.id === stage.skillPackId) || null;
}

export function selectStagePromptRecipe(
  stageKind: string,
  stage: StageConfig,
  skillPack: SkillPack | null,
): SkillPackPromptRecipe | null {
  if (!skillPack || stageKind !== PROMPT_RECIPE_STAGE_KIND) {
    return null;
  }

  return skillPack.promptRecipes.find((item) => item.id === stage.promptRecipeId) || skillPack.promptRecipes[0] || null;
}

export function applySkillPackSelection(
  stageKind: string,
  stage: StageConfig,
  skillPack: SkillPack | null,
): StageConfig {
  const nextStage: StageConfig = {
    ...stage,
    skillPackId: skillPack?.id,
    reviewPolicyIds: skillPack ? [...skillPack.reviewPolicies] : [],
  };

  if (stageKind === PROMPT_RECIPE_STAGE_KIND) {
    const hasCurrentRecipe = Boolean(
      skillPack?.promptRecipes.some((item) => item.id === stage.promptRecipeId),
    );

    if (hasCurrentRecipe) {
      nextStage.promptRecipeId = stage.promptRecipeId;
    } else if (skillPack?.promptRecipes.length) {
      nextStage.promptRecipeId = skillPack.promptRecipes[0].id;
    } else {
      delete nextStage.promptRecipeId;
    }
  }

  return nextStage;
}

export function resolveStageModelParams(
  stage: StageConfig,
  models: ModelDefinition[],
): Record<string, unknown> {
  const model = findModelByIdentifier(models, stage.modelId);
  return mergeNodeParamsWithModelDefaults(
    model,
    isObject(stage.modelParams) ? stage.modelParams : {},
  );
}

export function applyStageModelSelection(
  stage: StageConfig,
  nextModelId: string,
  models: ModelDefinition[],
): StageConfig {
  const currentModel = findModelByIdentifier(models, stage.modelId);
  const nextModel = findModelByIdentifier(models, nextModelId);
  const currentParams = resolveStageModelParams(stage, models);
  const compatibleParams = currentModel && nextModel && currentModel.familyId === nextModel.familyId
    ? sanitizeStageParams(nextModel, currentParams)
    : {};

  return {
    ...stage,
    modelId: nextModel?.deploymentId || nextModelId,
    modelParams: mergeNodeParamsWithModelDefaults(nextModel, compatibleParams),
  };
}

export function applyStageModelParamChange(
  stage: StageConfig,
  fieldKey: string,
  nextValue: string | number | boolean,
  models: ModelDefinition[],
): StageConfig {
  const nextParams = {
    ...resolveStageModelParams(stage, models),
    [fieldKey]: nextValue,
  };

  return {
    ...stage,
    modelParams: nextParams,
  };
}
