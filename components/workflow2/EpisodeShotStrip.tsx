import React from 'react';
import type { EpisodeShotJob, EpisodeShotSlot, EpisodeShotStrip } from '../../types/workflowApp';
import { summarizeEpisodeShotStrip } from '../../services/workflow/runtime/episodeShotStripHelpers';

function getShotVideoUrl(slot: EpisodeShotSlot) {
  return slot.clip?.videoUrl || '';
}

function formatStripDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function downloadShotClip(slot: EpisodeShotSlot) {
  const videoUrl = getShotVideoUrl(slot);
  if (!videoUrl) {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = videoUrl;
  anchor.download = `${slot.title || 'shot'}.mp4`;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer';
  anchor.click();
}

function summarizeShotJob(job: EpisodeShotJob | null | undefined) {
  if (!job) {
    return null;
  }

  const status = String(job.status || '').toUpperCase();
  const phase = String(job.phase || '').trim();
  const baseLabel = phase
    || (status === 'RUNNING'
      ? '生成中'
      : status === 'SUCCEEDED'
        ? '已完成'
        : status === 'FAILED'
          ? '失败'
          : status === 'CANCELLED'
            ? '已取消'
            : status);

  return [baseLabel, typeof job.progress === 'number' ? `${job.progress}%` : null]
    .filter(Boolean)
    .join(' · ');
}

function canCancelShotJob(job: EpisodeShotJob | null | undefined) {
  if (!job) {
    return false;
  }

  const status = String(job.status || '').toUpperCase();
  const phase = String(job.phase || '').trim();
  return ['QUEUED', 'PENDING', 'CLAIMED'].includes(status) || phase.includes('排队');
}

function canRetryShotJob(job: EpisodeShotJob | null | undefined) {
  if (!job) {
    return false;
  }

  const status = String(job.status || '').toUpperCase();
  return status === 'FAILED' || status === 'CANCELLED';
}

function jobBadgeClass(job: EpisodeShotJob | null | undefined) {
  if (!job) {
    return 'border-white/10 bg-black/20 text-slate-300';
  }
  if (job.status === 'FAILED' || job.status === 'CANCELLED') {
    return 'border-red-400/20 bg-red-400/10 text-red-100';
  }
  if (job.status === 'SUCCEEDED') {
    return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
  }
  return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100';
}

interface EpisodeShotStripProps {
  strip: EpisodeShotStrip;
  onSelectShot: (slotId: string) => void;
  onAddShot: () => void;
  onRenameShot: (slotId: string, title: string) => void;
  onDeleteShot: (slotId: string) => void;
  onMoveShot: (fromShotId: string, toShotId?: string | null) => void;
  onClearShotResult: (slotId: string) => void;
  onRetryShotJob: (slotId: string) => void;
  onCancelShotJob: (slotId: string) => void;
}

export const EpisodeShotStrip: React.FC<EpisodeShotStripProps> = ({
  strip,
  onSelectShot,
  onAddShot,
  onRenameShot,
  onDeleteShot,
  onMoveShot,
  onClearShotResult,
  onRetryShotJob,
  onCancelShotJob,
}) => {
  const slots = Array.isArray(strip?.slots) ? strip.slots : [];
  const activeShotId = strip?.selectedShotId || null;
  const [editingShotId, setEditingShotId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState('');
  const [draggingShotId, setDraggingShotId] = React.useState<string | null>(null);
  const summary = summarizeEpisodeShotStrip(strip);

  const commitRename = React.useCallback(() => {
    if (!editingShotId) {
      return;
    }
    const nextTitle = editingTitle.trim();
    if (nextTitle) {
      onRenameShot(editingShotId, nextTitle);
    }
    setEditingShotId(null);
    setEditingTitle('');
  }, [editingShotId, editingTitle, onRenameShot]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
            已成片 {summary.completedSlots} / {summary.totalSlots}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
            当前集时长 {formatStripDuration(summary.totalSeconds)}
          </div>
        </div>
        <div className="text-xs text-white/45">
          分镜条只展示最终采用结果；空槽表示这一镜还未产出成片。
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-3 pb-1">
          {slots.map((slot, index) => {
            const isActive = slot.id === activeShotId;
            const isEditing = slot.id === editingShotId;
            const jobSummary = summarizeShotJob(slot.job);
            const previewUrl = getShotVideoUrl(slot);

            return (
              <article
                key={slot.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', slot.id);
                  setDraggingShotId(slot.id);
                }}
                onDragEnd={() => setDraggingShotId(null)}
                onDragOver={(event) => {
                  if (draggingShotId && draggingShotId !== slot.id) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromShotId = event.dataTransfer.getData('text/plain') || draggingShotId;
                  if (fromShotId && fromShotId !== slot.id) {
                    onMoveShot(fromShotId, slot.id);
                  }
                  setDraggingShotId(null);
                }}
                className={`w-[240px] shrink-0 rounded-[22px] border p-4 transition ${
                  isActive
                    ? 'border-cyan-300/35 bg-cyan-300/[0.08]'
                    : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/30'
                } ${draggingShotId === slot.id ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                      {slot.source === 'manual' ? `手动 ${index + 1}` : `分镜 ${index + 1}`}
                    </div>
                    {isEditing ? (
                      <input
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename();
                          }
                          if (event.key === 'Escape') {
                            setEditingShotId(null);
                            setEditingTitle('');
                          }
                        }}
                        autoFocus
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectShot(slot.id)}
                        className="mt-2 text-left text-sm font-semibold text-white"
                      >
                        {slot.title}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-300">
                      {slot.clip?.durationLabel || slot.durationLabel || '未定长'}
                    </span>
                    {jobSummary && !previewUrl ? (
                      <span className={`rounded-full border px-2 py-1 text-[10px] ${jobBadgeClass(slot.job)}`}>
                        {jobSummary}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingShotId(slot.id);
                      setEditingTitle(slot.title);
                    }}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-200"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteShot(slot.id)}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-200"
                  >
                    删除
                  </button>
                </div>

                {previewUrl ? (
                  <button
                    type="button"
                    onClick={() => onSelectShot(slot.id)}
                    className="mt-4 block w-full overflow-hidden rounded-[18px] border border-white/10 bg-black/30"
                  >
                    <video
                      src={slot.clip?.thumbnailUrl || previewUrl}
                      className="h-32 w-full bg-black object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectShot(slot.id)}
                    className="mt-4 flex h-32 w-full items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 px-4 text-center text-sm text-slate-400"
                  >
                    {slot.job
                      ? (slot.job.status === 'FAILED'
                        ? (slot.job.error || '生成失败，可重试')
                        : jobSummary || '排队中...')
                      : '空分镜槽'}
                  </button>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectShot(slot.id)}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                  >
                    {isActive ? '当前分镜' : '切换到这里'}
                  </button>
                  {previewUrl ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onClearShotResult(slot.id)}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
                      >
                        清空结果
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadShotClip(slot)}
                        className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                      >
                        下载
                      </button>
                    </div>
                  ) : canCancelShotJob(slot.job) ? (
                    <button
                      type="button"
                      onClick={() => onCancelShotJob(slot.id)}
                      className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
                    >
                      取消排队
                    </button>
                  ) : canRetryShotJob(slot.job) ? (
                    <button
                      type="button"
                      onClick={() => onRetryShotJob(slot.id)}
                      className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                    >
                      重试
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}

          <button
            type="button"
            onClick={onAddShot}
            onDragOver={(event) => {
              if (draggingShotId) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromShotId = event.dataTransfer.getData('text/plain') || draggingShotId;
              if (fromShotId) {
                onMoveShot(fromShotId, null);
              }
              setDraggingShotId(null);
            }}
            className="flex h-[336px] w-[180px] shrink-0 items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.05]"
          >
            新增分镜槽
          </button>
        </div>
      </div>
    </div>
  );
};
