import React from 'react';
import type { Episode } from '../../../types/workflowApp';
import { Card, MetricTile } from '../PagePrimitives';

type EpisodeSceneCard = {
  id: string;
  title: string;
  summary: string;
  shotCount: number;
  durationLabel: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

interface EpisodesPageProps {
  episodes: Episode[];
  hasSavedScript: boolean;
  scriptRunRunning: boolean;
  scriptRunFailed: boolean;
  analyzedEpisodeCount: number;
  totalShotCount: number;
  formatEpisodeStatus: (status: string) => string;
  isEpisodeAnalyzeLocked: (episodeId: string) => boolean;
  getEpisodeSceneCards: (episode: Episode) => EpisodeSceneCard[];
  onGoSetup: () => void;
  onRunScriptDecompose: () => void | Promise<void>;
  onOpenEpisode: (episode: Episode) => void | Promise<void>;
  onEnterWorkspace: (episodeId: string) => void;
}

export function EpisodesPage({
  episodes,
  hasSavedScript,
  scriptRunRunning,
  scriptRunFailed,
  analyzedEpisodeCount,
  totalShotCount,
  formatEpisodeStatus,
  isEpisodeAnalyzeLocked,
  getEpisodeSceneCards,
  onGoSetup,
  onRunScriptDecompose,
  onOpenEpisode,
  onEnterWorkspace,
}: EpisodesPageProps) {
  return (
    <div className="space-y-6">
      <Card eyebrow="流程三" title="按集进入工作台">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile label="剧集总数" value={episodes.length} />
          <MetricTile label="已完成单集分析" value={analyzedEpisodeCount} />
          <MetricTile label="已预估镜头" value={totalShotCount} hint="根据当前分切结果估算" />
        </div>
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          剧集页现在只负责按集进入。先确认哪一集已经完成单集分析，再进入场景页或直接进入工作台。
        </div>
      </Card>

      {episodes.length === 0 ? (
        <Card eyebrow="剧集" title="还没有可用剧集">
          <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-6">
            <div className="text-lg font-semibold text-white">
              {!hasSavedScript
                ? '先保存剧本，再生成剧集。'
                : scriptRunRunning
                  ? '剧本拆解正在运行，请稍候。'
                  : scriptRunFailed
                    ? '剧本拆解失败，需要返回设定页重试。'
                    : '还没有生成剧集，请先运行剧本拆解。'}
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {!hasSavedScript
                ? '当前项目还没有稳定保存的剧本文本或剧本文件，系统无法生成项目圣经和剧集列表。'
                : scriptRunRunning
                  ? '系统已经收到剧本拆解请求，但当前页缺少明确的运行提示。完成后这里会出现剧集卡片。'
                  : scriptRunFailed
                    ? '最近一次剧本拆解没有成功，请返回设定页检查剧本和阶段配置后重新运行。'
                    : '先回到设定页运行剧本拆解，系统会自动产出项目圣经、资产候选和剧集列表。'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onGoSetup}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
              >
                返回设定页
              </button>
              {hasSavedScript ? (
                <button
                  type="button"
                  disabled={scriptRunRunning}
                  onClick={() => void onRunScriptDecompose()}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scriptRunRunning ? '剧本拆解中...' : '运行剧本拆解'}
                </button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {episodes.map((episode) => {
          const episodeSceneCards = getEpisodeSceneCards(episode);
          const previewCards = episodeSceneCards.slice(0, 3);
          const shotTotal = episodeSceneCards.reduce((sum, item) => sum + item.shotCount, 0);
          const analyzeLocked = isEpisodeAnalyzeLocked(episode.id);
          const episodeReady = ['ready', 'generated'].includes(episode.status);

          return (
            <div key={episode.id} className="grid gap-5 rounded-[28px] border border-white/10 bg-black/30 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">第 {episode.episodeNumber} 集</div>
                  <div className={cx('rounded-full border px-3 py-1 text-xs', episodeReady ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>
                    {formatEpisodeStatus(episode.status)}
                  </div>
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-white">{episode.title}</h2>
                <p className="mt-4 line-clamp-4 text-sm leading-7 text-slate-300">{episode.synopsis}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                    {episodeSceneCards.length || 0} 个分切片段
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                    约 {shotTotal || 0} 个镜头
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                    {'进入路径：分切确认 -> 工作台'}
                  </span>
                </div>

                {previewCards.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {previewCards.map((scene, index) => (
                      <div key={scene.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">片段 {index + 1}</div>
                          <div className="text-[11px] text-cyan-200">{scene.durationLabel}</div>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">{scene.title}</div>
                        <div className="mt-2 line-clamp-3 text-sm leading-6 text-slate-300">{scene.summary}</div>
                        <div className="mt-3 text-xs text-white/45">{scene.shotCount} 个镜头</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-300">
                    还没有单集上下文，请先分析本集，再进入分切确认页。
                  </div>
                )}
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">下一步</div>
                <div className="mt-3 text-sm leading-7 text-slate-300">
                  {episodeReady
                    ? '本集已经具备进入分切确认页和工作台的基础条件，先看分切再进入生成。'
                    : '这集还没有完成单集分析，先拉起详情和分切结果，再进入工作台。'}
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>分切片段</span>
                    <span>{episodeSceneCards.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>预估镜头</span>
                    <span>{shotTotal || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>当前状态</span>
                    <span>{formatEpisodeStatus(episode.status)}</span>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={analyzeLocked}
                    onClick={() => void onOpenEpisode(episode)}
                    className="rounded-full bg-[#173515] px-4 py-2 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {analyzeLocked ? '加载详情中...' : episodeReady ? '查看分切' : '先分析本集'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace(episode.id)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                  >
                    直接进入工作台
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
