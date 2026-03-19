import { REVIEW_POLICIES } from './reviewRegistry.js';
import { getSkillSchema } from './skillSchemas.js';

export { REVIEW_POLICIES };

export const MODELS = [
  {
    familyId: 'gemini-3.1-pro',
    familyName: 'Gemini 3.1 Pro',
    deploymentId: 'gemini-3.1-pro@bltcy',
    providerModelId: 'gemini-3.1-pro-preview',
    aliases: ['gemini-3.1-pro-preview'],
    name: 'Gemini 3.1 Pro',
    vendor: 'bltcy',
    modality: 'text',
    capabilities: [
      'script_decompose',
      'episode_expand',
      'asset_extract',
      'image_prompt_generate',
      'video_prompt_generate',
      'voice_prompt_generate',
      'storyboard_generate',
    ],
    inputSchema: {
      contextTexts: {
        accepts: ['text'],
        label: '上下文文本',
        slotKind: 'prompt',
        required: false,
        multiple: true,
        maxItems: 8,
        showInNode: false,
      },
      referenceImages: {
        accepts: ['image'],
        label: '参考图片',
        slotKind: 'analysis',
        required: false,
        multiple: true,
        maxItems: 4,
        showInNode: false,
      },
    },
    configSchema: {
      temperature: { type: 'number', label: '温度', min: 0, max: 2, default: 0.4, step: 0.1 },
      maxOutputTokens: { type: 'number', label: '最大输出', min: 256, max: 32768, default: 4096, step: 256 },
    },
    adapter: 'bltcy-openai-chat',
  },
  {
    familyId: 'nano-banana-2',
    familyName: 'Nano Banana 2',
    deploymentId: 'nano-banana-2@bltcy',
    providerModelId: 'nano-banana-2',
    aliases: ['nano-banana-2'],
    name: 'Nano Banana 2',
    vendor: 'bltcy',
    modality: 'image',
    capabilities: ['character_generate', 'scene_generate', 'prop_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], label: '提示词', slotKind: 'prompt', required: false, maxItems: 1, showInNode: false },
      referenceImages: {
        accepts: ['image'],
        label: '参考图片',
        slotKind: 'reference',
        required: false,
        multiple: true,
        maxItems: 4,
        showInNode: true,
      },
    },
    configSchema: {
      aspectRatio: { type: 'string', label: '比例', enum: ['1:1', '3:4', '4:3', '9:16', '16:9'], default: '9:16' },
      imageSize: { type: 'string', label: '尺寸', enum: ['1K', '2K', '4K'], default: '2K' },
    },
    adapter: 'bltcy-image-generation',
  },
  {
    familyId: 'grok-video-3',
    familyName: 'Grok Video 3',
    deploymentId: 'grok-video-3@bltcy',
    providerModelId: 'grok-video-3',
    aliases: ['grok-video-3'],
    name: 'Grok Video 3',
    vendor: 'bltcy',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], label: '提示词', slotKind: 'prompt', required: false, maxItems: 1, showInNode: false },
      referenceImages: {
        accepts: ['image'],
        label: '参考图片',
        slotKind: 'reference',
        required: false,
        multiple: true,
        maxItems: 1,
        showInNode: true,
      },
    },
    configSchema: {
      ratio: { type: 'string', label: '比例', enum: ['1:1', '3:4', '4:3', '9:16', '16:9'], default: '9:16' },
      resolution: { type: 'string', label: '清晰度', enum: ['720P', '1080P'], default: '720P' },
      durationSeconds: { type: 'number', label: '时长', enum: [5, 10, 15], default: 5 },
    },
    adapter: 'bltcy-video-generation',
  },
  {
    familyId: 'seedance-2.0',
    familyName: 'Seedance 2.0',
    deploymentId: 'seedance-2.0@bendi',
    providerModelId: 'doubao-seedance-1-0-pro-250528',
    aliases: ['seedance-2.0@jimeng', 'doubao-seedance-1-0-pro-250528'],
    name: 'seedance2-bendi',
    vendor: 'bendi',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], label: '提示词', slotKind: 'prompt', required: false, maxItems: 1, showInNode: false },
      startFrame: { accepts: ['image'], label: '首帧', slotKind: 'frame', required: false, maxItems: 1, showInNode: true },
      endFrame: { accepts: ['image'], label: '尾帧', slotKind: 'frame', required: false, maxItems: 1, showInNode: true },
      referenceAssets: {
        accepts: ['image', 'video', 'audio'],
        label: '全能参考',
        slotKind: 'reference',
        required: false,
        multiple: true,
        maxItems: 12,
        showInNode: true,
      },
    },
    configSchema: {},
    generationModes: [
      {
        id: 'start_end_frames',
        label: '首尾帧',
        summaryLabel: '首尾帧',
        enabledInputKeys: ['promptText', 'startFrame', 'endFrame'],
      },
      {
        id: 'all_references',
        label: '全能参考',
        summaryLabel: '多参',
        enabledInputKeys: ['promptText', 'referenceAssets'],
      },
    ],
    defaultGenerationModeId: 'all_references',
    adapter: 'jimeng-video-generation',
  },
];

