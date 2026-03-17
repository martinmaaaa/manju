import React, { useMemo } from 'react';
import { CheckCircle2, GalleryVerticalEnd, Image as ImageIcon, Video } from 'lucide-react';
import type { WorkflowShot, WorkflowShotOutput } from '../../../services/workflow/domain/types';

interface EpisodeResultPoolPanelProps {
  shots: WorkflowShot[];
  shotOutputs: WorkflowShotOutput[];
  selectedShotId: string | null;
  onSelectShot: (shotId: string) => void;
  onSelectOutput: (outputId: string) => Promise<void> | void;
}

function getShotLabel(shot?: WorkflowShot): string {
  if (!shot) return 'Unknown shot';
  return shot.title?.trim() || `Shot ${shot.shotNumber || 0}`;
}

export const EpisodeResultPoolPanel: React.FC<EpisodeResultPoolPanelProps> = ({
  shots,
  shotOutputs,
  selectedShotId,
  onSelectShot,
  onSelectOutput,
}) => {
  const shotById = useMemo(
    () => new Map(shots.map((shot) => [shot.id, shot])),
    [shots],
  );
  const effectiveOutputs = useMemo(() => {
    const shotIdsWithOutputs = new Set(shotOutputs.map((output) => output.shotId));
    const baselineOutputs = shots
      .filter((shot) => Boolean(shot.imageUrl) && !shotIdsWithOutputs.has(shot.id))
      .map((shot) => ({
        id: `baseline-${shot.id}`,
        shotId: shot.id,
        generationJobId: undefined,
        provider: undefined,
        outputType: 'image',
        label: 'Storyboard frame',
        url: shot.imageUrl!,
        thumbnailUrl: shot.imageUrl,
        metadata: { baseline: true },
        isSelected: true,
        selectedAt: shot.updatedAt,
        workflowInstanceId: shot.workflowInstanceId,
        projectId: shot.projectId,
        createdAt: shot.createdAt,
        updatedAt: shot.updatedAt,
      }));

    return [...baselineOutputs, ...shotOutputs];
  }, [shots, shotOutputs]);

  const visibleOutputs = useMemo(() => {
    if (!selectedShotId) return effectiveOutputs;
    return effectiveOutputs.filter((output) => output.shotId === selectedShotId);
  }, [effectiveOutputs, selectedShotId]);

  const selectedShot = selectedShotId ? shotById.get(selectedShotId) : null;

  return (
    <section className="tianti-surface-muted rounded-[24px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
            <GalleryVerticalEnd className="h-4 w-4 text-cyan-200" />
            Result Pool
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="tianti-chip">Visible outputs {visibleOutputs.length}</span>
          {selectedShot && (
            <span className="tianti-chip is-accent">{getShotLabel(selectedShot)}</span>
          )}
        </div>
      </div>

      {visibleOutputs.length === 0 ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-white/10 bg-black/10 px-4 py-5 text-sm leading-7 text-slate-400">
          No outputs for {selectedShot ? getShotLabel(selectedShot) : 'this episode'} yet.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleOutputs.map((output) => {
            const shot = shotById.get(output.shotId);
            const isImage = output.outputType === 'image';
            const isBaseline = Boolean(output.metadata?.baseline);

            return (
              <article
                key={output.id}
                className={`rounded-[22px] border p-4 ${
                  output.isSelected
                    ? 'border-emerald-400/30 bg-emerald-400/10'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectShot(output.shotId)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-white/40">
                      {getShotLabel(shot)}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">
                      {output.label || output.provider || output.outputType}
                    </div>
                  </div>
                  <span className="tianti-chip">
                    {isImage ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                    {output.outputType}
                  </span>
                </button>

                <div className="mt-4 overflow-hidden rounded-[18px] border border-white/8 bg-black/30">
                  {isImage ? (
                    <img
                      src={output.thumbnailUrl || output.url}
                      alt={output.label || getShotLabel(shot)}
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center text-sm text-slate-500">
                      Video preview
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <a
                    href={output.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-cyan-200 underline-offset-4 hover:underline"
                  >
                    Open source
                  </a>
                  {isBaseline ? (
                    <span className="tianti-chip">Baseline</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onSelectOutput(output.id)}
                      className={`tianti-button px-3 py-2 text-xs ${
                        output.isSelected ? 'tianti-button-primary' : 'tianti-button-secondary'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {output.isSelected ? 'Selected' : 'Select'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
