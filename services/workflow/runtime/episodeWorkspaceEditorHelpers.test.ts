import { describe, expect, it } from 'vitest';
import type { EpisodeWorkspaceContent, ModelDefinition } from '../../../types/workflowApp';
import {
  addEpisodeWorkspaceNode,
  seekEpisodeWorkspaceTimelineDraft,
  selectEpisodeWorkspaceShotDraft,
} from './episodeWorkspaceEditorHelpers';

const models: ModelDefinition[] = [
  {
    familyId: 'text-family',
    familyName: 'Text Family',
    deploymentId: 'text-model@vendor',
    providerModelId: 'text-model',
    name: 'Text Model',
    vendor: 'vendor',
    modality: 'text',
    capabilities: ['canvas_text_generate'],
    inputSchema: {},
    configSchema: {},
    adapter: 'text-adapter',
  },
];

function createContent(): EpisodeWorkspaceContent {
  return {
    nodes: [
      {
        id: 'text-1',
        type: 'text',
        title: '鎻愮ず璇?',
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        content: 'shot one graph',
      },
    ],
    connections: [],
    shotStrip: {
      selectedShotId: 'shot-1',
      slots: [
        {
          id: 'shot-1',
          source: 'storyboard',
          title: '闀滃ご1',
          summary: 'shot 1',
          promptText: 'shot 1 prompt',
          order: 0,
          durationLabel: '00:10',
          clip: null,
        },
        {
          id: 'shot-2',
          source: 'storyboard',
          title: '闀滃ご2',
          summary: 'shot 2',
          promptText: 'shot 2 prompt',
          order: 1,
          durationLabel: '00:05',
          clip: null,
        },
      ],
    },
  };
}

describe('episodeWorkspaceEditorHelpers', () => {
  it('adds a custom node at the requested canvas position', () => {
    const result = addEpisodeWorkspaceNode({
      content: createContent(),
      type: 'audio',
      episodeId: 'episode-1',
      models,
      position: { x: 512.4, y: 221.6 },
    });

    expect(result.node.type).toBe('audio');
    expect(result.node.x).toBe(512);
    expect(result.node.y).toBe(222);
    expect(result.content.nodes[result.content.nodes.length - 1]?.id).toBe(result.node.id);
    expect(result.selectedNodeId).toBe(result.node.id);
  });

  it('switches shots while keeping a valid selected node fallback', () => {
    const result = selectEpisodeWorkspaceShotDraft({
      content: createContent(),
      slotId: 'shot-2',
      models,
      selectedNodeId: 'missing-node',
    });

    expect(result.content.shotStrip?.selectedShotId).toBe('shot-2');
    expect(result.content.timeline?.currentSeconds).toBe(10);
    expect(result.selectedNodeId).toBe('text-1');
  });

  it('seeks timeline time and syncs the active shot when requested', () => {
    const result = seekEpisodeWorkspaceTimelineDraft({
      content: createContent(),
      seconds: 11,
      syncShot: true,
      models,
      selectedNodeId: 'missing-node',
    });

    expect(result.content.shotStrip?.selectedShotId).toBe('shot-2');
    expect(result.content.timeline).toEqual({
      currentSeconds: 11,
      totalSeconds: 15,
    });
    expect(result.selectedNodeId).toBe('text-1');
  });
});
