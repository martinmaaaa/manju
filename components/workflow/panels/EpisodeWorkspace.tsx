import React from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  EpisodeAssetBinding,
  WorkflowAsset,
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowStageDefinition,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';
import { EpisodeAssetBindingPanel } from './EpisodeAssetBindingPanel';
import { EpisodeOutputsPanel } from './EpisodeOutputsPanel';
import { EpisodeStagePanel } from './EpisodeStagePanel';
import { episodeBindingModeLabels, normalizeEditableBindingMode } from './episodeWorkspaceShared';

interface EpisodeWorkspaceProps {
  episode: WorkflowInstance;
  stageDefinitions: WorkflowStageDefinition[];
  assets: WorkflowAsset[];
  bindings: EpisodeAssetBinding[];
  compact?: boolean;
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

export const EpisodeWorkspace: React.FC<EpisodeWorkspaceProps> = ({
  episode,
  stageDefinitions,
  assets,
  bindings,
  compact = false,
  onBindAsset,
  onUnbindAsset,
  onUpdateStage,
  onMaterializeWorkflow,
}) => {
  const stageEntries = stageDefinitions
    .map((stage) => ({ definition: stage, state: episode.stageStates[stage.id] }))
    .filter((item) => item.state);
  const completedStageCount = stageEntries.filter(
    ({ state }) => state.status === 'completed',
  ).length;
  const defaultBindingMode = normalizeEditableBindingMode(
    episode.metadata?.preferredBindingMode,
  );

  return (
    <section className={`tianti-surface ${compact ? 'rounded-[28px] p-5' : 'rounded-[32px] p-8'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">
            Episode Workspace
          </div>
          <h2 className={`mt-3 font-semibold text-white ${compact ? 'text-2xl' : 'text-3xl'}`}>{episode.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            先推进本集阶段、资产绑定和连续性，再按需把整套执行链路投放到原始画布。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tianti-chip is-accent">
              阶段完成 {completedStageCount}/{stageEntries.length}
            </span>
            <span className="tianti-chip">当前绑定 {bindings.length} 个资产</span>
            <span className="tianti-chip">
              默认策略 {episodeBindingModeLabels[defaultBindingMode]}
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

      <div className={compact ? 'mt-6 space-y-6' : 'mt-8 space-y-6'}>
        <div className={`grid gap-6 ${compact ? '' : 'xl:grid-cols-[1.15fr_0.85fr]'}`}>
          <EpisodeStagePanel
            episode={episode}
            stageDefinitions={stageDefinitions}
            compact={compact}
            showHeader={false}
            onUpdateStage={onUpdateStage}
            onMaterializeWorkflow={!compact ? onMaterializeWorkflow : undefined}
          />
          <EpisodeAssetBindingPanel
            episode={episode}
            assets={assets}
            bindings={bindings}
            compact={compact}
            showHeader={false}
            onBindAsset={onBindAsset}
            onUnbindAsset={onUnbindAsset}
          />
        </div>

        <EpisodeOutputsPanel
          episode={episode}
          stageDefinitions={stageDefinitions}
          compact={compact}
          showHeader={false}
        />
      </div>
    </section>
  );
};
