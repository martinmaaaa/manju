import type { CanvasConnection, CanvasNode, EpisodeWorkspace } from '../../../types/workflowApp';

const HTTP_URL_PATTERN = /^https?:\/\//i;
const AUDIO_DATA_URI_PATTERN = /^data:audio\/[\w.+-]+;base64,/i;

function cleanNodes(nodes: CanvasNode[] | undefined): CanvasNode[] {
  return Array.isArray(nodes) ? nodes.filter(Boolean) : [];
}

function firstNodeByPrefix(nodes: CanvasNode[], prefix: string): CanvasNode | undefined {
  return cleanNodes(nodes)
    .find((node) => String(node.id).startsWith(prefix));
}

function firstExecutableVideoNode(nodes: CanvasNode[]): CanvasNode | undefined {
  return cleanNodes(nodes)
    .find((node) => node.type === 'video' && String(node.id).startsWith('video-') && String(node.modelId || '').trim())
    || firstNodeByPrefix(nodes, 'video-');
}

function firstNodeContentByPrefix(nodes: CanvasNode[], prefix: string): string {
  return firstNodeByPrefix(nodes, prefix)?.content?.trim() || '';
}

export function isAudioSource(value: string): boolean {
  const normalized = String(value || '').trim();
  return AUDIO_DATA_URI_PATTERN.test(normalized) || HTTP_URL_PATTERN.test(normalized);
}

export function collectEpisodeWorkspaceVideoInputs(
  workspace: Pick<EpisodeWorkspace, 'content'> | null | undefined,
): {
  prompt: string;
  imageUrls: string[];
  videoReferenceUrls: string[];
  audioReferenceUrls: string[];
  assetReferences: Array<{
    assetId: string;
    assetName: string;
    assetType: string;
    versionId: string | null;
    versionNumber: number | null;
    versionLabel: string;
    inputKey: string;
    inputType: CanvasNode['type'];
  }>;
} {
  const nodes = cleanNodes(workspace?.content?.nodes);
  const connections = Array.isArray(workspace?.content?.connections) ? workspace?.content?.connections.filter(Boolean) : [];
  const videoNode = firstExecutableVideoNode(nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const videoInputNodes = videoNode
    ? connections
        .filter((connection) => connection.to === videoNode.id)
        .map((connection) => ({
          connection,
          node: nodeById.get(connection.from),
        }))
        .filter((entry): entry is { connection: CanvasConnection; node: CanvasNode } => Boolean(entry.node))
    : [];

  const referenceImageUrls = Array.from(new Set(videoInputNodes
    .filter(({ connection, node }) => (
      connection.inputKey === 'referenceImages'
      || connection.inputKey === 'startFrame'
      || connection.inputKey === 'endFrame'
      || connection.inputKey === 'referenceAssets' && node.type === 'image'
    ))
    .map(({ node }) => String(node.content || '').trim())
    .filter((value) => HTTP_URL_PATTERN.test(value))));
  const referenceVideoUrls = Array.from(new Set(videoInputNodes
    .filter(({ connection, node }) => (
      connection.inputKey === 'referenceVideos'
      || connection.inputKey === 'referenceAssets' && node.type === 'video'
    ))
    .map(({ node }) => String(node.content || '').trim())
    .filter((value) => HTTP_URL_PATTERN.test(value))));
  const referenceAudioUrls = Array.from(new Set(videoInputNodes
    .filter(({ connection, node }) => (
      connection.inputKey === 'referenceAudios'
      || connection.inputKey === 'referenceAssets' && node.type === 'audio'
    ))
    .map(({ node }) => String(node.content || '').trim())
    .filter((value) => HTTP_URL_PATTERN.test(value))));
  const assetReferences = Array.from(new Map(videoInputNodes
    .filter(({ node }) => String(node.metadata?.lockedAssetId || '').trim())
    .map(({ connection, node }) => {
      const assetId = String(node.metadata?.lockedAssetId || '').trim();
      const assetName = String(node.metadata?.lockedAssetName || node.title || '').trim();
      const versionId = String(node.metadata?.sourceVersionId || '').trim() || null;
      const versionNumberRaw = Number(node.metadata?.sourceVersionNumber);
      const versionNumber = Number.isFinite(versionNumberRaw) ? versionNumberRaw : null;
      return [
        `${assetId}:${versionId || 'none'}:${connection.inputKey}`,
        {
          assetId,
          assetName,
          assetType: String(node.metadata?.assetType || '').trim() || node.type,
          versionId,
          versionNumber,
          versionLabel: String(node.metadata?.sourceVersionLabel || '').trim() || 'manual',
          inputKey: connection.inputKey,
          inputType: node.type,
        },
      ] as const;
    }))
    .values());

  return {
    prompt: firstNodeContentByPrefix(nodes, 'prompt-'),
    imageUrls: referenceImageUrls,
    videoReferenceUrls: referenceVideoUrls,
    audioReferenceUrls: referenceAudioUrls,
    assetReferences,
  };
}
