import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasConnection, CanvasNode, ModelDefinition } from '../../types/workflowApp';
import { WorkflowFlowCanvas } from './WorkflowFlowCanvas';

vi.mock('@xyflow/react', async () => {
  const ReactModule = await import('react');

  return {
    ReactFlow: ({
      children,
      nodes = [],
      nodeTypes = {},
      onInit,
      onPaneClick,
      onPaneContextMenu,
      onPaneDoubleClick,
      onNodeClick,
      onEdgeClick,
      onConnectStart,
      onConnectEnd,
      onConnect,
    }: {
      children?: React.ReactNode;
      nodes?: Array<{ id: string; type: string; data: unknown; selected?: boolean }>;
      nodeTypes?: Record<string, React.ComponentType<unknown>>;
      onInit?: (instance: { screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number } }) => void;
      onPaneClick?: () => void;
      onPaneContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
      onPaneDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
      onNodeClick?: (event: React.MouseEvent<HTMLDivElement>, node: { id: string }) => void;
      onEdgeClick?: (event: React.MouseEvent<HTMLButtonElement>, edge: { id: string }) => void;
      onConnectStart?: (event: React.MouseEvent<HTMLButtonElement>, params: { nodeId?: string; handleId?: string | null; handleType?: 'source' | 'target' | null }) => void;
      onConnectEnd?: (event: React.MouseEvent<HTMLButtonElement>, connectionState: { toNode?: unknown; pointer?: { x: number; y: number }; to?: { x: number; y: number } }) => void;
      onConnect?: (connection: { source?: string; target?: string; targetHandle?: string | null }) => void;
    }) => {
      const initializedRef = ReactModule.useRef(false);
      ReactModule.useEffect(() => {
        if (!initializedRef.current) {
          initializedRef.current = true;
          onInit?.({
            screenToFlowPosition: ({ x, y }) => ({ x: x - 100, y: y - 50 }),
          });
        }
      }, [onInit]);

      return (
        <div
          data-testid="mock-flow-pane"
          onClick={onPaneClick}
          onContextMenu={onPaneContextMenu}
          onDoubleClick={onPaneDoubleClick}
        >
          {nodes.map((node) => {
            const Component = nodeTypes[node.type];
            return Component ? (
              <div key={node.id} data-testid={`mock-node-${node.id}`} onClick={(event) => onNodeClick?.(event, { id: node.id })}>
                <Component {...({ data: node.data, selected: node.selected } as any)} />
              </div>
            ) : null;
          })}
          {children}
          <button
            type="button"
            data-testid="mock-connect"
            onClick={() => onConnect?.({ source: 'source-1', target: 'target-1', targetHandle: 'context' })}
          >
            connect
          </button>
          <button
            type="button"
            data-testid="mock-edge-click"
            onClick={(event) => onEdgeClick?.(event, { id: 'conn-1' })}
          >
            edge
          </button>
          <button
            type="button"
            data-testid="mock-connect-start-target"
            onClick={(event) => onConnectStart?.(event, { nodeId: 'target-1', handleId: null, handleType: 'target' })}
          >
            start-target
          </button>
          <button
            type="button"
            data-testid="mock-connect-end"
            onClick={(event) => onConnectEnd?.(event, { toNode: null, pointer: { x: 360, y: 300 }, to: { x: 260, y: 250 } })}
          >
            end
          </button>
        </div>
      );
    },
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    MarkerType: { ArrowClosed: 'arrow' },
    Position: { Left: 'left', Right: 'right' },
  };
});

function mockShellRect(element: Element | null) {
  vi.spyOn(element as HTMLDivElement, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 900,
    height: 640,
    top: 0,
    left: 0,
    right: 900,
    bottom: 640,
    toJSON: () => ({}),
  });
}

