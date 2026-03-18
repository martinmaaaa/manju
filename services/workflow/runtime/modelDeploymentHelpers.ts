import type { ModelDefinition } from '../../../types/workflowApp';

function normalizeIdentifier(value: string | null | undefined) {
  return String(value || '').trim();
}

export function getModelIdentifiers(model: ModelDefinition): string[] {
  return Array.from(new Set([
    normalizeIdentifier(model.deploymentId),
    normalizeIdentifier(model.providerModelId),
    ...(Array.isArray(model.aliases) ? model.aliases.map((item) => normalizeIdentifier(item)) : []),
  ].filter(Boolean)));
}

export function matchesModelIdentifier(
  model: ModelDefinition,
  identifier: string | null | undefined,
): boolean {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) {
    return false;
  }

  return getModelIdentifiers(model).includes(normalizedIdentifier);
}

export function findModelByIdentifier(
  models: ModelDefinition[],
  identifier: string | null | undefined,
): ModelDefinition | null {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) {
    return null;
  }

  return models.find((model) => matchesModelIdentifier(model, normalizedIdentifier)) || null;
}

export function normalizeModelIdentifier(
  models: ModelDefinition[],
  identifier: string | null | undefined,
  fallback = '',
): string {
  return findModelByIdentifier(models, identifier)?.deploymentId || fallback;
}

export function getModelOptionValue(model: ModelDefinition): string {
  return model.deploymentId;
}

export function formatModelFamilyName(model: ModelDefinition): string {
  return String(model.familyName || model.familyId || '').trim();
}

export function formatModelDisplayName(model: ModelDefinition): string {
  return String(model.name || model.deploymentId || '').trim();
}

export function groupModelsByFamily(models: ModelDefinition[]): Array<{
  familyId: string;
  familyName: string;
  deployments: ModelDefinition[];
}> {
  const groups = new Map<string, { familyId: string; familyName: string; deployments: ModelDefinition[] }>();

  models.forEach((model) => {
    const existingGroup = groups.get(model.familyId);
    if (existingGroup) {
      existingGroup.deployments.push(model);
      return;
    }

    groups.set(model.familyId, {
      familyId: model.familyId,
      familyName: formatModelFamilyName(model),
      deployments: [model],
    });
  });

  return Array.from(groups.values());
}

function fallbackInputTypeLabel(type: string): string {
  if (type === 'text') return '文本';
  if (type === 'image') return '图片';
  if (type === 'video') return '视频';
  if (type === 'audio') return '音频';
  return type;
}

export function summarizeModelInputSupport(model: ModelDefinition): string[] {
  const definitions = Object.values(model.inputSchema || {});
  if (definitions.length === 0) {
    return ['无需上游输入'];
  }

  return definitions.map((definition) => {
    const label = String(definition.label || fallbackInputTypeLabel(definition.type)).trim();
    const maxItems = Number(definition.maxItems);

    if (definition.multiple || Number.isFinite(maxItems) && maxItems > 1) {
      return `${label}${Number.isFinite(maxItems) ? ` x${maxItems}` : ' xN'}`;
    }

    return label;
  });
}

export function summarizeModelConfigFields(model: ModelDefinition): string[] {
  const definitions = Object.entries(model.configSchema || {});
  if (definitions.length === 0) {
    return ['无额外参数'];
  }

  return definitions.map(([fieldKey, definition]) => String(definition.label || fieldKey).trim());
}

export function describeModelRuntime(model: ModelDefinition): string {
  if (model.adapter === 'bltcy-openai-chat') {
    return '服务端直连 BLTCY 文本运行时';
  }
  if (model.adapter === 'bltcy-image-generation') {
    return '服务端直连 BLTCY 图片运行时';
  }
  if (model.adapter === 'bltcy-video-generation') {
    return '服务端直连 BLTCY 视频运行时';
  }
  if (model.adapter === 'jimeng-video-generation') {
    return '本地浏览器逆向任务队列';
  }
  return `运行时：${model.adapter}`;
}
