import React from 'react';
import { Layers3, Sparkles } from 'lucide-react';

export type WorkflowWorkbenchTabKey = 'stages' | 'bindings' | 'continuity' | 'outputs';

type WorkflowWorkbenchTab = {
  key: WorkflowWorkbenchTabKey;
  label: string;
  count?: number;
};

interface WorkflowWorkbenchPanelProps {
  activeEpisodeTitle?: string;
  stageProgressLabel?: string;
  bindingCount?: number;
  continuityCount?: number;
  outputCount?: number;
  tabs?: WorkflowWorkbenchTab[];
  activeTab?: WorkflowWorkbenchTabKey;
  onTabChange?: (tab: WorkflowWorkbenchTabKey) => void;
  children?: React.ReactNode;
}

export const WorkflowWorkbenchPanel: React.FC<WorkflowWorkbenchPanelProps> = ({
  activeEpisodeTitle,
  stageProgressLabel,
  bindingCount,
  continuityCount,
  outputCount,
  tabs = [],
  activeTab = 'stages',
  onTabChange,
  children,
}) => {
  const summaryChips = [
    stageProgressLabel ? { key: 'stages', label: stageProgressLabel, accent: true } : null,
    typeof bindingCount === 'number' ? { key: 'bindings', label: `绑定 ${bindingCount}` } : null,
    typeof continuityCount === 'number' ? { key: 'continuity', label: `连续性 ${continuityCount}` } : null,
    typeof outputCount === 'number' ? { key: 'outputs', label: `产出 ${outputCount}` } : null,
  ].filter((item): item is { key: string; label: string; accent?: boolean } => Boolean(item));

  return (
    <aside className="tianti-surface rounded-[32px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-300/80">
            <Layers3 className="h-4 w-4" />
            单集聚焦
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {activeEpisodeTitle ?? '等待选择单集'}
          </div>
          <div className="mt-2 text-sm leading-7 text-slate-300">
            这里先收口当前单集的剧本与阶段推进，不再把更后面的执行细节提前摊开。
          </div>
        </div>
        {summaryChips.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {summaryChips.map((chip) => (
              <span key={chip.key} className={chip.accent ? 'tianti-chip is-accent' : 'tianti-chip'}>
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {tabs.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange?.(tab.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                activeTab === tab.key
                  ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-500/30 hover:text-white'
              }`}
            >
              {tab.label}
              {typeof tab.count === 'number' ? ` · ${tab.count}` : ''}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {children ?? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="mt-4 text-base font-medium text-white">先锁定一个单集焦点</div>
            <div className="mt-2 text-sm leading-7 text-slate-400">
              从左侧系列详情里打开某一集后，这里会承接该单集的剧本与阶段推进。
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
