import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clapperboard, Layers3, Loader2 } from 'lucide-react';
import {
  createEpisodeAssetBinding,
  createEpisodeShot,
  deleteEpisodeAssetBinding,
  deleteWorkflowShot,
  getEpisodeWorkspace,
  selectShotOutput,
  updateWorkflowShot,
  updateWorkflowStageRun,
  type EpisodeWorkspaceData,
} from '../../../services/api';
import type {
  ContinuityState,
  WorkflowBindingMode,
  WorkflowProjectState,
  WorkflowShot,
  WorkflowStageRun,
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
  ) => void | Promise<void>;
  onMaterializeWorkflow: (workflowInstanceId: string) => void;
}

function upsertStageRun(
  current: EpisodeWorkspaceData | null,
  stageRun: WorkflowStageRun,
): EpisodeWorkspaceData | null {
  if (!current) return current;

  return {
    ...current,
    stageRuns: current.stageRuns.some((candidate) => candidate.id === stageRun.id)
      ? current.stageRuns.map((candidate) => candidate.id === stageRun.id ? stageRun : candidate)
      : [...current.stageRuns, stageRun],
  };
}

function upsertShot(
  current: EpisodeWorkspaceData | null,
  shot: WorkflowShot,
): EpisodeWorkspaceData | null {
  if (!current) return current;

  const nextShots = current.shots.some((candidate) => candidate.id === shot.id)
    ? current.shots.map((candidate) => candidate.id === shot.id ? shot : candidate)
    : [...current.shots, shot];

  return {
    ...current,
    shots: [...nextShots].sort((left, right) => left.shotNumber - right.shotNumber),
  };
}

function upsertAssetBinding(
  current: EpisodeWorkspaceData | null,
  binding: EpisodeWorkspaceData['assetBindings'][number],
): EpisodeWorkspaceData | null {
  if (!current) return current;

  const nextBindings = current.assetBindings.some((candidate) => candidate.id === binding.id)
    ? current.assetBindings.map((candidate) => candidate.id === binding.id ? binding : candidate)
    : [...current.assetBindings, binding];

  return {
    ...current,
    assetBindings: [...nextBindings].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  };
}

