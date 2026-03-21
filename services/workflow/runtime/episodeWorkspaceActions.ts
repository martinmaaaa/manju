import type {
  CanonicalAsset,
  CanvasNode,
  Episode,
  EpisodeContext,
  EpisodeShotClip,
  EpisodeShotJob,
  EpisodeShotSlot,
  EpisodeShotStrip,
  EpisodeWorkspace,
  EpisodeWorkspaceContent,
  JimengJob,
  ModelDefinition,
  StageConfig,
  StageConfigMap,
  StudioWorkspace,
} from '../../../types/workflowApp';
import {
  buildCanvasConnectionId,
  buildCanvasNodeModelChangePatch,
  buildCanvasNodeStagePresetPatch,
  getNodePrimaryValue,
  validateCanvasConnection,
} from './canvasGraphHelpers';
import {
  buildEpisodeShotClip,
  buildEpisodeShotStrip,
  clearEpisodeShotClip,
  clearEpisodeShotJob,
  findSelectedEpisodeShot,
  saveClipToEpisodeShotStrip,
  selectEpisodeShotSlot,
  upsertEpisodeShotJob,
} from './episodeShotStripHelpers';
import {
  getEpisodeAssetNodeId,
  getEpisodePrimaryNodeId,
  harmonizeEpisodeWorkbenchContent,
} from './episodeWorkbenchHelpers';
import { resolveStageModelParams } from './stageConfigHelpers';

export function updateNodeInContent<T extends EpisodeWorkspace['content'] | StudioWorkspace['content']>(
  content: T,
  nodeId: string,
  patch: Partial<CanvasNode>,
): T {
  return {
    ...content,
    nodes: (content.nodes || []).map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    connections: Array.isArray(content.connections) ? content.connections : [],
  };
}

export function buildEpisodeShotJobState(params: {
  sourceNodeId: string;
  providerJobId?: string | null;
  status: string;
  phase?: string;
  progress?: number;
  error?: string | null;
  updatedAt?: string | null;
  previewUrl?: string;
}): EpisodeShotJob {
  return {
    sourceNodeId: params.sourceNodeId,
    providerJobId: params.providerJobId || null,
    status: params.status,
    phase: params.phase,
    progress: params.progress,
    error: params.error || null,
    updatedAt: params.updatedAt || new Date().toISOString(),
    previewUrl: params.previewUrl,
  };
}

export function applyJimengJobPatchToNode(node: CanvasNode | null, job: JimengJob): Partial<CanvasNode> {
  return {
    output: {
      ...(node?.output || {}),
      providerJobId: job.id,
      previewUrl: job.videoUrl,
      metadata: {
        ...((node?.output?.metadata || {}) as Record<string, unknown>),
        provider: 'jimeng',
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      },
    },
    runStatus: job.status === 'SUCCEEDED' ? 'success' : job.status === 'FAILED' || job.status === 'CANCELLED' ? 'error' : 'running',
    error: job.error || null,
    lastRunAt: job.updated_at || new Date().toISOString(),
    ...(job.videoUrl ? { content: job.videoUrl } : {}),
  };
}

export function repairEpisodeWorkbenchContent(params: {
  content: EpisodeWorkspaceContent;
  episode: Episode;
  episodeContext: EpisodeContext | null;
  lockedAssets: CanonicalAsset[];
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  promptRecipeId?: string;
  forceLayout?: boolean;
}) {
  const nextContent = harmonizeEpisodeWorkbenchContent({
    content: params.content,
    episode: params.episode,
    lockedAssets: params.lockedAssets,
    models: params.models,
    stageConfig: params.stageConfig,
    promptRecipeId: params.promptRecipeId,
    forceLayout: params.forceLayout,
  });

  return {
    ...nextContent,
    shotStrip: buildEpisodeShotStrip({
      episode: params.episode,
      episodeContext: params.episodeContext,
      storyboardText: nextContent.nodes.find((item) => item.id === getEpisodePrimaryNodeId('storyboard', params.episode.id))?.content || '',
      videoPromptText: nextContent.nodes.find((item) => item.id === getEpisodePrimaryNodeId('prompt', params.episode.id))?.content || '',
      currentStrip: nextContent.shotStrip as EpisodeShotStrip | null | undefined,
    }),
  };
}

