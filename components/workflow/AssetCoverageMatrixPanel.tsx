import React, { useEffect, useMemo, useState } from 'react';
import type {
  WorkflowAssetBatchTemplate,
  WorkflowAssetBatchTemplateSuggestion,
  WorkflowAssetType,
  WorkflowBindingMode,
  WorkflowInstance,
} from '../../services/workflow/domain/types';
import { getSeriesAssetCoverage } from '../../services/workflow/runtime/projectState';
import { bindingModeLabels, type PreferredBindingMode, toPreferredBindingMode } from './seriesShared';
type SeriesAssetCoverageEntry = ReturnType<typeof getSeriesAssetCoverage>[number];

const assetTypeLabels: Record<WorkflowAssetType, string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  style: '风格',
};

interface AssetCoverageMatrixPanelProps {
  assetCoverage: SeriesAssetCoverageEntry[];
  assetBatchTemplates: WorkflowAssetBatchTemplate[];
  suggestedAssetBatchTemplates: WorkflowAssetBatchTemplateSuggestion[];
  episodes: WorkflowInstance[];
  plannedEpisodeCount: number;
  defaultBindingMode: PreferredBindingMode;
  onSyncAssetCoverage: (
    assetId: string,
    scopedEpisodeIds: string[],
    desiredEpisodeIds: string[],
    mode: WorkflowBindingMode,
  ) => void;
  onBatchSyncAssetCoverage: (
    assetIds: string[],
    scopedEpisodeIds: string[],
    desiredEpisodeIds: string[],
    mode: WorkflowBindingMode,
  ) => void;
  onSaveAssetBatchTemplate: (
    name: string,
    assetIds: string[],
    templateId?: string,
    autoApplyToNewEpisodes?: boolean,
  ) => void;
  onSaveAssetBatchTemplates: (
    templates: Array<{
      id?: string;
      name: string;
      assetIds: string[];
      autoApplyToNewEpisodes?: boolean;
    }>,
  ) => void;
  onDeleteAssetBatchTemplate: (templateId: string) => void;
  onSelectEpisode: (episodeId: string) => void;
}

type EpisodeRangeState = {
  start: string;
  end: string;
};

type RangePreset = {
  key: string;
  label: string;
  start: number;
  end: number;
};

