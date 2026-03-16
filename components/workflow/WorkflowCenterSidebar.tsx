import React from 'react';
import { Clapperboard, Film, Layers3, Users } from 'lucide-react';
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

const templateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'manju-series': Layers3,
  'manju-episode': Clapperboard,
  'manju-commentary': Film,
  'character-assets': Users,
};

const workflowBlueprints: Partial<
  Record<
    WorkflowTemplateId,
    {
      title: string;
      rails: string[];
      emphasis: string;
    }
  >
> = {
  'manju-series': {
    title: '漫剧整套工作流',
    rails: ['系列总控', '资产复用', '单集执行'],
    emphasis: '适合 20-80 集的长线漫剧生产',
  },
  'manju-commentary': {
    title: '漫剧解说工作流',
    rails: ['素材拆解', '解说文案', '配音成片'],
    emphasis: '适合剧情复盘、看点提炼与解说视频',
  },
  'character-assets': {
    title: '角色资产工作流',
    rails: ['角色设定', '版本沉淀'],
    emphasis: '适合先沉淀角色资产，再回流到系列工作流',
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
    <section className="tianti-hero-card p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">产品定位</div>
      <h2 className="mt-3 text-2xl font-semibold">工作流优先的创作中心</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">
        先选择整套工作流，再推进系列资产、分集制作与连续性管理。原始节点画布仍保留，
        用于高级调试和执行。
      </p>
    </section>

    <section className="tianti-surface rounded-[28px] p-6">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">固定工作流方案</div>
      <div className="mt-4 space-y-3">
        {templates
          .filter((template) => template.id !== 'manju-episode')
          .map((template) => {
            const Icon = templateIcons[template.id] ?? Layers3;
            const blueprint = workflowBlueprints[template.id];

            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onCreateWorkflow(template.id)}
                className="w-full rounded-[22px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-cyan-500/40 hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {blueprint?.title ?? template.name}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">
                      {template.summary}
                    </div>
                  </div>
                </div>
                {blueprint?.rails && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {blueprint.rails.map((rail) => (
                      <span
                        key={`${template.id}-${rail}`}
                        className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100"
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
                <div className="mt-3 text-[11px] leading-5 text-white/45">
                  {template.recommendedFor}
                </div>
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
