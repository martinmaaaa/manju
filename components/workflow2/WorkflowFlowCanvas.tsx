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
  ModelDefinition,
  StageConfigMap,
} from '../../types/workflowApp';
import {
  buildCanvasConnectionId,
  buildCanvasNodeModelChangePatch,
  buildCanvasNodeParamPatch,
  collectCanvasNodeInputs,
  getNodeEnabledInputDefinitions,
  getNodeGenerationMode,
  getVisibleNodeInputDefinitions,
  selectCanvasModels,
  summarizeNodeParams,
  validateCanvasConnection,
} from '../../services/workflow/runtime/canvasGraphHelpers';
import {
  describeModelRuntime,
  findModelByIdentifier,
  formatModelDisplayName,
  getModelGenerationModes,
  groupModelsByFamily,
  summarizeModelConfigFields,
  summarizeModelInputSupport,
} from '../../services/workflow/runtime/modelDeploymentHelpers';
import { isAudioSource } from '../../services/workflow/runtime/workspaceMediaHelpers';
import { SchemaFieldControl } from './SchemaFieldControl';

interface WorkflowFlowCanvasProps {
  content: EpisodeWorkspaceContent;
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  selectedNodeId: string | null;
  currentShotId?: string | null;
  currentViewport?: { x: number; y: number; zoom: number } | null;
  onSelectNode: (nodeId: string | null) => void;
  onChangeContent: (
    buildNextContent: (content: EpisodeWorkspaceContent) => EpisodeWorkspaceContent,
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
  settingsNodeId: string | null;
  canStoreVideoToShot?: boolean;
  onSelectNode: (nodeId: string) => void;
  onPatchNode: (nodeId: string, patch: Partial<CanvasNode>) => void;
  onModelChange: (nodeId: string, nextModelId: string) => void;
  onModeChange: (nodeId: string, nextModeId: string) => void;
  onParamChange: (nodeId: string, fieldKey: string, nextValue: string | number | boolean) => void;
  onUploadAudio?: (nodeId: string, file?: File | null) => void;
  onToggleSettings: (nodeId: string) => void;
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

const CORE_VIDEO_FIELD_ORDER = ['ratio', 'resolution', 'durationSeconds', 'duration', 'generateAudio'];

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

function isCoreVideoField(fieldKey: string) {
  return CORE_VIDEO_FIELD_ORDER.includes(fieldKey);
}

function formatRunStatus(status: CanvasNode['runStatus']) {
  if (status === 'running') return '运行中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  return '待运行';
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
  const isSettingsOpen = data.settingsNodeId === node.id;
  const commonVideoConfigEntries = selectedModel
    ? Object.entries(selectedModel.configSchema || {}).filter(([fieldKey]) => isCoreVideoField(fieldKey))
    : [];
  const advancedVideoConfigEntries = selectedModel
    ? Object.entries(selectedModel.configSchema || {}).filter(([fieldKey]) => !isCoreVideoField(fieldKey))
    : [];

  return (
    <div className="relative overflow-visible">
      {enabledInputDefinitions.map(([inputKey, definition], index) => {
        const topPercent = ((index + 1) / (enabledInputDefinitions.length + 1)) * 100;
        return (
          <div
            key={`${node.id}-${inputKey}`}
            className="pointer-events-none absolute -left-3 z-20 flex items-center gap-2"
            style={{ top: `${topPercent}%`, transform: 'translateY(-50%)' }}
          >
            <Handle
              id={inputKey}
              type="target"
              position={Position.Left}
              className="!pointer-events-auto !h-3 !w-3 !border-2 !border-white/60 !bg-[#73e0ff]"
            />
            <span className="rounded-full border border-white/10 bg-[#05070d]/90 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
              {definition.label || inputKey}
            </span>
          </div>
        );
      })}

      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white/60 !bg-[#f472b6]"
      />

      <div
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
              <div className="text-base font-semibold text-white">{node.title}</div>
              <div className="mt-1 text-xs text-white/40">
                {selectedModel ? formatModelDisplayName(selectedModel) : '手动节点 / 参考节点'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-white/25">
            <span className="text-lg leading-none">⋮</span>
            <span className="text-lg leading-none">⋮</span>
          </div>
        </div>

        {node.type === 'audio' ? (
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
              <img src={nodeValue} alt={node.title} className="nodrag nopan h-32 w-full rounded-2xl object-cover" />
            ) : null}

            {node.type === 'video' && isVideoSource(nodeValue) ? (
              <video src={nodeValue} className="nodrag nopan h-32 w-full rounded-2xl bg-black object-cover" muted playsInline />
            ) : null}

            {nodeModels.length > 0 ? (
              <label className="grid gap-2 text-xs text-slate-300">
                <span>模型</span>
                <select
                  value={node.modelId || ''}
                  onChange={(event) => data.onModelChange(node.id, event.target.value)}
                  className="nodrag nopan rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="">手动 / 参考节点</option>
                  {groupedNodeModels.map((group) => (
                    <optgroup key={group.familyId} label={group.familyName}>
                      {group.deployments.map((model) => (
                        <option key={model.deploymentId} value={model.deploymentId}>
                          {formatModelDisplayName(model)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : null}

            {selectedModel ? (
              <>
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/65">Deployment</div>
                  <div className="mt-2 text-sm font-semibold text-white">{formatModelDisplayName(selectedModel)}</div>
                  <div className="mt-1 text-xs text-cyan-100/70">{describeModelRuntime(selectedModel)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summarizeModelInputSupport(selectedModel).map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
                        {item}
                      </span>
                    ))}
                    {summarizeModelConfigFields(selectedModel).slice(0, 2).map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <label className="grid gap-2 text-xs text-slate-300">
                  <span>Prompt</span>
                  <textarea
                    value={node.prompt || ''}
                    onChange={(event) => data.onPatchNode(node.id, { prompt: event.target.value })}
                    className="nodrag nopan min-h-[92px] resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none"
                    placeholder="输入节点自己的生成提示，也可以通过连线接收上游文本。"
                  />
                </label>

                {node.type === 'video' ? (
                  <div className="relative space-y-3">
                    {visibleInputDefinitions.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {visibleInputDefinitions.map(([inputKey, definition]) => {
                          const slotItems = connectedInputs[inputKey]?.items || [];
                          const acceptedTypes = summarizeAcceptedInputTypes(definition.accepts);
                          return (
                            <div key={inputKey} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                              <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">{definition.label || inputKey}</div>
                              {acceptedTypes ? (
                                <div className="mt-1 text-[10px] text-white/35">{acceptedTypes}</div>
                              ) : null}
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

                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-semibold text-white">
                        {selectedModel ? formatModelDisplayName(selectedModel) : '未选择模型'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-slate-200">
                        {videoSummary.join(' · ') || activeGenerationMode?.summaryLabel || '未设置'}
                      </span>
                      <button
                        type="button"
                        onClick={() => data.onToggleSettings(node.id)}
                        className="nodrag nopan rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-slate-100"
                      >
                        设置
                      </button>
                    </div>

                    {isSettingsOpen ? (
                      <div className="absolute right-0 top-full z-30 mt-3 w-[320px] rounded-[28px] border border-white/10 bg-[#15171c] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                        <div className="text-xs uppercase tracking-[0.28em] text-white/40">设置</div>
                        {generationModes.length > 1 ? (
                          <div className="mt-4 grid gap-2">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">生成方式</div>
                            <div className="grid grid-cols-2 gap-2">
                              {generationModes.map((mode) => (
                                <button
                                  key={mode.id}
                                  type="button"
                                  onClick={() => data.onModeChange(node.id, mode.id)}
                                  className={`nodrag nopan rounded-2xl px-3 py-3 text-sm ${
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

                        {commonVideoConfigEntries.length > 0 ? (
                          <div className="mt-4 grid gap-3">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">常用设置</div>
                            {commonVideoConfigEntries.map(([fieldKey, definition]) => (
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

                        {advancedVideoConfigEntries.length > 0 ? (
                          <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                            <summary className="cursor-pointer text-sm text-slate-100">高级设置</summary>
                            <div className="mt-3 grid gap-3">
                              {advancedVideoConfigEntries.map(([fieldKey, definition]) => (
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
                    ) : null}
                  </div>
                ) : (
                  <>
                    {inputBadges.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {inputBadges.map((badge) => (
                          <span key={badge} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-200">
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : Object.keys(selectedModel.inputSchema || {}).length > 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-slate-400">
                        这个模型支持的输入，需要通过连线从其他节点接入。
                      </div>
                    ) : null}

                    {Object.keys(selectedModel.configSchema || {}).length > 0 ? (
                      <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        {Object.entries(selectedModel.configSchema).map(([fieldKey, definition]) => (
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
                  </>
                )}

                {node.type !== 'video' && paramSummaries.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {paramSummaries.map((item) => (
                      <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}

                {node.type === 'text' && nodeValue ? (
                  <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm leading-6 text-slate-200">
                    {nodeValue}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => data.onRunNode?.(node.id)}
                    className="nodrag nopan rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    {node.runStatus === 'running' ? '运行中...' : '运行节点'}
                  </button>

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
  onAddNodeAt,
  onError,
}) => {
  const nodes = Array.isArray(content.nodes) ? content.nodes : [];
  const connections = Array.isArray(content.connections) ? content.connections : [];
  const [uploadingNodeId, setUploadingNodeId] = React.useState<string | null>(null);
  const [settingsNodeId, setSettingsNodeId] = React.useState<string | null>(null);
  const [flowInstance, setFlowInstance] = React.useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const [contextMenu, setContextMenu] = React.useState<FlowContextMenuState | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
  }, []);

  React.useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handleGlobalPointerDown = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

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
    setSettingsNodeId(null);
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
    setSettingsNodeId(null);
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

  const flowNodes = React.useMemo<FlowNode[]>(() => nodes.map((node) => ({
    id: node.id,
    type: 'workflow',
    position: { x: node.x, y: node.y },
    dragHandle: '.workflow-flow-node__drag-handle',
    selected: selectedNodeId === node.id,
    style: {
      width: node.width,
      minHeight: node.height,
      background: 'transparent',
      border: 'none',
    },
    data: {
      node,
      allNodes: nodes,
      connections,
      models,
      uploadingNodeId,
      settingsNodeId,
      canStoreVideoToShot,
      onSelectNode: (nodeId) => onSelectNode(nodeId),
      onPatchNode: patchNode,
      onModelChange: handleModelChange,
      onModeChange: handleModeChange,
      onParamChange: handleParamChange,
      onUploadAudio: handleAudioUpload,
      onToggleSettings: (nodeId) => setSettingsNodeId((current) => (current === nodeId ? null : nodeId)),
      onRunNode,
      onStoreVideoToShot,
    },
  })), [
    canStoreVideoToShot,
    connections,
    handleAudioUpload,
    handleModeChange,
    handleModelChange,
    handleParamChange,
    models,
    nodes,
    onRunNode,
    onSelectNode,
    onStoreVideoToShot,
    patchNode,
    selectedNodeId,
    settingsNodeId,
    uploadingNodeId,
  ]);

  const flowEdges = React.useMemo<FlowEdge[]>(() => connections.map((connection) => ({
    id: connection.id,
    source: connection.from,
    target: connection.to,
    sourceHandle: 'output',
    targetHandle: connection.inputKey,
    type: 'default',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#73e0ff',
    },
    style: {
      stroke: '#73e0ff',
      strokeWidth: 2,
      opacity: 0.72,
    },
    label: connection.inputKey,
    labelStyle: {
      fill: '#d6f5ff',
      fontSize: 10,
      letterSpacing: '0.08em',
    },
    labelBgStyle: {
      fill: 'rgba(5,7,13,0.92)',
      stroke: 'rgba(255,255,255,0.08)',
      strokeWidth: 1,
      rx: 10,
      ry: 10,
    },
    labelBgPadding: [8, 4],
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

    const validation = validateCanvasConnection(
      sourceNode,
      targetNode,
      models,
      connections,
      connection.targetHandle || undefined,
    );

    if (!validation.valid) {
      onError?.(validation.error || '无法创建连接。');
      return;
    }

    const resolvedInputKey = validation.resolvedInputKey || connection.targetHandle;
    if (!resolvedInputKey) {
      onError?.('缺少目标输入槽位。');
      return;
    }

    onChangeContent((currentContent) => ({
      ...currentContent,
      nodes: Array.isArray(currentContent.nodes) ? currentContent.nodes : [],
      connections: [
        ...(Array.isArray(currentContent.connections) ? currentContent.connections : []),
        {
          id: buildCanvasConnectionId(sourceNode.id, targetNode.id, resolvedInputKey),
          from: sourceNode.id,
          to: targetNode.id,
          inputKey: resolvedInputKey,
          inputType: sourceNode.type,
        },
      ],
    }));
  }, [connections, models, nodes, onChangeContent, onError]);

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
          ...(currentContent.shotGraphs || {}),
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

  const handlePaneContextMenu = React.useCallback((event: React.MouseEvent) => {
    if (!onAddNodeAt) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const bounds = shellRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const rawPosition = flowInstance?.screenToFlowPosition
      ? flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const menuWidth = 208;
    const menuHeight = 248;
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;

    setContextMenu({
      left: Math.max(12, Math.min(offsetX, bounds.width - menuWidth - 12)),
      top: Math.max(12, Math.min(offsetY, bounds.height - menuHeight - 12)),
      flowPosition: {
        x: Math.round(rawPosition.x),
        y: Math.round(rawPosition.y),
      },
    });
    onSelectNode(null);
  }, [flowInstance, onAddNodeAt, onSelectNode]);

  const handleAddNodeFromContextMenu = React.useCallback((type: CanvasNode['type']) => {
    if (!contextMenu || !onAddNodeAt) {
      return;
    }

    onAddNodeAt(type, contextMenu.flowPosition);
    setContextMenu(null);
  }, [contextMenu, onAddNodeAt]);

  return (
    <div
      ref={shellRef}
      className="workflow-flow-shell relative min-h-[760px] overflow-hidden rounded-[32px] border border-white/10 bg-[#07090d] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
    >
      {nodes.length === 0 ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="max-w-md rounded-[28px] border border-dashed border-white/15 bg-black/35 px-8 py-10 text-center backdrop-blur">
            <div className="text-xs uppercase tracking-[0.34em] text-white/35">Canvas</div>
            <h3 className="mt-3 text-2xl font-semibold text-white">Shot workflow canvas</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              This shot does not have any nodes yet. Sync the managed workflow first, or right-click on the canvas to add text, image, video, or audio nodes.
            </p>
          </div>
        </div>
      ) : null}

      <ReactFlow
        key={currentShotId || 'episode-workflow'}
        className="workflow-flow"
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
        onPaneContextMenu={handlePaneContextMenu}
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
        onConnect={handleConnect}
        onMoveEnd={handleMoveEnd}
        defaultEdgeOptions={{
          type: 'default',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#73e0ff',
          },
          style: {
            stroke: '#73e0ff',
            strokeWidth: 2,
            opacity: 0.72,
          },
        }}
        connectionLineStyle={{
          stroke: '#73e0ff',
          strokeWidth: 2,
          opacity: 0.72,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} size={1} color="rgba(255,255,255,0.08)" />
        <Controls
          className="!rounded-2xl !border !border-white/10 !bg-[#05070d]/80 !shadow-[0_16px_40px_rgba(0,0,0,0.35)] !backdrop-blur"
          showInteractive={false}
        />
      </ReactFlow>

      {contextMenu ? (
        <div
          className="absolute z-40 w-52 rounded-[24px] border border-white/10 bg-[#05070d]/96 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-2 pb-2 text-[11px] uppercase tracking-[0.24em] text-white/35">Add node</div>
          <div className="grid gap-2">
            {([
              ['text', 'Text'],
              ['image', 'Image'],
              ['video', 'Video'],
              ['audio', 'Audio'],
            ] as Array<[CanvasNode['type'], string]>).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAddNodeFromContextMenu(type)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-sm text-slate-100 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.08]"
              >
                Add {label} node
              </button>
            ))}
          </div>
          <div className="mt-3 px-2 text-xs leading-6 text-white/45">New nodes will be inserted into the current shot graph at the clicked canvas position.</div>
        </div>
      ) : null}
    </div>
  );
};