export function applyStagePresetToEpisodeContent(params: {
  content: EpisodeWorkspaceContent;
  episode: Episode;
  episodeId: string;
  stageKind: 'video_prompt_generate' | 'video_generate';
  stageConfig: StageConfigMap;
  models: ModelDefinition[];
  selectedWorkspaceNode: CanvasNode | null;
  lockedAssets: CanonicalAsset[];
  promptRecipeId?: string;
}): { content: EpisodeWorkspaceContent; selectedNodeId: string | null } {
  const stage = params.stageConfig[params.stageKind];
  const resolvedStage: StageConfig = {
    ...stage,
    modelId: stage.modelId,
    modelParams: resolveStageModelParams(
      {
        ...stage,
        modelId: stage.modelId,
      },
      params.models,
    ),
  };

  const primaryNodeId = params.stageKind === 'video_generate'
    ? getEpisodePrimaryNodeId('video', params.episodeId)
    : getEpisodePrimaryNodeId('prompt', params.episodeId);
  const nextContent = harmonizeEpisodeWorkbenchContent({
    content: params.content,
    episode: params.episode,
    lockedAssets: params.lockedAssets,
    models: params.models,
    stageConfig: params.stageConfig,
    promptRecipeId: params.promptRecipeId,
  });
  const preferredNode = params.stageKind === 'video_generate'
    ? (params.selectedWorkspaceNode?.type === 'video' ? nextContent.nodes.find((item) => item.id === params.selectedWorkspaceNode.id) || null : null)
    : (params.selectedWorkspaceNode?.id === primaryNodeId ? nextContent.nodes.find((item) => item.id === params.selectedWorkspaceNode.id) || null : null);
  const targetNode = preferredNode || nextContent.nodes.find((item) => item.id === primaryNodeId) || null;

  if (!targetNode) {
    return { content: nextContent, selectedNodeId: null };
  }

  return {
    selectedNodeId: targetNode.id,
    content: updateNodeInContent(
      nextContent,
      targetNode.id,
      buildCanvasNodeStagePresetPatch(targetNode, resolvedStage, params.models),
    ),
  };
}

export function storeVideoNodeToShot(params: {
  content: EpisodeWorkspaceContent;
  nodeId: string;
  workspacePromptText: string;
  videoPromptText: string;
}): { content?: EpisodeWorkspaceContent; selectedNodeId?: string | null; error?: string } {
  const sourceNode = params.content.nodes.find((item) => item.id === params.nodeId) || null;
  const sourceVideoUrl = sourceNode ? getNodePrimaryValue(sourceNode) : '';
  const targetShot = findSelectedEpisodeShot(params.content.shotStrip as EpisodeShotStrip | undefined);

  if (!targetShot) {
    return { error: 'Select a shot on the timeline before storing a video result.' };
  }

  if (!sourceNode || sourceNode.type !== 'video' || !sourceVideoUrl) {
    return { error: 'The selected node does not have a storable video result yet.' };
  }

  const clip: EpisodeShotClip = buildEpisodeShotClip({
    slot: targetShot,
    node: sourceNode,
    videoUrl: sourceVideoUrl,
    fallbackPromptText: targetShot.promptText || params.workspacePromptText || params.videoPromptText,
  });

  return {
    selectedNodeId: sourceNode.id,
    content: {
      ...params.content,
      shotStrip: saveClipToEpisodeShotStrip({
        strip: params.content.shotStrip as EpisodeShotStrip | undefined,
        targetShotId: targetShot.id,
        clip,
      }),
    },
  };
}

export function clearShotResultInContent(content: EpisodeWorkspaceContent, slotId: string) {
  return {
    ...content,
    shotStrip: clearEpisodeShotClip(content.shotStrip as EpisodeShotStrip | undefined, slotId),
  };
}

