import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { isAudioSource } from '../../services/workflow/runtime/workspaceMediaHelpers';
import { SchemaFieldControl } from './SchemaFieldControl';
import type { WorkflowFlowNode } from './WorkflowFlowTypes';
import {
  buildWorkflowNodeContext,
  CollapsedCardSummary,
  CompactFieldControl,
  isImageSource,
  isVideoSource,
  ModelPicker,
  NodeShell,
  previewClampStyle,
  summarizeAcceptedInputTypes,
  type WorkflowNodeContext,
} from './WorkflowNodeRendererShared';

const TextNodeRenderer: React.FC<{ ctx: WorkflowNodeContext }> = ({ ctx }) => {
  if (!ctx.selected) {
    return <NodeShell ctx={ctx}><CollapsedCardSummary ctx={ctx} /></NodeShell>;
  }

  return (
    <NodeShell ctx={ctx}>
      <div className="mt-4 space-y-4">
        {ctx.nodeValue ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-200">
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">当前预览</div>
            <div style={previewClampStyle(4)}>{ctx.nodeValue}</div>
          </div>
        ) : null}

        <label className="grid gap-2 text-xs text-slate-300">
          <span>内容 / Prompt</span>
          <textarea
            value={ctx.node.prompt || ''}
            onChange={(event) => ctx.data.onPatchNode(ctx.node.id, { prompt: event.target.value })}
            className="nodrag nopan min-h-[84px] resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-100 outline-none"
            placeholder="输入节点自己的生成提示，也可以通过连线接收上游文本。"
          />
        </label>

        {ctx.generationModes.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {ctx.generationModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => ctx.data.onModeChange(ctx.node.id, mode.id)}
                className={`nodrag nopan rounded-full px-3 py-1.5 text-[11px] ${
                  ctx.activeGenerationMode?.id === mode.id
                    ? 'bg-white text-black'
                    : 'border border-white/10 bg-white/[0.04] text-slate-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        ) : null}

        {ctx.visibleInputDefinitions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {ctx.visibleInputDefinitions.map(([inputKey, definition]) => {
              const slotItems = ctx.connectedInputs[inputKey]?.items || [];
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

        {ctx.inputBadges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {ctx.inputBadges.map((badge) => (
              <span key={badge} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-200">
                {badge}
              </span>
            ))}
          </div>
        ) : null}

        {ctx.primaryEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            {ctx.primaryEntries.map(([fieldKey, definition]) => (
              <CompactFieldControl
                key={fieldKey}
                fieldKey={fieldKey}
                definition={definition}
                value={ctx.node.params?.[fieldKey]}
                onChange={(nextValue) => ctx.data.onParamChange(ctx.node.id, fieldKey, nextValue)}
              />
            ))}
          </div>
        ) : null}

        {ctx.secondaryEntries.length > 0 ? (
          <details className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm text-slate-100">更多设置</summary>
            <div className="mt-3 grid gap-3">
              {ctx.secondaryEntries.map(([fieldKey, definition]) => (
                <SchemaFieldControl
                  key={fieldKey}
                  fieldKey={fieldKey}
                  definition={definition}
                  value={ctx.node.params?.[fieldKey]}
                  onChange={(nextValue) => ctx.data.onParamChange(ctx.node.id, fieldKey, nextValue)}
                />
              ))}
            </div>
          </details>
        ) : null}

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/10 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ModelPicker ctx={ctx} compact />
          {ctx.paramSummaries.slice(0, 2).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200">
              {item}
            </span>
          ))}
          <button
            type="button"
            onClick={() => ctx.data.onRunNode?.(ctx.node.id)}
            className="nodrag nopan ml-auto shrink-0 rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-black transition hover:opacity-90"
          >
            {ctx.node.runStatus === 'running' ? '运行中...' : '运行节点'}
          </button>
        </div>

        {ctx.node.error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100">
            {ctx.node.error}
          </div>
        ) : null}
      </div>
    </NodeShell>
  );
};

const AudioNodeRenderer: React.FC<{ ctx: WorkflowNodeContext }> = ({ ctx }) => {
  if (!ctx.selected) {
    return (
      <NodeShell ctx={ctx}>
        <CollapsedCardSummary
          ctx={ctx}
          media={isAudioSource(ctx.node.content) ? <audio controls src={ctx.node.content} className="nodrag nopan w-full" /> : null}
        />
      </NodeShell>
    );
  }

  return (
    <NodeShell
      ctx={ctx}
      detachedPanel={(
        <div className="mx-4 mt-3 rounded-[28px] border border-white/10 bg-[#232323]/96 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <label className="nodrag nopan flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/10">
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                ctx.data.onUploadAudio?.(ctx.node.id, event.target.files?.[0] || null);
                event.target.value = '';
              }}
            />
            {ctx.data.uploadingNodeId === ctx.node.id
              ? '上传中...'
              : isAudioSource(ctx.node.content)
                ? '替换音频参考'
                : '上传音频参考'}
          </label>

          <div className="mt-4 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/10 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200">
              参考音频
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200">
              {isAudioSource(ctx.node.content) ? '已连接素材' : '等待上传'}
            </span>
          </div>

          {ctx.node.error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100">
              {ctx.node.error}
            </div>
          ) : null}
        </div>
      )}
    >
      <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {isAudioSource(ctx.node.content) ? (
          <div className="p-4">
            <audio controls src={ctx.node.content} className="nodrag nopan w-full" />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center px-8 text-center text-sm leading-7 text-white/50">
            上传配音、对白或音效素材，音频预览会显示在这里。
          </div>
        )}
      </div>
    </NodeShell>
  );
};

const ImageNodeRenderer: React.FC<{ ctx: WorkflowNodeContext }> = ({ ctx }) => {
  if (!ctx.selected) {
    return (
      <NodeShell ctx={ctx}>
        <CollapsedCardSummary
          ctx={ctx}
          media={isImageSource(ctx.previewSource) ? <img src={ctx.previewSource} alt={ctx.node.title} className="nodrag nopan h-28 w-full rounded-2xl object-cover" /> : null}
        />
      </NodeShell>
    );
  }

  return (
    <NodeShell
      ctx={ctx}
      detachedPanel={(
        <div className="mx-4 mt-3 rounded-[28px] border border-white/10 bg-[#232323]/96 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <div className="flex items-center gap-2.5">
            {ctx.referenceItems.map((item) => (
              isImageSource(item.preview) || isVideoSource(item.preview) ? (
                <img key={item.id} src={item.preview} alt={item.title} className="h-10 w-10 rounded-[14px] object-cover" />
              ) : (
                <div key={item.id} className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-[10px] text-white/55">
                  参考
                </div>
              )
            ))}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                ctx.data.onOpenAddFromHandle(ctx.node.id, 'target');
              }}
              className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.06] text-lg text-white/70"
            >
              +
            </button>
          </div>

          <textarea
            value={ctx.node.prompt || ''}
            onChange={(event) => ctx.data.onPatchNode(ctx.node.id, { prompt: event.target.value })}
            className="nodrag nopan mt-3 min-h-[56px] w-full resize-none bg-transparent text-base leading-7 text-slate-100 outline-none"
            placeholder="描述你想要生成的画面..."
          />

          <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/10 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ModelPicker ctx={ctx} compact />
            {ctx.primaryEntries.map(([fieldKey, definition]) => (
              <CompactFieldControl
                key={fieldKey}
                fieldKey={fieldKey}
                definition={definition}
                value={ctx.node.params?.[fieldKey]}
                onChange={(nextValue) => ctx.data.onParamChange(ctx.node.id, fieldKey, nextValue)}
              />
            ))}
            {ctx.paramSummaries.slice(0, 2).map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200">
                {item}
              </span>
            ))}
            <button
              type="button"
              onClick={() => ctx.data.onRunNode?.(ctx.node.id)}
              className="nodrag nopan ml-auto shrink-0 rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-black transition hover:opacity-90"
            >
              {ctx.node.runStatus === 'running' ? '运行中...' : '生成'}
            </button>
          </div>

          {ctx.secondaryEntries.length > 0 ? (
            <details className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm text-slate-100">更多设置</summary>
              <div className="mt-3 grid gap-3">
                {ctx.secondaryEntries.map(([fieldKey, definition]) => (
                  <SchemaFieldControl
                    key={fieldKey}
                    fieldKey={fieldKey}
                    definition={definition}
                    value={ctx.node.params?.[fieldKey]}
                    onChange={(nextValue) => ctx.data.onParamChange(ctx.node.id, fieldKey, nextValue)}
                  />
                ))}
              </div>
            </details>
          ) : null}

          {ctx.node.error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100">
              {ctx.node.error}
            </div>
          ) : null}
        </div>
      )}
    >
      <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {isImageSource(ctx.nodeValue) ? (
          <img src={ctx.nodeValue} alt={ctx.node.title} className="nodrag nopan h-56 w-full object-cover" />
        ) : (
          <div className="flex h-56 items-center justify-center px-8 text-center text-sm leading-7 text-white/50">
            生成结果会显示在这里。
          </div>
        )}
      </div>
    </NodeShell>
  );
};

const VideoNodeRenderer: React.FC<{ ctx: WorkflowNodeContext }> = ({ ctx }) => {
  if (!ctx.selected) {
    return (
      <NodeShell ctx={ctx}>
        <CollapsedCardSummary
          ctx={ctx}
          media={isVideoSource(ctx.previewSource) ? <video src={ctx.previewSource} className="nodrag nopan h-28 w-full rounded-2xl bg-black object-cover" muted playsInline /> : null}
        />
      </NodeShell>
    );
  }

  return (
    <NodeShell
      ctx={ctx}
      detachedPanel={(
        <div className="mx-4 mt-3 rounded-[28px] border border-white/10 bg-[#232323]/96 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
          <div className="flex items-center gap-2.5">
            {ctx.referenceItems.map((item) => (
              isImageSource(item.preview) || isVideoSource(item.preview) ? (
                <img key={item.id} src={item.preview} alt={item.title} className="h-10 w-10 rounded-[14px] object-cover" />
              ) : (
                <div key={item.id} className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] text-[10px] text-white/55">
                  参考
                </div>
              )
            ))}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                ctx.data.onOpenAddFromHandle(ctx.node.id, 'target');
              }}
              className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.06] text-lg text-white/70"
            >
              +
            </button>
          </div>

          <textarea
            value={ctx.node.prompt || ''}
            onChange={(event) => ctx.data.onPatchNode(ctx.node.id, { prompt: event.target.value })}
            className="nodrag nopan mt-3 min-h-[56px] w-full resize-none bg-transparent text-base leading-7 text-slate-100 outline-none"
            placeholder="描述镜头、动作和节奏..."
          />

          <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-white/10 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ModelPicker ctx={ctx} compact />
            {ctx.primaryEntries.map(([fieldKey, definition]) => (
              <CompactFieldControl
                key={fieldKey}
                fieldKey={fieldKey}
                definition={definition}
                value={ctx.node.params?.[fieldKey]}
                onChange={(nextValue) => ctx.data.onParamChange(ctx.node.id, fieldKey, nextValue)}
              />
            ))}
            {ctx.videoSummary.slice(0, 2).map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200">
                {item}
              </span>
            ))}
            {ctx.data.canStoreVideoToShot && isVideoSource(ctx.nodeValue) && ctx.data.onStoreVideoToShot ? (
              <button
                type="button"
                onClick={() => ctx.data.onStoreVideoToShot?.(ctx.node.id)}
                className="nodrag nopan shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-1.5 text-[11px] font-semibold text-cyan-100"
              >
                存为分镜
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => ctx.data.onRunNode?.(ctx.node.id)}
              className="nodrag nopan ml-auto shrink-0 rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-black transition hover:opacity-90"
            >
              {ctx.node.runStatus === 'running' ? '运行中...' : '生成'}
            </button>
          </div>

          {ctx.secondaryEntries.length > 0 ? (
            <details className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm text-slate-100">更多设置</summary>
              <div className="mt-3 grid gap-3">
                {ctx.secondaryEntries.map(([fieldKey, definition]) => (
                  <SchemaFieldControl
                    key={fieldKey}
                    fieldKey={fieldKey}
                    definition={definition}
                    value={ctx.node.params?.[fieldKey]}
                    onChange={(nextValue) => ctx.data.onParamChange(ctx.node.id, fieldKey, nextValue)}
                  />
                ))}
              </div>
            </details>
          ) : null}

          {ctx.node.error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-xs text-red-100">
              {ctx.node.error}
            </div>
          ) : null}
        </div>
      )}
    >
      <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {isVideoSource(ctx.nodeValue) ? (
          <video src={ctx.nodeValue} className="nodrag nopan h-60 w-full bg-black object-cover" muted playsInline />
        ) : (
          <div className="flex h-60 items-center justify-center px-8 text-center text-sm leading-7 text-white/50">
            视频结果会显示在这里。
          </div>
        )}
      </div>
    </NodeShell>
  );
};

export const WorkflowFlowNodeCard: React.FC<NodeProps<WorkflowFlowNode>> = ({ data, selected }) => {
  const ctx = buildWorkflowNodeContext(data, selected);

  if (ctx.node.type === 'text') return <TextNodeRenderer ctx={ctx} />;
  if (ctx.node.type === 'image') return <ImageNodeRenderer ctx={ctx} />;
  if (ctx.node.type === 'video') return <VideoNodeRenderer ctx={ctx} />;
  return <AudioNodeRenderer ctx={ctx} />;
};
