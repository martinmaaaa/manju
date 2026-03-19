import { describe, expect, it } from 'vitest';
import type {
  CanonicalAsset,
  Episode,
  ModelDefinition,
  StageConfigMap,
} from '../../../types/workflowApp';
import {
  getEpisodeAssetNodeId,
  getEpisodePrimaryNodeId,
  harmonizeEpisodeWorkbenchContent,
  layoutEpisodeWorkbenchContent,
} from './episodeWorkbenchHelpers';

const models: ModelDefinition[] = [
  {
    familyId: 'text-family',
    familyName: 'Text Family',
    deploymentId: 'text-model@vendor',
    providerModelId: 'text-model',
    name: 'Text Model',
    vendor: 'vendor',
    modality: 'text',
    capabilities: ['video_prompt_generate'],
    inputSchema: {
      contextTexts: { accepts: ['text'], maxItems: 4, showInNode: false },
    },
    configSchema: {
      temperature: { type: 'number', default: 0.4 },
    },
    adapter: 'text-adapter',
  },
  {
    familyId: 'video-family',
    familyName: 'Video Family',
    deploymentId: 'video-model@vendor',
    providerModelId: 'video-model',
    name: 'Video Model',
    vendor: 'vendor',
    modality: 'video',
    capabilities: ['video_generate'],
    inputSchema: {
      promptText: { accepts: ['text'], maxItems: 1, showInNode: false },
      referenceAssets: { accepts: ['image', 'video', 'audio'], multiple: true, maxItems: 12, showInNode: true },
    },
    configSchema: {
      durationSeconds: { type: 'number', default: 5 },
    },
    generationModes: [
      { id: 'all_references', label: '全能参考', summaryLabel: '多参', enabledInputKeys: ['promptText', 'referenceAssets'] },
    ],
    defaultGenerationModeId: 'all_references',
    adapter: 'video-adapter',
  },
];

const stageConfig: StageConfigMap = {
  video_prompt_generate: {
    capabilityId: 'video_prompt_generate',
    modelId: 'text-model@vendor',
    modelParams: {
      temperature: 0.8,
    },
    reviewPolicyIds: [],
    promptRecipeId: 'seedance-cinematic-v1',
  },
  video_generate: {
    capabilityId: 'video_generate',
    modelId: 'video-model@vendor',
    modelParams: {
      durationSeconds: 8,
    },
    reviewPolicyIds: [],
  },
};

const episode: Episode = {
  id: 'ep-1',
  projectId: 'project-1',
  episodeNumber: 1,
  title: '第一集',
  synopsis: '女主在红绸宫廷中第一次遇见对手。',
  sourceText: '镜头一：雨夜宫门。镜头二：长廊对视。',
  status: 'draft',
  metadata: {},
  createdAt: '2026-03-18T00:00:00.000Z',
  updatedAt: '2026-03-18T00:00:00.000Z',
};

const lockedAssets: CanonicalAsset[] = [
  {
    id: 'asset-1',
    projectId: 'project-1',
    type: 'character',
    name: '太子',
    description: '冷峻、玄色服饰',
    isLocked: true,
    lockedBy: 'user-1',
    lockedAt: '2026-03-18T00:00:00.000Z',
    currentVersionId: 'ver-1',
    metadata: {},
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
    versions: [
      {
        id: 'ver-1',
        assetId: 'asset-1',
        projectId: 'project-1',
        versionNumber: 1,
        promptText: '黑金长袍、冷调肖像',
        previewUrl: 'https://cdn.example.com/assets/taizi.png',
        sourcePayload: {},
        metadata: {},
        createdBy: 'user-1',
        createdAt: '2026-03-18T00:00:00.000Z',
      },
    ],
  },
];

