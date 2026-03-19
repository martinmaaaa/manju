import type {
  CanonicalAsset,
  Episode,
  EpisodeContext,
  EpisodeShotJob,
  EpisodeShotStrip,
  EpisodeWorkspace,
  SkillPack,
  StageConfigMap,
} from '../../../types/workflowApp';
import { getNodePrimaryValue } from './canvasGraphHelpers';
import {
  buildEpisodeShotStrip,
  findSelectedEpisodeShot,
  getEpisodeShotStripTotalSeconds,
  summarizeEpisodeShotStrip,
} from './episodeShotStripHelpers';
import { selectStagePromptRecipe, selectStageSkillPack } from './stageConfigHelpers';
import { collectEpisodeWorkspaceVideoInputs, isAudioSource } from './workspaceMediaHelpers';

function buildEpisodeShotJobState(params: {
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

function normalizeAssetReferenceName(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

export interface EpisodeWorkspaceViewModelInput {
  currentEpisode: Episode | null;
  episodeContext: EpisodeContext | null;
  episodeWorkspace: EpisodeWorkspace | null;
  assets: CanonicalAsset[];
  selectedNodeId: string | null;
  skillPacks: SkillPack[];
  stageConfig: StageConfigMap;
}

export function buildEpisodeWorkspaceViewModel({
  currentEpisode,
  episodeContext,
  episodeWorkspace,
  assets,
  selectedNodeId,
  skillPacks,
  stageConfig,
}: EpisodeWorkspaceViewModelInput) {
  const videoPromptStage = {
    capabilityId: 'video_prompt_generate',
    modelId: '',
    reviewPolicyIds: [],
    ...(stageConfig.video_prompt_generate || {}),
  };
  const videoPromptSkillPack = selectStageSkillPack(skillPacks, 'video_prompt_generate', videoPromptStage);
  const activePromptRecipe = selectStagePromptRecipe('video_prompt_generate', videoPromptStage, videoPromptSkillPack);

  const storyboardText = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('storyboard-'))?.content || '';
  const videoPromptText = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('prompt-'))?.content || '';
  const audioReference = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('audio-'))?.content || '';
  const selectedWorkspaceNode = episodeWorkspace?.content.nodes.find((item) => item.id === selectedNodeId) || null;
  const videoNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('video-')) || null;
  const imageNode = episodeWorkspace?.content.nodes.find((item) => item.id.startsWith('visual-')) || null;
  const lockedAssets = assets.filter((asset) => asset.isLocked);

  const assetNodesByAssetId = new Map(
    (episodeWorkspace?.content.nodes || [])
      .filter((node) => String(node.metadata?.lockedAssetId || '').trim())
      .map((node) => [String(node.metadata?.lockedAssetId || '').trim(), node]),
  );

  const syncedAssetCount = lockedAssets.filter((asset) => assetNodesByAssetId.has(asset.id)).length;
  const syncedAssetVersionCount = lockedAssets.filter((asset) => {
    const assetNode = assetNodesByAssetId.get(asset.id) || null;
    const assetVersionId = asset.versions.find((item) => item.id === asset.currentVersionId)?.id || asset.versions[0]?.id || null;
    const nodeVersionId = String(assetNode?.metadata?.sourceVersionId || '').trim() || null;
    return Boolean(assetNode) && assetVersionId === nodeVersionId;
  }).length;

  const workspaceVideoInputs = collectEpisodeWorkspaceVideoInputs(episodeWorkspace);
  const connectedAudioReference = workspaceVideoInputs.audioReferenceUrls[0] || audioReference;
  const hasAudioReference = isAudioSource(connectedAudioReference);

  const shotStrip = (episodeWorkspace?.content.shotStrip as EpisodeShotStrip | undefined) || buildEpisodeShotStrip({
    episode: currentEpisode,
    episodeContext,
    storyboardText,
    videoPromptText,
  });
  const activeShotGraph = shotStrip.selectedShotId
    ? episodeWorkspace?.content.shotGraphs?.[shotStrip.selectedShotId] || null
    : null;
  const currentShotViewport = activeShotGraph?.viewport || null;
  const activeShot = findSelectedEpisodeShot(shotStrip);
  const totalTimelineSeconds = episodeWorkspace?.content.timeline?.totalSeconds || getEpisodeShotStripTotalSeconds(shotStrip);
  const currentTimelineSeconds = Math.max(
    0,
    Math.min(
      totalTimelineSeconds,
      Number(episodeWorkspace?.content.timeline?.currentSeconds ?? activeShot?.startSeconds ?? 0) || 0,
    ),
  );
  const activeShotJob = activeShot?.job || null;
  const previewNode = selectedWorkspaceNode || videoNode || imageNode || null;
  const previewNodeMetadata = (previewNode?.output?.metadata || {}) as Record<string, unknown>;
  const previewAsyncState = activeShotJob || (
    previewNode?.type === 'video' && (
      typeof previewNodeMetadata.status === 'string'
      || previewNode.runStatus === 'running'
      || previewNode.runStatus === 'error'
    )
      ? buildEpisodeShotJobState({
          sourceNodeId: previewNode.id,
          providerJobId: typeof previewNode.output?.providerJobId === 'string' ? previewNode.output.providerJobId : null,
          status: typeof previewNodeMetadata.status === 'string'
            ? previewNodeMetadata.status
            : previewNode.runStatus === 'error'
              ? 'FAILED'
              : 'RUNNING',
          phase: typeof previewNodeMetadata.phase === 'string' ? previewNodeMetadata.phase : undefined,
          progress: typeof previewNodeMetadata.progress === 'number' ? previewNodeMetadata.progress : undefined,
          error: previewNode.error || null,
          updatedAt: previewNode.lastRunAt,
          previewUrl: getNodePrimaryValue(previewNode),
        })
      : null
  );
  const previewValue = activeShot?.clip?.videoUrl || activeShotJob?.previewUrl || (previewNode ? getNodePrimaryValue(previewNode) : '');
  const previewTitle = activeShot?.title || previewNode?.title || '当前预览';
  const previewSummary = activeShot?.summary || activeShot?.clip?.promptText || '';
  const shotStripSummary = summarizeEpisodeShotStrip(shotStrip);

  const activeShotRecommendedAssets = activeShot?.referenceAssetNames?.length
    ? activeShot.referenceAssetNames.map((name) => {
        const normalized = normalizeAssetReferenceName(name);
        const matchedAsset = lockedAssets.find((asset) => {
          const assetName = normalizeAssetReferenceName(asset.name);
          return assetName === normalized || assetName.includes(normalized) || normalized.includes(assetName);
        }) || null;
        return {
          name,
          asset: matchedAsset,
        };
      })
    : [];

  return {
    videoPromptSkillPack,
    activePromptRecipe,
    storyboardText,
    videoPromptText,
    audioReference,
    selectedWorkspaceNode,
    videoNode,
    imageNode,
    lockedAssets,
    assetNodesByAssetId,
    syncedAssetCount,
    syncedAssetVersionCount,
    workspaceVideoInputs,
    connectedAudioReference,
    hasAudioReference,
    shotStrip,
    activeShotGraph,
    currentShotViewport,
    activeShot,
    totalTimelineSeconds,
    currentTimelineSeconds,
    activeShotJob,
    previewNode,
    previewAsyncState,
    previewValue,
    previewTitle,
    previewSummary,
    shotStripSummary,
    activeShotRecommendedAssets,
  };
}
