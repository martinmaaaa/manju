/**
 * AIYOU 漫剧生成平台 - 主应用组件
 *
 * @developer 光波 (a@ggbo.com)
 * @copyright Copyright (c) 2025 光波. All rights reserved.
 * @license MIT
 * @description AI驱动的一站式漫剧创作平台，支持剧本创作、角色设计、分镜生成、视频制作
 */

// ... existing imports
import React, { useState, useRef, useEffect, useCallback, lazy, Suspense, useMemo } from 'react';
import { useLanguage } from './src/i18n/LanguageContext';
import { Node } from './components/Node';
import { SidebarDock } from './components/SidebarDock';
import { GENERIC_CANVAS_NODE_TYPES } from './components/sidebar/nodeCatalog';
import { ModelFallbackNotification } from './components/ModelFallbackNotification';
import { AppNode, NodeType, NodeStatus, Connection, ContextMenuState, Group, CanvasSnapshot, SmartSequenceItem, CharacterProfile, SoraTaskGroup } from './types';
// AI 服务层：动态导入（首次调用时加载，减少首屏 ~107KB gzip ~36KB）
// 详见 ./services/lazyServices.ts
import { saveToStorage, loadFromStorage } from './services/storage_old';
import { getUserPriority, ModelCategory, getDefaultModel, getUserDefaultModel } from './services/modelConfig';
import { getGridConfig, STORYBOARD_RESOLUTIONS } from './services/storyboardConfig';
import { saveImageNodeOutput, saveVideoNodeOutput, saveAudioNodeOutput, saveStoryboardGridOutput } from './utils/storageHelper';
import { checkImageNodeCache, checkVideoNodeCache, checkAudioNodeCache } from './utils/cacheChecker';
import { validateConnection, canExecuteNode } from './utils/nodeValidation';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MemoizedConnectionLayer } from './components/ConnectionLayer';
import { CanvasContextMenu } from './components/CanvasContextMenu';
import { ApiKeyPrompt } from './components/ApiKeyPrompt';
import type { VideoSource } from './components/VideoEditor';
import { getNodeIcon, getNodeNameCN, getApproxNodeHeight, getNodeBounds } from './utils/nodeHelpers';
import { useCanvasState } from './hooks/useCanvasState';
import { useNodeOperations } from './hooks/useNodeOperations';
import { useHistory } from './hooks/useHistory';
import { createNodeQuery, useThrottle } from './hooks/usePerformanceOptimization';
import { useViewportCulling } from './hooks/useViewportCulling';
import { useWindowSize } from './hooks/useWindowSize';
import { useUIStore } from './stores/ui.store';
import { useEditorStore } from './stores/editor.store';
import {
  cancelGenerationJob,
  getProjects,
  getProject,
  getProjectWorkflowEntities,
  createProject,
  requeueGenerationJob,
  retryGenerationJob,
  updateProject,
  isApiAvailable,
  type GenerationJob,
  type ProjectDetail,
} from './services/api';
import { initSync, setSyncProjectId, getSyncProjectId, createStoreSubscription, syncFullSnapshot, setOnlineStatus, subscribeToSyncStatus } from './services/syncMiddleware';
import { useNodeActions } from './handlers/useNodeActions';
import { useCanvasSnapshotActions } from './handlers/useWorkflowActions';
import { useKeyboardShortcuts } from './handlers/useKeyboardShortcuts';
import { WorkflowCenter } from './components/workflow/WorkflowCenter';
import { ProjectWorkspaceLayout } from './components/workflow/ProjectWorkspaceLayout';
import { WorkflowAssetsView } from './components/workflow/views/WorkflowAssetsView';
import { WorkflowEpisodesView } from './components/workflow/views/WorkflowEpisodesView';
import { WorkflowJobsView } from './components/workflow/views/WorkflowJobsView';
import { WorkflowWorkspaceView } from './components/workflow/views/WorkflowWorkspaceView';
import { BRAND_LOGO_ALT, BRAND_NAME, BRAND_WORKSPACE_NAME } from './src/branding';
import {
  buildPipelineGraph,
  DEFAULT_PROJECT_SETTINGS,
  hasPipelineNodes,
  normalizeProjectSettings,
  resolveProjectEntryView,
  type PipelineTemplateId,
} from './services/workflowTemplates';
import { WORKFLOW_TEMPLATES } from './services/workflow/registry';
import {
  appendWorkflowAssetAndApplySuggestedTemplates,
  appendWorkflowAssetVersion,
  appendEpisodeInstanceToSeries,
  appendEpisodeInstancesToSeries,
  bindAssetToEpisode,
  createWorkflowInstance,
  getEpisodeInstances,
  getWorkflowProjectEntityCollections,
  getSeriesInstances,
  hydrateWorkflowProjectState,
  normalizeWorkflowProjectState,
  removeSeriesAssetBatchTemplate,
  setActiveEpisode,
  setActiveSeries,
  syncAssetBindingsForEpisodes,
  syncMultipleAssetBindingsForEpisodes,
  unbindAssetFromEpisode,
  upsertSeriesAssetBatchTemplates,
  updateSeriesWorkflowSettings,
  upsertSeriesAssetBatchTemplate,
  updateWorkflowStageState,
  batchUpdateWorkflowStageStates,
  upsertContinuityState,
  withWorkflowProjectState,
} from './services/workflow/runtime/projectState';
import type {
  ContinuityState,
  WorkflowAssetType,
  WorkflowBindingMode,
  WorkflowProjectState,
  WorkflowStageStatus,
  WorkflowTemplateId,
} from './services/workflow/domain/types';
import type { WorkflowProjectEntityCollections } from './services/workflow/runtime/projectState';

