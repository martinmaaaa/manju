import type { CanvasNode, EpisodeWorkspace } from '../../../types/workflowApp';

const HTTP_URL_PATTERN = /^https?:\/\//i;
const AUDIO_DATA_URI_PATTERN = /^data:audio\/[\w.+-]+;base64,/i;

function cleanNodes(nodes: CanvasNode[] | undefined): CanvasNode[] {
  return Array.isArray(nodes) ? nodes.filter(Boolean) : [];
}

function firstNodeContentByPrefix(nodes: CanvasNode[], prefix: string): string {
  return cleanNodes(nodes)
    .find((node) => String(node.id).startsWith(prefix))
    ?.content?.trim() || '';
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
  audioReferenceUrls: string[];
} {
  const nodes = cleanNodes(workspace?.content?.nodes);

  return {
    prompt: firstNodeContentByPrefix(nodes, 'prompt-'),
    imageUrls: nodes
      .filter((node) => node.type === 'image' && HTTP_URL_PATTERN.test(String(node.content || '').trim()))
      .map((node) => String(node.content || '').trim()),
    audioReferenceUrls: nodes
      .filter((node) => node.type === 'audio' && HTTP_URL_PATTERN.test(String(node.content || '').trim()))
      .map((node) => String(node.content || '').trim()),
  };
}
