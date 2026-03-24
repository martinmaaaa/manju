import React from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type ReactFlowInstance,
  type Connection,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  CanvasConnection,
  CanvasNode,
  EpisodeWorkspaceContent,
  EpisodeWorkspaceShotGraph,
  ModelDefinition,
  StageConfigMap,
  StudioWorkspace,
} from '../../types/workflowApp';
import {
  buildCanvasConnectionId,
  buildCanvasNodeModelChangePatch,
  buildCanvasNodeParamPatch,
  createCanvasNode,
  getNodeEnabledInputDefinitions,
  getVisibleNodeInputDefinitions,
  validateCanvasConnection,
} from '../../services/workflow/runtime/canvasGraphHelpers';
import {
  findModelByIdentifier,
} from '../../services/workflow/runtime/modelDeploymentHelpers';
import { WorkflowFlowNodeCard as SharedWorkflowFlowNodeCard } from './WorkflowNodeRenderers';
import type { WorkflowFlowEdge, WorkflowFlowNode, WorkflowFlowNodeData } from './WorkflowFlowTypes';

export interface WorkflowFlowCanvasProps {
  content: EpisodeWorkspaceContent | StudioWorkspace['content'];
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  selectedNodeId: string | null;
  currentShotId?: string | null;
  currentViewport?: { x: number; y: number; zoom: number } | null;
  onSelectNode: (nodeId: string | null) => void;
  onChangeContent: (
    buildNextContent: (content: EpisodeWorkspaceContent | StudioWorkspace['content']) => EpisodeWorkspaceContent | StudioWorkspace['content'],
    options?: { selectedNodeId?: string | null; markDirty?: boolean },
  ) => void;
  onRunNode?: (nodeId: string) => void;
  onUploadAudio?: (file: File) => Promise<{ url: string; title?: string }>;
  canStoreVideoToShot?: boolean;
  onStoreVideoToShot?: (nodeId: string) => void;
  onAddNodeAt?: (type: CanvasNode['type'], position?: { x: number; y: number }) => void;
  onError?: (message: string) => void;
}

interface FlowContextMenuState {
  left: number;
  top: number;
  flowPosition: {
    x: number;
    y: number;
  };
}

interface FlowNodeContextMenuState {
  nodeId: string;
  left: number;
  top: number;
}

interface PendingConnectionDraft {
  nodeId: string;
  handleId: string | null;
  handleType: 'source' | 'target' | null;
  position?: { x: number; y: number };
}

type AddNodeMenuEntry = CanvasNode['type'] | 'upload';

const NODE_TYPE_LABELS: Record<CanvasNode['type'], string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
};

const NODE_TYPE_HINTS: Record<AddNodeMenuEntry, string> = {
  text: '脚本、广告词、品牌文案',
  image: '宣传图、海报、封面',
  video: '宣传视频、动画、电影',
  audio: '音乐、配音、音效',
  upload: '支持图片、视频、音频文件',
};

function getRenderedNodeDimensions(node: CanvasNode, selected: boolean) {
  return {
    width: selected
      ? node.type === 'image'
        ? Math.max(node.width, 460)
        : node.type === 'video'
          ? Math.max(node.width, 500)
          : Math.max(node.width, 340)
      : node.type === 'text'
        ? Math.min(node.width, 260)
        : Math.min(node.width, 284),
    minHeight: selected
      ? node.type === 'image'
        ? Math.max(node.height, 360)
        : node.type === 'video'
          ? Math.max(node.height, 380)
          : node.height
      : node.type === 'text'
        ? 188
        : 204,
  };
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const nextValue = typeof event.target?.result === 'string' ? event.target.result : '';
      if (!nextValue) {
        reject(new Error('未能读取资源文件。'));
        return;
      }
      resolve(nextValue);
    };
    reader.onerror = () => reject(new Error('未能读取资源文件。'));
    reader.readAsDataURL(file);
  });
}

const nodeTypes = {
  workflow: SharedWorkflowFlowNodeCard,
};

