import { describe, expect, it } from 'vitest';
import type { EpisodeWorkspaceContent } from '../../../types/workflowApp';
import {
  buildEpisodeShotStrip,
  normalizeEpisodeShotStrip,
} from './episodeShotStripHelpers';
import {
  switchEpisodeWorkspaceContentShot,
  syncEpisodeWorkspaceContent,
} from './episodeWorkspaceGraphHelpers';

const baseStrip = normalizeEpisodeShotStrip({
  selectedShotId: 'shot-1',
  slots: [
    {
      id: 'shot-1',
      source: 'storyboard',
      title: '镜头1',
      summary: '镜头1摘要',
      promptText: '镜头1提示词',
      order: 0,
      durationLabel: '00:10',
      clip: null,
    },
    {
      id: 'shot-2',
      source: 'storyboard',
      title: '镜头2',
      summary: '镜头2摘要',
      promptText: '镜头2提示词',
      order: 1,
      durationLabel: '00:05',
      clip: null,
    },
  ],
});

describe('episodeWorkspaceGraphHelpers', () => {
  it('migrates a legacy top-level graph into the selected shot graph and timeline', () => {
    const content: EpisodeWorkspaceContent = {
      nodes: [
        {
          id: 'text-1',
          type: 'text',
          title: '提示词',
          x: 10,
          y: 10,
          width: 200,
          height: 120,
          content: 'legacy graph',
        },
      ],
      connections: [],
      shotStrip: baseStrip,
    };

    const synced = syncEpisodeWorkspaceContent(content, []);

    expect(synced.shotGraphs?.['shot-1']?.nodes[0]?.content).toBe('legacy graph');
    expect(synced.timeline).toEqual({
      currentSeconds: 0,
      totalSeconds: 15,
    });
    expect(synced.shotStrip?.slots.map((slot) => [slot.id, slot.startSeconds, slot.endSeconds])).toEqual([
      ['shot-1', 0, 10],
      ['shot-2', 10, 15],
    ]);
  });

  it('switches shots by persisting the current graph and moving the timeline cursor', () => {
    const content: EpisodeWorkspaceContent = {
      nodes: [
        {
          id: 'text-1',
          type: 'text',
          title: '提示词',
          x: 10,
          y: 10,
          width: 200,
          height: 120,
          content: 'shot one graph',
        },
      ],
      connections: [],
      shotStrip: baseStrip,
    };

    const switched = switchEpisodeWorkspaceContentShot(content, 'shot-2', []);

    expect(switched.shotGraphs?.['shot-1']?.nodes[0]?.content).toBe('shot one graph');
    expect(switched.shotStrip?.selectedShotId).toBe('shot-2');
    expect(switched.timeline?.currentSeconds).toBe(10);
    expect(switched.shotGraphs?.['shot-2']).toBeDefined();
    expect(switched.nodes[0]?.content).toBe('shot one graph');
  });
});
