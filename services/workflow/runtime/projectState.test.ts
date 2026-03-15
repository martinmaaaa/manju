import { describe, expect, it } from 'vitest';
import { createEpisodeInstance, createWorkflowInstance, normalizeWorkflowProjectState, withWorkflowProjectState } from './projectState';

describe('workflow project state runtime', () => {
  it('creates a series workflow with planned episode metadata', () => {
    const workflowInstance = createWorkflowInstance('manju-series', '测试漫剧');

    expect(workflowInstance.scope).toBe('series');
    expect(workflowInstance.metadata?.plannedEpisodeCount).toBe(80);
    expect(Object.keys(workflowInstance.stageStates)).toContain('series-bible');
  });

  it('creates episodes incrementally under a series', () => {
    const seriesInstance = createWorkflowInstance('manju-series', '测试漫剧');
    const baseState = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
    };

    const episodeOne = createEpisodeInstance(baseState, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...baseState,
      instances: [episodeOne, ...baseState.instances],
    }, seriesInstance.id);

    expect(episodeOne.metadata?.episodeNumber).toBe(1);
    expect(episodeTwo.metadata?.episodeNumber).toBe(2);
  });

  it('reads and writes workflow project state from settings', () => {
    const workflowState = normalizeWorkflowProjectState(null);
    const settings = withWorkflowProjectState({ editorMode: 'pipeline' }, workflowState);

    expect(settings.workflowState).toEqual(workflowState);
  });
});
