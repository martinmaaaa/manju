import React, { useMemo } from 'react';
import { ArrowRight, CalendarRange, GaugeCircle, Plus, Zap } from 'lucide-react';
import { bindingModeLabels, type PreferredBindingMode } from './seriesShared';

interface SeriesBatchOperationsPanelProps {
  plannedEpisodeCount: number;
  createdEpisodeCount: number;
  remainingEpisodeCount: number;
  hasBatchCapacity: boolean;
  plannedEpisodeInput: string;
  batchEpisodeInput: string;
  savedBindingMode: PreferredBindingMode;
  preferredBindingModeInput: PreferredBindingMode;
  onPlannedEpisodeInputChange: (value: string) => void;
  onBatchEpisodeInputChange: (value: string) => void;
  onPreferredBindingModeInputChange: (value: PreferredBindingMode) => void;
  onSaveSeriesSettings: () => void;
  onBulkCreate: () => void;
  onFillRemaining: () => void;
}

type BatchSegmentStatus = 'completed' | 'active' | 'queued';

type BatchSegment = {
  key: string;
  index: number;
  start: number;
  end: number;
  size: number;
  status: BatchSegmentStatus;
  createdInBatch: number;
  isRecommended: boolean;
};

const batchStatusLabelMap: Record<BatchSegmentStatus, string> = {
  completed: '已完成',
  active: '进行中',
  queued: '待启动',
};

const batchStatusClassMap: Record<BatchSegmentStatus, string> = {
  completed: 'is-success',
  active: 'is-accent',
  queued: '',
};

function parsePositiveInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildBatchBlueprint(totalEpisodeCount: number): number[] {
  if (totalEpisodeCount <= 0) return [];
  if (totalEpisodeCount <= 8) return [totalEpisodeCount];
  if (totalEpisodeCount <= 20) {
    const firstChunk = Math.min(10, totalEpisodeCount);
    const rest = totalEpisodeCount - firstChunk;
    return rest > 0 ? [firstChunk, rest] : [firstChunk];
  }

  const blueprint: number[] = [];
  let remaining = totalEpisodeCount;

  const firstChunk = Math.min(10, remaining);
  blueprint.push(firstChunk);
  remaining -= firstChunk;

  if (remaining > 0) {
    const secondChunk = Math.min(10, remaining);
    blueprint.push(secondChunk);
    remaining -= secondChunk;
  }

  while (remaining > 0) {
    const chunkSize = Math.min(20, remaining);
    blueprint.push(chunkSize);
    remaining -= chunkSize;
  }

  return blueprint;
}

function buildBatchPlan(
  totalEpisodeCount: number,
  createdEpisodeCount: number,
): BatchSegment[] {
  let cursor = 1;

  return buildBatchBlueprint(totalEpisodeCount).map((size, index) => {
    const start = cursor;
    const end = cursor + size - 1;
    const createdInBatch = Math.max(
      Math.min(createdEpisodeCount, end) - start + 1,
      0,
    );
    const status: BatchSegmentStatus = createdEpisodeCount >= end
      ? 'completed'
      : createdInBatch > 0
        ? 'active'
        : 'queued';
    const isRecommended = createdEpisodeCount < totalEpisodeCount
      && createdEpisodeCount + 1 >= start
      && createdEpisodeCount < end;

    cursor = end + 1;

    return {
      key: `${start}-${end}`,
      index: index + 1,
      start,
      end,
      size,
      status,
      createdInBatch,
      isRecommended,
    };
  });
}

