import React, { useMemo } from 'react';
import { BookOpen, ChevronRight, Layers3, Sparkles, Target } from 'lucide-react';
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
  totalPlannedEpisodeCount: number;
  totalCreatedEpisodeCount: number;
  scriptCompletedEpisodeCount: number;
  activeSeriesTitle?: string | null;
  activeEpisodeTitle?: string | null;
  seriesItems: WorkflowOverviewSeriesItem[];
  onFocusSeries: (seriesInstanceId: string) => void;
  onRunNextAction: (seriesInstanceId: string) => void;
}

export const WorkflowOverviewCenter: React.FC<WorkflowOverviewCenterProps> = ({
  projectTitle,
  totalSeriesCount,
  totalPlannedEpisodeCount,
  totalCreatedEpisodeCount,
  scriptCompletedEpisodeCount,
  activeSeriesTitle,
  activeEpisodeTitle,
  seriesItems,
  onFocusSeries,
  onRunNextAction,
}) => {
  const activeSeriesItem = useMemo(
    () => seriesItems.find((item) => item.isActive) ?? seriesItems[0] ?? null,
    [seriesItems],
  );
  const prioritizedSeries = useMemo(
    () =>
      [...seriesItems].sort((left, right) => {
        const leftGap = Math.max(left.overview.plannedEpisodeCount - left.overview.createdEpisodeCount, 0);
        const rightGap = Math.max(right.overview.plannedEpisodeCount - right.overview.createdEpisodeCount, 0);
        const leftScore = (left.isActive ? 1000 : 0) + leftGap * 10 + left.overview.scriptCompletedEpisodeCount;
        const rightScore = (right.isActive ? 1000 : 0) + rightGap * 10 + right.overview.scriptCompletedEpisodeCount;

        if (leftScore !== rightScore) return rightScore - leftScore;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }),
    [seriesItems],
  );

  const planningProgress = totalPlannedEpisodeCount > 0
    ? toPercent(totalCreatedEpisodeCount, totalPlannedEpisodeCount)
    : (totalCreatedEpisodeCount > 0 ? 100 : 0);
  const scriptProgress = totalCreatedEpisodeCount > 0
    ? toPercent(scriptCompletedEpisodeCount, totalCreatedEpisodeCount)
    : 0;

  return (
    <section className="tianti-surface rounded-[32px] p-6">
      <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="tianti-hero-card rounded-[28px] p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">Workflow Center</div>
          <h2 className="mt-3 text-3xl font-semibold text-white">系列设定与剧本规划</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-cyan-50/90">
            这里只保留系列主控、剧本推进和分集规划，不再把后续执行链路提前摊开。
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tianti-chip is-accent">{projectTitle}</span>
            <span className="tianti-chip">当前系列 {activeSeriesTitle ?? '未锁定'}</span>
            <span className="tianti-chip">
              {activeEpisodeTitle ? `当前单集 ${activeEpisodeTitle}` : '当前未锁定单集'}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <CompactStatCard
              icon={Layers3}
              label="系列工作流"
              value={String(totalSeriesCount)}
              hint="当前项目中的系列主线"
            />
            <CompactStatCard
              icon={BookOpen}
              label="剧本推进"
              value={`${scriptCompletedEpisodeCount}/${totalCreatedEpisodeCount || 0}`}
              hint={`剧本完成率 ${scriptProgress}%`}
            />
            <CompactStatCard
              icon={Sparkles}
              label="分集规划"
              value={`${totalCreatedEpisodeCount}${totalPlannedEpisodeCount > 0 ? ` / ${totalPlannedEpisodeCount}` : ''}`}
              hint={`铺排完成 ${planningProgress}%`}
              highlight
            />
          </div>

          <div className="mt-5 rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-100/80">
                  <Target className="h-4 w-4" />
                  当前下一步
                </div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {activeSeriesItem?.title ?? '先创建一个系列工作流'}
                </div>
                <div className="mt-2 text-sm leading-7 text-cyan-50/90">
                  {activeSeriesItem?.overview.nextAction.description ?? '系列出现后，这里会直接提示该推进哪一步。'}
                </div>
              </div>
              {activeSeriesItem && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="tianti-chip is-accent">
                    剧本 {activeSeriesItem.overview.scriptCompletedEpisodeCount}/{activeSeriesItem.overview.createdEpisodeCount || 0}
                  </span>
                  <span className="tianti-chip">
                    待补齐 {Math.max(activeSeriesItem.overview.plannedEpisodeCount - activeSeriesItem.overview.createdEpisodeCount, 0)} 集
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
                  聚焦当前系列
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

        <div className="tianti-surface-muted rounded-[28px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
                <Layers3 className="h-4 w-4 text-cyan-200" />
                系列导航
              </div>
            </div>
            <div className="text-xs text-slate-400">按优先级排序</div>
          </div>

          <div className="mt-5 space-y-3">
            {prioritizedSeries.map((item) => {
              const episodePlan = item.overview.plannedEpisodeCount > 0
                ? item.overview.plannedEpisodeCount
                : item.overview.createdEpisodeCount;
              const scriptRate = toPercent(
                item.overview.scriptCompletedEpisodeCount,
                item.overview.createdEpisodeCount || 0,
              );

              return (
                <article
                  key={item.id}
                  className={`rounded-[22px] border p-4 transition ${
                    item.isActive
                      ? 'border-cyan-500/30 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">{item.title}</div>
                        {item.isActive && (
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-100">
                            当前焦点
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">最近更新 {formatUpdatedAt(item.updatedAt)}</div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>剧本完成 {scriptRate}%</div>
                      <div className="mt-1">
                        铺排 {item.overview.createdEpisodeCount}/{episodePlan || 0}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/40">下一步动作</div>
                    <div className="mt-2 text-sm font-medium text-white">{item.overview.nextAction.label}</div>
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
                      继续推进
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

const CompactStatCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}> = ({
  icon: Icon,
  label,
  value,
  hint,
  highlight = false,
}) => (
  <div className={`rounded-[22px] p-4 ${highlight ? 'border border-cyan-500/20 bg-cyan-500/10' : 'tianti-surface'}`}>
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40">
      <Icon className="h-4 w-4 text-cyan-200" />
      {label}
    </div>
    <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
    <div className="mt-1 text-xs text-slate-400">{hint}</div>
  </div>
);