describe('episodeWorkbenchHelpers', () => {
  it('restores the managed workbench chain and syncs locked asset nodes', () => {
    const content = harmonizeEpisodeWorkbenchContent({
      content: {
        nodes: [
          {
            id: 'custom-note',
            type: 'text',
            title: '补充说明',
            x: 1600,
            y: 80,
            width: 320,
            height: 200,
            content: '慢镜头强调角色反应',
            modelId: 'text-model@vendor',
            prompt: '',
            params: {
              temperature: 0.4,
            },
            output: {},
            runStatus: 'idle',
            error: null,
            lastRunAt: null,
            metadata: {},
          },
          {
            id: getEpisodeAssetNodeId('old-asset'),
            type: 'image',
            title: '旧资产',
            x: 0,
            y: 0,
            width: 200,
            height: 120,
            content: '',
            prompt: '',
            params: {},
            output: {},
            runStatus: 'idle',
            error: null,
            lastRunAt: null,
            metadata: {
              lockedAssetId: 'old-asset',
            },
          },
        ],
        connections: [],
      },
      episode,
      lockedAssets,
      models,
      stageConfig,
      promptRecipeId: 'seedance-cinematic-v1',
    });

    expect(content.nodes.map((node) => node.id)).toEqual([
      getEpisodePrimaryNodeId('script', episode.id),
      getEpisodePrimaryNodeId('storyboard', episode.id),
      getEpisodePrimaryNodeId('prompt', episode.id),
      getEpisodePrimaryNodeId('visual', episode.id),
      getEpisodePrimaryNodeId('video', episode.id),
      'custom-note',
      getEpisodeAssetNodeId('asset-1'),
    ]);
    expect(content.nodes.find((node) => node.id === getEpisodePrimaryNodeId('prompt', episode.id))?.content).toContain('必须使用的锁定资产：太子');
    expect(content.nodes.find((node) => node.id === getEpisodeAssetNodeId('asset-1'))?.content).toBe('https://cdn.example.com/assets/taizi.png');
    expect(content.nodes.find((node) => node.id === getEpisodeAssetNodeId('asset-1'))?.metadata).toMatchObject({
      lockedAssetId: 'asset-1',
      lockedAssetName: expect.any(String),
      assetType: 'character',
      sourceVersionId: 'ver-1',
      sourceVersionNumber: 1,
    });
    expect(content.connections.map((connection) => `${connection.from}->${connection.to}`)).toEqual([
      `${getEpisodePrimaryNodeId('script', episode.id)}->${getEpisodePrimaryNodeId('storyboard', episode.id)}`,
      `${getEpisodePrimaryNodeId('storyboard', episode.id)}->${getEpisodePrimaryNodeId('prompt', episode.id)}`,
      `${getEpisodePrimaryNodeId('prompt', episode.id)}->${getEpisodePrimaryNodeId('video', episode.id)}`,
      `${getEpisodePrimaryNodeId('visual', episode.id)}->${getEpisodePrimaryNodeId('video', episode.id)}`,
    ]);
    expect(content.connections.find((connection) => connection.from === getEpisodePrimaryNodeId('visual', episode.id))?.inputKey).toBe('referenceAssets');
  });

  it('can force a stable workbench layout for managed and custom nodes', () => {
    const baseContent = harmonizeEpisodeWorkbenchContent({
      content: {
        nodes: [
          {
            id: getEpisodePrimaryNodeId('video', episode.id),
            type: 'video',
            title: '视频生成',
            x: 20,
            y: 20,
            width: 220,
            height: 180,
            content: '',
            modelId: 'video-model@vendor',
            prompt: '',
            params: {
              durationSeconds: 8,
            },
            output: {},
            runStatus: 'idle',
            error: null,
            lastRunAt: null,
            metadata: {},
          },
          {
            id: 'custom-note',
            type: 'text',
            title: '补充说明',
            x: 20,
            y: 20,
            width: 320,
            height: 200,
            content: '慢镜头强调角色反应',
            modelId: 'text-model@vendor',
            prompt: '',
            params: {
              temperature: 0.4,
            },
            output: {},
            runStatus: 'idle',
            error: null,
            lastRunAt: null,
            metadata: {},
          },
        ],
        connections: [],
      },
      episode,
      lockedAssets,
      models,
      stageConfig,
      forceLayout: true,
    });

    const relaid = layoutEpisodeWorkbenchContent(baseContent, episode.id, lockedAssets);
    expect(relaid.nodes.find((node) => node.id === getEpisodePrimaryNodeId('video', episode.id))).toMatchObject({
      x: 880,
      y: 380,
      width: 300,
      height: 220,
    });
    expect(relaid.nodes.find((node) => node.id === getEpisodeAssetNodeId('asset-1'))).toMatchObject({
      x: 60,
      y: 650,
      width: 220,
      height: 180,
    });
    expect(relaid.nodes.find((node) => node.id === 'custom-note')).toMatchObject({
      x: 1240,
      y: 80,
    });
  });
});
