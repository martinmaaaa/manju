import React from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
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
  CanvasConfigFieldDefinition,
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
  collectCanvasNodeInputs,
  createCanvasNode,
  getNodeEnabledInputDefinitions,
  getNodeGenerationMode,
  getVisibleNodeInputDefinitions,
  selectCanvasModels,
  summarizeNodeParams,
  validateCanvasConnection,
} from '../../services/workflow/runtime/canvasGraphHelpers';
import {
  findModelByIdentifier,
  formatModelDisplayName,
  getModelGenerationModes,
  groupModelsByFamily,
  summarizeModelInputSupport,
} from '../../services/workflow/runtime/modelDeploymentHelpers';
import { isAudioSource } from '../../services/workflow/runtime/workspaceMediaHelpers';
import { SchemaFieldControl } from './SchemaFieldControl';

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

type FlowNodeData = {
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

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<{ inputKey: string }>;

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

const NODE_COLORS: Record<CanvasNode['type'], string> = {
  text: 'from-cyan-500/18 via-slate-950/95 to-slate-950/95 border-cyan-300/28',
  image: 'from-amber-500/20 via-slate-950/95 to-slate-950/95 border-amber-300/28',
  audio: 'from-emerald-500/20 via-slate-950/95 to-slate-950/95 border-emerald-300/28',
  video: 'from-fuchsia-500/20 via-slate-950/95 to-slate-950/95 border-fuchsia-300/30',
};

const NODE_BADGES: Record<CanvasNode['type'], string> = {
  text: '文本',
  image: '图片',
  audio: '音频',
  video: '视频',
};

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

type ModelPresentationProfileId =
  | 'text-gemini'
  | 'image-banana'
  | 'image-default'
  | 'video-seedance'
  | 'video-standard'
  | 'audio-reference'
  | 'fallback';

interface ModelPresentationProfile {
  id: ModelPresentationProfileId;
  primaryFieldKeys: string[];
  secondaryFieldKeys: string[];
  showPromptEditor: boolean;
  showMediaPreview: boolean;
  showInputGrid: boolean;
  showVariantSummary: boolean;
}

const CORE_VIDEO_FIELD_ORDER = ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'];

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

function isImageSource(value: string) {
  return /^(data:image\/[\w.+-]+;base64,|https?:\/\/)/i.test(String(value || '').trim());
}

function isVideoSource(value: string) {
  return /^(data:video\/[\w.+-]+;base64,|https?:\/\/)/i.test(String(value || '').trim());
}

function getNodeValue(node: CanvasNode) {
  const outputText = typeof node.output?.text === 'string' ? node.output.text : '';
  const outputPreview = typeof node.output?.previewUrl === 'string' ? node.output.previewUrl : '';
  return outputText || outputPreview || String(node.content || '').trim();
}

function getNodePreviewSource(node: CanvasNode) {
  const outputPreview = typeof node.output?.previewUrl === 'string' ? node.output.previewUrl : '';
  return outputPreview || String(node.content || '').trim();
}

function formatInputTypeLabel(type: string) {
  if (type === 'text') return '文本';
  if (type === 'image') return '图片';
  if (type === 'video') return '视频';
  if (type === 'audio') return '音频';
  return type;
}

function summarizeAcceptedInputTypes(accepts: string[] | undefined) {
  return Array.isArray(accepts)
    ? accepts.map((type) => formatInputTypeLabel(type)).join(' / ')
    : '';
}

function formatRunStatus(status: CanvasNode['runStatus']) {
  if (status === 'running') return '运行中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  return '待运行';
}

function getNodePromptText(node: CanvasNode) {
  return typeof node.prompt === 'string' && node.prompt.trim()
    ? node.prompt
    : String(node.content || '').trim();
}

function summarizeNodePreviewText(node: CanvasNode) {
  if (node.type === 'text') {
    return getNodeValue(node) || '点击后继续编写文本内容。';
  }
  if (node.type === 'audio') {
    return isAudioSource(node.content)
      ? '已上传音频参考。'
      : '上传音频参考，或在后续接入 TTS 能力。';
  }

  const prompt = getNodePromptText(node);
  if (prompt) {
    return prompt;
  }
  return node.type === 'image'
    ? '添加提示词或参考图开始生成图片。'
    : '添加提示词或参考素材开始生成视频。';
}

function previewClampStyle(lineCount: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lineCount,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

function formatCompactFieldValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value ? '开' : '关';
  }
  if (value === undefined || value === null || value === '') {
    return '未设';
  }
  return String(value);
}

