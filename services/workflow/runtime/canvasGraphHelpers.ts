import type {
  CanvasConnection,
  CanvasConfigFieldDefinition,
  CanvasGenerationModeDefinition,
  CanvasInputValueType,
  CanvasModelInputDefinition,
  CanvasNode,
  CanvasNodeType,
  ModelDefinition,
  StageConfig,
  StageConfigMap,
} from '../../../types/workflowApp';
import {
  findModelByIdentifier,
  getModelDefaultGenerationModeId,
  getModelGenerationModes,
  getModelOptionValue,
  resolveModelGenerationMode,
} from './modelDeploymentHelpers';

const MEDIA_SOURCE_PATTERNS: Record<CanvasInputValueType, RegExp> = {
  text: /[\s\S]+/,
  image: /^(data:image\/[\w.+-]+;base64,|https?:\/\/)/i,
  video: /^(data:video\/[\w.+-]+;base64,|https?:\/\/)/i,
  audio: /^(data:audio\/[\w.+-]+;base64,|https?:\/\/)/i,
};
const MODEL_PARAM_MEMORY_KEY = 'modelParamMemory';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function configFieldDefault(field: CanvasConfigFieldDefinition): string | number | boolean | undefined {
  if (field.default !== undefined) {
    return field.default;
  }

  if (Array.isArray(field.enum) && field.enum.length > 0) {
    return field.enum[0];
  }

  if (field.type === 'boolean') {
    return false;
  }

  return undefined;
}

function safeTitle(type: CanvasNodeType, title?: string): string {
  const normalized = String(title || '').trim();
  if (normalized) {
    return normalized;
  }

  if (type === 'text') return '文本节点';
  if (type === 'image') return '图片节点';
  if (type === 'video') return '视频节点';
  return '节点';
}

export function buildCanvasConnectionId(from: string, to: string, inputKey = ''): string {
  return inputKey ? `conn_${from}_${to}_${inputKey}` : `conn_${from}_${to}`;
}

function sanitizeModeIdForModel(
  model: ModelDefinition | null | undefined,
  modeId: string | null | undefined,
): string | undefined {
  return resolveModelGenerationMode(model, modeId)?.id || getModelDefaultGenerationModeId(model);
}

function getAcceptedInputTypes(definition: CanvasModelInputDefinition | null | undefined): CanvasInputValueType[] {
  return Array.isArray(definition?.accepts)
    ? definition.accepts.filter((value): value is CanvasInputValueType => typeof value === 'string')
    : [];
}

function sanitizeParamsForModel(
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

function readModelParamMemory(node: Pick<CanvasNode, 'metadata'>): Record<string, Record<string, unknown>> {
  if (!isObject(node.metadata) || !isObject(node.metadata[MODEL_PARAM_MEMORY_KEY])) {
    return {};
  }

  return Object.entries(node.metadata[MODEL_PARAM_MEMORY_KEY]).reduce<Record<string, Record<string, unknown>>>((acc, [key, value]) => {
    if (isObject(value)) {
      acc[key] = { ...value };
    }
    return acc;
  }, {});
}

function writeModelParamMemory(
  node: Pick<CanvasNode, 'metadata'>,
  nextMemory: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...(isObject(node.metadata) ? node.metadata : {}),
    [MODEL_PARAM_MEMORY_KEY]: nextMemory,
  };
}

function buildCompatibleParams(
  currentModel: ModelDefinition | null,
  nextModel: ModelDefinition | null,
  currentParams: Record<string, unknown>,
): Record<string, unknown> {
  if (!currentModel || !nextModel || currentModel.familyId !== nextModel.familyId) {
    return {};
  }

  return sanitizeParamsForModel(nextModel, currentParams);
}

export function selectCanvasModels(models: ModelDefinition[], nodeType: CanvasNodeType): ModelDefinition[] {
  if (nodeType === 'audio') {
    return [];
  }

  return models.filter((model) => model.modality === nodeType);
}

export function buildDefaultParams(model: ModelDefinition | null | undefined): Record<string, unknown> {
  if (!model || !isObject(model.configSchema)) {
    return {};
  }

  return Object.entries(model.configSchema).reduce<Record<string, unknown>>((acc, [key, field]) => {
    const nextField = field as CanvasConfigFieldDefinition;
    const nextValue = configFieldDefault(nextField);
    if (nextValue !== undefined) {
      acc[key] = nextValue;
    }
    return acc;
  }, {});
}