export const WorkflowFlowCanvas: React.FC<WorkflowFlowCanvasProps> = ({
  content,
  models,
  stageConfig,
  selectedNodeId,
  currentShotId,
  currentViewport,
  onSelectNode,
  onChangeContent,
  onRunNode,
  onUploadAudio,
  canStoreVideoToShot,
  onStoreVideoToShot,
  onError,
}) => {
  const nodes = Array.isArray(content.nodes) ? content.nodes : [];
  const connections = Array.isArray(content.connections) ? content.connections : [];
  const [uploadingNodeId, setUploadingNodeId] = React.useState<string | null>(null);
  const [modelPickerNodeId, setModelPickerNodeId] = React.useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [flowInstance, setFlowInstance] = React.useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const [contextMenu, setContextMenu] = React.useState<FlowContextMenuState | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = React.useState<FlowNodeContextMenuState | null>(null);
  const [pendingConnectionDraft, setPendingConnectionDraft] = React.useState<PendingConnectionDraft | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingUploadPositionRef = React.useRef<{ x: number; y: number } | undefined>(undefined);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
    setNodeContextMenu(null);
    setModelPickerNodeId(null);
  }, []);

  React.useEffect(() => {
    if (!contextMenu && !nodeContextMenu) {
      return undefined;
    }

    const handleGlobalPointerDown = () => {
      setContextMenu(null);
      setNodeContextMenu(null);
      setModelPickerNodeId(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
        setNodeContextMenu(null);
        setModelPickerNodeId(null);
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, nodeContextMenu]);

  const sanitizeConnectionsForTarget = React.useCallback((
    targetNode: CanvasNode,
    candidateConnections: CanvasConnection[],
    candidateNodes: CanvasNode[],
  ) => {
    const targetModel = findModelByIdentifier(models, targetNode.modelId);
    const visibleDefinitions = new Map(getVisibleNodeInputDefinitions(targetNode, targetModel));
    const enabledDefinitions = new Map(getNodeEnabledInputDefinitions(targetNode, targetModel));
    const sourceNodeMap = new Map(candidateNodes.map((item) => [item.id, item]));
    const usage = new Map<string, number>();

    return candidateConnections.filter((connection) => {
      if (connection.to !== targetNode.id) {
        return true;
      }

      const sourceNode = sourceNodeMap.get(connection.from);
      const definition = enabledDefinitions.get(connection.inputKey) || visibleDefinitions.get(connection.inputKey);
      if (!sourceNode || !definition) {
        return false;
      }

      if (!definition.accepts.includes(sourceNode.type)) {
        return false;
      }

      const currentCount = usage.get(connection.inputKey) || 0;
      const maxItems = definition.maxItems ?? (definition.multiple ? Number.POSITIVE_INFINITY : 1);
      if (Number.isFinite(maxItems) && currentCount >= maxItems) {
        return false;
      }

      usage.set(connection.inputKey, currentCount + 1);
      return true;
    });
  }, [models]);

  const resolveCanvasConnection = React.useCallback((
    sourceNode: CanvasNode,
    targetNode: CanvasNode,
    candidateConnections: CanvasConnection[],
    targetHandleId?: string | null,
  ) => {
    const validation = validateCanvasConnection(
      sourceNode,
      targetNode,
      models,
      candidateConnections,
      targetHandleId || undefined,
    );

    if (!validation.valid) {
      return null;
    }

    const resolvedInputKey = validation.resolvedInputKey || targetHandleId;
    if (!resolvedInputKey) {
      return null;
    }

    return {
      id: buildCanvasConnectionId(sourceNode.id, targetNode.id, resolvedInputKey),
      from: sourceNode.id,
      to: targetNode.id,
      inputKey: resolvedInputKey,
      inputType: sourceNode.type,
    } satisfies CanvasConnection;
  }, [models]);

  const patchNode = React.useCallback((nodeId: string, patch: Partial<CanvasNode>) => {
    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: (currentContent.nodes || []).map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
      connections: Array.isArray(currentContent.connections) ? currentContent.connections : [],
    }));
  }, [onChangeContent]);

  const handleModelChange = React.useCallback((nodeId: string, nextModelId: string) => {
    onChangeContent((currentContent) => {
      const currentNodes = Array.isArray(currentContent.nodes) ? currentContent.nodes : [];
      const currentConnections = Array.isArray(currentContent.connections) ? currentContent.connections : [];
      const targetNode = currentNodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return currentContent;
      }

      const patch = buildCanvasNodeModelChangePatch(targetNode, nextModelId, models);
      const nextNode = { ...targetNode, ...patch };
      const nextNodes = currentNodes.map((node) => (node.id === nodeId ? nextNode : node));

      return {
        ...currentContent,
        nodes: nextNodes,
        connections: sanitizeConnectionsForTarget(nextNode, currentConnections, nextNodes),
      };
    });
  }, [models, onChangeContent, sanitizeConnectionsForTarget]);

  const handleModeChange = React.useCallback((nodeId: string, nextModeId: string) => {
    onChangeContent((currentContent) => {
      const currentNodes = Array.isArray(currentContent.nodes) ? currentContent.nodes : [];
      const currentConnections = Array.isArray(currentContent.connections) ? currentContent.connections : [];
      const targetNode = currentNodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return currentContent;
      }

      const nextNode: CanvasNode = {
        ...targetNode,
        modeId: nextModeId,
        runStatus: 'idle',
        error: null,
      };
      const nextNodes = currentNodes.map((node) => (node.id === nodeId ? nextNode : node));

      return {
        ...currentContent,
        nodes: nextNodes,
        connections: sanitizeConnectionsForTarget(nextNode, currentConnections, nextNodes),
      };
    });
  }, [onChangeContent, sanitizeConnectionsForTarget]);

  const handleParamChange = React.useCallback((nodeId: string, fieldKey: string, nextValue: string | number | boolean) => {
    onChangeContent((currentContent) => {
      const currentNodes = Array.isArray(currentContent.nodes) ? currentContent.nodes : [];
      const targetNode = currentNodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return currentContent;
      }

      return {
        ...currentContent,
        nodes: currentNodes.map((node) => (
          node.id === nodeId
            ? { ...node, ...buildCanvasNodeParamPatch(targetNode, fieldKey, nextValue, models) }
            : node
        )),
        connections: Array.isArray(currentContent.connections) ? currentContent.connections : [],
      };
    });
  }, [models, onChangeContent]);

  const handleAudioUpload = React.useCallback(async (nodeId: string, file?: File | null) => {
    if (!file) {
      return;
    }

    setUploadingNodeId(nodeId);

    try {
      if (onUploadAudio) {
        const uploaded = await onUploadAudio(file);
        const nextTitle = uploaded.title || (file.name ? `音频参考 · ${file.name}` : '');
        patchNode(nodeId, {
          content: uploaded.url,
          ...(nextTitle ? { title: nextTitle } : {}),
        });
        return;
      }

      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const nextValue = typeof event.target?.result === 'string' ? event.target.result : '';
          if (!nextValue) {
            reject(new Error('未能读取音频文件。'));
            return;
          }
          resolve(nextValue);
        };
        reader.onerror = () => reject(new Error('未能读取音频文件。'));
        reader.readAsDataURL(file);
      });

      const nextTitle = file.name ? `音频参考 · ${file.name}` : '';
      patchNode(nodeId, {
        content: result,
        ...(nextTitle ? { title: nextTitle } : {}),
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : '上传音频参考失败。');
    } finally {
      setUploadingNodeId((current) => (current === nodeId ? null : current));
    }
  }, [onError, onUploadAudio, patchNode]);

  const handleCreateNode = React.useCallback((
    type: CanvasNode['type'],
    position?: { x: number; y: number },
    patch?: Partial<CanvasNode>,
  ) => {
    const nextNode = {
      ...createCanvasNode(type, nodes.length, models, stageConfig),
      ...(patch || {}),
    };
    if (position) {
      nextNode.x = Math.round(position.x);
      nextNode.y = Math.round(position.y);
    }

    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: [...(Array.isArray(currentContent.nodes) ? currentContent.nodes : []), nextNode],
      connections: Array.isArray(currentContent.connections) ? currentContent.connections : [],
    }), { selectedNodeId: nextNode.id });

    return nextNode.id;
  }, [models, nodes.length, onChangeContent, stageConfig]);


  const inferUploadNodeType = React.useCallback((file: File): CanvasNode['type'] => {
    const fileType = String(file.type || '').toLowerCase();
    if (fileType.startsWith('image/')) return 'image';
    if (fileType.startsWith('video/')) return 'video';
    if (fileType.startsWith('audio/')) return 'audio';
    return 'text';
  }, []);

  const handleAddUploadedResource = React.useCallback(async (file?: File | null) => {
    if (!file) {
      return;
    }

    const nextType = inferUploadNodeType(file);
    const position = pendingUploadPositionRef.current;

    try {
      if (nextType === 'audio' && onUploadAudio) {
        setUploadingNodeId('upload-resource');
        const uploaded = await onUploadAudio(file);
        handleCreateNode('audio', position, {
          content: uploaded.url,
          title: uploaded.title || file.name || '音频参考',
        });
      } else if (nextType === 'text') {
        const textContent = await file.text();
        handleCreateNode('text', position, {
          content: textContent,
          title: file.name || '文本资源',
        });
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        handleCreateNode(nextType, position, {
          content: dataUrl,
          title: file.name || `上传${NODE_TYPE_LABELS[nextType]}资源`,
        });
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : '导入资源失败。');
    } finally {
      pendingUploadPositionRef.current = undefined;
      setUploadingNodeId((current) => (current === 'upload-resource' ? null : current));
    }
  }, [handleCreateNode, inferUploadNodeType, onError, onUploadAudio]);

  const handleDuplicateNode = React.useCallback((nodeId: string) => {
    const targetNode = nodes.find((item) => item.id === nodeId);
    if (!targetNode) {
      return;
    }
    handleCreateNode(targetNode.type, { x: targetNode.x + 48, y: targetNode.y + 48 }, {
      ...targetNode,
      id: `${targetNode.type}-${Date.now()}-${nodes.length}`,
      title: `${targetNode.title} 副本`,
      runStatus: 'idle',
      error: null,
      lastRunAt: null,
    });
  }, [handleCreateNode, nodes]);

  const handleDeleteNode = React.useCallback((nodeId: string) => {
    onChangeContent((currentContent) => {
      const nextNodes = (Array.isArray(currentContent.nodes) ? currentContent.nodes : []).filter((node) => node.id !== nodeId);
      return {
        ...currentContent,
        nodes: nextNodes,
        connections: (Array.isArray(currentContent.connections) ? currentContent.connections : []).filter((connection) => connection.from !== nodeId && connection.to !== nodeId),
      };
    }, {
      selectedNodeId: selectedNodeId === nodeId ? nodes.find((node) => node.id !== nodeId)?.id || null : selectedNodeId,
    });
    setNodeContextMenu(null);
  }, [nodes, onChangeContent, selectedNodeId]);

  const handleCopyNode = React.useCallback(async (nodeId: string) => {
    const targetNode = nodes.find((item) => item.id === nodeId);
    if (!targetNode || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(targetNode, null, 2));
    } catch {
      onError?.('复制节点失败。');
    } finally {
      setNodeContextMenu(null);
    }
  }, [nodes, onError]);

  const flowNodes = React.useMemo<FlowNode[]>(() => nodes.map((node) => ({
    id: node.id,
    type: 'workflow',
    position: { x: node.x, y: node.y },
    dragHandle: '.workflow-flow-node__drag-handle',
    selected: selectedNodeId === node.id,
    style: {
      width: selectedNodeId === node.id
        ? node.type === 'image'
          ? Math.max(node.width, 460)
          : node.type === 'video'
            ? Math.max(node.width, 500)
            : Math.max(node.width, 340)
        : node.type === 'text'
          ? Math.min(node.width, 260)
          : Math.min(node.width, 284),
      minHeight: selectedNodeId === node.id
        ? node.type === 'image'
          ? Math.max(node.height, 360)
          : node.type === 'video'
            ? Math.max(node.height, 380)
            : node.height
        : node.type === 'text'
          ? 188
          : 204,
      background: 'transparent',
      border: 'none',
    },
    data: {
      node,
      allNodes: nodes,
      connections,
      models,
      uploadingNodeId,
      modelPickerNodeId,
      hoveredNodeId,
      canStoreVideoToShot,
      onSelectNode: (nodeId) => onSelectNode(nodeId),
      onHoverNode: setHoveredNodeId,
      onOpenAddFromHandle: handleOpenAddFromHandle,
      onPatchNode: patchNode,
      onModelChange: handleModelChange,
      onModeChange: handleModeChange,
      onParamChange: handleParamChange,
      onUploadAudio: handleAudioUpload,
      onToggleModelPicker: (nodeId) => setModelPickerNodeId((current) => (current === nodeId ? null : nodeId)),
      onOpenNodeMenu: (nodeId, position) => {
        setContextMenu(null);
        setModelPickerNodeId(null);
        const bounds = shellRef.current?.getBoundingClientRect();
        if (!bounds) {
          return;
        }
        setNodeContextMenu({
          nodeId,
          left: Math.max(12, Math.min(position.x - bounds.left, bounds.width - 220)),
          top: Math.max(12, Math.min(position.y - bounds.top, bounds.height - 180)),
        });
      },
      onRunNode,
      onStoreVideoToShot,
    },
  })), [
    canStoreVideoToShot,
    connections,
    handleAudioUpload,
    handleOpenAddFromHandle,
    handleModeChange,
    handleModelChange,
    handleParamChange,
    hoveredNodeId,
    modelPickerNodeId,
    models,
    nodes,
    onRunNode,
    onSelectNode,
    onStoreVideoToShot,
    patchNode,
    selectedNodeId,
    uploadingNodeId,
  ]);

  const flowEdges = React.useMemo<FlowEdge[]>(() => connections.map((connection) => ({
    id: connection.id,
    source: connection.from,
    target: connection.to,
    sourceHandle: 'output',
    targetHandle: connection.inputKey,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(148, 163, 184, 0.42)',
    },
    style: {
      stroke: 'rgba(148, 163, 184, 0.38)',
      strokeWidth: 1.5,
      opacity: 0.9,
    },
    data: {
      inputKey: connection.inputKey,
    },
  })), [connections]);

  const handleConnect = React.useCallback<OnConnect>((connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) {
      return;
    }

    const nextConnection = resolveCanvasConnection(sourceNode, targetNode, connections, connection.targetHandle);
    if (!nextConnection) {
      onError?.('缺少目标输入槽位。');
      return;
    }

    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: Array.isArray(currentContent.nodes) ? currentContent.nodes : [],
      connections: [
        ...(Array.isArray(currentContent.connections) ? currentContent.connections : []),
        nextConnection,
      ],
    }));
    setPendingConnectionDraft(null);
  }, [connections, nodes, onChangeContent, onError, resolveCanvasConnection]);

  const handleNodesChange = React.useCallback<OnNodesChange>((changes) => {
    const positionMap = new Map<string, { x: number; y: number }>();

    changes.forEach((change) => {
      if (change.type === 'position' && change.position) {
        positionMap.set(change.id, {
          x: Math.round(change.position.x),
          y: Math.round(change.position.y),
        });
      }
    });

    if (positionMap.size === 0) {
      return;
    }

    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: (currentContent.nodes || []).map((node) => {
        const nextPosition = positionMap.get(node.id);
        return nextPosition ? { ...node, x: nextPosition.x, y: nextPosition.y } : node;
      }),
      connections: Array.isArray(currentContent.connections) ? currentContent.connections : [],
    }));
  }, [onChangeContent]);

  const handleEdgesChange = React.useCallback<OnEdgesChange>((changes) => {
    const removedEdgeIds = new Set(
      changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id),
    );

    if (removedEdgeIds.size === 0) {
      return;
    }

    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: Array.isArray(currentContent.nodes) ? currentContent.nodes : [],
      connections: (currentContent.connections || []).filter((connection) => !removedEdgeIds.has(connection.id)),
    }));
  }, [onChangeContent]);

  const handleMoveEnd = React.useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (!currentShotId) {
      return;
    }

    onChangeContent((currentContent) => {
      const currentShotGraph = currentContent.shotGraphs?.[currentShotId];
      return {
        ...currentContent,
        shotGraphs: {
          ...((currentContent.shotGraphs && typeof currentContent.shotGraphs === 'object'
            ? currentContent.shotGraphs
            : {}) as Record<string, EpisodeWorkspaceShotGraph>),
          [currentShotId]: {
            nodes: Array.isArray(currentContent.nodes) ? currentContent.nodes : [],
            connections: Array.isArray(currentContent.connections) ? currentContent.connections : [],
            viewport: {
              x: viewport.x,
              y: viewport.y,
              zoom: viewport.zoom,
            },
            history: currentShotGraph?.history,
          },
        },
      };
    }, { markDirty: false });
  }, [currentShotId, onChangeContent]);

  function openAddNodeMenu(clientX: number, clientY: number, explicitFlowPosition?: { x: number; y: number }) {
    const bounds = shellRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const rawPosition = explicitFlowPosition || (
      flowInstance?.screenToFlowPosition
        ? flowInstance.screenToFlowPosition({ x: clientX, y: clientY })
        : { x: clientX - bounds.left, y: clientY - bounds.top }
    );
    const menuWidth = 224;
    const menuHeight = 320;
    const offsetX = clientX - bounds.left;
    const offsetY = clientY - bounds.top;

    setContextMenu({
      left: Math.max(12, Math.min(offsetX, bounds.width - menuWidth - 12)),
      top: Math.max(12, Math.min(offsetY, bounds.height - menuHeight - 12)),
      flowPosition: {
        x: Math.round(rawPosition.x),
        y: Math.round(rawPosition.y),
      },
    });
    setNodeContextMenu(null);
    setModelPickerNodeId(null);
    onSelectNode(null);
  }

  const handlePaneDoubleClick = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openAddNodeMenu(event.clientX, event.clientY);
  }, [openAddNodeMenu]);

  function handleOpenAddFromHandle(nodeId: string, handleType: 'source' | 'target') {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) {
      return;
    }

    const rendered = getRenderedNodeDimensions(targetNode, selectedNodeId === nodeId);
    const nextFlowPosition = handleType === 'source'
      ? {
        x: Math.round(targetNode.x + rendered.width + 156),
        y: Math.round(targetNode.y + rendered.minHeight / 2 - 72),
      }
      : {
        x: Math.round(targetNode.x - 276),
        y: Math.round(targetNode.y + rendered.minHeight / 2 - 72),
      };

    const screenPosition = flowInstance?.flowToScreenPosition
      ? flowInstance.flowToScreenPosition({
        x: handleType === 'source' ? targetNode.x + rendered.width + 28 : targetNode.x - 28,
        y: targetNode.y + rendered.minHeight / 2,
      })
      : shellRef.current
        ? {
          x: shellRef.current.getBoundingClientRect().left + (handleType === 'source' ? targetNode.x + rendered.width + 28 : targetNode.x - 28),
          y: shellRef.current.getBoundingClientRect().top + targetNode.y + rendered.minHeight / 2,
        }
        : null;

    if (!screenPosition) {
      return;
    }

    setPendingConnectionDraft({
      nodeId,
      handleId: handleType === 'source' ? 'output' : null,
      handleType,
      position: nextFlowPosition,
    });
    openAddNodeMenu(screenPosition.x, screenPosition.y, nextFlowPosition);
  }

  const handleConnectStart = React.useCallback<OnConnectStart>((_event, params) => {
    setPendingConnectionDraft({
      nodeId: params.nodeId || '',
      handleId: params.handleId,
      handleType: params.handleType,
    });
  }, []);

  const handleConnectEnd = React.useCallback<OnConnectEnd>((event, connectionState) => {
    if (!pendingConnectionDraft || connectionState.toNode || !connectionState.pointer) {
      setPendingConnectionDraft(null);
      return;
    }

    openAddNodeMenu(connectionState.pointer.x, connectionState.pointer.y, connectionState.to || undefined);
  }, [openAddNodeMenu, pendingConnectionDraft]);

  const handleAddNodeFromContextMenu = React.useCallback((type: AddNodeMenuEntry) => {
    if (!contextMenu) {
      return;
    }

    if (type === 'upload') {
      pendingUploadPositionRef.current = contextMenu.flowPosition;
      uploadInputRef.current?.click();
      setContextMenu(null);
      return;
    }

    const nextNode = createCanvasNode(type, nodes.length, models, stageConfig);
    nextNode.x = contextMenu.flowPosition.x;
    nextNode.y = contextMenu.flowPosition.y;

    const draftNode = pendingConnectionDraft?.nodeId
      ? nodes.find((item) => item.id === pendingConnectionDraft.nodeId) || null
      : null;
    const nextConnection = draftNode
      ? pendingConnectionDraft?.handleType === 'target'
        ? resolveCanvasConnection(nextNode, draftNode, connections, pendingConnectionDraft.handleId)
        : resolveCanvasConnection(draftNode, nextNode, connections, null)
      : null;

    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: [...(Array.isArray(currentContent.nodes) ? currentContent.nodes : []), nextNode],
      connections: nextConnection
        ? [
          ...(Array.isArray(currentContent.connections) ? currentContent.connections : []),
          nextConnection,
        ]
        : (Array.isArray(currentContent.connections) ? currentContent.connections : []),
    }), { selectedNodeId: nextNode.id });

    setPendingConnectionDraft(null);
    setContextMenu(null);
  }, [connections, contextMenu, models, nodes, onChangeContent, pendingConnectionDraft, resolveCanvasConnection, stageConfig]);

  return (
    <div
      ref={shellRef}
      className="workflow-flow-shell relative h-[760px] min-h-[760px] overflow-hidden rounded-[32px] border border-white/10 bg-[#07090d] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement | null)?.closest('.workflow-flow-node')) {
          return;
        }
        handlePaneDoubleClick(event);
      }}
    >
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="max-w-md rounded-[28px] border border-dashed border-white/15 bg-black/35 px-8 py-10 text-center backdrop-blur">
            <div className="text-xs uppercase tracking-[0.34em] text-white/35">Canvas</div>
            <h3 className="mt-3 text-2xl font-semibold text-white">Shot workflow canvas</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              这个画布还没有节点。可以先同步模板工作流，或在空白区双击、点击左下角 Add node，继续添加文本、图片、视频、音频或上传资源。
            </p>
          </div>
        </div>
      ) : null}

      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*,text/plain,.md,.txt"
        onChange={(event) => {
          void handleAddUploadedResource(event.target.files?.[0] || null);
          event.target.value = '';
        }}
      />

      <ReactFlow
        key={currentShotId || 'episode-workflow'}
        className="workflow-flow h-full w-full"
        style={{ width: '100%', height: '100%' }}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        defaultViewport={currentViewport || { x: 24, y: 24, zoom: 0.92 }}
        fitView={!currentViewport}
        fitViewOptions={{ padding: 0.18, maxZoom: 1.02 }}
        minZoom={0.35}
        maxZoom={1.6}
        colorMode="dark"
        onInit={(instance) => setFlowInstance(instance as ReactFlowInstance<FlowNode, FlowEdge>)}
        onPaneClick={() => {
          closeContextMenu();
          onSelectNode(null);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          closeContextMenu();
        }}
        onNodeClick={(_event, node) => {
          closeContextMenu();
          onSelectNode(node.id);
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onEdgeClick={(_event, edge) => {
          closeContextMenu();
          onChangeContent((currentContent) => ({
            ...currentContent,
            nodes: Array.isArray(currentContent.nodes) ? currentContent.nodes : [],
            connections: (currentContent.connections || []).filter((connection) => connection.id !== edge.id),
          }));
        }}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onConnect={handleConnect}
        onMoveEnd={handleMoveEnd}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'rgba(148, 163, 184, 0.42)',
          },
          style: {
            stroke: 'rgba(148, 163, 184, 0.38)',
            strokeWidth: 1.5,
            opacity: 0.9,
          },
        }}
        connectionLineStyle={{
          stroke: 'rgba(148, 163, 184, 0.45)',
          strokeWidth: 1.5,
          opacity: 0.9,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} size={1} color="rgba(255,255,255,0.08)" />
        <Controls
          className="!rounded-2xl !border !border-white/10 !bg-[#05070d]/80 !shadow-[0_16px_40px_rgba(0,0,0,0.35)] !backdrop-blur"
          showInteractive={false}
        />
      </ReactFlow>

      <div className="absolute bottom-5 left-5 z-30 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const bounds = shellRef.current?.getBoundingClientRect();
            if (!bounds) {
              return;
            }
            openAddNodeMenu(bounds.left + 132, bounds.bottom - 120, flowInstance?.screenToFlowPosition
              ? flowInstance.screenToFlowPosition({ x: bounds.left + 160, y: bounds.top + bounds.height / 2 })
              : { x: 180, y: 180 });
          }}
          className="rounded-full border border-cyan-300/20 bg-cyan-300/12 px-4 py-2 text-sm font-semibold text-cyan-50 shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur"
        >
          Add node
        </button>
        <div className="rounded-full border border-white/10 bg-[#05070d]/80 px-3 py-2 text-xs text-white/45 backdrop-blur">
          双击空白区快速创建
        </div>
      </div>

      {contextMenu ? (
        <div
          className="absolute z-40 w-56 rounded-[24px] border border-white/10 bg-[#05070d]/96 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.24em] text-white/35">添加节点</div>
          <div className="grid gap-2">
            {([
              'text',
              'image',
              'video',
              'audio',
              'upload',
            ] as AddNodeMenuEntry[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-label={`Context add ${type} node`}
                onClick={() => handleAddNodeFromContextMenu(type)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-sm text-slate-100 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.08]"
              >
                <div className="font-semibold">{type === 'upload' ? '上传资源' : `添加${NODE_TYPE_LABELS[type]}`}</div>
                <div className="mt-1 text-xs text-white/45">{NODE_TYPE_HINTS[type]}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 px-2 text-xs leading-6 text-white/45">新节点会插入到当前画布点击位置。上传资源会自动推断成图片、视频、音频或文本节点。</div>
        </div>
      ) : null}

      {nodeContextMenu ? (
        <div
          className="absolute z-40 w-48 rounded-[24px] border border-white/10 bg-[#05070d]/96 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
          style={{ left: nodeContextMenu.left, top: nodeContextMenu.top }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.24em] text-white/35">节点操作</div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => void handleCopyNode(nodeContextMenu.nodeId)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-sm text-slate-100 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.08]"
            >
              复制节点
            </button>
            <button
              type="button"
              onClick={() => {
                handleDuplicateNode(nodeContextMenu.nodeId);
                setNodeContextMenu(null);
              }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-sm text-slate-100 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.08]"
            >
              创建副本
            </button>
            <button
              type="button"
              onClick={() => handleDeleteNode(nodeContextMenu.nodeId)}
              className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-left text-sm text-red-100 transition hover:border-red-300/30 hover:bg-red-400/15"
            >
              删除节点
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

