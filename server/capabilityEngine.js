import { buildEpisodeContext, buildEpisodeWorkspaceSeed, buildStoryBible } from './scriptExtraction.js';
import { buildDefaultStageConfig, getCapability, getModel, getSkillPack } from './registries.js';
import {
  createCapabilityRun,
  createOrUpdateAsset,
  createWorkflowRun,
  finishCapabilityRun,
  finishWorkflowRun,
  getEpisodeById,
  getEpisodeContext,
  getEpisodeWorkspace,
  getLatestScriptSource,
  getProjectById,
  listAssetsByProjectId,
  listEpisodesByProjectId,
  replaceEpisodes,
  setAssetLockState,
  updateEpisodeStatus,
  updateProjectSetup,
  upsertEpisodeContext,
  upsertEpisodeWorkspace,
  upsertStoryBible,
} from './workflowStore.js';

const COMPLIANCE_BLOCKLIST = ['真人明星', '未成年人色情', '血腥肢解', '仇恨煽动'];

function inferAssetPrompt({ asset, skillPack }) {
  const methodology = skillPack?.promptMethodology || '';
  return [
    `${asset.name}`,
    asset.description || '',
    methodology ? `方法论：${methodology}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function createAssetsFromStoryBible({ projectId, storyBible, userId, styleSummary }) {
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

  if (styleSummary) {
    created.push(await createOrUpdateAsset({
      projectId,
      type: 'style',
      name: '项目风格',
      description: styleSummary,
      metadata: { source: 'project_setup', category: 'style' },
      promptText: styleSummary,
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
      let notes = '通过。';

      if (stageKind === 'script_decompose') {
        passed = Boolean(outputPayload.storyBible?.title) && Number(outputPayload.createdEpisodeCount || 0) > 0;
        notes = passed ? '故事圣经和剧集壳子均已生成。' : '缺少故事圣经标题或剧集列表。';
      } else if (stageKind === 'asset_design') {
        passed = Array.isArray(outputPayload.assets) && outputPayload.assets.length > 0;
        notes = passed ? '已生成可供锁定的资产列表。' : '当前阶段没有生成资产结果。';
      } else if (stageKind === 'video_prompt_generate') {
        passed = typeof outputPayload.prompt === 'string' && outputPayload.prompt.length >= 80;
        notes = passed ? '提示词长度和信息密度达到最低门槛。' : '视频提示词过短，无法作为可执行产物。';
      }

      reviews.push({ policyId, passed, notes });
      continue;
    }

    if (policyId === 'compliance-review') {
      const matched = COMPLIANCE_BLOCKLIST.find((item) => serialized.includes(item));
      reviews.push({
        policyId,
        passed: !matched,
        notes: matched ? `命中敏感词：${matched}` : '未发现默认禁用词。',
      });
    }
  }

  return reviews;
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
    throw new Error('未知能力。');
  }

  const model = getModel(modelId || capability.defaultModelId);
  if (!model) {
    throw new Error('未知模型。');
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

    if (capabilityId === 'script_decompose') {
      const project = await getProjectById(inputPayload.projectId);
      if (!project) {
        throw new Error('项目不存在。');
      }

      const latestScriptSource = await getLatestScriptSource(project.id);
      if (!latestScriptSource?.contentText) {
        throw new Error('请先上传剧本。');
      }

      const setup = project.setup || {
        aspectRatio: '9:16',
        styleSummary: '',
        targetMedium: '漫剧',
        globalPrompts: [],
      };
      const storyBible = buildStoryBible({
        projectTitle: project.title,
        scriptText: latestScriptSource.contentText,
        setup,
      });
      await upsertStoryBible(project.id, storyBible);
      const createdAssets = await createAssetsFromStoryBible({
        projectId: project.id,
        storyBible,
        userId: user.id,
        styleSummary: setup.styleSummary,
      });
      const episodes = await replaceEpisodes(project.id, storyBible.episodes);
      await updateProjectSetup(project.id, {
        stageConfig: project.setup?.stageConfig || buildDefaultStageConfig(),
        metadata: {
          lastDecomposedAt: new Date().toISOString(),
          decompositionSkillPackId: skillPack?.id ?? null,
        },
      });

      outputPayload = {
        storyBible,
        createdAssetCount: createdAssets.length,
        createdEpisodeCount: episodes.length,
      };
    } else if (capabilityId === 'episode_expand') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) {
        throw new Error('剧集不存在。');
      }
      const project = await getProjectById(episode.projectId);
      if (!project) {
        throw new Error('项目不存在。');
      }
      const allEpisodes = await listEpisodesByProjectId(project.id);
      const previousEpisodes = allEpisodes.filter((item) => item.episodeNumber < episode.episodeNumber);
      const assets = await listAssetsByProjectId(project.id);
      const lockedAssets = assets.filter((asset) => asset.isLocked);
      const context = buildEpisodeContext({
        project,
        episode,
        previousEpisodes,
        lockedAssets,
      });
      const promptRecipeId = project.setup?.stageConfig?.video_prompt_generate?.promptRecipeId ?? 'seedance-cinematic-v1';
      const workspaceSeed = buildEpisodeWorkspaceSeed({
        episode,
        lockedAssets,
        storyBible: project.storyBible,
        promptRecipeId,
      });
      await upsertEpisodeContext({
        episodeId: episode.id,
        projectId: project.id,
        contextSummary: context.contextSummary,
        precedingSummary: context.precedingSummary,
        content: context,
      });
      await upsertEpisodeWorkspace({
        episodeId: episode.id,
        projectId: project.id,
        content: workspaceSeed,
      });
      await updateEpisodeStatus(episode.id, 'ready', {
        lastAnalyzedAt: new Date().toISOString(),
      });

      outputPayload = {
        episodeContext: context,
        workspaceSeed,
      };
    } else if (capabilityId === 'asset_extract') {
      const project = await getProjectById(inputPayload.projectId);
      if (!project) {
        throw new Error('项目不存在。');
      }
      const storyBible = project.storyBible || {};
      const candidates = []
        .concat((storyBible.characters || []).map((item) => ({ type: 'character', ...item })))
        .concat((storyBible.scenes || []).map((item) => ({ type: 'scene', ...item })))
        .concat((storyBible.props || []).map((item) => ({ type: 'prop', ...item })));
      const created = [];
      for (const candidate of candidates) {
        created.push(await createOrUpdateAsset({
          projectId: project.id,
          type: candidate.type,
          name: candidate.name,
          description: candidate.description,
          metadata: { source: 'asset_extract' },
          promptText: inferAssetPrompt({ asset: candidate, skillPack }),
          createdBy: user.id,
        }));
      }
      outputPayload = {
        assets: created.map((entry) => entry.asset),
      };
    } else if (capabilityId === 'video_prompt_generate') {
      const episode = await getEpisodeById(inputPayload.episodeId);
      if (!episode) {
        throw new Error('剧集不存在。');
      }
      const context = await getEpisodeContext(episode.id);
      const project = await getProjectById(episode.projectId);
      const recipeId = inputPayload.promptRecipeId
        || project?.setup?.stageConfig?.video_prompt_generate?.promptRecipeId
        || 'seedance-cinematic-v1';
      const recipe = getSkillPack(skillPack?.id || 'seedance-storyboard-v1')?.promptRecipes?.find((item) => item.id === recipeId);
      const prompt = [
        `${episode.title}：请输出一段完整 Seedance 视频提示词。`,
        context?.contextSummary || episode.synopsis,
        recipe ? `写法偏好：${recipe.name}，${recipe.description}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const workspace = await getEpisodeWorkspace(episode.id);
      if (workspace) {
        const nextNodes = asWorkspaceNodes(workspace.content);
        const promptNode = nextNodes.find((node) => node.type === 'text' && node.title === '视频提示词');
        if (promptNode) {
          promptNode.content = prompt;
        }
        await upsertEpisodeWorkspace({
          episodeId: episode.id,
          projectId: episode.projectId,
          content: {
            ...workspace.content,
            nodes: nextNodes,
          },
        });
      }
      outputPayload = {
        prompt,
        promptRecipeId: recipeId,
      };
    } else {
      outputPayload = {
        message: `${capability.name} 已记录，但当前仓库仍以工作流骨架和数据结构落地为主。`,
      };
    }

    const project = inputPayload.projectId ? await getProjectById(inputPayload.projectId) : null;
    const configuredReviewIds = inputPayload.projectId
      ? project?.setup?.stageConfig?.[capability.stageKind]?.reviewPolicyIds
      : [];
    const reviewPolicyIds = Array.isArray(configuredReviewIds)
      ? configuredReviewIds
      : Array.isArray(skillPack?.reviewPolicies)
        ? skillPack.reviewPolicies
        : [];
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

function asWorkspaceNodes(content) {
  const nodes = Array.isArray(content?.nodes) ? content.nodes : [];
  return nodes.map((node) => ({ ...node }));
}

export async function lockAllProjectAssets(projectId, userId) {
  const assets = await listAssetsByProjectId(projectId);
  const lockedAssets = [];
  for (const asset of assets) {
    lockedAssets.push(await setAssetLockState(asset.id, { locked: true, userId }));
  }
  return lockedAssets;
}