export function mergeNodeParamsWithModelDefaults(
  model: ModelDefinition | null | undefined,
  currentParams: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const defaults = buildDefaultParams(model);
  const nextParams = isObject(currentParams) ? { ...currentParams } : {};

  return Object.keys(defaults).reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = key in nextParams ? nextParams[key] : defaults[key];
    return acc;
  }, {});
}

export function buildCanvasNodeParamPatch(
  node: CanvasNode,
  fieldKey: string,
  nextValue: string | number | boolean,
  models: ModelDefinition[],
): Partial<CanvasNode> {
  const nextParams = {
    ...(isObject(node.params) ? node.params : {}),
    [fieldKey]: nextValue,
  };
  const currentModel = findModelByIdentifier(models, node.modelId);
  const nextMemory = readModelParamMemory(node);

  if (currentModel?.deploymentId) {
    nextMemory[currentModel.deploymentId] = sanitizeParamsForModel(currentModel, nextParams);
  }

  return {
    params: nextParams,
    metadata: writeModelParamMemory(node, nextMemory),
  };
}

export function buildCanvasNodeModelChangePatch(
  node: CanvasNode,
  nextModelId: string,
  models: ModelDefinition[],
): Partial<CanvasNode> {
  const currentModel = findModelByIdentifier(models, node.modelId);
  const nextModel = findModelByIdentifier(models, nextModelId);
  const currentParams = isObject(node.params) ? node.params : {};
  const nextMemory = readModelParamMemory(node);

  if (currentModel?.deploymentId) {
    nextMemory[currentModel.deploymentId] = sanitizeParamsForModel(currentModel, currentParams);
  }

  const rememberedParams = nextModel?.deploymentId ? nextMemory[nextModel.deploymentId] : undefined;
  const compatibleParams = buildCompatibleParams(currentModel, nextModel, currentParams);
  const nextParams = mergeNodeParamsWithModelDefaults(
    nextModel,
    rememberedParams || compatibleParams,
  );

  if (nextModel?.deploymentId) {
    nextMemory[nextModel.deploymentId] = sanitizeParamsForModel(nextModel, nextParams);
  }

  return {
    modelId: nextModel?.deploymentId || nextModelId,
    modeId: sanitizeModeIdForModel(nextModel, node.modeId),
    params: nextParams,
    metadata: writeModelParamMemory(node, nextMemory),
    runStatus: 'idle',
    error: null,
  };
}

export function buildCanvasNodeStagePresetPatch(
  node: CanvasNode,
  stage: StageConfig,
  models: ModelDefinition[],
): Partial<CanvasNode> {
  const currentModel = findModelByIdentifier(models, node.modelId);
  const nextModel = findModelByIdentifier(models, stage.modelId);
  const nextMemory = readModelParamMemory(node);
  const currentParams = isObject(node.params) ? node.params : {};

  if (currentModel?.deploymentId) {
    nextMemory[currentModel.deploymentId] = sanitizeParamsForModel(currentModel, currentParams);
  }

  const nextParams = mergeNodeParamsWithModelDefaults(
    nextModel,
    isObject(stage.modelParams) ? stage.modelParams : {},
  );

  if (nextModel?.deploymentId) {
    nextMemory[nextModel.deploymentId] = sanitizeParamsForModel(nextModel, nextParams);
  }

  return {
    modelId: nextModel?.deploymentId || stage.modelId,
    modeId: sanitizeModeIdForModel(nextModel, node.modeId),
    params: nextParams,
    metadata: writeModelParamMemory(node, nextMemory),
    runStatus: 'idle',
    error: null,
  };
}

function stageDefaultTextModelId(stageConfig: StageConfigMap | undefined) {
  return stageConfig?.video_prompt_generate?.modelId || '';
}

function stageDefaultVideoModelId(stageConfig: StageConfigMap | undefined) {
  return stageConfig?.video_generate?.modelId || '';
}

function stageDefaultTextModelParams(stageConfig: StageConfigMap | undefined) {
  return isObject(stageConfig?.video_prompt_generate?.modelParams)
    ? stageConfig?.video_prompt_generate?.modelParams
    : {};
}

