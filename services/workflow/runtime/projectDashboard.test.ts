import { describe, expect, it } from 'vitest';
import type { WorkflowProjectState } from '../domain/types';
import { createEpisodeInstance, createWorkflowInstance } from './projectState';
import { buildWorkflowProjectDashboardSummary } from './projectDashboard';

function createBaseState(seriesInstance = createWorkflowInstance('manju-series', '测试系列')): WorkflowProjectState {
  return {
    version: 1,
    instances: [seriesInstance],
    activeSeriesId: seriesInstance.id,
    activeEpisodeId: null,
    assets: [],
    assetVersions: [],
    assetBindings: [],
    continuityStates: [],
  };
}

describe('workflow project dashboard summary', () => {
  it('marks empty projects before any workflow exists', () => {
    const summary = buildWorkflowProjectDashboardSummary({
      id: 'proj-empty',
      title: 'Empty',
      workflow_state: {
        version: 1,
        instances: [],
        activeSeriesId: null,
        activeEpisodeId: null,
        assets: [],
        assetVersions: [],
        assetBindings: [],
        continuityStates: [],
      },
    });

    expect(summary.phase).toBe('empty');
    expect(summary.totals.workflowCount).toBe(0);
  });

  it('marks asset setup when a series exists without reusable assets', () => {
    const seriesInstance = createWorkflowInstance('manju-series', '测试系列');
    const summary = buildWorkflowProjectDashboardSummary({
      id: 'proj-series',
      title: 'Series',
      workflow_state: createBaseState(seriesInstance),
    });

    expect(summary.phase).toBe('asset_setup');
    expect(summary.totals.seriesCount).toBe(1);
    expect(summary.activeSeriesTitle).toBe('测试系列');
  });

  it('marks episode planning when assets exist but planned episodes are still missing', () => {
    const seriesInstance = createWorkflowInstance('manju-series', '测试系列', {
      metadata: {
        plannedEpisodeCount: 3,
      },
    });
    const summary = buildWorkflowProjectDashboardSummary({
      id: 'proj-plan',
      title: 'Plan',
      workflow_state: {
        ...createBaseState(seriesInstance),
        assets: [
          {
            id: 'asset-1',
            projectId: 'proj-plan',
            type: 'character',
            name: '主角',
            tags: ['lead'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    expect(summary.phase).toBe('episode_planning');
    expect(summary.totals.plannedEpisodeCount).toBe(3);
    expect(summary.totals.episodeCount).toBe(0);
  });

  it('marks in production until episode videos are completed', () => {
    const seriesInstance = createWorkflowInstance('manju-series', '测试系列', {
      metadata: {
        plannedEpisodeCount: 1,
      },
    });
    const state = createBaseState(seriesInstance);
    const episode = createEpisodeInstance({
      ...state,
      assets: [
        {
          id: 'asset-1',
          projectId: 'proj-prod',
          type: 'character',
          name: '主角',
          tags: ['lead'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }, seriesInstance.id);
    const summary = buildWorkflowProjectDashboardSummary({
      id: 'proj-prod',
      title: 'Prod',
      workflow_state: {
        ...state,
        instances: [episode, seriesInstance],
        assets: [
          {
            id: 'asset-1',
            projectId: 'proj-prod',
            type: 'character',
            name: '主角',
            tags: ['lead'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    expect(summary.phase).toBe('in_production');
    expect(summary.totals.episodeCount).toBe(1);
    expect(summary.totals.videoCompletedEpisodeCount).toBe(0);
  });

  it('marks ready for canvas once all created episodes reach video completion', () => {
    const seriesInstance = createWorkflowInstance('manju-series', '测试系列', {
      metadata: {
        plannedEpisodeCount: 1,
      },
    });
    const state = createBaseState(seriesInstance);
    const episode = createEpisodeInstance({
      ...state,
      assets: [
        {
          id: 'asset-1',
          projectId: 'proj-ready',
          type: 'character',
          name: '主角',
          tags: ['lead'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }, seriesInstance.id);
    episode.stageStates['episode-script'].status = 'completed';
    episode.stageStates['episode-assets'].status = 'completed';
    episode.stageStates.storyboard.status = 'completed';
    episode.stageStates.prompt.status = 'completed';
    episode.stageStates.video.status = 'completed';

    const summary = buildWorkflowProjectDashboardSummary({
      id: 'proj-ready',
      title: 'Ready',
      workflow_state: {
        ...state,
        instances: [episode, seriesInstance],
        assets: [
          {
            id: 'asset-1',
            projectId: 'proj-ready',
            type: 'character',
            name: '主角',
            tags: ['lead'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });

    expect(summary.phase).toBe('ready_for_canvas');
    expect(summary.totals.videoCompletedEpisodeCount).toBe(1);
    expect(summary.activeEpisodeTitle).toBe(episode.title);
  });
});
