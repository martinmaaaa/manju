import { create } from 'zustand';
import { AppNode, Connection, NodeType, NodeStatus } from '../types';

interface NodeState {
    nodes: AppNode[];
    connections: Connection[];
    selectedNodeIds: string[];

    // Setters
    setNodes: (nodes: AppNode[] | ((prev: AppNode[]) => AppNode[])) => void;
    setConnections: (connections: Connection[] | ((prev: Connection[]) => Connection[])) => void;
    setSelectedNodeIds: (ids: string[] | ((prev: string[]) => string[])) => void;

    // Node Operations
    addNode: (type: NodeType, x?: number, y?: number, initialData?: Partial<AppNode['data']>) => string;
    deleteNode: (nodeId: string) => void;
    deleteNodes: (nodeIds: string[]) => void;
    updateNode: (nodeId: string, updates: Partial<AppNode>) => void;
    updateNodeData: (nodeId: string, dataUpdates: Partial<AppNode['data']>) => void;
    updateNodePosition: (nodeId: string, x: number, y: number) => void;
    updateNodesPosition: (updates: Array<{ id: string; x: number; y: number }>) => void;
    updateNodeSize: (nodeId: string, width: number, height: number) => void;
    updateNodeStatus: (nodeId: string, status: NodeStatus, progress?: number, error?: string) => void;
    duplicateNode: (nodeId: string, offsetX?: number, offsetY?: number) => string | null;

    // Selection
    selectNode: (nodeId: string, multiSelect?: boolean) => void;
    clearSelection: () => void;

    // Getters (Can be accessed via get())
    getNode: (nodeId: string) => AppNode | undefined;
    getNodeInputs: (nodeId: string) => AppNode[];
    getNodeOutputs: (nodeId: string) => AppNode[];
}

function getNodeDisplayName(type: NodeType): string {
    const names: Record<NodeType, string> = {
        [NodeType.PROMPT_INPUT]: '创意描述',
        [NodeType.IMAGE_GENERATOR]: '文字生图',
        [NodeType.VIDEO_GENERATOR]: '文生视频',
        [NodeType.AUDIO_GENERATOR]: '灵感音乐',
        [NodeType.VIDEO_ANALYZER]: '视频分析',
        [NodeType.IMAGE_EDITOR]: '图像编辑',
        [NodeType.SCRIPT_PLANNER]: '剧本大纲',
        [NodeType.SCRIPT_EPISODE]: '剧本分集',
        [NodeType.STORYBOARD_GENERATOR]: '分镜生成',
        [NodeType.STORYBOARD_IMAGE]: '分镜图片',
        [NodeType.STORYBOARD_SPLITTER]: '分镜切割',
        [NodeType.CHARACTER_NODE]: '角色设计',
        [NodeType.DRAMA_ANALYZER]: '剧本分析',
        [NodeType.DRAMA_REFINED]: '剧本精炼',
        [NodeType.STYLE_PRESET]: '风格预设',
        [NodeType.SORA_VIDEO_GENERATOR]: 'Sora 视频生成',
        [NodeType.SORA_VIDEO_CHILD]: 'Sora 视频片段',
        [NodeType.STORYBOARD_VIDEO_GENERATOR]: '分镜视频生成',
        [NodeType.STORYBOARD_VIDEO_CHILD]: '分镜视频片段',
        [NodeType.VIDEO_EDITOR]: '视频编辑器',
        [NodeType.JIMENG_VIDEO_GENERATOR]: '即梦视频生成'
    };
    return names[type] || type;
}

