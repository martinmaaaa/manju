import React from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  EpisodeAssetBinding,
  WorkflowAsset,
  WorkflowBindingMode,
  WorkflowInstance,
  WorkflowShot,
  WorkflowShotOutput,
  WorkflowStageDefinition,
  WorkflowStageRun,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';
import { EpisodeAssetBindingPanel } from './EpisodeAssetBindingPanel';
import { EpisodeOutputsPanel } from './EpisodeOutputsPanel';
import { EpisodeResultPoolPanel } from './EpisodeResultPoolPanel';
import { EpisodeShotStripPanel } from './EpisodeShotStripPanel';
import { EpisodeStagePanel } from './EpisodeStagePanel';
import { episodeBindingModeLabels, normalizeEditableBindingMode } from './episodeWorkspaceShared';

interface EpisodeWorkspaceProps {
  episode: WorkflowInstance;
  stageDefinitions: WorkflowStageDefinition[];
  assets: WorkflowAsset[];
  bindings: EpisodeAssetBinding[];
  stageRuns?: WorkflowStageRun[];
  shots?: WorkflowShot[];
  shotOutputs?: WorkflowShotOutput[];
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
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onCreateShot: () => Promise<void> | void;
  onUpdateShot: (
    shotId: string,
    patch: Partial<Pick<WorkflowShot, 'title' | 'prompt'>>,
  ) => Promise<void> | void;
  onDeleteShot: (shotId: string) => Promise<void> | void;
  onSelectShotOutput: (outputId: string) => Promise<void> | void;
}

export const EpisodeWorkspace: React.FC<EpisodeWorkspaceProps> = ({
  episode,
  stageDefinitions,
  assets,
  bindings,
  stageRuns = [],
  shots = [],
  shotOutputs = [],
  compact = false,
  onBindAsset,
  onUnbindAsset,
  onUpdateStage,
  onMaterializeWorkflow,
  selectedShotId,
  onSelectShot,
  onCreateShot,
  onUpdateShot,
  onDeleteShot,
  onSelectShotOutput,
}) => {
  const stageRunByStageId = new Map(stageRuns.map((stageRun) => [stageRun.stageId, stageRun]));
  const stageEntries = stageDefinitions
    .map((stage) => {
      const persistedStageRun = stageRunByStageId.get(stage.id);
      return {
        definition: stage,
        state: persistedStageRun
          ? { status: persistedStageRun.status }
          : episode.stageStates[stage.id],
      };
    })
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
            stageRuns={stageRuns}
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
          stageRuns={stageRuns}
          shots={shots}
          shotOutputs={shotOutputs}
          compact={compact}
          showHeader={false}
        />

        <div className={`grid gap-6 ${compact ? '' : 'xl:grid-cols-[1fr_1fr]'}`}>
          <EpisodeShotStripPanel
            shots={shots}
            shotOutputs={shotOutputs}
            selectedShotId={selectedShotId}
            onSelectShot={onSelectShot}
            onCreateShot={onCreateShot}
            onUpdateShot={onUpdateShot}
            onDeleteShot={onDeleteShot}
          />
          <EpisodeResultPoolPanel
            shots={shots}
            shotOutputs={shotOutputs}
            selectedShotId={selectedShotId}
            onSelectShot={onSelectShot}
            onSelectOutput={onSelectShotOutput}
          />
        </div>
      </div>
    </section>
  );
};
