import { describe, expect, it } from 'vitest';
import type { ModelDefinition, SkillPack, StageConfig } from '../../../types/workflowApp';
import {
  applySkillPackSelection,
  applyStageModelParamChange,
  applyStageModelSelection,
  resolveStageModelParams,
  selectSkillPackCapabilitySchemaId,
  selectStagePromptRecipe,
  selectStageSkillPack,
} from './stageConfigHelpers';

const directorPack: SkillPack = {
  id: 'director-pack',
  name: 'Director Pack',
  stageKind: 'script_decompose',
  source: 'seedance/director',
  executionRole: 'director',
  schemaId: 'director-core-v1',
  description: 'Director decomposition pack',
  promptMethodology: 'Break story into structured beats.',
  capabilitySchemaIds: {
    script_decompose: 'director-core-v1',
  },
  assets: {
    primaryOutput: 'director-analysis',
    artifacts: ['story_bible'],
  },
  templates: {
    primaryOutput: 'director-analysis',
    artifacts: ['story_bible'],
  },
  reviewPolicies: ['business-review', 'compliance-review'],
  promptRecipes: [
    {
      id: 'director-standard',
      name: 'Director Standard',
      description: 'Stable story decomposition.',
    },
  ],
};

const videoPack: SkillPack = {
  id: 'video-pack',
  name: 'Video Prompt Pack',
  stageKind: 'video_prompt_generate',
  source: 'seedance/storyboard',
  executionRole: 'storyboard-artist',
  schemaId: 'video-pack-default',
  description: 'Video prompt pack',
  promptMethodology: 'Keep cinematic intent stable.',
  capabilitySchemaIds: {
    video_prompt_generate: 'video-prompt-core-v1',
  },
  assets: {
    primaryOutput: 'video-prompt',
    artifacts: ['prompt'],
  },
  templates: {
    primaryOutput: 'video-prompt',
    artifacts: ['prompt'],
  },
  reviewPolicies: ['business-review'],
  promptRecipes: [
    {
      id: 'cinematic-v1',
      name: 'Cinematic',
      description: 'Cinematic camera language.',
    },
    {
      id: 'emotional-v1',
      name: 'Emotional',
      description: 'Emotion-first pacing.',
    },
  ],
};

const models: ModelDefinition[] = [
  {
    familyId: 'gemini-3.1-pro',
    familyName: 'Gemini 3.1 Pro',
    deploymentId: 'gemini-3.1-pro@bltcy',
    providerModelId: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    vendor: 'bltcy',
    modality: 'text',
    capabilities: ['script_decompose', 'video_prompt_generate'],
    inputSchema: {},
    configSchema: {
      temperature: { type: 'number', default: 0.4 },
      maxOutputTokens: { type: 'number', default: 4096 },
    },
    adapter: 'bltcy-openai-chat',
  },
  {
    familyId: 'video-family',
    familyName: 'Video Family',
    deploymentId: 'video-a@vendor',
    providerModelId: 'video-a',
    name: 'Video A',
    vendor: 'vendor',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {},
    configSchema: {
      durationSeconds: { type: 'number', default: 5 },
    },
    adapter: 'video-a',
  },
  {
    familyId: 'video-family',
    familyName: 'Video Family',
    deploymentId: 'video-b@vendor',
    providerModelId: 'video-b',
    name: 'Video B',
    vendor: 'vendor',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {},
    configSchema: {
      durationSeconds: { type: 'number', default: 5 },
      ratio: { type: 'string', enum: ['9:16', '16:9'], default: '9:16' },
    },
    adapter: 'video-b',
  },
];

describe('stageConfigHelpers', () => {
  it('selects the configured skill pack for a stage', () => {
    const stage: StageConfig = {
      capabilityId: 'script_decompose',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: [],
      skillPackId: 'director-pack',
    };

    expect(selectStageSkillPack([directorPack, videoPack], 'script_decompose', stage)?.id).toBe('director-pack');
  });

  it('resolves capability-scoped schema ids from the selected skill pack', () => {
    expect(selectSkillPackCapabilitySchemaId(videoPack, 'video_prompt_generate')).toBe('video-prompt-core-v1');
    expect(selectSkillPackCapabilitySchemaId(directorPack, 'episode_expand')).toBe('director-core-v1');
    expect(selectSkillPackCapabilitySchemaId(null, 'video_prompt_generate')).toBeNull();
  });

  it('applies skill pack review defaults and seeds the first video prompt recipe', () => {
    const stage: StageConfig = {
      capabilityId: 'video_prompt_generate',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: [],
    };

    expect(applySkillPackSelection('video_prompt_generate', stage, videoPack)).toEqual({
      capabilityId: 'video_prompt_generate',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: ['business-review'],
      skillPackId: 'video-pack',
      promptRecipeId: 'cinematic-v1',
    });
  });

  it('preserves an existing valid prompt recipe for the selected video prompt pack', () => {
    const stage: StageConfig = {
      capabilityId: 'video_prompt_generate',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: ['custom-review'],
      skillPackId: 'video-pack',
      promptRecipeId: 'emotional-v1',
    };

    const updated = applySkillPackSelection('video_prompt_generate', stage, videoPack);
    expect(updated.promptRecipeId).toBe('emotional-v1');
    expect(updated.reviewPolicyIds).toEqual(['business-review']);
  });

  it('falls back to the first recipe when the stored recipe is invalid', () => {
    const stage: StageConfig = {
      capabilityId: 'video_prompt_generate',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: [],
      skillPackId: 'video-pack',
      promptRecipeId: 'missing-recipe',
    };

    const recipe = selectStagePromptRecipe('video_prompt_generate', stage, videoPack);
    expect(recipe?.id).toBe('cinematic-v1');
  });

  it('clears prompt recipe when video prompt stage has no selected skill pack', () => {
    const stage: StageConfig = {
      capabilityId: 'video_prompt_generate',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: ['business-review'],
      promptRecipeId: 'cinematic-v1',
    };

    const updated = applySkillPackSelection('video_prompt_generate', stage, null);
    expect(updated.reviewPolicyIds).toEqual([]);
    expect(updated.promptRecipeId).toBeUndefined();
  });

  it('resolves stage model params with deployment defaults', () => {
    const stage: StageConfig = {
      capabilityId: 'script_decompose',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: [],
      modelParams: {
        temperature: 0.7,
      },
    };

    expect(resolveStageModelParams(stage, models)).toEqual({
      temperature: 0.7,
      maxOutputTokens: 4096,
    });
  });

  it('keeps compatible params when switching deployments within the same family', () => {
    const stage: StageConfig = {
      capabilityId: 'video_generate',
      modelId: 'video-a@vendor',
      reviewPolicyIds: [],
      modelParams: {
        durationSeconds: 10,
      },
    };

    expect(applyStageModelSelection(stage, 'video-b@vendor', models)).toEqual({
      capabilityId: 'video_generate',
      modelId: 'video-b@vendor',
      reviewPolicyIds: [],
      modelParams: {
        durationSeconds: 10,
        ratio: '9:16',
      },
    });
  });

  it('updates a single stage model param against the resolved deployment schema', () => {
    const stage: StageConfig = {
      capabilityId: 'script_decompose',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: [],
      modelParams: {
        temperature: 0.4,
      },
    };

    expect(applyStageModelParamChange(stage, 'maxOutputTokens', 8192, models)).toEqual({
      capabilityId: 'script_decompose',
      modelId: 'gemini-3.1-pro@bltcy',
      reviewPolicyIds: [],
      modelParams: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    });
  });
});
