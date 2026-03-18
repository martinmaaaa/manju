import React from 'react';
import type {
  CanvasConnection,
  CanvasConfigFieldDefinition,
  CanvasNode,
  ModelDefinition,
  StageConfigMap,
} from '../../types/workflowApp';
import {
  buildCanvasNodeModelChangePatch,
  buildCanvasNodeParamPatch,
  buildCanvasConnectionId,
  collectCanvasNodeInputs,
  selectCanvasModels,
  summarizeNodeParams,
  validateCanvasConnection,
} from '../../services/workflow/runtime/canvasGraphHelpers';
import {
  describeModelRuntime,
  findModelByIdentifier,
  formatModelDisplayName,
  groupModelsByFamily,
  getModelOptionValue,
  summarizeModelConfigFields,
  summarizeModelInputSupport,
} from '../../services/workflow/runtime/modelDeploymentHelpers';
import { isAudioSource } from '../../services/workflow/runtime/workspaceMediaHelpers';
import { SchemaFieldControl } from './SchemaFieldControl';

interface CanvasSurfaceProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  models: ModelDefinition[];
  stageConfig?: StageConfigMap;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onChangeNodes: (nodes: CanvasNode[]) => void;
  onChangeConnections: (connections: CanvasConnection[]) => void;
  onRunNode?: (nodeId: string) => void;
  onUploadAudio?: (file: File) => Promise<{ url: string; title?: string }>;
  onError?: (message: string) => void;
}

const NODE_COLORS: Record<CanvasNode['type'], string> = {
  text: 'from-cyan-500/20 to-cyan-950/80 border-cyan-400/30',
  image: 'from-amber-500/20 to-amber-950/80 border-amber-400/30',
  audio: 'from-emerald-500/20 to-emerald-950/80 border-emerald-400/30',
  video: 'from-fuchsia-500/20 to-fuchsia-950/80 border-fuchsia-400/30',
};

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

function calculatePath(startX: number, startY: number, endX: number, endY: number) {
  const dx = endX - startX;
  const controlPointOffset = Math.min(Math.abs(dx) * 0.5, 200);
  return `M ${startX},${startY} C ${startX + controlPointOffset},${startY} ${endX - controlPointOffset},${endY} ${endX},${endY}`;
}

