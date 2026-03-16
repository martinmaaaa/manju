import { describe, expect, it } from 'vitest';
import { NodeStatus, NodeType } from '../types';
import {
  buildPipelineGraph,
  DEFAULT_PROJECT_SETTINGS,
  getPipelineStageStatuses,
  normalizeProjectSettings,
  resolveProjectEntryView,
} from './workflowTemplates';

describe('workflowTemplates', () => {
  it('builds a connected default pipeline graph', () => {
    const graph = buildPipelineGraph(DEFAULT_PROJECT_SETTINGS.pipelineTemplateId);

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.connections.length).toBeGreaterThan(0);
    expect(graph.groups).toHaveLength(5);

    const jimengNode = graph.nodes.find(node => node.type === NodeType.JIMENG_VIDEO_GENERATOR);
    expect(jimengNode).toBeTruthy();
    expect(jimengNode?.inputs).toHaveLength(2);
  });

  it('builds unique ids across repeated graph creation', () => {
    const firstGraph = buildPipelineGraph(DEFAULT_PROJECT_SETTINGS.pipelineTemplateId);
    const secondGraph = buildPipelineGraph(DEFAULT_PROJECT_SETTINGS.pipelineTemplateId);
    const firstIds = new Set([
      ...firstGraph.nodes.map(node => node.id),
      ...firstGraph.groups.map(group => group.id),
    ]);

    expect(secondGraph.nodes.some(node => firstIds.has(node.id))).toBe(false);
    expect(secondGraph.groups.some(group => firstIds.has(group.id))).toBe(false);
  });

  it('marks stages completed from node outputs', () => {
    const statuses = getPipelineStageStatuses([
      {
        id: 'script-node',
        type: NodeType.SCRIPT_PLANNER,
        x: 0,
        y: 0,
        title: '剧本大纲',
        status: NodeStatus.SUCCESS,
        data: { pipelineStage: 'script', scriptOutline: '大纲内容' },
        inputs: [],
      },
      {
        id: 'prompt-node',
        type: NodeType.PROMPT_INPUT,
        x: 0,
        y: 0,
        title: '视频提示词',
        status: NodeStatus.SUCCESS,
        data: { pipelineStage: 'prompt', pipelineRole: 'video-prompt', prompt: '镜头运动、人物动作与光效描述' },
        inputs: [],
      },
      {
        id: 'video-node',
        type: NodeType.JIMENG_VIDEO_GENERATOR,
        x: 0,
        y: 0,
        title: '即梦视频',
        status: NodeStatus.SUCCESS,
        data: { pipelineStage: 'video', videoUrl: 'https://example.com/video.mp4' },
        inputs: [],
      },
    ]);

    expect(statuses.find(stage => stage.id === 'script')?.state).toBe('completed');
    expect(statuses.find(stage => stage.id === 'prompt')?.state).toBe('completed');
    expect(statuses.find(stage => stage.id === 'video')?.state).toBe('completed');
    expect(statuses.find(stage => stage.id === 'character')?.state).toBe('not_started');
  });

  it('normalizes settings and preserves old canvas projects', () => {
    expect(normalizeProjectSettings(undefined)).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(resolveProjectEntryView(undefined, true)).toBe('canvas');
    expect(resolveProjectEntryView(undefined, false)).toBe('pipeline');
  });
});
