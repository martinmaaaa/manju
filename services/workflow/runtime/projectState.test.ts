import { describe, expect, it } from 'vitest';
import {
  appendWorkflowAsset,
  appendWorkflowAssetAndApplySuggestedTemplates,
  appendWorkflowAssetVersion,
  appendEpisodeInstanceToSeries,
  appendEpisodeInstancesToSeries,
  bindAssetToEpisode,
  createInitialManjuProjectWorkflowState,
  createEpisodeInstance,
  createEpisodeInstances,
  createWorkflowInstance,
  getEpisodeBindings,
  getEpisodeContinuityStates,
  getWorkflowProjectEntityCollections,
  getSeriesAssetCoverage,
  getSeriesWorkflowOverview,
  getSuggestedAssetBatchTemplateTargetsForAsset,
  getSuggestedSeriesAssetBatchTemplates,
  hydrateWorkflowProjectState,
  normalizeWorkflowProjectState,
  removeSeriesAssetBatchTemplate,
  syncAssetBindingsForEpisodes,
  syncMultipleAssetBindingsForEpisodes,
  unbindAssetFromEpisode,
  updateSeriesWorkflowSettings,
  upsertSeriesAssetBatchTemplate,
  upsertSeriesAssetBatchTemplates,
  upsertContinuityState,
  withWorkflowProjectState,
} from './projectState';