export const AssetCoverageMatrixPanel: React.FC<AssetCoverageMatrixPanelProps> = ({
  assetCoverage,
  assetBatchTemplates,
  suggestedAssetBatchTemplates,
  episodes,
  plannedEpisodeCount,
  defaultBindingMode,
  onSyncAssetCoverage,
  onBatchSyncAssetCoverage,
  onSaveAssetBatchTemplate,
  onSaveAssetBatchTemplates,
  onDeleteAssetBatchTemplate,
  onSelectEpisode,
}) => {
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | WorkflowAssetType>('all');
  const [showOnlyUncovered, setShowOnlyUncovered] = useState(false);
  const [rowBindingModes, setRowBindingModes] = useState<Record<string, PreferredBindingMode>>({});
  const [rowRanges, setRowRanges] = useState<Record<string, EpisodeRangeState>>({});
  const [bulkBindingMode, setBulkBindingMode] = useState<PreferredBindingMode>(defaultBindingMode);
  const [bulkRange, setBulkRange] = useState<EpisodeRangeState>({ start: '1', end: String(Math.max(plannedEpisodeCount, episodes.length, 1)) });
  const [selectedBatchTemplateId, setSelectedBatchTemplateId] = useState<'visible' | string>('visible');
  const [batchTemplateName, setBatchTemplateName] = useState('');
  const [saveTemplateAutoApply, setSaveTemplateAutoApply] = useState(true);
  const episodeByNumber = useMemo(() => episodes.reduce<Map<number, WorkflowInstance>>((map, episode) => {
    const episodeNumber = episode.metadata?.episodeNumber ?? 0;
    if (episodeNumber > 0) {
      map.set(episodeNumber, episode);
    }
    return map;
  }, new Map()), [episodes]);
  const existingEpisodeNumbers = useMemo(() => new Set(Array.from(episodeByNumber.keys())), [episodeByNumber]);
  const existingEpisodeIds = useMemo(() => episodes.map(episode => episode.id), [episodes]);
  const filteredAssetCoverage = useMemo(() => assetCoverage.filter((entry) => {
    if (assetTypeFilter !== 'all' && entry.asset.type !== assetTypeFilter) {
      return false;
    }

    if (showOnlyUncovered && entry.missingCount === 0) {
      return false;
    }

    return true;
  }), [assetCoverage, assetTypeFilter, showOnlyUncovered]);
  const allSeriesAssetIds = useMemo(() => assetCoverage.map(entry => entry.asset.id), [assetCoverage]);
  const visibleAssetIds = useMemo(() => filteredAssetCoverage.map(entry => entry.asset.id), [filteredAssetCoverage]);
  const slotCount = Math.max(plannedEpisodeCount, episodes.length);
  const maxEpisodeNumber = Math.max(slotCount, 1);
  const assetTypeOptions: Array<'all' | WorkflowAssetType> = ['all', 'character', 'scene', 'prop', 'style'];

  const normalizeRange = (range?: EpisodeRangeState) => {
    let start = Number.parseInt(range?.start ?? '1', 10);
    let end = Number.parseInt(range?.end ?? String(maxEpisodeNumber), 10);

    if (!Number.isFinite(start)) start = 1;
    if (!Number.isFinite(end)) end = maxEpisodeNumber;

    start = Math.min(Math.max(start, 1), maxEpisodeNumber);
    end = Math.min(Math.max(end, 1), maxEpisodeNumber);

    if (start > end) {
      return { start: end, end: start };
    }

    return { start, end };
  };

  const rangePresets = useMemo<RangePreset[]>(() => {
    const presets: RangePreset[] = [
      { key: 'all', label: `1-${maxEpisodeNumber}`, start: 1, end: maxEpisodeNumber },
    ];

    if (maxEpisodeNumber <= 1) return presets;

    const chunkSize = maxEpisodeNumber >= 80
      ? 20
      : maxEpisodeNumber >= 40
        ? 10
        : maxEpisodeNumber >= 24
          ? Math.ceil(maxEpisodeNumber / 4)
          : maxEpisodeNumber >= 12
            ? 6
            : Math.ceil(maxEpisodeNumber / 2);

    for (let start = 1; start <= maxEpisodeNumber; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, maxEpisodeNumber);
      const key = `${start}-${end}`;
      if (key !== presets[0].key && !presets.some(preset => preset.key === key)) {
        presets.push({
          key,
          label: `${start}-${end}`,
          start,
          end,
        });
      }
    }

    return presets;
  }, [maxEpisodeNumber]);

  const updateRowRange = (assetId: string, field: 'start' | 'end', value: string) => {
    setRowRanges(current => ({
      ...current,
      [assetId]: {
        start: current[assetId]?.start ?? '1',
        end: current[assetId]?.end ?? String(maxEpisodeNumber),
        [field]: value,
      },
    }));
  };

  const applyRangePresetToRow = (assetId: string, preset: RangePreset) => {
    setRowRanges(current => ({
      ...current,
      [assetId]: {
        start: String(preset.start),
        end: String(preset.end),
      },
    }));
  };

  const applyRangePresetToBulk = (preset: RangePreset) => {
    setBulkRange({
      start: String(preset.start),
      end: String(preset.end),
    });
  };

  const bulkNormalizedRange = normalizeRange(bulkRange);
  const bulkRangeEpisodeIds = Array.from(
    { length: bulkNormalizedRange.end - bulkNormalizedRange.start + 1 },
    (_, index) => episodeByNumber.get(bulkNormalizedRange.start + index)?.id ?? null,
  ).filter((episodeId): episodeId is string => Boolean(episodeId));
  const bulkRangeLabel = bulkNormalizedRange.start === bulkNormalizedRange.end
    ? `E${bulkNormalizedRange.start}`
    : `E${bulkNormalizedRange.start}-E${bulkNormalizedRange.end}`;
  const selectedBatchTemplate = selectedBatchTemplateId === 'visible'
    ? null
    : assetBatchTemplates.find(template => template.id === selectedBatchTemplateId) ?? null;
  const batchTargetAssetIds = selectedBatchTemplate
    ? selectedBatchTemplate.assetIds.filter(assetId => allSeriesAssetIds.includes(assetId))
    : visibleAssetIds;
  const batchTargetLabel = selectedBatchTemplate
    ? `${selectedBatchTemplate.name} · ${batchTargetAssetIds.length} 个资产`
    : `当前筛选 · ${batchTargetAssetIds.length} 个资产`;
  const coverageStats = useMemo(() => {
    const totalAssets = filteredAssetCoverage.length;
    const uncoveredAssets = filteredAssetCoverage.filter(entry => entry.missingCount > 0).length;
    const fullyCoveredAssets = filteredAssetCoverage.filter(entry => entry.missingCount === 0).length;
    const averageCoverage = totalAssets === 0
      ? 0
      : Math.round((filteredAssetCoverage.reduce((sum, entry) => sum + entry.coverageRate, 0) / totalAssets) * 100);

    return {
      totalAssets,
      uncoveredAssets,
      fullyCoveredAssets,
      averageCoverage,
    };
  }, [filteredAssetCoverage]);

  useEffect(() => {
    setBulkBindingMode(defaultBindingMode);
  }, [defaultBindingMode]);

  useEffect(() => {
    if (selectedBatchTemplateId === 'visible') return;
    if (!assetBatchTemplates.some(template => template.id === selectedBatchTemplateId)) {
      setSelectedBatchTemplateId('visible');
    }
  }, [assetBatchTemplates, selectedBatchTemplateId]);

  useEffect(() => {
    if (selectedBatchTemplate) {
      setBatchTemplateName(selectedBatchTemplate.name);
      setSaveTemplateAutoApply(selectedBatchTemplate.autoApplyToNewEpisodes);
    }
  }, [selectedBatchTemplate]);

  return (
    <section className="tianti-surface-muted mt-8 rounded-[28px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">资产覆盖矩阵</div>
          <div className="mt-2 text-sm leading-7 text-slate-300">查看资产在各集的绑定覆盖。</div>
        </div>
        <div className="text-xs text-slate-400">
          已创建 {episodes.length} 集 / 规划 {plannedEpisodeCount || episodes.length} 集
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="tianti-chip is-accent">当前资产 {coverageStats.totalAssets}</span>
        <span className="tianti-chip is-warning">待补齐 {coverageStats.uncoveredAssets}</span>
        <span className="tianti-chip is-success">全覆盖 {coverageStats.fullyCoveredAssets}</span>
        <span className="tianti-chip">平均覆盖 {coverageStats.averageCoverage}%</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {assetTypeOptions.map(option => {
          const active = assetTypeFilter === option;
          const label = option === 'all' ? '全部' : assetTypeLabels[option];

          return (
            <button
              key={option}
              type="button"
              onClick={() => setAssetTypeFilter(option)}
              className={`tianti-button px-3 py-1.5 text-xs ${
                active
                  ? 'tianti-button-primary'
                  : 'tianti-button-secondary'
              }`}
            >
              {label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setShowOnlyUncovered(current => !current)}
          className={`tianti-button px-3 py-1.5 text-xs ${
            showOnlyUncovered
              ? 'tianti-button-primary'
              : 'tianti-button-secondary'
          }`}
        >
          只看未覆盖
        </button>
      </div>

      <div className="tianti-surface mt-4 rounded-[20px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">筛选结果批量调度</div>
            <div className="mt-1 text-xs text-slate-400">按筛选或模板批量下发。</div>
          </div>
          <div className="text-xs text-slate-500">{batchTargetLabel} · {bulkRangeLabel} · 仅处理已创建集</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedBatchTemplateId('visible')}
            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
              selectedBatchTemplateId === 'visible'
                ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100'
                : 'border-white/10 bg-black/20 text-slate-300 hover:border-cyan-500/30 hover:text-white'
            }`}
          >
            当前筛选
          </button>
          {assetBatchTemplates.map((template) => (
            <div
              key={template.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 transition ${
                selectedBatchTemplateId === template.id
                  ? 'border-cyan-500/30 bg-cyan-500/15'
                  : 'border-white/10 bg-black/20'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedBatchTemplateId(template.id)}
                className={`px-2 text-[11px] ${
                  selectedBatchTemplateId === template.id ? 'text-cyan-100' : 'text-slate-300 hover:text-white'
                }`}
              >
                {template.name} · {template.assetIds.length}
              </button>
              <button
                type="button"
                onClick={() => onSaveAssetBatchTemplate(template.name, template.assetIds, template.id, !template.autoApplyToNewEpisodes)}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                  template.autoApplyToNewEpisodes
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-100'
                }`}
              >
                自动新集
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAssetBatchTemplate(template.id);
                  if (selectedBatchTemplateId === template.id) {
                    setSelectedBatchTemplateId('visible');
                  }
                }}
                className="rounded-full border border-white/10 px-1.5 text-[10px] text-slate-400 transition hover:border-red-500/30 hover:text-red-200"
                aria-label={`删除模板 ${template.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {suggestedAssetBatchTemplates.length > 0 && (
          <div className="mt-3 rounded-[18px] border border-cyan-500/15 bg-cyan-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">推荐模板</div>
                <div className="mt-1 text-xs text-slate-400">按标签和覆盖率生成建议。</div>
              </div>
              <button
                type="button"
                onClick={() => onSaveAssetBatchTemplates(suggestedAssetBatchTemplates.map(template => ({
                  name: template.name,
                  assetIds: template.assetIds,
                  autoApplyToNewEpisodes: template.autoApplyToNewEpisodes,
                })))}
                className="tianti-button tianti-button-primary px-3 py-1.5 text-xs"
              >
                一键保存推荐模板
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              {suggestedAssetBatchTemplates.map((template) => (
                <div key={template.key} className="min-w-[220px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{template.name}</div>
                      <div className="mt-1 text-[11px] leading-5 text-slate-400">{template.reason}</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
                      {template.assetIds.length} 个
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSaveAssetBatchTemplate(template.name, template.assetIds, undefined, template.autoApplyToNewEpisodes)}
                    className="tianti-button tianti-button-secondary px-3 py-1.5 text-[11px]"
                  >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBatchTemplateId('visible')}
                      className="tianti-button tianti-button-ghost px-3 py-1.5 text-[11px]"
                    >
                      对比筛选
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={bulkBindingMode}
            onChange={(event) => setBulkBindingMode(event.target.value as PreferredBindingMode)}
            className="tianti-control-pill px-4 py-2 text-sm"
          >
            {Object.entries(bindingModeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="tianti-control-pill flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
            <span>从</span>
            <input
              type="number"
              min={1}
              max={maxEpisodeNumber}
              value={bulkRange.start}
              onChange={(event) => setBulkRange(current => ({ ...current, start: event.target.value }))}
              className="w-16 bg-transparent text-white outline-none"
            />
          </label>
          <label className="tianti-control-pill flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
            <span>到</span>
            <input
              type="number"
              min={1}
              max={maxEpisodeNumber}
              value={bulkRange.end}
              onChange={(event) => setBulkRange(current => ({ ...current, end: event.target.value }))}
              className="w-16 bg-transparent text-white outline-none"
            />
          </label>
          {rangePresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyRangePresetToBulk(preset)}
              className="tianti-button tianti-button-ghost px-3 py-1.5 text-[11px]"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={batchTemplateName}
            onChange={(event) => setBatchTemplateName(event.target.value)}
            placeholder="例如：主角组 / 常驻场景 / 高频道具"
            className="tianti-control-pill min-w-[260px] px-4 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setSaveTemplateAutoApply(current => !current)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              saveTemplateAutoApply
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
                : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white'
            }`}
          >
            新模板自动预铺新集
          </button>
          <button
            type="button"
            onClick={() => onSaveAssetBatchTemplate(batchTemplateName, visibleAssetIds, undefined, saveTemplateAutoApply)}
            disabled={!batchTemplateName.trim() || visibleAssetIds.length === 0}
            className="tianti-button tianti-button-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            保存当前筛选为模板
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedBatchTemplate) return;
              onSaveAssetBatchTemplate(
                batchTemplateName || selectedBatchTemplate.name,
                visibleAssetIds,
                selectedBatchTemplate.id,
                saveTemplateAutoApply,
              );
            }}
            disabled={!selectedBatchTemplate || visibleAssetIds.length === 0}
            className="tianti-button tianti-button-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            用当前筛选覆盖模板
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onBatchSyncAssetCoverage(batchTargetAssetIds, bulkRangeEpisodeIds, bulkRangeEpisodeIds, bulkBindingMode)}
            disabled={batchTargetAssetIds.length === 0 || bulkRangeEpisodeIds.length === 0}
            className="tianti-button tianti-button-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            批量绑定该区间
          </button>
          <button
            type="button"
            onClick={() => onBatchSyncAssetCoverage(batchTargetAssetIds, bulkRangeEpisodeIds, [], bulkBindingMode)}
            disabled={batchTargetAssetIds.length === 0 || bulkRangeEpisodeIds.length === 0}
            className="tianti-button tianti-button-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            批量解绑该区间
          </button>
          <button
            type="button"
            onClick={() => onBatchSyncAssetCoverage(batchTargetAssetIds, existingEpisodeIds, bulkRangeEpisodeIds, bulkBindingMode)}
            disabled={batchTargetAssetIds.length === 0 || existingEpisodeIds.length === 0}
            className="tianti-button tianti-button-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            批量仅保留该区间
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {filteredAssetCoverage.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
            当前筛选下没有资产覆盖记录。
          </div>
        ) : (
          filteredAssetCoverage.map((entry) => {
            const currentMode = rowBindingModes[entry.asset.id] ?? toPreferredBindingMode(entry.episodes[0]?.mode ?? defaultBindingMode);
            const rangeInputs = rowRanges[entry.asset.id] ?? { start: '1', end: String(maxEpisodeNumber) };
            const normalizedRange = normalizeRange(rowRanges[entry.asset.id]);
            const rangeEpisodeIds = Array.from(
              { length: normalizedRange.end - normalizedRange.start + 1 },
              (_, index) => episodeByNumber.get(normalizedRange.start + index)?.id ?? null,
            ).filter((episodeId): episodeId is string => Boolean(episodeId));
            const rangeBoundCount = entry.episodes.filter(item => (
              item.episodeNumber >= normalizedRange.start && item.episodeNumber <= normalizedRange.end
            )).length;
            const rangeLabel = normalizedRange.start === normalizedRange.end
              ? `E${normalizedRange.start}`
              : `E${normalizedRange.start}-E${normalizedRange.end}`;

            return (
              <article key={entry.asset.id} className="tianti-surface rounded-[20px] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-white">{entry.asset.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {assetTypeLabels[entry.asset.type]} · 覆盖 {entry.boundCount}/{entry.plannedEpisodeCount || entry.existingEpisodeCount || 0}
                      {entry.asset.tags.length > 0 ? ` · ${entry.asset.tags.join(' / ')}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-cyan-100">{Math.round(entry.coverageRate * 100)}%</div>
                    <div className="mt-1 text-xs text-slate-400">缺口 {entry.missingCount} 集</div>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-400"
                    style={{
                      width: `${Math.max(Math.round(entry.coverageRate * 100), entry.boundCount > 0 ? 8 : 0)}%`,
                    }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <select
                    value={currentMode}
                    onChange={(event) => setRowBindingModes(current => ({ ...current, [entry.asset.id]: event.target.value as PreferredBindingMode }))}
                    className="tianti-control-pill px-4 py-2 text-sm"
                  >
                    {Object.entries(bindingModeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onSyncAssetCoverage(entry.asset.id, existingEpisodeIds, existingEpisodeIds, currentMode)}
                    className="tianti-button tianti-button-primary px-3 py-1.5 text-xs"
                  >
                    绑定全部已创建集
                  </button>
                  <button
                    type="button"
                    onClick={() => onSyncAssetCoverage(entry.asset.id, entry.episodes.map(item => item.episodeId), entry.episodes.map(item => item.episodeId), currentMode)}
                    disabled={entry.episodes.length === 0}
                    className="tianti-button tianti-button-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    统一已绑定模式
                  </button>
                  <button
                    type="button"
                    onClick={() => onSyncAssetCoverage(entry.asset.id, existingEpisodeIds, [], currentMode)}
                    disabled={entry.boundCount === 0}
                    className="tianti-button tianti-button-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    解绑全部
                  </button>
                  <div className="text-xs text-slate-500">单击格子切换绑定</div>
                </div>

                <div className="tianti-surface-muted mt-3 flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3">
                  <div className="text-xs text-slate-400">区间调度</div>
                  <label className="tianti-control-pill flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
                    <span>从</span>
                    <input
                      type="number"
                      min={1}
                      max={maxEpisodeNumber}
                      value={rangeInputs.start}
                      onChange={(event) => updateRowRange(entry.asset.id, 'start', event.target.value)}
                      className="w-16 bg-transparent text-white outline-none"
                    />
                  </label>
                  <label className="tianti-control-pill flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300">
                    <span>到</span>
                    <input
                      type="number"
                      min={1}
                      max={maxEpisodeNumber}
                      value={rangeInputs.end}
                      onChange={(event) => updateRowRange(entry.asset.id, 'end', event.target.value)}
                      className="w-16 bg-transparent text-white outline-none"
                    />
                  </label>
                  {rangePresets.map((preset) => (
                    <button
                      key={`${entry.asset.id}-${preset.key}`}
                      type="button"
                      onClick={() => applyRangePresetToRow(entry.asset.id, preset)}
                      className="tianti-button tianti-button-ghost px-3 py-1.5 text-[11px]"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onSyncAssetCoverage(entry.asset.id, rangeEpisodeIds, rangeEpisodeIds, currentMode)}
                    disabled={rangeEpisodeIds.length === 0}
                    className="tianti-button tianti-button-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    绑定该区间
                  </button>
                  <button
                    type="button"
                    onClick={() => onSyncAssetCoverage(entry.asset.id, rangeEpisodeIds, [], currentMode)}
                    disabled={rangeBoundCount === 0}
                    className="tianti-button tianti-button-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    解绑该区间
                  </button>
                  <button
                    type="button"
                    onClick={() => onSyncAssetCoverage(entry.asset.id, existingEpisodeIds, rangeEpisodeIds, currentMode)}
                    disabled={existingEpisodeIds.length === 0}
                    className="tianti-button tianti-button-ghost px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    仅保留该区间
                  </button>
                  <div className="text-xs text-slate-500">{rangeLabel} · 已绑定 {rangeBoundCount} 集</div>
                </div>

                {slotCount > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <div className="grid min-w-[720px] grid-cols-10 gap-2 xl:grid-cols-20">
                      {Array.from({ length: slotCount }, (_, index) => {
                        const episodeNumber = index + 1;
                        const binding = entry.episodes.find(item => item.episodeNumber === episodeNumber);
                        const exists = existingEpisodeNumbers.has(episodeNumber);
                        const episode = episodeByNumber.get(episodeNumber);

                        return (
                          <button
                            key={`${entry.asset.id}-${episodeNumber}`}
                            type="button"
                            disabled={!exists || !episode}
                            onClick={() => {
                              if (!episode) return;
                              onSyncAssetCoverage(entry.asset.id, [episode.id], binding ? [] : [episode.id], currentMode);
                            }}
                            className={`rounded-xl border px-2 py-2 text-center text-[11px] transition ${
                              binding
                                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-100'
                                : exists
                                  ? 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-500/20 hover:text-white'
                                  : 'border-dashed border-white/10 bg-transparent text-slate-600'
                            } disabled:cursor-not-allowed`}
                            title={binding ? `${binding.episodeTitle} · ${binding.mode}` : exists ? `第 ${episodeNumber} 集未绑定` : `第 ${episodeNumber} 集未创建`}
                          >
                            <div>E{episodeNumber}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.episodes.length === 0 ? (
                    <span className="text-xs text-slate-500">暂无单集绑定</span>
                  ) : (
                    entry.episodes.map((item) => (
                      <button
                        key={`${entry.asset.id}-${item.episodeId}`}
                        type="button"
                        onClick={() => onSelectEpisode(item.episodeId)}
                        className="tianti-button tianti-button-ghost px-3 py-1 text-[11px]"
                      >
                        第 {item.episodeNumber} 集 · {item.mode}
                      </button>
                    ))
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
