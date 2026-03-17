export const REVIEW_POLICIES = [
  {
    id: 'business-review',
    name: '业务审查',
    description: '检查叙事完整性、风格一致性、阶段产出质量与可执行性。',
    defaultEnabledStageKinds: ['script_decompose', 'asset_design', 'video_prompt_generate'],
  },
  {
    id: 'compliance-review',
    name: '合规审查',
    description: '检查版权、真人风险、政治敏感、暴力尺度与平台内容合规性。',
    defaultEnabledStageKinds: ['script_decompose', 'asset_design', 'video_prompt_generate'],
  },
];

export const MODELS = [
  {
    id: 'google-gemini-2.5-pro-text',
    name: 'Gemini 2.5 Pro',
    vendor: 'google',
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
    configSchema: {
      temperature: { type: 'number', min: 0, max: 2, default: 0.7 },
      maxOutputTokens: { type: 'number', min: 256, max: 32768, default: 4096 },
    },
    adapter: 'google-text',
  },
  {
    id: 'google-gemini-2.5-flash-text',
    name: 'Gemini 2.5 Flash',
    vendor: 'google',
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
    configSchema: {
      temperature: { type: 'number', min: 0, max: 2, default: 0.5 },
      maxOutputTokens: { type: 'number', min: 256, max: 16384, default: 2048 },
    },
    adapter: 'google-text',
  },
  {
    id: 'openai-gpt-image-1',
    name: 'GPT Image 1',
    vendor: 'openai',
    modality: 'image',
    capabilities: ['character_generate', 'scene_generate', 'prop_generate'],
    configSchema: {
      size: { type: 'string', enum: ['1024x1024', '1536x1024', '1024x1536'], default: '1024x1024' },
    },
    adapter: 'openai-image',
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    vendor: 'seedance',
    modality: 'image',
    capabilities: ['character_generate', 'scene_generate', 'prop_generate'],
    configSchema: {
      aspectRatio: { type: 'string', enum: ['1:1', '3:4', '4:3', '9:16', '16:9'], default: '9:16' },
    },
    adapter: 'generic-image',
  },
  {
    id: 'seedance-2-pro',
    name: 'Seedance 2 Pro',
    vendor: 'seedance',
    modality: 'video',
    capabilities: ['video_generate'],
    configSchema: {
      durationSeconds: { type: 'number', enum: [5, 8, 10, 15], default: 8 },
      quality: { type: 'string', enum: ['std', 'pro'], default: 'pro' },
    },
    adapter: 'seedance-video',
  },
  {
    id: 'kling-v2',
    name: 'Kling v2',
    vendor: 'kling',
    modality: 'video',
    capabilities: ['video_generate'],
    configSchema: {
      durationSeconds: { type: 'number', enum: [5, 8, 10], default: 5 },
      quality: { type: 'string', enum: ['std', 'pro'], default: 'std' },
    },
    adapter: 'generic-video',
  },
  {
    id: 'openai-gpt-4o-mini-voice',
    name: 'GPT-4o Mini Voice',
    vendor: 'openai',
    modality: 'audio',
    capabilities: ['voice_prompt_generate'],
    configSchema: {
      tone: { type: 'string', enum: ['neutral', 'dramatic', 'gentle'], default: 'dramatic' },
    },
    adapter: 'voice-text',
  },
];

export const CAPABILITIES = [
  {
    id: 'script_decompose',
    name: '剧本拆解',
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
    defaultModelId: 'google-gemini-2.5-pro-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text'],
  },
  {
    id: 'episode_expand',
    name: '单集分析',
    stageKind: 'episode_expand',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      episodeContext: 'object',
      workspaceSeed: 'object',
    },
    defaultModelId: 'google-gemini-2.5-pro-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text'],
  },
  {
    id: 'asset_extract',
    name: '资产提取',
    stageKind: 'asset_design',
    inputSchema: {
      projectId: 'string',
      storyBible: 'object',
    },
    outputSchema: {
      assets: 'array',
    },
    defaultModelId: 'google-gemini-2.5-pro-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text'],
  },
  {
    id: 'character_generate',
    name: '角色生成',
    stageKind: 'asset_design',
    inputSchema: {
      assetId: 'string',
      prompt: 'string',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'nano-banana-pro',
    allowedModelIds: ['nano-banana-pro', 'openai-gpt-image-1'],
  },
  {
    id: 'scene_generate',
    name: '场景生成',
    stageKind: 'asset_design',
    inputSchema: {
      assetId: 'string',
      prompt: 'string',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'nano-banana-pro',
    allowedModelIds: ['nano-banana-pro', 'openai-gpt-image-1'],
  },
  {
    id: 'prop_generate',
    name: '道具生成',
    stageKind: 'asset_design',
    inputSchema: {
      assetId: 'string',
      prompt: 'string',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'nano-banana-pro',
    allowedModelIds: ['nano-banana-pro', 'openai-gpt-image-1'],
  },
  {
    id: 'image_prompt_generate',
    name: '图片提示词生成',
    stageKind: 'asset_design',
    inputSchema: {
      projectId: 'string',
      assetId: 'string?',
    },
    outputSchema: {
      prompt: 'string',
    },
    defaultModelId: 'google-gemini-2.5-pro-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text'],
  },
  {
    id: 'video_prompt_generate',
    name: '视频提示词生成',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
      promptRecipeId: 'string?',
    },
    outputSchema: {
      prompt: 'string',
      promptRecipeId: 'string',
    },
    defaultModelId: 'google-gemini-2.5-pro-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text'],
  },
  {
    id: 'voice_prompt_generate',
    name: '语音提示词生成',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      prompt: 'string',
    },
    defaultModelId: 'google-gemini-2.5-flash-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text', 'openai-gpt-4o-mini-voice'],
  },
  {
    id: 'storyboard_generate',
    name: '分镜生成',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      beats: 'array',
    },
    defaultModelId: 'google-gemini-2.5-pro-text',
    allowedModelIds: ['google-gemini-2.5-pro-text', 'google-gemini-2.5-flash-text'],
  },
  {
    id: 'video_generate',
    name: '视频生成',
    stageKind: 'video_generate',
    inputSchema: {
      episodeId: 'string',
      prompt: 'string',
    },
    outputSchema: {
      previewUrl: 'string',
    },
    defaultModelId: 'seedance-2-pro',
    allowedModelIds: ['seedance-2-pro', 'kling-v2'],
  },
];

