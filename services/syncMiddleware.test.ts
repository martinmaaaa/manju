import { describe, expect, it } from 'vitest';
import { NodeStatus, NodeType, type AppNode, type Connection } from '../types';
import { diffNodes, ensureConnectionIds } from './syncMiddleware';

function makeNode(overrides: Partial<AppNode> = {}): AppNode {
  return {
    id: 'node-1',
    type: NodeType.PROMPT_INPUT,
    x: 0,
    y: 0,
    width: 420,
    height: 360,
    title: 'Test Node',
    status: NodeStatus.IDLE,
    data: {},
    inputs: [],
    ...overrides,
  };
}

describe('ensureConnectionIds', () => {
  it('adds ids for connections that are missing one', () => {
    const connections: Connection[] = [{ from: 'node-a', to: 'node-b' }];

    const normalized = ensureConnectionIds(connections);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBeTruthy();
    expect(normalized[0].from).toBe('node-a');
    expect(normalized[0].to).toBe('node-b');
  });

  it('reuses the original array when all ids already exist', () => {
    const connections: Connection[] = [{ id: 'conn-1', from: 'node-a', to: 'node-b' }];

    const normalized = ensureConnectionIds(connections);

    expect(normalized).toBe(connections);
  });
});

describe('diffNodes', () => {
  it('treats input changes as data changes', () => {
    const prev = [makeNode({ id: 'target', inputs: [] })];
    const next = [makeNode({ id: 'target', inputs: ['source'] })];

    const result = diffNodes(prev, next);

    expect(result.dataChanged).toHaveLength(1);
    expect(result.dataChanged[0].id).toBe('target');
  });
});
