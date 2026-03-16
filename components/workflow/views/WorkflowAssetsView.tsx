import React, { useMemo } from 'react';
import { Boxes, PackageOpen, Sparkles } from 'lucide-react';
import type {
  WorkflowAssetBatchTemplateTarget,
  WorkflowAssetType,
  WorkflowProjectState,
} from '../../../services/workflow/domain/types';
import {
  getAssetSummaryForState,
  getSeriesInstances,
  getSuggestedAssetBatchTemplateTargetsForAsset,
} from '../../../services/workflow/runtime/projectState';
import { AssetCenterPanel } from '../panels/AssetCenterPanel';

interface WorkflowAssetsViewProps {
  workflowState: WorkflowProjectState;
  onCreateAsset: (
    type: WorkflowAssetType,
    name: string,
    tags: string[],
    options?: {
      seriesInstanceId?: string;
      autoApplySuggestedTemplates?: boolean;
    },
  ) => Promise<{
    assetId: string;
    assetName: string;
    appliedTemplateNames: string[];
    suggestedTargets: WorkflowAssetBatchTemplateTarget[];
  } | void> | void;
  onCreateAssetVersion: (assetId: string, notes?: string) => void;
  onSaveSeriesAssetBatchTemplate: (
    seriesInstanceId: string,
    name: string,
    assetIds: string[],
    templateId?: string,
    autoApplyToNewEpisodes?: boolean,
  ) => void;
}

export const WorkflowAssetsView: React.FC<WorkflowAssetsViewProps> = ({
  workflowState,
  onCreateAsset,
  onCreateAssetVersion,
  onSaveSeriesAssetBatchTemplate,
}) => {
  const seriesInstances = useMemo(() => getSeriesInstances(workflowState), [workflowState]);
  const activeSeries = useMemo(() => (
    seriesInstances.find(instance => instance.id === workflowState.activeSeriesId) ?? seriesInstances[0] ?? null
  ), [seriesInstances, workflowState.activeSeriesId]);
  const assetSummary = useMemo(() => getAssetSummaryForState(workflowState), [workflowState]);
  const assetBatchTemplates = activeSeries?.metadata?.assetBatchTemplates ?? [];

  const assetBatchTargetsByAssetId = useMemo(() => {
    if (!activeSeries) return {} as Record<string, WorkflowAssetBatchTemplateTarget[]>;

    return workflowState.assets.reduce<Record<string, WorkflowAssetBatchTemplateTarget[]>>((accumulator, asset) => {
      accumulator[asset.id] = getSuggestedAssetBatchTemplateTargetsForAsset(workflowState, activeSeries.id, asset.id);
      return accumulator;
    }, {});
  }, [activeSeries, workflowState]);

  return (
    <div className="space-y-6">
      <section className="tianti-hero-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Asset Library</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">让人物、场景、道具和风格资产先沉淀下来</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              漫剧是长链路复用型生产，资产中心负责先沉淀统一版本，再把这些资产分发给后续剧集工作流。
            </p>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm">
            <StatCard label="人物" value={assetSummary.character} />
            <StatCard label="场景" value={assetSummary.scene} />
            <StatCard label="道具" value={assetSummary.prop} />
            <StatCard label="风格" value={assetSummary.style} />
          </div>
        </div>

        <div className="tianti-surface-muted mt-5 rounded-[22px] px-5 py-4 text-sm text-slate-300">
          {activeSeries ? (
            <>
              当前复用模板归属到 <span className="font-medium text-white">{activeSeries.title}</span>，
              新资产可以直接挂入系列模板，后续新建剧集时自动复用。
            </>
          ) : (
            <>
              还没有创建系列工作流。你仍然可以先沉淀资产，等系列建立后再统一挂入复用模板。
            </>
          )}
        </div>
      </section>

      <AssetCenterPanel
        assets={workflowState.assets}
        assetVersions={workflowState.assetVersions}
        seriesTitle={activeSeries?.title}
        canAutoAttachSuggestedTemplates={Boolean(activeSeries)}
        assetBatchTemplates={assetBatchTemplates}
        assetBatchTargetsByAssetId={assetBatchTargetsByAssetId}
        onCreateAsset={(type, name, tags, autoApplySuggestedTemplates) => (
          onCreateAsset(type, name, tags, {
            seriesInstanceId: activeSeries?.id,
            autoApplySuggestedTemplates,
          })
        )}
        onCreateAssetVersion={onCreateAssetVersion}
        onApplyAssetBatchTemplateTarget={(assetId, target) => {
          if (!activeSeries) return;

          const existingTemplate = assetBatchTemplates.find(template => (
            (target.templateId && template.id === target.templateId) || template.name === target.name
          ));
          const assetIds = Array.from(new Set([...(existingTemplate?.assetIds ?? []), assetId]));

          onSaveSeriesAssetBatchTemplate(
            activeSeries.id,
            target.name,
            assetIds,
            existingTemplate?.id ?? target.templateId,
            target.autoApplyToNewEpisodes,
          );
        }}
      />

      <section className="tianti-surface rounded-[28px] p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-100">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-white">复用模板</div>
            <div className="mt-1 text-sm text-slate-400">把常用资产打包成系列模板，后续剧集自动继承。</div>
          </div>
        </div>

        {assetBatchTemplates.length === 0 ? (
          <div className="tianti-surface-muted mt-5 rounded-[22px] border border-dashed p-5 text-sm leading-7 text-slate-400">
            暂无复用模板。你可以在上面的资产创建反馈中一键归入模板，或先积累一批资产后再整理。
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {assetBatchTemplates.map((template) => (
              <article
                key={template.id}
                className="tianti-surface-muted rounded-[22px] p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/5 p-3 text-cyan-100">
                    <PackageOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{template.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      资产数量 {template.assetIds.length} · {template.autoApplyToNewEpisodes ? '新剧集自动继承' : '手动绑定'}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-50 shadow-[0_16px_40px_rgba(16,185,129,0.12)]">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" />
            优化建议
          </div>
          <div className="mt-2 text-emerald-100/90">
            下一阶段可以继续把资产模板升级成“人物包 / 场景包 / 道具包”的可组合资产方案，进一步适配 80 集长线复用。
          </div>
        </div>
      </section>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="tianti-stat-card px-4 py-3">
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
  </div>
);
