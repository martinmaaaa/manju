import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Film,
  FolderHeart,
  Sparkles,
  Wand2,
} from 'lucide-react';
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

const statusOptions: WorkflowStageStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'error',
];

const statusLabels: Record<WorkflowStageStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  error: '异常',
};

const statusClassNames: Record<WorkflowStageStatus, string> = {
  not_started: '',
  in_progress: 'is-accent',
  completed: 'is-success',
  error: 'is-danger',
};

const bindingModeOptions: Array<{
  value: EditableBindingMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'follow_latest',
    label: '跟随最新',
    hint: '资产有新版本时，本集会自动跟到最新版本。',
  },
  {
    value: 'pinned',
    label: '固定版本',
    hint: '锁定当前版本，后续资产更新不会自动变化。',
  },
];

const bindingModeLabels: Record<WorkflowBindingMode, string> = {
  follow_latest: '跟随最新',
  pinned: '固定版本',
  derived: '派生版本',
};

const assetTypeLabels: Record<WorkflowAsset['type'], string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  style: '风格',
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
  const [bindingModeDrafts, setBindingModeDrafts] = useState<
    Record<string, EditableBindingMode>
  >({});
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

  const stageEntries = stageDefinitions
    .map((stage) => ({ definition: stage, state: episode.stageStates[stage.id] }))
    .filter((item) => item.state);
  const completedStageCount = stageEntries.filter(
    ({ state }) => state.status === 'completed',
  ).length;

  return (
    <section className="tianti-surface rounded-[32px] p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">
            Episode Workspace
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white">{episode.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            先推进本集阶段、资产绑定和连续性，再按需把整套执行链路投放到原始画布。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tianti-chip is-accent">
              阶段完成 {completedStageCount}/{stageEntries.length}
            </span>
            <span className="tianti-chip">当前绑定 {bindings.length} 个资产</span>
            <span className="tianti-chip">
              默认策略 {bindingModeLabels[defaultBindingMode]}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onMaterializeWorkflow(episode.id)}
          className="tianti-button tianti-button-primary px-5 py-3 text-sm font-semibold"
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
              <article
                key={definition.id}
                className="tianti-surface-muted rounded-[24px] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {definition.title}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-slate-400">
                        {definition.summary}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`tianti-chip ${statusClassNames[state.status]}`}>
                      {statusLabels[state.status]}
                    </span>
                    <select
                      value={state.status}
                      onChange={(event) =>
                        onUpdateStage(episode.id, definition.id, {
                          status: event.target.value as WorkflowStageStatus,
                        })
                      }
                      className="tianti-control-pill px-4 py-2 text-sm"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <textarea
                  value={notes}
                  onChange={(event) =>
                    onUpdateStage(episode.id, definition.id, {
                      formData: { notes: event.target.value },
                    })
                  }
                  placeholder={`记录 ${definition.title} 阶段的输入、约束或备注`}
                  className="tianti-input mt-4 min-h-[112px] w-full px-4 py-3 text-sm leading-7"
                />
              </article>
            );
          })}
        </div>

        <aside className="tianti-surface-muted rounded-[24px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/45">
                Asset Binding
              </div>
              <div className="mt-2 text-lg font-semibold text-white">资产绑定</div>
            </div>
            <span className="tianti-chip">
              默认 {bindingModeLabels[defaultBindingMode]}
            </span>
          </div>

          <div className="mt-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-7 text-slate-300">
            当前单集已绑定 {bindings.length} 个资产。每个资产都可以单独切换成“跟随最新”
            或“固定版本”。
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
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
                    {asset.name} · {bindingModeLabels[binding.mode]}
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-6 space-y-3">
            {assets.map((asset) => {
              const binding = bindingByAssetId[asset.id];
              const selectedMode = binding
                ? normalizeEditableBindingMode(binding.mode)
                : bindingModeDrafts[asset.id] ?? defaultBindingMode;

              return (
                <article
                  key={asset.id}
                  className="tianti-surface rounded-[20px] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{asset.name}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {assetTypeLabels[asset.type]}
                        {asset.tags.length > 0 ? ` · ${asset.tags.join(' / ')}` : ''}
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
                      {bindingModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <div className="text-xs leading-6 text-slate-400">
                      {
                        bindingModeOptions.find((option) => option.value === selectedMode)
                          ?.hint
                      }
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
};
