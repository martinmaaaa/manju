import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanvasConnection } from '../../types/workflowApp';
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
    }: {
      children?: React.ReactNode;
      nodes?: Array<{ id: string; type: string; data: unknown; selected?: boolean }>;
      nodeTypes?: Record<string, React.ComponentType<unknown>>;
      onInit?: (instance: { screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number } }) => void;
      onPaneClick?: () => void;
      onPaneContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
      onPaneDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
      onNodeClick?: (event: React.MouseEvent<HTMLDivElement>, node: { id: string }) => void;
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
});
