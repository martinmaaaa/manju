import React, { useMemo, useState } from 'react';
import type {
  EpisodeAssetBinding,
  WorkflowAsset,
  WorkflowBindingMode,
  WorkflowInstance,
} from '../../../services/workflow/domain/types';
import {
  episodeAssetTypeLabels,
  episodeBindingModeLabels,
  episodeBindingModeOptions,
  normalizeEditableBindingMode,
  type EditableBindingMode,
} from './episodeWorkspaceShared';

interface EpisodeAssetBindingPanelProps {
  episode: WorkflowInstance;
  assets: WorkflowAsset[];
  bindings: EpisodeAssetBinding[];
  compact?: boolean;
  showHeader?: boolean;
  onBindAsset: (episodeId: string, assetId: string, mode: WorkflowBindingMode) => void;
  onUnbindAsset: (bindingId: string) => void;
}

export const EpisodeAssetBindingPanel: React.FC<EpisodeAssetBindingPanelProps> = ({
  episode,
  assets,
  bindings,
  compact = false,
  showHeader = true,
  onBindAsset,
  onUnbindAsset,
}) => {
  const [bindingModeDrafts, setBindingModeDrafts] = useState<Record<string, EditableBindingMode>>({});
  const defaultBindingMode = normalizeEditableBindingMode(
    episode.metadata?.preferredBindingMode,
  );
  const boundAssetIds = useMemo(
    () => new Set(bindings.map((binding) => binding.assetId)),
    [bindings],
  );
  const bindingByAssetId = useMemo(
    () =>
      bindings.reduce<Record<string, EpisodeAssetBinding>>((accumulator, binding) => {
        accumulator[binding.assetId] = binding;
        return accumulator;
      }, {}),
    [bindings],
  );

  return (
    <section className={`tianti-surface ${compact ? 'rounded-[28px] p-5' : 'rounded-[30px] p-6'}`}>
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">
              Asset Binding
            </div>
            <div className="mt-2 text-xl font-semibold text-white">资产绑定</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="tianti-chip">默认 {episodeBindingModeLabels[defaultBindingMode]}</span>
            <span className="tianti-chip is-accent">已绑定 {bindings.length}</span>
          </div>
        </div>
      )}

      <div className={`${showHeader ? 'mt-4' : ''} flex flex-wrap gap-2`}>
        {bindings.length === 0 ? (
          <span className="text-sm text-slate-500">还没有绑定资产。</span>
        ) : (
          bindings.map((binding) => {
            const asset = assets.find((item) => item.id === binding.assetId);
            if (!asset) return null;

            return (
              <button
                key={binding.id}
                type="button"
                onClick={() => onUnbindAsset(binding.id)}
                className="tianti-button tianti-button-ghost px-3 py-1.5 text-xs"
              >
                {asset.name} · {episodeBindingModeLabels[binding.mode]}
              </button>
            );
          })
        )}
      </div>

      <div className="mt-5 space-y-3">
        {assets.map((asset) => {
          const binding = bindingByAssetId[asset.id];
          const selectedMode = binding
            ? normalizeEditableBindingMode(binding.mode)
            : bindingModeDrafts[asset.id] ?? defaultBindingMode;

          return (
            <article
              key={asset.id}
              className="tianti-surface-muted rounded-[22px] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{asset.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {episodeAssetTypeLabels[asset.type]}
                    {asset.tags.length > 0 ? ` · ${asset.tags.join(' / ')}` : ''}
                  </div>
                  {binding && (
                    <div className="mt-2 text-xs text-cyan-200">
                      当前模式：{episodeBindingModeLabels[binding.mode]}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (binding) {
                      onUnbindAsset(binding.id);
                      return;
                    }

                    onBindAsset(episode.id, asset.id, selectedMode);
                  }}
                  className={`tianti-button px-3 py-1.5 text-xs ${
                    boundAssetIds.has(asset.id)
                      ? 'text-red-50'
                      : 'tianti-button-secondary'
                  }`}
                  style={
                    boundAssetIds.has(asset.id)
                      ? {
                        borderColor: 'rgba(248, 113, 113, 0.22)',
                        background: 'rgba(248, 113, 113, 0.12)',
                      }
                      : undefined
                  }
                >
                  {binding ? '解绑' : '绑定'}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <select
                  value={selectedMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as EditableBindingMode;
                    setBindingModeDrafts((current) => ({
                      ...current,
                      [asset.id]: nextMode,
                    }));

                    if (binding) {
                      onBindAsset(episode.id, asset.id, nextMode);
                    }
                  }}
                  className="tianti-control-pill px-4 py-2 text-sm"
                >
                  {episodeBindingModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <div className="text-xs leading-6 text-slate-500">
                  {
                    episodeBindingModeOptions.find((option) => option.value === selectedMode)
                      ?.hint
                  }
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
