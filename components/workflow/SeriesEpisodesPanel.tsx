import React from 'react';
import type { WorkflowInstance, WorkflowStageStatus } from '../../services/workflow/domain/types';
import { countCompletedStages } from '../../services/workflow/runtime/projectState';

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const scriptStatusMeta: Record<
  WorkflowStageStatus,
  {
    label: string;
    className: string;
  }
> = {
  not_started: {
    label: '剧本未开始',
    className: 'border-white/10 bg-white/5 text-slate-300',
  },
  in_progress: {
    label: '剧本进行中',
    className: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100',
  },
  completed: {
    label: '剧本已完成',
    className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100',
  },
  error: {
    label: '剧本异常',
    className: 'border-red-500/30 bg-red-500/15 text-red-100',
  },
};

interface SeriesEpisodesPanelProps {
  episodes: WorkflowInstance[];
  seriesUpdatedAt: string;
  stageTitleMap: Record<string, string>;
  onSelectEpisode: (episodeId: string) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

export const SeriesEpisodesPanel: React.FC<SeriesEpisodesPanelProps> = ({
  episodes,
  seriesUpdatedAt,
  stageTitleMap,
  onSelectEpisode,
  onMaterializeWorkflow,
}) => {
  void onMaterializeWorkflow;

  return (
    <div className="tianti-surface-muted mt-8 rounded-[24px] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">单集规划</div>
          <div className="mt-2 text-sm text-slate-300">先把单集铺出来，再逐集推进剧本。</div>
        </div>
        <div className="text-xs text-white/40">最近更新 {formatUpdatedAt(seriesUpdatedAt)}</div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {episodes.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm leading-7 text-slate-400">
            还没有单集。先新增一集，让剧本入口跑起来。
          </div>
        ) : (
          episodes.map((episode) => {
            const scriptStage = episode.stageStates['episode-script'];
            const scriptMeta = scriptStatusMeta[scriptStage?.status ?? 'not_started'];
            const nextStageId = Object.keys(episode.stageStates).find(
              (stageId) => episode.stageStates[stageId]?.status !== 'completed',
            );

            return (
              <article key={episode.id} className="tianti-surface rounded-[22px] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{episode.title}</div>
                    <div className="mt-1 text-xs text-white/40">
                      阶段 {countCompletedStages(episode)}/{Object.keys(episode.stageStates).length}
                    </div>
                  </div>
                  <span className="tianti-chip is-accent">Episode {episode.metadata?.episodeNumber ?? '--'}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${scriptMeta.className}`}>
                    {scriptMeta.label}
                  </span>
                  {nextStageId && <span className="tianti-chip">下一步 {stageTitleMap[nextStageId] ?? nextStageId}</span>}
                </div>

                <div className="mt-4 text-sm leading-7 text-slate-300">
                  先完成单集剧本，再继续往后推进。
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => onSelectEpisode(episode.id)}
                    className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
                  >
                    打开单集
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
