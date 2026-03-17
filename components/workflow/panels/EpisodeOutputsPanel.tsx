import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  FileOutput,
} from 'lucide-react';
import type {
  WorkflowInstance,
  WorkflowShot,
  WorkflowShotOutput,
  WorkflowStageDefinition,
  WorkflowStageRun,
} from '../../../services/workflow/domain/types';
import { stageStatusClassNames, stageStatusLabels } from './episodeWorkspaceShared';

interface EpisodeOutputsPanelProps {
  episode: WorkflowInstance;
  stageDefinitions: WorkflowStageDefinition[];
  stageRuns?: WorkflowStageRun[];
  shots?: WorkflowShot[];
  shotOutputs?: WorkflowShotOutput[];
  compact?: boolean;
  showHeader?: boolean;
}

type RenderableOutputEntry = {
  key: string;
  label: string;
  value: string;
  multiline: boolean;
};

function humanizeOutputKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value?: string): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toRenderableOutputEntry(
  key: string,
  value: unknown,
): RenderableOutputEntry | null {
  if (value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    return {
      key,
      label: humanizeOutputKey(key),
      value: trimmed,
      multiline: trimmed.length > 72 || trimmed.includes('\n'),
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return {
      key,
      label: humanizeOutputKey(key),
      value: String(value),
      multiline: false,
    };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    const allPrimitive = value.every(
      (item) => ['string', 'number', 'boolean'].includes(typeof item),
    );
    const formattedValue = allPrimitive
      ? value.join(' / ')
      : JSON.stringify(value, null, 2);

    return {
      key,
      label: humanizeOutputKey(key),
      value: formattedValue,
      multiline: !allPrimitive || formattedValue.length > 72,
    };
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return null;

    return {
      key,
      label: humanizeOutputKey(key),
      value: JSON.stringify(value, null, 2),
      multiline: true,
    };
  }

  return {
    key,
    label: humanizeOutputKey(key),
    value: String(value),
    multiline: false,
  };
}

export const EpisodeOutputsPanel: React.FC<EpisodeOutputsPanelProps> = ({
  episode,
  stageDefinitions,
  stageRuns = [],
  shots = [],
  shotOutputs = [],
  compact = false,
  showHeader = true,
}) => {
  const stageRunByStageId = useMemo(
    () => new Map(stageRuns.map((stageRun) => [stageRun.stageId, stageRun])),
    [stageRuns],
  );
  const stageCards = useMemo(() => (
    stageDefinitions
      .map((stage) => {
        const persistedStageRun = stageRunByStageId.get(stage.id);
        const state = persistedStageRun
          ? {
              stageId: persistedStageRun.stageId,
              status: persistedStageRun.status,
              formData: persistedStageRun.formData,
              outputs: persistedStageRun.outputs,
              artifactIds: persistedStageRun.artifactIds,
              error: persistedStageRun.error,
              startedAt: persistedStageRun.startedAt ?? undefined,
              completedAt: persistedStageRun.completedAt ?? undefined,
            }
          : episode.stageStates[stage.id];
        if (!state) return null;

        const outputEntries = Object.entries(state.outputs)
          .map(([key, value]) => toRenderableOutputEntry(key, value))
          .filter((entry): entry is RenderableOutputEntry => Boolean(entry));
        const hasDeliverables = outputEntries.length > 0
          || state.artifactIds.length > 0
          || Boolean(state.error)
          || Boolean(state.completedAt);

        if (!hasDeliverables) return null;

        return {
          definition: stage,
          state,
          outputEntries,
          completedAtLabel: formatTimestamp(state.completedAt),
          startedAtLabel: formatTimestamp(state.startedAt),
        };
      })
      .filter(Boolean) as Array<{
      definition: WorkflowStageDefinition;
      state: WorkflowInstance['stageStates'][string];
      outputEntries: RenderableOutputEntry[];
      completedAtLabel: string | null;
      startedAtLabel: string | null;
    }>
  ), [episode.stageStates, stageDefinitions, stageRunByStageId]);

  const totalArtifacts = stageCards.reduce(
    (sum, card) => sum + card.state.artifactIds.length,
    0,
  );
  const selectedShotOutputCount = shotOutputs.filter((output) => output.isSelected).length;

  return (
    <section className={`tianti-surface ${compact ? 'rounded-[28px] p-5' : 'rounded-[30px] p-6'}`}>
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-300/80">
              <FileOutput className="h-4 w-4" />
              Episode Outputs
            </div>
            <h3 className={`mt-3 font-semibold text-white ${compact ? 'text-xl' : 'text-2xl'}`}>
              产出收口
            </h3>
            <div className="mt-3 text-sm leading-7 text-slate-300">
              把剧本、资产、分镜、提示词和视频阶段沉淀下来的结构化结果统一收在这里，后续对接即梦或其他执行端时，优先从这里取数。
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="tianti-chip">Shots {shots.length}</span>
            <span className="tianti-chip">Selected outputs {selectedShotOutputCount}</span>
            <span className="tianti-chip is-accent">有产出阶段 {stageCards.length}</span>
            <span className="tianti-chip">产物引用 {totalArtifacts}</span>
          </div>
        </div>
      )}

      <div className={`${showHeader ? 'mt-5' : ''} space-y-4`}>
        {stageCards.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm leading-7 text-slate-400">
            当前还没有沉淀下来的结构化产出。等阶段完成后，可以在阶段状态里回写链接、文件 ID、封面地址、平台任务号或发布结果，这里会自动汇总。
          </div>
        ) : (
          stageCards.map(({ definition, state, outputEntries, completedAtLabel, startedAtLabel }) => (
            <article
              key={definition.id}
              className="tianti-surface-muted rounded-[24px] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-white">{definition.title}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">
                    {definition.summary}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`tianti-chip ${stageStatusClassNames[state.status]}`}>
                    {stageStatusLabels[state.status]}
                  </span>
                  {completedAtLabel && (
                    <span className="tianti-chip">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {completedAtLabel}
                    </span>
                  )}
                  {!completedAtLabel && startedAtLabel && (
                    <span className="tianti-chip">
                      <Clock3 className="h-3.5 w-3.5" />
                      {startedAtLabel}
                    </span>
                  )}
                </div>
              </div>

              {state.error && (
                <div className="mt-4 rounded-[18px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm leading-7 text-rose-100">
                  <div className="flex items-center gap-2 font-medium text-rose-50">
                    <AlertTriangle className="h-4 w-4" />
                    执行异常
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-words">{state.error}</div>
                </div>
              )}

              {outputEntries.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {outputEntries.map((entry) => (
                    <div
                      key={`${definition.id}-${entry.key}`}
                      className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-3"
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                        {entry.label}
                      </div>
                      <div
                        className={`mt-2 text-sm text-slate-200 ${
                          entry.multiline ? 'whitespace-pre-wrap break-words leading-7' : ''
                        }`}
                      >
                        {entry.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-white/8 bg-black/10 px-4 py-3 text-sm leading-7 text-slate-400">
                  这个阶段已推进，但还没有记录结构化产出字段。
                </div>
              )}

              {state.artifactIds.length > 0 && (
                <div className="mt-4 rounded-[18px] border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-50">
                    <Boxes className="h-4 w-4" />
                    关联产物引用
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {state.artifactIds.map((artifactId) => (
                      <span key={artifactId} className="tianti-chip">
                        {artifactId}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};