export const CAPABILITIES = [
  {
    id: 'script_decompose',
    name: 'Script Decompose',
    stageKind: 'script_decompose',
    inputSchema: {
      projectId: 'string',
      scriptSourceId: 'string?',
    },
    outputSchema: {
      storyBible: 'object',
      createdAssetCount: 'number',
      createdEpisodeCount: 'number',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'episode_expand',
    name: 'Episode Expand',
    stageKind: 'episode_expand',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      episodeContext: 'object',
      workspaceSeed: 'object',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'asset_extract',
    name: 'Asset Extract',
    stageKind: 'asset_design',
    inputSchema: {
      projectId: 'string',
      storyBible: 'object',
    },
    outputSchema: {
      assets: 'array',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'character_generate',
    name: 'Character Generate',
    stageKind: 'asset_design',
    inputSchema: {
      assetId: 'string',
      prompt: 'string?',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'nano-banana-2@bltcy',
    allowedModelIds: ['nano-banana-2@bltcy'],
  },
  {
    id: 'scene_generate',
    name: 'Scene Generate',
    stageKind: 'asset_design',
    inputSchema: {
      assetId: 'string',
      prompt: 'string?',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'nano-banana-2@bltcy',
    allowedModelIds: ['nano-banana-2@bltcy'],
  },
  {
    id: 'prop_generate',
    name: 'Prop Generate',
    stageKind: 'asset_design',
    inputSchema: {
      assetId: 'string',
      prompt: 'string?',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'nano-banana-2@bltcy',
    allowedModelIds: ['nano-banana-2@bltcy'],
  },
  {
    id: 'image_prompt_generate',
    name: 'Image Prompt Generate',
    stageKind: 'asset_design',
    inputSchema: {
      projectId: 'string',
      assetId: 'string?',
    },
    outputSchema: {
      prompt: 'string',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'video_prompt_generate',
    name: 'Video Prompt Generate',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
      promptRecipeId: 'string?',
    },
    outputSchema: {
      prompt: 'string',
      promptRecipeId: 'string',
      beatSheet: 'array',
      voicePrompt: 'string',
      shots: 'array',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'voice_prompt_generate',
    name: 'Voice Prompt Generate',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      prompt: 'string',
      voicePrompt: 'string',
      videoPrompt: 'string',
      promptRecipeId: 'string',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'storyboard_generate',
    name: 'Storyboard Generate',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      beats: 'array',
      beatSheet: 'array',
      prompt: 'string',
      promptRecipeId: 'string',
      shots: 'array',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'video_generate',
    name: 'Video Generate',
    stageKind: 'video_generate',
    inputSchema: {
      episodeId: 'string',
      prompt: 'string?',
      ratio: 'string?',
      resolution: 'string?',
      duration: 'number?',
      images: 'array?',
      audioReferenceUrls: 'array?',
      generateAudio: 'boolean?',
    },
    outputSchema: {
      previewUrl: 'string',
      taskId: 'string?',
    },
    defaultModelId: 'seedance-2.0@bendi',
    allowedModelIds: ['seedance-2.0@bendi', 'grok-video-3@bltcy'],
  },
];

export const SKILL_PACKS = [
  {
    id: 'seedance-director-v1',
    name: 'Seedance Director',
    stageKind: 'script_decompose',
    source: 'Seedance 2.0 AI 分镜师团队/skills/director-skill',
    executionRole: 'director',
    schemaId: 'seedance-director-core-v1',
    capabilitySchemaIds: {
      script_decompose: 'seedance-director-core-v1',
    },
    description: '把长剧本拆解为项目圣经、资产候选和剧集壳子。',
    promptMethodology:
      '先建立项目级世界规则和连续性边界，再整理角色、场景、道具与剧集壳子。',
    templates: {
      primaryOutput: 'director-analysis',
      artifacts: ['story_bible', 'character_candidates', 'scene_candidates', 'episode_shells'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'director-analysis-standard',
        name: '标准拆解',
        description: '稳定拆出项目圣经和剧集壳子。',
      },
    ],
    schema: getSkillSchema('seedance-director-core-v1'),
    schemasByCapability: {
      script_decompose: getSkillSchema('seedance-director-core-v1'),
    },
  },
  {
    id: 'seedance-episode-director-v1',
    name: 'Seedance Episode Director',
    stageKind: 'episode_expand',
    source: 'Seedance 2.0 AI 分镜师团队/skills/director-skill',
    executionRole: 'director',
    schemaId: 'seedance-episode-expand-core-v1',
    capabilitySchemaIds: {
      episode_expand: 'seedance-episode-expand-core-v1',
    },
    description: '把当前单集扩写成上下文包、分镜节拍和工作台 seed。',
    promptMethodology:
      '先归纳前情与锁定资产，再生成单集上下文、连续性状态和可下游消费的分镜节拍。',
    templates: {
      primaryOutput: 'episode-expansion',
      artifacts: ['episode_context', 'workspace_seed', 'storyboard_beats'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [],
    schema: getSkillSchema('seedance-episode-expand-core-v1'),
    schemasByCapability: {
      episode_expand: getSkillSchema('seedance-episode-expand-core-v1'),
    },
  },
  {
    id: 'seedance-art-design-v1',
    name: 'Seedance Asset Design',
    stageKind: 'asset_design',
    source: 'Seedance 2.0 AI 分镜师团队/skills/art-design-skill',
    executionRole: 'art-designer',
    schemaId: 'seedance-asset-design-core-v1',
    capabilitySchemaIds: {
      asset_extract: 'seedance-asset-design-core-v1',
      image_prompt_generate: 'seedance-image-prompt-core-v1',
    },
    description: '把项目圣经整理为角色、场景、道具等 canonical assets。',
    promptMethodology:
      '先收敛角色/场景/道具的 canonical 定义，再补齐预览提示词和版本化描述。',
    templates: {
      primaryOutput: 'asset-design',
      artifacts: ['character_prompt_pack', 'scene_prompt_pack', 'prop_prompt_pack'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'character-sheet-standard',
        name: '角色定板',
        description: '优先稳定角色形象和服化特征。',
      },
      {
        id: 'scene-grid-standard',
        name: '场景定板',
        description: '优先稳定场景构图、氛围和世界观细节。',
      },
    ],
    schema: getSkillSchema('seedance-asset-design-core-v1'),
    schemasByCapability: {
      asset_extract: getSkillSchema('seedance-asset-design-core-v1'),
      image_prompt_generate: getSkillSchema('seedance-image-prompt-core-v1'),
    },
  },
  {
    id: 'seedance-storyboard-v1',
    name: 'Seedance Storyboard',
    stageKind: 'video_prompt_generate',
    source: 'Seedance 2.0 AI 分镜师团队/skills/seedance-storyboard-skill',
    executionRole: 'storyboard-artist',
    schemaId: 'seedance-storyboard-core-v1',
    capabilitySchemaIds: {
      video_prompt_generate: 'seedance-storyboard-core-v1',
      voice_prompt_generate: 'seedance-storyboard-core-v1',
      storyboard_generate: 'seedance-storyboard-core-v1',
    },
    description: '把单集上下文整理成视频提示词、配音提示词和结构化分镜。',
    promptMethodology:
      '以单集上下文和锁定资产为基础，先出 beat，再出 shot，再收敛为视频提示词。',
    templates: {
      primaryOutput: 'seedance-prompts',
      artifacts: ['storyboard_beats', 'video_prompts', 'voice_prompts'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'seedance-cinematic-v1',
        name: '电影感',
        description: '强调镜头语言、构图和镜头推进。',
      },
      {
        id: 'seedance-emotional-beat-v1',
        name: '情绪优先',
        description: '强调情绪节拍和人物关系变化。',
      },
      {
        id: 'seedance-fast-cut-v1',
        name: '快切节奏',
        description: '强调镜头切换和短促节拍。',
      },
    ],
    schema: getSkillSchema('seedance-storyboard-core-v1'),
    schemasByCapability: {
      video_prompt_generate: getSkillSchema('seedance-storyboard-core-v1'),
      voice_prompt_generate: getSkillSchema('seedance-storyboard-core-v1'),
      storyboard_generate: getSkillSchema('seedance-storyboard-core-v1'),
    },
  },
];

export function getCapability(capabilityId) {
  return CAPABILITIES.find((item) => item.id === capabilityId);
}

function matchesModelIdentifier(model, modelId) {
  const normalizedModelId = String(modelId || '').trim();
  if (!normalizedModelId) {
    return false;
  }

  return [
    model.deploymentId,
    model.providerModelId,
    ...(Array.isArray(model.aliases) ? model.aliases : []),
  ].filter(Boolean).includes(normalizedModelId);
}

export function getModel(modelId) {
  return MODELS.find((item) => matchesModelIdentifier(item, modelId));
}

export function getSkillPack(skillPackId) {
  return SKILL_PACKS.find((item) => item.id === skillPackId);
}

export function resolveSkillPackCapabilitySchema(skillPack, capabilityId) {
  if (!skillPack) {
    return { schemaId: null, schema: null };
  }

  const schemaId = skillPack.capabilitySchemaIds?.[capabilityId] || skillPack.schemaId || null;
  const schema = skillPack.schemasByCapability?.[capabilityId] || skillPack.schema || (schemaId ? getSkillSchema(schemaId) : null);

  return {
    schemaId: schema?.id || schemaId,
    schema,
  };
}

export function buildDefaultStageConfig() {
  return {
    script_decompose: {
      skillPackId: 'seedance-director-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'script_decompose',
      modelId: 'gemini-3.1-pro@bltcy',
      modelParams: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    },
    asset_design: {
      skillPackId: 'seedance-art-design-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'asset_extract',
      modelId: 'gemini-3.1-pro@bltcy',
      modelParams: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    },
    episode_expand: {
      skillPackId: 'seedance-episode-director-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'episode_expand',
      modelId: 'gemini-3.1-pro@bltcy',
      modelParams: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    },
    video_prompt_generate: {
      skillPackId: 'seedance-storyboard-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'video_prompt_generate',
      modelId: 'gemini-3.1-pro@bltcy',
      modelParams: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
      promptRecipeId: 'seedance-cinematic-v1',
    },
    video_generate: {
      reviewPolicyIds: [],
      capabilityId: 'video_generate',
      modelId: 'seedance-2.0@bendi',
      modelParams: {},
    },
  };
}
