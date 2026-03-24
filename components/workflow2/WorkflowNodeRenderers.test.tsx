import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasConnection, CanvasNode, ModelDefinition } from '../../types/workflowApp';
import { WorkflowFlowNodeCard } from './WorkflowNodeRenderers';
import type { WorkflowFlowNodeData } from './WorkflowFlowTypes';

vi.mock('@xyflow/react', async () => {
  const actual = await import('@xyflow/react');
  return {
    ...actual,
    Handle: () => null,
  };
});

function createNode(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type' | 'title'>): CanvasNode {
  return {
    x: 80,
    y: 120,
    width: 320,
    height: 240,
    content: '',
    prompt: '',
    params: {},
    output: {},
    runStatus: 'idle',
    error: null,
    lastRunAt: null,
    metadata: {},
    ...overrides,
  };
}

function createModel(overrides: Partial<ModelDefinition> & Pick<ModelDefinition, 'deploymentId' | 'familyId' | 'familyName' | 'name' | 'modality'>): ModelDefinition {
  return {
    providerModelId: overrides.deploymentId,
    vendor: 'test-vendor',
    capabilities: [],
    inputSchema: {},
    configSchema: {},
    adapter: 'test-adapter',
    ...overrides,
  };
}

function createNodeData(params: {
  node: CanvasNode;
  allNodes?: CanvasNode[];
  connections?: CanvasConnection[];
  models?: ModelDefinition[];
  uploadingNodeId?: string | null;
  modelPickerNodeId?: string | null;
  hoveredNodeId?: string | null;
  canStoreVideoToShot?: boolean;
}): WorkflowFlowNodeData {
  return {
    node: params.node,
    allNodes: params.allNodes || [params.node],
    connections: params.connections || [],
    models: params.models || [],
    uploadingNodeId: params.uploadingNodeId || null,
    modelPickerNodeId: params.modelPickerNodeId || null,
    hoveredNodeId: params.hoveredNodeId || null,
    canStoreVideoToShot: params.canStoreVideoToShot,
    onSelectNode: vi.fn(),
    onHoverNode: vi.fn(),
    onOpenAddFromHandle: vi.fn(),
    onPatchNode: vi.fn(),
    onModelChange: vi.fn(),
    onModeChange: vi.fn(),
    onParamChange: vi.fn(),
    onUploadAudio: vi.fn(),
    onToggleModelPicker: vi.fn(),
    onOpenNodeMenu: vi.fn(),
    onRunNode: vi.fn(),
    onStoreVideoToShot: vi.fn(),
  };
}

describe('WorkflowFlowNodeCard', () => {
  it('renders collapsed text summary when the node is not selected', () => {
    const node = createNode({
      id: 'text-1',
      type: 'text',
      title: '文案节点',
      content: '一段用于摘要展示的文案内容',
    });

    render(<WorkflowFlowNodeCard {...({ data: createNodeData({ node }), selected: false } as any)} />);

    expect(screen.getByText('文案节点')).toBeTruthy();
    expect(screen.getByText('一段用于摘要展示的文案内容')).toBeTruthy();
    expect(screen.queryByPlaceholderText('输入节点自己的生成提示，也可以通过连线接收上游文本。')).toBeNull();
  });

  it('renders selected text controls, modes, and connected input summary', () => {
    const sourceNode = createNode({
      id: 'source-1',
      type: 'text',
      title: '上游脚本',
      content: '上游内容',
    });
    const node = createNode({
      id: 'text-2',
      type: 'text',
      title: '脚本整理',
      modelId: 'gemini-text',
      prompt: '请整理镜头脚本',
      params: { temperature: 0.7 },
    });
    const model = createModel({
      deploymentId: 'gemini-text',
      familyId: 'gemini',
      familyName: 'Gemini',
      name: 'Gemini Text',
      modality: 'text',
      inputSchema: {
        context: { accepts: ['text'], label: '上下文', showInNode: true },
      },
      configSchema: {
        temperature: { type: 'number', label: '温度', default: 0.7 },
      },
      generationModes: [
        { id: 'draft', label: '草稿', summaryLabel: '草稿', enabledInputKeys: ['context'] },
        { id: 'polish', label: '润色', summaryLabel: '润色', enabledInputKeys: ['context'] },
      ],
      defaultGenerationModeId: 'draft',
    });
    const connection: CanvasConnection = {
      id: 'conn-1',
      from: sourceNode.id,
      to: node.id,
      inputKey: 'context',
      inputType: 'text',
    };

    render(<WorkflowFlowNodeCard {...({
      data: createNodeData({
        node,
        allNodes: [sourceNode, node],
        connections: [connection],
        models: [model],
      }),
      selected: true,
    } as any)} />);

    expect(screen.getByDisplayValue('请整理镜头脚本')).toBeTruthy();
    expect(screen.getByRole('button', { name: '草稿' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '润色' })).toBeTruthy();
    expect(screen.getByText('上游脚本')).toBeTruthy();
    expect(screen.getByRole('button', { name: '运行节点' })).toBeTruthy();
  });

  it('renders audio upload replacement state for selected audio nodes', () => {
    const node = createNode({
      id: 'audio-1',
      type: 'audio',
      title: '配音参考',
      content: 'https://example.com/audio/reference.mp3',
    });

    render(<WorkflowFlowNodeCard {...({
      data: createNodeData({ node }),
      selected: true,
    } as any)} />);

    expect(screen.getByText('替换音频参考')).toBeTruthy();
    expect(screen.getByText('已连接素材')).toBeTruthy();
  });

  it('renders selected video actions including store-to-shot when preview exists', () => {
    const node = createNode({
      id: 'video-1',
      type: 'video',
      title: '视频生成',
      modelId: 'video-model',
      prompt: '生成镜头视频',
      output: { previewUrl: 'https://example.com/video/output.mp4' },
      params: { ratio: '16:9' },
    });
    const model = createModel({
      deploymentId: 'video-model',
      familyId: 'seedance-2.0',
      familyName: 'Seedance',
      name: 'Seedance Video',
      modality: 'video',
      configSchema: {
        ratio: { type: 'string', label: '比例', default: '16:9' },
      },
    });

    render(<WorkflowFlowNodeCard {...({
      data: createNodeData({
        node,
        models: [model],
        canStoreVideoToShot: true,
      }),
      selected: true,
    } as any)} />);

    expect(screen.getByDisplayValue('生成镜头视频')).toBeTruthy();
    expect(screen.getByText('存为分镜')).toBeTruthy();
    expect(screen.getByRole('button', { name: '生成' })).toBeTruthy();
  });
});
