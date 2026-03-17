import React, { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Plus, Trash2 } from 'lucide-react';
import type { WorkflowShot, WorkflowShotOutput } from '../../../services/workflow/domain/types';

interface EpisodeShotStripPanelProps {
  shots: WorkflowShot[];
  shotOutputs: WorkflowShotOutput[];
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onCreateShot: () => Promise<void> | void;
  onUpdateShot: (
    shotId: string,
    patch: Partial<Pick<WorkflowShot, 'title' | 'prompt'>>,
  ) => Promise<void> | void;
  onDeleteShot: (shotId: string) => Promise<void> | void;
}

type DraftState = Record<string, { title: string; prompt: string }>;

export const EpisodeShotStripPanel: React.FC<EpisodeShotStripPanelProps> = ({
  shots,
  shotOutputs,
  selectedShotId,
  onSelectShot,
  onCreateShot,
  onUpdateShot,
  onDeleteShot,
}) => {
  const [drafts, setDrafts] = useState<DraftState>({});

  useEffect(() => {
    setDrafts(
      shots.reduce<DraftState>((accumulator, shot) => {
        accumulator[shot.id] = {
          title: shot.title || '',
          prompt: shot.prompt || '',
        };
        return accumulator;
      }, {}),
    );
  }, [shots]);

  const outputSummaryByShotId = useMemo(() => (
    shotOutputs.reduce<Record<string, { total: number; selected: number }>>((accumulator, output) => {
      const current = accumulator[output.shotId] ?? { total: 0, selected: 0 };
      current.total += 1;
      if (output.isSelected) {
        current.selected += 1;
      }
      accumulator[output.shotId] = current;
      return accumulator;
    }, {})
  ), [shotOutputs]);

  const handleDraftChange = (
    shotId: string,
    key: 'title' | 'prompt',
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [shotId]: {
        title: current[shotId]?.title ?? '',
        prompt: current[shotId]?.prompt ?? '',
        [key]: value,
      },
    }));
  };

  const handleDraftCommit = async (shot: WorkflowShot) => {
    const draft = drafts[shot.id];
    if (!draft) return;

    const nextTitle = draft.title.trim();
    const nextPrompt = draft.prompt.trim();
    if (nextTitle === (shot.title || '') && nextPrompt === (shot.prompt || '')) {
      return;
    }

    await onUpdateShot(shot.id, {
      title: nextTitle,
      prompt: nextPrompt,
    });
  };

  return (
    <section className="tianti-surface-muted rounded-[24px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
            <Clapperboard className="h-4 w-4 text-cyan-200" />
            Shot Strip
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onCreateShot()}
          className="tianti-button tianti-button-primary px-4 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Add shot
        </button>
      </div>

      {shots.length === 0 ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm leading-7 text-slate-400">
          No shots yet.
        </div>
      ) : (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {shots.map((shot) => {
            const outputSummary = outputSummaryByShotId[shot.id] ?? { total: 0, selected: 0 };
            const isActive = shot.id === selectedShotId;
            const draft = drafts[shot.id] ?? { title: shot.title || '', prompt: shot.prompt || '' };

            return (
              <article
                key={shot.id}
                className={`min-w-[280px] max-w-[320px] rounded-[22px] border p-4 transition-colors ${
                  isActive
                    ? 'border-cyan-400/30 bg-cyan-400/10'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectShot(shot.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-white/40">
                        Shot {shot.shotNumber || 0}
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        Outputs {outputSummary.total} / Selected {outputSummary.selected}
                      </div>
                    </div>
                    <span className="tianti-chip">{isActive ? 'Focused' : 'Open'}</span>
                  </div>
                </button>

                <div className="mt-4 space-y-3">
                  <input
                    value={draft.title}
                    onChange={(event) => handleDraftChange(shot.id, 'title', event.target.value)}
                    onBlur={() => void handleDraftCommit(shot)}
                    placeholder="Shot title"
                    className="tianti-input w-full px-3 py-2 text-sm"
                  />
                  <textarea
                    value={draft.prompt}
                    onChange={(event) => handleDraftChange(shot.id, 'prompt', event.target.value)}
                    onBlur={() => void handleDraftCommit(shot)}
                    placeholder="Shot prompt"
                    className="tianti-input min-h-[120px] w-full px-3 py-3 text-sm leading-6"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void onDeleteShot(shot.id)}
                    className="tianti-button tianti-button-secondary px-3 py-2 text-xs"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
