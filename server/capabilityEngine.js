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
import {
  buildDefaultStageConfig,
  getCapability,
  getModel,
  getSkillPack,
  resolveSkillPackCapabilitySchema,
} from './registries.js';
import { evaluateReviewPoliciesWithRegistry } from './reviewRegistry.js';
import {
  applySkillArtifactBindings,
  describeSkillOutputContract,
  evaluateSkillReviewPolicies,
  getSkillSchema,
  normalizeSkillOutputWithContract,
  renderSkillPromptBlocks,
} from './skillSchemas.js';
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

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isPublicReferenceUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return ['http:', 'https:'].includes(parsed.protocol)
      && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function modelConfigDefault(model, key, fallbackValue) {
  const entry = model?.configSchema?.[key];
  if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'default')) {
    return entry.default;
  }

  return fallbackValue;
}

function summarizeStyle(project) {
  return [
    project.setup?.styleSummary || '',
    project.setup?.targetMedium ? `目标媒介：${project.setup.targetMedium}` : '',
    project.setup?.aspectRatio ? `画面比例：${project.setup.aspectRatio}` : '',
    Array.isArray(project.setup?.globalPrompts) && project.setup.globalPrompts.length
      ? `全局提示：${project.setup.globalPrompts.join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function inferAssetPrompt({ asset, project, skillPack }) {
  return [
    asset.name || '',
    asset.description || '',
    project.setup?.styleSummary ? `项目风格：${project.setup.styleSummary}` : '',
    skillPack?.promptMethodology ? `技能方法：${skillPack.promptMethodology}` : '',
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

function summarizeLockedAssets(lockedAssets) {
  return cleanArray(lockedAssets)
    .map((item) => `${item.type}:${item.name}`)
    .filter(Boolean)
    .join('、');
}

function summarizeContinuityState(continuityState) {
  return Object.entries(asObject(continuityState))
    .map(([key, value]) => `${key}:${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .filter(Boolean)
    .join('、');
}

function selectStoryboardReferenceAssetNames(summary, prompt, lockedAssets) {
  const haystack = `${summary || ''}\n${prompt || ''}`.toLowerCase();
  const matched = cleanArray(lockedAssets)
    .filter((asset) => haystack.includes(String(asset?.name || '').toLowerCase()))
    .map((asset) => String(asset.name || '').trim())
    .filter(Boolean);

  return Array.from(new Set(matched)).slice(0, 4);
}

function enrichStoryboardShots(shots, options = {}) {
  const videoModel = options.videoModel || null;
  const lockedAssets = cleanArray(options.lockedAssets);

  return cleanArray(shots).map((item, index) => {
    const summary = String(item?.summary || '').trim();
    const promptText = String(item?.promptText || '').trim();
    const referenceAssetNames = Array.isArray(item?.referenceAssetNames) && item.referenceAssetNames.length > 0
      ? item.referenceAssetNames.map((name) => String(name || '').trim()).filter(Boolean)
      : selectStoryboardReferenceAssetNames(summary, promptText, lockedAssets);

    return {
      title: String(item?.title || '').trim() || `镜头${index + 1}`,
      summary,
      promptText,
      durationLabel: String(item?.durationLabel || '').trim() || `00:${String(Math.min(10, Math.max(4, 4 + (index % 3)))).padStart(2, '0')}`,
      recommendedModelId: String(item?.recommendedModelId || '').trim() || videoModel?.deploymentId || '',
      recommendedModeId: String(item?.recommendedModeId || '').trim()
        || videoModel?.defaultGenerationModeId
        || cleanArray(videoModel?.generationModes)[0]?.id
        || '',
      referenceAssetNames,
    };
  });
}

function buildStoryboardShots(beatSheet, episodeTitle, prompt, recipe, options = {}) {
  const beats = cleanArray(beatSheet).map((item) => String(item || '').trim()).filter(Boolean);
  return enrichStoryboardShots(beats.map((summary, index) => ({
    title: `镜头${index + 1}`,
    summary,
    promptText: [
      `${episodeTitle} 分镜 ${index + 1}`,
      summary,
      recipe?.name ? `配方：${recipe.name}` : '',
      prompt || '',
    ].filter(Boolean).join('\n'),
    durationLabel: `00:${String(Math.min(10, Math.max(4, 4 + (index % 3)))).padStart(2, '0')}`,
  })), options);
}

function buildStoryboardFallbackBundle({ project, episode, context, recipe, lockedAssets }) {
  const beatSheet = cleanArray(context?.content?.storyboardBeats).map((item) => String(item || '').trim()).filter(Boolean);
  const resolvedBeatSheet = beatSheet.length > 0
    ? beatSheet
    : [
        '镜头 1：建立主场景与人物关系。',
        '镜头 2：推进本集主要冲突，强化情绪变化。',
        '镜头 3：用收束镜头为下一段承接留钩子。',
      ];
  const prompt = [
    `${episode.title} 的单集视频提示词。`,
    context?.contextSummary || episode.synopsis,
    recipe ? `配方：${recipe.name}。${recipe.description}` : '',
    project.setup?.styleSummary ? `项目风格：${project.setup.styleSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const videoModel = getModel(project.setup?.stageConfig?.video_generate?.modelId);

  return {
    prompt,
    beatSheet: resolvedBeatSheet,
    voicePrompt: `${episode.title} 的配音文稿应与剧情情绪一致，突出当前集的核心冲突与人物变化。`,
    shots: buildStoryboardShots(resolvedBeatSheet, episode.title, prompt, recipe, {
      videoModel,
      lockedAssets,
    }),
  };
}

function buildEpisodeExpansionFallbackBundle({ project, episode, heuristicContext }) {
  const storyboardBeats = [
    `${episode.title} 的开场镜头需要先建立人物、场景与当前局势。`,
    '中段镜头推进当前集的核心冲突，并明确人物关系变化。',
    '结尾镜头为下一段分镜和后续生成留出承接点。',
  ];
  const promptSeed = [
    heuristicContext.contextSummary,
    episode.synopsis,
    project.setup?.styleSummary || '',
  ].filter(Boolean).join('\n');
  const videoModel = getModel(project.setup?.stageConfig?.video_generate?.modelId);

  return {
    contextSummary: heuristicContext.contextSummary,
    precedingSummary: heuristicContext.precedingSummary,
    storyboardBeats,
    worldState: heuristicContext.worldState,
    continuityState: heuristicContext.continuityState,
    shots: buildStoryboardShots(storyboardBeats, episode.title, promptSeed, null, {
      videoModel,
      lockedAssets: [],
    }),
  };
}

function buildImagePromptFallback({ project, asset, skillPack }) {
  if (asset) {
    return [
      `${asset.type}：${asset.name}`,
      asset.description || '',
      project.storyBible?.summary ? `故事摘要：${project.storyBible.summary}` : '',
      summarizeStyle(project),
      skillPack?.promptMethodology ? `技能方法：${skillPack.promptMethodology}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `项目：${project.title}`,
    project.storyBible?.summary || '',
    summarizeStyle(project),
    skillPack?.promptMethodology ? `技能方法：${skillPack.promptMethodology}` : '',
    '请输出一条适合角色、场景或道具出图的高密度图片提示词。',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSkillPromptPackage({ schema, values }) {
  const promptBlocks = renderSkillPromptBlocks(schema, values);
  const outputInstruction = describeSkillOutputContract(schema);

  return {
    systemInstruction: schema?.systemInstruction || '请输出结构化 JSON。',
    prompt: [
      ...promptBlocks,
      outputInstruction ? `请输出 JSON，字段要求如下：\n${outputInstruction}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
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

function evaluateReviewPolicies({ reviewPolicyIds, stageKind, outputPayload, schema }) {
  if (schema?.reviewConfig) {
    return evaluateSkillReviewPolicies({
      reviewPolicyIds,
      outputPayload,
      schema,
    });
  }

  return evaluateReviewPoliciesWithRegistry({
    reviewPolicyIds,
    stageKind,
    outputPayload,
  });
}

function resolveSkillPack(skillPack, defaultSkillPackId) {
  return skillPack || getSkillPack(defaultSkillPackId) || null;
}

function resolveSkillSchemaBundle({ skillPack, defaultSkillPackId, capabilityId, defaultSchemaId }) {
  const resolvedSkillPack = resolveSkillPack(skillPack, defaultSkillPackId);
  const fromPack = resolveSkillPackCapabilitySchema(resolvedSkillPack, capabilityId);
  const schemaId = fromPack.schemaId || defaultSchemaId || null;
  const schema = fromPack.schema || (schemaId ? getSkillSchema(schemaId) : null);

  return {
    skillPack: resolvedSkillPack,
    schema,
    schemaId,
  };
}

async function runScriptDecompose({ project, latestScriptSource, model, skillPack, user }) {
  const setup = project.setup || {
    aspectRatio: '9:16',
    styleSummary: '',
    targetMedium: '短剧',
    globalPrompts: [],
  };
  const { skillPack: resolvedSkillPack, schema } = resolveSkillSchemaBundle({
    skillPack,
    defaultSkillPackId: 'seedance-director-v1',
    capabilityId: 'script_decompose',
    defaultSchemaId: 'seedance-director-core-v1',
  });
  const heuristicBible = buildStoryBible({
    projectTitle: project.title,
    scriptText: latestScriptSource.contentText,
    setup,
  });
  const promptPackage = buildSkillPromptPackage({
    schema,
    values: {
      projectTitle: project.title,
      targetMedium: setup.targetMedium,
      aspectRatio: setup.aspectRatio,
      styleSummary: setup.styleSummary,
      globalPrompts: Array.isArray(setup.globalPrompts) ? setup.globalPrompts : [],
      skillMethodology: resolvedSkillPack?.promptMethodology || '',
      scriptText: latestScriptSource.contentText,
    },
  });

  const storyBible = await maybeGenerateStructuredOutput({
    model,
    systemInstruction: promptPackage.systemInstruction,
    prompt: promptPackage.prompt,
    normalizer: (raw) => normalizeSkillOutputWithContract({
      schema,
      raw,
      fallback: heuristicBible,
    }),
    fallbackFactory: () => heuristicBible,
  });
  const directorArtifacts = applySkillArtifactBindings(schema?.artifactBindings, storyBible);
  const normalizedStoryBible = {
    ...heuristicBible,
    ...(directorArtifacts.storyBibleValues || {}),
  };

  const createdAssets = await createAssetsFromStoryBible({
    projectId: project.id,
    storyBible: normalizedStoryBible,
    userId: user.id,
  });

  const episodes = await replaceEpisodes(project.id, normalizedStoryBible.episodes || []);
  await upsertStoryBible(project.id, normalizedStoryBible);
  await updateProjectSetup(project.id, {
    stageConfig: project.setup?.stageConfig || buildDefaultStageConfig(),
    metadata: {
      ...(project.setup?.metadata || {}),
      lastDecomposedAt: new Date().toISOString(),
      decompositionSkillPackId: resolvedSkillPack?.id ?? null,
      usedLiveModel: hasLiveTextModelSupport(model),
    },
  });

  return {
    storyBible: normalizedStoryBible,
    createdAssetCount: createdAssets.length,
    createdEpisodeCount: episodes.length,
    skillSchemaId: schema?.id || null,
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
  const { skillPack: resolvedSkillPack, schema } = skillPack?.stageKind === 'episode_expand'
    ? resolveSkillSchemaBundle({
        skillPack,
        defaultSkillPackId: 'seedance-episode-director-v1',
        capabilityId: 'episode_expand',
        defaultSchemaId: 'seedance-episode-expand-core-v1',
      })
    : resolveSkillSchemaBundle({
        skillPack: null,
        defaultSkillPackId: 'seedance-episode-director-v1',
        capabilityId: 'episode_expand',
        defaultSchemaId: 'seedance-episode-expand-core-v1',
      });
  const fallback = buildEpisodeExpansionFallbackBundle({
    project,
    episode,
    heuristicContext,
  });
  const promptPackage = buildSkillPromptPackage({
    schema,
    values: {
      projectTitle: project.title,
      storySummary: project.storyBible?.summary || '',
      episodeTitle: episode.title,
      episodeSynopsis: episode.synopsis,
      previousEpisodeSummary: previousEpisodes.length > 0
        ? previousEpisodes.map((item) => `${item.title}: ${item.synopsis}`).join('\n')
        : '无前情',
      lockedAssetSummary: lockedAssets.length > 0
        ? lockedAssets.map((item) => `${item.type}:${item.name}`).join('、')
        : '无锁定资产',
      skillMethodology: resolvedSkillPack?.promptMethodology || '',
    },
  });
  const expanded = await maybeGenerateStructuredOutput({
    model,
    systemInstruction: promptPackage.systemInstruction,
    prompt: promptPackage.prompt,
    normalizer: (raw) => normalizeSkillOutputWithContract({
      schema,
      raw,
      fallback,
    }),
    fallbackFactory: () => fallback,
  });
  const episodeArtifacts = applySkillArtifactBindings(schema?.artifactBindings, expanded);
  const promptRecipeId = project.setup?.stageConfig?.video_prompt_generate?.promptRecipeId || 'seedance-cinematic-v1';
  const workspaceSeed = buildEpisodeWorkspaceSeed({
    episode,
    lockedAssets,
    storyBible: project.storyBible,
    promptRecipeId,
  });
  const storyboardText = typeof episodeArtifacts.workspaceNodeValues.storyboard === 'string'
    ? episodeArtifacts.workspaceNodeValues.storyboard
    : cleanArray(expanded.storyboardBeats).join('\n');
  workspaceSeed.nodes = cleanArray(workspaceSeed.nodes).map((node) => {
    if (String(node.id).startsWith('storyboard-') && storyboardText) {
      return {
        ...node,
        content: storyboardText,
      };
    }
    return node;
  });

  const nextEpisodeContext = {
    ...heuristicContext,
    ...(episodeArtifacts.episodeContextValues || {}),
  };
  const contextSummary = String(
    episodeArtifacts.episodeContextRecordValues?.contextSummary
    || expanded.contextSummary
    || heuristicContext.contextSummary,
  ).trim();
  const precedingSummary = String(
    episodeArtifacts.episodeContextRecordValues?.precedingSummary
    || expanded.precedingSummary
    || heuristicContext.precedingSummary,
  ).trim();

  await upsertEpisodeContext({
    episodeId: episode.id,
    projectId: project.id,
    contextSummary,
    precedingSummary,
    content: nextEpisodeContext,
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
      ...nextEpisodeContext,
      contextSummary,
      precedingSummary,
    },
    workspaceSeed,
    skillSchemaId: schema?.id || null,
  };
}

async function runAssetExtract({ project, model, skillPack, user }) {
  const storyBible = project.storyBible || {};
  const { skillPack: resolvedSkillPack, schema } = resolveSkillSchemaBundle({
    skillPack,
    defaultSkillPackId: 'seedance-art-design-v1',
    capabilityId: 'asset_extract',
    defaultSchemaId: 'seedance-asset-design-core-v1',
  });
  const fallbackAssets = []
    .concat((storyBible.characters || []).map((item) => ({
      type: 'character',
      name: item.name,
      description: item.description,
      promptText: inferAssetPrompt({ asset: item, project, skillPack: resolvedSkillPack }),
      previewHint: 'character',
    })))
    .concat((storyBible.scenes || []).map((item) => ({
      type: 'scene',
      name: item.name,
      description: item.description,
      promptText: inferAssetPrompt({ asset: item, project, skillPack: resolvedSkillPack }),
      previewHint: 'scene',
    })))
    .concat((storyBible.props || []).map((item) => ({
      type: 'prop',
      name: item.name,
      description: item.description,
      promptText: inferAssetPrompt({ asset: item, project, skillPack: resolvedSkillPack }),
      previewHint: 'prop',
    })));
  const promptPackage = buildSkillPromptPackage({
    schema,
    values: {
      projectTitle: project.title,
      storySummary: project.storyBible?.summary || '',
      styleSummary: summarizeStyle(project),
      skillMethodology: resolvedSkillPack?.promptMethodology || '',
    },
  });

  const assetPack = await maybeGenerateStructuredOutput({
    model,
    systemInstruction: promptPackage.systemInstruction,
    prompt: promptPackage.prompt,
    normalizer: (raw) => normalizeSkillOutputWithContract({
      schema,
      raw,
      fallback: { assets: fallbackAssets },
    }),
    fallbackFactory: () => ({ assets: fallbackAssets }),
  });
  const assetArtifacts = applySkillArtifactBindings(schema?.artifactBindings, assetPack);
  const normalizedAssetPack = {
    assets: cleanArray(assetArtifacts.assetRecordValues?.assets || assetPack.assets),
  };

  const created = [];
  for (const asset of normalizedAssetPack.assets) {
    created.push(await createOrUpdateAsset({
      projectId: project.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      metadata: {
        source: 'asset_extract',
        previewHint: asset.previewHint,
      },
      promptText: asset.promptText || inferAssetPrompt({ asset, project, skillPack: resolvedSkillPack }),
      createdBy: user.id,
    }));
  }

  return {
    assets: created.map((entry) => entry.asset),
    skillSchemaId: schema?.id || null,
  };
}

async function runImagePromptGenerate({ project, model, skillPack, inputPayload }) {
  const { skillPack: resolvedSkillPack, schema } = resolveSkillSchemaBundle({
    skillPack,
    defaultSkillPackId: 'seedance-art-design-v1',
    capabilityId: 'image_prompt_generate',
    defaultSchemaId: 'seedance-image-prompt-core-v1',
  });
  const assetId = String(inputPayload.assetId || '').trim();
  const assets = assetId ? await listAssetsByProjectId(project.id) : [];
  const storedAsset = assetId ? assets.find((item) => item.id === assetId) || null : null;
  const draftAsset = storedAsset || {
    type: String(inputPayload.assetType || 'style').trim() || 'style',
    name: String(inputPayload.assetName || project.title).trim() || project.title,
    description: String(inputPayload.assetDescription || project.storyBible?.summary || '').trim(),
  };
  const fallbackPrompt = buildImagePromptFallback({
    project,
    asset: draftAsset,
    skillPack: resolvedSkillPack,
  });
  const promptPackage = buildSkillPromptPackage({
    schema,
    values: {
      projectTitle: project.title,
      storySummary: project.storyBible?.summary || '',
      styleSummary: summarizeStyle(project),
      assetType: draftAsset.type || 'style',
      assetName: draftAsset.name || project.title,
      assetDescription: draftAsset.description || project.storyBible?.summary || '为项目生成统一风格图片提示词。',
      skillMethodology: resolvedSkillPack?.promptMethodology || '',
    },
  });

  const output = await maybeGenerateStructuredOutput({
    model,
    systemInstruction: promptPackage.systemInstruction,
    prompt: promptPackage.prompt,
    normalizer: (raw) => normalizeSkillOutputWithContract({
      schema,
      raw,
      fallback: { prompt: fallbackPrompt },
    }),
    fallbackFactory: () => ({ prompt: fallbackPrompt }),
  });

  return {
    prompt: output.prompt,
    assetId: storedAsset?.id || null,
    skillSchemaId: schema?.id || null,
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
  const lockedAssets = (await listAssetsByProjectId(project.id)).filter((asset) => asset.isLocked);
  const { skillPack: resolvedSkillPack, schema } = resolveSkillSchemaBundle({
    skillPack,
    defaultSkillPackId: 'seedance-storyboard-v1',
    capabilityId: 'video_prompt_generate',
    defaultSchemaId: 'seedance-storyboard-core-v1',
  });
  const recipeId =
    String(inputPayload.promptRecipeId || '').trim()
    || project.setup?.stageConfig?.video_prompt_generate?.promptRecipeId
    || 'seedance-cinematic-v1';
  const recipe = resolvedSkillPack?.promptRecipes?.find((item) => item.id === recipeId)
    || getSkillPack('seedance-storyboard-v1')?.promptRecipes?.find((item) => item.id === recipeId);
  const promptPackage = buildSkillPromptPackage({
    schema,
    values: {
      projectTitle: project.title,
      episodeTitle: episode.title,
      episodeContextSummary: context?.contextSummary || episode.synopsis,
      precedingSummary: context?.precedingSummary || '',
      styleSummary: project.setup?.styleSummary || '',
      lockedAssetSummary: summarizeLockedAssets(lockedAssets),
      continuitySummary: summarizeContinuityState(context?.content?.continuityState),
      promptRecipeName: recipe?.name || '',
      promptRecipeDescription: recipe?.description || '',
      skillMethodology: resolvedSkillPack?.promptMethodology || '',
    },
  });
  const fallback = buildStoryboardFallbackBundle({
    project,
    episode,
    context,
    recipe,
    lockedAssets,
  });

  const promptPayload = await maybeGenerateStructuredOutput({
    model,
    systemInstruction: promptPackage.systemInstruction,
    prompt: promptPackage.prompt,
    normalizer: (raw) => normalizeSkillOutputWithContract({
      schema,
      raw,
      fallback,
    }),
    fallbackFactory: () => fallback,
  });
  const videoModel = getModel(project.setup?.stageConfig?.video_generate?.modelId);
  promptPayload.shots = enrichStoryboardShots(promptPayload.shots, {
    videoModel,
    lockedAssets,
  });
  const artifactBindings = applySkillArtifactBindings(schema?.artifactBindings, {
    ...promptPayload,
    promptRecipeId: recipeId,
  });

  if (workspace) {
    const nodes = cleanArray(workspace.content?.nodes).map((node) => {
      if (String(node.id).startsWith('prompt-') && typeof artifactBindings.workspaceNodeValues.prompt === 'string') {
        return { ...node, content: artifactBindings.workspaceNodeValues.prompt };
      }
      if (String(node.id).startsWith('storyboard-') && typeof artifactBindings.workspaceNodeValues.storyboard === 'string') {
        return { ...node, content: artifactBindings.workspaceNodeValues.storyboard };
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

  if (context) {
    await upsertEpisodeContext({
      episodeId: episode.id,
      projectId: project.id,
      contextSummary: context.contextSummary,
      precedingSummary: context.precedingSummary,
      content: {
        ...(context.content || {}),
        ...artifactBindings.episodeContextValues,
        promptRecipeId: recipeId,
      },
    });
  }

  return {
    prompt: promptPayload.prompt,
    promptRecipeId: recipeId,
    beatSheet: promptPayload.beatSheet,
    voicePrompt: promptPayload.voicePrompt,
    shots: promptPayload.shots,
    skillSchemaId: schema?.id || null,
  };
}

async function runVoicePromptGenerate({ project, episode, model, skillPack, inputPayload }) {
  const promptBundle = await runVideoPromptGenerate({
    project,
    episode,
    model,
    skillPack,
    inputPayload,
  });

  return {
    prompt: promptBundle.voicePrompt,
    voicePrompt: promptBundle.voicePrompt,
    promptRecipeId: promptBundle.promptRecipeId,
    videoPrompt: promptBundle.prompt,
    shots: promptBundle.shots,
    skillSchemaId: promptBundle.skillSchemaId,
  };
}

async function runStoryboardGenerate({ project, episode, model, skillPack, inputPayload }) {
  const promptBundle = await runVideoPromptGenerate({
    project,
    episode,
    model,
    skillPack,
    inputPayload,
  });

  return {
    beats: promptBundle.beatSheet,
    beatSheet: promptBundle.beatSheet,
    promptRecipeId: promptBundle.promptRecipeId,
    prompt: promptBundle.prompt,
    shots: promptBundle.shots,
    skillSchemaId: promptBundle.skillSchemaId,
  };
}

async function runVideoGenerate({ project, episode, model, inputPayload }) {
  const workspace = await getEpisodeWorkspace(episode.id);
  const workspaceNodes = cleanArray(workspace?.content?.nodes);
  const promptNode = workspaceNodes.find((node) => String(node.id).startsWith('prompt-'));
  const imageNodes = workspaceNodes
    .filter((node) => node.type === 'image' && isHttpUrl(node.content))
    .map((node) => String(node.content || '').trim());
  const workspaceAudioReferenceUrls = workspaceNodes
    .filter((node) => node.type === 'audio' && isHttpUrl(node.content))
    .map((node) => String(node.content || '').trim());
  const requestedAudioReferenceUrls = cleanArray(inputPayload.audioReferenceUrls)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const audioReferenceUrls = (requestedAudioReferenceUrls.length > 0 ? requestedAudioReferenceUrls : workspaceAudioReferenceUrls)
    .filter((value, index, array) => array.indexOf(value) === index);
  const forwardedAudioReferenceUrls = audioReferenceUrls.filter(isPublicReferenceUrl);

  const prompt = String(inputPayload.prompt || '').trim() || String(promptNode?.content || '').trim() || episode.synopsis;
  if (!prompt) {
    throw new Error('Video generation requires a prompt.');
  }

  const ratio = String(inputPayload.ratio || project.setup?.aspectRatio || modelConfigDefault(model, 'ratio', '9:16'));
  const resolution = String(inputPayload.resolution || modelConfigDefault(model, 'resolution', '720P'));
  const duration = Number(inputPayload.duration || modelConfigDefault(model, 'durationSeconds', 5));
  const generateAudio = Boolean(inputPayload.generateAudio ?? modelConfigDefault(model, 'generateAudio', false));

  let taskId = null;
  let previewUrl = buildMockVideoUrl(episode.id);

  if (hasLiveVideoModelSupport(model)) {
    taskId = await createVideoTaskWithModel({
      model,
      prompt,
      ratio,
      resolution,
      duration,
      images: Array.isArray(inputPayload.images) && inputPayload.images.length > 0 ? inputPayload.images : imageNodes,
      generateAudio,
      audioReferenceUrls: forwardedAudioReferenceUrls,
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
    generateAudio,
    audioReferenceDetected: audioReferenceUrls.length > 0,
    forwardedAudioReferenceCount: forwardedAudioReferenceUrls.length,
  });

  return {
    previewUrl,
    taskId,
    generateAudio,
    audioReferenceDetected: audioReferenceUrls.length > 0,
    forwardedAudioReferenceCount: forwardedAudioReferenceUrls.length,
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
    modelId: model.deploymentId,
    skillPackId: skillPack?.id ?? null,
    inputPayload,
  });

  const workflowRun = inputPayload.projectId
    ? await createWorkflowRun({
        projectId: inputPayload.projectId,
        stageKind: capability.stageKind,
        capabilityRunId: capabilityRun.id,
        config: {
          modelId: model.deploymentId,
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
    } else if (capabilityId === 'image_prompt_generate') {
      project = await getProjectById(inputPayload.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runImagePromptGenerate({
        project,
        model,
        skillPack,
        inputPayload,
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
    } else if (capabilityId === 'voice_prompt_generate') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) throw new Error('Episode not found.');
      project = await getProjectById(episode.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runVoicePromptGenerate({
        project,
        episode,
        model,
        skillPack,
        inputPayload,
      });
    } else if (capabilityId === 'storyboard_generate') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) throw new Error('Episode not found.');
      project = await getProjectById(episode.projectId);
      if (!project) throw new Error('Project not found.');

      outputPayload = await runStoryboardGenerate({
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
      schema:
        getSkillSchema(outputPayload.skillSchemaId)
        || resolveSkillPackCapabilitySchema(skillPack, capabilityId).schema
        || null,
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
