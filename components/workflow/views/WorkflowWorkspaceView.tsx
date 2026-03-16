import React, { useMemo } from 'react';
import { Clapperboard, Layers3 } from 'lucide-react';
import type {
  ContinuityState,
  WorkflowBindingMode,
  WorkflowProjectState,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';
import {
  getEpisodeBindings,
  getEpisodeContinuityStates,
  getEpisodeInstances,
  getSeriesInstances,
} from '../../../services/workflow/runtime/projectState';
import { getWorkflowTemplate } from '../../../services/workflow/registry';
import { ContinuityPanel } from '../panels/ContinuityPanel';
import { EpisodeWorkspace } from '../panels/EpisodeWorkspace';

interface WorkflowWorkspaceViewProps {
  workflowState: WorkflowProjectState;
  onSelectEpisode: (episodeId: string) => void | Promise<void>;
  onBindAsset: (episodeId: string, assetId: string, mode: WorkflowBindingMode) => void;
  onUnbindAsset: (bindingId: string) => void;
  onUpdateContinuity: (
    workflowInstanceId: string,
    subjectType: ContinuityState['subjectType'],
    subjectId: string,
    patch: Record<string, unknown>,
  ) => void;
  onUpdateStage: (
    workflowInstanceId: string,
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => void;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

export const WorkflowWorkspaceView: React.FC<WorkflowWorkspaceViewProps> = ({
  workflowState,
  onSelectEpisode,
  onBindAsset,
  onUnbindAsset,
  onUpdateContinuity,
  onUpdateStage,
  onMaterializeWorkflow,
}) => {
  const seriesInstances = useMemo(() => getSeriesInstances(workflowState), [workflowState]);

  const activeEpisode = useMemo(() => {
    if (workflowState.activeEpisodeId) {
      return workflowState.instances.find(instance => instance.id === workflowState.activeEpisodeId) ?? null;
    }

    const firstSeries = seriesInstances[0];
    if (!firstSeries) return null;
    return getEpisodeInstances(workflowState, firstSeries.id)[0] ?? null;
  }, [seriesInstances, workflowState]);

  const parentSeries = useMemo(() => {
    if (!activeEpisode?.parentInstanceId) return null;
    return workflowState.instances.find(instance => instance.id === activeEpisode.parentInstanceId) ?? null;
  }, [activeEpisode, workflowState.instances]);

  const siblingEpisodes = useMemo(() => {
    if (!parentSeries) return [];
    return getEpisodeInstances(workflowState, parentSeries.id);
  }, [parentSeries, workflowState]);

  if (!activeEpisode) {
    return (
      <section className="tianti-surface rounded-[32px] border border-dashed p-10 text-center">
        <div className="max-w-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
            <Layers3 className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-white">还没有单集工作区</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            先去剧集页创建单集，再回到这里推进剧本、资产绑定、分镜和视频生成。
          </p>
        </div>
      </section>
    );
  }

  const activeEpisodeStages = getWorkflowTemplate(activeEpisode.templateId).stages;
  const activeEpisodeBindings = getEpisodeBindings(workflowState, activeEpisode.id);
  const activeEpisodeContinuity = getEpisodeContinuityStates(workflowState, activeEpisode.id);

  return (
    <div className="space-y-6">
      <section className="tianti-hero-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Episode Workspace</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">{activeEpisode.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              单集工作区只关心当前这一集怎么往下推进，完成后再把整套执行链路投放到高级画布。
            </p>
          </div>

          {parentSeries && (
            <div className="tianti-surface-muted rounded-full px-4 py-2 text-sm text-slate-300">
              所属系列：{parentSeries.title}
            </div>
          )}
        </div>

        {siblingEpisodes.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {siblingEpisodes.map((episode) => (
              <button
                key={episode.id}
                type="button"
                onClick={() => onSelectEpisode(episode.id)}
                className={`tianti-button px-4 py-2 text-sm ${
                  episode.id === activeEpisode.id
                    ? 'tianti-button-ghost border-cyan-400/20 bg-cyan-400/12 text-cyan-50'
                    : 'tianti-button-secondary'
                }`}
              >
                <Clapperboard className="h-4 w-4" />
                {episode.title}
              </button>
            ))}
          </div>
        )}
      </section>

      <EpisodeWorkspace
        episode={activeEpisode}
        stageDefinitions={activeEpisodeStages}
        assets={workflowState.assets}
        bindings={activeEpisodeBindings}
        onBindAsset={onBindAsset}
        onUnbindAsset={onUnbindAsset}
        onUpdateStage={onUpdateStage}
        onMaterializeWorkflow={onMaterializeWorkflow}
      />

      <ContinuityPanel
        episodeId={activeEpisode.id}
        assets={workflowState.assets}
        bindings={activeEpisodeBindings}
        continuityStates={activeEpisodeContinuity}
        onUpdateContinuity={onUpdateContinuity}
      />
    </div>
  );
};
