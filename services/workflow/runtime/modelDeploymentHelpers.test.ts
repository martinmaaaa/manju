import { describe, expect, it } from 'vitest';
import type { ModelDefinition } from '../../../types/workflowApp';
import {
  describeModelRuntime,
  findModelByIdentifier,
  formatModelDisplayName,
  formatModelFamilyName,
  groupModelsByFamily,
  getModelIdentifiers,
  getModelOptionValue,
  matchesModelIdentifier,
  normalizeModelIdentifier,
  summarizeModelConfigFields,
  summarizeModelInputSupport,
} from './modelDeploymentHelpers';

const models: ModelDefinition[] = [
  {
    familyId: 'grok-video-3',
    familyName: 'Grok Video 3',
    deploymentId: 'grok-video-3@bltcy',
    providerModelId: 'grok-video-3',
    aliases: ['legacy-grok-video-3'],
    name: 'Grok Video 3',
    vendor: 'bltcy',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], label: '文本提示', maxItems: 1, showInNode: false },
      referenceImages: { accepts: ['image'], label: '参考图片', multiple: true, maxItems: 2, showInNode: true },
    },
    configSchema: {
      ratio: { type: 'string', label: '比例', enum: ['9:16'] },
      durationSeconds: { type: 'number', label: '时长', default: 5 },
    },
    adapter: 'bltcy-video-generation',
  },
  {
    familyId: 'grok-video-3',
    familyName: 'Grok Video 3',
    deploymentId: 'grok-video-3@another',
    providerModelId: 'grok-video-3-alt',
    name: 'Grok Video 3 · another',
    vendor: 'another',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {},
    configSchema: {},
    adapter: 'another-video-generation',
  },
];

describe('modelDeploymentHelpers', () => {
  it('returns all supported identifiers for a deployment', () => {
    expect(getModelIdentifiers(models[0])).toEqual([
      'grok-video-3@bltcy',
      'grok-video-3',
      'legacy-grok-video-3',
    ]);
  });

  it('matches deployment, provider, and legacy identifiers', () => {
    expect(matchesModelIdentifier(models[0], 'grok-video-3@bltcy')).toBe(true);
    expect(matchesModelIdentifier(models[0], 'grok-video-3')).toBe(true);
    expect(matchesModelIdentifier(models[0], 'legacy-grok-video-3')).toBe(true);
  });

  it('normalizes any recognized identifier to deploymentId', () => {
    expect(normalizeModelIdentifier(models, 'grok-video-3')).toBe('grok-video-3@bltcy');
    expect(normalizeModelIdentifier(models, 'legacy-grok-video-3')).toBe('grok-video-3@bltcy');
  });

  it('finds a deployment by any recognized identifier', () => {
    expect(findModelByIdentifier(models, 'grok-video-3')?.deploymentId).toBe('grok-video-3@bltcy');
    expect(getModelOptionValue(models[0])).toBe('grok-video-3@bltcy');
  });

  it('groups deployments by family with a stable family label', () => {
    expect(groupModelsByFamily(models)).toEqual([
      {
        familyId: 'grok-video-3',
        familyName: 'Grok Video 3',
        deployments: models,
      },
    ]);
    expect(formatModelFamilyName(models[0])).toBe('Grok Video 3');
  });

  it('treats deployment name as the only UI display label', () => {
    expect(formatModelDisplayName({
      ...models[0],
      name: 'seedance2-bendi',
      vendor: 'bendi',
    })).toBe('seedance2-bendi');
    expect(formatModelDisplayName(models[0])).toBe('Grok Video 3');
  });

  it('summarizes input support, config fields, and runtime mode', () => {
    expect(summarizeModelInputSupport(models[0])).toEqual(['文本提示', '参考图片 x2']);
    expect(summarizeModelConfigFields(models[0])).toEqual(['比例', '时长']);
    expect(describeModelRuntime(models[0])).toBe('服务端直连 BLTCY 视频运行时');
    expect(summarizeModelInputSupport(models[1])).toEqual(['无需上游输入']);
    expect(summarizeModelConfigFields(models[1])).toEqual(['无额外参数']);
    expect(describeModelRuntime(models[1])).toBe('运行时：another-video-generation');
  });
});
