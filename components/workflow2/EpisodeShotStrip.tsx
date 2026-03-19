import React from 'react';
import type { EpisodeShotJob, EpisodeShotSlot, EpisodeShotStrip as EpisodeShotStripState } from '../../types/workflowApp';
import { getEpisodeShotStripTotalSeconds, summarizeEpisodeShotStrip } from '../../services/workflow/runtime/episodeShotStripHelpers';

function getShotVideoUrl(slot: EpisodeShotSlot) {
  return slot.clip?.videoUrl || '';
}

function formatTimecode(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clampSeconds(value: number, totalSeconds: number) {
  return Math.max(0, Math.min(totalSeconds, value));
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
  strip: EpisodeShotStripState;
  currentSeconds?: number;
  totalSeconds?: number;
  onSelectShot: (slotId: string) => void;
  onSeekTimeline: (seconds: number, options?: { syncShot?: boolean }) => void;
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
  currentSeconds = 0,
  totalSeconds,
  onSelectShot,
  onSeekTimeline,
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
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const currentSecondsRef = React.useRef(currentSeconds);
  const summary = summarizeEpisodeShotStrip(strip);
  const resolvedTotalSeconds = Math.max(totalSeconds ?? getEpisodeShotStripTotalSeconds(strip), 0);
  const resolvedCurrentSeconds = clampSeconds(currentSeconds, resolvedTotalSeconds);
  const progressPercent = resolvedTotalSeconds > 0 ? (resolvedCurrentSeconds / resolvedTotalSeconds) * 100 : 0;

  React.useEffect(() => {
    currentSecondsRef.current = resolvedCurrentSeconds;
  }, [resolvedCurrentSeconds]);

  React.useEffect(() => {
    if (!isPlaying) {
      return;
    }

    if (resolvedTotalSeconds <= 0) {
      setIsPlaying(false);
      return;
    }

    const timer = window.setInterval(() => {
      const nextSeconds = clampSeconds(currentSecondsRef.current + 0.2, resolvedTotalSeconds);
      currentSecondsRef.current = nextSeconds;
      onSeekTimeline(nextSeconds, { syncShot: false });
      if (nextSeconds >= resolvedTotalSeconds) {
        setIsPlaying(false);
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [isPlaying, onSeekTimeline, resolvedTotalSeconds]);

  React.useEffect(() => {
    if (resolvedCurrentSeconds >= resolvedTotalSeconds && resolvedTotalSeconds > 0) {
      setIsPlaying(false);
    }
  }, [resolvedCurrentSeconds, resolvedTotalSeconds]);

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

  const seekFromClientX = React.useCallback((clientX: number, syncShot: boolean) => {
    const railRect = railRef.current?.getBoundingClientRect();
    if (!railRect || resolvedTotalSeconds <= 0) {
      return;
    }

    const ratio = Math.max(0, Math.min(1, (clientX - railRect.left) / railRect.width));
    const nextSeconds = ratio * resolvedTotalSeconds;
    onSeekTimeline(nextSeconds, { syncShot });
  }, [onSeekTimeline, resolvedTotalSeconds]);

  React.useEffect(() => {
    if (!isScrubbing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      seekFromClientX(event.clientX, true);
    };

    const handlePointerUp = (event: PointerEvent) => {
      seekFromClientX(event.clientX, true);
      setIsScrubbing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isScrubbing, seekFromClientX]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={resolvedTotalSeconds <= 0}
            onClick={() => setIsPlaying((current) => !current)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPlaying ? '暂停' : '播放'}
          </button>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
            时间 {formatTimecode(resolvedCurrentSeconds)} / {formatTimecode(resolvedTotalSeconds)}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
            已成片 {summary.completedSlots} / {summary.totalSlots}
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
            分镜总时长 {formatTimecode(resolvedTotalSeconds)}
          </div>
        </div>
        <div className="text-xs text-white/45">
          底部时间条管理整集绝对时间；镜头卡负责切换当前编辑上下文。
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[#05070d]/88 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-white/35">
            <span>Timeline</span>
            <span>{formatTimecode(resolvedCurrentSeconds)} / {formatTimecode(resolvedTotalSeconds)}</span>
          </div>
          <div
            ref={railRef}
            onPointerDown={(event) => {
              setIsPlaying(false);
              setIsScrubbing(true);
              seekFromClientX(event.clientX, true);
            }}
            className="relative h-3 cursor-pointer rounded-full bg-white/[0.06]"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-300/80 via-cyan-300/65 to-fuchsia-300/75"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 h-4 w-4 rounded-full border border-white/50 bg-white shadow-[0_0_24px_rgba(115,224,255,0.35)]"
              style={{
                left: `calc(${progressPercent}% - 8px)`,
                transform: 'translateY(-50%)',
              }}
            />
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
                  className={`w-[176px] shrink-0 rounded-[24px] border p-3 transition ${
                    isActive
                      ? 'border-cyan-300/35 bg-cyan-300/[0.08]'
                      : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/25'
                  } ${draggingShotId === slot.id ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      onSelectShot(slot.id);
                    }}
                    className="block w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                          镜头 {index + 1}
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
                          <div className="mt-2 line-clamp-2 text-sm font-semibold text-white">{slot.title}</div>
                        )}
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-300">
                        {slot.clip?.durationLabel || slot.durationLabel || '未定长'}
                      </span>
                    </div>

                    {previewUrl ? (
                      <div className="mt-3 overflow-hidden rounded-[18px] border border-white/10 bg-black/30">
                        <video
                          src={slot.clip?.thumbnailUrl || previewUrl}
                          className="h-24 w-full bg-black object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      </div>
                    ) : (
                      <div className="mt-3 flex h-24 items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 px-3 text-center text-xs text-slate-400">
                        {slot.job
                          ? (slot.job.status === 'FAILED'
                            ? (slot.job.error || '生成失败，可重试')
                            : jobSummary || '排队中...')
                          : '空分镜槽'}
                      </div>
                    )}
                  </button>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {jobSummary && !previewUrl ? (
                      <span className={`rounded-full border px-2 py-1 text-[10px] ${jobBadgeClass(slot.job)}`}>
                        {jobSummary}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-300">
                        {formatTimecode(slot.startSeconds || 0)} - {formatTimecode(slot.endSeconds || 0)}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
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

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {previewUrl ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onClearShotResult(slot.id)}
                          className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-slate-100"
                        >
                          清空
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadShotClip(slot)}
                          className="rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-black transition hover:opacity-90"
                        >
                          下载
                        </button>
                      </div>
                    ) : canCancelShotJob(slot.job) ? (
                      <button
                        type="button"
                        onClick={() => onCancelShotJob(slot.id)}
                        className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100"
                      >
                        取消
                      </button>
                    ) : canRetryShotJob(slot.job) ? (
                      <button
                        type="button"
                        onClick={() => onRetryShotJob(slot.id)}
                        className="rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-black transition hover:opacity-90"
                      >
                        重试
                      </button>
                    ) : (
                      <span className="text-[11px] text-white/35">{slot.source === 'manual' ? '手动镜头' : '分镜镜头'}</span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        onSelectShot(slot.id);
                      }}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-slate-100"
                    >
                      {isActive ? '当前' : '切换'}
                    </button>
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
              className="flex h-[258px] w-[176px] shrink-0 items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.05]"
            >
              新增分镜槽
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