export const useNodeStore = create<NodeState>((set, get) => ({
    nodes: [],
    connections: [],
    selectedNodeIds: [],

    setNodes: (nodes) => set((state) => ({
        nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes
    })),

    setConnections: (connections) => set((state) => ({
        connections: typeof connections === 'function' ? connections(state.connections) : connections
    })),

    setSelectedNodeIds: (ids) => set((state) => ({
        selectedNodeIds: typeof ids === 'function' ? ids(state.selectedNodeIds) : ids
    })),

    addNode: (type, x = 100, y = 100, initialData = {}) => {
        const newNode: AppNode = {
            id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            x,
            y,
            width: 420,
            title: getNodeDisplayName(type),
            status: NodeStatus.IDLE,
            data: { ...initialData },
            inputs: []
        };

        set((state) => ({ nodes: [...state.nodes, newNode] }));
        return newNode.id;
    },

    deleteNode: (nodeId) => set((state) => {
        const newNodes = state.nodes.filter(n => n.id !== nodeId).map(node => ({
            ...node,
            inputs: node.inputs.filter(id => id !== nodeId)
        }));
        const newConnections = state.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
        const newSelected = state.selectedNodeIds.filter(id => id !== nodeId);

        return {
            nodes: newNodes,
            connections: newConnections,
            selectedNodeIds: newSelected
        };
    }),

    deleteNodes: (nodeIds) => set((state) => {
        const idsSet = new Set(nodeIds);
        const newNodes = state.nodes.filter(n => !idsSet.has(n.id)).map(node => ({
            ...node,
            inputs: node.inputs.filter(id => !idsSet.has(id))
        }));
        const newConnections = state.connections.filter(c => !idsSet.has(c.from) && !idsSet.has(c.to));

        return {
            nodes: newNodes,
            connections: newConnections,
            selectedNodeIds: []
        };
    }),

    updateNode: (nodeId, updates) => set((state) => ({
        nodes: state.nodes.map(node => node.id === nodeId ? { ...node, ...updates } : node)
    })),

    updateNodeData: (nodeId, dataUpdates) => set((state) => ({
        nodes: state.nodes.map(node =>
            node.id === nodeId ? { ...node, data: { ...node.data, ...dataUpdates } } : node
        )
    })),

    updateNodePosition: (nodeId, x, y) => set((state) => ({
        nodes: state.nodes.map(node => node.id === nodeId ? { ...node, x, y } : node)
    })),

    updateNodesPosition: (updates) => set((state) => {
        const updateMap = new Map(updates.map(u => [u.id, u]));
        return {
            nodes: state.nodes.map(node => {
                const update = updateMap.get(node.id);
                return update ? { ...node, x: update.x, y: update.y } : node;
            })
        };
    }),

    updateNodeSize: (nodeId, width, height) => set((state) => ({
        nodes: state.nodes.map(node => node.id === nodeId ? { ...node, width, height } : node)
    })),

    updateNodeStatus: (nodeId, status, progress, error) => set((state) => ({
        nodes: state.nodes.map(node =>
            node.id === nodeId ? {
                ...node,
                status,
                data: { ...node.data, progress, error }
            } : node
        )
    })),

    duplicateNode: (nodeId, offsetX = 50, offsetY = 50) => {
        const state = get();
        const sourceNode = state.nodes.find(n => n.id === nodeId);
        if (!sourceNode) return null;

        const newNode: AppNode = {
            ...sourceNode,
            id: `${sourceNode.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            x: sourceNode.x + offsetX,
            y: sourceNode.y + offsetY,
            inputs: [],
            status: NodeStatus.IDLE,
            data: {
                ...sourceNode.data,
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

        set((state) => ({ nodes: [...state.nodes, newNode] }));
        return newNode.id;
    },

    selectNode: (nodeId, multiSelect = false) => set((state) => {
        if (multiSelect) {
            return {
                selectedNodeIds: state.selectedNodeIds.includes(nodeId)
                    ? state.selectedNodeIds.filter(id => id !== nodeId)
                    : [...state.selectedNodeIds, nodeId]
            };
        } else {
            return { selectedNodeIds: [nodeId] };
        }
    }),

    clearSelection: () => set({ selectedNodeIds: [] }),

    getNode: (nodeId) => get().nodes.find(n => n.id === nodeId),

    getNodeInputs: (nodeId) => {
        const state = get();
        const node = state.nodes.find(n => n.id === nodeId);
        if (!node) return [];
        return node.inputs
            .map(inputId => state.nodes.find(n => n.id === inputId))
            .filter((n): n is AppNode => n !== undefined);
    },

    getNodeOutputs: (nodeId) => {
        return get().nodes.filter(node => node.inputs.includes(nodeId));
    }
}));
