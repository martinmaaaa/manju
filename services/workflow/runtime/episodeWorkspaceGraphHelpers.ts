import type {
  CanvasConnection,
  CanvasNode,
  EpisodeWorkspaceContent,
  EpisodeWorkspaceShotGraph,
  ModelDefinition,
  StageConfigMap,
} from '../../../types/workflowApp';
import { normalizeCanvasContent } from './canvasGraphHelpers';
import {
  getEpisodeShotStripTotalSeconds,
  normalizeEpisodeShotStrip,
  selectEpisodeShotSlot,
} from './episodeShotStripHelpers';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    params: isObject(node.params) ? { ...node.params } : node.params,
    output: isObject(node.output) ? { ...node.output } : node.output,
    metadata: isObject(node.metadata) ? { ...node.metadata } : node.metadata,
  }));
}

function cloneConnections(connections: CanvasConnection[]): CanvasConnection[] {
  return connections.map((connection) => ({ ...connection }));
}

function cloneShotGraph(graph: EpisodeWorkspaceShotGraph): EpisodeWorkspaceShotGraph {
  return {
    ...graph,
    nodes: cloneNodes(graph.nodes || []),
    connections: cloneConnections(Array.isArray(graph.connections) ? graph.connections : []),
    viewport: graph.viewport ? { ...graph.viewport } : graph.viewport,
    history: Array.isArray(graph.history) ? [...graph.history] : graph.history,
  };
}

function normalizeShotGraph(
  graph: EpisodeWorkspaceShotGraph | undefined,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): EpisodeWorkspaceShotGraph {
  const normalized = normalizeCanvasContent({
    nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
    connections: Array.isArray(graph?.connections) ? graph.connections : [],
  }, models, stageConfig);
  return {
    nodes: cloneNodes(normalized.nodes),
    connections: cloneConnections(normalized.connections),
    viewport: graph?.viewport ? { ...graph.viewport } : undefined,
    history: Array.isArray(graph?.history) ? [...graph.history] : undefined,
  };
}

function normalizeShotGraphs(
  value: unknown,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): Record<string, EpisodeWorkspaceShotGraph> {
  if (!isObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, EpisodeWorkspaceShotGraph>>((acc, [shotId, graph]) => {
    if (!shotId.trim()) {
      return acc;
    }

    acc[shotId] = normalizeShotGraph(
      isObject(graph)
        ? {
            nodes: Array.isArray(graph.nodes) ? (graph.nodes as CanvasNode[]) : [],
            connections: Array.isArray(graph.connections) ? (graph.connections as CanvasConnection[]) : [],
            viewport: isObject(graph.viewport) ? {
              x: Number(graph.viewport.x || 0),
              y: Number(graph.viewport.y || 0),
              zoom: Number(graph.viewport.zoom || 1),
            } : undefined,
            history: Array.isArray(graph.history) ? graph.history : undefined,
          }
        : undefined,
      models,
      stageConfig,
    );
    return acc;
  }, {});
}

function getSelectedShotStartSeconds(content: EpisodeWorkspaceContent): number {
  const strip = normalizeEpisodeShotStrip(content.shotStrip);
  const selectedSlot = strip.slots.find((slot) => slot.id === strip.selectedShotId);
  return selectedSlot?.startSeconds || 0;
}

function resolveTimelineCurrentSeconds(
  content: EpisodeWorkspaceContent,
  explicitCurrentSeconds: number | undefined,
): number {
  const totalSeconds = getEpisodeShotStripTotalSeconds(content.shotStrip);
  const fallback = getSelectedShotStartSeconds(content);

  if (typeof explicitCurrentSeconds === 'number' && Number.isFinite(explicitCurrentSeconds)) {
    return Math.max(0, Math.min(explicitCurrentSeconds, totalSeconds));
  }

  const existing = Number(content.timeline?.currentSeconds);
  if (Number.isFinite(existing)) {
    return Math.max(0, Math.min(existing, totalSeconds));
  }

  return fallback;
}

export function syncEpisodeWorkspaceContent(
  content: EpisodeWorkspaceContent,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
  options?: {
    selectedShotId?: string | null;
    currentSeconds?: number;
    topLevelIsAuthoritative?: boolean;
  },
): EpisodeWorkspaceContent {
  const normalizedTopLevel = normalizeCanvasContent(content, models, stageConfig);
  const normalizedStrip = normalizeEpisodeShotStrip(content.shotStrip);
  const normalizedShotGraphs = normalizeShotGraphs(content.shotGraphs, models, stageConfig);
  const currentSelectedShotId = normalizedStrip.selectedShotId;
  const selectedShotId = options?.selectedShotId ?? currentSelectedShotId;
  const activeGraphFromTopLevel: EpisodeWorkspaceShotGraph = {
    nodes: cloneNodes(normalizedTopLevel.nodes),
    connections: cloneConnections(normalizedTopLevel.connections),
    viewport: normalizedShotGraphs[currentSelectedShotId || '']?.viewport,
    history: normalizedShotGraphs[currentSelectedShotId || '']?.history,
  };

  if (currentSelectedShotId && (options?.topLevelIsAuthoritative !== false || !normalizedShotGraphs[currentSelectedShotId])) {
    normalizedShotGraphs[currentSelectedShotId] = cloneShotGraph(activeGraphFromTopLevel);
  }

  let activeGraph = selectedShotId ? normalizedShotGraphs[selectedShotId] : undefined;
  if (!activeGraph) {
    activeGraph = cloneShotGraph(activeGraphFromTopLevel);
    if (selectedShotId) {
      normalizedShotGraphs[selectedShotId] = cloneShotGraph(activeGraph);
    }
  }

  const nextShotStrip = selectedShotId
    ? selectEpisodeShotSlot(normalizedStrip, selectedShotId)
    : normalizedStrip;
  const totalSeconds = getEpisodeShotStripTotalSeconds(nextShotStrip);
  const currentSeconds = resolveTimelineCurrentSeconds(
    {
      ...content,
      shotStrip: nextShotStrip,
      timeline: content.timeline,
    },
    options?.currentSeconds,
  );

  return {
    ...content,
    nodes: cloneNodes(activeGraph.nodes),
    connections: cloneConnections(activeGraph.connections || []),
    shotStrip: nextShotStrip,
    shotGraphs: normalizedShotGraphs,
    timeline: {
      currentSeconds,
      totalSeconds,
    },
  };
}

export function switchEpisodeWorkspaceContentShot(
  content: EpisodeWorkspaceContent,
  nextShotId: string,
  models: ModelDefinition[],
  stageConfig?: StageConfigMap,
): EpisodeWorkspaceContent {
  const persisted = syncEpisodeWorkspaceContent(content, models, stageConfig, {
    topLevelIsAuthoritative: true,
  });
  const nextStrip = selectEpisodeShotSlot(persisted.shotStrip, nextShotId);
  const nextSlot = nextStrip.slots.find((slot) => slot.id === nextShotId);

  return syncEpisodeWorkspaceContent(
    {
      ...persisted,
      shotStrip: nextStrip,
    },
    models,
    stageConfig,
    {
      selectedShotId: nextShotId,
      currentSeconds: nextSlot?.startSeconds || 0,
      topLevelIsAuthoritative: false,
    },
  );
}
