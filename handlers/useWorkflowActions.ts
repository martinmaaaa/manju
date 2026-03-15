/**
 * useWorkflowActions - 兼容旧命名的画布快照操作 Hook
 */

import type { CanvasSnapshot } from '../types';
import { useEditorStore } from '../stores/editor.store';
import { getApproxNodeHeight } from '../utils/nodeHelpers';

interface UseWorkflowActionsParams {
  saveHistory: () => void;
}

export function useCanvasSnapshotActions(params: UseWorkflowActionsParams) {
  const { saveHistory } = params;
  const {
    nodes, setNodes,
    connections, setConnections,
    groups, setGroups,
    canvasSnapshots, setCanvasSnapshots,
    selectedCanvasSnapshotId, setSelectedCanvasSnapshotId,
  } = useEditorStore();

  const saveCurrentAsCanvasSnapshot = () => {
    const thumbnailNode = nodes.find(node => node.data.image);
    const thumbnail = thumbnailNode?.data.image || '';
    const newSnapshot: CanvasSnapshot = {
      id: `snapshot-${Date.now()}`,
      title: `画布快照 ${new Date().toLocaleDateString()}`,
      thumbnail,
      nodes: structuredClone(nodes),
      connections: structuredClone(connections),
      groups: structuredClone(groups),
    };

    setCanvasSnapshots(previous => [newSnapshot, ...previous]);
  };

  const saveGroupAsCanvasSnapshot = (groupId: string) => {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    const nodesInGroup = nodes.filter(node => {
      const width = node.width || 420;
      const height = node.height || getApproxNodeHeight(node);
      const centerX = node.x + width / 2;
      const centerY = node.y + height / 2;
      return centerX > group.x && centerX < group.x + group.width && centerY > group.y && centerY < group.y + group.height;
    });

    const nodeIds = new Set(nodesInGroup.map(node => node.id));
    const connectionsInGroup = connections.filter(connection => nodeIds.has(connection.from) && nodeIds.has(connection.to));
    const thumbnailNode = nodesInGroup.find(node => node.data.image);

    const newSnapshot: CanvasSnapshot = {
      id: `snapshot-${Date.now()}`,
      title: group.title || '未命名画布快照',
      thumbnail: thumbnailNode?.data.image || '',
      nodes: structuredClone(nodesInGroup),
      connections: structuredClone(connectionsInGroup),
      groups: [structuredClone(group)],
    };

    setCanvasSnapshots(previous => [newSnapshot, ...previous]);
  };

  const loadCanvasSnapshot = (id: string) => {
    const snapshot = canvasSnapshots.find(item => item.id === id);
    if (!snapshot) return;

    saveHistory();
    setNodes(structuredClone(snapshot.nodes));
    setConnections(structuredClone(snapshot.connections));
    setGroups(structuredClone(snapshot.groups));
    setSelectedCanvasSnapshotId(id);
  };

  const deleteCanvasSnapshot = (id: string) => {
    setCanvasSnapshots(previous => previous.filter(snapshot => snapshot.id !== id));
    if (selectedCanvasSnapshotId === id) {
      setSelectedCanvasSnapshotId(null);
    }
  };

  const renameCanvasSnapshot = (id: string, newTitle: string) => {
    setCanvasSnapshots(previous =>
      previous.map(snapshot => snapshot.id === id ? { ...snapshot, title: newTitle } : snapshot),
    );
  };

  return {
    saveCurrentAsCanvasSnapshot,
    saveGroupAsCanvasSnapshot,
    loadCanvasSnapshot,
    deleteCanvasSnapshot,
    renameCanvasSnapshot,
  };
}

export const useWorkflowActions = useCanvasSnapshotActions;
