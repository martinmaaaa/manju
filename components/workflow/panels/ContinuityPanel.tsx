import React, { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { ContinuityState, EpisodeAssetBinding, WorkflowAsset } from '../../../services/workflow/domain/types';

interface ContinuityPanelProps {
  episodeId: string;
  assets: WorkflowAsset[];
  bindings: EpisodeAssetBinding[];
  continuityStates: ContinuityState[];
  onUpdateContinuity: (
    workflowInstanceId: string,
    subjectType: ContinuityState['subjectType'],
    subjectId: string,
    patch: Record<string, unknown>,
  ) => void;
}

const continuityPlaceholders: Record<ContinuityState['subjectType'], string> = {
  character: '记录服装、伤势、情绪、关系变化等连续性信息',
  scene: '记录昼夜、天气、布景、损坏状态等连续性信息',
  prop: '记录持有者、是否损坏、是否出现/消失等状态',
};

export const ContinuityPanel: React.FC<ContinuityPanelProps> = ({
  episodeId,
  assets,
  bindings,
  continuityStates,
  onUpdateContinuity,
}) => {
  const trackableBindings = useMemo(() => bindings
    .map(binding => {
      const asset = assets.find(item => item.id === binding.assetId);
      if (!asset || asset.type === 'style') return null;

      const subjectType = asset.type as ContinuityState['subjectType'];
      const continuity = continuityStates.find(item => item.subjectId === asset.id && item.subjectType === subjectType);

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
    }>, [assets, bindings, continuityStates]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(trackableBindings.reduce<Record<string, string>>((accumulator, item) => {
      accumulator[item.asset.id] = typeof item.continuity?.state.notes === 'string' ? item.continuity.state.notes : '';
      return accumulator;
    }, {}));
  }, [trackableBindings]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-white">
        <Clock3 className="h-4 w-4 text-cyan-200" />
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">连续性</div>
      </div>
      <div className="mt-3 text-sm leading-7 text-slate-300">
        把每一集和共享资产之间的状态变化记录在这里，后续版本生成和提示词拼装都能用到。
      </div>

      <div className="mt-5 space-y-4">
        {trackableBindings.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
            先在单集工作区绑定人物、场景或道具，这里才会出现连续性记录项。
          </div>
        ) : (
          trackableBindings.map(({ asset, subjectType, continuity }) => (
            <div key={asset.id} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">{asset.name}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {subjectType}
                    {continuity?.updatedAt ? ` · 最近更新 ${new Date(continuity.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                </div>
              </div>

              <textarea
                value={drafts[asset.id] ?? ''}
                onChange={(event) => setDrafts(current => ({ ...current, [asset.id]: event.target.value }))}
                onBlur={(event) => onUpdateContinuity(episodeId, subjectType, asset.id, {
                  notes: event.target.value,
                })}
                placeholder={continuityPlaceholders[subjectType]}
                className="mt-3 min-h-[96px] w-full rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-500/40"
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
};
