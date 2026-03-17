import { buildEpisodeContext, buildEpisodeWorkspaceSeed, buildStoryBible } from './scriptExtraction.js';
import {
  createVideoTaskWithModel,
  generateImageWithModel,
  generateJsonWithModel,
  hasLiveImageModelSupport,
  hasLiveModelSupport,
  hasLiveTextModelSupport,
  hasLiveVideoModelSupport,
  pollVideoTask,
} from './modelRuntime.js';
import { buildDefaultStageConfig, getCapability, getModel, getSkillPack } from './registries.js';
import {
  createCapabilityRun,
  createOrUpdateAsset,
  createWorkflowRun,
  finishCapabilityRun,
  finishWorkflowRun,
  getAssetById,
  getEpisodeById,
  getEpisodeContext,
  getEpisodeWorkspace,
  getLatestScriptSource,
  getProjectById,
  listAssetsByProjectId,
  listEpisodesByProjectId,
  replaceEpisodes,
  updateEpisodeStatus,
  updateProjectSetup,
  upsertEpisodeContext,
  upsertEpisodeWorkspace,
  upsertStoryBible,
} from './workflowStore.js';

const COMPLIANCE_BLOCKLIST = ['血腥酷刑', '成人视频', '仇恨暴力', '未成年人性内容'];

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function summarizeStyle(project) {
  return [
    project.setup?.styleSummary || '',
    project.setup?.targetMedium ? `目标媒介：${project.setup.targetMedium}` : '',
    project.setup?.aspectRatio ? `画面比例：${project.setup.aspectRatio}` : '',
    Array.isArray(project.setup?.globalPrompts) && project.setup.globalPrompts.length
      ? `全局提示词：${project.setup.globalPrompts.join('；')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function inferAssetPrompt({ asset, project, skillPack }) {
  return [
    `${asset.name}`,
    asset.description || '',
    project.setup?.styleSummary ? `项目风格：${project.setup.styleSummary}` : '',
    skillPack?.promptMethodology ? `方法论：${skillPack.promptMethodology}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function pickAssetVersion(asset) {
  return asset?.versions?.find((item) => item.id === asset.currentVersionId) || asset?.versions?.[0] || null;
}

function buildMockAssetUrl(assetId, capabilityId) {
  return `mock://${capabilityId}/${assetId}/${Date.now()}`;
}

function buildMockVideoUrl(episodeId) {
  return `mock://video/${episodeId}/${Date.now()}`;
}

function normalizeStoryBibleFromModel(raw, fallback) {
  const data = asObject(raw);
  const mergeList = (fieldName) => {
    const values = cleanArray(data[fieldName]).map((item) => String(item || '').trim()).filter(Boolean);
    return values.length > 0 ? values : fallback[fieldName];
  };
  const mergeEntityList = (fieldName) => {
    const values = cleanArray(data[fieldName])
      .map((item) => ({
        name: String(item?.name || '').trim(),
        description: String(item?.description || '').trim(),
      }))
      .filter((item) => item.name);
    return values.length > 0 ? values : fallback[fieldName];
  };

  const episodes = cleanArray(data.episodes)
    .map((item, index) => ({
      episodeNumber: Number(item?.episodeNumber ?? index + 1) || index + 1,
      title: String(item?.title || '').trim(),
      synopsis: String(item?.synopsis || '').trim(),
      sourceText: String(item?.sourceText || '').trim(),
    }))
    .filter((item) => item.title);

  return {
    ...fallback,
    title: String(data.title || '').trim() || fallback.title,
    logline: String(data.logline || '').trim() || fallback.logline,
    summary: String(data.summary || '').trim() || fallback.summary,
    worldRules: mergeList('worldRules'),
    continuityRules: mergeList('continuityRules'),
    characters: mergeEntityList('characters'),
    scenes: mergeEntityList('scenes'),
    props: mergeEntityList('props'),
    episodes: episodes.length > 0 ? episodes : fallback.episodes,
  };
}

function normalizeAssetPack(raw, fallbackAssets) {
  const data = asObject(raw);
  const assets = cleanArray(data.assets)
    .map((item) => ({
      type: String(item?.type || '').trim(),
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim(),
      promptText: String(item?.promptText || '').trim(),
      previewHint: String(item?.previewHint || '').trim(),
    }))
    .filter((item) => item.type && item.name);

  return {
    assets: assets.length > 0 ? assets : fallbackAssets,
  };
}

function normalizeEpisodeExpansion(raw, fallback) {
  const data = asObject(raw);
  const beats = cleanArray(data.storyboardBeats).map((item) => String(item || '').trim()).filter(Boolean);

  return {
    contextSummary: String(data.contextSummary || '').trim() || fallback.contextSummary,
    precedingSummary: String(data.precedingSummary || '').trim() || fallback.precedingSummary,
    storyboardBeats: beats.length > 0 ? beats : fallback.storyboardBeats,
    continuityState: Object.keys(asObject(data.continuityState)).length > 0 ? asObject(data.continuityState) : fallback.continuityState,
  };
}

function normalizePromptPayload(raw, fallback) {
  const data = asObject(raw);
  const beatSheet = cleanArray(data.beatSheet).map((item) => String(item || '').trim()).filter(Boolean);

  return {
    prompt: String(data.prompt || '').trim() || fallback.prompt,
    beatSheet: beatSheet.length > 0 ? beatSheet : fallback.beatSheet,
    voicePrompt: String(data.voicePrompt || '').trim() || fallback.voicePrompt,
  };
}

async function maybeGenerateStructuredOutput({ model, systemInstruction, prompt, normalizer, fallbackFactory }) {
  const fallback = fallbackFactory();
  if (!hasLiveTextModelSupport(model)) {
    return fallback;
  }

  try {
    const raw = await generateJsonWithModel({ model, systemInstruction, prompt });
    return normalizer(raw, fallback);
  } catch (error) {
    console.warn('[capability] falling back to local structured output:', error);
    return fallback;
  }
}

async function createAssetsFromStoryBible({ projectId, storyBible, userId }) {
  const created = [];

  for (const character of storyBible.characters || []) {
    created.push(await createOrUpdateAsset({
      projectId,
      type: 'character',
      name: character.name,
      description: character.description,
      metadata: { source: 'script_decompose', category: 'character' },
      promptText: character.description,
      createdBy: userId,
    }));
  }

  for (const scene of storyBible.scenes || []) {
    created.push(await createOrUpdateAsset({
      projectId,
      type: 'scene',
      name: scene.name,
      description: scene.description,
      metadata: { source: 'script_decompose', category: 'scene' },
      promptText: scene.description,
      createdBy: userId,
    }));
  }

  for (const prop of storyBible.props || []) {
    created.push(await createOrUpdateAsset({
      projectId,
      type: 'prop',
      name: prop.name,
      description: prop.description,
      metadata: { source: 'script_decompose', category: 'prop' },
      promptText: prop.description,
      createdBy: userId,
    }));
  }

  return created;
}

function evaluateReviewPolicies({ reviewPolicyIds, stageKind, outputPayload }) {
  const serialized = JSON.stringify(outputPayload);
  const reviews = [];

  for (const policyId of reviewPolicyIds) {
    if (policyId === 'business-review') {
      let passed = true;
      let notes = '输出满足当前阶段的基本交付要求。';

      if (stageKind === 'script_decompose') {
        passed = Boolean(outputPayload.storyBible?.title) && Number(outputPayload.createdEpisodeCount || 0) > 0;
        notes = passed
          ? '剧本拆解已生成故事总纲与剧集壳子。'
          : '剧本拆解没有生成有效的故事总纲或剧集列表。';
      } else if (stageKind === 'asset_design') {
        passed = Array.isArray(outputPayload.assets) ? outputPayload.assets.length > 0 : Boolean(outputPayload.previewUrl);
        notes = passed
          ? '资产设计输出有效，可进入资产锁定或继续出图。'
          : '资产阶段没有产出可用资产或预览结果。';
      } else if (stageKind === 'video_prompt_generate') {
        passed = typeof outputPayload.prompt === 'string' && outputPayload.prompt.length >= 80;
        notes = passed
          ? '视频提示词内容完整，可继续进入视频生成。'
          : '视频提示词过短，无法作为稳定的视频生成输入。';
      } else if (stageKind === 'video_generate') {
        passed = typeof outputPayload.previewUrl === 'string' && outputPayload.previewUrl.length > 0;
        notes = passed
          ? '视频阶段已经生成可用输出。'
          : '视频阶段没有返回可用输出地址。';
      }

      reviews.push({ policyId, passed, notes });
      continue;
    }

    if (policyId === 'compliance-review') {
      const matched = COMPLIANCE_BLOCKLIST.find((item) => serialized.includes(item));
      reviews.push({
        policyId,
        passed: !matched,
        notes: matched ? `命中合规风险词：${matched}` : '未命中当前的合规风险词规则。',
      });
    }
  }

  return reviews;
}

async function runScriptDecompose({ project, latestScriptSource, model, skillPack, user }) {
  const setup = project.setup || {
    aspectRatio: '9:16',
    styleSummary: '',
    targetMedium: '漫剧',
    globalPrompts: [],
  };

  const heuristicBible = buildStoryBible({
    projectTitle: project.title,
    scriptText: latestScriptSource.contentText,
    setup,
  });

  const storyBible = await maybeGenerateStructuredOutput({
    model,
    systemInstruction:
      '你是漫剧项目的总导演分析师。请把剧本拆解成项目总纲、人物、场景、道具和剧集列表。输出必须是 JSON。',
    prompt: [
      `项目名：${project.title}`,
      `目标媒介：${setup.targetMedium}`,
      `画面比例：${setup.aspectRatio}`,
      setup.styleSummary ? `风格要求：${setup.styleSummary}` : '',
      Array.isArray(setup.globalPrompts) && setup.globalPrompts.length > 0
        ? `全局提示词：${setup.globalPrompts.join('；')}`
        : '',
      skillPack?.promptMethodology ? `拆解方法论：${skillPack.promptMethodology}` : '',
      '请输出字段：title, logline, summary, worldRules[], continuityRules[], characters[{name,description}], scenes[{name,description}], props[{name,description}], episodes[{episodeNumber,title,synopsis,sourceText}]。',
      '原始剧本如下：',
      latestScriptSource.contentText,
    ]
      .filter(Boolean)
      .join('\n\n'),
    normalizer: normalizeStoryBibleFromModel,
    fallbackFactory: () => heuristicBible,
  });

  const createdAssets = await createAssetsFromStoryBible({
    projectId: project.id,
    storyBible,
    userId: user.id,
  });

  const episodes = await replaceEpisodes(project.id, storyBible.episodes || []);
  await upsertStoryBible(project.id, storyBible);
  await updateProjectSetup(project.id, {
    stageConfig: project.setup?.stageConfig || buildDefaultStageConfig(),
    metadata: {
      ...(project.setup?.metadata || {}),
      lastDecomposedAt: new Date().toISOString(),
      decompositionSkillPackId: skillPack?.id ?? null,
      usedLiveModel: hasLiveTextModelSupport(model),
    },
  });

  return {
    storyBible,
    createdAssetCount: createdAssets.length,
    createdEpisodeCount: episodes.length,
  };
}

async function runEpisodeExpand({ project, episode, model, skillPack }) {
  const allEpisodes = await listEpisodesByProjectId(project.id);
  const previousEpisodes = allEpisodes.filter((item) => item.episodeNumber < episode.episodeNumber);
  const lockedAssets = (await listAssetsByProjectId(project.id)).filter((asset) => asset.isLocked);
  const heuristicContext = buildEpisodeContext({
    project,
    episode,
    previousEpisodes,
    lockedAssets,
  });

  const expanded = await maybeGenerateStructuredOutput({
    model,
    systemInstruction:
      '你是单集分析助手。请结合项目设定、前文摘要和锁定资产，为当前集生成上下文摘要、前情摘要、分镜节拍和连续性状态。输出必须是 JSON。',
    prompt: [
      `项目名：${project.title}`,
      project.storyBible?.summary ? `故事总纲：${project.storyBible.summary}` : '',
      `当前剧集：${episode.title}`,
      `当前剧集概述：${episode.synopsis}`,
      previousEpisodes.length > 0
        ? `前序剧集：${previousEpisodes.map((item) => `${item.title}：${item.synopsis}`).join('\n')}`
        : '前序剧集：无',
      lockedAssets.length > 0
        ? `锁定资产：${lockedAssets.map((item) => `${item.type}:${item.name}`).join('；')}`
        : '锁定资产：无',
      skillPack?.promptMethodology ? `分析方法论：${skillPack.promptMethodology}` : '',
      '请输出字段：contextSummary, precedingSummary, storyboardBeats[], continuityState{}。',
    ]
      .filter(Boolean)
      .join('\n\n'),
    normalizer: normalizeEpisodeExpansion,
    fallbackFactory: () => ({
      contextSummary: heuristicContext.contextSummary,
      precedingSummary: heuristicContext.precedingSummary,
      storyboardBeats: [
        `开场快速建立 ${episode.title} 的核心场景和人物关系。`,
        '围绕当集冲突推进情绪变化，保持锁定资产的一致性。',
        '结尾留出下一集承接信息，补全当前集的连续性状态。',
      ],
      continuityState: heuristicContext.continuityState,
    }),
  });

  const promptRecipeId = project.setup?.stageConfig?.video_prompt_generate?.promptRecipeId || 'seedance-cinematic-v1';
  const workspaceSeed = buildEpisodeWorkspaceSeed({
    episode,
    lockedAssets,
    storyBible: project.storyBible,
    promptRecipeId,
  });

  workspaceSeed.nodes = cleanArray(workspaceSeed.nodes).map((node) => {
    if (String(node.id).startsWith('storyboard-') && expanded.storyboardBeats.length > 0) {
      return {
        ...node,
        content: expanded.storyboardBeats.join('\n'),
      };
    }
    return node;
  });

  await upsertEpisodeContext({
    episodeId: episode.id,
    projectId: project.id,
    contextSummary: expanded.contextSummary,
    precedingSummary: expanded.precedingSummary,
    content: {
      ...heuristicContext,
      continuityState: expanded.continuityState,
      storyboardBeats: expanded.storyboardBeats,
    },
  });

  await upsertEpisodeWorkspace({
    episodeId: episode.id,
    projectId: project.id,
    content: workspaceSeed,
  });

  await updateEpisodeStatus(episode.id, 'ready', {
    lastAnalyzedAt: new Date().toISOString(),
    usedLiveModel: hasLiveTextModelSupport(model),
  });

  return {
    episodeContext: {
      ...heuristicContext,
      contextSummary: expanded.contextSummary,
      precedingSummary: expanded.precedingSummary,
      continuityState: expanded.continuityState,
      storyboardBeats: expanded.storyboardBeats,
    },
    workspaceSeed,
  };
}

async function runAssetExtract({ project, model, skillPack, user }) {
  const storyBible = project.storyBible || {};
  const fallbackAssets = []
    .concat((storyBible.characters || []).map((item) => ({
      type: 'character',
      name: item.name,
      description: item.description,
      promptText: inferAssetPrompt({ asset: item, project, skillPack }),
      previewHint: 'character',
    })))
    .concat((storyBible.scenes || []).map((item) => ({
      type: 'scene',
      name: item.name,
      description: item.description,
      promptText: inferAssetPrompt({ asset: item, project, skillPack }),
      previewHint: 'scene',
    })))
    .concat((storyBible.props || []).map((item) => ({
      type: 'prop',
      name: item.name,
      description: item.description,
      promptText: inferAssetPrompt({ asset: item, project, skillPack }),
      previewHint: 'prop',
    })));

  const assetPack = await maybeGenerateStructuredOutput({
    model,
    systemInstruction:
      '你是漫剧项目的资产设计师。请将角色、场景、道具整理成可锁定的资产清单，并补全适合图片/视频生成的提示词。输出必须是 JSON。',
    prompt: [
      `项目名：${project.title}`,
      project.storyBible?.summary ? `故事总纲：${project.storyBible.summary}` : '',
      summarizeStyle(project),
      skillPack?.promptMethodology ? `资产方法论：${skillPack.promptMethodology}` : '',
      '请输出字段：assets[{type,name,description,promptText,previewHint}]。',
    ]
      .filter(Boolean)
      .join('\n\n'),
    normalizer: (raw) => normalizeAssetPack(raw, fallbackAssets),
    fallbackFactory: () => ({ assets: fallbackAssets }),
  });

  const created = [];
  for (const asset of assetPack.assets) {
    created.push(await createOrUpdateAsset({
      projectId: project.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      metadata: {
        source: 'asset_extract',
        previewHint: asset.previewHint,
      },
      promptText: asset.promptText || inferAssetPrompt({ asset, project, skillPack }),
      createdBy: user.id,
    }));
  }

  return {
    assets: created.map((entry) => entry.asset),
  };
}

async function runAssetImageGeneration({ capabilityId, project, model, user, inputPayload }) {
  const assetId = String(inputPayload.assetId || '').trim();
  if (!assetId) {
    throw new Error('assetId is required.');
  }

  const asset = await getAssetById(assetId);
  if (!asset || asset.projectId !== project.id) {
    throw new Error('Asset not found.');
  }

  const fullAsset = (await listAssetsByProjectId(project.id)).find((item) => item.id === assetId);
  if (!fullAsset) {
    throw new Error('Asset version data not found.');
  }

  if (fullAsset.isLocked) {
    throw new Error('Locked assets must be unlocked before generating a new preview.');
  }

  const currentVersion = pickAssetVersion(fullAsset);
  const prompt = String(inputPayload.prompt || '').trim()
    || currentVersion?.promptText
    || inferAssetPrompt({ asset: fullAsset, project, skillPack: null });

  const previewUrl = hasLiveImageModelSupport(model)
    ? await generateImageWithModel({
        model,
        prompt,
        aspectRatio: project.setup?.aspectRatio || '9:16',
        imageSize: String(inputPayload.imageSize || '2K'),
      })
    : buildMockAssetUrl(fullAsset.id, capabilityId);

  const created = await createOrUpdateAsset({
    projectId: project.id,
    type: fullAsset.type,
    name: fullAsset.name,
    description: fullAsset.description,
    metadata: {
      ...fullAsset.metadata,
      source: capabilityId,
      usedLiveModel: hasLiveImageModelSupport(model),
    },
    promptText: prompt,
    previewUrl,
    createdBy: user.id,
  });

  return {
    assetId: fullAsset.id,
    previewUrl,
    asset: created.asset,
  };
}

async function runVideoPromptGenerate({ project, episode, model, skillPack, inputPayload }) {
  const context = await getEpisodeContext(episode.id);
  const workspace = await getEpisodeWorkspace(episode.id);
  const recipeId =
    String(inputPayload.promptRecipeId || '').trim()
    || project.setup?.stageConfig?.video_prompt_generate?.promptRecipeId
    || 'seedance-cinematic-v1';
  const recipe = skillPack?.promptRecipes?.find((item) => item.id === recipeId)
    || getSkillPack('seedance-storyboard-v1')?.promptRecipes?.find((item) => item.id === recipeId);

  const fallback = {
    prompt: [
      `${episode.title} 的单集视频提示词。`,
      context?.contextSummary || episode.synopsis,
      recipe ? `风格配方：${recipe.name}。${recipe.description}` : '',
      project.setup?.styleSummary ? `项目风格：${project.setup.styleSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    beatSheet: [
      '镜头 1：建立主场景和人物关系。',
      '镜头 2：推动主要冲突，强化情绪变化。',
      '镜头 3：用结尾镜头留出下一集承接点。',
    ],
    voicePrompt: `${episode.title} 的配音文稿应与剧情情绪一致，强调关键冲突和人物内心变化。`,
  };

  const promptPayload = await maybeGenerateStructuredOutput({
    model,
    systemInstruction:
      '你是漫剧视频提示词设计师。请结合单集上下文、镜头语言和配方，生成视频提示词、beat sheet 和配音提示词。输出必须是 JSON。',
    prompt: [
      `项目名：${project.title}`,
      `当前剧集：${episode.title}`,
      context?.contextSummary ? `单集上下文：${context.contextSummary}` : '',
      context?.precedingSummary ? `前情摘要：${context.precedingSummary}` : '',
      project.setup?.styleSummary ? `项目风格：${project.setup.styleSummary}` : '',
      recipe ? `视频提示词配方：${recipe.name}。${recipe.description}` : '',
      skillPack?.promptMethodology ? `分镜方法论：${skillPack.promptMethodology}` : '',
      '请输出字段：prompt, beatSheet[], voicePrompt。',
    ]
      .filter(Boolean)
      .join('\n\n'),
    normalizer: normalizePromptPayload,
    fallbackFactory: () => fallback,
  });

  if (workspace) {
    const nodes = cleanArray(workspace.content?.nodes).map((node) => {
      if (String(node.id).startsWith('prompt-')) {
        return { ...node, content: promptPayload.prompt };
      }
      if (String(node.id).startsWith('audio-') && promptPayload.voicePrompt) {
        return { ...node, content: promptPayload.voicePrompt };
      }
      if (String(node.id).startsWith('storyboard-') && promptPayload.beatSheet.length > 0) {
        return { ...node, content: promptPayload.beatSheet.join('\n') };
      }
      return node;
    });

    await upsertEpisodeWorkspace({
      episodeId: episode.id,
      projectId: project.id,
      content: {
        ...workspace.content,
        nodes,
      },
    });
  }

  return {
    prompt: promptPayload.prompt,
    promptRecipeId: recipeId,
    beatSheet: promptPayload.beatSheet,
    voicePrompt: promptPayload.voicePrompt,
  };
}

async function runVideoGenerate({ project, episode, model, inputPayload }) {
  const workspace = await getEpisodeWorkspace(episode.id);
  const promptNode = cleanArray(workspace?.content?.nodes).find((node) => String(node.id).startsWith('prompt-'));
  const imageNodes = cleanArray(workspace?.content?.nodes)
    .filter((node) => node.type === 'image' && /^https?:\/\//.test(String(node.content || '').trim()))
    .map((node) => String(node.content).trim())
    .slice(0, 1);

  const prompt = String(inputPayload.prompt || '').trim() || String(promptNode?.content || '').trim() || episode.synopsis;
  if (!prompt) {
    throw new Error('Video generation requires a prompt.');
  }

  let taskId = null;
  let previewUrl = buildMockVideoUrl(episode.id);

  if (hasLiveVideoModelSupport(model)) {
    taskId = await createVideoTaskWithModel({
      model,
      prompt,
      ratio: String(inputPayload.ratio || project.setup?.aspectRatio || '9:16'),
      resolution: String(inputPayload.resolution || '720P'),
      duration: Number(inputPayload.duration || 5),
      images: Array.isArray(inputPayload.images) && inputPayload.images.length > 0 ? inputPayload.images : imageNodes,
    });

    const result = await pollVideoTask({ taskId });
    previewUrl = result.output || previewUrl;
  }

  if (workspace) {
    const nodes = cleanArray(workspace.content?.nodes).map((node) => {
      if (String(node.id).startsWith('video-')) {
        return { ...node, content: previewUrl };
      }
      return node;
    });

    await upsertEpisodeWorkspace({
      episodeId: episode.id,
      projectId: project.id,
      content: {
        ...workspace.content,
        nodes,
      },
    });
  }

  await updateEpisodeStatus(episode.id, 'generated', {
    lastVideoGeneratedAt: new Date().toISOString(),
    videoPreviewUrl: previewUrl,
    videoTaskId: taskId,
    usedLiveModel: hasLiveVideoModelSupport(model),
  });

  return {
    previewUrl,
    taskId,
  };
}

export async function runCapability({
  capabilityId,
  modelId,
  skillPackId,
  inputPayload,
  user,
}) {
  const capability = getCapability(capabilityId);
  if (!capability) {
    throw new Error('Unknown capability.');
  }

  const model = getModel(modelId || capability.defaultModelId);
  if (!model) {
    throw new Error('Unknown model.');
  }

  const skillPack = skillPackId ? getSkillPack(skillPackId) : null;
  const capabilityRun = await createCapabilityRun({
    projectId: inputPayload.projectId ?? null,
    episodeId: inputPayload.episodeId ?? null,
    capabilityId,
    modelId: model.id,
    skillPackId: skillPack?.id ?? null,
    inputPayload,
  });

  const workflowRun = inputPayload.projectId
    ? await createWorkflowRun({
        projectId: inputPayload.projectId,
        stageKind: capability.stageKind,
        capabilityRunId: capabilityRun.id,
        config: {
          modelId: model.id,
          skillPackId: skillPack?.id ?? null,
        },
      })
    : null;

  try {
    let outputPayload = {};
    let project = null;

    if (capabilityId === 'script_decompose') {
      project = await getProjectById(inputPayload.projectId);
      if (!project) throw new Error('Project not found.');
      const latestScriptSource = await getLatestScriptSource(project.id);
      if (!latestScriptSource?.contentText) throw new Error('Please upload a script first.');

      outputPayload = await runScriptDecompose({
        project,
        latestScriptSource,
        model,
        skillPack,
        user,
      });
    } else if (capabilityId === 'episode_expand') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) throw new Error('Episode not found.');
      project = await getProjectById(episode.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runEpisodeExpand({
        project,
        episode,
        model,
        skillPack,
      });
    } else if (capabilityId === 'asset_extract') {
      project = await getProjectById(inputPayload.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runAssetExtract({
        project,
        model,
        skillPack,
        user,
      });
    } else if (['character_generate', 'scene_generate', 'prop_generate'].includes(capabilityId)) {
      project = await getProjectById(inputPayload.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runAssetImageGeneration({
        capabilityId,
        project,
        model,
        user,
        inputPayload,
      });
    } else if (capabilityId === 'video_prompt_generate') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) throw new Error('Episode not found.');
      project = await getProjectById(episode.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runVideoPromptGenerate({
        project,
        episode,
        model,
        skillPack,
        inputPayload,
      });
    } else if (capabilityId === 'video_generate') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) throw new Error('Episode not found.');
      project = await getProjectById(episode.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runVideoGenerate({
        project,
        episode,
        model,
        inputPayload,
      });
    } else {
      outputPayload = {
        message: `${capability.name} is registered but not implemented yet.`,
      };
    }

    const reviewPolicyIds = project?.setup?.stageConfig?.[capability.stageKind]?.reviewPolicyIds
      || skillPack?.reviewPolicies
      || [];

    const reviews = evaluateReviewPolicies({
      reviewPolicyIds,
      stageKind: capability.stageKind,
      outputPayload,
    });

    if (reviews.some((review) => !review.passed)) {
      throw new Error(`Review gate blocked progression: ${reviews.filter((review) => !review.passed).map((review) => review.notes).join('；')}`);
    }

    outputPayload = {
      ...outputPayload,
      reviews,
      usedLiveModel: hasLiveModelSupport(model),
    };

    const finishedCapabilityRun = await finishCapabilityRun(capabilityRun.id, {
      status: 'completed',
      outputPayload,
    });

    if (workflowRun) {
      await finishWorkflowRun(workflowRun.id, {
        status: 'completed',
        capabilityRunId: finishedCapabilityRun.id,
        config: {
          outputKeys: Object.keys(outputPayload),
          usedLiveModel: outputPayload.usedLiveModel,
        },
      });
    }

    return finishedCapabilityRun;
  } catch (error) {
    await finishCapabilityRun(capabilityRun.id, {
      status: 'error',
      outputPayload: {},
      error: error instanceof Error ? error.message : String(error),
    });

    if (workflowRun) {
      await finishWorkflowRun(workflowRun.id, {
        status: 'error',
        capabilityRunId: capabilityRun.id,
        config: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    throw error;
  }
}