function stageDefaultVideoModelParams(stageConfig: StageConfigMap | undefined) {
  return isObject(stageConfig?.video_generate?.modelParams)
    ? stageConfig?.video_generate?.modelParams
    : {};
}

function resolveCanvasNodeDefaultParams(
  nodeType: CanvasNodeType,
  model: ModelDefinition | null,
  stageConfig?: StageConfigMap,
): Record<string, unknown> {
  if (!model) {
    return {};
  }

  if (nodeType === 'text') {
    return mergeNodeParamsWithModelDefaults(model, stageDefaultTextModelParams(stageConfig));
  }

  if (nodeType === 'video') {
    return mergeNodeParamsWithModelDefaults(model, stageDefaultVideoModelParams(stageConfig));
  }

  return mergeNodeParamsWithModelDefaults(model, {});
}

export function resolveCanvasNodeDefaultModelId(
  node: Pick<CanvasNode, 'id' | 'type' | 'content' | 'metadata'>,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): string {
  if (node.type === 'audio') {
    return '';
  }

  const isLockedAssetNode = Boolean(node.metadata?.lockedAssetId) || String(node.id).startsWith('asset-');
  const hasMediaContent = ['image', 'video', 'audio'].includes(node.type) && MEDIA_SOURCE_PATTERNS[node.type as CanvasInputValueType].test(String(node.content || '').trim());

  if (isLockedAssetNode || hasMediaContent || String(node.id).startsWith('visual-') || String(node.id).startsWith('script-')) {
    return '';
  }

  const candidates = selectCanvasModels(models, node.type);
  if (candidates.length === 0) {
    return '';
  }

  if (node.type === 'text') {
    const preferred = stageDefaultTextModelId(stageConfig);
    return findModelByIdentifier(candidates, preferred)?.deploymentId || getModelOptionValue(candidates[0]);
  }

  if (node.type === 'video') {
    const preferred = stageDefaultVideoModelId(stageConfig);
    return findModelByIdentifier(candidates, preferred)?.deploymentId || getModelOptionValue(candidates[0]);
  }

  return getModelOptionValue(candidates[0]);
}

export function createCanvasNode(
  type: CanvasNodeType,
  index: number,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): CanvasNode {
  const baseNode: CanvasNode = {
    id: `${type}-${Date.now()}-${index}`,
    type,
    title: safeTitle(type),
    x: 80 + (index % 3) * 320,
    y: 90 + Math.floor(index / 3) * 280,
    width: type === 'video' ? 360 : 320,
    height: type === 'text' ? 260 : 300,
    content: '',
    prompt: '',
    params: {},
    output: {},
    runStatus: 'idle',
    error: null,
    lastRunAt: null,
    metadata: {},
  };

  const modelId = resolveCanvasNodeDefaultModelId(baseNode, models, stageConfig);
  const model = findModelByIdentifier(models, modelId);

  return {
    ...baseNode,
    modelId,
    modeId: sanitizeModeIdForModel(model, undefined),
    params: resolveCanvasNodeDefaultParams(type, model, stageConfig),
    metadata: model?.deploymentId
      ? writeModelParamMemory(baseNode, {
          [model.deploymentId]: sanitizeParamsForModel(
            model,
            resolveCanvasNodeDefaultParams(type, model, stageConfig),
          ),
        })
      : {},
  };
}

export function normalizeCanvasNode(
  node: CanvasNode,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): CanvasNode {
  const modelId = node.modelId ?? resolveCanvasNodeDefaultModelId(node, models, stageConfig);
  const model = findModelByIdentifier(models, modelId);
  const nextMemory = readModelParamMemory(node);

  if (model?.deploymentId) {
    nextMemory[model.deploymentId] = sanitizeParamsForModel(
      model,
      isObject(node.params) ? node.params : {},
    );
  }

  return {
    ...node,
    title: safeTitle(node.type, node.title),
    width: Number(node.width || (node.type === 'video' ? 360 : 320)),
    height: Number(node.height || (node.type === 'text' ? 260 : 300)),
    content: String(node.content || ''),
    prompt: typeof node.prompt === 'string' ? node.prompt : '',
    modelId: model?.deploymentId || modelId,
    modeId: sanitizeModeIdForModel(model, node.modeId),
    params: mergeNodeParamsWithModelDefaults(model, isObject(node.params) ? node.params : {}),
    output: isObject(node.output) ? node.output : {},
    runStatus: node.runStatus || 'idle',
    error: typeof node.error === 'string' ? node.error : null,
    lastRunAt: typeof node.lastRunAt === 'string' ? node.lastRunAt : null,
    metadata: writeModelParamMemory(node, nextMemory),
  };
}

