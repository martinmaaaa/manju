import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Episode } from '../../../types/workflowApp';
import { Card, MetricTile } from '../PagePrimitives';

type EpisodeSceneCard = {
  id: string;
  title: string;
  summary: string;
  shotCount: number;
  durationLabel: string;
};

interface EpisodeScenesPageProps {
  currentEpisode: Episode | null;
  currentStatusLabel: string;
  sceneCards: EpisodeSceneCard[];
  shotTotal: number;
  onGoEpisodes: () => void;
  onEnterWorkspace: () => void;
}

export function EpisodeScenesPage({
  currentEpisode,
  currentStatusLabel,
  sceneCards,
  shotTotal,
  onGoEpisodes,
  onEnterWorkspace,
}: EpisodeScenesPageProps) {
  return (
    <div className="space-y-6">
      <Card
        eyebrow="进入工作台前"
        title={currentEpisode ? `${currentEpisode.title} · 分切确认` : '单集分切确认'}
        action={(
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onGoEpisodes}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
            >
              返回剧集
            </button>
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              进入工作台
            </button>
          </div>
        )}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile label="场景数" value={sceneCards.length} />
          <MetricTile label="镜头数" value={shotTotal} />
          <MetricTile label="当前状态" value={currentStatusLabel} />
        </div>
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          这一页只做两件事：阅读本集脚本、确认分切结果。确认无误后再进入工作台执行镜头生成。
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_360px]">
        <Card
          eyebrow="剧本"
          title={currentEpisode ? `${currentEpisode.title} · 脚本内容` : '单集脚本'}
          action={(
            <button
              type="button"
              onClick={onEnterWorkspace}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              进入工作台
            </button>
          )}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
              场景 {sceneCards.length}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
              镜头 {shotTotal}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
              状态 {currentStatusLabel}
            </span>
          </div>
          <div className="min-h-[680px] whitespace-pre-wrap rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-5 text-sm leading-7 text-slate-200">
            {currentEpisode?.sourceText || currentEpisode?.synopsis || '当前还没有单集脚本内容。'}
          </div>
        </Card>

        <Card eyebrow="分切" title="场景列表">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
            右侧只用来确认场景切分与镜头规模。确认无误后，整集会进入下一个工作台页面继续做镜头生成。
          </div>
          <div className="mt-4 space-y-3">
            {sceneCards.map((scene, sceneIndex) => (
              <button
                key={scene.id}
                type="button"
                onClick={onEnterWorkspace}
                className="flex w-full items-start gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] text-sm font-semibold text-cyan-100">
                  {sceneIndex + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-base font-semibold text-white">{scene.title}</div>
                    <div className="text-[11px] text-cyan-200">{scene.durationLabel}</div>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">{scene.summary}</div>
                  <div className="mt-4 flex items-center justify-between text-xs text-white/45">
                    <span>{scene.shotCount} 个镜头</span>
                    <span>确认后进入工作台</span>
                  </div>
                </div>
                <ChevronRight size={18} className="mt-1 shrink-0 text-white/30" />
              </button>
            ))}
          </div>
          {sceneCards.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-sm text-slate-300">
              先运行单集分析或分镜生成，才能看到分切结果。
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
