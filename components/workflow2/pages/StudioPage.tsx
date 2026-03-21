import React from 'react';
import type { StudioWorkspace } from '../../../types/workflowApp';
import { Card } from '../PagePrimitives';
import { CanvasWorkbench } from '../CanvasWorkbench';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function fmt(value?: string | null) {
  if (!value) return '暂无时间';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface StudioPageProps {
  studioWorkspaces: StudioWorkspace[];
  activeStudioId: string | null;
  activeStudio: StudioWorkspace | null;
  onCreateWorkspace: () => void | Promise<void>;
  onSelectWorkspace: (workspaceId: string, firstNodeId: string | null) => void;
  onSaveWorkspace: () => void | Promise<void>;
  canvasProps: React.ComponentProps<typeof CanvasWorkbench> | null;
}

export function StudioPage({
  studioWorkspaces,
  activeStudioId,
  activeStudio,
  onCreateWorkspace,
  onSelectWorkspace,
  onSaveWorkspace,
  canvasProps,
}: StudioPageProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card
        eyebrow="画布沙盒"
        title="多模态试验台"
        action={(
          <button
            type="button"
            onClick={() => void onCreateWorkspace()}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            新建沙盒
          </button>
        )}
      >
        <div className="grid gap-3">
          {studioWorkspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => onSelectWorkspace(workspace.id, workspace.content.nodes?.[0]?.id || null)}
              className={cx('rounded-2xl border px-4 py-4 text-left', workspace.id === activeStudioId ? 'border-cyan-300/20 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03]')}
            >
              <div className="font-semibold text-white">{workspace.title}</div>
              <div className="mt-1 text-xs text-white/45">{fmt(workspace.updatedAt)}</div>
            </button>
          ))}
        </div>
      </Card>

      {activeStudio && canvasProps ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
              双击空白区或点击画布左下角 Add node，继续添加文本、图片、视频、音频和上传资源。
            </div>
            <button
              type="button"
              onClick={() => void onSaveWorkspace()}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              保存沙盒
            </button>
          </div>
          <CanvasWorkbench {...canvasProps} />
        </section>
      ) : null}
    </div>
  );
}
