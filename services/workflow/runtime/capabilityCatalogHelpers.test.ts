import { describe, expect, it } from 'vitest';
import type { CapabilityDefinition, ModelDefinition } from '../../../types/workflowApp';
import {
  resolveCapabilityModelId,
  selectAllowedModels,
  selectCapability,
} from './capabilityCatalogHelpers';

const models: ModelDefinition[] = [
  {
    familyId: 'family-a',
    familyName: 'Family A',
    deploymentId: 'model-a@provider',
    providerModelId: 'model-a',
    name: 'Model A',
    vendor: 'vendor',
    modality: 'text',
    capabilities: ['script_decompose'],
    inputSchema: {},
    configSchema: {},
    adapter: 'adapter-a',
  },
  {
    familyId: 'family-b',
    familyName: 'Family B',
    deploymentId: 'model-b@provider',
    providerModelId: 'model-b',
    name: 'Model B',
    vendor: 'vendor',
    modality: 'text',
    capabilities: ['script_decompose', 'video_prompt_generate'],
    inputSchema: {},
    configSchema: {},
    adapter: 'adapter-b',
  },
  {
    familyId: 'family-c',
    familyName: 'Family C',
    deploymentId: 'model-c@provider',
    providerModelId: 'model-c',
    name: 'Model C',
    vendor: 'vendor',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {},
    configSchema: {},
    adapter: 'adapter-c',
  },
];

const capability: CapabilityDefinition = {
  id: 'video_prompt_generate',
  name: 'Video Prompt',
  stageKind: 'video_prompt_generate',
  inputSchema: {},
  outputSchema: {},
  defaultModelId: 'model-b@provider',
  allowedModelIds: ['model-b@provider', 'model-a@provider'],
};

describe('capabilityCatalogHelpers', () => {
  it('selects a capability by id', () => {
    expect(selectCapability([capability], 'video_prompt_generate')?.id).toBe('video_prompt_generate');
  });

  it('returns models in the allowed-model order for a capability', () => {
    expect(selectAllowedModels(models, capability).map((item) => item.deploymentId)).toEqual(['model-b@provider', 'model-a@provider']);
  });

  it('keeps a preferred model when it is allowed by the capability', () => {
    expect(resolveCapabilityModelId(models, capability, 'model-a')).toBe('model-a@provider');
  });

  it('falls back to the capability default model when the preferred model is invalid', () => {
    expect(resolveCapabilityModelId(models, capability, 'model-c')).toBe('model-b@provider');
  });

  it('returns the preferred model unchanged when the capability is missing', () => {
    expect(resolveCapabilityModelId(models, null, 'model-c')).toBe('model-c');
  });
});
