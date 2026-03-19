import type {
  ModelDefinition,
  ReviewPolicy,
  SkillPack,
  StageConfig,
  StageConfigMap,
} from '../../../types/workflowApp';
import type { SetupFlowSection } from '../../../components/workflow2/pages/SetupSecondarySections';
import {
  describeModelRuntime,
  findModelByIdentifier,
  formatModelDisplayName,
  getModelOptionValue,
  groupModelsByFamily,
} from './modelDeploymentHelpers';
import {
  resolveStageModelParams,
  selectStagePromptRecipe,
  selectStageSkillPack,
} from './stageConfigHelpers';

interface SetupFlowDefinition<StageKind extends string = string> {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  stageKinds: StageKind[];
}

interface BuildSetupFlowSectionsInput<StageKind extends string = string> {
  flows: SetupFlowDefinition<StageKind>[];
  stageLabels: Record<StageKind, string>;
  stageConfig: StageConfigMap;
  catalogModels: ModelDefinition[];
  skillPacks: SkillPack[];
  reviewPolicies: ReviewPolicy[];
  getCapabilityModels: (capabilityId: string) => ModelDefinition[];
  getResolvedCapabilityModelId: (capabilityId: string, preferredModelId?: string | null) => string;
  stageEntry: (config: StageConfigMap, stageKind: StageKind) => StageConfig;
}

export function buildSetupFlowSections<StageKind extends string>({
  flows,
  stageLabels,
  stageConfig,
  catalogModels,
  skillPacks,
  reviewPolicies,
  getCapabilityModels,
  getResolvedCapabilityModelId,
  stageEntry,
}: BuildSetupFlowSectionsInput<StageKind>): SetupFlowSection[] {
  return flows.map((flow) => ({
    id: flow.id,
    eyebrow: flow.eyebrow,
    title: flow.title,
    description: flow.description,
    stages: flow.stageKinds.map((stageKind) => {
      const stage = stageEntry(stageConfig, stageKind);
      const stageSkills = skillPacks.filter((item) => item.stageKind === stageKind);
      const stageModels = getCapabilityModels(stage.capabilityId);
      const groupedStageModels = groupModelsByFamily(stageModels);
      const resolvedStageModelId = getResolvedCapabilityModelId(stage.capabilityId, stage.modelId);
      const selectedStageModel = findModelByIdentifier(stageModels, resolvedStageModelId);
      const selectedSkillPack = selectStageSkillPack(skillPacks, stageKind, stage);
      const selectedPromptRecipe = selectStagePromptRecipe(stageKind, stage, selectedSkillPack);
      const resolvedStageModelParams = resolveStageModelParams(
        {
          ...stage,
          modelId: resolvedStageModelId,
        },
        catalogModels,
      );

      return {
        stageKind,
        title: stageLabels[stageKind],
        subtitle: `${selectedSkillPack?.name || '未选择技能包'}${selectedStageModel ? ` · ${formatModelDisplayName(selectedStageModel)}` : ''}`,
        runtimeLabel: selectedStageModel ? describeModelRuntime(selectedStageModel) : null,
        skillOptions: stageSkills.map((item) => ({ id: item.id, name: item.name })),
        selectedSkillPackId: stage.skillPackId || '',
        modelGroups: groupedStageModels.map((group) => ({
          familyId: group.familyId,
          familyName: group.familyName,
          options: group.deployments.map((item) => ({
            value: getModelOptionValue(item),
            label: formatModelDisplayName(item),
          })),
        })),
        selectedModelId: resolvedStageModelId || '',
        skillDescription: selectedSkillPack?.description || null,
        promptRecipes: stageKind === 'video_prompt_generate' && selectedSkillPack?.promptRecipes.length
          ? selectedSkillPack.promptRecipes.map((item) => ({ id: item.id, name: item.name }))
          : [],
        selectedPromptRecipeId: selectedPromptRecipe?.id || '',
        selectedPromptRecipeDescription: selectedPromptRecipe?.description || null,
        reviewPolicies: reviewPolicies.map((policy) => ({
          id: policy.id,
          name: policy.name,
          selected: stage.reviewPolicyIds.includes(policy.id),
        })),
        configFields: selectedStageModel && Object.keys(selectedStageModel.configSchema || {}).length > 0
          ? Object.entries(selectedStageModel.configSchema).map(([fieldKey, definition]) => ({
              fieldKey,
              definition,
              value: resolvedStageModelParams[fieldKey],
            }))
          : [],
      };
    }),
  }));
}
