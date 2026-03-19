import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasNode, ModelDefinition, StageConfigMap } from '../../../types/workflowApp';
import {
  buildCanvasNodeModelChangePatch,
  buildCanvasNodeParamPatch,
  buildCanvasNodeStagePresetPatch,
  buildDefaultParams,
  buildCanvasConnectionId,
  collectCanvasNodeInputs,
  createCanvasNode,
  normalizeCanvasContent,
  resolveCanvasNodeDefaultModelId,
  selectCanvasModels,
  validateCanvasConnection,
} from './canvasGraphHelpers';

const models: ModelDefinition[] = [
  {
    familyId: 'text-family',
    familyName: 'Text Family',
    deploymentId: 'text-model@vendor',
    providerModelId: 'text-model',
    name: 'Text Model',
    vendor: 'vendor',
    modality: 'text',
    capabilities: ['canvas_text_generate'],
    inputSchema: {
      contextTexts: { accepts: ['text'], maxItems: 4, showInNode: false },
      referenceImages: { accepts: ['image'], multiple: true, maxItems: 2, showInNode: false },
    },
    configSchema: {
      temperature: { type: 'number', default: 0.4 },
    },
    adapter: 'text-adapter',
  },
  {
    familyId: 'image-family',
    familyName: 'Image Family',
    deploymentId: 'image-model@vendor',
    providerModelId: 'image-model',
    name: 'Image Model',
    vendor: 'vendor',
    modality: 'image',
    capabilities: ['canvas_image_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], maxItems: 1, showInNode: false },
      referenceImages: { accepts: ['image'], multiple: true, maxItems: 2, showInNode: true },
    },
    configSchema: {
      aspectRatio: { type: 'string', enum: ['1:1', '9:16'], default: '1:1' },
    },
    adapter: 'image-adapter',
  },
  {
    familyId: 'video-family',
    familyName: 'Video Family',
    deploymentId: 'video-model@vendor',
    providerModelId: 'video-model',
    name: 'Video Model',
    vendor: 'vendor',
    modality: 'video',
    capabilities: ['canvas_video_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], maxItems: 1, showInNode: false },
      startFrame: { accepts: ['image'], maxItems: 1, showInNode: true },
      referenceAssets: { accepts: ['image', 'video', 'audio'], multiple: true, maxItems: 12, showInNode: true },
    },
    configSchema: {
      durationSeconds: { type: 'number', default: 5 },
    },
    generationModes: [
      { id: 'start_end_frames', label: '首尾帧', summaryLabel: '首尾帧', enabledInputKeys: ['promptText', 'startFrame'] },
      { id: 'all_references', label: '全能参考', summaryLabel: '多参', enabledInputKeys: ['promptText', 'referenceAssets'] },
    ],
    defaultGenerationModeId: 'all_references',
    adapter: 'video-adapter',
  },
  {
    familyId: 'video-family',
    familyName: 'Video Family',
    deploymentId: 'video-model-alt@vendor',
    providerModelId: 'video-model-alt',
    name: 'Video Model Alt',
    vendor: 'vendor',
    modality: 'video',
    capabilities: ['canvas_video_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], maxItems: 1, showInNode: false },
      referenceImages: { accepts: ['image'], multiple: true, maxItems: 2, showInNode: true },
    },
    configSchema: {
      durationSeconds: { type: 'number', default: 5 },
      ratio: { type: 'string', enum: ['9:16', '16:9'], default: '9:16' },
    },
    adapter: 'video-adapter-alt',
  },
];

const stageConfig: StageConfigMap = {
  video_prompt_generate: {
    capabilityId: 'video_prompt_generate',
    modelId: 'text-model@vendor',
    modelParams: {
      temperature: 0.8,
    },
    reviewPolicyIds: [],
    promptRecipeId: 'seedance-cinematic-v1',
  },
  video_generate: {
    capabilityId: 'video_generate',
    modelId: 'video-model@vendor',
    modelParams: {
      durationSeconds: 10,
    },
    reviewPolicyIds: [],
  },
};