export function normalizeCanvasContent(
  content: { nodes?: CanvasNode[]; connections?: CanvasConnection[]; [key: string]: unknown } | undefined,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  [key: string]: unknown;
} {
  const nodes = Array.isArray(content?.nodes)
    ? content.nodes.map((node) => normalizeCanvasNode(node, models, stageConfig))
    : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connections = Array.isArray(content?.connections)
    ? content.connections
        .filter((connection) => Boolean(connection?.from) && Boolean(connection?.to))
        .map((connection) => {
          const targetNode = nodeById.get(connection.to);
          const sourceNode = nodeById.get(connection.from);
          const derivedInputKey = connection.inputKey
            || (targetNode && sourceNode
              ? getCompatibleNodeInputDefinitions(targetNode, sourceNode.type, models)[0]?.[0]
              : undefined)
            || '';
          return {
            id: connection.id || buildCanvasConnectionId(connection.from, connection.to, derivedInputKey),
            from: connection.from,
            to: connection.to,
            inputKey: derivedInputKey,
            inputType: connection.inputType,
          };
        })
        .filter((connection) => Boolean(connection.inputKey))
    : [];

  return {
    ...(content || {}),
    nodes,
    connections,
  };
}

export function getModelInputDefinitions(model: ModelDefinition | null | undefined): Array<[string, CanvasModelInputDefinition]> {
  if (!model || !isObject(model.inputSchema)) {
    return [];
  }

  return Object.entries(model.inputSchema).filter((entry): entry is [string, CanvasModelInputDefinition] => {
    const [, value] = entry;
    return isObject(value) && Array.isArray(value.accepts);
  });
}

export function getNodeGenerationMode(
  node: Pick<CanvasNode, 'modeId'>,
  model: ModelDefinition | null | undefined,
): CanvasGenerationModeDefinition | null {
  return resolveModelGenerationMode(model, node.modeId);
}

export function getNodeEnabledInputDefinitions(
  node: Pick<CanvasNode, 'modeId'>,
  model: ModelDefinition | null | undefined,
): Array<[string, CanvasModelInputDefinition]> {
  const definitions = getModelInputDefinitions(model);
  const generationModes = getModelGenerationModes(model);
  if (generationModes.length === 0) {
    return definitions;
  }

  const mode = getNodeGenerationMode(node, model);
  if (!mode) {
    return definitions;
  }

  const enabledInputKeys = new Set(mode.enabledInputKeys);
  return definitions.filter(([inputKey]) => enabledInputKeys.has(inputKey));
}

export function getVisibleNodeInputDefinitions(
  node: Pick<CanvasNode, 'modeId'>,
  model: ModelDefinition | null | undefined,
): Array<[string, CanvasModelInputDefinition]> {
  return getNodeEnabledInputDefinitions(node, model)
    .filter(([, definition]) => definition.showInNode !== false);
}

export function getCompatibleNodeInputDefinitions(
  node: Pick<CanvasNode, 'modeId'>,
  sourceType: CanvasNodeType,
  modelsOrModel: ModelDefinition[] | ModelDefinition | null | undefined,
): Array<[string, CanvasModelInputDefinition]> {
  const model = Array.isArray(modelsOrModel)
    ? findModelByIdentifier(modelsOrModel, (node as Pick<CanvasNode, 'modeId' | 'modelId'> & { modelId?: string }).modelId)
    : modelsOrModel;
  return getNodeEnabledInputDefinitions(node, model)
    .filter(([, definition]) => getAcceptedInputTypes(definition).includes(sourceType as CanvasInputValueType));
}