export const CanvasSurface: React.FC<CanvasSurfaceProps> = ({
  nodes,
  connections,
  models,
  selectedNodeId,
  onSelectNode,
  onChangeNodes,
  onChangeConnections,
  onRunNode,
  onUploadAudio,
  onError,
}) => {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const [uploadingNodeId, setUploadingNodeId] = React.useState<string | null>(null);
  const [connectionStartId, setConnectionStartId] = React.useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = React.useState<string | null>(null);
  const dragOffsetRef = React.useRef({ x: 0, y: 0 });

  const updateNode = React.useCallback((nodeId: string, patch: Partial<CanvasNode>) => {
    onChangeNodes(nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)));
  }, [nodes, onChangeNodes]);

  const nodeById = React.useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const canvasSize = React.useMemo(() => {
    const maxRight = nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0);
    const maxBottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
    return {
      width: Math.max(1600, maxRight + 120),
      height: Math.max(920, maxBottom + 120),
    };
  }, [nodes]);

  const handleAudioUpload = async (node: CanvasNode, file?: File | null) => {
    if (!file) {
      return;
    }

    setUploadingNodeId(node.id);

    try {
      if (onUploadAudio) {
        const uploaded = await onUploadAudio(file);
        updateNode(node.id, {
          content: uploaded.url,
          title: uploaded.title || (file.name ? `音频参考 · ${file.name}` : node.title),
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

      updateNode(node.id, {
        content: result,
        title: file.name ? `音频参考 · ${file.name}` : node.title,
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : '上传音频参考失败。');
    } finally {
      setUploadingNodeId((current) => (current === node.id ? null : current));
    }
  };

  const handleModelChange = (node: CanvasNode, nextModelId: string) => {
    updateNode(node.id, buildCanvasNodeModelChangePatch(node, nextModelId, models));
  };

  const handleParamChange = (node: CanvasNode, fieldKey: string, nextValue: string | number | boolean) => {
    updateNode(node.id, buildCanvasNodeParamPatch(node, fieldKey, nextValue, models));
  };

  const handleConnectToNode = (targetNode: CanvasNode) => {
    if (!connectionStartId) {
      return;
    }

    if (connectionStartId === targetNode.id) {
      setConnectionStartId(null);
      return;
    }

    const sourceNode = nodeById.get(connectionStartId);
    if (!sourceNode) {
      setConnectionStartId(null);
      return;
    }

    const validation = validateCanvasConnection(sourceNode, targetNode, models, connections);
    if (!validation.valid) {
      onError?.(validation.error || '无法创建连接。');
      setConnectionStartId(null);
      return;
    }

    onChangeConnections([
      ...connections,
      {
        id: buildCanvasConnectionId(sourceNode.id, targetNode.id),
        from: sourceNode.id,
        to: targetNode.id,
        inputType: sourceNode.type,
      },
    ]);
    setConnectionStartId(null);
  };

  const removeConnection = (connectionId: string) => {
    onChangeConnections(connections.filter((connection) => connection.id !== connectionId));
  };

  const handleNodeDragStart = (event: React.PointerEvent<HTMLButtonElement>, node: CanvasNode) => {
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    if (!surfaceRect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragOffsetRef.current = {
      x: event.clientX - surfaceRect.left - node.x,
      y: event.clientY - surfaceRect.top - node.y,
    };
    setDraggingNodeId(node.id);
    onSelectNode(node.id);
  };

  React.useEffect(() => {
    if (!draggingNodeId) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const surfaceRect = surfaceRef.current?.getBoundingClientRect();
      const node = nodeById.get(draggingNodeId);
      if (!surfaceRect || !node) {
        return;
      }

      const nextX = Math.min(
        Math.max(24, canvasSize.width - node.width - 24),
        Math.max(24, event.clientX - surfaceRect.left - dragOffsetRef.current.x),
      );
      const nextY = Math.min(
        Math.max(24, canvasSize.height - node.height - 24),
        Math.max(24, event.clientY - surfaceRect.top - dragOffsetRef.current.y),
      );

      updateNode(node.id, {
        x: Math.round(nextX),
        y: Math.round(nextY),
      });
    };

    const handlePointerUp = () => {
      setDraggingNodeId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [canvasSize.height, canvasSize.width, draggingNodeId, nodeById, updateNode]);

  return (
    <div className="relative min-h-[760px] overflow-auto rounded-[32px] border border-white/10 bg-[#07090d] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div
        ref={surfaceRef}
        className="relative"
        style={{
          width: `${canvasSize.width}px`,
          height: `${canvasSize.height}px`,
          minHeight: `${canvasSize.height}px`,
        }}
      >
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0), linear-gradient(180deg, rgba(255,255,255,0.02), transparent 20%)',
            backgroundSize: '28px 28px, 100% 100%',
          }}
        />

        <svg className="pointer-events-none absolute inset-0" style={{ width: canvasSize.width, height: canvasSize.height }}>
        <defs>
          <linearGradient id="workflow-connection-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {connections.map((connection) => {
          const fromNode = nodeById.get(connection.from);
          const toNode = nodeById.get(connection.to);
          if (!fromNode || !toNode) {
            return null;
          }

          const startX = fromNode.x + fromNode.width;
          const startY = fromNode.y + fromNode.height / 2;
          const endX = toNode.x;
          const endY = toNode.y + toNode.height / 2;
          const path = calculatePath(startX, startY, endX, endY);

          return (
            <g key={connection.id} className="pointer-events-auto">
              <path
                d={path}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                onClick={() => removeConnection(connection.id)}
                className="cursor-pointer"
              />
              <path
                d={path}
                stroke="url(#workflow-connection-gradient)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.25))' }}
              />
              <circle cx={endX} cy={endY} r="4" fill="#22d3ee" />
            </g>
          );
        })}
        {connectionStartId ? (() => {
          const startNode = nodeById.get(connectionStartId);
          if (!startNode) {
            return null;
          }

          const startX = startNode.x + startNode.width;
          const startY = startNode.y + startNode.height / 2;
          const endX = startX + 120;
          const endY = startY;
          const path = calculatePath(startX, startY, endX, endY);
          return (
            <path
              d={path}
              stroke="url(#workflow-connection-gradient)"
              strokeWidth="2"
              fill="none"
              strokeDasharray="8 4"
            />
          );
        })() : null}
        </svg>

        <div className="relative h-full" style={{ minHeight: canvasSize.height }}>
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const nodeModels = selectCanvasModels(models, node.type);
          const groupedNodeModels = groupModelsByFamily(nodeModels);
          const selectedModel = findModelByIdentifier(models, node.modelId);
          const nodeValue = getNodeValue(node);
          const connectedInputs = collectCanvasNodeInputs(node, nodes, connections, models);
          const inputBadges = Object.entries(connectedInputs)
            .flatMap(([kind, items]) => items.map((item) => `${kind} · ${item.node.title}`))
            .slice(0, 6);
          const paramSummaries = summarizeNodeParams(node, selectedModel);

          return (
            <div
              key={node.id}
              className={`absolute rounded-[28px] border bg-gradient-to-br p-0 text-left transition ${
                NODE_COLORS[node.type]
              } ${isSelected ? 'ring-2 ring-white/60' : 'hover:border-white/20'} ${draggingNodeId === node.id ? 'z-20 shadow-[0_24px_50px_rgba(0,0,0,0.45)]' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
              onClick={() => onSelectNode(node.id)}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleConnectToNode(node);
                }}
                className={`absolute -left-4 top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-full border text-xs ${
                  connectionStartId && connectionStartId !== node.id
                    ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100'
                    : 'border-white/10 bg-black/60 text-white/45'
                }`}
                title={connectionStartId && connectionStartId !== node.id ? '连接到这里' : '输入端'}
              >
                +
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setConnectionStartId((current) => current === node.id ? null : node.id);
                }}
                className={`absolute -right-4 top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-full border text-xs ${
                  connectionStartId === node.id
                    ? 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100'
                    : 'border-white/10 bg-black/60 text-white/45'
                }`}
                title="从这里开始连线"
              >
                +
              </button>

              <div className="flex h-full flex-col rounded-[27px] bg-black/45 p-4 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onPointerDown={(event) => handleNodeDragStart(event, node)}
                      onClick={(event) => event.stopPropagation()}
                      className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                        draggingNodeId === node.id
                          ? 'cursor-grabbing border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                          : 'cursor-grab border-white/10 bg-white/[0.04] text-white/55'
                      }`}
                      title="拖动节点"
                    >
                      拖动
                    </button>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.32em] text-white/45">{node.type}</div>
                      <div className="mt-1 text-sm font-semibold text-white">{node.title}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-[11px] text-white/45">{node.width}×{node.height}</div>
                    <div className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      node.runStatus === 'error'
                        ? 'border-red-400/20 bg-red-400/10 text-red-100'
                        : node.runStatus === 'success'
                          ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                          : node.runStatus === 'running'
                            ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
                            : 'border-white/10 bg-white/[0.04] text-white/45'
                    }`}>
                      {node.runStatus || 'idle'}
                    </div>
                  </div>
                </div>

                {node.type === 'audio' ? (
                  <div className="mt-4 flex h-full flex-col gap-3">
                    <label
                      onClick={(event) => event.stopPropagation()}
                      className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/10"
                    >
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          void handleAudioUpload(node, file);
                          event.target.value = '';
                        }}
                      />
                      {uploadingNodeId === node.id
                        ? '上传中...'
                        : isAudioSource(node.content)
                          ? '替换音频参考'
                          : '上传音频参考'}
                    </label>
                    {isAudioSource(node.content) ? (
                      <audio controls src={node.content} className="w-full" onClick={(event) => event.stopPropagation()} />
                    ) : (
                      <div className="flex h-full items-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
                        音频节点当前只作为参考素材保留，不纳入通用生成主线。
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {(node.type === 'image' && isImageSource(nodeValue)) ? (
                      <img src={nodeValue} alt={node.title} className="mt-4 h-28 w-full rounded-2xl object-cover" />
                    ) : null}
                    {(node.type === 'video' && isVideoSource(nodeValue)) ? (
                      <video src={nodeValue} className="mt-4 h-28 w-full rounded-2xl bg-black object-cover" muted playsInline />
                    ) : null}

                    <div className="mt-4 grid gap-3">
                      {nodeModels.length > 0 ? (
                        <label className="grid gap-2 text-xs text-slate-300" onClick={(event) => event.stopPropagation()}>
                          <span>模型</span>
                          <select
                            value={node.modelId || ''}
                            onChange={(event) => handleModelChange(node, event.target.value)}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
                          >
                            <option value="">手动 / 参考节点</option>
                            {groupedNodeModels.map((group) => (
                              <optgroup key={group.familyId} label={group.familyName}>
                                {group.deployments.map((model) => (
                                  <option key={model.deploymentId} value={getModelOptionValue(model)}>
                                    {formatModelDisplayName(model)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {node.modelId ? (
                        <>
                          {selectedModel ? (
                            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3" onClick={(event) => event.stopPropagation()}>
                              <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/65">Deployment</div>
                              <div className="mt-2 text-sm font-semibold text-white">{formatModelDisplayName(selectedModel)}</div>
                              <div className="mt-1 text-xs text-cyan-100/70">{describeModelRuntime(selectedModel)}</div>
                              <div className="mt-3 grid gap-3">
                                <div>
                                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">支持输入</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {summarizeModelInputSupport(selectedModel).map((item) => (
                                      <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">可调参数</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {summarizeModelConfigFields(selectedModel).map((item) => (
                                      <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-100">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="text-[10px] text-white/45">
                                  {selectedModel.deploymentId}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <label className="grid gap-2 text-xs text-slate-300" onClick={(event) => event.stopPropagation()}>
                            <span>Prompt</span>
                            <textarea
                              value={node.prompt || ''}
                              onChange={(event) => updateNode(node.id, { prompt: event.target.value })}
                              className="min-h-[92px] resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none"
                              placeholder="输入节点自己的生成提示，也可以通过连线接收上游文本。"
                            />
                          </label>
                          {inputBadges.length > 0 ? (
                            <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                              {inputBadges.map((badge) => (
                                <span key={badge} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-200">
                                  {badge}
                                </span>
                              ))}
                            </div>
                          ) : selectedModel && Object.keys(selectedModel.inputSchema || {}).length > 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-slate-400" onClick={(event) => event.stopPropagation()}>
                              这个模型支持的输入，需要通过连线从其他节点接入。
                            </div>
                          ) : null}
                          {selectedModel && Object.keys(selectedModel.configSchema || {}).length > 0 ? (
                            <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" onClick={(event) => event.stopPropagation()}>
                              {Object.entries(selectedModel.configSchema).map(([fieldKey, definition]) => (
                                <SchemaFieldControl
                                  key={fieldKey}
                                  fieldKey={fieldKey}
                                  definition={definition}
                                  value={node.params?.[fieldKey]}
                                  onChange={(nextValue) => handleParamChange(node, fieldKey, nextValue)}
                                />
                              ))}
                            </div>
                          ) : null}
                          {paramSummaries.length > 0 ? (
                            <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                              {paramSummaries.map((item) => (
                                <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRunNode?.(node.id);
                            }}
                            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                          >
                            {node.runStatus === 'running' ? '运行中...' : '运行节点'}
                          </button>
                        </>
                      ) : (
                        <label className="grid gap-2 text-xs text-slate-300" onClick={(event) => event.stopPropagation()}>
                          <span>{node.type === 'text' ? '内容' : '素材地址 / 结果地址'}</span>
                          <textarea
                            value={node.content}
                            onChange={(event) => updateNode(node.id, { content: event.target.value })}
                            className="min-h-[120px] resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none"
                            placeholder={node.type === 'text' ? '输入文本内容，作为上游提示或说明。' : '输入 URL，或把模型切到可执行状态后运行生成。'}
                          />
                        </label>
                      )}

                      {node.error ? (
                        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100" onClick={(event) => event.stopPropagation()}>
                          {node.error}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-md rounded-[28px] border border-dashed border-white/15 bg-black/30 px-8 py-10 text-center">
              <div className="text-xs uppercase tracking-[0.34em] text-white/35">Canvas</div>
              <h3 className="mt-3 text-2xl font-semibold text-white">多模态生成画布</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                在这里放置文本、图片、视频节点，用连线把它们串起来，再为每个节点独立选择模型和参数。
              </p>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
};
