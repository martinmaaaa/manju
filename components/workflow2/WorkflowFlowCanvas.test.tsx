import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowFlowCanvas } from './WorkflowFlowCanvas';

vi.mock('@xyflow/react', async () => {
  const ReactModule = await import('react');

  return {
    ReactFlow: ({
      children,
      onInit,
      onPaneClick,
      onPaneContextMenu,
    }: {
      children?: React.ReactNode;
      onInit?: (instance: { screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number } }) => void;
      onPaneClick?: () => void;
      onPaneContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
    }) => {
      ReactModule.useEffect(() => {
        onInit?.({
          screenToFlowPosition: ({ x, y }) => ({ x: x - 100, y: y - 50 }),
        });
      }, [onInit]);

      return (
        <div data-testid="mock-flow-pane" onClick={onPaneClick} onContextMenu={onPaneContextMenu}>
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

describe('WorkflowFlowCanvas', () => {
  it('opens a context menu on pane right-click and adds a node at the projected position', () => {
    const onAddNodeAt = vi.fn();
    const onSelectNode = vi.fn();

    const { container } = render(
      <WorkflowFlowCanvas
        content={{ nodes: [], connections: [] }}
        models={[]}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
        onChangeContent={(buildNextContent) => buildNextContent({ nodes: [], connections: [] })}
        onAddNodeAt={onAddNodeAt}
      />,
    );

    const shell = container.querySelector('.workflow-flow-shell') as HTMLDivElement;
    vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
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

    fireEvent.contextMenu(screen.getByTestId('mock-flow-pane'), {
      clientX: 320,
      clientY: 260,
    });

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(onSelectNode).toHaveBeenCalledWith(null);
    expect(onAddNodeAt).toHaveBeenCalledWith('text', { x: 220, y: 210 });
  });
});
