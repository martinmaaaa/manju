import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Film, FolderHeart, Sparkles, Wand2 } from 'lucide-react';
import type {
  EpisodeAssetBinding,
  WorkflowAsset,
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowStageDefinition,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';

interface EpisodeWorkspaceProps {
  episode: WorkflowInstance;
  stageDefinitions: WorkflowStageDefinition[];
  assets: WorkflowAsset[];
  bindings: EpisodeAssetBinding[];
  onBindAsset: (episodeId: string, assetId: string, mode: WorkflowBindingMode) => void;
  onUnbindAsset: (bindingId: string) => void;
  onUpdateStage: (
    episodeId: string,
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

type EditableBindingMode = Extract<WorkflowBindingMode, 'follow_latest' | 'pinned'>;

const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'episode-script': Sparkles,
  'episode-assets': FolderHeart,
  storyboard: Film,
  prompt: Wand2,
  video: CheckCircle2,
};

const statusOptions: WorkflowStageStatus[] = ['not_started', 'in_progress', 'completed', 'error'];

const statusLabels: Record<WorkflowStageStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  error: '异常',
};

const bindingModeOptions: Array<{ value: EditableBindingMode; label: string; hint: string }> = [
  {
    value: 'follow_latest',
    label: '跟随最新',
    hint: '资产出新版本后，本集自动跟到最新版本',
  },
  {
    value: 'pinned',
    label: '固定版本',
    hint: '锁定当前版本，后续资产更新不自动变化',
  },
];

const bindingModeLabels: Record<WorkflowBindingMode, string> = {
  follow_latest: '跟随最新',
  pinned: '固定版本',
  derived: '派生版本',
};

function normalizeEditableBindingMode(mode?: WorkflowBindingMode): EditableBindingMode {
  return mode === 'pinned' ? 'pinned' : 'follow_latest';
}

export const EpisodeWorkspace: React.FC<EpisodeWorkspaceProps> = ({
  episode,
  stageDefinitions,
  assets,
  bindings,
  onBindAsset,
  onUnbindAsset,
  onUpdateStage,
  onMaterializeWorkflow,
}) => {
  const [bindingModeDrafts, setBindingModeDrafts] = useState<Record<string, EditableBindingMode>>({});
  const defaultBindingMode = normalizeEditableBindingMode(episode.metadata?.preferredBindingMode);

  const boundAssetIds = useMemo(() => new Set(bindings.map(binding => binding.assetId)), [bindings]);
  const bindingByAssetId = useMemo(() => bindings.reduce<Record<string, EpisodeAssetBinding>>((accumulator, binding) => {
    accumulator[binding.assetId] = binding;
    return accumulator;
  }, {}), [bindings]);

  const stageEntries = stageDefinitions
    .map(stage => ({ definition: stage, state: episode.stageStates[stage.id] }))
    .filter(item => item.state);

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">单集工作区</div>
          <h2 className="mt-3 text-3xl font-semibold">{episode.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            先推进本集阶段、资产绑定和连续性，再按需把整套执行链路投放到原始画布。
          </p>
        </div>

        <button
          type="button"
          onClick={() => onMaterializeWorkflow(episode.id)}
          className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-5 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/20"
        >
          整套投放到画布
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {stageEntries.map(({ definition, state }) => {
            const Icon = stageIcons[definition.id] ?? Sparkles;
            const notes = typeof state.formData.notes === 'string' ? state.formData.notes : '';

            return (
              <article key={definition.id} className="rounded-[24px] border border-white/10 bg-black/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-white/5 p-3 text-cyan-200">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-white">{definition.title}</div>
                        <div className="mt-1 text-sm text-slate-400">{definition.summary}</div>
                      </div>
                    </div>
                  </div>

                  <select
                    value={state.status}
                    onChange={(event) => onUpdateStage(episode.id, definition.id, {
                      status: event.target.value as WorkflowStageStatus,
                    })}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none"
                  >
                    {statusOptions.map(status => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={notes}
                  onChange={(event) => onUpdateStage(episode.id, definition.id, {
                    formData: { notes: event.target.value },
                  })}
                  placeholder={`记录 ${definition.title} 阶段的输入、约束或备注`}
                  className="mt-4 min-h-[108px] w-full rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-500/40"
                />
              </article>
            );
          })}
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">资产绑定</div>
          <div className="mt-3 text-sm leading-7 text-slate-300">
            当前单集已绑定 {bindings.length} 个资产。可为每个资产单独选择“跟随最新”或“固定版本”。
          </div>
          <div className="mt-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-6 text-slate-400">
            本集默认绑定策略：{bindingModeLabels[defaultBindingMode]}。新绑定的资产会默认采用该策略，你也可以逐个改。
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {bindings.length === 0 ? (
              <span className="text-sm text-slate-500">还没有绑定资产</span>
            ) : (
              bindings.map((binding) => {
                const asset = assets.find(item => item.id === binding.assetId);
                if (!asset) return null;

                return (
                  <button
                    key={binding.id}
                    type="button"
                    onClick={() => onUnbindAsset(binding.id)}
                    className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100 transition hover:border-red-500/30 hover:bg-red-500/15"
                  >
                    {asset.name} · {bindingModeLabels[binding.mode]}
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-6 space-y-3">
            {assets.map(asset => {
              const binding = bindingByAssetId[asset.id];
              const selectedMode = binding
                ? normalizeEditableBindingMode(binding.mode)
                : (bindingModeDrafts[asset.id] ?? defaultBindingMode);

              return (
                <div
                  key={asset.id}
                  className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{asset.name}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {asset.type}{asset.tags.length > 0 ? ` · ${asset.tags.join(' / ')}` : ''}
                      </div>
                      {binding && (
                        <div className="mt-2 text-xs text-cyan-200">
                          当前模式：{bindingModeLabels[binding.mode]}
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
                      className={`rounded-full px-3 py-1.5 text-xs transition ${
                        boundAssetIds.has(asset.id)
                          ? 'border border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/15'
                          : 'border border-white/10 bg-white/5 text-slate-200 hover:border-cyan-500/30 hover:text-white'
                      }`}
                    >
                      {binding ? '解绑' : '绑定'}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <select
                      value={selectedMode}
                      onChange={(event) => {
                        const nextMode = event.target.value as EditableBindingMode;
                        setBindingModeDrafts(current => ({ ...current, [asset.id]: nextMode }));

                        if (binding) {
                          onBindAsset(episode.id, asset.id, nextMode);
                        }
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none"
                    >
                      {bindingModeOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <div className="text-xs text-slate-400">
                      {bindingModeOptions.find(option => option.value === selectedMode)?.hint}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
