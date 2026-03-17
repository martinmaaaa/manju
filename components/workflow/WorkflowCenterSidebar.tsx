import React from 'react';
import { Layers3 } from 'lucide-react';
import type {
  WorkflowTemplateDefinition,
  WorkflowTemplateId,
} from '../../services/workflow/domain/types';
const workflowBlueprints: Record<'manju-series', {
  title: string;
  rails: string[];
  emphasis: string;
}> = {
  'manju-series': {
    title: '漫剧主工作流',
    rails: ['系列设定', '分集规划', '单集剧本'],
    emphasis: '当前只保留漫剧主线，先把系列和剧本路径走通。',
  },
};

interface WorkflowCenterSidebarProps {
  templates: WorkflowTemplateDefinition[];
  onCreateWorkflow: (templateId: WorkflowTemplateId) => void;
}

export const WorkflowCenterSidebar: React.FC<WorkflowCenterSidebarProps> = ({
  templates,
  onCreateWorkflow,
}) => (
  <aside className="flex h-full flex-col gap-6 overflow-y-auto pr-2">
    <section className="tianti-surface rounded-[28px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Primary Workflow</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">漫剧主线</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">先定系列，再写剧本和分集计划。</p>
        </div>
        <span className="tianti-chip is-accent">当前仅保留 1 条</span>
      </div>

      <div className="mt-4 space-y-3">
        {templates
          .filter((template) => template.id === 'manju-series')
          .map((template) => {
            const blueprint = workflowBlueprints['manju-series'];

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onCreateWorkflow(template.id)}
                className="w-full rounded-[22px] border border-cyan-500/20 bg-cyan-500/10 p-4 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/15"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-200">
                    <Layers3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {blueprint?.title ?? template.name}
                    </div>
                  </div>
                </div>
                {blueprint?.rails && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blueprint.rails.map((rail) => (
                      <span
                        key={`${template.id}-${rail}`}
                        className="rounded-full border border-cyan-500/20 bg-black/20 px-3 py-1 text-[11px] text-cyan-100"
                      >
                        {rail}
                      </span>
                    ))}
                  </div>
                )}
                {blueprint?.emphasis && (
                  <div className="mt-3 text-[11px] leading-5 text-cyan-100/80">
                    {blueprint.emphasis}
                  </div>
                )}
              </button>
            );
          })}
      </div>
    </section>

    <section className="tianti-surface rounded-[28px] p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">当前范围</div>
      <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-slate-300">
        首页只承接系列设定、分集规划和单集剧本。
        资产沉淀与后续执行保留在独立页签里，避免主路径被打散。
      </div>
    </section>
  </aside>
);
