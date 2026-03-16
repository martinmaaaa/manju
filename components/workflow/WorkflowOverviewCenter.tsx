import React, { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clapperboard,
  Film,
  Layers3,
  Package2,
  Radar,
  Sparkles,
  Target,
  Wand2,
} from 'lucide-react';
import type { WorkflowSeriesOverview } from '../../services/workflow/domain/types';

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}

type WorkflowOverviewSeriesItem = {
  id: string;
  title: string;
  updatedAt: string;
  isActive: boolean;
  overview: WorkflowSeriesOverview;
};

interface WorkflowOverviewCenterProps {
  projectTitle: string;
  totalSeriesCount: number;
  totalAssetsCount: number;
  totalPlannedEpisodeCount: number;
  totalCreatedEpisodeCount: number;
  activeSeriesTitle?: string | null;
  activeEpisodeTitle?: string | null;
  seriesItems: WorkflowOverviewSeriesItem[];
  productionTotals: {
    script: number;
    asset: number;
    storyboard: number;
    prompt: number;
    video: number;
  };
  onFocusSeries: (seriesInstanceId: string) => void;
  onRunNextAction: (seriesInstanceId: string) => void;
}

type ProductionStageKey = 'script' | 'asset' | 'storyboard' | 'prompt' | 'video';

const productionStageMeta: Array<{
  key: ProductionStageKey;
  label: string;
  icon: LucideIcon;
  hint: string;
}> = [
  { key: 'script', label: '剧本', icon: BookOpen, hint: '剧本与分集节奏' },
  { key: 'asset', label: '资产', icon: Package2, hint: '人物 / 场景 / 道具绑定' },
  { key: 'storyboard', label: '分镜', icon: Clapperboard, hint: '镜头编排与节奏控制' },
  { key: 'prompt', label: '提示词', icon: Wand2, hint: '生成包与执行参数' },
  { key: 'video', label: '视频', icon: Film, hint: '最终交付与投放' },
];

