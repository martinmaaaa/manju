import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { WorkflowBindingMode, WorkflowInstance } from '../../services/workflow/domain/types';
import { countCompletedStages } from '../../services/workflow/runtime/projectState';

type PreferredBindingMode = Extract<WorkflowBindingMode, 'follow_latest' | 'pinned'>;

const bindingModeLabels: Record<PreferredBindingMode, string> = {
  follow_latest: '跟随最新',
  pinned: '固定版本',
};

function toPreferredBindingMode(mode?: WorkflowBindingMode): PreferredBindingMode {
  return mode === 'pinned' ? 'pinned' : 'follow_latest';
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
}) => (
  <div className="tianti-surface-muted mt-8 rounded-[24px] p-6">
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">分集工作区</div>
        <div className="mt-2 text-sm text-slate-300">
          单集默认先走阶段视图；只有需要调试或一键执行时，才投放到原始画布。
        </div>
      </div>
      <div className="text-xs text-white/40">最近更新 {formatUpdatedAt(seriesUpdatedAt)}</div>
    </div>

    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {episodes.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm leading-7 text-slate-400">
          还没有单集工作流。先点击“新增单集”或“批量新增”，再进入单集工作区推进每一集内容。
        </div>
      ) : (
        episodes.map((episode) => (
          <article key={episode.id} className="tianti-surface rounded-[22px] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">{episode.title}</div>
                <div className="mt-1 text-xs text-white/40">
                  阶段 {countCompletedStages(episode)}/{Object.keys(episode.stageStates).length}
                </div>
              </div>
              <span className="tianti-chip is-accent">
                Episode {episode.metadata?.episodeNumber ?? '--'}
              </span>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              默认绑定：
              {bindingModeLabels[toPreferredBindingMode(episode.metadata?.preferredBindingMode)]}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.keys(episode.stageStates).map((stageId) => (
                <span key={stageId} className="tianti-chip">
                  {stageTitleMap[stageId] ?? stageId}
                </span>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => onSelectEpisode(episode.id)}
                className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
              >
                打开单集
              </button>
              <button
                type="button"
                onClick={() => onMaterializeWorkflow(episode.id)}
                className="tianti-button tianti-button-primary px-4 py-2 text-sm font-medium"
              >
                投放画布
                <ChevronRight size={15} />
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  </div>
);
