export const REVIEW_POLICIES = [
  {
    id: 'business-review',
    name: '业务审查',
    description: '检查阶段输出是否完整、可推进，并符合当前漫剧生产节点的交付要求。',
    defaultEnabledStageKinds: ['script_decompose', 'asset_design', 'video_prompt_generate'],
  },
  {
    id: 'compliance-review',
    name: '合规审查',
    description: '检查文本输出是否触发内容合规风险或命中禁用词。',
    defaultEnabledStageKinds: ['script_decompose', 'asset_design', 'video_prompt_generate'],
  },
];

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
    inputSchema: {},
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
      text: { type: 'text', label: '文本提示', required: false, maxItems: 1 },
      images: { type: 'image', label: '参考图片', required: false, multiple: true, maxItems: 4 },
    },
    configSchema: {
      aspectRatio: { type: 'string', label: '比例', enum: ['1:1', '3:4', '4:3', '9:16', '16:9'], default: '9:16' },
      imageSize: { type: 'string', label: '清晰度', enum: ['1K', '2K', '4K'], default: '2K' },
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
      text: { type: 'text', label: '文本提示', required: false, maxItems: 1 },
      images: { type: 'image', label: '参考图片', required: false, multiple: true, maxItems: 1 },
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
      text: { type: 'text', label: '文本提示', required: false, maxItems: 1 },
      images: { type: 'image', label: '参考图片', required: false, multiple: true, maxItems: 2 },
    },
    configSchema: {},
    adapter: 'jimeng-video-generation',
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
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
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
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'asset_extract',
    name: '资产抽取',
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
    name: '角色出图',
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
    name: '场景出图',
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
    name: '道具出图',
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
    name: '图片提示词生成',
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
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'voice_prompt_generate',
    name: '配音提示词生成',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      prompt: 'string',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'storyboard_generate',
    name: '分镜节拍生成',
    stageKind: 'video_prompt_generate',
    inputSchema: {
      episodeId: 'string',
    },
    outputSchema: {
      beats: 'array',
    },
    defaultModelId: 'gemini-3.1-pro@bltcy',
    allowedModelIds: ['gemini-3.1-pro@bltcy'],
  },
  {
    id: 'video_generate',
    name: '视频生成',
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
    name: 'Seedance 导演分析',
    stageKind: 'script_decompose',
    source: 'Seedance 2.0 AI 分镜师团队/skills/director-skill',
    executionRole: 'director',
    description: '面向剧本拆解阶段，聚焦故事主线、人物关系、世界观、集数拆分和连续性规则。',
    promptMethodology:
      '先抽取全局叙事骨架，再拆分人物、场景、道具和剧集节奏，最后输出适合后续资产与单集工作台消费的结构化结果。',
    templates: {
      primaryOutput: 'director-analysis',
      artifacts: ['story_bible', 'character_candidates', 'scene_candidates', 'episode_shells'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'director-analysis-standard',
        name: '标准导演拆解',
        description: '适合先把剧本拆成稳定的剧情框架、人物设定和剧集壳子。',
      },
    ],
  },
  {
    id: 'seedance-art-design-v1',
    name: 'Seedance 资产设计',
    stageKind: 'asset_design',
    source: 'Seedance 2.0 AI 分镜师团队/skills/art-design-skill',
    executionRole: 'art-designer',
    description: '将角色、场景、道具重组为可锁定的 canonical assets，并产出可直接用于出图的视频美术描述。',
    promptMethodology:
      '围绕角色识别、场景识别和道具识别输出稳定的描述词，强调一致性、风格统一和可复用性。',
    templates: {
      primaryOutput: 'asset-design',
      artifacts: ['character_prompt_pack', 'scene_prompt_pack', 'prop_prompt_pack'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'character-sheet-standard',
        name: '角色形象标准版',
        description: '适合锁定角色主体、服装、表情和镜头参考描述。',
      },
      {
        id: 'scene-grid-standard',
        name: '场景格标准版',
        description: '适合把场景结构、光线和空间关系写成稳定的场景提示词。',
      },
    ],
  },
  {
    id: 'seedance-storyboard-v1',
    name: 'Seedance 分镜提示词',
    stageKind: 'video_prompt_generate',
    source: 'Seedance 2.0 AI 分镜师团队/skills/seedance-storyboard-skill',
    executionRole: 'storyboard-artist',
    description: '针对单集工作台生成分镜节拍、视频提示词和配音提示词，强调可直接投喂视频模型。',
    promptMethodology:
      '以剧情目标、情绪推进、镜头语言和资产连续性为核心，把单集内容变成结构化 beat sheet 与视频提示词。',
    templates: {
      primaryOutput: 'seedance-prompts',
      artifacts: ['storyboard_beats', 'video_prompts', 'voice_prompts'],
    },
    reviewPolicies: ['business-review', 'compliance-review'],
    promptRecipes: [
      {
        id: 'seedance-cinematic-v1',
        name: '电影化镜头',
        description: '更强调镜头调度、景别切换和电影化画面语言。',
      },
      {
        id: 'seedance-emotional-beat-v1',
        name: '情绪推进',
        description: '更强调情绪节点、人物关系推进和表演重心。',
      },
      {
        id: 'seedance-fast-cut-v1',
        name: '快切节奏',
        description: '更强调快节奏镜头、短 beat 和高动势剪辑感。',
      },
    ],
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
      skillPackId: 'seedance-director-v1',
      reviewPolicyIds: [],
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