export function validateCanvasConnection(
  sourceNode: CanvasNode,
  targetNode: CanvasNode,
  models: ModelDefinition[],
  connections: CanvasConnection[],
  inputKey?: string,
): { valid: boolean; error?: string; resolvedInputKey?: string; candidateInputKeys?: string[] } {
  if (sourceNode.id === targetNode.id) {
    return { valid: false, error: '节点不能连接到自己。' };
  }

  if (!targetNode.modelId) {
    return { valid: false, error: '目标节点还没有选择模型。' };
  }

  const targetModel = findModelByIdentifier(models, targetNode.modelId);
  const compatibleDefinitions = getCompatibleNodeInputDefinitions(targetNode, sourceNode.type, targetModel);
  if (compatibleDefinitions.length === 0) {
    return { valid: false, error: `${targetNode.title} 当前模型不接受 ${sourceNode.type} 输入。` };
  }

  const candidateInputKeys = compatibleDefinitions.reduce<string[]>((accumulator, [candidateInputKey, definition]) => {
    const duplicate = connections.find((connection) => connection.from === sourceNode.id && connection.to === targetNode.id && connection.inputKey === candidateInputKey);
    if (duplicate) {
      return accumulator;
    }

    const sameInputConnections = connections.filter((connection) => connection.to === targetNode.id && connection.inputKey === candidateInputKey);
    const maxItems = definition.maxItems ?? (definition.multiple ? Number.POSITIVE_INFINITY : 1);
    if (Number.isFinite(maxItems) && sameInputConnections.length >= maxItems) {
      return accumulator;
    }

    accumulator.push(candidateInputKey);
    return accumulator;
  }, []);

  if (candidateInputKeys.length === 0) {
    return { valid: false, error: `${targetNode.title} 没有可用输入槽位。` };
  }

  if (inputKey) {
    if (!candidateInputKeys.includes(inputKey)) {
      return {
        valid: false,
        error: `${targetNode.title} 当前模式不接受 ${sourceNode.type} 接到 ${inputKey}。`,
        candidateInputKeys,
      };
    }

    return {
      valid: true,
      resolvedInputKey: inputKey,
      candidateInputKeys,
    };
  }

  return {
    valid: true,
    resolvedInputKey: candidateInputKeys[0],
    candidateInputKeys,
  };
}

export function isNodeExecutable(node: CanvasNode): boolean {
  return Boolean(node.modelId);
}

export function getNodePrimaryValue(node: CanvasNode): string {
  const outputText = typeof node.output?.text === 'string' ? node.output.text : '';
  const outputUrl = typeof node.output?.previewUrl === 'string' ? node.output.previewUrl : '';
  return outputText || outputUrl || String(node.content || '').trim();
}

export function collectCanvasNodeInputs(
  node: CanvasNode,
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  models: ModelDefinition[],
): Record<string, { definition: CanvasModelInputDefinition; items: Array<{ node: CanvasNode; value: string; inputType: CanvasInputValueType }> }> {
  if (!node.modelId) {
    return {};
  }

  const model = findModelByIdentifier(models, node.modelId);
  const definitions = new Map(getNodeEnabledInputDefinitions(node, model));
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const inputs = Array.from(definitions.entries()).reduce<Record<string, { definition: CanvasModelInputDefinition; items: Array<{ node: CanvasNode; value: string; inputType: CanvasInputValueType }> }>>((acc, [inputKey, definition]) => {
    acc[inputKey] = {
      definition,
      items: [],
    };
    return acc;
  }, {});

  connections
    .filter((connection) => connection.to === node.id)
    .forEach((connection) => {
      const sourceNode = nodeById.get(connection.from);
      if (!sourceNode) {
        return;
      }

      const inputDefinition = definitions.get(connection.inputKey);
      if (!inputDefinition) {
        return;
      }

      const nextValue = getNodePrimaryValue(sourceNode);
      if (!nextValue || !MEDIA_SOURCE_PATTERNS[sourceNode.type as CanvasInputValueType].test(nextValue)) {
        return;
      }

      if (!getAcceptedInputTypes(inputDefinition).includes(sourceNode.type as CanvasInputValueType)) {
        return;
      }

      inputs[connection.inputKey]?.items.push({
        node: sourceNode,
        value: nextValue,
        inputType: sourceNode.type as CanvasInputValueType,
      });
    });

  return inputs;
}

export function summarizeNodeParams(node: CanvasNode, model: ModelDefinition | null | undefined): string[] {
  if (!model || !isObject(node.params)) {
    return [];
  }

  return Object.entries(node.params)
    .map(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return '';
      }

      const field = model.configSchema[key] as CanvasConfigFieldDefinition | undefined;
      const label = field?.label || key;
      return `${label}: ${String(value)}`;
    })
    .filter(Boolean)
    .slice(0, 4);
}
