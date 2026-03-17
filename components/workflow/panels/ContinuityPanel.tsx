import React, { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type {
  ContinuityState,
  EpisodeAssetBinding,
  WorkflowAsset,
} from '../../../services/workflow/domain/types';

interface ContinuityPanelProps {
  episodeId: string;
  assets: WorkflowAsset[];
  bindings: EpisodeAssetBinding[];
  continuityStates: ContinuityState[];
  compact?: boolean;
  onUpdateContinuity: (
    workflowInstanceId: string,
    subjectType: ContinuityState['subjectType'],
    subjectId: string,
    patch: Record<string, unknown>,
  ) => void;
}

const continuityPlaceholders: Record<ContinuityState['subjectType'], string> = {
  character: '记录服装、伤势、情绪、关系变化等连续性信息。',
  scene: '记录昼夜、天气、布景、损坏状态等连续性信息。',
  prop: '记录持有者、是否损坏、是否出现/消失等状态变化。',
};

const continuityLabels: Record<ContinuityState['subjectType'], string> = {
  character: '人物连续性',
  scene: '场景连续性',
  prop: '道具连续性',
};

export const ContinuityPanel: React.FC<ContinuityPanelProps> = ({
  episodeId,
  assets,
  bindings,
  continuityStates,
  compact = false,
  onUpdateContinuity,
}) => {
  const trackableBindings = useMemo(
    () =>
      bindings
        .map((binding) => {
          const asset = assets.find((item) => item.id === binding.assetId);
          if (!asset || asset.type === 'style') return null;

          const subjectType = asset.type as ContinuityState['subjectType'];
          const continuity = continuityStates.find(
            (item) => item.subjectId === asset.id && item.subjectType === subjectType,
          );

          return {
            binding,
            asset,
            subjectType,
            continuity,
          };
        })
        .filter(Boolean) as Array<{
        binding: EpisodeAssetBinding;
        asset: WorkflowAsset;
        subjectType: ContinuityState['subjectType'];
        continuity?: ContinuityState;
      }>,
    [assets, bindings, continuityStates],
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(
      trackableBindings.reduce<Record<string, string>>((accumulator, item) => {
        accumulator[item.asset.id] =
          typeof item.continuity?.state.notes === 'string'
            ? item.continuity.state.notes
            : '';
        return accumulator;
      }, {}),
    );
  }, [trackableBindings]);

  return (
    <section className={`tianti-surface ${compact ? 'rounded-[28px] p-5' : 'rounded-[28px] p-6'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <Clock3 className="h-4 w-4 text-cyan-200" />
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">
            Continuity
          </div>
        </div>
        <span className="tianti-chip">跟踪条目 {trackableBindings.length}</span>
      </div>

      <div className="mt-5 space-y-4">
        {trackableBindings.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
            先绑定资产。
          </div>
        ) : (
          trackableBindings.map(({ asset, subjectType, continuity }) => (
            <article
              key={asset.id}
              className="tianti-surface-muted rounded-[22px] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{asset.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="tianti-chip">{continuityLabels[subjectType]}</span>
                    {continuity?.updatedAt && (
                      <span>
                        最近更新：
                        {new Date(continuity.updatedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <textarea
                value={drafts[asset.id] ?? ''}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [asset.id]: event.target.value,
                  }))
                }
                onBlur={(event) =>
                  onUpdateContinuity(episodeId, subjectType, asset.id, {
                    notes: event.target.value,
                  })
                }
                placeholder={continuityPlaceholders[subjectType]}
                className="tianti-input mt-4 min-h-[104px] w-full px-4 py-3 text-sm leading-7"
              />
            </article>
          ))
        )}
      </div>
    </section>
  );
};
