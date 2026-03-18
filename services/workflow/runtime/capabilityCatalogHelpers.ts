import type { CapabilityDefinition, ModelDefinition } from '../../../types/workflowApp';
import { findModelByIdentifier } from './modelDeploymentHelpers';

export function selectCapability(
  capabilities: CapabilityDefinition[],
  capabilityId: string,
): CapabilityDefinition | null {
  return capabilities.find((item) => item.id === capabilityId) || null;
}

export function selectAllowedModels(
  models: ModelDefinition[],
  capability: CapabilityDefinition | null,
): ModelDefinition[] {
  if (!capability) {
    return [];
  }

  return capability.allowedModelIds
    .map((modelId) => findModelByIdentifier(models, modelId))
    .filter((item, index, items): item is ModelDefinition =>
      Boolean(item) && items.findIndex((candidate) => candidate?.deploymentId === item?.deploymentId) === index,
    );
}

export function resolveCapabilityModelId(
  models: ModelDefinition[],
  capability: CapabilityDefinition | null,
  preferredModelId?: string,
): string {
  if (!capability) {
    return preferredModelId || '';
  }

  const allowedModels = selectAllowedModels(models, capability);

  if (preferredModelId) {
    const preferredModel = findModelByIdentifier(allowedModels, preferredModelId);
    if (preferredModel) {
      return preferredModel.deploymentId;
    }
  }

  return findModelByIdentifier(models, capability.defaultModelId)?.deploymentId || capability.defaultModelId;
}
