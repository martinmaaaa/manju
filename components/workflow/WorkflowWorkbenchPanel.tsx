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
  bindingCount: number;
  continuityCount: number;
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
  outputCount = 0,
  tabs = [],
  activeTab = 'stages',
  onTabChange,
  children,
}) => (
  <aside className="tianti-surface rounded-[32px] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-300/80">
          <Layers3 className="h-4 w-4" />
          右侧工作台
        </div>
        <div className="mt-2 text-2xl font-semibold text-white">
          {activeEpisodeTitle ?? '等待选择单集'}
        </div>
        <div className="mt-2 text-sm leading-7 text-slate-300">
          这里收口当前焦点单集的阶段推进、资产绑定和连续性记录，不再把这部分混在总览流里。
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {stageProgressLabel && <span className="tianti-chip is-accent">{stageProgressLabel}</span>}
        <span className="tianti-chip">绑定 {bindingCount}</span>
        <span className="tianti-chip">连续性 {continuityCount}</span>
        <span className="tianti-chip">产出 {outputCount}</span>
      </div>
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
            从上方系列详情里打开某一集后，右侧工作台会承接该单集的阶段推进、绑定、连续性和产出收口。
          </div>
        </div>
      )}
    </div>
  </aside>
);