export const SKILL_PACKS = [
  {
    id: 'seedance-director-v1',
    name: 'Seedance 导演分析',
    stageKind: 'script_decompose',
    source: 'Seedance 2.0 AI 分镜师团队/director-skill',
    executionRole: 'director',
    description: '将剧本拆为导演分析、剧情点、人物清单和场景清单，供后续资产和分镜阶段使用。',
    promptMethodology:
      '围绕叙事段落而不是单镜头拆解，每个剧情点保持完整叙事意图，并明确角色、场景、动作和情绪推进。',
    templates: {
      primaryOutput: 'director-analysis',
      artifacts: ['story_bible', 'character_candidates', 'scene_candidates', 'episode_shells'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'director-analysis-standard',
        name: '标准导演分析',
        description: '面向长篇漫剧的标准分集与剧情点分析。',
      },
    ],
  },
  {
    id: 'seedance-art-design-v1',
    name: 'Seedance 资产设计',
    stageKind: 'asset_design',
    source: 'Seedance 2.0 AI 分镜师团队/art-design-skill',
    executionRole: 'art-designer',
    description: '根据导演分析输出角色设定与场景设计提示词，并组织为稳定可复用的资产库。',
    promptMethodology:
      '使用叙事式图像提示词生成角色设定图和场景九宫格，重点描述服装、气质、光影和空间关系。',
    templates: {
      primaryOutput: 'asset-design',
      artifacts: ['character_prompt_pack', 'scene_prompt_pack'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'character-sheet-standard',
        name: '角色设定标准版',
        description: '左侧脸部特写，右侧三视图设定图。',
      },
      {
        id: 'scene-grid-standard',
        name: '场景九宫格标准版',
        description: '统一风格输出多场景环境设计稿。',
      },
    ],
  },
  {
    id: 'seedance-storyboard-v1',
    name: 'Seedance 分镜提示词',
    stageKind: 'video_prompt_generate',
    source: 'Seedance 2.0 AI 分镜师团队/seedance-storyboard-skill',
    executionRole: 'storyboard-artist',
    description: '将导演叙事分析与锁定资产合并为 Seedance 2.0 动态视频提示词。',
    promptMethodology:
      '每个剧情点映射为一条完整 Seedance 提示词，使用资产引用、连续镜头和时长节奏约束组织画面。',
    templates: {
      primaryOutput: 'seedance-prompts',
      artifacts: ['storyboard_beats', 'video_prompts'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'seedance-cinematic-v1',
        name: '电影感叙事',
        description: '强调情绪推进、镜头移动和光影氛围的标准长段落写法。',
      },
      {
        id: 'seedance-emotional-beat-v1',
        name: '情绪重拍版',
        description: '强化人物动作和表情细节，适合高情绪波动段落。',
      },
      {
        id: 'seedance-fast-cut-v1',
        name: '快切节奏版',
        description: '强化多镜头切换、运动强度和节奏感。',
      },
    ],
  },
];

export function getCapability(capabilityId) {
  return CAPABILITIES.find((item) => item.id === capabilityId);
}

export function getModel(modelId) {
  return MODELS.find((item) => item.id === modelId);
}

export function getSkillPack(skillPackId) {
  return SKILL_PACKS.find((item) => item.id === skillPackId);
}

export function buildDefaultStageConfig() {
  return {
    script_decompose: {
      skillPackId: 'seedance-director-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'script_decompose',
      modelId: 'google-gemini-2.5-pro-text',
    },
    asset_design: {
      skillPackId: 'seedance-art-design-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'asset_extract',
      modelId: 'google-gemini-2.5-pro-text',
    },
    episode_expand: {
      skillPackId: 'seedance-director-v1',
      reviewPolicyIds: [],
      capabilityId: 'episode_expand',
      modelId: 'google-gemini-2.5-pro-text',
    },
    video_prompt_generate: {
      skillPackId: 'seedance-storyboard-v1',
      reviewPolicyIds: ['business-review', 'compliance-review'],
      capabilityId: 'video_prompt_generate',
      modelId: 'google-gemini-2.5-pro-text',
      promptRecipeId: 'seedance-cinematic-v1',
    },
    video_generate: {
      reviewPolicyIds: [],
      capabilityId: 'video_generate',
      modelId: 'seedance-2-pro',
    },
  };
}
