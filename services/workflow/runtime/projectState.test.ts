import { describe, expect, it } from 'vitest';
import {
  appendWorkflowAsset,
  appendWorkflowAssetVersion,
  bindAssetToEpisode,
  createEpisodeInstance,
  createEpisodeInstances,
  createWorkflowInstance,
  getEpisodeBindings,
  getEpisodeContinuityStates,
  getSeriesAssetCoverage,
  normalizeWorkflowProjectState,
  unbindAssetFromEpisode,
  updateSeriesWorkflowSettings,
  upsertContinuityState,
  withWorkflowProjectState,
} from './projectState';

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
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };

    const episodeOne = createEpisodeInstance(baseState, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...baseState,
      instances: [episodeOne, ...baseState.instances],
    }, seriesInstance.id);

    expect(episodeOne.metadata?.episodeNumber).toBe(1);
    expect(episodeTwo.metadata?.episodeNumber).toBe(2);
  });

  it('bootstraps episode defaults from series settings', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series', {
      metadata: {
        plannedEpisodeCount: 80,
        preferredBindingMode: 'pinned',
      },
    });
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };

    const episode = createEpisodeInstance(state, seriesInstance.id);

    expect(episode.metadata?.preferredBindingMode).toBe('pinned');
    expect(episode.stageStates['episode-assets'].formData.defaultBindingMode).toBe('pinned');
    expect(episode.stageStates.storyboard.formData.templateId).toBe('manju-standard-storyboard');
  });

  it('creates episodes in batch with sequential numbers', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };

    const episodes = createEpisodeInstances(state, seriesInstance.id, 3);

    expect(episodes).toHaveLength(3);
    expect(episodes.map(episode => episode.metadata?.episodeNumber)).toEqual([1, 2, 3]);
  });

  it('updates series settings and syncs episode defaults', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };
    const episodeInstance = createEpisodeInstance(state, seriesInstance.id);

    const nextState = updateSeriesWorkflowSettings({
      ...state,
      instances: [episodeInstance, seriesInstance],
    }, seriesInstance.id, {
      plannedEpisodeCount: 96,
      preferredBindingMode: 'pinned',
    });

    const updatedSeries = nextState.instances.find(instance => instance.id === seriesInstance.id);
    const updatedEpisode = nextState.instances.find(instance => instance.id === episodeInstance.id);

    expect(updatedSeries?.metadata?.plannedEpisodeCount).toBe(96);
    expect(updatedSeries?.metadata?.preferredBindingMode).toBe('pinned');
    expect(updatedEpisode?.metadata?.preferredBindingMode).toBe('pinned');
    expect(updatedEpisode?.stageStates['episode-assets'].formData.defaultBindingMode).toBe('pinned');
  });

  it('reads and writes workflow project state from settings', () => {
    const workflowState = normalizeWorkflowProjectState(null);
    const settings = withWorkflowProjectState({ editorMode: 'pipeline' }, workflowState);

    expect(settings.workflowState).toEqual(workflowState);
  });

  it('adds reusable assets and binds them to an episode', () => {
    const seriesInstance = createWorkflowInstance('manju-series', '测试漫剧');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };
    const episodeInstance = createEpisodeInstance(state, seriesInstance.id);

    const withAsset = appendWorkflowAsset({
      ...state,
      instances: [episodeInstance, seriesInstance],
      activeEpisodeId: episodeInstance.id,
    }, 'project-1', 'character', '女主', ['主角']);

    const boundState = bindAssetToEpisode(withAsset, episodeInstance.id, withAsset.assets[0].id);

    expect(boundState.assets).toHaveLength(1);
    expect(boundState.assetBindings).toHaveLength(1);
    expect(boundState.instances[0].stageStates['episode-assets'].outputs.boundAssetIds).toEqual([withAsset.assets[0].id]);

    const unboundState = unbindAssetFromEpisode(boundState, boundState.assetBindings[0].id);
    expect(unboundState.assetBindings).toHaveLength(0);
  });

  it('builds series asset coverage across episodes', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series', {
      metadata: { plannedEpisodeCount: 4 },
    });
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };
    const episodeOne = createEpisodeInstance(state, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...state,
      instances: [episodeOne, seriesInstance],
    }, seriesInstance.id);

    const withAssets = appendWorkflowAsset({
      ...state,
      instances: [episodeTwo, episodeOne, seriesInstance],
      activeEpisodeId: episodeOne.id,
    }, 'project-1', 'character', 'hero', ['lead']);
    const withMoreAssets = appendWorkflowAsset(withAssets, 'project-1', 'scene', 'school', ['main']);

    const withHeroEpisodeOne = bindAssetToEpisode(withMoreAssets, episodeOne.id, withMoreAssets.assets.find(asset => asset.name === 'hero')!.id, 'follow_latest');
    const withHeroEpisodeTwo = bindAssetToEpisode(withHeroEpisodeOne, episodeTwo.id, withHeroEpisodeOne.assets.find(asset => asset.name === 'hero')!.id, 'pinned');
    const coverage = getSeriesAssetCoverage(withHeroEpisodeTwo, seriesInstance.id);

    const heroCoverage = coverage.find(entry => entry.asset.name === 'hero');
    const sceneCoverage = coverage.find(entry => entry.asset.name === 'school');

    expect(heroCoverage?.boundEpisodeNumbers).toEqual([1, 2]);
    expect(heroCoverage?.boundCount).toBe(2);
    expect(heroCoverage?.missingCount).toBe(2);
    expect(heroCoverage?.episodes.map(item => item.mode)).toEqual(['follow_latest', 'pinned']);
    expect(sceneCoverage?.boundCount).toBe(0);
    expect(sceneCoverage?.coverageRate).toBe(0);
  });

  it('updates follow-latest bindings when a new asset version is created', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };
    const episodeInstance = createEpisodeInstance(state, seriesInstance.id);

    const withAsset = appendWorkflowAsset({
      ...state,
      instances: [episodeInstance, seriesInstance],
      activeEpisodeId: episodeInstance.id,
    }, 'project-1', 'character', 'hero', ['lead']);

    const boundState = bindAssetToEpisode(withAsset, episodeInstance.id, withAsset.assets[0].id, 'follow_latest');
    const nextState = appendWorkflowAssetVersion(boundState, withAsset.assets[0].id, 'winter outfit');
    const updatedBinding = getEpisodeBindings(nextState, episodeInstance.id)[0];

    expect(updatedBinding.versionId).toBe(nextState.assets[0].currentVersionId);
    expect(nextState.assetVersions.filter(version => version.assetId === withAsset.assets[0].id)).toHaveLength(2);
  });

  it('keeps pinned bindings on the original version when assets update', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };
    const episodeInstance = createEpisodeInstance(state, seriesInstance.id);

    const withAsset = appendWorkflowAsset({
      ...state,
      instances: [episodeInstance, seriesInstance],
      activeEpisodeId: episodeInstance.id,
    }, 'project-1', 'character', 'hero', ['lead']);

    const boundState = bindAssetToEpisode(withAsset, episodeInstance.id, withAsset.assets[0].id, 'pinned');
    const originalVersionId = boundState.assetBindings[0].versionId;
    const nextState = appendWorkflowAssetVersion(boundState, withAsset.assets[0].id, 'battle suit');

    expect(nextState.assetBindings[0].versionId).toBe(originalVersionId);
    expect(nextState.assets[0].currentVersionId).not.toBe(originalVersionId);
  });

  it('upserts continuity notes for an episode asset', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };
    const episodeInstance = createEpisodeInstance(state, seriesInstance.id);

    const withAsset = appendWorkflowAsset({
      ...state,
      instances: [episodeInstance, seriesInstance],
      activeEpisodeId: episodeInstance.id,
    }, 'project-1', 'character', 'hero', ['lead']);

    const initialState = upsertContinuityState(
      withAsset,
      episodeInstance.id,
      'character',
      withAsset.assets[0].id,
      { notes: 'first look' },
    );
    const updatedState = upsertContinuityState(
      initialState,
      episodeInstance.id,
      'character',
      withAsset.assets[0].id,
      { notes: 'battle damage', mood: 'tense' },
    );

    const continuity = getEpisodeContinuityStates(updatedState, episodeInstance.id)[0];

    expect(continuity.state).toEqual({
      notes: 'battle damage',
      mood: 'tense',
    });
    expect(getEpisodeContinuityStates(updatedState, episodeInstance.id)).toHaveLength(1);
  });
});
