import React from 'react';
import { Layers3 } from 'lucide-react';
import type {
  WorkflowAsset,
  WorkflowAssetBatchTemplate,
  WorkflowAssetBatchTemplateTarget,
  WorkflowAssetType,
  WorkflowAssetVersion,
  WorkflowTemplateDefinition,
  WorkflowTemplateId,
} from '../../services/workflow/domain/types';
import { AssetCenterPanel } from './panels/AssetCenterPanel';

const workflowBlueprints: Record<
  'manju-series',
  {
    title: string;
    rails: string[];
    emphasis: string;
  }
> = {
  'manju-series': {
    title: '漫剧主工作流',
    rails: ['系列设定', '分集规划', '单集剧本'],
    emphasis: '当前只保留漫剧主线，先把系列和剧本路径走通。',
  },
};

const SummaryBadge: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="tianti-stat-card px-4 py-3">
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
  </div>
);

interface WorkflowCenterSidebarProps {
  templates: WorkflowTemplateDefinition[];
  assetSummary: {
    character: number;
    scene: number;
    prop: number;
    style: number;
  };
  assets: WorkflowAsset[];
  assetVersions: WorkflowAssetVersion[];
  assetCenterSeriesTitle?: string;
  canAutoAttachSuggestedTemplates: boolean;
  assetBatchTemplates: WorkflowAssetBatchTemplate[];
  assetBatchTargetsByAssetId: Record<string, WorkflowAssetBatchTemplateTarget[]>;
  assetCenterRef: React.RefObject<HTMLDivElement | null>;
  onCreateWorkflow: (templateId: WorkflowTemplateId) => void;
  onCreateAsset: (
    type: WorkflowAssetType,
    name: string,
    tags: string[],
    autoApplySuggestedTemplates?: boolean,
  ) => Promise<{
    assetId: string;
    assetName: string;
    appliedTemplateNames: string[];
    suggestedTargets: WorkflowAssetBatchTemplateTarget[];
  } | void> | void;
  onCreateAssetVersion: (assetId: string, notes?: string) => void;
  onApplyAssetBatchTemplateTarget: (
    assetId: string,
    target: WorkflowAssetBatchTemplateTarget,
  ) => void;
}

export const WorkflowCenterSidebar: React.FC<WorkflowCenterSidebarProps> = ({
  templates,
  assetSummary,
  assets,
  assetVersions,
  assetCenterSeriesTitle,
  canAutoAttachSuggestedTemplates,
  assetBatchTemplates,
  assetBatchTargetsByAssetId,
  assetCenterRef,
  onCreateWorkflow,
  onCreateAsset,
  onCreateAssetVersion,
  onApplyAssetBatchTemplateTarget,
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
            const blueprint = workflowBlueprints.manju-series;

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

    <div ref={assetCenterRef}>
      <AssetCenterPanel
        assets={assets}
        assetVersions={assetVersions}
        seriesTitle={assetCenterSeriesTitle}
        canAutoAttachSuggestedTemplates={canAutoAttachSuggestedTemplates}
        assetBatchTemplates={assetBatchTemplates}
        assetBatchTargetsByAssetId={assetBatchTargetsByAssetId}
        onCreateAsset={onCreateAsset}
        onCreateAssetVersion={onCreateAssetVersion}
        onApplyAssetBatchTemplateTarget={onApplyAssetBatchTemplateTarget}
      />
    </div>

    <section className="tianti-surface rounded-[28px] p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">资产概览</div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <SummaryBadge label="人物" value={assetSummary.character} />
        <SummaryBadge label="场景" value={assetSummary.scene} />
        <SummaryBadge label="道具" value={assetSummary.prop} />
        <SummaryBadge label="风格" value={assetSummary.style} />
      </div>
    </section>
  </aside>
);