describe('canvasGraphHelpers', () => {
  it('filters models by node modality', () => {
    expect(selectCanvasModels(models, 'video').map((item) => item.deploymentId)).toEqual([
      'video-model@vendor',
      'video-model-alt@vendor',
    ]);
  });

  it('builds config defaults from the model schema', () => {
    expect(buildDefaultParams(models[1])).toEqual({ aspectRatio: '1:1' });
  });

  it('uses stage defaults for workflow prompt and video nodes', () => {
    expect(resolveCanvasNodeDefaultModelId({ id: 'prompt-1', type: 'text', content: '', metadata: {} }, models, stageConfig)).toBe('text-model@vendor');
    expect(resolveCanvasNodeDefaultModelId({ id: 'video-1', type: 'video', content: '', metadata: {} }, models, stageConfig)).toBe('video-model@vendor');
  });

  it('keeps visual reference nodes manual by default', () => {
    expect(resolveCanvasNodeDefaultModelId({ id: 'visual-1', type: 'image', content: '', metadata: {} }, models, stageConfig)).toBe('');
  });

  it('creates new nodes with schema-backed params', () => {
    const node = createCanvasNode('video', 0, models, stageConfig);
    expect(node.modelId).toBe('video-model@vendor');
    expect(node.modeId).toBe('all_references');
    expect(node.params).toEqual({ durationSeconds: 10 });
  });

  it('uses stage model params when creating prompt nodes for episode workspace defaults', () => {
    const node = createCanvasNode('text', 0, models, stageConfig);
    expect(node.modelId).toBe('text-model@vendor');
    expect(node.params).toEqual({ temperature: 0.8 });
  });

  it('normalizes missing connections while keeping legacy nodes readable', () => {
    const content = normalizeCanvasContent({
      nodes: [{
        id: 'video-1',
        type: 'video',
        title: '输出',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        content: '',
      } as CanvasNode],
    }, models, stageConfig);

    expect(content.nodes[0].modelId).toBe('video-model@vendor');
    expect(content.connections).toEqual([]);
  });

  it('validates connections against model input schema', () => {
    const sourceNode: CanvasNode = {
      id: 'text-1',
      type: 'text',
      title: '提示词',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      content: '骑马飞驰',
    };
    const targetNode: CanvasNode = {
      id: 'video-1',
      type: 'video',
      title: '视频节点',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      content: '',
      modelId: 'video-model',
      modeId: 'all_references',
    };

    expect(validateCanvasConnection(sourceNode, targetNode, models, [])).toMatchObject({
      valid: true,
      resolvedInputKey: 'promptText',
    });
    expect(validateCanvasConnection(
      { ...sourceNode, type: 'audio' },
      targetNode,
      models,
      [],
    )).toMatchObject({
      valid: true,
      resolvedInputKey: 'referenceAssets',
    });
    expect(validateCanvasConnection(
      { ...sourceNode, type: 'video' },
      { ...targetNode, modeId: 'start_end_frames' },
      models,
      [],
    )).toEqual({ valid: false, error: '视频节点 当前模型不接受 video 输入。' });
  });

  it('collects connected upstream inputs by type', () => {
    const nodes: CanvasNode[] = [
      {
        id: 'text-1',
        type: 'text',
        title: '提示词',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        content: '骑马飞驰',
      },
      {
        id: 'image-1',
        type: 'image',
        title: '参考图',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        content: 'https://cdn.example.com/ref.png',
      },
      {
        id: 'video-1',
        type: 'video',
        title: '视频节点',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        content: '',
        modelId: 'video-model',
        modeId: 'all_references',
      },
    ];
    const connections: CanvasConnection[] = [
      { id: buildCanvasConnectionId('text-1', 'video-1', 'promptText'), from: 'text-1', to: 'video-1', inputKey: 'promptText' },
      { id: buildCanvasConnectionId('image-1', 'video-1', 'referenceAssets'), from: 'image-1', to: 'video-1', inputKey: 'referenceAssets' },
    ];

    const result = collectCanvasNodeInputs(nodes[2], nodes, connections, models);
    expect(result.promptText.items.map((item) => item.value)).toEqual(['骑马飞驰']);
    expect(result.referenceAssets.items.map((item) => item.value)).toEqual(['https://cdn.example.com/ref.png']);
  });

  it('carries compatible params across deployments in the same family and restores snapshots', () => {
    const baseNode: CanvasNode = {
      id: 'video-1',
      type: 'video',
      title: '视频节点',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      content: '',
      modelId: 'video-model@vendor',
      params: {
        durationSeconds: 10,
      },
      metadata: {},
    };

    const switchedToAlt = buildCanvasNodeModelChangePatch(baseNode, 'video-model-alt@vendor', models);
    expect(switchedToAlt.modelId).toBe('video-model-alt@vendor');
    expect(switchedToAlt.modeId).toBeUndefined();
    expect(switchedToAlt.params).toEqual({
      durationSeconds: 10,
      ratio: '9:16',
    });

    const altNode: CanvasNode = {
      ...baseNode,
      ...switchedToAlt,
    };
    const altParamPatch = buildCanvasNodeParamPatch(altNode, 'ratio', '16:9', models);
    const updatedAltNode: CanvasNode = {
      ...altNode,
      ...altParamPatch,
    };

    const switchedBack = buildCanvasNodeModelChangePatch(updatedAltNode, 'video-model@vendor', models);
    expect(switchedBack.modeId).toBe('all_references');
    expect(switchedBack.params).toEqual({
      durationSeconds: 10,
    });

    const restoredOriginalNode: CanvasNode = {
      ...updatedAltNode,
      ...switchedBack,
    };
    const switchedAgain = buildCanvasNodeModelChangePatch(restoredOriginalNode, 'video-model-alt@vendor', models);
    expect(switchedAgain.params).toEqual({
      durationSeconds: 10,
      ratio: '16:9',
    });
  });

  it('applies explicit stage preset values onto an existing node', () => {
    const baseNode: CanvasNode = {
      id: 'video-1',
      type: 'video',
      title: '视频节点',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      content: '',
      modelId: 'video-model-alt@vendor',
      params: {
        durationSeconds: 12,
        ratio: '16:9',
      },
      metadata: {},
    };

    const patch = buildCanvasNodeStagePresetPatch(baseNode, {
      capabilityId: 'video_generate',
      modelId: 'video-model@vendor',
      modelParams: {
        durationSeconds: 10,
      },
      reviewPolicyIds: [],
    }, models);

    expect(patch.modelId).toBe('video-model@vendor');
    expect(patch.params).toEqual({
      durationSeconds: 10,
    });
  });
});
