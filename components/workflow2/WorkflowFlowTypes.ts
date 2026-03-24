import type { Edge, Node } from '@xyflow/react';
import type { CanvasConnection, CanvasNode, ModelDefinition } from '../../types/workflowApp';

export type WorkflowFlowNodeData = {
  node: CanvasNode;
  allNodes: CanvasNode[];
  connections: CanvasConnection[];
  models: ModelDefinition[];
  uploadingNodeId: string | null;
  modelPickerNodeId: string | null;
  hoveredNodeId: string | null;
  canStoreVideoToShot?: boolean;
  onSelectNode: (nodeId: string) => void;
  onHoverNode: (nodeId: string | null) => void;
  onOpenAddFromHandle: (nodeId: string, handleType: 'source' | 'target') => void;
  onPatchNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onModelChange: (nodeId: string, nextModelId: string) => void;
  onModeChange: (nodeId: string, nextModeId: string) => void;
  onParamChange: (nodeId: string, fieldKey: string, nextValue: string | number | boolean) => void;
  onUploadAudio?: (nodeId: string, file?: File | null) => void;
  onToggleModelPicker: (nodeId: string) => void;
  onOpenNodeMenu: (nodeId: string, position: { x: number; y: number }) => void;
  onRunNode?: (nodeId: string) => void;
  onStoreVideoToShot?: (nodeId: string) => void;
};

export type WorkflowFlowNode = Node<WorkflowFlowNodeData>;
export type WorkflowFlowEdge = Edge<{ inputKey: string }>;