function createNode(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type' | 'title'>): CanvasNode {
  return {
    x: 120,
    y: 90,
    width: 320,
    height: 260,
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

describe('WorkflowFlowCanvas', () => {
  it('opens the add-node menu on pane double-click and inserts a node at the projected position', () => {
    let nextContent = { nodes: [], connections: [] as CanvasConnection[] };
    let lastOptions: { selectedNodeId?: string | null } | undefined;

    const { container } = render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={[]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent, options) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
          lastOptions = options;
        }}
      />,
    );

    mockShellRect(container.querySelector('.workflow-flow-shell'));

    fireEvent.doubleClick(screen.getByTestId('mock-flow-pane'), {
      clientX: 320,
      clientY: 260,
    });

    fireEvent.click(screen.getByText('添加文本'));

    expect(nextContent.nodes).toHaveLength(1);
    expect(nextContent.nodes[0]).toMatchObject({
      type: 'text',
      x: 220,
      y: 210,
    });
    expect(lastOptions?.selectedNodeId).toBe(nextContent.nodes[0].id);
  });

  it('opens node context actions and duplicates the selected node', () => {
    let nextContent = {
      nodes: [
        {
          id: 'node-1',
          type: 'text' as const,
          title: '起始节点',
          x: 120,
          y: 90,
          width: 320,
          height: 260,
          content: 'hello',
          prompt: '',
          params: {},
          output: {},
          runStatus: 'idle' as const,
          error: null,
          lastRunAt: null,
          metadata: {},
        },
      ],
      connections: [],
    };

    const { container } = render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={[]}
        selectedNodeId="node-1"
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    mockShellRect(container.querySelector('.workflow-flow-shell'));

    fireEvent.contextMenu(screen.getByDisplayValue('起始节点'), {
      clientX: 240,
      clientY: 180,
    });
    fireEvent.click(screen.getByText('创建副本'));

    expect(nextContent.nodes).toHaveLength(2);
    expect(nextContent.nodes[1]).toMatchObject({
      type: 'text',
      title: '起始节点 副本',
      x: 168,
      y: 138,
    });
  });

  it('creates a validated connection between source and target nodes', () => {
    const models = [
      createModel({
        deploymentId: 'text-model',
        familyId: 'gemini',
        familyName: 'Gemini',
        name: 'Gemini Text',
        modality: 'text',
        inputSchema: {
          context: { accepts: ['text'], label: '上下文', showInNode: true },
        },
      }),
    ];

    let nextContent = {
      nodes: [
        createNode({ id: 'source-1', type: 'text', title: '上游文本', content: 'hello' }),
        createNode({ id: 'target-1', type: 'text', title: '目标节点', modelId: 'text-model', x: 420 }),
      ],
      connections: [] as CanvasConnection[],
    };

    render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={models}
        selectedNodeId="target-1"
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('mock-connect'));

    expect(nextContent.connections).toHaveLength(1);
    expect(nextContent.connections[0]).toMatchObject({
      from: 'source-1',
      to: 'target-1',
      inputKey: 'context',
    });
  });

  it('deletes a node and removes its connections from the context menu', () => {
    let nextContent = {
      nodes: [
        createNode({ id: 'node-1', type: 'text', title: '待删除节点' }),
        createNode({ id: 'node-2', type: 'text', title: '保留节点', x: 420 }),
      ],
      connections: [
        { id: 'conn-1', from: 'node-1', to: 'node-2', inputKey: 'context', inputType: 'text' as const },
      ] as CanvasConnection[],
    };

    const { container } = render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={[]}
        selectedNodeId="node-1"
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    mockShellRect(container.querySelector('.workflow-flow-shell'));

    fireEvent.contextMenu(screen.getByDisplayValue('待删除节点'), {
      clientX: 260,
      clientY: 180,
    });
    fireEvent.click(screen.getByText('删除节点'));

    expect(nextContent.nodes.map((node) => node.id)).toEqual(['node-2']);
    expect(nextContent.connections).toHaveLength(0);
  });

  it('switches the selected node model from the node renderer picker', () => {
    const models = [
      createModel({
        deploymentId: 'model-a',
        familyId: 'gemini',
        familyName: 'Gemini',
        name: 'Gemini A',
        modality: 'text',
      }),
      createModel({
        deploymentId: 'model-b',
        familyId: 'gemini',
        familyName: 'Gemini',
        name: 'Gemini B',
        modality: 'text',
      }),
    ];

    let nextContent = {
      nodes: [
        createNode({ id: 'node-1', type: 'text', title: '切模型节点' }),
      ],
      connections: [] as CanvasConnection[],
    };

    render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={models}
        selectedNodeId="node-1"
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    fireEvent.click(screen.getByText('选择模型'));
    fireEvent.click(screen.getByText('Gemini B'));

    expect(nextContent.nodes[0].modelId).toBe('model-b');
  });

  it('uploads a text resource into a new text node', async () => {
    let nextContent = { nodes: [], connections: [] as CanvasConnection[] };

    const { container } = render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={[]}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    mockShellRect(container.querySelector('.workflow-flow-shell'));

    fireEvent.click(screen.getByText('添加节点'));
    fireEvent.click(screen.getByText('上传资源'));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['ignored'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue('上传文本内容'),
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(nextContent.nodes).toHaveLength(1);
    });
    expect(nextContent.nodes[0]).toMatchObject({
      type: 'text',
      title: 'notes.txt',
      content: '上传文本内容',
    });
  });

  it('removes an edge when the edge click handler is triggered', () => {
    let nextContent = {
      nodes: [
        createNode({ id: 'source-1', type: 'text', title: '上游节点' }),
        createNode({ id: 'target-1', type: 'text', title: '下游节点', x: 420 }),
      ],
      connections: [
        { id: 'conn-1', from: 'source-1', to: 'target-1', inputKey: 'context', inputType: 'text' as const },
      ] as CanvasConnection[],
    };

    render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={[]}
        selectedNodeId="target-1"
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('mock-edge-click'));

    expect(nextContent.connections).toHaveLength(0);
  });

  it('creates a node from a target handle add button and auto-connects it', () => {
    const models = [
      createModel({
        deploymentId: 'text-model',
        familyId: 'gemini',
        familyName: 'Gemini',
        name: 'Gemini Text',
        modality: 'text',
        inputSchema: {
          context: { accepts: ['text'], label: '上下文', showInNode: true },
        },
      }),
    ];

    let nextContent = {
      nodes: [
        createNode({ id: 'target-1', type: 'text', title: '目标节点', modelId: 'text-model', x: 420 }),
      ],
      connections: [] as CanvasConnection[],
    };

    const { container } = render(
      <WorkflowFlowCanvas
        content={nextContent}
        models={models}
        selectedNodeId="target-1"
        onSelectNode={vi.fn()}
        onChangeContent={(buildNextContent) => {
          nextContent = buildNextContent(nextContent) as typeof nextContent;
        }}
      />,
    );

    mockShellRect(container.querySelector('.workflow-flow-shell'));

    fireEvent.click(screen.getAllByText('+')[0]);
    fireEvent.click(screen.getByText('添加文本'));

    expect(nextContent.nodes).toHaveLength(2);
    expect(nextContent.connections).toHaveLength(1);
    expect(nextContent.connections[0].to).toBe('target-1');
    expect(nextContent.connections[0].inputKey).toBe('context');
  });
});