export const SeriesBatchOperationsPanel: React.FC<SeriesBatchOperationsPanelProps> = ({
  plannedEpisodeCount,
  createdEpisodeCount,
  remainingEpisodeCount,
  hasBatchCapacity,
  plannedEpisodeInput,
  batchEpisodeInput,
  savedBindingMode,
  preferredBindingModeInput,
  onPlannedEpisodeInputChange,
  onBatchEpisodeInputChange,
  onPreferredBindingModeInputChange,
  onSaveSeriesSettings,
  onBulkCreate,
  onFillRemaining,
}) => {
  const draftPlannedEpisodeCount = useMemo(() => {
    const draftValue = parsePositiveInteger(plannedEpisodeInput);
    if (draftValue) return Math.max(draftValue, createdEpisodeCount);
    if (plannedEpisodeCount > 0) return plannedEpisodeCount;
    if (createdEpisodeCount > 0) return createdEpisodeCount;
    return 80;
  }, [createdEpisodeCount, plannedEpisodeCount, plannedEpisodeInput]);

  const quickBatchOptions = useMemo(() => {
    const options = plannedEpisodeCount > 0
      ? [5, 10, 20, remainingEpisodeCount]
      : [5, 10, 20];

    return Array.from(new Set(
      options.filter((value) => value > 0 && (plannedEpisodeCount === 0 || value <= remainingEpisodeCount)),
    ));
  }, [plannedEpisodeCount, remainingEpisodeCount]);
  const batchPlan = useMemo(
    () => buildBatchPlan(draftPlannedEpisodeCount, createdEpisodeCount),
    [createdEpisodeCount, draftPlannedEpisodeCount],
  );
  const nextBatch = useMemo(
    () => batchPlan.find((segment) => segment.isRecommended)
      ?? batchPlan.find((segment) => segment.status !== 'completed')
      ?? null,
    [batchPlan],
  );
  const createdRangeLabel = createdEpisodeCount > 0
    ? `E1-E${createdEpisodeCount}`
    : '尚未创建';
  const nextBatchLabel = nextBatch
    ? `E${nextBatch.start}-E${nextBatch.end}`
    : '已完成全部计划';

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <section className="tianti-surface-muted rounded-[28px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/40">系列默认配置</div>
            <div className="mt-2 text-sm leading-7 text-slate-300">
              先把整套漫剧的总集数和默认绑定策略定下来，后续新增单集会直接继承这套工作流规则。
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="tianti-chip">当前策略 {bindingModeLabels[savedBindingMode]}</span>
            <span className="tianti-chip">
              {plannedEpisodeCount > 0 ? `剩余待建 ${remainingEpisodeCount} 集` : '总集数未设上限'}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="text-sm text-slate-300">规划总集数</div>
            <input
              type="number"
              min={Math.max(1, createdEpisodeCount)}
              value={plannedEpisodeInput}
              onChange={(event) => onPlannedEpisodeInputChange(event.target.value)}
              className="tianti-input mt-2 w-full px-4 py-2.5 text-sm"
            />
          </label>
          <label className="block">
            <div className="text-sm text-slate-300">默认绑定策略</div>
            <select
              value={preferredBindingModeInput}
              onChange={(event) => onPreferredBindingModeInputChange(event.target.value as PreferredBindingMode)}
              className="tianti-input mt-2 w-full px-4 py-2.5 text-sm"
            >
              {Object.entries(bindingModeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-slate-300">
          新建单集会自动预填：标准剧本模板、资产复用模板、标准分镜模板、统一 Prompt 包、视频投放模板。
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSaveSeriesSettings}
            className="tianti-button tianti-button-primary px-5 py-3 text-sm font-medium"
          >
            保存系列配置
          </button>
          <div className="text-xs text-slate-400">
            保存后，后续新增单集会按这套默认规则自动继承。
          </div>
        </div>
      </section>

      <section className="tianti-surface-muted rounded-[28px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/40">剧集批量操作台</div>
            <div className="mt-2 text-sm leading-7 text-slate-300">
              用固定批次快速铺开单集生产，把 80 集长流程拆成一段一段可推进的连续工作带。
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="tianti-chip is-accent">已创建 {createdEpisodeCount} 集</span>
            <span className="tianti-chip is-warning">
              {plannedEpisodeCount > 0 ? `待补齐 ${remainingEpisodeCount} 集` : '可继续追加'}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickBatchOptions.map((value) => (
            <button
              key={`quick-${value}`}
              type="button"
              onClick={() => onBatchEpisodeInputChange(String(value))}
              className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                batchEpisodeInput === String(value)
                  ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-500/30 hover:text-white'
              }`}
            >
              {value} 集批次
            </button>
          ))}
          {remainingEpisodeCount > 0 && (
            <button
              type="button"
              onClick={onFillRemaining}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-100 transition hover:bg-emerald-500/15"
            >
              一键补齐剩余 {remainingEpisodeCount} 集
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[132px]">
            <div className="text-sm text-slate-300">新增数量</div>
            <input
              type="number"
              min={1}
              max={remainingEpisodeCount > 0 ? remainingEpisodeCount : undefined}
              value={batchEpisodeInput}
              onChange={(event) => onBatchEpisodeInputChange(event.target.value)}
              disabled={!hasBatchCapacity}
              className="tianti-input mt-2 w-full px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
          <button
            type="button"
            onClick={onBulkCreate}
            disabled={!hasBatchCapacity}
            className="tianti-button tianti-button-secondary px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} />
            批量新增
          </button>
        </div>

        <div className="mt-4 text-xs leading-6 text-slate-400">
          {plannedEpisodeCount > 0
            ? `当前规划 ${plannedEpisodeCount} 集，已创建 ${createdEpisodeCount} 集，建议按 5-20 集一批逐段推进。`
            : `当前已创建 ${createdEpisodeCount} 集；建议先确定总集数，再按固定批次推进资产、分镜与提示词生产。`}
        </div>

        <div className="mt-5 grid gap-4">
          <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <CalendarRange className="h-4 w-4 text-cyan-200" />
                  推荐分批计划
                </div>
                <div className="mt-1 text-xs leading-6 text-slate-400">
                  先用 10 集小批次验证模板与资产稳定性，再切到 20 集大批次放量生产。
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="tianti-chip">当前覆盖 {createdRangeLabel}</span>
                <span className="tianti-chip is-accent">下一批 {nextBatchLabel}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {batchPlan.map((segment) => {
                const effectiveBatchSize = plannedEpisodeCount > 0
                  ? Math.min(segment.size, remainingEpisodeCount > 0 ? remainingEpisodeCount : segment.size)
                  : segment.size;

                return (
                  <button
                    key={segment.key}
                    type="button"
                    onClick={() => onBatchEpisodeInputChange(String(Math.max(effectiveBatchSize, 1)))}
                    className={`rounded-[20px] border px-4 py-4 text-left transition ${
                      segment.isRecommended
                        ? 'border-cyan-500/30 bg-cyan-500/10 shadow-[0_12px_32px_rgba(34,211,238,0.08)]'
                        : 'border-white/10 bg-white/[0.03] hover:border-cyan-500/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          第 {segment.index} 批 · E{segment.start}-E{segment.end}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          规模 {segment.size} 集 · 本批已创建 {segment.createdInBatch}/{segment.size}
                        </div>
                      </div>
                      <span className={`tianti-chip ${batchStatusClassMap[segment.status]}`}>
                        {batchStatusLabelMap[segment.status]}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-400">
                        点击后回填新增数量，适合按批次持续向下铺排。
                      </div>
                      {segment.isRecommended && (
                        <div className="flex items-center gap-1 text-[11px] text-cyan-100">
                          <ArrowRight className="h-3.5 w-3.5" />
                          推荐下一批
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <GaugeCircle className="h-4 w-4 text-emerald-200" />
                生产节奏提示
              </div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                <div>前两批更适合验证角色、场景、道具的复用模板是否稳定。</div>
                <div>进入 20 集批次后，重点关注资产覆盖率和提示词包的一致性。</div>
                <div>如果即梦或外部执行端排队波动，可以只扩单集，不急着一次铺满全部视频。</div>
              </div>
            </div>

            <div className="rounded-[22px] border border-cyan-500/20 bg-cyan-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-cyan-50">
                <Zap className="h-4 w-4" />
                当前推荐动作
              </div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-cyan-50/90">
                <div>
                  规划总集数：<span className="font-medium text-white">{draftPlannedEpisodeCount}</span> 集
                </div>
                <div>
                  下一建议批次：<span className="font-medium text-white">{nextBatchLabel}</span>
                  {nextBatch ? ` · ${nextBatch.size} 集` : ''}
                </div>
                <div>
                  {hasBatchCapacity
                    ? '先按推荐批次扩单集，再回到资产覆盖矩阵同步人物、场景和道具复用。'
                    : '当前已到计划上限，先调整总集数后再继续扩批。'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