// Lazy load large components
const VideoEditor = lazy(() => import('./components/VideoEditor').then(m => ({ default: m.VideoEditor })));
const ImageCropper = lazy(() => import('./components/ImageCropper').then(m => ({ default: m.ImageCropper })));
const SketchEditor = lazy(() => import('./components/SketchEditor').then(m => ({ default: m.SketchEditor })));
const SonicStudio = lazy(() => import('./components/SonicStudio').then(m => ({ default: m.SonicStudio })));
const CharacterLibrary = lazy(() => import('./components/CharacterLibrary').then(m => ({ default: m.CharacterLibrary })));
const CharacterDetailModal = lazy(() => import('./components/CharacterDetailModal').then(m => ({ default: m.CharacterDetailModal })));
const AssistantPanel = lazy(() => import('./components/AssistantPanel').then(m => ({ default: m.AssistantPanel })));
const SmartSequenceDock = lazy(() => import('./components/SmartSequenceDock').then(m => ({ default: m.SmartSequenceDock })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const DebugPanel = lazy(() => import('./components/DebugPanel').then(m => ({ default: m.DebugPanel })));
import {
  Plus, Copy, Trash2, Type, Image as ImageIcon, Video as VideoIcon,
  ScanFace, Brush, MousePointerClick, LayoutTemplate, X, Film, Link, RefreshCw, Upload,
  Minus, FolderHeart, Unplug, Sparkles, ChevronLeft, ChevronRight, Scan, Music, Mic2, Loader2, ScrollText, Clapperboard, User, BookOpen, Languages, HardDrive, CheckCircle2, AlertCircle, Database
} from 'lucide-react';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { NodeLayer } from './components/NodeLayer';
import { ExpandedView } from './components/ExpandedView';
import { ProjectsDashboard } from './components/ProjectsDashboard';
import type { InputAsset } from './components/nodes/types';

// ... (Constants, Helpers, ExpandedView UNCHANGED) ...
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";
const SNAP_THRESHOLD = 8; // Pixels for magnetic snap
const COLLISION_PADDING = 24; // Spacing when nodes bounce off each other
type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'error' | 'local';
type ActiveWorkflowEntityState = {
  projectId: string;
  collections: Required<WorkflowProjectEntityCollections>;
};

function getCanvasGraphBounds(nodes: AppNode[], groups: Group[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  const boxes: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];

  if (groups.length > 0) {
    boxes.push(...groups.map(group => ({
      minX: group.x,
      minY: group.y,
      maxX: group.x + group.width,
      maxY: group.y + group.height,
    })));
  }

  if (nodes.length > 0) {
    boxes.push(...nodes.map(node => {
      const width = node.width ?? 420;
      const height = node.height ?? getApproxNodeHeight(node);

      return {
        minX: node.x,
        minY: node.y,
        maxX: node.x + width,
        maxY: node.y + height,
      };
    }));
  }

  if (boxes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  const minX = Math.min(...boxes.map(box => box.minX));
  const minY = Math.min(...boxes.map(box => box.minY));
  const maxX = Math.max(...boxes.map(box => box.maxX));
  const maxY = Math.max(...boxes.map(box => box.maxY));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function offsetCanvasGraph(
  graph: ReturnType<typeof buildPipelineGraph>,
  offsetX: number,
  offsetY: number,
): ReturnType<typeof buildPipelineGraph> {
  return {
    nodes: graph.nodes.map(node => ({
      ...node,
      x: node.x + offsetX,
      y: node.y + offsetY,
    })),
    connections: graph.connections,
    groups: graph.groups.map(group => ({
      ...group,
      x: group.x + offsetX,
      y: group.y + offsetY,
    })),
  };
}

/**
 * 保存视频到服务器数据库
 * 注意：已禁用 IndexedDB 保存，直接使用 Sora URL 避免卡顿
 * @param videoUrl 视频 URL
 * @param taskId 任务 ID
 * @param taskNumber 任务编号
 * @param soraPrompt Sora 提示词
 * @returns videoId (直接返回 taskId)
 */
async function saveVideoToDatabase(videoUrl: string, taskId: string, taskNumber: number, soraPrompt: string): Promise<string> {
  // 直接返回 taskId，不保存到 IndexedDB 避免阻塞主线程
  return taskId;
}

// Helper to get image dimensions
const getImageDimensions = (src: string): Promise<{ width: number, height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = src;
  });
};

// ExpandedView extracted to ./components/ExpandedView.tsx

export const App = () => {
  const { language, setLanguage, t } = useLanguage();
  const [isRemoteSyncEnabled, setIsRemoteSyncEnabled] = useState(false);
  const [saveIndicatorState, setSaveIndicatorState] = useState<SaveIndicatorState>('idle');
  const [saveIndicatorError, setSaveIndicatorError] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null);
  const [activeWorkflowEntityState, setActiveWorkflowEntityState] = useState<ActiveWorkflowEntityState | null>(null);
  const [isInitializingPipeline, setIsInitializingPipeline] = useState(false);

  // ========== Hooks: 画布状态管理 ==========
  const canvas = useCanvasState();

  // ========== Hooks: 历史记录管理 ==========
  const historyManager = useHistory(50);

  // ========== Zustand Stores ==========
  const {
    currentView, setCurrentView,
    isChatOpen, setIsChatOpen,
    isSketchEditorOpen, setIsSketchEditorOpen,
    isMultiFrameOpen, setIsMultiFrameOpen,
    isSonicStudioOpen, setIsSonicStudioOpen,
    isCharacterLibraryOpen, setIsCharacterLibraryOpen,
    isSettingsOpen, setIsSettingsOpen,
    isApiKeyPromptOpen, setIsApiKeyPromptOpen,
    isDebugOpen, setIsDebugOpen,
    isVideoEditorOpen, setIsVideoEditorOpen,
    viewingCharacter, setViewingCharacter,
    videoEditorSources, setVideoEditorSources,
    expandedMedia, setExpandedMedia,
    contextMenu, setContextMenu,
    contextMenuTarget, setContextMenuTarget,
    storageReconnectNeeded, setStorageReconnectNeeded,
    croppingNodeId, setCroppingNodeId,
    imageToCrop, setImageToCrop,
  } = useUIStore();

  const {
    canvasSnapshots, setCanvasSnapshots,
    assetHistory, setAssetHistory,
    selectedCanvasSnapshotId, setSelectedCanvasSnapshotId,
    isLoaded, setIsLoaded,
    nodes, setNodes,
    connections, setConnections,
    groups, setGroups,
    clipboard, setClipboard,
    selectedNodeIds, setSelectedNodeIds,
    selectedGroupId, setSelectedGroupId,
    draggingNodeId, setDraggingNodeId,
    draggingNodeParentGroupId, setDraggingNodeParentGroupId,
    draggingGroup, setDraggingGroup,
    resizingGroupId, setResizingGroupId,
    activeGroupNodeIds, setActiveGroupNodeIds,
    connectionStart, setConnectionStart,
    selectionRect, setSelectionRect,
    resizingNodeId, setResizingNodeId,
    initialSize, setInitialSize,
    resizeStartPos, setResizeStartPos,
  } = useEditorStore();

  // ========== Hooks: 画布虚拟化（只渲染视口内节点） ==========
  const windowSize = useWindowSize();
  const visibleNodes = useViewportCulling(
    nodes,
    canvas.pan,
    canvas.scale,
    windowSize.width,
    windowSize.height
  );

  // Long press for canvas drag
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressDraggingRef = useRef(false);
  const isSpacePressedRef = useRef(false);

  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  const groupsRef = useRef(groups);
  const connectionStartRef = useRef(connectionStart);

  // AbortController 存储（用于取消视频生成任务）
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // 性能优化：创建轻量级的节点查询函数
  // 避免传递整个nodes数组导致所有节点重渲染
  const nodeQuery = useRef(createNodeQuery(nodesRef));
  const rafRef = useRef<number | null>(null);
  const importAssetInputRef = useRef<HTMLInputElement>(null);
  const replaceVideoInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const replacementTargetRef = useRef<string | null>(null);

  const dragNodeRef = useRef<{
    id: string,
    startX: number,
    startY: number,
    mouseStartX: number,
    mouseStartY: number,
    parentGroupId?: string | null,
    siblingNodeIds: string[],
    nodeWidth: number,
    nodeHeight: number,
    // 多选拖拽支持
    isMultiDrag?: boolean,
    selectedNodeIds?: string[],
    selectedNodesStartPos?: Array<{ id: string, x: number, y: number }>
  } | null>(null);

  const resizeContextRef = useRef<{
    nodeId: string,
    initialWidth: number,
    initialHeight: number,
    startX: number,
    startY: number,
    parentGroupId: string | null,
    siblingNodeIds: string[]
  } | null>(null);

  const selectionRectRef = useRef<any>(null);
  const saveIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedCanvasRef = useRef(false);
  const workflowProjectStateBase = useMemo(() => normalizeWorkflowProjectState(
    activeProject?.workflow_state
      ? { workflowState: activeProject.workflow_state }
      : activeProject?.settings,
  ), [activeProject]);
  const activeWorkflowCollections = activeWorkflowEntityState?.projectId === activeProject?.id
    ? activeWorkflowEntityState.collections
    : null;
  const workflowProjectState = useMemo(
    () => hydrateWorkflowProjectState(workflowProjectStateBase, activeWorkflowCollections),
    [activeWorkflowCollections, workflowProjectStateBase],
  );
  const activeWorkflowEpisode = useMemo(() => {
    if (workflowProjectState.activeEpisodeId) {
      return workflowProjectState.instances.find(instance => instance.id === workflowProjectState.activeEpisodeId) ?? null;
    }

    const firstSeries = getSeriesInstances(workflowProjectState)[0];
    if (!firstSeries) return null;
    return getEpisodeInstances(workflowProjectState, firstSeries.id)[0] ?? null;
  }, [workflowProjectState]);

  const dragGroupRef = useRef<{
    id: string,
    startX: number,
    startY: number,
    mouseStartX: number,
    mouseStartY: number,
    childNodes: { id: string, startX: number, startY: number }[]
  } | null>(null);

  const mergeProjectSettings = useCallback((
    settings: Record<string, unknown> | null | undefined,
    patch?: Record<string, unknown>,
  ): Record<string, unknown> => {
    const baseSettings = settings && typeof settings === 'object' ? { ...settings } : {};
    delete (baseSettings as { workflowState?: unknown }).workflowState;

    return {
      ...baseSettings,
      ...normalizeProjectSettings(settings),
      ...(patch || {}),
    };
  }, []);

  const syncActiveWorkflowCollections = useCallback((
    projectId: string,
    workflowState: WorkflowProjectState | null | undefined,
  ) => {
    setActiveWorkflowEntityState({
      projectId,
      collections: getWorkflowProjectEntityCollections(workflowState),
    });
  }, []);

  const clearSaveIndicatorTimers = useCallback(() => {
    if (saveIndicatorTimerRef.current) {
      clearTimeout(saveIndicatorTimerRef.current);
      saveIndicatorTimerRef.current = null;
    }
    if (localSaveTimerRef.current) {
      clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = null;
    }
  }, []);

  const scheduleIdleSaveIndicator = useCallback((state: Exclude<SaveIndicatorState, 'idle' | 'saving'>, duration: number) => {
    clearSaveIndicatorTimers();
    setSaveIndicatorState(state);
    saveIndicatorTimerRef.current = setTimeout(() => {
      setSaveIndicatorState('idle');
      setSaveIndicatorError(null);
      saveIndicatorTimerRef.current = null;
    }, duration);
  }, [clearSaveIndicatorTimers]);

  const persistProjectSettings = useCallback(async (nextSettings: Record<string, unknown>) => {
    if (!activeProject) return;

    const hasWorkflowStatePatch = typeof nextSettings?.workflowState === 'object' && nextSettings.workflowState !== null;
    const sanitizedSettings = mergeProjectSettings(nextSettings);
    const nextWorkflowState = hasWorkflowStatePatch
      ? normalizeWorkflowProjectState({ workflowState: nextSettings.workflowState })
      : activeProject.workflow_state;

    setActiveProject(previous => previous ? {
      ...previous,
      settings: sanitizedSettings,
      workflow_state: nextWorkflowState,
    } : previous);
    syncActiveWorkflowCollections(activeProject.id, nextWorkflowState);

    try {
      const response = await updateProject(activeProject.id, {
        settings: sanitizedSettings,
        workflow_state: nextWorkflowState,
      });
      if (response.success && response.data) {
        setActiveProject(previous => previous ? {
          ...previous,
          settings: mergeProjectSettings({
            ...sanitizedSettings,
            ...(response.data.settings && typeof response.data.settings === 'object' ? response.data.settings : {}),
          }),
          workflow_state: response.data.workflow_state ?? nextWorkflowState,
        } : previous);
        syncActiveWorkflowCollections(activeProject.id, response.data.workflow_state ?? nextWorkflowState);
      }
    } catch (error) {
      console.warn('[App] Failed to persist project settings', error);
    }
  }, [activeProject, mergeProjectSettings, syncActiveWorkflowCollections]);

  useEffect(() => {
    if (!activeProject?.id) {
      setActiveWorkflowEntityState(null);
      return;
    }

    let cancelled = false;

    const loadWorkflowEntities = async () => {
      const response = await getProjectWorkflowEntities(activeProject.id);
      if (!response.success || !response.data || cancelled) {
        return;
      }

      setActiveWorkflowEntityState({
        projectId: activeProject.id,
        collections: {
          instances: response.data.instances,
          assets: response.data.assets,
          assetVersions: response.data.assetVersions,
          assetBindings: response.data.assetBindings,
          continuityStates: response.data.continuityStates,
        },
      });
    };

    loadWorkflowEntities().catch((error) => {
      if (!cancelled) {
        console.warn('[App] Failed to load workflow entity collections', error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  useEffect(() => {
    nodesRef.current = nodes;
    connectionsRef.current = connections;
    groupsRef.current = groups;
    connectionStartRef.current = connectionStart;
  }, [nodes, connections, groups, connectionStart]);

  useEffect(() => {
    // 版权声明 - 光波开发

    if (window.aistudio) window.aistudio.hasSelectedApiKey().then(hasKey => { if (!hasKey) window.aistudio.openSelectKey(); });

    // Check if Gemini API Key is configured
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('GEMINI_API_KEY');
      if (!apiKey || !apiKey.trim()) {
        // Show a gentle reminder after a short delay
        setTimeout(() => {
          console.info('💡 提示：请在右上角设置按钮中配置您的 Gemini API Key 以使用 AI 功能');
        }, 2000);
      }
    };
    checkApiKey();

    const loadData = async () => {
      try {
        // 初始化同步状态
        const apiOnline = await initSync();
        setOnlineStatus(apiOnline);
        setIsRemoteSyncEnabled(apiOnline);

        const projectsRes = await getProjects();
        let projectId: string | null = null;

        if (projectsRes.success && projectsRes.data && projectsRes.data.length > 0) {
          // 项目列表已存在，保留在 projects 视图
          return;
        } else {
          // 没有项目，创建默认项目并进入
          const createRes = await createProject(`${BRAND_NAME} 项目`, DEFAULT_PROJECT_SETTINGS);
          if (createRes.success && createRes.data) {
            projectId = createRes.data.id;
          }
        }

        if (projectId) {
          handleProjectSelect(projectId);
          return;
        }

        // 如果 API 在线但项目为空，上传本地数据作为初始快照
        if (apiOnline && getSyncProjectId()) {
          const state = useEditorStore.getState();
          if (state.nodes.length > 0) {
            syncFullSnapshot(state.nodes, state.connections, state.groups);
          }
        }
      } catch (e) {
        console.error("Failed to load storage", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();

    // ✅ 检查本地存储配置（仅记录日志，不自动连接）
    const checkStorageConfig = () => {
      try {
        const savedConfig = JSON.parse(localStorage.getItem('fileStorageConfig') || '{}');
        if (savedConfig.enabled && savedConfig.rootPath) {
          // 可以在界面上显示一个提示徽章
          setStorageReconnectNeeded(true);
        }
      } catch (error) {
        console.error('[App] 检查存储配置失败:', error);
      }
    };

    checkStorageConfig();
  }, []);

  useEffect(() => {
    if (currentView !== 'canvas') {
      hasHydratedCanvasRef.current = false;
      clearSaveIndicatorTimers();
      setSaveIndicatorState('idle');
      setSaveIndicatorError(null);
    }
  }, [clearSaveIndicatorTimers, currentView]);

  const handleProjectSelect = async (projectId: string) => {
    setIsLoaded(false);
    setActiveWorkflowEntityState(null);
    hasHydratedCanvasRef.current = false;
    clearSaveIndicatorTimers();
    setSaveIndicatorState('idle');
    setSaveIndicatorError(null);
    try {
      setSyncProjectId(projectId);
      const projectRes = await getProject(projectId);
      if (projectRes.success && projectRes.data) {
        const { nodes: dbNodes, connections: dbConns, groups: dbGroups } = projectRes.data;

        // 从 PostgreSQL 加载成功
        const mappedNodes = (dbNodes || []).map((n: any) => {
          let data = n.data || {};
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { data = {}; }
          }
          return { ...n, data, inputs: n.inputs || [], title: getNodeNameCN(n.type) };
        });

        const mappedConns = (dbConns || []).map((c: any) => ({
          id: c.id,
          from: c.from_node || c.from,
          to: c.to_node || c.to,
        }));

        setNodes(mappedNodes);
        setConnections(mappedConns);
        setGroups(dbGroups || []);
        const normalizedWorkflowState = projectRes.data.workflow_state
          ? normalizeWorkflowProjectState({ workflowState: projectRes.data.workflow_state })
          : normalizeWorkflowProjectState(projectRes.data.settings);
        setActiveProject({
          ...projectRes.data,
          settings: mergeProjectSettings(projectRes.data.settings),
          workflow_state: normalizedWorkflowState,
        });
        syncActiveWorkflowCollections(projectId, normalizedWorkflowState);

        // 仍然加载 assets 和 workflows 从 IndexedDB（这些不在 PostgreSQL 中）
        const sAssets = await loadFromStorage<any[]>('assets'); if (sAssets) setAssetHistory(sAssets);
        const sCanvasSnapshots =
          await loadFromStorage<CanvasSnapshot[]>('canvasSnapshots')
          || await loadFromStorage<CanvasSnapshot[]>('workflows');
        if (sCanvasSnapshots) setCanvasSnapshots(sCanvasSnapshots);

        setCurrentView(resolveProjectEntryView(projectRes.data.settings, mappedNodes.length > 0));
      } else {
        alert('无法加载项目数据');
      }
    } catch (error) {
      console.error('Failed to load project details', error);
      alert('加载项目失败');
    } finally {
      setIsLoaded(true);
    }
  };

  const handleBackToProjects = () => {
    saveHistory(); // Optional: Save state before leaving
    hasHydratedCanvasRef.current = false;
    clearSaveIndicatorTimers();
    setSaveIndicatorState('idle');
    setSaveIndicatorError(null);
    // Clear canvas data
    setNodes([]);
    setConnections([]);
    setGroups([]);
    setActiveProject(null);
    setActiveWorkflowEntityState(null);
    setSyncProjectId(null);
    setCurrentView('projects');
  };

  // 恢复Sora视频生成轮询（刷新页面后）
  // 使用 ref 跟踪已恢复的任务，避免重复恢复
  const restoredTasksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoaded) return;

    const restoreSoraPolling = async () => {

      // 找到所有Sora2节点
      const soraNodes = nodes.filter(n => n.type === NodeType.SORA_VIDEO_GENERATOR);

      for (const node of soraNodes) {
        const taskGroups = node.data.taskGroups || [];
        const generatingTasks = taskGroups.filter((tg: any) =>
          (tg.generationStatus === 'generating' || tg.generationStatus === 'uploading') &&
          tg.soraTaskId &&
          !restoredTasksRef.current.has(tg.soraTaskId) // 只恢复未恢复过的任务
        );

        if (generatingTasks.length === 0) continue;


        try {
          // 导入checkSoraTaskStatus函数
          const { checkSoraTaskStatus, pollSoraTaskUntilComplete } = await import('./services/soraService');

          // 对每个正在生成的任务恢复轮询
          for (const tg of generatingTasks) {
            // 标记为已恢复，防止重复恢复
            restoredTasksRef.current.add(tg.soraTaskId);


            try {
              // 先查询一次当前状态，检查是否应该恢复轮询
              const initialResult = await checkSoraTaskStatus(
                tg.soraTaskId,
                undefined,
                { nodeId: node.id, nodeType: node.type }
              );

              // 检查任务是否已经太旧或处于异常状态
              const now = Math.floor(Date.now() / 1000);
              const taskCreatedAt = initialResult.created_at ? new Date(initialResult.created_at).getTime() / 1000 : now;
              const taskAge = now - taskCreatedAt;

              // 如果任务超过10分钟还在排队或处理中，不再恢复轮询
              if (taskAge > 600 && (initialResult.status === 'queued' || initialResult.status === 'processing')) {
                console.warn(`[恢复轮询] 任务 ${tg.taskNumber} 已经过旧(${Math.floor(taskAge / 60)}分钟)，状态仍为 ${initialResult.status}，停止轮询`);
                // 标记为失败
                setNodes(prevNodes => {
                  return prevNodes.map(n => {
                    if (n.id === node.id) {
                      const updatedTaskGroups = n.data.taskGroups.map((t: any) => {
                        if (t.id === tg.id) {
                          return {
                            ...t,
                            generationStatus: 'failed' as const,
                            error: `任务超时(${Math.floor(taskAge / 60)}分钟，状态: ${initialResult.status})`
                          };
                        }
                        return t;
                      });
                      return { ...n, data: { ...n.data, taskGroups: updatedTaskGroups } };
                    }
                    return n;
                  });
                });
                continue;
              }

              // 如果任务已经失败或完成，直接更新状态
              if (initialResult.status === 'error' || initialResult.status === 'failed' || initialResult.status === 'FAILED') {
                setNodes(prevNodes => {
                  return prevNodes.map(n => {
                    if (n.id === node.id) {
                      const updatedTaskGroups = n.data.taskGroups.map((t: any) => {
                        if (t.id === tg.id) {
                          return { ...t, generationStatus: 'failed' as const, error: '任务失败' };
                        }
                        return t;
                      });
                      return { ...n, data: { ...n.data, taskGroups: updatedTaskGroups } };
                    }
                    return n;
                  });
                });
                continue;
              }

              if (initialResult.status === 'completed' || initialResult.status === 'succeeded' || initialResult.status === 'success') {
                setNodes(prevNodes => {
                  return prevNodes.map(n => {
                    if (n.id === node.id) {
                      const updatedTaskGroups = n.data.taskGroups.map((t: any) => {
                        if (t.id === tg.id) {
                          return { ...t, generationStatus: 'completed' as const, videoUri: initialResult.videoUrl };
                        }
                        return t;
                      });
                      return { ...n, data: { ...n.data, taskGroups: updatedTaskGroups } };
                    }
                    return n;
                  });
                });
                continue;
              }

              // 任务仍在进行中，开始轮询

              // 使用轮询函数持续查询状态
              const result = await pollSoraTaskUntilComplete(
                tg.soraTaskId,
                (progress) => {
                  // 更新进度
                  setNodes(prevNodes => {
                    return prevNodes.map(n => {
                      if (n.id === node.id) {
                        const updatedTaskGroups = n.data.taskGroups.map((t: any) =>
                          t.id === tg.id ? { ...t, progress } : t
                        );
                        return { ...n, data: { ...n.data, taskGroups: updatedTaskGroups } };
                      }
                      return n;
                    });
                  });
                },
                5000, // 5秒轮询间隔
                { nodeId: node.id, nodeType: node.type }
              );

              // 更新最终状态

              setNodes(prevNodes => {
                return prevNodes.map(n => {
                  if (n.id === node.id) {
                    const updatedTaskGroups = n.data.taskGroups.map((t: any) => {
                      if (t.id === tg.id) {
                        if (result.status === 'completed') {
                          return {
                            ...t,
                            generationStatus: 'completed' as const,
                            progress: 100
                          };
                        } else if (result.status === 'error') {
                          const rawError = result.violationReason || result._rawData?.error || result._rawData?.message || '视频生成失败';
                          const errorMessage = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
                          return {
                            ...t,
                            generationStatus: 'failed' as const,
                            error: errorMessage
                          };
                        }
                      }
                      return t;
                    });
                    return { ...n, data: { ...n.data, taskGroups: updatedTaskGroups } };
                  }
                  return n;
                });
              });
            } catch (error) {
              console.error(`[恢复轮询] 任务组 ${tg.taskNumber} 轮询失败:`, error);
              // 标记为失败
              setNodes(prevNodes => {
                return prevNodes.map(n => {
                  if (n.id === node.id) {
                    const updatedTaskGroups = n.data.taskGroups.map((t: any) => {
                      if (t.id === tg.id) {
                        return {
                          ...t,
                          generationStatus: 'failed' as const,
                          error: '轮询失败: ' + (error as any).message
                        };
                      }
                      return t;
                    });
                    return { ...n, data: { ...n.data, taskGroups: updatedTaskGroups } };
                  }
                  return n;
                });
              });
            }
          }
        } catch (error) {
          console.error(`[恢复轮询] 恢复轮询失败:`, error);
        }
      }
    };

    // 延迟执行，确保节点完全加载
    const timeoutId = setTimeout(restoreSoraPolling, 1000);

    return () => clearTimeout(timeoutId);
  }, [isLoaded]); // 移除 nodes 依赖，避免循环触发

  useEffect(() => {
    if (!isLoaded) return;
    saveToStorage('assets', assetHistory);
    saveToStorage('canvasSnapshots', canvasSnapshots);
    saveToStorage('workflows', canvasSnapshots);

    const projectId = getSyncProjectId();
    if (projectId) {
      saveToStorage(`nodes_${projectId}`, nodes);
      saveToStorage(`connections_${projectId}`, connections);
      saveToStorage(`groups_${projectId}`, groups);
    }
  }, [assetHistory, canvasSnapshots, nodes, connections, groups, isLoaded]);

  // PostgreSQL 自动同步：订阅 store 变更
  useEffect(() => {
    if (!isLoaded) return;
    const unsubscribe = createStoreSubscription(useEditorStore);
    return () => unsubscribe();
  }, [isLoaded]);

  useEffect(() => {
    const unsubscribe = subscribeToSyncStatus((event) => {
      if (currentView !== 'canvas') return;

      if (event.state === 'saving') {
        clearSaveIndicatorTimers();
        setSaveIndicatorState('saving');
        setSaveIndicatorError(null);
        return;
      }

      if (event.state === 'saved') {
        setSaveIndicatorError(null);
        scheduleIdleSaveIndicator('saved', 1800);
        return;
      }

      setSaveIndicatorError(event.detail || null);
      scheduleIdleSaveIndicator('error', 5000);
    });

    return () => unsubscribe();
  }, [clearSaveIndicatorTimers, currentView, scheduleIdleSaveIndicator]);

  useEffect(() => {
    if (!isLoaded || currentView !== 'canvas') return;

    if (!hasHydratedCanvasRef.current) {
      hasHydratedCanvasRef.current = true;
      return;
    }

    if (isRemoteSyncEnabled) return;

    clearSaveIndicatorTimers();
    setSaveIndicatorState('saving');
    setSaveIndicatorError(null);
    localSaveTimerRef.current = setTimeout(() => {
      localSaveTimerRef.current = null;
      scheduleIdleSaveIndicator('local', 1600);
    }, 250);
  }, [
    clearSaveIndicatorTimers,
    connections,
    currentView,
    groups,
    isLoaded,
    isRemoteSyncEnabled,
    nodes,
    scheduleIdleSaveIndicator,
  ]);

  const getNodeNameCN = (type: string) => {
    switch (type) {
      case NodeType.PROMPT_INPUT: return t.nodes.promptInput;
      case NodeType.VIDEO_GENERATOR: return t.nodes.videoGenerator;
      case NodeType.AUDIO_GENERATOR: return t.nodes.audioGenerator;
      case NodeType.VIDEO_ANALYZER: return t.nodes.videoAnalyzer;
      case NodeType.IMAGE_EDITOR: return t.nodes.imageEditor;
      case NodeType.SCRIPT_PLANNER: return t.nodes.scriptPlanner;
      case NodeType.SCRIPT_EPISODE: return t.nodes.scriptEpisode;
      case NodeType.STORYBOARD_GENERATOR: return t.nodes.storyboardGenerator;
      case NodeType.STORYBOARD_IMAGE: return '分镜图设计';
      case NodeType.STORYBOARD_SPLITTER: return '分镜图拆解';
      case NodeType.SORA_VIDEO_GENERATOR: return 'Sora 2 视频';
      case NodeType.SORA_VIDEO_CHILD: return 'Sora 2 视频结果';
      case NodeType.CHARACTER_NODE: return t.nodes.characterNode;
      case NodeType.DRAMA_ANALYZER: return '剧目分析';
      case NodeType.DRAMA_REFINED: return '剧目精炼';
      case NodeType.STYLE_PRESET: return '全局风格';
      default: return type;
    }
  };

  // Global error handler for API calls
  const handleApiError = useCallback((error: any, nodeId?: string) => {
    const errorMessage = error?.message || String(error);

    // Check if error is due to missing API Key
    if (errorMessage.includes('GEMINI_API_KEY_NOT_CONFIGURED')) {
      // Open API Key prompt dialog
      setIsApiKeyPromptOpen(true);

      // Update node status if nodeId is provided
      if (nodeId) {
        setNodes(prev => prev.map(n =>
          n.id === nodeId
            ? {
              ...n,
              status: NodeStatus.ERROR,
              data: { ...n.data, error: '请先配置 Gemini API Key' }
            }
            : n
        ));
      }

      return '请先配置 Gemini API Key';
    }

    return errorMessage;
  }, []);

  // Handle API Key save from prompt
  const handleApiKeySave = useCallback((apiKey: string) => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    setIsApiKeyPromptOpen(false);
    console.info('✅ Gemini API Key 已保存成功！');
  }, []);

  const handleFitView = useCallback(() => {
    if (nodes.length === 0) {
      canvas.resetCanvas();
      return;
    }
    const padding = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const h = n.height || getApproxNodeHeight(n);
      const w = n.width || 420;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + w > maxX) maxX = n.x + w;
      if (n.y + h > maxY) maxY = n.y + h;
    });
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const scaleX = (window.innerWidth - padding * 2) / contentW;
    const scaleY = (window.innerHeight - padding * 2) / contentH;
    let newScale = Math.min(scaleX, scaleY, 1);
    newScale = Math.max(0.2, newScale);
    const contentCenterX = minX + contentW / 2;
    const contentCenterY = minY + contentH / 2;
    const newPanX = (window.innerWidth / 2) - (contentCenterX * newScale);
    const newPanY = (window.innerHeight / 2) - (contentCenterY * newScale);
    canvas.setPan({ x: newPanX, y: newPanY });
    canvas.setScale(newScale);
  }, [nodes, canvas]);

  const saveHistory = useCallback(() => {
    try {
      historyManager.saveToHistory(
        nodesRef.current,
        connectionsRef.current,
        groupsRef.current
      );
    } catch (e) {
      console.warn("History save failed:", e);
    }
  }, [historyManager]);

  const handleOpenPipeline = useCallback(() => {
    setCurrentView('pipeline');
  }, [setCurrentView]);

  const handleSelectPipelineTemplate = useCallback(async (templateId: PipelineTemplateId) => {
    if (!activeProject) return;

    const nextSettings = mergeProjectSettings(activeProject.settings, {
      editorMode: 'pipeline' as const,
      pipelineTemplateId: templateId,
    });

    setActiveProject(prev => prev ? { ...prev, settings: nextSettings } : prev);

    try {
      const response = await updateProject(activeProject.id, { settings: nextSettings });
      if (response.success && response.data) {
        setActiveProject(prev => prev ? { ...prev, settings: mergeProjectSettings(response.data.settings) } : prev);
      }
    } catch (error) {
      console.warn('[App] Failed to update pipeline template', error);
    }
  }, [activeProject, mergeProjectSettings]);

  const handleInitializePipeline = useCallback(async () => {
    if (!activeProject || isInitializingPipeline) return;
    if (nodes.length > 0) return;

    setIsInitializingPipeline(true);
    try {
      saveHistory();
      const settings = normalizeProjectSettings(activeProject.settings);
      const graph = buildPipelineGraph(settings.pipelineTemplateId);
      setNodes(graph.nodes);
      setConnections(graph.connections);
      setGroups(graph.groups);
      setSelectedNodeIds([]);
      setSelectedCanvasSnapshotId(null);
      setSelectedGroupId(null);
    } finally {
      setIsInitializingPipeline(false);
    }
  }, [
    activeProject,
    isInitializingPipeline,
    nodes.length,
    saveHistory,
    setConnections,
    setGroups,
    setNodes,
    setSelectedGroupId,
    setSelectedNodeIds,
    setSelectedCanvasSnapshotId,
  ]);

  const handleAddWorkflowTemplateToCanvas = useCallback((templateId: PipelineTemplateId) => {
    saveHistory();

    const graph = buildPipelineGraph(templateId);
    const graphBounds = getCanvasGraphBounds(graph.nodes, graph.groups);
    const existingBounds = getCanvasGraphBounds(nodes, groups);
    const viewportCenterX = (-canvas.pan.x + window.innerWidth / 2) / canvas.scale;
    const viewportCenterY = (-canvas.pan.y + window.innerHeight / 2) / canvas.scale;
    const hasCanvasContent = nodes.length > 0 || groups.length > 0;

    const desiredMinX = hasCanvasContent
      ? Math.max(viewportCenterX - graphBounds.width / 2, existingBounds.minX)
      : viewportCenterX - graphBounds.width / 2;
    const desiredMinY = hasCanvasContent
      ? existingBounds.maxY + 180
      : viewportCenterY - graphBounds.height / 2;

    const placedGraph = offsetCanvasGraph(
      graph,
      desiredMinX - graphBounds.minX,
      desiredMinY - graphBounds.minY,
    );

    setNodes(previous => [...previous, ...placedGraph.nodes]);
    setConnections(previous => [...previous, ...placedGraph.connections]);
    setGroups(previous => [...previous, ...placedGraph.groups]);
    setSelectedNodeIds([]);
    setSelectedCanvasSnapshotId(null);
    setSelectedGroupId(null);
    setCurrentView('canvas');
  }, [
    canvas.pan.x,
    canvas.pan.y,
    canvas.scale,
    groups,
    nodes,
    saveHistory,
    setConnections,
    setCurrentView,
    setGroups,
    setNodes,
    setSelectedCanvasSnapshotId,
    setSelectedGroupId,
    setSelectedNodeIds,
  ]);

  const handleCreateWorkflow = useCallback(async (templateId: WorkflowTemplateId) => {
    if (!activeProject) return;

    const template = WORKFLOW_TEMPLATES.find(item => item.id === templateId);
    if (!template) return;

    const workflowInstance = createWorkflowInstance(
      templateId,
      template.scope === 'series' ? `${activeProject.title} · ${template.name}` : template.name,
    );

    const nextWorkflowState: WorkflowProjectState = {
      ...workflowProjectState,
      instances: [workflowInstance, ...workflowProjectState.instances],
      activeSeriesId: workflowInstance.scope === 'series' ? workflowInstance.id : workflowProjectState.activeSeriesId,
      activeEpisodeId: workflowInstance.scope === 'episode' ? workflowInstance.id : workflowProjectState.activeEpisodeId,
    };

    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleAddEpisodeWorkflow = useCallback(async (seriesInstanceId: string) => {
    if (!activeProject) return;

    const next = appendEpisodeInstanceToSeries(workflowProjectState, seriesInstanceId);
    if (!next.episode) return;

    const nextWorkflowState: WorkflowProjectState = {
      ...next.state,
      activeSeriesId: seriesInstanceId,
      activeEpisodeId: next.episode.id,
    };

    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleBulkAddEpisodesWorkflow = useCallback(async (seriesInstanceId: string, count: number) => {
    if (!activeProject) return;

    const next = appendEpisodeInstancesToSeries(workflowProjectState, seriesInstanceId, count);
    const nextEpisodes = next.episodes;
    if (nextEpisodes.length === 0) return;

    const activeEpisode = workflowProjectState.activeEpisodeId
      ? workflowProjectState.instances.find(instance => instance.id === workflowProjectState.activeEpisodeId)
      : null;
    const shouldPreserveActiveEpisode = activeEpisode?.parentInstanceId === seriesInstanceId;

    const nextWorkflowState: WorkflowProjectState = {
      ...next.state,
      activeSeriesId: seriesInstanceId,
      activeEpisodeId: shouldPreserveActiveEpisode ? workflowProjectState.activeEpisodeId : nextEpisodes[0].id,
    };

    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleFocusSeriesWorkflow = useCallback(async (seriesInstanceId: string) => {
    if (!activeProject) return;

    const nextWorkflowState = setActiveSeries(workflowProjectState, seriesInstanceId);
    if (nextWorkflowState === workflowProjectState) return;

    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleUpdateSeriesWorkflowSettings = useCallback(async (
    seriesInstanceId: string,
    patch: {
      plannedEpisodeCount?: number;
      preferredBindingMode?: WorkflowBindingMode;
    },
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = updateSeriesWorkflowSettings(workflowProjectState, seriesInstanceId, patch);
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleMaterializeWorkflow = useCallback((workflowInstanceId: string) => {
    const workflowInstance = workflowProjectState.instances.find(instance => instance.id === workflowInstanceId);
    if (!workflowInstance) return;

    const templateId = workflowInstance.metadata?.canvasMaterializationTemplateId as PipelineTemplateId | undefined;
    if (!templateId) {
      setCurrentView('canvas');
      return;
    }

    handleAddWorkflowTemplateToCanvas(templateId);
  }, [
    handleAddWorkflowTemplateToCanvas,
    setCurrentView,
    workflowProjectState.instances,
  ]);

  const handleSelectEpisodeWorkflow = useCallback(async (episodeId: string) => {
    if (!activeProject) return;

    const nextWorkflowState = setActiveEpisode(workflowProjectState, episodeId);
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleOpenEpisodeWorkspace = useCallback(async (episodeId: string) => {
    await handleSelectEpisodeWorkflow(episodeId);
    setCurrentView('workspace');
  }, [handleSelectEpisodeWorkflow, setCurrentView]);

  const syncLocalGenerationJobBinding = useCallback((
    nodeId: string,
    metadata: Record<string, unknown>,
    generationJobId: string,
  ) => {
    const source = typeof metadata.source === 'string' ? metadata.source : null;
    if (!source) return;

    if (source === 'sora-task-group') {
      const taskGroupIndex = typeof metadata.taskGroupIndex === 'number'
        ? metadata.taskGroupIndex
        : (typeof metadata.taskGroupIndex === 'string' ? Number.parseInt(metadata.taskGroupIndex, 10) : NaN);

      if (!Number.isInteger(taskGroupIndex)) {
        return;
      }

      const node = nodesRef.current.find(candidate => candidate.id === nodeId);
      const taskGroups = Array.isArray(node?.data?.taskGroups) ? [...node.data.taskGroups] : null;
      if (!taskGroups?.[taskGroupIndex]) {
        return;
      }

      taskGroups[taskGroupIndex] = {
        ...taskGroups[taskGroupIndex],
        generationJobId,
      };
      nodesRef.current = nodesRef.current.map(candidate => (
        candidate.id === nodeId
          ? { ...candidate, data: { ...candidate.data, taskGroups } }
          : candidate
      ));
      handleNodeUpdate(nodeId, { taskGroups });
      return;
    }

    if (
      source === 'storyboard-video-generator'
      || source === 'video-generator'
      || source === 'jimeng-video-generator'
    ) {
      nodesRef.current = nodesRef.current.map(candidate => (
        candidate.id === nodeId
          ? { ...candidate, data: { ...candidate.data, generationJobId } }
          : candidate
      ));
      handleNodeUpdate(nodeId, { generationJobId });
    }
  }, [handleNodeUpdate, nodesRef]);

  const handleGenerationJobAction = useCallback(async (
    job: GenerationJob,
    action: 'cancel' | 'requeue' | 'retry',
  ): Promise<{ success: boolean; error?: string }> => {
    const metadata = job.metadata && typeof job.metadata === 'object'
      ? job.metadata as Record<string, unknown>
      : {};

    const nodeId = typeof metadata.nodeId === 'string' ? metadata.nodeId : null;
    const triggerAction = typeof metadata.triggerAction === 'string' ? metadata.triggerAction : null;
    const cancelAction = typeof metadata.cancelAction === 'string' ? metadata.cancelAction : null;

    try {
      if (nodeId && action === 'cancel' && cancelAction) {
        await handleNodeAction(nodeId, cancelAction);
        const cancelResponse = await cancelGenerationJob(job.id);
        return cancelResponse.success
          ? { success: true }
          : { success: false, error: cancelResponse.error ?? '取消任务失败' };
      }

      if (nodeId && triggerAction && (action === 'retry' || action === 'requeue')) {
        const response = action === 'retry'
          ? await retryGenerationJob(job.id)
          : await requeueGenerationJob(job.id);

        if (!response.success || !response.data) {
          return {
            success: false,
            error: response.error ?? '任务操作失败',
          };
        }

        syncLocalGenerationJobBinding(nodeId, metadata, response.data.id);
        await handleNodeAction(nodeId, triggerAction);
        return { success: true };
      }

      const response = action === 'cancel'
        ? await cancelGenerationJob(job.id)
        : action === 'requeue'
          ? await requeueGenerationJob(job.id)
          : await retryGenerationJob(job.id);

      return response.success
        ? { success: true }
        : { success: false, error: response.error ?? '任务操作失败' };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || '任务操作失败',
      };
    }
  }, [handleNodeAction, syncLocalGenerationJobBinding]);

  const handleCreateWorkflowAsset = useCallback(async (
    type: WorkflowAssetType,
    name: string,
    tags: string[],
    options?: {
      seriesInstanceId?: string;
      autoApplySuggestedTemplates?: boolean;
    },
  ) => {
    if (!activeProject) return;

    const next = appendWorkflowAssetAndApplySuggestedTemplates(
      workflowProjectState,
      activeProject.id,
      options?.seriesInstanceId,
      type,
      name,
      tags,
      options?.autoApplySuggestedTemplates ?? false,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      next.state,
    );

    await persistProjectSettings(nextSettings);
    return {
      assetId: next.asset.id,
      assetName: next.asset.name,
      appliedTemplateNames: next.appliedTargets.map(target => target.name),
      suggestedTargets: next.suggestedTargets,
    };
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleCreateWorkflowAssetVersion = useCallback(async (
    assetId: string,
    notes?: string,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = appendWorkflowAssetVersion(workflowProjectState, assetId, notes);
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleBindEpisodeAsset = useCallback(async (
    episodeId: string,
    assetId: string,
    mode: WorkflowBindingMode,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = bindAssetToEpisode(workflowProjectState, episodeId, assetId, mode);
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleSyncAssetCoverage = useCallback(async (
    assetId: string,
    scopedEpisodeIds: string[],
    desiredEpisodeIds: string[],
    mode: WorkflowBindingMode,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = syncAssetBindingsForEpisodes(
      workflowProjectState,
      assetId,
      scopedEpisodeIds,
      desiredEpisodeIds,
      mode,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleBatchSyncAssetCoverage = useCallback(async (
    assetIds: string[],
    scopedEpisodeIds: string[],
    desiredEpisodeIds: string[],
    mode: WorkflowBindingMode,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = syncMultipleAssetBindingsForEpisodes(
      workflowProjectState,
      assetIds,
      scopedEpisodeIds,
      desiredEpisodeIds,
      mode,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleSaveSeriesAssetBatchTemplate = useCallback(async (
    seriesInstanceId: string,
    name: string,
    assetIds: string[],
    templateId?: string,
    autoApplyToNewEpisodes?: boolean,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = upsertSeriesAssetBatchTemplate(
      workflowProjectState,
      seriesInstanceId,
      {
        id: templateId,
        name,
        assetIds,
        autoApplyToNewEpisodes,
      },
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleSaveSeriesAssetBatchTemplates = useCallback(async (
    seriesInstanceId: string,
    templates: Array<{
      id?: string;
      name: string;
      assetIds: string[];
      autoApplyToNewEpisodes?: boolean;
    }>,
  ) => {
    if (!activeProject || templates.length === 0) return;

    const nextWorkflowState = upsertSeriesAssetBatchTemplates(
      workflowProjectState,
      seriesInstanceId,
      templates,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleDeleteSeriesAssetBatchTemplate = useCallback(async (
    seriesInstanceId: string,
    templateId: string,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = removeSeriesAssetBatchTemplate(
      workflowProjectState,
      seriesInstanceId,
      templateId,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleUnbindEpisodeAsset = useCallback(async (bindingId: string) => {
    if (!activeProject) return;

    const nextWorkflowState = unbindAssetFromEpisode(workflowProjectState, bindingId);
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleUpdateContinuityState = useCallback(async (
    workflowInstanceId: string,
    subjectType: ContinuityState['subjectType'],
    subjectId: string,
    patch: Record<string, unknown>,
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = upsertContinuityState(
      workflowProjectState,
      workflowInstanceId,
      subjectType,
      subjectId,
      patch,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleUpdateWorkflowStage = useCallback(async (
    workflowInstanceId: string,
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => {
    if (!activeProject) return;

    const nextWorkflowState = updateWorkflowStageState(workflowProjectState, workflowInstanceId, stageId, patch);
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  const handleBatchUpdateWorkflowStages = useCallback(async (
    workflowInstanceIds: string[],
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => {
    if (!activeProject || workflowInstanceIds.length === 0) return;

    const nextWorkflowState = batchUpdateWorkflowStageStates(
      workflowProjectState,
      workflowInstanceIds,
      stageId,
      patch,
    );
    const nextSettings = withWorkflowProjectState(
      mergeProjectSettings(activeProject.settings, { editorMode: 'pipeline' }),
      nextWorkflowState,
    );

    await persistProjectSettings(nextSettings);
  }, [activeProject, mergeProjectSettings, persistProjectSettings, workflowProjectState]);

  // 防抖版本的历史保存（1秒内多次调用只保存一次）
  const debouncedSaveHistoryRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSaveHistory = useCallback(() => {
    if (debouncedSaveHistoryRef.current) {
      clearTimeout(debouncedSaveHistoryRef.current);
    }
    debouncedSaveHistoryRef.current = setTimeout(() => {
      saveHistory();
      debouncedSaveHistoryRef.current = null;
    }, 1000); // 1秒防抖
  }, [saveHistory]);

  // 组件卸载时保存待处理的历史
  useEffect(() => {
    return () => {
      if (debouncedSaveHistoryRef.current) {
        clearTimeout(debouncedSaveHistoryRef.current);
        saveHistory();
      }
    };
  }, [saveHistory]);

  const undo = useCallback(() => {
    const prevState = historyManager.undo();
    if (prevState) {
      setNodes(prevState.nodes);
      setConnections(prevState.connections);
      setGroups(prevState.groups);
    }
  }, [historyManager]);

  const deleteNodes = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    saveHistory();
    setNodes(p => p.filter(n => !ids.includes(n.id)).map(n => ({ ...n, inputs: n.inputs.filter(i => !ids.includes(i)) })));
    setConnections(p => p.filter(c => !ids.includes(c.from) && !ids.includes(c.to)));
    setSelectedNodeIds([]);
  }, [saveHistory]);

  const addNode = useCallback((type: NodeType, x?: number, y?: number, initialData?: any) => {
    if (type === NodeType.IMAGE_EDITOR) {
      setIsSketchEditorOpen(true);
      return;
    }
    try { saveHistory(); } catch (e) { }

    // 根据节点类型选择合适的默认模型
    const getDefaultModel = () => {
      switch (type) {
        // 视频生成节点
        case NodeType.VIDEO_GENERATOR:
          return getUserDefaultModel('video');

        // 图片生成节点
        case NodeType.STORYBOARD_IMAGE:
          return getUserDefaultModel('image');

        // 音频生成节点
        case NodeType.AUDIO_GENERATOR:
          return getUserDefaultModel('audio');

        // 文本处理节点（分析、剧本等）
        case NodeType.VIDEO_ANALYZER:
        case NodeType.SCRIPT_PLANNER:
        case NodeType.SCRIPT_EPISODE:
        case NodeType.STORYBOARD_GENERATOR:
        case NodeType.CHARACTER_NODE:
        case NodeType.DRAMA_ANALYZER:
        case NodeType.STYLE_PRESET:
          return getUserDefaultModel('text');

        // 其他节点根据是否包含 IMAGE 判断
        default:
          return type.includes('IMAGE') ? getUserDefaultModel('image') : getUserDefaultModel('text');
      }
    };

    const defaults: any = {
      model: getDefaultModel(),
      generationMode: type === NodeType.VIDEO_GENERATOR ? 'DEFAULT' : undefined,
      scriptEpisodes: type === NodeType.SCRIPT_PLANNER ? 10 : undefined,
      scriptDuration: type === NodeType.SCRIPT_PLANNER ? 1 : undefined,
      scriptVisualStyle: type === NodeType.SCRIPT_PLANNER ? 'REAL' : undefined,
      episodeSplitCount: type === NodeType.SCRIPT_EPISODE ? 3 : undefined,
      storyboardCount: type === NodeType.STORYBOARD_GENERATOR ? 6 : undefined,
      storyboardDuration: type === NodeType.STORYBOARD_GENERATOR ? 4 : undefined,
      storyboardStyle: type === NodeType.STORYBOARD_GENERATOR ? 'REAL' : undefined,
      ...initialData
    };

    const safeX = x !== undefined ? x : (-canvas.pan.x + window.innerWidth / 2) / canvas.scale - 210;
    const safeY = y !== undefined ? y : (-canvas.pan.y + window.innerHeight / 2) / canvas.scale - 180;

    const newNode: AppNode = {
      id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      x: isNaN(safeX) ? 100 : safeX,
      y: isNaN(safeY) ? 100 : safeY,
      width: 420,
      title: getNodeNameCN(type),
      status: NodeStatus.IDLE,
      data: defaults,
      inputs: []
    };
    setNodes(prev => [...prev, newNode]);
  }, [canvas, saveHistory]);

  const handleAssetGenerated = useCallback((type: 'image' | 'video' | 'audio', src: string, title: string) => {
    setAssetHistory(h => {
      const exists = h.find(a => a.src === src);
      if (exists) return h;
      return [{ id: `a-${Date.now()}`, type, src, title, timestamp: Date.now() }, ...h];
    });
  }, []);

  const importFilesToCanvas = useCallback((files: File[], baseX?: number, baseY?: number) => {
    const validFiles = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));

    if (validFiles.length === 0) {
      return;
    }

    const columns = 3;
    const gap = 40;
    const cardWidth = 420;
    const cardHeight = 450;
    const startX = baseX ?? ((-canvas.pan.x + window.innerWidth / 2) / canvas.scale - 210);
    const startY = baseY ?? ((-canvas.pan.y + window.innerHeight / 2) / canvas.scale - 180);

    validFiles.forEach((file, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const xPos = startX + (column * (cardWidth + gap));
      const yPos = startY + (row * cardHeight);
      const reader = new FileReader();

      reader.onload = (event) => {
        const result = event.target?.result as string;

        if (file.type.startsWith('image/')) {
          addNode(NodeType.IMAGE_GENERATOR, xPos, yPos, {
            image: result,
            prompt: file.name,
            status: NodeStatus.SUCCESS,
          });
          return;
        }

        if (file.type.startsWith('video/')) {
          addNode(NodeType.VIDEO_GENERATOR, xPos, yPos, {
            videoUri: result,
            prompt: file.name,
            status: NodeStatus.SUCCESS,
          });
        }
      };

      reader.readAsDataURL(file);
    });
  }, [addNode, canvas.pan.x, canvas.pan.y, canvas.scale]);

  const openAssetUploadPicker = useCallback(() => {
    importAssetInputRef.current?.click();
  }, []);

  const handleAssetImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];

    if (files.length > 0) {
      importFilesToCanvas(files);
    }

    event.target.value = '';
  }, [importFilesToCanvas]);

  const handleSketchResult = (type: 'image' | 'video', result: string, prompt: string) => {
    const centerX = (-canvas.pan.x + window.innerWidth / 2) / canvas.scale - 210;
    const centerY = (-canvas.pan.y + window.innerHeight / 2) / canvas.scale - 180;
    if (type === 'image') {
      // IMAGE_GENERATOR removed - images can be added as assets
      handleAssetGenerated(type, result, prompt || 'Sketch Output');
    } else {
      addNode(NodeType.VIDEO_GENERATOR, centerX, centerY, { videoUri: result, prompt, status: NodeStatus.SUCCESS });
    }
    handleAssetGenerated(type, result, prompt || 'Sketch Output');
  };

  const saveIndicatorMeta = (() => {
    if (saveIndicatorState === 'saving') {
      return {
        label: language === 'zh' ? (isRemoteSyncEnabled ? '正在同步到数据库…' : '正在保存到本地…') : (isRemoteSyncEnabled ? 'Syncing to database…' : 'Saving locally…'),
        icon: Loader2,
        iconClassName: 'animate-spin',
        className: isRemoteSyncEnabled
          ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200'
          : 'bg-white/10 border-white/15 text-slate-200',
        title: language === 'zh' ? '当前更改正在保存' : 'Changes are being saved',
      };
    }

    if (saveIndicatorState === 'saved') {
      return {
        label: language === 'zh' ? '已同步到数据库' : 'Synced to database',
        icon: CheckCircle2,
        iconClassName: '',
        className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
        title: language === 'zh' ? '项目更改已写入数据库' : 'Changes have been written to the database',
      };
    }

    if (saveIndicatorState === 'local') {
      return {
        label: language === 'zh' ? '已保存到本地' : 'Saved locally',
        icon: HardDrive,
        iconClassName: '',
        className: 'bg-white/10 border-white/15 text-slate-200',
        title: language === 'zh' ? '当前处于本地自动保存模式' : 'Local autosave mode is active',
      };
    }

    if (saveIndicatorState === 'error') {
      return {
        label: language === 'zh' ? '同步失败，已保留本地编辑' : 'Sync failed, local edits preserved',
        icon: AlertCircle,
        iconClassName: '',
        className: 'bg-rose-500/15 border-rose-500/30 text-rose-200',
        title: saveIndicatorError || (language === 'zh' ? '数据库同步失败，请稍后重试' : 'Database sync failed, please try again later'),
      };
    }

    if (isRemoteSyncEnabled) {
      return {
        label: language === 'zh' ? '数据库已连接' : 'Database connected',
        icon: Database,
        iconClassName: '',
        className: 'bg-white/10 border-white/15 text-slate-200',
        title: language === 'zh' ? '当前项目会自动同步到数据库' : 'Project changes will sync to the database automatically',
      };
    }

    return {
      label: language === 'zh' ? '本地自动保存' : 'Local autosave',
      icon: HardDrive,
      iconClassName: '',
      className: 'bg-white/10 border-white/15 text-slate-200',
      title: language === 'zh' ? '当前项目保存在本地浏览器/文件存储中' : 'Project changes are saved locally in the browser/file storage',
    };
  })();

  const handleMultiFrameGenerate = async (frames: SmartSequenceItem[]): Promise<string> => {
    const { compileMultiFramePrompt, generateVideo } = await import('./services/geminiService');
    const complexPrompt = compileMultiFramePrompt(frames as any[]);
    try {
      const res = await generateVideo(
        complexPrompt,
        'veo-3.1-generate-preview',
        { aspectRatio: '16:9', count: 1 },
        frames[0].src,
        null,
        frames.length > 1 ? frames.map(f => f.src) : undefined
      );
      if (res.isFallbackImage) {
        handleAssetGenerated('image', res.uri, 'Smart Sequence Preview (Fallback)');
      } else {
        handleAssetGenerated('video', res.uri, 'Smart Sequence');
      }
      return res.uri;
    } catch (e: any) {
      throw new Error(e.message || "Smart Sequence Generation Failed");
    }
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    // 检查事件目标是否在节点内
    const target = e.target as HTMLElement;
    const nodeElement = target.closest('[data-node-container]');
    if (nodeElement) {
      // 事件发生在节点内，不移动画布
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      canvas.zoomCanvas(delta, x, y);
    } else {
      canvas.setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, [canvas]);

  // 手动添加非被动的 wheel 事件监听器（避免 preventDefault 警告）
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const handleWheelEvent = (e: WheelEvent) => {
      handleWheel(e);
    };

    // 添加非被动的监听器
    element.addEventListener('wheel', handleWheelEvent, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheelEvent);
    };
  }, [handleWheel]);

  const handleCanvasMouseDownCapture = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && isSpacePressedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      // Clear selection if any
      setSelectedNodeIds([]);
      canvas.startCanvasDrag(e.clientX, e.clientY);
    }
  }, [canvas, setSelectedNodeIds]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);
    setSelectedGroupId(null);

    // Middle click or Shift+Left click or Space+Left click for immediate drag
    if (e.button === 1 || (e.button === 0 && (e.shiftKey || isSpacePressedRef.current))) {
      canvas.startCanvasDrag(e.clientX, e.clientY);
      return;
    }

    // Left click on canvas
    if (e.button === 0 && !e.shiftKey) {
      if (e.detail > 1) { e.preventDefault(); return; }

      // Clear selection
      setSelectedNodeIds([]);

      // Start selection rect
      const rect = { startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY };
      setSelectionRect(rect);
      selectionRectRef.current = rect;

      // Setup long press detection (300ms)
      longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
      isLongPressDraggingRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        // Long press detected - start canvas drag
        if (longPressStartPosRef.current) {
          isLongPressDraggingRef.current = true;
          setSelectionRect(null); // Cancel selection rect
          selectionRectRef.current = null;
          canvas.startCanvasDrag(longPressStartPosRef.current.x, longPressStartPosRef.current.y);
        }
      }, 300);
    }
  }, [contextMenu, canvas]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const { clientX, clientY } = e;

    // Cancel long press if mouse moves more than 5px
    if (longPressTimerRef.current && longPressStartPosRef.current && !isLongPressDraggingRef.current) {
      const dx = clientX - longPressStartPosRef.current.x;
      const dy = clientY - longPressStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        // Mouse moved too much, cancel long press and allow selection rect
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressStartPosRef.current = null;
      }
    }

    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      canvas.updateMousePos(clientX, clientY);

      // Only commit mousePos to state when actively creating a connection
      // (ConnectionLayer needs mousePos as a prop to render the dragging line)
      if (connectionStartRef.current) {
        canvas.commitMousePos();
      }

      if (selectionRectRef.current) {
        const updated = { ...selectionRectRef.current, currentX: clientX, currentY: clientY };
        selectionRectRef.current = updated;
        setSelectionRect(updated);
        return;
      }

      if (dragGroupRef.current) {
        const { id, startX, startY, mouseStartX, mouseStartY, childNodes } = dragGroupRef.current;
        const dx = (clientX - mouseStartX) / canvas.scale;
        const dy = (clientY - mouseStartY) / canvas.scale;
        setGroups(prev => prev.map(g => g.id === id ? { ...g, x: startX + dx, y: startY + dy } : g));
        if (childNodes.length > 0) {
          setNodes(prev => prev.map(n => {
            const child = childNodes.find(c => c.id === n.id);
            return child ? { ...n, x: child.startX + dx, y: child.startY + dy } : n;
          }));
        }
        return;
      }

      if (canvas.isDraggingCanvas) {
        canvas.dragCanvas(clientX, clientY);
      }

      if (draggingNodeId && dragNodeRef.current && dragNodeRef.current.id === draggingNodeId) {
        const { startX, startY, mouseStartX, mouseStartY, nodeWidth, nodeHeight, isMultiDrag, selectedNodeIds, selectedNodesStartPos } = dragNodeRef.current;
        let dx = (clientX - mouseStartX) / canvas.scale;
        let dy = (clientY - mouseStartY) / canvas.scale;
        let proposedX = startX + dx;
        let proposedY = startY + dy;

        // 磁吸对齐（只对主拖拽节点进行）
        const SNAP = SNAP_THRESHOLD / canvas.scale;
        const myL = proposedX; const myC = proposedX + nodeWidth / 2; const myR = proposedX + nodeWidth;
        const myT = proposedY; const myM = proposedY + nodeHeight / 2; const myB = proposedY + nodeHeight;
        let snappedX = false; let snappedY = false;
        nodesRef.current.forEach(other => {
          // 多选时跳过其他选中的节点
          if (isMultiDrag && selectedNodeIds?.includes(other.id)) return;
          if (other.id === draggingNodeId) return;
          const otherBounds = getNodeBounds(other);
          if (!snappedX) {
            if (Math.abs(myL - otherBounds.x) < SNAP) { proposedX = otherBounds.x; snappedX = true; }
            else if (Math.abs(myL - otherBounds.right) < SNAP) { proposedX = otherBounds.right; snappedX = true; }
            else if (Math.abs(myR - otherBounds.x) < SNAP) { proposedX = otherBounds.x - nodeWidth; snappedX = true; }
            else if (Math.abs(myR - otherBounds.right) < SNAP) { proposedX = otherBounds.right - nodeWidth; snappedX = true; }
            else if (Math.abs(myC - (otherBounds.x + otherBounds.width / 2)) < SNAP) { proposedX = (otherBounds.x + otherBounds.width / 2) - nodeWidth / 2; snappedX = true; }
          }
          if (!snappedY) {
            if (Math.abs(myT - otherBounds.y) < SNAP) { proposedY = otherBounds.y; snappedY = true; }
            else if (Math.abs(myT - otherBounds.bottom) < SNAP) { proposedY = otherBounds.bottom; snappedY = true; }
            else if (Math.abs(myB - otherBounds.y) < SNAP) { proposedY = otherBounds.y - nodeHeight; snappedY = true; }
            else if (Math.abs(myB - otherBounds.bottom) < SNAP) { proposedY = otherBounds.bottom - nodeHeight; snappedY = true; }
            else if (Math.abs(myM - (otherBounds.y + otherBounds.height / 2)) < SNAP) { proposedY = (otherBounds.y + otherBounds.height / 2) - nodeHeight / 2; snappedY = true; }
          }
        });

        // 计算最终位移（考虑磁吸）
        const finalDx = proposedX - startX;
        const finalDy = proposedY - startY;

        if (isMultiDrag && selectedNodeIds && selectedNodesStartPos) {
          // 多选拖拽：移动所有选中的节点
          setNodes(prev => prev.map(n => {
            if (selectedNodeIds.includes(n.id)) {
              const startPos = selectedNodesStartPos.find(p => p.id === n.id);
              if (startPos) {
                return { ...n, x: startPos.x + finalDx, y: startPos.y + finalDy };
              }
            }
            return n;
          }));
        } else {
          // 单个节点拖拽
          setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: proposedX, y: proposedY } : n));
        }
      }

      if (resizingNodeId && initialSize && resizeStartPos) {
        const dx = (clientX - resizeStartPos.x) / canvas.scale;
        const dy = (clientY - resizeStartPos.y) / canvas.scale;
        setNodes(prev => prev.map(n => n.id === resizingNodeId ? { ...n, width: Math.max(360, initialSize.width + dx), height: Math.max(240, initialSize.height + dy) } : n));
      }
    });
  }, [canvas, draggingNodeId, resizingNodeId, initialSize, resizeStartPos]);

  const handleGlobalMouseUp = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
    isLongPressDraggingRef.current = false;

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (selectionRectRef.current) {
      const sr = selectionRectRef.current;
      const x = Math.min(sr.startX, sr.currentX);
      const y = Math.min(sr.startY, sr.currentY);
      const w = Math.abs(sr.currentX - sr.startX);
      const h = Math.abs(sr.currentY - sr.startY);
      if (w > 10) {
        const rect = {
          x: (x - canvas.pan.x) / canvas.scale,
          y: (y - canvas.pan.y) / canvas.scale,
          w: w / canvas.scale,
          h: h / canvas.scale
        };
        const enclosed = nodesRef.current.filter(n => {
          const cx = n.x + (n.width || 420) / 2;
          const cy = n.y + 160;
          return cx > rect.x && cx < rect.x + rect.w && cy > rect.y && cy < rect.y + rect.h;
        });
        if (enclosed.length > 0) {
          // 选中框选的节点（移除自动创建分组的逻辑）
          setSelectedNodeIds(enclosed.map(n => n.id));
        }
      }
      setSelectionRect(null);
      selectionRectRef.current = null;
    }
    if (draggingNodeId) {
      const draggedNode = nodesRef.current.find(n => n.id === draggingNodeId);
      if (draggedNode) {
        const myBounds = getNodeBounds(draggedNode);
        const otherNodes = nodesRef.current.filter(n => n.id !== draggingNodeId);
        for (const other of otherNodes) {
          const otherBounds = getNodeBounds(other);
          const isOverlapping = (myBounds.x < otherBounds.right && myBounds.right > otherBounds.x && myBounds.y < otherBounds.bottom && myBounds.bottom > otherBounds.y);
          if (isOverlapping) {
            const overlapLeft = myBounds.right - otherBounds.x;
            const overlapRight = otherBounds.right - myBounds.x;
            const overlapTop = myBounds.bottom - otherBounds.y;
            const overlapBottom = otherBounds.bottom - myBounds.y;
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
            if (minOverlap === overlapLeft) draggedNode.x = otherBounds.x - myBounds.width - COLLISION_PADDING;
            else if (minOverlap === overlapRight) draggedNode.x = otherBounds.right + COLLISION_PADDING;
            else if (minOverlap === overlapTop) draggedNode.y = otherBounds.y - myBounds.height - COLLISION_PADDING;
            else if (minOverlap === overlapBottom) draggedNode.y = otherBounds.bottom + COLLISION_PADDING;
            myBounds.x = draggedNode.x;
            myBounds.y = draggedNode.y;
            myBounds.right = draggedNode.x + myBounds.width;
            myBounds.bottom = draggedNode.y + myBounds.height;
          }
        }
        setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: draggedNode.x, y: draggedNode.y } : n));
      }
    }
    if (draggingNodeId || resizingNodeId || dragGroupRef.current) saveHistory();
    canvas.endCanvasDrag();
    setDraggingNodeId(null);
    setDraggingNodeParentGroupId(null);
    setDraggingGroup(null);
    setResizingGroupId(null);
    setActiveGroupNodeIds([]);
    setResizingNodeId(null);
    setInitialSize(null);
    setResizeStartPos(null);
    setConnectionStart(null);
    dragNodeRef.current = null;
    resizeContextRef.current = null;
    dragGroupRef.current = null;
  }, [canvas, saveHistory, draggingNodeId, resizingNodeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        isSpacePressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleNodeUpdate = useCallback((id: string, data: any, size?: any, title?: string) => {
    const callingStack = new Error().stack?.split('\n').slice(1, 4).join('\n');

    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        // 确保标题始终是中文的
        const correctTitle = getNodeNameCN(n.type);
        const updated = { ...n, data: { ...n.data, ...data }, title: title || correctTitle };

        // Debug log for character updates
        if (data.generatedCharacters) {
        }

        if (size) { if (size.width) updated.width = size.width; if (size.height) updated.height = size.height; }
        if (data.image) handleAssetGenerated('image', data.image, updated.title);
        if (data.videoUri) handleAssetGenerated('video', data.videoUri, updated.title);
        if (data.audioUri) handleAssetGenerated('audio', data.audioUri, updated.title);
        return updated;
      }
      return n;
    }));
  }, [handleAssetGenerated]);

  const handleReplaceFile = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    const targetId = replacementTargetRef.current;
    if (file && targetId) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (type === 'image') handleNodeUpdate(targetId, { image: result });
        else handleNodeUpdate(targetId, { videoUri: result });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = ''; setContextMenu(null); replacementTargetRef.current = null;
  }, [handleNodeUpdate]);

  // Helper functions (getVisualPromptPrefix, getUpstreamContext, getUpstreamStyleContext) extracted to handlers/useNodeActions.ts

  // --- Character Action Handler ---
  const handleCharacterAction = useCallback(async (nodeId: string, action: 'DELETE' | 'SAVE' | 'RETRY' | 'GENERATE_EXPRESSION' | 'GENERATE_THREE_VIEW' | 'GENERATE_SINGLE', charName: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;

    // Use new character action handler with queue-based state management
    const { handleCharacterAction: handleCharacterActionNew } = await import('./services/characterActionHandler');
    await handleCharacterActionNew(
      nodeId,
      action,
      charName,
      node,
      nodesRef.current,
      handleNodeUpdate
    );
  }, [handleNodeUpdate]);

  // --- Node Event Handlers (useCallback for performance) ---
  const handleNodeDelete = useCallback((id: string) => {
    deleteNodes([id]);
  }, []);

  const handleNodeExpand = useCallback((data: { type: 'image' | 'video', src: string, rect: DOMRect, images?: string[], initialIndex?: number }) => {
    setExpandedMedia(data);
  }, []);

  const handleNodeCrop = useCallback((id: string, img: string) => {
    setCroppingNodeId(id);
    setImageToCrop(img);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    // 检查是否点击了交互元素，如果是则不触发节点拖拽
    const target = e.target as HTMLElement;
    const tagName = target.tagName;
    const targetType = target.getAttribute('type');

    // 交互元素列表：range input、普通input、textarea、select、button、a标签
    const isInteractiveElement =
      (tagName === 'INPUT' && (targetType === 'range' || targetType === 'text' || targetType === 'number' || targetType === 'checkbox' || targetType === 'radio')) ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      tagName === 'BUTTON' ||
      tagName === 'A';

    if (isInteractiveElement) {
      // 点击的是交互元素，不触发节点拖拽
      return;
    }

    const isAlreadySelected = selectedNodeIds.includes(id);

    // 如果按住shift/meta/ctrl键，切换选中状态
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedNodeIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else if (!isAlreadySelected) {
      // 如果点击的节点未被选中，清除其他选中，只选中当前节点
      setSelectedNodeIds([id]);
    }
    // 如果点击的节点已经被选中，保持选中状态不变（支持多选拖拽）

    const n = nodesRef.current.find(x => x.id === id);
    if (!n) return;

    const w = n.width || 420;
    const h = n.height || getApproxNodeHeight(n);
    const cx = n.x + w / 2;
    const cy = n.y + 160;
    const pGroup = groups.find(g => {
      return cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height;
    });

    let siblingNodeIds: string[] = [];
    if (pGroup) {
      siblingNodeIds = nodesRef.current.filter(other => {
        if (other.id === id) return false;
        const b = getNodeBounds(other);
        const ocx = b.x + b.width / 2;
        const ocy = b.y + b.height / 2;
        return ocx > pGroup.x && ocx < pGroup.x + pGroup.width && ocy > pGroup.y && ocy < pGroup.y + pGroup.height;
      }).map(s => s.id);
    }

    // 记录多选拖拽信息
    const currentSelectedIds = selectedNodeIds.includes(id) ? selectedNodeIds : [id];
    const isMultiDrag = currentSelectedIds.length > 1;
    const selectedNodesStartPos = isMultiDrag
      ? nodesRef.current.filter(node => currentSelectedIds.includes(node.id))
        .map(node => ({ id: node.id, x: node.x, y: node.y }))
      : [];

    dragNodeRef.current = {
      id,
      startX: n.x,
      startY: n.y,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
      parentGroupId: pGroup?.id,
      siblingNodeIds,
      nodeWidth: w,
      nodeHeight: h,
      isMultiDrag,
      selectedNodeIds: currentSelectedIds,
      selectedNodesStartPos
    };
    setDraggingNodeParentGroupId(pGroup?.id || null);
    setDraggingNodeId(id);
  }, [selectedNodeIds, groups, getApproxNodeHeight, getNodeBounds]);

  const handlePortMouseDown = useCallback((e: React.MouseEvent, id: string, type: 'input' | 'output') => {
    e.stopPropagation();
    setConnectionStart({ id, x: e.clientX, y: e.clientY });
  }, []);

  const handlePortMouseUp = useCallback((e: React.MouseEvent, id: string, type: 'input' | 'output') => {
    e.stopPropagation();
    const start = connectionStartRef.current;
    if (!start || start.id === id) return;

    if (start.id === 'smart-sequence-dock') {
      // Smart Sequence Dock 的连接逻辑保持不变
      setConnectionStart(null);
      return;
    }

    // 获取源节点和目标节点
    const fromNode = nodesRef.current.find(n => n.id === start.id);
    const toNode = nodesRef.current.find(n => n.id === id);

    if (fromNode && toNode) {
      // 验证连接是否合法
      const validation = validateConnection(fromNode, toNode, connections);

      if (validation.valid) {
        // 连接合法,创建连接
        setConnections(p => [...p, { from: start.id, to: id }]);
        setNodes(p => p.map(n =>
          n.id === id ? { ...n, inputs: [...n.inputs, start.id] } : n
        ));
      } else {
        // 连接不合法,显示错误提示
        alert(validation.error || '无法创建连接');
      }
    }

    setConnectionStart(null);
  }, [connections]);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id });
    setContextMenuTarget({ type: 'node', id });
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, id: string, w: number, h: number) => {
    e.stopPropagation();
    const n = nodesRef.current.find(x => x.id === id);
    if (!n) return;

    const cx = n.x + w / 2;
    const cy = n.y + 160;
    const pGroup = groups.find(g => {
      return cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height;
    });

    setDraggingNodeParentGroupId(pGroup?.id || null);

    let siblingNodeIds: string[] = [];
    if (pGroup) {
      siblingNodeIds = nodesRef.current.filter(other => {
        if (other.id === id) return false;
        const b = getNodeBounds(other);
        const ocx = b.x + b.width / 2;
        const ocy = b.y + b.height / 2;
        return ocx > pGroup.x && ocx < pGroup.x + pGroup.width && ocy > pGroup.y && ocy < pGroup.y + pGroup.height;
      }).map(s => s.id);
    }

    resizeContextRef.current = {
      nodeId: id,
      initialWidth: w,
      initialHeight: h,
      startX: e.clientX,
      startY: e.clientY,
      parentGroupId: pGroup?.id || null,
      siblingNodeIds
    };

    setResizingNodeId(id);
    setInitialSize({ width: w, height: h });
    setResizeStartPos({ x: e.clientX, y: e.clientY });
  }, [groups, getNodeBounds]);

  const handleInputReorder = useCallback((nodeId: string, newOrder: string[]) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, inputs: newOrder } : n));
    }
  }, []);

  const handleViewCharacter = useCallback((character: CharacterProfile) => {
    setViewingCharacter({ character, nodeId: '' }); // nodeId will be set by Node component
  }, []);

  // --- Helper: Calculate input assets for a node ---
  const getNodeInputAssets = useCallback((nodeId: string, inputs: string[]): InputAsset[] => {
    return inputs
      .map(i => nodesRef.current.find(n => n.id === i))
      .filter(n => n && (n.data.image || n.data.videoUri || n.data.croppedFrame))
      .slice(0, 6)
      .map(n => ({
        id: n!.id,
        type: (n!.data.croppedFrame || n!.data.image) ? 'image' : 'video',
        src: n!.data.croppedFrame || n!.data.image || n!.data.videoUri!
      }));
  }, []);

  // --- Video Editor Handler ---
  const handleOpenVideoEditor = useCallback((nodeId: string) => {

    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) {
      console.error('[handleOpenVideoEditor] Node not found:', nodeId);
      return;
    }

    if (node.type !== NodeType.VIDEO_EDITOR) {
      console.error('[handleOpenVideoEditor] Invalid node type:', node.type);
      return;
    }


    // 获取连接的视频
    const sources: VideoSource[] = [];

    if (!nodeQuery.current) {
      console.error('[handleOpenVideoEditor] nodeQuery.current is null');
      return;
    }

    const connectedNodes = nodeQuery.current.getNodesByIds(node.inputs);

    for (const inputNode of connectedNodes) {
      let videoUrl = '';
      let duration = 0;

      switch (inputNode.type) {
        case NodeType.VIDEO_GENERATOR:
          videoUrl = inputNode.data.videoUri || inputNode.data.videoUris?.[0] || '';
          duration = inputNode.data.duration || 0;
          break;

        case NodeType.SORA_VIDEO_GENERATOR: {
          // Sora 2: 从子节点获取视频
          const allSoraChildren = nodeQuery.current.getNodesByType(NodeType.SORA_VIDEO_CHILD);
          const connectedSoraChildren = allSoraChildren.filter(child =>
            child.inputs && child.inputs.includes(inputNode.id)
          );

          for (const childNode of connectedSoraChildren) {
            if (childNode.data.videoUrl) {
              sources.push({
                id: childNode.id,
                url: childNode.data.videoUrl,
                name: `${inputNode.title} - ${childNode.data.taskNumber || '视频'}`,
                duration: childNode.data.duration || 0,
                sourceNodeId: inputNode.id
              });
            }
          }
          continue; // Sora 2 已处理，跳过后续
        }

        case NodeType.STORYBOARD_VIDEO_GENERATOR: {
          // 分镜视频：从子节点获取视频
          const allStoryboardChildren = nodeQuery.current.getNodesByType(NodeType.STORYBOARD_VIDEO_CHILD);
          const connectedStoryboardChildren = allStoryboardChildren.filter(child =>
            child.inputs && child.inputs.includes(inputNode.id)
          );

          for (const childNode of connectedStoryboardChildren) {
            if (childNode.data.videoUrl) {
              sources.push({
                id: childNode.id,
                url: childNode.data.videoUrl,
                name: `${inputNode.title} - ${childNode.data.selectedShotIndex !== undefined ? `镜头${childNode.data.selectedShotIndex + 1}` : '视频'}`,
                duration: childNode.data.duration || 0,
                sourceNodeId: inputNode.id
              });
            }
          }
          continue; // 分镜视频已处理，跳过后续
        }

        case NodeType.SORA_VIDEO_CHILD:
          videoUrl = inputNode.data.videoUrl || '';
          duration = inputNode.data.duration || 0;
          break;

        case NodeType.STORYBOARD_VIDEO_CHILD:
          videoUrl = inputNode.data.videoUrl || '';
          duration = inputNode.data.duration || 0;
          break;
      }

      if (videoUrl) {
        sources.push({
          id: inputNode.id,
          url: videoUrl,
          name: inputNode.title,
          duration,
          sourceNodeId: inputNode.id
        });
      }
    }


    setVideoEditorSources(sources);
    setIsVideoEditorOpen(true);
  }, []);

  // --- Main Action Handler (extracted to handlers/useNodeActions.ts) ---
  const { handleNodeAction } = useNodeActions({
    nodesRef,
    connectionsRef,
    abortControllersRef,
    nodeQuery,
    saveHistory,
    handleNodeUpdate,
    handleAssetGenerated,
    activeProjectId: activeProject?.id,
    activeWorkflowInstanceId: workflowProjectState.activeEpisodeId ?? workflowProjectState.activeSeriesId ?? null,
  });

  // --- Canvas Snapshot Actions ---
  const { saveCurrentAsCanvasSnapshot, saveGroupAsCanvasSnapshot, loadCanvasSnapshot, deleteCanvasSnapshot, renameCanvasSnapshot } = useCanvasSnapshotActions({
    saveHistory,
  });

  // Keyboard Shortcuts (extracted to handlers/useKeyboardShortcuts.ts)
  useKeyboardShortcuts({
    nodesRef,
    saveHistory,
    deleteNodes,
    undo,
    zoomCanvas: canvas.zoomCanvas,
    mousePosRef: canvas.mousePosRef,
  });

  const handleCanvasDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropX = (e.clientX - canvas.pan.x) / canvas.scale;
    const dropY = (e.clientY - canvas.pan.y) / canvas.scale;
    const assetData = e.dataTransfer.getData('application/json');
    const canvasSnapshotId = e.dataTransfer.getData('application/canvas-snapshot-id');

    if (canvasSnapshotId && canvasSnapshots) {
      const canvasSnapshot = canvasSnapshots.find(snapshot => snapshot.id === canvasSnapshotId);
      if (canvasSnapshot) {
        saveHistory();
        const minX = Math.min(...canvasSnapshot.nodes.map(n => n.x));
        const minY = Math.min(...canvasSnapshot.nodes.map(n => n.y));
        const width = Math.max(...canvasSnapshot.nodes.map(n => n.x + (n.width || 420))) - minX;
        const height = Math.max(...canvasSnapshot.nodes.map(n => n.y + 320)) - minY;
        const offsetX = dropX - (minX + width / 2);
        const offsetY = dropY - (minY + height / 2);
        const idMap = new Map<string, string>();
        const newNodes = canvasSnapshot.nodes.map(n => { const newId = `n-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; idMap.set(n.id, newId); return { ...n, id: newId, x: n.x + offsetX, y: n.y + offsetY, status: NodeStatus.IDLE, inputs: [] }; });
        newNodes.forEach((n, i) => { const original = canvasSnapshot.nodes[i]; n.inputs = original.inputs.map(oldId => idMap.get(oldId)).filter(Boolean) as string[]; });
        const newConnections = canvasSnapshot.connections.map(c => ({ from: idMap.get(c.from)!, to: idMap.get(c.to)! })).filter(c => c.from && c.to);
        const newGroups = (canvasSnapshot.groups || []).map(g => ({ ...g, id: `g-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, x: g.x + offsetX, y: g.y + offsetY }));
        setNodes(prev => [...prev, ...newNodes]); setConnections(prev => [...prev, ...newConnections]); setGroups(prev => [...prev, ...newGroups]);
      }
      return;
    }
    if (assetData) {
      try {
        const asset = JSON.parse(assetData);
        if (asset && asset.type) {
          if (asset.type === 'image') addNode(NodeType.IMAGE_GENERATOR, dropX - 210, dropY - 180, { image: asset.src, prompt: asset.title });
          else if (asset.type === 'video') addNode(NodeType.VIDEO_GENERATOR, dropX - 210, dropY - 180, { videoUri: asset.src });
        }
        return;
      } catch (err) { console.error("Drop failed", err); }
    }

    // Updated Multi-File Logic (9-Grid Support)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      if (files.length > 0) {
        importFilesToCanvas(files, dropX - 210, dropY - 180);
      }
    }
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = ` .cursor-grab-override, .cursor-grab-override * { cursor: grab !important; } .cursor-grab-override:active, .cursor-grab-override:active * { cursor: grabbing !important; } `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const projectWorkspaceTitle = activeProject?.title || BRAND_WORKSPACE_NAME;

  if (currentView === 'projects') {
    return (
      <div className="w-screen h-screen">
        <ProjectsDashboard
          onSelectProject={handleProjectSelect}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  if (currentView === 'pipeline') {
    return (
      <div className="w-screen h-screen">
        <WorkflowCenter
          projectTitle={projectWorkspaceTitle}
          workflowState={workflowProjectState}
          activeView={currentView}
          templates={WORKFLOW_TEMPLATES}
          onNavigate={setCurrentView}
          onBackToProjects={handleBackToProjects}
          onOpenCanvas={() => setCurrentView('canvas')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onCreateWorkflow={handleCreateWorkflow}
          onFocusSeries={handleFocusSeriesWorkflow}
          onAddEpisode={handleAddEpisodeWorkflow}
          onBulkAddEpisodes={handleBulkAddEpisodesWorkflow}
          onUpdateSeriesSettings={handleUpdateSeriesWorkflowSettings}
          onMaterializeWorkflow={handleMaterializeWorkflow}
          onSelectEpisode={handleOpenEpisodeWorkspace}
          onCreateAsset={handleCreateWorkflowAsset}
          onCreateAssetVersion={handleCreateWorkflowAssetVersion}
          onBindAsset={handleBindEpisodeAsset}
          onSyncAssetCoverage={handleSyncAssetCoverage}
          onBatchSyncAssetCoverage={handleBatchSyncAssetCoverage}
          onSaveSeriesAssetBatchTemplate={handleSaveSeriesAssetBatchTemplate}
          onSaveSeriesAssetBatchTemplates={handleSaveSeriesAssetBatchTemplates}
          onDeleteSeriesAssetBatchTemplate={handleDeleteSeriesAssetBatchTemplate}
          onUnbindAsset={handleUnbindEpisodeAsset}
          onUpdateContinuity={handleUpdateContinuityState}
          onUpdateStage={handleUpdateWorkflowStage}
        />
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  if (currentView === 'assets') {
    return (
      <div className="w-screen h-screen">
        <ProjectWorkspaceLayout
          projectTitle={projectWorkspaceTitle}
          currentView={currentView}
          hasActiveEpisode={Boolean(activeWorkflowEpisode)}
          sectionLabel="Asset Library"
          sectionDescription="资产中心承担漫剧里的长期复用资产沉淀，先统一版本，再把人物、场景、道具和风格分发给后续剧集。"
          onChangeView={setCurrentView}
          onBackToProjects={handleBackToProjects}
          onOpenSettings={() => setIsSettingsOpen(true)}
        >
          <WorkflowAssetsView
            workflowState={workflowProjectState}
            onCreateAsset={handleCreateWorkflowAsset}
            onCreateAssetVersion={handleCreateWorkflowAssetVersion}
            onSaveSeriesAssetBatchTemplate={handleSaveSeriesAssetBatchTemplate}
          />
        </ProjectWorkspaceLayout>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  if (currentView === 'episodes') {
    return (
      <div className="w-screen h-screen">
        <ProjectWorkspaceLayout
          projectTitle={projectWorkspaceTitle}
          currentView={currentView}
          hasActiveEpisode={Boolean(activeWorkflowEpisode)}
          sectionLabel="Episodes"
          sectionDescription="剧集页负责管理整部漫剧的拆集节奏，让系列工作流可以持续向下生产，而不是回到通用画布里手动拼。"
          onChangeView={setCurrentView}
          onBackToProjects={handleBackToProjects}
          onOpenSettings={() => setIsSettingsOpen(true)}
        >
          <WorkflowEpisodesView
            workflowState={workflowProjectState}
            onAddEpisode={handleAddEpisodeWorkflow}
            onBulkAddEpisodes={handleBulkAddEpisodesWorkflow}
            onOpenEpisodeWorkspace={handleOpenEpisodeWorkspace}
            onMaterializeWorkflow={handleMaterializeWorkflow}
            onFocusSeries={handleFocusSeriesWorkflow}
            onUpdateSeriesSettings={handleUpdateSeriesWorkflowSettings}
            onBatchUpdateStages={handleBatchUpdateWorkflowStages}
          />
        </ProjectWorkspaceLayout>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  if (currentView === 'jobs') {
    return (
      <div className="w-screen h-screen">
        <ProjectWorkspaceLayout
          projectTitle={projectWorkspaceTitle}
          currentView={currentView}
          hasActiveEpisode={Boolean(activeWorkflowEpisode)}
          sectionLabel="Task Center"
          sectionDescription="Track queued, running, completed, and failed generation work across the project, then jump back into the related episode workspace when execution needs intervention."
          onChangeView={setCurrentView}
          onBackToProjects={handleBackToProjects}
          onOpenSettings={() => setIsSettingsOpen(true)}
        >
          <WorkflowJobsView
            projectId={activeProject?.id}
            projectTitle={projectWorkspaceTitle}
            workflowState={workflowProjectState}
            onOpenEpisodeWorkspace={handleOpenEpisodeWorkspace}
            onRunJobAction={handleGenerationJobAction}
          />
        </ProjectWorkspaceLayout>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  if (currentView === 'workspace') {
    return (
      <div className="w-screen h-screen">
        <ProjectWorkspaceLayout
          projectTitle={projectWorkspaceTitle}
          currentView={currentView}
          hasActiveEpisode={Boolean(activeWorkflowEpisode)}
          sectionLabel="Episode Workspace"
          sectionDescription="单集工作区是执行层：围绕这一集推进剧本、资产绑定、分镜、提示词与视频交付，完成后再进入高级画布。"
          onChangeView={setCurrentView}
          onBackToProjects={handleBackToProjects}
          onOpenSettings={() => setIsSettingsOpen(true)}
        >
          <WorkflowWorkspaceView
            workflowState={workflowProjectState}
            onSelectEpisode={handleOpenEpisodeWorkspace}
            onBindAsset={handleBindEpisodeAsset}
            onUnbindAsset={handleUnbindEpisodeAsset}
            onUpdateContinuity={handleUpdateContinuityState}
            onUpdateStage={handleUpdateWorkflowStage}
            onMaterializeWorkflow={handleMaterializeWorkflow}
          />
        </ProjectWorkspaceLayout>
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="tianti-canvas-root w-screen h-screen overflow-hidden">
      <div
        ref={canvasRef}
        className={`w-full h-full overflow-hidden text-slate-200 selection:bg-cyan-500/30 ${canvas.isDraggingCanvas ? 'cursor-grabbing' : 'cursor-default'}`}
        onMouseDownCapture={handleCanvasMouseDownCapture}
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={(e) => { e.preventDefault(); if (e.detail > 1 && !selectionRect) { setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: '' }); setContextMenuTarget({ type: 'create' }); } }}
        onContextMenu={(e) => { e.preventDefault(); if (e.target === e.currentTarget) setContextMenu(null); }}
        onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}
      >
        <div className="absolute inset-0 noise-bg" />
        <div ref={canvas.gridBgRef} className="absolute inset-0 pointer-events-none opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle, #aaa 1px, transparent 1px)', backgroundSize: `${32 * canvas.scale}px ${32 * canvas.scale}px`, backgroundPosition: `${canvas.pan.x}px ${canvas.pan.y}px` }} />

        {/* Welcome Screen Component */}
        <WelcomeScreen
          visible={nodes.length === 0}
          onCreatePromptInput={() => addNode(NodeType.PROMPT_INPUT)}
          onCreateImageGenerator={() => addNode(NodeType.IMAGE_GENERATOR)}
          onCreateVideoGenerator={() => addNode(NodeType.VIDEO_GENERATOR)}
        />

        {/* Canvas Logo with Back Button */}
        <div className="absolute top-4 left-4 z-40 flex items-center gap-3">
          <button
            onClick={handleBackToProjects}
            className="tianti-canvas-chip"
            title="返回项目列表"
          >
            <ChevronLeft size={16} />
            <span className="text-sm font-medium">{BRAND_WORKSPACE_NAME}</span>
          </button>
          {(hasPipelineNodes(nodes) || activeProject?.settings?.editorMode === 'pipeline') && (
            <button
              onClick={handleOpenPipeline}
              className="tianti-canvas-chip is-accent"
              title="返回工作流中心"
            >
              <ChevronRight size={16} />
              <span className="text-sm font-medium">工作流中心</span>
            </button>
          )}
          {nodes.length > 0 && (
            <img
              src="/logo.png"
              alt={BRAND_LOGO_ALT}
              className="h-12 md:h-14 object-contain opacity-80 hover:opacity-100 transition-opacity pointer-events-none select-none"
            />
          )}
        </div>

        <input type="file" ref={importAssetInputRef} className="hidden" accept="image/*,video/*" multiple onChange={handleAssetImport} />
        <input type="file" ref={replaceVideoInputRef} className="hidden" accept="video/*" onChange={(e) => handleReplaceFile(e, 'video')} />
        <input type="file" ref={replaceImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleReplaceFile(e, 'image')} />

        <div ref={canvas.canvasTransformRef} style={{ transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.scale})`, width: '100%', height: '100%', transformOrigin: '0 0' }} className="w-full h-full">
          {/* Groups Layer */}
          {groups.map(g => (
            <div
              key={g.id} className={`absolute rounded-[32px] border transition-all ${(draggingGroup?.id === g.id || draggingNodeParentGroupId === g.id) ? 'duration-0' : 'duration-300'} ${selectedGroupId === g.id ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/10 bg-white/5'}`} style={{ left: g.x, top: g.y, width: g.width, height: g.height }}
              onMouseDown={(e) => {
                e.stopPropagation(); setSelectedGroupId(g.id);
                const childNodes = nodes.filter(n => { const b = getNodeBounds(n); const cx = b.x + b.width / 2; const cy = b.y + b.height / 2; return cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height; }).map(n => ({ id: n.id, startX: n.x, startY: n.y }));
                dragGroupRef.current = { id: g.id, startX: g.x, startY: g.y, mouseStartX: e.clientX, mouseStartY: e.clientY, childNodes };
                setActiveGroupNodeIds(childNodes.map(c => c.id)); setDraggingGroup({ id: g.id });
              }}
              onContextMenu={e => { e.stopPropagation(); setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: g.id }); setContextMenuTarget({ type: 'group', id: g.id }); }}
            >
              <div className="absolute -top-8 left-4 text-xs font-bold text-white/40 uppercase tracking-widest">{g.title}</div>
            </div>
          ))}

          {/* Connections Layer */}
          <svg className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-0" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}>
            <MemoizedConnectionLayer
              nodes={nodes}
              connections={connections}
              scale={canvas.scale}
              pan={canvas.pan}
              connectionStart={connectionStart}
              mousePos={canvas.mousePos}
              onConnectionClick={(conn, e) => {
                e.stopPropagation();
                setContextMenu({ visible: true, x: e.clientX, y: e.clientY, id: `${conn.from}-${conn.to}` });
                setContextMenuTarget({ type: 'connection', from: conn.from, to: conn.to });
              }}
              getNodeHeight={getApproxNodeHeight}
            />
          </svg>

          {/* 画布虚拟化：只渲染视口内可见的节点 */}
          {visibleNodes.map(node => {
            const inputAssets = getNodeInputAssets(node.id, node.inputs);
            return (
              <Node
                key={node.id}
                node={node}
                // 性能优化：使用nodeQuery而不是传递整个nodes数组
                nodeQuery={nodeQuery.current}
                characterLibrary={assetHistory.filter(a => a.type === 'character').map(a => a.data)}
                onUpdate={handleNodeUpdate}
                onAction={handleNodeAction}
                onDelete={handleNodeDelete}
                onExpand={handleNodeExpand}
                onCrop={handleNodeCrop}
                onNodeMouseDown={handleNodeMouseDown}
                onPortMouseDown={handlePortMouseDown}
                onPortMouseUp={handlePortMouseUp}
                onNodeContextMenu={handleNodeContextMenu}
                onResizeMouseDown={handleResizeMouseDown}
                onCharacterAction={handleCharacterAction}
                onViewCharacter={(char) => setViewingCharacter({ character: char, nodeId: node.id })}
                onOpenVideoEditor={handleOpenVideoEditor}
                isSelected={selectedNodeIds.includes(node.id)}
                inputAssets={inputAssets}
                onInputReorder={handleInputReorder}
                isDragging={draggingNodeId === node.id} isResizing={resizingNodeId === node.id} isConnecting={!!connectionStart} isGroupDragging={activeGroupNodeIds.includes(node.id)}
              />
            );
          })}

          {selectionRect && <div className="absolute border border-cyan-500/40 bg-cyan-500/10 rounded-lg pointer-events-none" style={{ left: (Math.min(selectionRect.startX, selectionRect.currentX) - canvas.pan.x) / canvas.scale, top: (Math.min(selectionRect.startY, selectionRect.currentY) - canvas.pan.y) / canvas.scale, width: Math.abs(selectionRect.currentX - selectionRect.startX) / canvas.scale, height: Math.abs(selectionRect.currentY - selectionRect.startY) / canvas.scale }} />}
        </div> {/* Closing div for canvasTransformRef */}
      </div> {/* Closing div for canvasRef */}

      {/* Context Menu Component */}
      <CanvasContextMenu
        visible={contextMenu?.visible || false}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        target={contextMenuTarget}
        nodeData={nodes.find(n => n.id === contextMenu?.id)?.data}
        nodeType={nodes.find(n => n.id === contextMenu?.id)?.type}
        selectedNodeIds={selectedNodeIds}
        nodeTypes={GENERIC_CANVAS_NODE_TYPES}
        onClose={() => setContextMenu(null)}
        onAction={(action, data) => {
          switch (action) {
            case 'copy':
              const targetNode = nodes.find(n => n.id === data);
              if (targetNode) setClipboard(structuredClone(targetNode));
              break;

            case 'replace':
              replacementTargetRef.current = data;
              const node = nodes.find(n => n.id === data);
              if (node) {
                const isVideo = node.type === NodeType.VIDEO_GENERATOR || node.type === NodeType.VIDEO_ANALYZER;
                if (isVideo) replaceVideoInputRef.current?.click();
                else replaceImageInputRef.current?.click();
              }
              break;

            case 'delete':
              deleteNodes([data]);
              break;

            case 'deleteMultiple':
              // 删除所有选中的节点
              if (Array.isArray(data) && data.length > 0) {
                deleteNodes(data);
                // 清除选中状态
                setSelectedNodeIds([]);
              }
              break;

            case 'createGroupFromSelection':
              // 从选中的节点创建分组
              if (Array.isArray(data) && data.length > 0) {
                const selectedNodes = nodes.filter(n => data.includes(n.id));
                if (selectedNodes.length > 0) {
                  saveHistory();

                  // 计算分组边界
                  const fMinX = Math.min(...selectedNodes.map(n => n.x));
                  const fMinY = Math.min(...selectedNodes.map(n => n.y));
                  const fMaxX = Math.max(...selectedNodes.map(n => n.x + (n.width || 420)));
                  const fMaxY = Math.max(...selectedNodes.map(n => n.y + 320));

                  // 创建新分组
                  const newGroup = {
                    id: `g-${Date.now()}`,
                    title: '新建分组',
                    x: fMinX - 32,
                    y: fMinY - 32,
                    width: (fMaxX - fMinX) + 64,
                    height: (fMaxY - fMinY) + 64
                  };

                  setGroups(prev => [...prev, newGroup]);

                  // 清除选中状态
                  setSelectedNodeIds([]);
                }
              }
              break;

            case 'downloadImage':
              const downloadNode = nodes.find(n => n.id === data);

              if (!downloadNode) {
                console.error('[下载分镜图] 未找到节点');
                break;
              }

              if (downloadNode.data.storyboardGridImages?.length > 0) {
                // 下载所有分镜图页面

                downloadNode.data.storyboardGridImages.forEach((imageUrl: string, index: number) => {
                  setTimeout(() => {
                    try {
                      const a = document.createElement('a');
                      a.href = imageUrl;
                      a.download = `storyboard-page-${index + 1}-${Date.now()}.png`;
                      a.target = '_blank'; // 在新标签页打开，避免浏览器阻止
                      document.body.appendChild(a);
                      a.click();
                      setTimeout(() => document.body.removeChild(a), 100);
                    } catch (err) {
                      console.error(`[下载分镜图] 第 ${index + 1} 张下载失败:`, err);
                    }
                  }, index * 800); // 增加间隔到800ms
                });
              } else if (downloadNode.data.storyboardGridImage) {
                // 下载单张分镜图
                const a = document.createElement('a');
                a.href = downloadNode.data.storyboardGridImage;
                a.download = `storyboard-${Date.now()}.png`;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => document.body.removeChild(a), 100);
              } else {
                console.warn('[下载分镜图] 节点中没有找到图片数据');
              }
              break;

            case 'createNode':
              addNode(data.type, (data.x - canvas.pan.x) / canvas.scale, (data.y - canvas.pan.y) / canvas.scale);
              break;

            case 'saveGroup':
              saveGroupAsCanvasSnapshot(data);
              break;

            case 'deleteGroup':
              setGroups(p => p.filter(g => g.id !== data));
              break;

            case 'deleteConnection':
              setConnections(prev => prev.filter(c => c.from !== data.from || c.to !== data.to));
              setNodes(prev => prev.map(n =>
                n.id === data.to ? { ...n, inputs: n.inputs.filter(i => i !== data.from) } : n
              ));
              break;

            default:
              console.warn('Unknown action:', action);
          }
        }}
        getNodeIcon={getNodeIcon}
        getNodeName={getNodeNameCN}
      />

      {croppingNodeId && imageToCrop && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><Loader2 size={48} className="animate-spin text-cyan-400" /></div>}>
          <ImageCropper imageSrc={imageToCrop} onCancel={() => { setCroppingNodeId(null); setImageToCrop(null); }} onConfirm={(b) => { handleNodeUpdate(croppingNodeId, { croppedFrame: b }); setCroppingNodeId(null); setImageToCrop(null); }} />
        </Suspense>
      )}
      <ExpandedView media={expandedMedia} onClose={() => setExpandedMedia(null)} />
      {isSketchEditorOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><Loader2 size={48} className="animate-spin text-cyan-400" /></div>}>
          <SketchEditor onClose={() => setIsSketchEditorOpen(false)} onGenerate={handleSketchResult} />
        </Suspense>
      )}
      <SmartSequenceDock
        isOpen={isMultiFrameOpen}
        onClose={() => setIsMultiFrameOpen(false)}
        onGenerate={handleMultiFrameGenerate}
        onConnectStart={(e, type) => { e.preventDefault(); e.stopPropagation(); setConnectionStart({ id: 'smart-sequence-dock', x: e.clientX, y: e.clientY }); }}
      />
      <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><Loader2 size={48} className="animate-spin text-cyan-400" /></div>}>
        <SonicStudio
          isOpen={isSonicStudioOpen}
          onClose={() => setIsSonicStudioOpen(false)}
          history={assetHistory.filter(a => a.type === 'audio')}
          onGenerate={(src, prompt) => handleAssetGenerated('audio', src, prompt)}
        />
      </Suspense>
      <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><Loader2 size={48} className="animate-spin text-cyan-400" /></div>}>
        <CharacterLibrary
          isOpen={isCharacterLibraryOpen}
          onClose={() => setIsCharacterLibraryOpen(false)}
          characters={assetHistory.filter(a => a.type === 'character').map(a => a.data)}
          onDelete={(id) => {
            // Find matching asset ID (which is the char.id)
            setAssetHistory(prev => prev.filter(a => a.id !== id));
          }}
        />
      </Suspense>
      <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><Loader2 size={48} className="animate-spin text-cyan-400" /></div>}>
        <CharacterDetailModal
          character={viewingCharacter?.character || null}
          nodeId={viewingCharacter?.nodeId}
          allNodes={nodes}
          onClose={() => setViewingCharacter(null)}
          onGenerateExpression={(nodeId, charName) => handleCharacterAction(nodeId, 'GENERATE_EXPRESSION', charName)}
          onGenerateThreeView={(nodeId, charName) => handleCharacterAction(nodeId, 'GENERATE_THREE_VIEW', charName)}
        />
      </Suspense>
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <ApiKeyPrompt
        isOpen={isApiKeyPromptOpen}
        onClose={() => setIsApiKeyPromptOpen(false)}
        onSave={handleApiKeySave}
      />
      <DebugPanel
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
      />

      {/* 视频编辑器 */}
      <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><Loader2 size={48} className="animate-spin text-cyan-400" /></div>}>
        <VideoEditor
          isOpen={isVideoEditorOpen}
          onClose={() => setIsVideoEditorOpen(false)}
          initialVideos={videoEditorSources}
          onExport={(outputUrl) => {
            // TODO: 将导出的视频保存到节点或下载
          }}
        />
      </Suspense>

      {/* 模型降级通知 */}
      <ModelFallbackNotification />

      <SidebarDock
        onAddNode={addNode}
        onAddWorkflowTemplate={handleAddWorkflowTemplateToCanvas}
        onUploadFiles={openAssetUploadPicker}
        onUndo={undo}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        isMultiFrameOpen={isMultiFrameOpen}
        onToggleMultiFrame={() => setIsMultiFrameOpen(!isMultiFrameOpen)}
        isSonicStudioOpen={isSonicStudioOpen}
        onToggleSonicStudio={() => setIsSonicStudioOpen(!isSonicStudioOpen)}
        isCharacterLibraryOpen={isCharacterLibraryOpen}
        onToggleCharacterLibrary={() => setIsCharacterLibraryOpen(!isCharacterLibraryOpen)}
        isDebugOpen={isDebugOpen}
        onToggleDebug={() => setIsDebugOpen(!isDebugOpen)}
        assetHistory={assetHistory}
        onHistoryItemClick={(item) => { const type = item.type.includes('image') ? NodeType.IMAGE_GENERATOR : NodeType.VIDEO_GENERATOR; const data = item.type === 'image' ? { image: item.src } : { videoUri: item.src }; addNode(type, undefined, undefined, data); }}
        onDeleteAsset={(id) => setAssetHistory(prev => prev.filter(a => a.id !== id))}
        canvasSnapshots={canvasSnapshots}
        selectedCanvasSnapshotId={selectedCanvasSnapshotId}
        onSelectCanvasSnapshot={loadCanvasSnapshot}
        onSaveCanvasSnapshot={saveCurrentAsCanvasSnapshot}
        onDeleteCanvasSnapshot={deleteCanvasSnapshot}
        onRenameCanvasSnapshot={renameCanvasSnapshot}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <AssistantPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* Language Toggle Button */}
      <div className="absolute top-8 right-8 z-50 animate-in fade-in slide-in-from-top-4 duration-700 flex flex-col gap-2 items-end">
        <div
          className={`tianti-canvas-chip ${saveIndicatorMeta.className}`}
          title={saveIndicatorMeta.title}
        >
          <saveIndicatorMeta.icon size={16} className={saveIndicatorMeta.iconClassName} />
          <span className="text-xs font-medium">{saveIndicatorMeta.label}</span>
        </div>
        {storageReconnectNeeded && (
          <button
            onClick={async () => {
              try {
                const { getFileStorageService } = await import('./services/storage');
                const service = getFileStorageService();
                await service.selectRootDirectory();
                setStorageReconnectNeeded(false);
                alert('✅ 已成功连接工作文件夹！');
              } catch (error: any) {
                console.error('[App] 重连失败:', error);
                alert('❌ 连接失败: ' + error.message);
              }
            }}
            className="tianti-canvas-chip animate-pulse border-orange-500/30 bg-orange-500/20 text-orange-300 hover:border-orange-500/50 hover:text-orange-200"
            title="点击重新连接本地存储文件夹"
          >
            <HardDrive size={16} />
            <span className="text-xs font-medium">重连存储</span>
          </button>
        )}
        {/* 翻译按钮 - 只在进入画布后显示 */}
        {nodes.length > 0 && (
          <button
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="tianti-canvas-chip"
            title={t.settings.language}
          >
            <Languages size={16} />
            <span className="text-xs font-medium">{language === 'zh' ? t.settings.english : t.settings.chinese}</span>
          </button>
        )}
      </div>

      {/* 放大缩小按钮 - 只在进入画布后显示 */}
      {nodes.length > 0 && (
        <div className="tianti-canvas-dock absolute bottom-8 right-8 z-50 flex items-center gap-3 px-4 py-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <button onClick={() => canvas.setScale(s => Math.max(0.2, s - 0.1))} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><Minus size={14} strokeWidth={3} /></button>
          <div className="flex items-center gap-2 min-w-[100px]">
            <input type="range" min="0.2" max="3" step="0.1" value={canvas.scale} onChange={(e) => canvas.setScale(parseFloat(e.target.value))} className="w-24 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg hover:[&::-webkit-slider-thumb]:scale-125 transition-all" />
            <span className="text-[10px] font-bold text-slate-400 w-8 text-right tabular-nums cursor-pointer hover:text-white" onClick={() => canvas.setScale(1)} title="Reset Zoom">{Math.round(canvas.scale * 100)}%</span>
          </div>
          <button onClick={() => canvas.setScale(s => Math.min(3, s + 0.1))} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><Plus size={14} strokeWidth={3} /></button>
          <button onClick={handleFitView} className="ml-2 rounded-full border-l border-white/10 p-1.5 pl-3 text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title="适配视图">
            <Scan size={14} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
