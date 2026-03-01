// hooks/useNodeOperations.ts
import { useState, useCallback } from 'react';
import { AppNode, NodeType, NodeStatus, Connection } from '../types';
const uuidv4 = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);

/**
 * 节点操作管理 Hook
 * 管理节点的增删改查操作
 */
export function useNodeOperations(
  nodes: AppNode[],
  setNodes: React.Dispatch<React.SetStateAction<AppNode[]>>,
  connections: Connection[],
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
  selectedNodeIds: string[],
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
) {
  /**
   * 添加节点
   */
  const addNode = useCallback((
    type: NodeType,
    x?: number,
    y?: number,
    initialData?: Partial<AppNode['data']>
  ) => {
    const newNode: AppNode = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      x: x ?? 100,
      y: y ?? 100,
      width: 420,
      height: undefined, // 由节点类型决定
      title: getNodeDisplayName(type),
      status: NodeStatus.IDLE,
      data: {
        ...initialData
      },
      inputs: []
    };

    setNodes(prev => [...prev, newNode]);
    return newNode.id;
  }, []);

  /**
   * 删除节点
   */
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));

    // 删除相关连接
    setConnections(prev => prev.filter(
      c => c.from !== nodeId && c.to !== nodeId
    ));

    // 更新其他节点的输入
    setNodes(prev => prev.map(node => ({
      ...node,
      inputs: node.inputs.filter(id => id !== nodeId)
    })));

    // 取消选中
    setSelectedNodeIds(prev => prev.filter(id => id !== nodeId));
  }, []);

  /**
   * 批量删除节点
   */
  const deleteNodes = useCallback((nodeIds: string[]) => {
    const idsSet = new Set(nodeIds);

    setNodes(prev => prev.filter(n => !idsSet.has(n.id)));

    // 删除相关连接
    setConnections(prev => prev.filter(
      c => !idsSet.has(c.from) && !idsSet.has(c.to)
    ));

    // 更新其他节点的输入
    setNodes(prev => prev.map(node => ({
      ...node,
      inputs: node.inputs.filter(id => !idsSet.has(id))
    })));

    // 取消选中
    setSelectedNodeIds([]);
  }, []);

  /**
   * 更新节点数据
   */
  const updateNode = useCallback((nodeId: string, updates: Partial<AppNode>) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    ));
  }, []);

  /**
   * 更新节点的 data 字段
   */
  const updateNodeData = useCallback((
    nodeId: string,
    dataUpdates: Partial<AppNode['data']>
  ) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, ...dataUpdates } }
        : node
    ));
  }, []);

  /**
   * 更新节点位置
   */
  const updateNodePosition = useCallback((
    nodeId: string,
    x: number,
    y: number
  ) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, x, y } : node
    ));
  }, []);

  /**
   * 批量更新节点位置
   */
  const updateNodesPosition = useCallback((
    updates: Array<{ id: string; x: number; y: number }>
  ) => {
    const updateMap = new Map(updates.map(u => [u.id, u]));

    setNodes(prev => prev.map(node => {
      const update = updateMap.get(node.id);
      return update ? { ...node, x: update.x, y: update.y } : node;
    }));
  }, []);

  /**
   * 更新节点尺寸
   */
  const updateNodeSize = useCallback((
    nodeId: string,
    width: number,
    height: number
  ) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, width, height } : node
    ));
  }, []);

  /**
   * 更新节点状态
   */
  const updateNodeStatus = useCallback((
    nodeId: string,
    status: NodeStatus,
    progress?: string | number, // Allow string or number for progress
    error?: string
  ) => {
    setNodes(prev => prev.map(node => {
      if (node.id === nodeId) {
        let parsedProgress: number | undefined;
        if (typeof progress === 'string') {
          parsedProgress = Number(progress);
          if (isNaN(parsedProgress)) {
            parsedProgress = undefined; // If string cannot be parsed to a number, set to undefined
          }
        } else {
          parsedProgress = progress;
        }

        return {
          ...node,
          status,
          data: {
            ...node.data,
            progress: parsedProgress,
            error
          }
        };
      }
      return node;
    }));
  }, [setNodes]);

  /**
   * 复制节点
   */
  const duplicateNode = useCallback((nodeId: string, offsetX = 50, offsetY = 50) => {
    const sourceNode = nodes.find(n => n.id === nodeId);
    if (!sourceNode) return null;

    const newNode: AppNode = {
      ...sourceNode,
      id: `${sourceNode.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x: sourceNode.x + offsetX,
      y: sourceNode.y + offsetY,
      inputs: [], // 不复制连接
      status: NodeStatus.IDLE,
      data: {
        ...sourceNode.data,
        // 清除生成结果
        image: undefined,
        images: undefined,
        videoUri: undefined,
        videoUris: undefined,
        audioUri: undefined,
        analysis: undefined,
        error: undefined,
        progress: undefined
      }
    };

    setNodes(prev => [...prev, newNode]);
    return newNode.id;
  }, [nodes]);

  /**
   * 选中节点
   */
  const selectNode = useCallback((nodeId: string, multiSelect = false) => {
    if (multiSelect) {
      setSelectedNodeIds(prev =>
        prev.includes(nodeId)
          ? prev.filter(id => id !== nodeId)
          : [...prev, nodeId]
      );
    } else {
      setSelectedNodeIds([nodeId]);
    }
  }, []);

  /**
   * 清除选中
   */
  const clearSelection = useCallback(() => {
    setSelectedNodeIds([]);
  }, []);

  /**
   * 获取节点
   */
  const getNode = useCallback((nodeId: string) => {
    return nodes.find(n => n.id === nodeId);
  }, [nodes]);

  /**
   * 获取节点的输入节点
   */
  const getNodeInputs = useCallback((nodeId: string): AppNode[] => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return [];

    return node.inputs
      .map(inputId => nodes.find(n => n.id === inputId))
      .filter((n): n is AppNode => n !== undefined);
  }, [nodes]);

  /**
   * 获取节点的输出节点
   */
  const getNodeOutputs = useCallback((nodeId: string): AppNode[] => {
    return nodes.filter(node => node.inputs.includes(nodeId));
  }, [nodes]);

  return {
    // 状态
    nodes,
    connections,
    selectedNodeIds,

    // 设置器
    setNodes,
    setConnections,
    setSelectedNodeIds,

    // 节点操作
    addNode,
    deleteNode,
    deleteNodes,
    updateNode,
    updateNodeData,
    updateNodePosition,
    updateNodesPosition,
    updateNodeSize,
    updateNodeStatus,
    duplicateNode,

    // 选择操作
    selectNode,
    clearSelection,

    // 查询操作
    getNode,
    getNodeInputs,
    getNodeOutputs
  };
}

/**
 * 获取节点显示名称
 */
function getNodeDisplayName(type: NodeType): string {
  const names: Partial<Record<NodeType, string>> = {
    [NodeType.PROMPT_INPUT]: '创意描述',
    [NodeType.IMAGE_GENERATOR]: '文字生图',
    [NodeType.VIDEO_GENERATOR]: '文生视频',
    [NodeType.AUDIO_GENERATOR]: '灵感音乐',
    [NodeType.VIDEO_ANALYZER]: '视频分析',
    [NodeType.IMAGE_EDITOR]: '图像编辑',
    [NodeType.SCRIPT_PLANNER]: '剧本大纲',
    [NodeType.SCRIPT_EPISODE]: '剧本分集',
    [NodeType.STORYBOARD_GENERATOR]: '分镜生成',
    [NodeType.CHARACTER_NODE]: '角色设计'
  };

  return names[type] || type;
}

/**
 * 节点类型颜色
 */
export const nodeTypeLabels: Partial<Record<NodeType, string>> = {
  [NodeType.PROMPT_INPUT]: 'bg-blue-900/50 border-blue-500/50',
  [NodeType.IMAGE_GENERATOR]: 'bg-green-900/50 border-green-500/50',
  [NodeType.VIDEO_GENERATOR]: 'bg-red-900/50 border-red-500/50',
  [NodeType.AUDIO_GENERATOR]: 'bg-yellow-900/50 border-yellow-500/50',
  [NodeType.VIDEO_ANALYZER]: 'bg-orange-900/50 border-orange-500/50',
  [NodeType.IMAGE_EDITOR]: 'bg-lime-900/50 border-lime-500/50',
  [NodeType.SCRIPT_PLANNER]: 'bg-cyan-900/50 border-cyan-500/50',
  [NodeType.SCRIPT_EPISODE]: 'bg-teal-900/50 border-teal-500/50',
  [NodeType.STORYBOARD_GENERATOR]: 'bg-indigo-900/50 border-indigo-500/50',
  [NodeType.CHARACTER_NODE]: 'bg-pink-900/50 border-pink-500/50',
  [NodeType.STORYBOARD_IMAGE]: 'bg-purple-900/50 border-purple-500/50',
  [NodeType.STORYBOARD_SPLITTER]: 'bg-indigo-900/50 border-indigo-500/50',
  [NodeType.DRAMA_ANALYZER]: 'bg-pink-900/50 border-pink-500/50',
  [NodeType.DRAMA_REFINED]: 'bg-rose-900/50 border-rose-500/50',
  [NodeType.STYLE_PRESET]: 'bg-fuchsia-900/50 border-fuchsia-500/50',
  [NodeType.SORA_VIDEO_GENERATOR]: 'bg-cyan-900/50 border-cyan-500/50',
  [NodeType.SORA_VIDEO_CHILD]: 'bg-teal-900/50 border-teal-500/50',
  [NodeType.STORYBOARD_VIDEO_GENERATOR]: 'bg-violet-900/50 border-violet-500/50',
  [NodeType.STORYBOARD_VIDEO_CHILD]: 'bg-blue-900/50 border-blue-500/50',
  [NodeType.VIDEO_EDITOR]: 'bg-emerald-900/50 border-emerald-500/50',
};
