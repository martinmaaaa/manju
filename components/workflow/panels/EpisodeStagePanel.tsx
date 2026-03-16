import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import type {
  WorkflowInstance,
  WorkflowStageDefinition,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';
import {
  episodeStageIcons,
  stageStatusClassNames,
  stageStatusLabels,
  stageStatusOptions,
} from './episodeWorkspaceShared';

interface EpisodeStagePanelProps {
  episode: WorkflowInstance;
  stageDefinitions: WorkflowStageDefinition[];
  compact?: boolean;
  showHeader?: boolean;
  onUpdateStage: (
    episodeId: string,
    stageId: string,
    patch: {
      status?: WorkflowStageStatus;
      formData?: Record<string, unknown>;
      outputs?: Record<string, unknown>;
    },
  ) => void;
  onMaterializeWorkflow?: (workflowInstanceId: string) => void;
}

export const EpisodeStagePanel: React.FC<EpisodeStagePanelProps> = ({
  episode,
  stageDefinitions,
  compact = false,
  showHeader = true,
  onUpdateStage,
  onMaterializeWorkflow,
}) => {
  const stageEntries = stageDefinitions
    .map((stage) => ({ definition: stage, state: episode.stageStates[stage.id] }))
    .filter((item) => item.state);
  const completedStageCount = stageEntries.filter(
    ({ state }) => state.status === 'completed',
  ).length;

  return (
    <section className={`tianti-surface ${compact ? 'rounded-[28px] p-5' : 'rounded-[30px] p-6'}`}>
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">
              Episode Stages
            </div>
            <h3 className={`mt-3 font-semibold text-white ${compact ? 'text-xl' : 'text-2xl'}`}>
              阶段推进
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="tianti-chip is-accent">
                阶段完成 {completedStageCount}/{stageEntries.length}
              </span>
              <span className="tianti-chip">当前单集 {episode.title}</span>
            </div>
          </div>

          {onMaterializeWorkflow && (
            <button
              type="button"
              onClick={() => onMaterializeWorkflow(episode.id)}
              className="tianti-button tianti-button-primary px-4 py-2 text-sm font-semibold"
            >
              投放画布
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}

      <div className={`${showHeader ? 'mt-5' : ''} space-y-4`}>
        {stageEntries.map(({ definition, state }) => {
          const Icon = episodeStageIcons[definition.id] ?? Sparkles;
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
                  <span className={`tianti-chip ${stageStatusClassNames[state.status]}`}>
                    {stageStatusLabels[state.status]}
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
                    {stageStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {stageStatusLabels[status]}
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
    </section>
  );
};
