import React from 'react';
import type { CanvasNode } from '../../../types/workflowApp';
import { Card } from '../PagePrimitives';
import { CanvasWorkbench } from '../CanvasWorkbench';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface EpisodeWorkspaceCanvasPanelProps {
  saveState: 'idle' | 'dirty' | 'saving' | 'saved';
  saveLabel: string;
  onSave: () => void | Promise<void>;
  onSyncWorkbench: () => void;
  onRelayout: () => void;
  onAddNode: (type: CanvasNode['type'], position?: { x: number; y: number }) => void;
  canvasProps: React.ComponentProps<typeof CanvasWorkbench>;
}

function formatNodeTypeLabel(type: CanvasNode['type']) {
  if (type === 'text') return '文本';
  if (type === 'image') return '图片';
  if (type === 'video') return '视频';
  return '音频';
}

export function EpisodeWorkspaceCanvasPanel({
  saveState,
  saveLabel,
  onSave,
  onSyncWorkbench,
  onRelayout,
  onAddNode,
  canvasProps,
}: EpisodeWorkspaceCanvasPanelProps) {
  return (
    <Card
      eyebrow="工作台"
      title="视频工作流画布"
      action={(
        <div className="flex items-center gap-3">
          <div className={cx(
            'rounded-full border px-3 py-1 text-xs',
            saveState === 'saving'
              ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
              : saveState === 'dirty'
                ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
          )}>
            {saveLabel}
          </div>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saveState === 'saving'}
            className={cx(
              'rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition',
              saveState === 'saving' && 'cursor-not-allowed opacity-60',
            )}
          >
            立即保存
          </button>
        </div>
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSyncWorkbench}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
        >
          同步工作台
        </button>
        <details className="relative rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100">
          <summary className="cursor-pointer list-none">高级画布</summary>
          <div className="absolute z-20 mt-4 w-[320px] rounded-[24px] border border-white/10 bg-[#06090f]/98 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">高级画布</div>
            <div className="mt-2 text-sm leading-6 text-slate-300">
              默认主链仍然保持模板驱动。这里只在需要手动重排节点，或临时补一个文本、图片、视频、音频节点时使用。双击画布空白区或点击左下角“添加节点”，都会打开同一个加节点菜单。
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRelayout}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100"
              >
                重新排布
              </button>
              {(['text', 'image', 'video', 'audio'] as CanvasNode['type'][]).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-label={`快速添加${formatNodeTypeLabel(type)}节点`}
                  onClick={() => onAddNode(type)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100"
                >
                  快速添加{formatNodeTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
      <CanvasWorkbench {...canvasProps} />
    </Card>
  );
}
