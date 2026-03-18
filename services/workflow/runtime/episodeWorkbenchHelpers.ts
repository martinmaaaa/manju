import type {
  CanonicalAsset,
  CanvasConnection,
  CanvasNode,
  Episode,
  EpisodeWorkspace,
  ModelDefinition,
  StageConfigMap,
} from '../../../types/workflowApp';
import { buildCanvasConnectionId, createCanvasNode } from './canvasGraphHelpers';

type EpisodeWorkbenchNodeKind = 'script' | 'storyboard' | 'prompt' | 'visual' | 'video';

interface EpisodeWorkbenchLayoutFrame {
  type: CanvasNode['type'];
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HarmonizeEpisodeWorkbenchOptions {
  content: EpisodeWorkspace['content'];
  episode: Episode;
  lockedAssets: CanonicalAsset[];
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  promptRecipeId?: string;
  forceLayout?: boolean;
}

const PRIMARY_LAYOUT: Record<EpisodeWorkbenchNodeKind, EpisodeWorkbenchLayoutFrame> = {
  script: {
    type: 'text',
    title: '本集脚本',
    x: 60,
    y: 80,
    width: 320,
    height: 220,
  },
  storyboard: {
    type: 'text',
    title: '分镜节拍',
    x: 440,
    y: 80,
    width: 320,
    height: 220,
  },
  prompt: {
    type: 'text',
    title: '视频提示词',
    x: 820,
    y: 80,
    width: 360,
    height: 260,
  },
  visual: {
    type: 'image',
    title: '图片参考',
    x: 120,
    y: 360,
    width: 300,
    height: 220,
  },
  video: {
    type: 'video',
    title: '视频生成',
    x: 880,
    y: 380,
    width: 300,
    height: 220,
  },
};

function cleanNodes(nodes: CanvasNode[] | undefined): CanvasNode[] {
  return Array.isArray(nodes) ? nodes.filter(Boolean) : [];
}

function cleanConnections(connections: CanvasConnection[] | undefined): CanvasConnection[] {
  return Array.isArray(connections) ? connections.filter(Boolean) : [];
}

function buildPromptSeed(episode: Episode, lockedAssets: CanonicalAsset[], promptRecipeId?: string) {
  return [
    `请围绕 ${episode.title} 生成一段完整的动态叙事视频提示词。`,
    lockedAssets.length > 0 ? `必须使用的锁定资产：${lockedAssets.map((asset) => asset.name).join('、')}` : '',
    promptRecipeId ? `提示词写法：${promptRecipeId}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function currentAssetVersion(asset: CanonicalAsset) {
  if (!Array.isArray(asset.versions) || asset.versions.length === 0) {
    return null;
  }

  return asset.versions.find((item) => item.id === asset.currentVersionId) || asset.versions[0];
}

function mergeNodeFrame(
  node: CanvasNode,
  frame: EpisodeWorkbenchLayoutFrame,
  forceLayout = false,
): CanvasNode {
  return {
    ...node,
    type: frame.type,
    title: frame.title,
    x: forceLayout ? frame.x : Number.isFinite(node.x) ? node.x : frame.x,
    y: forceLayout ? frame.y : Number.isFinite(node.y) ? node.y : frame.y,
    width: forceLayout ? frame.width : Number.isFinite(node.width) ? node.width : frame.width,
    height: forceLayout ? frame.height : Number.isFinite(node.height) ? node.height : frame.height,
  };
}

export function getEpisodePrimaryNodeId(kind: EpisodeWorkbenchNodeKind, episodeId: string): string {
  return `${kind}-${episodeId}`;
}

export function getEpisodeAssetNodeId(assetId: string): string {
  return `asset-${assetId}`;
}

export function isEpisodeWorkbenchManagedNode(node: Pick<CanvasNode, 'id' | 'metadata'>, episodeId: string): boolean {
  return (
    node.id === getEpisodePrimaryNodeId('script', episodeId) ||
    node.id === getEpisodePrimaryNodeId('storyboard', episodeId) ||
    node.id === getEpisodePrimaryNodeId('prompt', episodeId) ||
    node.id === getEpisodePrimaryNodeId('visual', episodeId) ||
    node.id === getEpisodePrimaryNodeId('video', episodeId) ||
    String(node.id || '').startsWith('asset-') ||
    Boolean(node.metadata?.lockedAssetId)
  );
}

function buildPrimaryNode(
  kind: EpisodeWorkbenchNodeKind,
  episode: Episode,
  lockedAssets: CanonicalAsset[],
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
  promptRecipeId?: string,
): CanvasNode {
  const frame = PRIMARY_LAYOUT[kind];
  const baseNode = createCanvasNode(frame.type, 0, models, stageConfig);
  const scriptContent = episode.sourceText || episode.synopsis || '';
  const promptSeed = buildPromptSeed(episode, lockedAssets, promptRecipeId);

  const content = kind === 'script'
    ? scriptContent
    : kind === 'storyboard'
      ? '待补充分镜节拍与镜头运动。'
      : kind === 'prompt'
        ? promptSeed
        : '';

  return {
    ...baseNode,
    id: getEpisodePrimaryNodeId(kind, episode.id),
    title: frame.title,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    content,
    output: kind === 'script' || kind === 'prompt'
      ? { text: content }
      : {},
  };
}

function buildLockedAssetNode(asset: CanonicalAsset, index: number): CanvasNode {
  const version = currentAssetVersion(asset);

  return {
    id: getEpisodeAssetNodeId(asset.id),
    type: 'image',
    title: `${asset.type} · ${asset.name}`,
    x: 60 + (index % 4) * 250,
    y: 650 + Math.floor(index / 4) * 220,
    width: 220,
    height: 180,
    content: version?.previewUrl || '',
    prompt: version?.promptText || asset.description || '',
    params: {},
    output: version?.previewUrl ? { previewUrl: version.previewUrl } : {},
    runStatus: 'idle',
    error: null,
    lastRunAt: null,
    metadata: {
      lockedAssetId: asset.id,
      assetType: asset.type,
      sourceVersionId: asset.currentVersionId || null,
    },
  };
}

function buildPrimaryConnections(episodeId: string): CanvasConnection[] {
  const scriptId = getEpisodePrimaryNodeId('script', episodeId);
  const storyboardId = getEpisodePrimaryNodeId('storyboard', episodeId);
  const promptId = getEpisodePrimaryNodeId('prompt', episodeId);
  const visualId = getEpisodePrimaryNodeId('visual', episodeId);
  const videoId = getEpisodePrimaryNodeId('video', episodeId);

  return [
    { id: buildCanvasConnectionId(scriptId, storyboardId), from: scriptId, to: storyboardId, inputType: 'text' },
    { id: buildCanvasConnectionId(storyboardId, promptId), from: storyboardId, to: promptId, inputType: 'text' },
    { id: buildCanvasConnectionId(promptId, videoId), from: promptId, to: videoId, inputType: 'text' },
    { id: buildCanvasConnectionId(visualId, videoId), from: visualId, to: videoId, inputType: 'image' },
  ];
}

export function layoutEpisodeWorkbenchContent(
  content: EpisodeWorkspace['content'],
  episodeId: string,
  lockedAssets: CanonicalAsset[],
): EpisodeWorkspace['content'] {
  const assetIndexMap = new Map(lockedAssets.map((asset, index) => [asset.id, index]));
  const nextNodes = cleanNodes(content.nodes).map((node, customIndex, allNodes) => {
    if (node.id === getEpisodePrimaryNodeId('script', episodeId)) {
      return mergeNodeFrame(node, PRIMARY_LAYOUT.script, true);
    }
    if (node.id === getEpisodePrimaryNodeId('storyboard', episodeId)) {
      return mergeNodeFrame(node, PRIMARY_LAYOUT.storyboard, true);
    }
    if (node.id === getEpisodePrimaryNodeId('prompt', episodeId)) {
      return mergeNodeFrame(node, PRIMARY_LAYOUT.prompt, true);
    }
    if (node.id === getEpisodePrimaryNodeId('visual', episodeId)) {
      return mergeNodeFrame(node, PRIMARY_LAYOUT.visual, true);
    }
    if (node.id === getEpisodePrimaryNodeId('video', episodeId)) {
      return mergeNodeFrame(node, PRIMARY_LAYOUT.video, true);
    }

    const lockedAssetId = String(node.metadata?.lockedAssetId || '').trim();
    if (lockedAssetId && assetIndexMap.has(lockedAssetId)) {
      const assetIndex = assetIndexMap.get(lockedAssetId) || 0;
      return {
        ...node,
        x: 60 + (assetIndex % 4) * 250,
        y: 650 + Math.floor(assetIndex / 4) * 220,
        width: 220,
        height: 180,
      };
    }

    const customNodes = allNodes.filter((item) => !isEpisodeWorkbenchManagedNode(item, episodeId));
    const visibleIndex = customNodes.findIndex((item) => item.id === node.id);
    const laneIndex = visibleIndex === -1 ? customIndex : visibleIndex;
    return {
      ...node,
      x: 1240 + (laneIndex % 2) * 340,
      y: 80 + Math.floor(laneIndex / 2) * 280,
    };
  });

  return {
    ...content,
    nodes: nextNodes,
    connections: cleanConnections(content.connections),
  };
}

export function harmonizeEpisodeWorkbenchContent({
  content,
  episode,
  lockedAssets,
  models,
  stageConfig,
  promptRecipeId,
  forceLayout = false,
}: HarmonizeEpisodeWorkbenchOptions): EpisodeWorkspace['content'] {
  const existingNodes = cleanNodes(content.nodes);
  const existingNodeMap = new Map(existingNodes.map((node) => [node.id, node]));
  const primaryKinds: EpisodeWorkbenchNodeKind[] = ['script', 'storyboard', 'prompt', 'visual', 'video'];

  const primaryNodes = primaryKinds.map((kind) => {
    const id = getEpisodePrimaryNodeId(kind, episode.id);
    const existingNode = existingNodeMap.get(id);
    const frame = PRIMARY_LAYOUT[kind];
    const defaultNode = buildPrimaryNode(kind, episode, lockedAssets, models, stageConfig, promptRecipeId);

    if (!existingNode) {
      return defaultNode;
    }

    const merged = mergeNodeFrame(existingNode, frame, forceLayout);
    if (kind === 'script' && !String(merged.content || '').trim()) {
      merged.content = defaultNode.content;
      merged.output = { ...(merged.output || {}), text: defaultNode.content };
    }
    if (kind === 'prompt' && !String(merged.content || '').trim()) {
      merged.content = defaultNode.content;
      merged.output = { ...(merged.output || {}), text: defaultNode.content };
    }
    return merged;
  });

  const syncedAssetNodes = lockedAssets.map((asset, index) => {
    const id = getEpisodeAssetNodeId(asset.id);
    const existingNode = existingNodeMap.get(id);
    const defaultNode = buildLockedAssetNode(asset, index);
    if (!existingNode) {
      return defaultNode;
    }

    return {
      ...existingNode,
      id: defaultNode.id,
      type: defaultNode.type,
      title: defaultNode.title,
      content: defaultNode.content,
      prompt: defaultNode.prompt,
      output: defaultNode.output,
      metadata: defaultNode.metadata,
      x: forceLayout ? defaultNode.x : existingNode.x,
      y: forceLayout ? defaultNode.y : existingNode.y,
      width: forceLayout ? defaultNode.width : existingNode.width,
      height: forceLayout ? defaultNode.height : existingNode.height,
    };
  });

  const customNodes = existingNodes.filter((node) => !isEpisodeWorkbenchManagedNode(node, episode.id));
  const nextNodes = [...primaryNodes, ...customNodes, ...syncedAssetNodes];
  const validNodeIds = new Set(nextNodes.map((node) => node.id));
  const requiredConnections = buildPrimaryConnections(episode.id);
  const seenPairs = new Set<string>();
  const nextConnections = [
    ...cleanConnections(content.connections)
      .filter((connection) => validNodeIds.has(connection.from) && validNodeIds.has(connection.to))
      .filter((connection) => {
        const pairKey = `${connection.from}=>${connection.to}`;
        if (seenPairs.has(pairKey)) {
          return false;
        }
        seenPairs.add(pairKey);
        return true;
      }),
    ...requiredConnections.filter((connection) => {
      const pairKey = `${connection.from}=>${connection.to}`;
      if (seenPairs.has(pairKey)) {
        return false;
      }
      seenPairs.add(pairKey);
      return true;
    }),
  ];

  const nextContent = {
    ...content,
    nodes: nextNodes,
    connections: nextConnections,
  };

  return forceLayout
    ? layoutEpisodeWorkbenchContent(nextContent, episode.id, lockedAssets)
    : nextContent;
}
