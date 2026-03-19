import type {
  CanvasNode,
  EpisodeShotStrip,
  EpisodeWorkspaceContent,
  ModelDefinition,
  StageConfigMap,
} from '../../../types/workflowApp';
import { createCanvasNode } from './canvasGraphHelpers';
import {
  getEpisodeShotStripTotalSeconds,
  normalizeEpisodeShotStrip,
} from './episodeShotStripHelpers';
import {
  switchEpisodeWorkspaceContentShot,
  syncEpisodeWorkspaceContent,
} from './episodeWorkspaceGraphHelpers';
import { isEpisodeWorkbenchManagedNode } from './episodeWorkbenchHelpers';

interface AddEpisodeWorkspaceNodeInput {
  content: EpisodeWorkspaceContent;
  type: CanvasNode['type'];
  episodeId: string;
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  position?: { x: number; y: number } | null;
}

interface EpisodeWorkspaceDraftResult {
  content: EpisodeWorkspaceContent;
  selectedNodeId: string | null;
}

function resolveNextSelectedNodeId(content: EpisodeWorkspaceContent, preferredNodeId?: string | null) {
  return content.nodes.find((node) => node.id === preferredNodeId)?.id
    || content.nodes[0]?.id
    || null;
}

export function addEpisodeWorkspaceNode({
  content,
  type,
  episodeId,
  models,
  stageConfig,
  position,
}: AddEpisodeWorkspaceNodeInput): EpisodeWorkspaceDraftResult & { node: CanvasNode } {
  const nextNode = createCanvasNode(type, content.nodes.length, models, stageConfig);

  if (position) {
    nextNode.x = Math.round(position.x);
    nextNode.y = Math.round(position.y);
  } else {
    const customNodeCount = (content.nodes || []).filter((node) => !isEpisodeWorkbenchManagedNode(node, episodeId)).length;
    nextNode.x = 1240 + (customNodeCount % 2) * 340;
    nextNode.y = 80 + Math.floor(customNodeCount / 2) * 280;
  }

  return {
    node: nextNode,
    selectedNodeId: nextNode.id,
    content: {
      ...content,
      nodes: [...content.nodes, nextNode],
      connections: Array.isArray(content.connections) ? content.connections : [],
    },
  };
}

export function selectEpisodeWorkspaceShotDraft(params: {
  content: EpisodeWorkspaceContent;
  slotId: string;
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  selectedNodeId?: string | null;
}): EpisodeWorkspaceDraftResult {
  const nextContent = switchEpisodeWorkspaceContentShot(
    params.content,
    params.slotId,
    params.models,
    params.stageConfig,
  );

  return {
    content: nextContent,
    selectedNodeId: resolveNextSelectedNodeId(nextContent, params.selectedNodeId),
  };
}

export function seekEpisodeWorkspaceTimelineDraft(params: {
  content: EpisodeWorkspaceContent;
  seconds: number;
  syncShot?: boolean;
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  selectedNodeId?: string | null;
}): EpisodeWorkspaceDraftResult {
  const shotStrip = normalizeEpisodeShotStrip(params.content.shotStrip as EpisodeShotStrip | undefined);
  const totalTimelineSeconds = getEpisodeShotStripTotalSeconds(shotStrip);
  const boundedSeconds = Math.max(0, Math.min(totalTimelineSeconds, params.seconds));
  const targetSlot = shotStrip.slots.find((slot) => (
    boundedSeconds >= (slot.startSeconds || 0)
    && (
      boundedSeconds < (slot.endSeconds || 0)
      || (boundedSeconds === totalTimelineSeconds && slot.id === shotStrip.slots[shotStrip.slots.length - 1]?.id)
    )
  )) || shotStrip.slots[shotStrip.slots.length - 1] || null;

  if (params.syncShot && targetSlot) {
    const switchedContent = switchEpisodeWorkspaceContentShot(
      params.content,
      targetSlot.id,
      params.models,
      params.stageConfig,
    );
    const nextContent = syncEpisodeWorkspaceContent(switchedContent, params.models, params.stageConfig, {
      selectedShotId: targetSlot.id,
      currentSeconds: boundedSeconds,
      topLevelIsAuthoritative: false,
    });

    return {
      content: nextContent,
      selectedNodeId: resolveNextSelectedNodeId(nextContent, params.selectedNodeId),
    };
  }

  const nextContent = syncEpisodeWorkspaceContent(params.content, params.models, params.stageConfig, {
    currentSeconds: boundedSeconds,
    topLevelIsAuthoritative: true,
  });

  return {
    content: nextContent,
    selectedNodeId: resolveNextSelectedNodeId(nextContent, params.selectedNodeId),
  };
}