export const WorkflowOverviewCenter: React.FC<WorkflowOverviewCenterProps> = ({
  projectTitle,
  totalSeriesCount,
  totalAssetsCount,
  totalPlannedEpisodeCount,
  totalCreatedEpisodeCount,
  activeSeriesTitle,
  activeEpisodeTitle,
  seriesItems,
  productionTotals,
  onFocusSeries,
  onRunNextAction,
}) => {
  const activeSeriesItem = useMemo(
    () => seriesItems.find((item) => item.isActive) ?? seriesItems[0] ?? null,
    [seriesItems],
  );
  const orderedActionQueue = useMemo(() => (
    [...seriesItems].sort((left, right) => {
      const leftScore = (left.isActive ? 1000 : 0)
        + (left.overview.uncoveredAssetCount * 20)
        + (Math.max(left.overview.plannedEpisodeCount - left.overview.createdEpisodeCount, 0) * 6)
        + (Math.max(left.overview.createdEpisodeCount - left.overview.videoCompletedEpisodeCount, 0) * 4);
      const rightScore = (right.isActive ? 1000 : 0)
        + (right.overview.uncoveredAssetCount * 20)
        + (Math.max(right.overview.plannedEpisodeCount - right.overview.createdEpisodeCount, 0) * 6)
        + (Math.max(right.overview.createdEpisodeCount - right.overview.videoCompletedEpisodeCount, 0) * 4);

      if (leftScore !== rightScore) return rightScore - leftScore;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
  ), [seriesItems]);
  const seriesNeedingAssets = seriesItems.filter((item) => item.overview.uncoveredAssetCount > 0);
  const seriesNeedingEpisodes = seriesItems.filter(
    (item) => item.overview.plannedEpisodeCount > item.overview.createdEpisodeCount,
  );
  const seriesWaitingVideo = seriesItems.filter(
    (item) => item.overview.videoCompletedEpisodeCount < item.overview.createdEpisodeCount,
  );
  const deliveryProgress = totalPlannedEpisodeCount > 0
    ? toPercent(totalCreatedEpisodeCount, totalPlannedEpisodeCount)
    : (totalCreatedEpisodeCount > 0 ? 100 : 0);
  const videoCompletionRate = totalCreatedEpisodeCount > 0
    ? toPercent(productionTotals.video, totalCreatedEpisodeCount)
    : 0;
  const activeSeriesStageRate = activeSeriesItem
    ? toPercent(
        activeSeriesItem.overview.seriesCompletedStageCount,
        activeSeriesItem.overview.seriesStageCount,
      )
    : 0;

  return (
    <section className="tianti-surface rounded-[32px] p-6">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="tianti-hero-card rounded-[28px] p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Workflow Hub</div>
          <h2 className="mt-3 text-3xl font-semibold text-white">工作流总览中心</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-50/90">
            这里不再只是展示信息，而是作为整部漫剧的控制塔：确定当前焦点系列、查看生产脉冲、识别资产缺口，再把节奏继续压到系列与单集工作台里。
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tianti-chip is-accent">{projectTitle}</span>
            <span className="tianti-chip">当前焦点 {activeSeriesTitle ?? '未锁定系列'}</span>
            <span className="tianti-chip">
              {activeEpisodeTitle ? `当前单集 ${activeEpisodeTitle}` : '当前未锁定单集'}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewStatCard
              label="系列工作流"
              value={String(totalSeriesCount)}
              hint="固定生产方案数"
            />
            <OverviewStatCard
              label="剧集铺排"
              value={`${totalCreatedEpisodeCount}${totalPlannedEpisodeCount > 0 ? ` / ${totalPlannedEpisodeCount}` : ''}`}
              hint={`铺排完成 ${deliveryProgress}%`}
            />
            <OverviewStatCard
              label="资产中心"
              value={String(totalAssetsCount)}
              hint="全项目可复用资产"
            />
            <OverviewStatCard
              label="最终交付"
              value={`${productionTotals.video}`}
              hint={`视频完成率 ${videoCompletionRate}%`}
              highlight
            />
          </div>

          <div className="mt-5 rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-100/80">
                  <Target className="h-4 w-4" />
                  当前主控焦点
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {activeSeriesItem?.title ?? '先创建一个系列工作流'}
                </div>
                <div className="mt-2 text-sm leading-7 text-cyan-50/90">
                  {activeSeriesItem?.overview.nextAction.description ?? '总览中心会在系列出现后自动给出下一步推进建议。'}
                </div>
              </div>
              {activeSeriesItem && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="tianti-chip is-accent">系列阶段 {activeSeriesStageRate}%</span>
                  <span className="tianti-chip">资产缺口 {activeSeriesItem.overview.uncoveredAssetCount}</span>
                  <span className="tianti-chip">
                    待交付 {Math.max(activeSeriesItem.overview.createdEpisodeCount - activeSeriesItem.overview.videoCompletedEpisodeCount, 0)}
                  </span>
                </div>
              )}
            </div>

            {activeSeriesItem && (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onFocusSeries(activeSeriesItem.id)}
                  className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
                >
                  继续聚焦系列
                </button>
                <button
                  type="button"
                  onClick={() => onRunNextAction(activeSeriesItem.id)}
                  className="tianti-button tianti-button-primary px-4 py-2 text-sm"
                >
                  推进下一步
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="tianti-surface-muted rounded-[28px] p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
              <Radar className="h-4 w-4 text-cyan-200" />
              生产脉冲
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-300">
              直接从控制塔判断剧本、资产、分镜、提示词和视频的整体推进速度，避免只盯单个系列。
            </div>

            <div className="mt-5 space-y-4">
              {productionStageMeta.map((stage) => {
                const Icon = stage.icon;
                const value = productionTotals[stage.key];
                const percentage = totalCreatedEpisodeCount > 0
                  ? toPercent(value, totalCreatedEpisodeCount)
                  : 0;

                return (
                  <div key={stage.key} className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-white">
                        <Icon className="h-4 w-4 text-cyan-200" />
                        {stage.label}
                      </div>
                      <div className="text-xs text-slate-400">
                        {value}/{totalCreatedEpisodeCount || 0}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{stage.hint}</div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400"
                        style={{ width: `${Math.max(percentage, value > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tianti-surface-muted rounded-[28px] p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
              <AlertTriangle className="h-4 w-4 text-amber-200" />
              风险信号
            </div>
            <div className="mt-3 space-y-3">
              <RiskRow
                label="系列资产缺口"
                value={`${seriesNeedingAssets.length} 套`}
                hint="存在未覆盖人物、场景或道具"
                tone="warning"
              />
              <RiskRow
                label="待补齐剧集"
                value={`${Math.max(totalPlannedEpisodeCount - totalCreatedEpisodeCount, 0)} 集`}
                hint={`${seriesNeedingEpisodes.length} 套系列还没铺满规划集数`}
                tone="default"
              />
              <RiskRow
                label="待完成视频"
                value={`${Math.max(totalCreatedEpisodeCount - productionTotals.video, 0)} 集`}
                hint={`${seriesWaitingVideo.length} 套系列仍在等待最终交付`}
                tone="highlight"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="tianti-surface-muted rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
                <Sparkles className="h-4 w-4 text-cyan-200" />
                优先调度队列
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-300">
                总览中心会优先把“有缺口、有待交付、且需要继续扩剧集”的系列推到前面。
              </div>
            </div>
            <div className="text-xs text-slate-400">按当前推进压力排序</div>
          </div>

          <div className="mt-4 space-y-3">
            {orderedActionQueue.slice(0, 3).map((item, index) => (
              <article key={item.id} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-300">
                        优先级 {index + 1}
                      </span>
                      {item.isActive && (
                        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100">
                          当前焦点
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-400">最近更新 {formatUpdatedAt(item.updatedAt)}</div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>待补齐 {Math.max(item.overview.plannedEpisodeCount - item.overview.createdEpisodeCount, 0)} 集</div>
                    <div className="mt-1">待交付 {Math.max(item.overview.createdEpisodeCount - item.overview.videoCompletedEpisodeCount, 0)} 集</div>
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] border border-cyan-500/15 bg-cyan-500/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">下一步动作</div>
                  <div className="mt-2 text-sm font-medium text-white">{item.overview.nextAction.label}</div>
                  <div className="mt-1 text-xs leading-6 text-slate-300">{item.overview.nextAction.description}</div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onFocusSeries(item.id)}
                    className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
                  >
                    聚焦系列
                  </button>
                  <button
                    type="button"
                    onClick={() => onRunNextAction(item.id)}
                    className="tianti-button tianti-button-primary px-4 py-2 text-sm"
                  >
                    立即推进
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="tianti-surface-muted rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
                <Layers3 className="h-4 w-4 text-cyan-200" />
                系列导航
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-300">
                这里保留所有系列的快速入口，但把最关键的焦点、风险和下一步操作都压缩成一张控制卡。
              </div>
            </div>
            <div className="text-xs text-slate-400">共 {seriesItems.length} 套系列工作流</div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {seriesItems.map((item) => {
              const stageProgress = toPercent(
                item.overview.seriesCompletedStageCount,
                item.overview.seriesStageCount,
              );
              const episodePlan = item.overview.plannedEpisodeCount > 0
                ? item.overview.plannedEpisodeCount
                : item.overview.createdEpisodeCount;
              const episodeProgress = episodePlan > 0
                ? toPercent(item.overview.createdEpisodeCount, episodePlan)
                : 0;

              return (
                <article
                  key={item.id}
                  className={`rounded-[24px] border p-5 transition ${
                    item.isActive
                      ? 'border-cyan-500/30 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-white">{item.title}</div>
                        {item.isActive && (
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100">
                            当前焦点
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">最近更新 {formatUpdatedAt(item.updatedAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-cyan-100">{stageProgress}%</div>
                      <div className="mt-1 text-xs text-slate-400">系列阶段完成度</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/40">剧集铺排</div>
                      <div className="mt-2 text-sm text-white">
                        {item.overview.createdEpisodeCount}/{episodePlan || 0}
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400"
                          style={{ width: `${Math.max(episodeProgress, item.overview.createdEpisodeCount > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/40">资产复用</div>
                      <div className="mt-2 text-sm text-white">
                        复用 {item.overview.reusableAssetCount} · 缺口 {item.overview.uncoveredAssetCount}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        已覆盖 {item.overview.coveredAssetCount} · 自动模板 {item.overview.autoApplyTemplateCount}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-cyan-500/15 bg-cyan-500/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">推荐动作</div>
                    <div className="mt-2 text-sm font-medium text-white">{item.overview.nextAction.label}</div>
                    <div className="mt-1 text-xs leading-6 text-slate-300">{item.overview.nextAction.description}</div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onFocusSeries(item.id)}
                      className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
                    >
                      聚焦系列
                    </button>
                    <button
                      type="button"
                      onClick={() => onRunNextAction(item.id)}
                      className="tianti-button tianti-button-primary px-4 py-2 text-sm"
                    >
                      推进下一步
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

const OverviewStatCard: React.FC<{
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}> = ({
  label,
  value,
  hint,
  highlight = false,
}) => (
  <div className={`rounded-[22px] p-4 ${highlight ? 'border border-cyan-500/20 bg-cyan-500/10' : 'tianti-surface'}`}>
    <div className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{hint}</div>
  </div>
);

const RiskRow: React.FC<{
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'warning' | 'highlight';
}> = ({
  label,
  value,
  hint,
  tone = 'default',
}) => (
  <div
    className={`rounded-[20px] border px-4 py-3 ${
      tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10'
        : tone === 'highlight'
          ? 'border-cyan-500/20 bg-cyan-500/10'
          : 'border-white/10 bg-black/20'
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-medium text-white">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
    <div className="mt-1 text-xs leading-6 text-slate-400">{hint}</div>
  </div>
);
