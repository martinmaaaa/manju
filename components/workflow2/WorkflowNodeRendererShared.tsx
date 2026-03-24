import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { CanvasConfigFieldDefinition, CanvasNode, ModelDefinition } from '../../types/workflowApp';
import {
  collectCanvasNodeInputs,
  getNodeEnabledInputDefinitions,
  getNodeGenerationMode,
  getVisibleNodeInputDefinitions,
  selectCanvasModels,
  summarizeNodeParams,
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
import type { WorkflowFlowNodeData } from './WorkflowFlowTypes';

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
}

const CORE_VIDEO_FIELD_ORDER = ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'];

export function isImageSource(value: string) {
  return /^(data:image\/[\w.+-]+;base64,|https?:\/\/)/i.test(String(value || '').trim());
}

export function isVideoSource(value: string) {
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

export function summarizeAcceptedInputTypes(accepts: string[] | undefined) {
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

export function previewClampStyle(lineCount: number): React.CSSProperties {
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

export const CompactFieldControl: React.FC<{
  fieldKey: string;
  definition: CanvasConfigFieldDefinition;
  value: unknown;
  onChange: (nextValue: string | number | boolean) => void;
}> = ({ fieldKey, definition, value, onChange }) => {
  const label = definition.label || fieldKey;

  if (Array.isArray(definition.enum) && definition.enum.length > 0) {
    return (
      <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-100">
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
        className="nodrag nopan rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-100"
      >
        {label} · {formatCompactFieldValue(Boolean(value))}
      </button>
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-100">
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
    };
  }

  if (!model) {
    return {
      id: 'fallback',
      primaryFieldKeys: [],
      secondaryFieldKeys: [],
    };
  }

  if (node.type === 'text') {
    return {
      id: 'text-gemini',
      primaryFieldKeys: ['temperature', 'maxOutputTokens'],
      secondaryFieldKeys: [],
    };
  }

  if (node.type === 'image') {
    if (model.familyId.includes('banana')) {
      return {
        id: 'image-banana',
        primaryFieldKeys: ['aspectRatio', 'imageSize'],
        secondaryFieldKeys: [],
      };
    }

    return {
      id: 'image-default',
      primaryFieldKeys: ['aspectRatio', 'imageSize'],
      secondaryFieldKeys: [],
    };
  }

  if (node.type === 'video') {
    if (model.familyId === 'seedance-2.0') {
      return {
        id: 'video-seedance',
        primaryFieldKeys: ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'],
        secondaryFieldKeys: [],
      };
    }

    return {
      id: 'video-standard',
      primaryFieldKeys: ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'],
      secondaryFieldKeys: ['generateMultiClip'],
    };
  }

  return {
    id: 'fallback',
    primaryFieldKeys: [],
    secondaryFieldKeys: [],
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

export type WorkflowNodeContext = {
  data: WorkflowFlowNodeData;
  selected: boolean;
  node: CanvasNode;
  selectedModel: ModelDefinition | null | undefined;
  nodeModels: ModelDefinition[];
  groupedNodeModels: ReturnType<typeof groupModelsByFamily>;
  generationModes: ReturnType<typeof getModelGenerationModes>;
  activeGenerationMode: ReturnType<typeof getNodeGenerationMode>;
  enabledInputDefinitions: ReturnType<typeof getNodeEnabledInputDefinitions>;
  visibleInputDefinitions: ReturnType<typeof getVisibleNodeInputDefinitions>;
  connectedInputs: ReturnType<typeof collectCanvasNodeInputs>;
  inputBadges: string[];
  paramSummaries: string[];
  videoSummary: string[];
  nodeValue: string;
  previewSource: string;
  previewText: string;
  primaryEntries: Array<[string, CanvasConfigFieldDefinition]>;
  secondaryEntries: Array<[string, CanvasConfigFieldDefinition]>;
  isModelPickerOpen: boolean;
  isHovered: boolean;
  showHandles: boolean;
  referenceItems: Array<{ id: string; title: string; preview: string }>;
};

const NodeHandleButtons: React.FC<{ ctx: WorkflowNodeContext }> = ({ ctx }) => (
  <>
    <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2">
      {ctx.enabledInputDefinitions.length > 0
        ? ctx.enabledInputDefinitions.map(([inputKey]) => (
          <Handle
            key={inputKey}
            id={inputKey}
            type="target"
            position={Position.Left}
            className="!absolute !left-0 !top-0 !h-8 !w-8 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
          />
        ))
        : (
          <Handle
            id="target"
            type="target"
            position={Position.Left}
            className="!absolute !left-0 !top-0 !h-8 !w-8 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
          />
        )}
      {ctx.showHandles && ctx.enabledInputDefinitions.length > 0 ? (
        <div className="pointer-events-none absolute left-0 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center">
          <div className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-white/35 hover:text-white">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                ctx.data.onOpenAddFromHandle(ctx.node.id, 'target');
              }}
              className="nodrag nopan flex h-full w-full items-center justify-center"
            >
              <span className="leading-none">+</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>

    <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2">
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="!absolute !left-0 !top-0 !h-8 !w-8 !-translate-x-1/2 !-translate-y-1/2 !border-0 !bg-transparent !opacity-0"
      />
      {ctx.showHandles ? (
        <div className="pointer-events-none absolute left-0 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center">
          <div className="pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-white/35 hover:text-white">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                ctx.data.onOpenAddFromHandle(ctx.node.id, 'source');
              }}
              className="nodrag nopan flex h-full w-full items-center justify-center"
            >
              <span className="leading-none">+</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  </>
);

export const ModelPicker: React.FC<{
  ctx: WorkflowNodeContext;
  compact?: boolean;
}> = ({ ctx, compact = false }) => {
  if (ctx.nodeModels.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          ctx.data.onToggleModelPicker(ctx.node.id);
        }}
        className={compact
          ? 'nodrag nopan rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white'
          : 'nodrag nopan flex w-full items-center justify-between rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3 text-left'}
      >
        {compact ? (
          <span>{ctx.selectedModel ? formatModelDisplayName(ctx.selectedModel) : '选择模型'}</span>
        ) : (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-100/55">模型</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {ctx.selectedModel ? formatModelDisplayName(ctx.selectedModel) : '选择模型'}
              </div>
              <div className="mt-1 text-xs text-cyan-100/70">
                {ctx.selectedModel
                  ? (summarizeModelInputSupport(ctx.selectedModel).slice(0, 2).join(' · ') || `${NODE_BADGES[ctx.node.type]}生成`)
                  : `可用 ${ctx.nodeModels.length} 个模型`}
              </div>
            </div>
            <span className="text-xs text-cyan-100/70">{ctx.isModelPickerOpen ? '收起' : '切换'}</span>
          </>
        )}
      </button>

      {ctx.isModelPickerOpen ? (
        <div className={`absolute z-30 rounded-[24px] border border-white/10 bg-[#12151d]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur ${compact ? 'bottom-full left-0 mb-3 w-72' : 'left-0 right-0 top-full mt-3'}`}>
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">模型库</div>
          <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
            <button
              type="button"
              onClick={() => {
                ctx.data.onModelChange(ctx.node.id, '');
                ctx.data.onToggleModelPicker(ctx.node.id);
              }}
              className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                !ctx.selectedModel
                  ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                  : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
              }`}
            >
              <div className="font-semibold">手动 / 参考节点</div>
              <div className="mt-1 text-xs text-white/55">跳过模型执行，作为内容或素材容器。</div>
            </button>
            {ctx.groupedNodeModels.map((group) => (
              <div key={group.familyId} className="grid gap-2">
                <div className="px-1 text-[10px] uppercase tracking-[0.22em] text-white/30">{group.familyName}</div>
                {group.deployments.map((model) => (
                  <button
                    key={model.deploymentId}
                    type="button"
                    onClick={() => {
                      ctx.data.onModelChange(ctx.node.id, model.deploymentId);
                      ctx.data.onToggleModelPicker(ctx.node.id);
                    }}
                    className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      ctx.selectedModel?.deploymentId === model.deploymentId
                        ? 'border-cyan-300/25 bg-cyan-300/[0.08] text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]'
                    }`}
                  >
                    <div className="font-semibold">{formatModelDisplayName(model)}</div>
                    <div className="mt-1 text-xs text-white/55">
                      {summarizeModelInputSupport(model).slice(0, 2).join(' · ') || `${NODE_BADGES[ctx.node.type]}生成`}
                    </div>
                    {!compact ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {summarizeModelInputSupport(model).slice(0, 2).map((item) => (
                          <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-100">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const NodeShell: React.FC<{
  ctx: WorkflowNodeContext;
  children: React.ReactNode;
  detachedPanel?: React.ReactNode;
}> = ({ ctx, children, detachedPanel }) => (
  <div
    className="relative overflow-visible"
    onMouseEnter={() => ctx.data.onHoverNode(ctx.node.id)}
    onMouseLeave={() => ctx.data.onHoverNode(null)}
    onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      ctx.data.onOpenNodeMenu(ctx.node.id, { x: event.clientX, y: event.clientY });
    }}
  >
    <div
      className={`workflow-flow-node relative rounded-[28px] border bg-gradient-to-br p-4 shadow-[0_22px_55px_rgba(0,0,0,0.35)] transition ${
        NODE_COLORS[ctx.node.type]
      } ${ctx.selected ? 'ring-2 ring-white/60' : 'hover:border-white/20'}`}
    >
      <NodeHandleButtons ctx={ctx} />
      <div className="workflow-flow-node__drag-handle flex cursor-grab items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-white/60">
              {NODE_BADGES[ctx.node.type]}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.22em] ${statusBadgeClass(ctx.node.runStatus)}`}>
              {formatRunStatus(ctx.node.runStatus)}
            </span>
          </div>
          <div>
            {ctx.selected ? (
              <input
                value={ctx.node.title}
                onChange={(event) => ctx.data.onPatchNode(ctx.node.id, { title: event.target.value })}
                onClick={(event) => event.stopPropagation()}
                className="nodrag nopan w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-base font-semibold text-white outline-none"
                placeholder="请输入节点标题"
              />
            ) : (
              <div className="text-base font-semibold text-white">{ctx.node.title}</div>
            )}
            <div className="mt-1 text-xs text-white/40">
              {ctx.selectedModel ? formatModelDisplayName(ctx.selectedModel) : '手动节点 / 参考节点'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            ctx.data.onOpenNodeMenu(ctx.node.id, { x: event.clientX, y: event.clientY });
          }}
          className="nodrag nopan rounded-full border border-white/10 bg-black/20 px-2 py-1 text-sm text-white/45 transition hover:border-white/20 hover:text-white"
        >
          ⋮
        </button>
      </div>

      {children}
    </div>

    {detachedPanel}
  </div>
);

export const CollapsedCardSummary: React.FC<{
  ctx: WorkflowNodeContext;
  media?: React.ReactNode;
}> = ({ ctx, media }) => (
  <div className="mt-4 space-y-3">
    {media}
    <div
      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200"
      style={previewClampStyle(4)}
    >
      {ctx.previewText}
    </div>
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
        {ctx.selectedModel ? formatModelDisplayName(ctx.selectedModel) : '未配置模型'}
      </span>
      {(ctx.node.type === 'video' ? ctx.videoSummary : ctx.paramSummaries).slice(0, 3).map((item) => (
        <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
          {item}
        </span>
      ))}
    </div>
  </div>
);

export function buildWorkflowNodeContext(
  data: WorkflowFlowNodeData,
  selected: boolean,
): WorkflowNodeContext {
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
  const referenceItems = Object.values(connectedInputs)
    .flatMap((bucket) => bucket.items)
    .slice(0, 3)
    .map((item) => ({
      id: item.node.id,
      title: item.node.title,
      preview: getNodePreviewSource(item.node),
    }));

  return {
    data,
    selected,
    node,
    selectedModel,
    nodeModels,
    groupedNodeModels,
    generationModes,
    activeGenerationMode,
    enabledInputDefinitions,
    visibleInputDefinitions,
    connectedInputs,
    inputBadges,
    paramSummaries,
    videoSummary,
    nodeValue,
    previewSource,
    previewText,
    primaryEntries,
    secondaryEntries,
    isModelPickerOpen,
    isHovered,
    showHandles,
    referenceItems,
  };
}