describe('workflow project state runtime', () => {
  it('creates an initial manju project workflow state with one focused series', () => {
    const state = createInitialManjuProjectWorkflowState('测试项目');

    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].templateId).toBe('manju-series');
    expect(state.activeSeriesId).toBe(state.instances[0].id);
    expect(state.instances[0].title).toBe('测试项目 · 漫剧工作流');
  });

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

  it('hydrates workflow state from entity collections', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const baseState = {
      version: 1 as const,
      instances: [],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: null,
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };

    const hydratedState = hydrateWorkflowProjectState(baseState, {
      instances: [seriesInstance],
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    });

    expect(hydratedState.instances).toEqual([seriesInstance]);
    expect(hydratedState.activeSeriesId).toBe(seriesInstance.id);
  });

  it('clears stale active ids when hydrated entity collections no longer include them', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
    const state = {
      version: 1 as const,
      instances: [seriesInstance],
      activeSeriesId: seriesInstance.id,
      activeEpisodeId: 'episode-missing',
      assets: [],
      assetVersions: [],
      assetBindings: [],
      continuityStates: [],
    };

    const hydratedState = hydrateWorkflowProjectState(state, {
      ...getWorkflowProjectEntityCollections(state),
      instances: [],
    });

    expect(hydratedState.activeSeriesId).toBeNull();
    expect(hydratedState.activeEpisodeId).toBeNull();
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

  it('syncs asset bindings across a scoped set of episodes', () => {
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
    const episodeOne = createEpisodeInstance(state, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...state,
      instances: [episodeOne, seriesInstance],
    }, seriesInstance.id);

    const withAsset = appendWorkflowAsset({
      ...state,
      instances: [episodeTwo, episodeOne, seriesInstance],
      activeEpisodeId: episodeOne.id,
    }, 'project-1', 'character', 'hero', ['lead']);

    const syncedState = syncAssetBindingsForEpisodes(
      withAsset,
      withAsset.assets[0].id,
      [episodeOne.id, episodeTwo.id],
      [episodeOne.id, episodeTwo.id],
      'pinned',
    );

    expect(getEpisodeBindings(syncedState, episodeOne.id)[0].mode).toBe('pinned');
    expect(getEpisodeBindings(syncedState, episodeTwo.id)[0].mode).toBe('pinned');

    const partiallyUnsyncedState = syncAssetBindingsForEpisodes(
      syncedState,
      withAsset.assets[0].id,
      [episodeOne.id, episodeTwo.id],
      [episodeTwo.id],
      'pinned',
    );

    expect(getEpisodeBindings(partiallyUnsyncedState, episodeOne.id)).toHaveLength(0);
    expect(getEpisodeBindings(partiallyUnsyncedState, episodeTwo.id)).toHaveLength(1);
  });

  it('summarizes the next recommended action for a series workflow', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
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

    expect(getSeriesWorkflowOverview(baseState, seriesInstance.id)?.nextAction.key).toBe('create_episodes');

    const withAsset = appendWorkflowAsset(baseState, 'project-1', 'character', 'hero', ['主角']);
    expect(getSeriesWorkflowOverview(withAsset, seriesInstance.id)?.nextAction.key).toBe('create_episodes');

    const withTemplate = upsertSeriesAssetBatchTemplate(withAsset, seriesInstance.id, {
      name: '主角组',
      assetIds: [withAsset.assets[0].id],
      autoApplyToNewEpisodes: true,
    });
    expect(getSeriesWorkflowOverview(withTemplate, seriesInstance.id)?.nextAction.key).toBe('create_episodes');
  });

  it('guides the series toward the first incomplete episode stage', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
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
    const withAsset = appendWorkflowAsset(baseState, 'project-1', 'character', 'hero', ['主角']);
    const withTemplate = upsertSeriesAssetBatchTemplate(withAsset, seriesInstance.id, {
      name: '主角组',
      assetIds: [withAsset.assets[0].id],
      autoApplyToNewEpisodes: true,
    });
    const appended = appendEpisodeInstanceToSeries(withTemplate, seriesInstance.id);
    const episode = appended.episode!;

    expect(getSeriesWorkflowOverview(appended.state, seriesInstance.id)?.nextAction.key).toBe('open_episode_script');

    const scriptCompletedState = {
      ...appended.state,
      instances: appended.state.instances.map(instance => instance.id === episode.id
        ? {
            ...instance,
            stageStates: {
              ...instance.stageStates,
              'episode-script': {
                ...instance.stageStates['episode-script'],
                status: 'completed' as const,
              },
            },
          }
        : instance),
    };

    expect(getSeriesWorkflowOverview(scriptCompletedState, seriesInstance.id)?.nextAction.key).toBe('materialize_series');
  });

  it('moves to the next phase after scripts are complete even when assets are still empty', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series');
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
    const appended = appendEpisodeInstanceToSeries(baseState, seriesInstance.id);
    const episode = appended.episode!;

    const scriptCompletedState = {
      ...appended.state,
      instances: appended.state.instances.map(instance => instance.id === episode.id
        ? {
            ...instance,
            stageStates: {
              ...instance.stageStates,
              'episode-script': {
                ...instance.stageStates['episode-script'],
                status: 'completed' as const,
              },
            },
          }
        : instance),
    };

    expect(getSeriesWorkflowOverview(scriptCompletedState, seriesInstance.id)?.nextAction.key).toBe('materialize_series');
  });

  it('keeps asset bindings only within the selected episode range', () => {
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
    const episodeOne = createEpisodeInstance(state, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...state,
      instances: [episodeOne, seriesInstance],
    }, seriesInstance.id);
    const episodeThree = createEpisodeInstance({
      ...state,
      instances: [episodeTwo, episodeOne, seriesInstance],
    }, seriesInstance.id);

    const withAsset = appendWorkflowAsset({
      ...state,
      instances: [episodeThree, episodeTwo, episodeOne, seriesInstance],
      activeEpisodeId: episodeOne.id,
    }, 'project-1', 'character', 'hero', ['lead']);

    const fullyBoundState = syncAssetBindingsForEpisodes(
      withAsset,
      withAsset.assets[0].id,
      [episodeOne.id, episodeTwo.id, episodeThree.id],
      [episodeOne.id, episodeTwo.id, episodeThree.id],
      'follow_latest',
    );

    const keptRangeState = syncAssetBindingsForEpisodes(
      fullyBoundState,
      withAsset.assets[0].id,
      [episodeOne.id, episodeTwo.id, episodeThree.id],
      [episodeTwo.id],
      'follow_latest',
    );

    expect(getEpisodeBindings(keptRangeState, episodeOne.id)).toHaveLength(0);
    expect(getEpisodeBindings(keptRangeState, episodeTwo.id)).toHaveLength(1);
    expect(getEpisodeBindings(keptRangeState, episodeThree.id)).toHaveLength(0);
  });

  it('syncs the selected range across multiple assets in one pass', () => {
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
    const episodeOne = createEpisodeInstance(state, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...state,
      instances: [episodeOne, seriesInstance],
    }, seriesInstance.id);
    const episodeThree = createEpisodeInstance({
      ...state,
      instances: [episodeTwo, episodeOne, seriesInstance],
    }, seriesInstance.id);

    const withHero = appendWorkflowAsset({
      ...state,
      instances: [episodeThree, episodeTwo, episodeOne, seriesInstance],
      activeEpisodeId: episodeOne.id,
    }, 'project-1', 'character', 'hero', ['lead']);
    const withScene = appendWorkflowAsset(withHero, 'project-1', 'scene', 'school', ['main']);

    const syncedState = syncMultipleAssetBindingsForEpisodes(
      withScene,
      withScene.assets.map(asset => asset.id),
      [episodeOne.id, episodeTwo.id, episodeThree.id],
      [episodeTwo.id, episodeThree.id],
      'pinned',
    );

    expect(getEpisodeBindings(syncedState, episodeOne.id)).toHaveLength(0);
    expect(getEpisodeBindings(syncedState, episodeTwo.id)).toHaveLength(2);
    expect(getEpisodeBindings(syncedState, episodeThree.id)).toHaveLength(2);
    expect(getEpisodeBindings(syncedState, episodeTwo.id).every(binding => binding.mode === 'pinned')).toBe(true);
  });

  it('stores and removes series asset batch templates', () => {
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

    const withHero = appendWorkflowAsset(state, 'project-1', 'character', 'hero', ['lead']);
    const withScene = appendWorkflowAsset(withHero, 'project-1', 'scene', 'school', ['main']);

    const savedState = upsertSeriesAssetBatchTemplate(withScene, seriesInstance.id, {
      name: '主角与主场景',
      assetIds: [withScene.assets[0].id, withScene.assets[1].id, 'missing-id'],
    });

    const savedSeries = savedState.instances.find(instance => instance.id === seriesInstance.id);
    const template = savedSeries?.metadata?.assetBatchTemplates?.[0];

    expect(template?.name).toBe('主角与主场景');
    expect(template?.assetIds).toHaveLength(2);

    const removedState = removeSeriesAssetBatchTemplate(savedState, seriesInstance.id, template!.id);
    const removedSeries = removedState.instances.find(instance => instance.id === seriesInstance.id);

    expect(removedSeries?.metadata?.assetBatchTemplates).toEqual([]);
  });

  it('auto applies marked asset batch templates when creating a new episode', () => {
    const seriesInstance = createWorkflowInstance('manju-series', 'test series', {
      metadata: {
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

    const withHero = appendWorkflowAsset(state, 'project-1', 'character', 'hero', ['主角']);
    const withScene = appendWorkflowAsset(withHero, 'project-1', 'scene', 'school', ['常驻']);
    const withTemplate = upsertSeriesAssetBatchTemplate(withScene, seriesInstance.id, {
      name: '主角组',
      assetIds: [withScene.assets[0].id, withScene.assets[1].id],
      autoApplyToNewEpisodes: true,
    });

    const appended = appendEpisodeInstanceToSeries(withTemplate, seriesInstance.id);

    expect(appended.episode).not.toBeNull();
    expect(getEpisodeBindings(appended.state, appended.episode!.id)).toHaveLength(2);
    expect(getEpisodeBindings(appended.state, appended.episode!.id).every(binding => binding.mode === 'pinned')).toBe(true);
  });

  it('auto applies marked templates across batch episode creation', () => {
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

    const withHero = appendWorkflowAsset(state, 'project-1', 'character', 'hero', ['主角']);
    const withTemplate = upsertSeriesAssetBatchTemplate(withHero, seriesInstance.id, {
      name: '主角组',
      assetIds: [withHero.assets[0].id],
      autoApplyToNewEpisodes: true,
    });

    const appended = appendEpisodeInstancesToSeries(withTemplate, seriesInstance.id, 3);

    expect(appended.episodes).toHaveLength(3);
    expect(appended.episodes.every(episode => getEpisodeBindings(appended.state, episode.id).length === 1)).toBe(true);
  });

  it('updates the same named asset batch template instead of duplicating it', () => {
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

    const withHero = appendWorkflowAsset(state, 'project-1', 'character', 'hero', ['lead']);
    const withScene = appendWorkflowAsset(withHero, 'project-1', 'scene', 'school', ['main']);

    const onceSavedState = upsertSeriesAssetBatchTemplate(withScene, seriesInstance.id, {
      name: '主角组',
      assetIds: [withScene.assets[0].id],
    });
    const twiceSavedState = upsertSeriesAssetBatchTemplate(onceSavedState, seriesInstance.id, {
      name: '主角组',
      assetIds: [withScene.assets[1].id],
    });
    const savedSeries = twiceSavedState.instances.find(instance => instance.id === seriesInstance.id);

    expect(savedSeries?.metadata?.assetBatchTemplates).toHaveLength(1);
    expect(savedSeries?.metadata?.assetBatchTemplates?.[0].assetIds).toEqual([withScene.assets[1].id]);
  });

  it('suggests reusable asset batch templates from tags and coverage', () => {
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
    const episodeOne = createEpisodeInstance(state, seriesInstance.id);
    const episodeTwo = createEpisodeInstance({
      ...state,
      instances: [episodeOne, seriesInstance],
    }, seriesInstance.id);

    const withCharacterOne = appendWorkflowAsset({
      ...state,
      instances: [episodeTwo, episodeOne, seriesInstance],
      activeEpisodeId: episodeOne.id,
    }, 'project-1', 'character', 'hero', ['主角', 'lead']);
    const withCharacterTwo = appendWorkflowAsset(withCharacterOne, 'project-1', 'character', 'partner', ['主角团']);
    const withScene = appendWorkflowAsset(withCharacterTwo, 'project-1', 'scene', 'school', ['常驻', 'main']);
    const withProp = appendWorkflowAsset(withScene, 'project-1', 'prop', 'phone', ['高频', '常用']);
    const withStyle = appendWorkflowAsset(withProp, 'project-1', 'style', 'comic-style', ['统一风格']);

    const suggested = getSuggestedSeriesAssetBatchTemplates(withStyle, seriesInstance.id);

    expect(suggested.map(item => item.name)).toEqual(expect.arrayContaining(['主角组', '常驻场景', '风格统一包']));
    expect(suggested.find(item => item.name === '主角组')?.autoApplyToNewEpisodes).toBe(true);
  });

  it('saves multiple asset batch templates in one atomic pass', () => {
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

    const withHero = appendWorkflowAsset(state, 'project-1', 'character', 'hero', ['lead']);
    const withScene = appendWorkflowAsset(withHero, 'project-1', 'scene', 'school', ['main']);

    const savedState = upsertSeriesAssetBatchTemplates(withScene, seriesInstance.id, [
      { name: '主角组', assetIds: [withScene.assets[1].id] },
      { name: '常驻场景', assetIds: [withScene.assets[0].id] },
    ]);
    const savedSeries = savedState.instances.find(instance => instance.id === seriesInstance.id);

    expect(savedSeries?.metadata?.assetBatchTemplates).toHaveLength(2);
  });

  it('suggests a batch template target for a newly added asset', () => {
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

    const withAsset = appendWorkflowAsset(state, 'project-1', 'character', 'hero', ['主角', 'lead']);
    const targets = getSuggestedAssetBatchTemplateTargetsForAsset(withAsset, seriesInstance.id, withAsset.assets[0].id);

    expect(targets[0]?.name).toBe('主角组');
    expect(targets[0]?.autoApplyToNewEpisodes).toBe(true);
  });

  it('links asset recommendations to an existing same-name template', () => {
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

    const withExistingMember = appendWorkflowAsset(state, 'project-1', 'character', 'captain', ['主角']);
    const withAsset = appendWorkflowAsset(withExistingMember, 'project-1', 'character', 'hero', ['主角']);
    const existingMember = withAsset.assets.find(asset => asset.name === 'captain')!;
    const recommendedAsset = withAsset.assets.find(asset => asset.name === 'hero')!;
    const withTemplate = upsertSeriesAssetBatchTemplate(withAsset, seriesInstance.id, {
      name: '主角组',
      assetIds: [existingMember.id],
      autoApplyToNewEpisodes: true,
    });
    const targets = getSuggestedAssetBatchTemplateTargetsForAsset(withTemplate, seriesInstance.id, recommendedAsset.id);
    const savedSeries = withTemplate.instances.find(instance => instance.id === seriesInstance.id);

    expect(targets[0]?.templateId).toBe(savedSeries?.metadata?.assetBatchTemplates?.[0].id);
  });

  it('creates an asset and auto attaches suggested templates in one pass', () => {
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

    const next = appendWorkflowAssetAndApplySuggestedTemplates(
      state,
      'project-1',
      seriesInstance.id,
      'character',
      'hero',
      ['lead'],
      true,
    );
    const savedSeries = next.state.instances.find(instance => instance.id === seriesInstance.id);
    const savedTemplate = savedSeries?.metadata?.assetBatchTemplates?.[0];

    expect(next.asset.name).toBe('hero');
    expect(next.appliedTargets).toHaveLength(1);
    expect(next.suggestedTargets).toHaveLength(1);
    expect(savedTemplate?.assetIds).toEqual([next.asset.id]);
    expect(savedTemplate?.autoApplyToNewEpisodes).toBe(true);
  });

  it('returns suggested targets even when auto attach is disabled', () => {
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

    const next = appendWorkflowAssetAndApplySuggestedTemplates(
      state,
      'project-1',
      seriesInstance.id,
      'scene',
      'school',
      ['常驻'],
      false,
    );
    const savedSeries = next.state.instances.find(instance => instance.id === seriesInstance.id);

    expect(next.appliedTargets).toEqual([]);
    expect(next.suggestedTargets[0]?.name).toBe('常驻场景');
    expect(savedSeries?.metadata?.assetBatchTemplates ?? []).toHaveLength(0);
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