const CompactFieldControl: React.FC<{
  fieldKey: string;
  definition: CanvasConfigFieldDefinition;
  value: unknown;
  onChange: (nextValue: string | number | boolean) => void;
}> = ({ fieldKey, definition, value, onChange }) => {
  const label = definition.label || fieldKey;

  if (Array.isArray(definition.enum) && definition.enum.length > 0) {
    return (
      <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100">
        <span className="whitespace-nowrap text-white/55">{label}</span>
        <select
          value={String(value ?? definition.default ?? definition.enum[0])}
          onChange={(event) => onChange(event.target.value)}
          className="nodrag nopan bg-transparent text-xs text-white outline-none"
        >
          {definition.enum.map((item) => (
            <option key={String(item)} value={String(item)} className="bg-slate-900 text-white">
              {String(item)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (definition.type === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => onChange(!Boolean(value))}
        className="nodrag nopan rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100"
      >
        {label} · {formatCompactFieldValue(Boolean(value))}
      </button>
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100">
      <span className="whitespace-nowrap text-white/55">{label}</span>
      <input
        type={definition.type === 'number' ? 'number' : 'text'}
        min={definition.min}
        max={definition.max}
        step={definition.step ?? 1}
        value={String(value ?? definition.default ?? '')}
        onChange={(event) => onChange(definition.type === 'number' ? Number(event.target.value) : event.target.value)}
        className="nodrag nopan min-w-0 bg-transparent text-xs text-white outline-none"
      />
    </label>
  );
};

function getModelPresentationProfile(
  node: CanvasNode,
  model: ModelDefinition | null | undefined,
): ModelPresentationProfile {
  if (node.type === 'audio') {
    return {
      id: 'audio-reference',
      primaryFieldKeys: ['scene', 'voice_id', 'stability', 'similarity_boost', 'speed', 'style'],
      secondaryFieldKeys: [],
      showPromptEditor: true,
      showMediaPreview: true,
      showInputGrid: false,
      showVariantSummary: false,
    };
  }

  if (!model) {
    return {
      id: 'fallback',
      primaryFieldKeys: [],
      secondaryFieldKeys: [],
      showPromptEditor: true,
      showMediaPreview: true,
      showInputGrid: true,
      showVariantSummary: false,
    };
  }

  if (node.type === 'text') {
    return {
      id: 'text-gemini',
      primaryFieldKeys: ['temperature', 'maxOutputTokens'],
      secondaryFieldKeys: [],
      showPromptEditor: true,
      showMediaPreview: false,
      showInputGrid: true,
      showVariantSummary: false,
    };
  }

  if (node.type === 'image') {
    if (model.familyId.includes('banana')) {
      return {
        id: 'image-banana',
        primaryFieldKeys: ['aspectRatio', 'imageSize'],
        secondaryFieldKeys: [],
        showPromptEditor: true,
        showMediaPreview: true,
        showInputGrid: true,
        showVariantSummary: true,
      };
    }

    return {
      id: 'image-default',
      primaryFieldKeys: ['aspectRatio', 'imageSize'],
      secondaryFieldKeys: [],
      showPromptEditor: true,
      showMediaPreview: true,
      showInputGrid: true,
      showVariantSummary: true,
    };
  }

  if (node.type === 'video') {
    if (model.familyId === 'seedance-2.0') {
      return {
        id: 'video-seedance',
        primaryFieldKeys: ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'],
        secondaryFieldKeys: [],
        showPromptEditor: true,
        showMediaPreview: true,
        showInputGrid: true,
        showVariantSummary: false,
      };
    }

    return {
      id: 'video-standard',
      primaryFieldKeys: ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'],
      secondaryFieldKeys: ['generateMultiClip'],
      showPromptEditor: true,
      showMediaPreview: true,
      showInputGrid: true,
      showVariantSummary: false,
    };
  }

  return {
    id: 'fallback',
    primaryFieldKeys: [],
    secondaryFieldKeys: [],
    showPromptEditor: true,
    showMediaPreview: true,
    showInputGrid: true,
    showVariantSummary: false,
  };
}

function splitConfigEntriesByProfile(
  model: ModelDefinition | null | undefined,
  profile: ModelPresentationProfile,
) {
  if (!model) {
    return {
      primaryEntries: [] as Array<[string, CanvasConfigFieldDefinition]>,
      secondaryEntries: [] as Array<[string, CanvasConfigFieldDefinition]>,
    };
  }

  const configEntries = Object.entries(model.configSchema || {}) as Array<[string, CanvasConfigFieldDefinition]>;
  const primaryKeySet = new Set(profile.primaryFieldKeys);
  const secondaryKeySet = new Set(profile.secondaryFieldKeys);

  const primaryEntries = configEntries.filter(([fieldKey]) => primaryKeySet.has(fieldKey));
  const secondaryEntries = configEntries.filter(([fieldKey]) => secondaryKeySet.has(fieldKey));
  const remainderEntries = configEntries.filter(([fieldKey]) => !primaryKeySet.has(fieldKey) && !secondaryKeySet.has(fieldKey));

  return {
    primaryEntries,
    secondaryEntries: [...secondaryEntries, ...remainderEntries],
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

function summarizeVideoNodeSettings(node: CanvasNode, model: ModelDefinition | null | undefined) {
  if (!model) {
    return [];
  }

  const parts: string[] = [];
  const activeMode = getNodeGenerationMode(node, model);
  if (activeMode?.summaryLabel) {
    parts.push(activeMode.summaryLabel);
  }

  CORE_VIDEO_FIELD_ORDER.forEach((fieldKey) => {
    const value = node.params?.[fieldKey];
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (fieldKey === 'generateAudio') {
      parts.push(Boolean(value) ? '音频' : '静音');
      return;
    }
    if (fieldKey === 'durationSeconds' || fieldKey === 'duration') {
      parts.push(`${value}s`);
      return;
    }
    parts.push(String(value));
  });

  return parts;
}

function statusBadgeClass(status: CanvasNode['runStatus']) {
  if (status === 'error') {
    return 'border-red-400/20 bg-red-400/10 text-red-100';
  }
  if (status === 'success') {
    return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
  }
  if (status === 'running') {
    return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100';
  }
  return 'border-white/10 bg-white/[0.04] text-white/55';
}

const WorkflowFlowNodeCard: React.FC<NodeProps<FlowNode>> = ({ data, selected }) => {
  const { node } = data;
  const selectedModel = findModelByIdentifier(data.models, node.modelId);
  const nodeModels = selectCanvasModels(data.models, node.type);
  const groupedNodeModels = groupModelsByFamily(nodeModels);
  const generationModes = getModelGenerationModes(selectedModel);
  const activeGenerationMode = getNodeGenerationMode(node, selectedModel);
  const enabledInputDefinitions = getNodeEnabledInputDefinitions(node, selectedModel);
  const visibleInputDefinitions = getVisibleNodeInputDefinitions(node, selectedModel);
  const connectedInputs = collectCanvasNodeInputs(node, data.allNodes, data.connections, data.models);
  const inputBadges = Object.entries(connectedInputs)
    .flatMap(([inputKey, bucket]) => bucket.items.map((item) => `${bucket.definition.label || inputKey} · ${item.node.title}`))
    .slice(0, 6);
  const paramSummaries = summarizeNodeParams(node, selectedModel);
  const videoSummary = node.type === 'video' ? summarizeVideoNodeSettings(node, selectedModel) : [];
  const nodeValue = getNodeValue(node);
  const previewSource = getNodePreviewSource(node);
  const previewText = summarizeNodePreviewText(node);
  const profile = getModelPresentationProfile(node, selectedModel);
  const { primaryEntries, secondaryEntries } = splitConfigEntriesByProfile(selectedModel, profile);
  const isModelPickerOpen = data.modelPickerNodeId === node.id;
  const isHovered = data.hoveredNodeId === node.id;
  const showHandles = selected || isHovered;
  const usesMediaComposer = selected && (node.type === 'image' || node.type === 'video');
  const referenceItems = Object.values(connectedInputs)
    .flatMap((bucket) => bucket.items)
    .slice(0, 3)
    .map((item) => ({
      id: item.node.id,
      title: item.node.title,
      preview: getNodePreviewSource(item.node),
    }));

  if (usesMediaComposer) {
    return (
      <div
        className="relative overflow-visible"
        onMouseEnter={() => data.onHoverNode(node.id)}
        onMouseLeave={() => data.onHoverNode(null)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          data.onOpenNodeMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
      >
        <div
          className={`workflow-flow-node workflow-flow-node--media-preview relative rounded-[30px] border bg-gradient-to-br p-4 shadow-[0_22px_55px_rgba(0,0,0,0.35)] transition ${
            NODE_COLORS[node.type]
          } ring-2 ring-white/60`}
        >
          {showHandles && enabledInputDefinitions.length > 0 ? (
            <div className="pointer-events-none absolute -left-8 top-1/2 z-20 flex -translate-y-1/2 items-center">
              <div className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-white/35 hover:text-white">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onOpenAddFromHandle(node.id, 'target');
                  }}
                  className="nodrag nopan flex h-full w-full items-center justify-center"
                >
                  <span className="leading-none">+</span>
                </button>
                <Handle
                  type="target"
                  position={Position.Left}
                  className="!absolute !inset-0 !h-full !w-full !translate-x-0 !border-0 !bg-transparent !opacity-0"
                />
              </div>
            </div>
          ) : null}

          {showHandles ? (
            <div className="pointer-events-none absolute -right-8 top-1/2 z-20 flex -translate-y-1/2 items-center">
              <div className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-white/35 hover:text-white">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onOpenAddFromHandle(node.id, 'source');
                  }}
                  className="nodrag nopan flex h-full w-full items-center justify-center"
                >
                  <span className="leading-none">+</span>
                </button>
                <Handle
                  id="output"
                  type="source"
                  position={Position.Right}
                  className="!absolute !inset-0 !h-full !w-full !translate-x-0 !border-0 !bg-transparent !opacity-0"
                />
              </div>
            </div>
          ) : null}

          <div className="workflow-flow-node__drag-handle flex cursor-grab items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-white/60">
                  {NODE_BADGES[node.type]}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.22em] ${statusBadgeClass(node.runStatus)}`}>
                  {formatRunStatus(node.runStatus)}
                </span>
              </div>
              <input
                value={node.title}
                onChange={(event) => data.onPatchNode(node.id, { title: event.target.value })}
                onClick={(event) => event.stopPropagation()}
                className="nodrag nopan mt-2 w-full bg-transparent text-base font-semibold text-white outline-none"
                placeholder="请输入节点标题"
              />
              <div className="mt-1 text-xs text-white/40">
                {selectedModel ? formatModelDisplayName(selectedModel) : '手动节点 / 参考节点'}
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenNodeMenu(node.id, { x: event.clientX, y: event.clientY });
              }}
              className="nodrag nopan rounded-full border border-white/10 bg-black/20 px-2 py-1 text-sm text-white/45 transition hover:border-white/20 hover:text-white"
            >
              ⋮
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {node.type === 'image' && isImageSource(nodeValue) ? (
              <img src={nodeValue} alt={node.title} className="nodrag nopan h-56 w-full object-cover" />
            ) : null}

            {node.type === 'video' && isVideoSource(nodeValue) ? (
              <video src={nodeValue} className="nodrag nopan h-60 w-full bg-black object-cover" muted playsInline />
            ) : null}

            {!((node.type === 'image' && isImageSource(nodeValue)) || (node.type === 'video' && isVideoSource(nodeValue))) ? (
              <div className="flex h-56 items-center justify-center px-8 text-center text-sm leading-7 text-white/50">
                {node.type === 'image' ? '生成结果会显示在这里。' : '视频结果会显示在这里。'}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mx-4 mt-3 rounded-[28px] border border-white/10 bg-[#232323]/96 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <div className="flex items-center gap-3">
            {referenceItems.map((item) => (
              isImageSource(item.preview) || isVideoSource(item.preview) ? (
                <img
                  key={item.id}
                  src={item.preview}
                  alt={item.title}
                  className="h-11 w-11 rounded-2xl object-cover"
                />
              ) : (
                <div key={item.id} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[10px] text-white/55">
                  参考
                </div>
              )
            ))}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenAddFromHandle(node.id, 'target');
              }}
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-lg text-white/70"
            >
              +
            </button>
          </div>

          <textarea
            value={node.prompt || ''}
            onChange={(event) => data.onPatchNode(node.id, { prompt: event.target.value })}
            className="nodrag nopan mt-4 min-h-[72px] w-full resize-none bg-transparent text-lg leading-8 text-slate-100 outline-none"
            placeholder={node.type === 'image' ? '描述你想要生成的画面...' : '描述镜头、动作和节奏...'}
          />

          <div className="mt-4 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/10 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nodeModels.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onToggleModelPicker(node.id);
                  }}
                  className="nodrag nopan rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white"
                >
                  {selectedModel ? formatModelDisplayName(selectedModel) : '选择模型'}
                </button>
                {isModelPickerOpen ? (
                  <div className="absolute bottom-full left-0 z-30 mb-3 w-72 rounded-[24px] border border-white/10 bg-[#12151d]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">模型库</div>
                    <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          data.onModelChange(node.id, '');
                          data.onToggleModelPicker(node.id);
                        }}
                        className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                          !selectedModel
                            ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                        }`}
                      >
                        <div className="font-semibold">手动 / 参考节点</div>
                        <div className="mt-1 text-xs text-white/55">跳过模型执行，作为内容或素材容器。</div>
                      </button>
                      {groupedNodeModels.map((group) => (
                        <div key={group.familyId} className="grid gap-2">
                          <div className="px-1 text-[10px] uppercase tracking-[0.22em] text-white/30">{group.familyName}</div>
                          {group.deployments.map((model) => (
                            <button
                              key={model.deploymentId}
                              type="button"
                              onClick={() => {
                                data.onModelChange(node.id, model.deploymentId);
                                data.onToggleModelPicker(node.id);
                              }}
                              className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                selectedModel?.deploymentId === model.deploymentId
                                  ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                                  : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                              }`}
                            >
                              <div className="font-semibold">{formatModelDisplayName(model)}</div>
                              <div className="mt-1 text-xs text-white/55">
                                {summarizeModelInputSupport(model).slice(0, 2).join(' · ') || `${NODE_BADGES[node.type]}生成`}
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {primaryEntries.map(([fieldKey, definition]) => (
              <CompactFieldControl
                key={fieldKey}
                fieldKey={fieldKey}
                definition={definition as CanvasConfigFieldDefinition}
                value={node.params?.[fieldKey]}
                onChange={(nextValue) => data.onParamChange(node.id, fieldKey, nextValue)}
              />
            ))}
            {(node.type === 'video' ? videoSummary : paramSummaries).slice(0, 2).map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
                {item}
              </span>
            ))}
            {node.type === 'video' && data.canStoreVideoToShot && isVideoSource(nodeValue) && data.onStoreVideoToShot ? (
              <button
                type="button"
                onClick={() => data.onStoreVideoToShot?.(node.id)}
                className="nodrag nopan shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100"
              >
                存为分镜
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => data.onRunNode?.(node.id)}
              className="nodrag nopan ml-auto shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              {node.runStatus === 'running' ? '运行中...' : '生成'}
            </button>
          </div>

          {secondaryEntries.length > 0 ? (
            <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm text-slate-100">更多设置</summary>
              <div className="mt-3 grid gap-3">
                {secondaryEntries.map(([fieldKey, definition]) => (
                  <SchemaFieldControl
                    key={fieldKey}
                    fieldKey={fieldKey}
                    definition={definition as CanvasConfigFieldDefinition}
                    value={node.params?.[fieldKey]}
                    onChange={(nextValue) => data.onParamChange(node.id, fieldKey, nextValue)}
                  />
                ))}
              </div>
            </details>
          ) : null}

          {node.error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100">
              {node.error}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-visible">
      {showHandles && enabledInputDefinitions.length > 0 ? (
        <div
          className="pointer-events-none absolute -left-8 top-1/2 z-20 flex -translate-y-1/2 items-center"
        >
          <div className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-white/35 hover:text-white">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenAddFromHandle(node.id, 'target');
              }}
              className="nodrag nopan flex h-full w-full items-center justify-center"
            >
              <span className="leading-none">+</span>
            </button>
            <Handle
              type="target"
              position={Position.Left}
              className="!absolute !inset-0 !h-full !w-full !translate-x-0 !border-0 !bg-transparent !opacity-0"
            />
          </div>
        </div>
      ) : null}

      {showHandles ? (
        <div
          className="pointer-events-none absolute -right-8 top-1/2 z-20 flex -translate-y-1/2 items-center"
        >
          <div className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-white/35 hover:text-white">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onOpenAddFromHandle(node.id, 'source');
              }}
              className="nodrag nopan flex h-full w-full items-center justify-center"
            >
              <span className="leading-none">+</span>
            </button>
            <Handle
              id="output"
              type="source"
              position={Position.Right}
              className="!absolute !inset-0 !h-full !w-full !translate-x-0 !border-0 !bg-transparent !opacity-0"
            />
          </div>
        </div>
      ) : null}

      <div
        onMouseEnter={() => data.onHoverNode(node.id)}
        onMouseLeave={() => data.onHoverNode(null)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          data.onOpenNodeMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        className={`workflow-flow-node rounded-[28px] border bg-gradient-to-br p-4 shadow-[0_22px_55px_rgba(0,0,0,0.35)] transition ${
          NODE_COLORS[node.type]
        } ${selected ? 'ring-2 ring-white/60' : 'hover:border-white/20'}`}
      >
        <div className="workflow-flow-node__drag-handle flex cursor-grab items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-white/60">
                {NODE_BADGES[node.type]}
              </span>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.22em] ${statusBadgeClass(node.runStatus)}`}>
                {formatRunStatus(node.runStatus)}
              </span>
            </div>
            <div>
              {selected ? (
                <input
                  value={node.title}
                  onChange={(event) => data.onPatchNode(node.id, { title: event.target.value })}
                  onClick={(event) => event.stopPropagation()}
                  className="nodrag nopan w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-base font-semibold text-white outline-none"
                  placeholder="请输入节点标题"
                />
              ) : (
                <div className="text-base font-semibold text-white">{node.title}</div>
              )}
              <div className="mt-1 text-xs text-white/40">
                {selectedModel ? formatModelDisplayName(selectedModel) : '手动节点 / 参考节点'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onOpenNodeMenu(node.id, { x: event.clientX, y: event.clientY });
            }}
            className="nodrag nopan rounded-full border border-white/10 bg-black/20 px-2 py-1 text-sm text-white/45 transition hover:border-white/20 hover:text-white"
          >
            ⋮
          </button>
        </div>

        {!selected ? (
          <div className="mt-4 space-y-3">
            {node.type === 'image' && isImageSource(previewSource) ? (
              <img src={previewSource} alt={node.title} className="nodrag nopan h-28 w-full rounded-2xl object-cover" />
            ) : null}
            {node.type === 'video' && isVideoSource(previewSource) ? (
              <video src={previewSource} className="nodrag nopan h-28 w-full rounded-2xl bg-black object-cover" muted playsInline />
            ) : null}
            {node.type === 'audio' && isAudioSource(node.content) ? (
              <audio controls src={node.content} className="nodrag nopan w-full" />
            ) : null}
            <div
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200"
              style={previewClampStyle(node.type === 'text' ? 4 : 4)}
            >
              {previewText}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
                {selectedModel ? formatModelDisplayName(selectedModel) : '未配置模型'}
              </span>
              {(node.type === 'video' ? videoSummary : paramSummaries).slice(0, 3).map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : node.type === 'audio' ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="nodrag nopan flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/10">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  data.onUploadAudio?.(node.id, event.target.files?.[0] || null);
                  event.target.value = '';
                }}
              />
              {data.uploadingNodeId === node.id
                ? '上传中...'
                : isAudioSource(node.content)
                  ? '替换音频参考'
                  : '上传音频参考'}
            </label>

            {isAudioSource(node.content) ? (
              <audio controls src={node.content} className="nodrag nopan w-full" />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
                音频节点当前只作为参考素材保留，不纳入通用生成主线。
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {node.type === 'image' && isImageSource(nodeValue) ? (
              <img src={nodeValue} alt={node.title} className="nodrag nopan h-48 w-full rounded-[26px] object-cover" />
            ) : null}

            {node.type === 'video' && isVideoSource(nodeValue) ? (
              <video src={nodeValue} className="nodrag nopan h-52 w-full rounded-[26px] bg-black object-cover" muted playsInline />
            ) : null}

            {nodeModels.length > 0 && !usesMediaComposer ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onToggleModelPicker(node.id);
                  }}
                  className="nodrag nopan flex w-full items-center justify-between rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/55">模型</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {selectedModel ? formatModelDisplayName(selectedModel) : '选择模型'}
                    </div>
                    <div className="mt-1 text-xs text-cyan-100/70">
                      {selectedModel
                        ? (summarizeModelInputSupport(selectedModel).slice(0, 2).join(' · ') || `${NODE_BADGES[node.type]}生成`)
                        : `可用 ${nodeModels.length} 个模型`}
                    </div>
                  </div>
                  <span className="text-xs text-cyan-100/70">{isModelPickerOpen ? '收起' : '切换'}</span>
                </button>

                {isModelPickerOpen ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-3 rounded-[24px] border border-white/10 bg-[#12151d]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">模型库</div>
                    <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          data.onModelChange(node.id, '');
                          data.onToggleModelPicker(node.id);
                        }}
                        className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                          !selectedModel
                            ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                            : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                        }`}
                      >
                        <div className="font-semibold">手动 / 参考节点</div>
                        <div className="mt-1 text-xs text-white/55">跳过模型执行，作为内容或素材容器。</div>
                      </button>
                      {groupedNodeModels.map((group) => (
                        <div key={group.familyId} className="grid gap-2">
                          <div className="px-1 text-[10px] uppercase tracking-[0.22em] text-white/30">{group.familyName}</div>
                          {group.deployments.map((model) => (
                            <button
                              key={model.deploymentId}
                              type="button"
                              onClick={() => {
                                data.onModelChange(node.id, model.deploymentId);
                                data.onToggleModelPicker(node.id);
                              }}
                              className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                selectedModel?.deploymentId === model.deploymentId
                                  ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                                  : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                              }`}
                            >
                              <div className="font-semibold">{formatModelDisplayName(model)}</div>
                              <div className="mt-1 text-xs text-white/55">
                                {summarizeModelInputSupport(model).slice(0, 2).join(' · ') || `${NODE_BADGES[node.type]}生成`}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {summarizeModelInputSupport(model).slice(0, 2).map((item) => (
                                  <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-100">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedModel ? (
              <>
                {generationModes.length > 1 ? (
                  <div className="grid gap-2">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">生成方式</div>
                    <div className="flex flex-wrap gap-2">
                      {generationModes.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => data.onModeChange(node.id, mode.id)}
                          className={`nodrag nopan rounded-full px-3 py-2 text-sm ${
                            activeGenerationMode?.id === mode.id
                              ? 'bg-white text-black'
                              : 'border border-white/10 bg-white/[0.04] text-slate-100'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {node.type === 'text' && nodeValue ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">当前预览</div>
                    <div style={previewClampStyle(4)}>
                      {nodeValue}
                    </div>
                  </div>
                ) : null}

                {node.type === 'image' || node.type === 'video' ? (
                  <div className="rounded-[28px] border border-white/10 bg-[#232323]/95 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center gap-3">
                      {referenceItems.map((item) => (
                        isImageSource(item.preview) || isVideoSource(item.preview) ? (
                          <img
                            key={item.id}
                            src={item.preview}
                            alt={item.title}
                            className="h-11 w-11 rounded-2xl object-cover"
                          />
                        ) : (
                          <div key={item.id} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[10px] text-white/55">
                            参考
                          </div>
                        )
                      ))}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          data.onOpenAddFromHandle(node.id, 'target');
                        }}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-lg text-white/70"
                      >
                        +
                      </button>
                    </div>

                    <textarea
                      value={node.prompt || ''}
                      onChange={(event) => data.onPatchNode(node.id, { prompt: event.target.value })}
                      className="nodrag nopan mt-4 min-h-[76px] w-full resize-none bg-transparent text-lg leading-8 text-slate-100 outline-none"
                      placeholder={node.type === 'image' ? '描述你想要生成的画面...' : '描述镜头、动作和节奏...'}
                    />

                    <div className="mt-4 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/10 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {nodeModels.length > 0 ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              data.onToggleModelPicker(node.id);
                            }}
                            className="nodrag nopan rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white"
                          >
                            {selectedModel ? formatModelDisplayName(selectedModel) : '选择模型'}
                          </button>
                          {isModelPickerOpen ? (
                            <div className="absolute bottom-full left-0 z-30 mb-3 w-72 rounded-[24px] border border-white/10 bg-[#12151d]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur">
                              <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">模型库</div>
                              <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    data.onModelChange(node.id, '');
                                    data.onToggleModelPicker(node.id);
                                  }}
                                  className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                    !selectedModel
                                      ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                                      : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                                  }`}
                                >
                                  <div className="font-semibold">手动 / 参考节点</div>
                                  <div className="mt-1 text-xs text-white/55">跳过模型执行，作为内容或素材容器。</div>
                                </button>
                                {groupedNodeModels.map((group) => (
                                  <div key={group.familyId} className="grid gap-2">
                                    <div className="px-1 text-[10px] uppercase tracking-[0.22em] text-white/30">{group.familyName}</div>
                                    {group.deployments.map((model) => (
                                      <button
                                        key={model.deploymentId}
                                        type="button"
                                        onClick={() => {
                                          data.onModelChange(node.id, model.deploymentId);
                                          data.onToggleModelPicker(node.id);
                                        }}
                                        className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                          selectedModel?.deploymentId === model.deploymentId
                                            ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                                            : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                                        }`}
                                      >
                                        <div className="font-semibold">{formatModelDisplayName(model)}</div>
                                        <div className="mt-1 text-xs text-white/55">
                                          {summarizeModelInputSupport(model).slice(0, 2).join(' · ') || `${NODE_BADGES[node.type]}生成`}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {primaryEntries.map(([fieldKey, definition]) => (
                        <CompactFieldControl
                          key={fieldKey}
                          fieldKey={fieldKey}
                          definition={definition as CanvasConfigFieldDefinition}
                          value={node.params?.[fieldKey]}
                          onChange={(nextValue) => data.onParamChange(node.id, fieldKey, nextValue)}
                        />
                      ))}
                      {node.type === 'video'
                        ? videoSummary.slice(0, 2).map((item) => (
                          <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
                            {item}
                          </span>
                        ))
                        : paramSummaries.slice(0, 2).map((item) => (
                          <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
                            {item}
                          </span>
                        ))}
                      <button
                        type="button"
                        onClick={() => data.onRunNode?.(node.id)}
                        className="nodrag nopan ml-auto shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                      >
                        {node.runStatus === 'running' ? '运行中...' : '生成'}
                      </button>
                    </div>

                    {secondaryEntries.length > 0 ? (
                      <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <summary className="cursor-pointer text-sm text-slate-100">更多设置</summary>
                        <div className="mt-3 grid gap-3">
                          {secondaryEntries.map(([fieldKey, definition]) => (
                            <SchemaFieldControl
                              key={fieldKey}
                              fieldKey={fieldKey}
                              definition={definition as CanvasConfigFieldDefinition}
                              value={node.params?.[fieldKey]}
                              onChange={(nextValue) => data.onParamChange(node.id, fieldKey, nextValue)}
                            />
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <label className="grid gap-2 text-xs text-slate-300">
                      <span>{node.type === 'text' ? '内容 / Prompt' : 'Prompt'}</span>
                      <textarea
                        value={node.prompt || ''}
                        onChange={(event) => data.onPatchNode(node.id, { prompt: event.target.value })}
                        className={`nodrag nopan resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none ${
                          node.type === 'text' ? 'min-h-[72px]' : 'min-h-[92px]'
                        }`}
                        placeholder="输入节点自己的生成提示，也可以通过连线接收上游文本。"
                      />
                    </label>

                    {visibleInputDefinitions.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {visibleInputDefinitions.map(([inputKey, definition]) => {
                          const slotItems = connectedInputs[inputKey]?.items || [];
                          const acceptedTypes = summarizeAcceptedInputTypes(definition.accepts);
                          return (
                            <div key={inputKey} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">{definition.label || inputKey}</div>
                              {acceptedTypes ? <div className="mt-1 text-[10px] text-white/35">{acceptedTypes}</div> : null}
                              <div className="mt-2 text-xs text-slate-200">
                                {slotItems.length > 0
                                  ? slotItems.map((item) => item.node.title).join(' / ')
                                  : acceptedTypes ? `等待${acceptedTypes}连线` : '等待连线'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {inputBadges.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {inputBadges.map((badge) => (
                          <span key={badge} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-200">
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {primaryEntries.length > 0 ? (
                      <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">常用设置</div>
                        {primaryEntries.map(([fieldKey, definition]) => (
                          <SchemaFieldControl
                            key={fieldKey}
                            fieldKey={fieldKey}
                            definition={definition as CanvasConfigFieldDefinition}
                            value={node.params?.[fieldKey]}
                            onChange={(nextValue) => data.onParamChange(node.id, fieldKey, nextValue)}
                          />
                        ))}
                      </div>
                    ) : null}

                    {secondaryEntries.length > 0 ? (
                      <details className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <summary className="cursor-pointer text-sm text-slate-100">更多设置</summary>
                        <div className="mt-3 grid gap-3">
                          {secondaryEntries.map(([fieldKey, definition]) => (
                            <SchemaFieldControl
                              key={fieldKey}
                              fieldKey={fieldKey}
                              definition={definition as CanvasConfigFieldDefinition}
                              value={node.params?.[fieldKey]}
                              onChange={(nextValue) => data.onParamChange(node.id, fieldKey, nextValue)}
                            />
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </>
                )}

                {!usesMediaComposer && node.type !== 'video' && paramSummaries.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {paramSummaries.map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}

                {!usesMediaComposer && node.type === 'video' && videoSummary.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {videoSummary.map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {!usesMediaComposer ? (
                    <button
                      type="button"
                      onClick={() => data.onRunNode?.(node.id)}
                      className="nodrag nopan rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    >
                      {node.runStatus === 'running' ? '运行中...' : '运行节点'}
                    </button>
                  ) : null}

                  {node.type === 'video' && data.canStoreVideoToShot && isVideoSource(nodeValue) && data.onStoreVideoToShot ? (
                    <button
                      type="button"
                      onClick={() => data.onStoreVideoToShot?.(node.id)}
                      className="nodrag nopan rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100"
                    >
                      存为分镜
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <label className="grid gap-2 text-xs text-slate-300">
                <span>{node.type === 'text' ? '内容' : '素材地址 / 结果地址'}</span>
                <textarea
                  value={node.content}
                  onChange={(event) => data.onPatchNode(node.id, { content: event.target.value })}
                  className="nodrag nopan min-h-[120px] resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none"
                  placeholder={node.type === 'text' ? '输入文本内容，作为上游提示或说明。' : '输入 URL，或把模型切到可执行状态后运行生成。'}
                />
              </label>
            )}

            {node.error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100">
                {node.error}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

const nodeTypes = {
  workflow: WorkflowFlowNodeCard,
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

  const openAddNodeMenu = React.useCallback((clientX: number, clientY: number, explicitFlowPosition?: { x: number; y: number }) => {
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
  }, [flowInstance, onSelectNode]);

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