export function retryShotJobInContent(content: EpisodeWorkspaceContent, slotId: string) {
  return {
    ...content,
    shotStrip: clearEpisodeShotJob(
      selectEpisodeShotSlot(content.shotStrip as EpisodeShotStrip | undefined, slotId),
      slotId,
    ),
  };
}

export function applyActiveShotRecommendationToContent(params: {
  content: EpisodeWorkspaceContent;
  episodeId: string;
  activeShot: Pick<EpisodeShotSlot, 'recommendedModelId' | 'recommendedModeId'> | null;
  models: ModelDefinition[];
}): { content: EpisodeWorkspaceContent; selectedNodeId: string | null } {
  if (!params.activeShot) {
    return { content: params.content, selectedNodeId: null };
  }

  const primaryVideoNodeId = getEpisodePrimaryNodeId('video', params.episodeId);
  const currentNode = params.content.nodes.find((item) => item.id === primaryVideoNodeId) || null;
  if (!currentNode) {
    return { content: params.content, selectedNodeId: null };
  }

  const nextPatch = params.activeShot.recommendedModelId
    ? buildCanvasNodeModelChangePatch(currentNode, params.activeShot.recommendedModelId, params.models)
    : {};

  return {
    selectedNodeId: primaryVideoNodeId,
    content: updateNodeInContent(params.content, primaryVideoNodeId, {
      ...nextPatch,
      modeId: params.activeShot.recommendedModeId || nextPatch.modeId || currentNode.modeId,
    }),
  };
}

export function connectRecommendedAssetsToContent(params: {
  content: EpisodeWorkspaceContent;
  episode: Episode;
  episodeId: string;
  lockedAssets: CanonicalAsset[];
  matchedAssets: CanonicalAsset[];
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  promptRecipeId?: string;
}): { content?: EpisodeWorkspaceContent; selectedNodeId?: string | null; warning?: string } {
  const primaryVideoNodeId = getEpisodePrimaryNodeId('video', params.episodeId);
  let warning: string | undefined;
  const syncedContent = harmonizeEpisodeWorkbenchContent({
    content: params.content,
    episode: params.episode,
    lockedAssets: params.lockedAssets,
    models: params.models,
    stageConfig: params.stageConfig,
    promptRecipeId: params.promptRecipeId,
  });
  const videoNode = syncedContent.nodes.find((node) => node.id === primaryVideoNodeId) || null;

  if (!videoNode) {
    return {
      warning: 'The primary video node is missing from the current workbench.',
      selectedNodeId: primaryVideoNodeId,
      content: syncedContent,
    };
  }

  const nextConnections = Array.isArray(syncedContent.connections) ? [...syncedContent.connections] : [];
  for (const asset of params.matchedAssets) {
    const assetNodeId = getEpisodeAssetNodeId(asset.id);
    const assetNode = syncedContent.nodes.find((node) => node.id === assetNodeId) || null;
    if (!assetNode) {
      warning = `Recommended asset ${asset.name} has not been synced into the workbench yet.`;
      continue;
    }

    const validation = validateCanvasConnection(assetNode, videoNode, params.models, nextConnections);
    if (!validation.valid || !validation.resolvedInputKey) {
      warning = validation.error || `Recommended asset ${asset.name} cannot connect to the current video node.`;
      continue;
    }

    const exists = nextConnections.some((connection) => (
      connection.from === assetNode.id
      && connection.to === videoNode.id
      && connection.inputKey === validation.resolvedInputKey
    ));
    if (exists) {
      continue;
    }

    nextConnections.push({
      id: buildCanvasConnectionId(assetNode.id, videoNode.id, validation.resolvedInputKey),
      from: assetNode.id,
      to: videoNode.id,
      inputKey: validation.resolvedInputKey,
      inputType: assetNode.type,
    });
  }

  return {
    selectedNodeId: primaryVideoNodeId,
    warning,
    content: {
      ...syncedContent,
      connections: nextConnections,
    },
  };
}