function removeAssetBinding(
  current: EpisodeWorkspaceData | null,
  bindingId: string,
): EpisodeWorkspaceData | null {
  if (!current) return current;

  return {
    ...current,
    assetBindings: current.assetBindings.filter((binding) => binding.id !== bindingId),
  };
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
  const [workspaceData, setWorkspaceData] = useState<EpisodeWorkspaceData | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

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

  const loadEpisodeWorkspace = useCallback(async (workflowInstanceId: string) => {
    setIsWorkspaceLoading(true);
    const response = await getEpisodeWorkspace(workflowInstanceId);
    setIsWorkspaceLoading(false);

    if (!response.success || !response.data) {
      setWorkspaceData(null);
      setWorkspaceError(response.error || 'Episode workspace API unavailable.');
      setSelectedShotId(null);
      return;
    }

    setWorkspaceData(response.data);
    setWorkspaceError(null);
    setSelectedShotId((current) => (
      current && response.data.shots.some((shot) => shot.id === current)
        ? current
        : (response.data.shots[0]?.id ?? null)
    ));
  }, []);

  useEffect(() => {
    if (!activeEpisode) {
      setWorkspaceData(null);
      setWorkspaceError(null);
      setSelectedShotId(null);
      return;
    }

    void loadEpisodeWorkspace(activeEpisode.id);
  }, [activeEpisode?.id, loadEpisodeWorkspace]);

  const handleWorkspaceStageUpdate = useCallback(async (
    workflowInstanceId: string,
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => {
    try {
      await onUpdateStage(workflowInstanceId, stageId, patch);
      const response = await updateWorkflowStageRun(workflowInstanceId, stageId, patch);
      if (!response.success || !response.data) {
        setWorkspaceError(response.error || 'Failed to sync stage run.');
        return;
      }

      setWorkspaceData((current) => upsertStageRun(current, response.data));
    } catch (error: any) {
      setWorkspaceError(error?.message || 'Failed to update stage state.');
    }
  }, [onUpdateStage]);

  const handleCreateShot = useCallback(async () => {
    if (!activeEpisode) return;

    const latestShot = workspaceData && workspaceData.shots.length > 0
      ? workspaceData.shots[workspaceData.shots.length - 1]
      : null;
    const nextShotNumber = (latestShot?.shotNumber ?? 0) + 1;
    const response = await createEpisodeShot(activeEpisode.id, {
      shotNumber: nextShotNumber,
      title: `Shot ${nextShotNumber}`,
      prompt: '',
      metadata: {},
    });

    if (!response.success || !response.data) {
      setWorkspaceError(response.error || 'Failed to create shot.');
      return;
    }

    setWorkspaceData((current) => upsertShot(current, response.data));
    setSelectedShotId(response.data.id);
  }, [activeEpisode, workspaceData]);

  const handleUpdateShot = useCallback(async (
    shotId: string,
    patch: Partial<Pick<WorkflowShot, 'title' | 'prompt'>>,
  ) => {
    const response = await updateWorkflowShot(shotId, patch);
    if (!response.success || !response.data) {
      setWorkspaceError(response.error || 'Failed to update shot.');
      return;
    }

    setWorkspaceData((current) => upsertShot(current, response.data));
  }, []);

  const handleDeleteShot = useCallback(async (shotId: string) => {
    const response = await deleteWorkflowShot(shotId);
    if (!response.success) {
      setWorkspaceError(response.error || 'Failed to delete shot.');
      return;
    }

    setWorkspaceData((current) => {
      if (!current) return current;

      return {
        ...current,
        shots: current.shots.filter((shot) => shot.id !== shotId),
        shotOutputs: current.shotOutputs.filter((output) => output.shotId !== shotId),
      };
    });

    setSelectedShotId((current) => {
      if (current !== shotId) return current;
      const remainingShots = workspaceData?.shots.filter((shot) => shot.id !== shotId) ?? [];
      return remainingShots[0]?.id ?? null;
    });
  }, [workspaceData]);

  const handleSelectShotOutput = useCallback(async (outputId: string) => {
    const response = await selectShotOutput(outputId);
    if (!response.success || !response.data) {
      setWorkspaceError(response.error || 'Failed to select output.');
      return;
    }

    setWorkspaceData((current) => {
      if (!current) return current;

      return {
        ...current,
        shotOutputs: current.shotOutputs.map((output) => (
          output.shotId === response.data!.shotId
            ? {
                ...output,
                isSelected: output.id === response.data!.id,
                selectedAt: output.id === response.data!.id ? response.data!.selectedAt : null,
              }
            : output
        )),
      };
    });
  }, []);

  const handleWorkspaceBindAsset = useCallback(async (
    episodeId: string,
    assetId: string,
    mode: WorkflowBindingMode,
  ) => {
    const response = await createEpisodeAssetBinding(episodeId, { assetId, mode });
    if (!response.success || !response.data) {
      setWorkspaceError(response.error || 'Failed to bind asset.');
      return;
    }

    onBindAsset(episodeId, assetId, mode);
    setWorkspaceData((current) => upsertAssetBinding(current, response.data));
  }, [onBindAsset]);

  const handleWorkspaceUnbindAsset = useCallback(async (bindingId: string) => {
    const response = await deleteEpisodeAssetBinding(bindingId);
    if (!response.success) {
      setWorkspaceError(response.error || 'Failed to unbind asset.');
      return;
    }

    onUnbindAsset(bindingId);
    setWorkspaceData((current) => removeAssetBinding(current, bindingId));
  }, [onUnbindAsset]);

  if (!activeEpisode) {
    return (
      <section className="tianti-surface rounded-[32px] border border-dashed p-10 text-center">
        <div className="max-w-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200">
            <Layers3 className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold text-white">No episode workspace yet</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">Create an episode first.</p>
        </div>
      </section>
    );
  }

  const activeEpisodeStages = getWorkflowTemplate(activeEpisode.templateId).stages;
  const activeEpisodeBindings = workspaceData?.assetBindings ?? getEpisodeBindings(workflowState, activeEpisode.id);
  const activeEpisodeContinuity = getEpisodeContinuityStates(workflowState, activeEpisode.id);

  return (
    <div className="space-y-6">
      {(parentSeries || siblingEpisodes.length > 0) && (
        <section className="tianti-surface-muted rounded-[24px] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">{activeEpisode.title}</div>
            {parentSeries && (
              <div className="text-xs text-slate-400">{parentSeries.title}</div>
            )}
          </div>

          {siblingEpisodes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
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
      )}

      {(isWorkspaceLoading || workspaceError) && (
        <section className="tianti-surface-muted rounded-[24px] p-4">
          {isWorkspaceLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
              Loading episode workspace data...
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-amber-100">
              <AlertCircle className="h-4 w-4 text-amber-300" />
              {workspaceError}
              <button
                type="button"
                onClick={() => void loadEpisodeWorkspace(activeEpisode.id)}
                className="tianti-button tianti-button-secondary ml-auto px-3 py-2 text-xs"
              >
                Retry
              </button>
            </div>
          )}
        </section>
      )}

      <EpisodeWorkspace
        episode={activeEpisode}
        stageDefinitions={activeEpisodeStages}
        assets={workflowState.assets}
        bindings={activeEpisodeBindings}
        stageRuns={workspaceData?.stageRuns ?? []}
        shots={workspaceData?.shots ?? []}
        shotOutputs={workspaceData?.shotOutputs ?? []}
        onBindAsset={handleWorkspaceBindAsset}
        onUnbindAsset={handleWorkspaceUnbindAsset}
        onUpdateStage={handleWorkspaceStageUpdate}
        onMaterializeWorkflow={onMaterializeWorkflow}
        selectedShotId={selectedShotId}
        onSelectShot={setSelectedShotId}
        onCreateShot={handleCreateShot}
        onUpdateShot={handleUpdateShot}
        onDeleteShot={handleDeleteShot}
        onSelectShotOutput={handleSelectShotOutput}
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
