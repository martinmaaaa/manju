import React from 'react';
import {
  BookOpen,
  Clapperboard,
  Film,
  Package2,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type { WorkflowInstance } from '../../services/workflow/domain/types';

const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'series-bible': BookOpen,
  'character-assets': Users,
  'scene-assets': Clapperboard,
  'prop-assets': Package2,
  'episode-plan': Sparkles,
  'episode-script': BookOpen,
  'episode-assets': Users,
  storyboard: Clapperboard,
  prompt: Wand2,
  video: Film,
};

interface SeriesStageRailProps {
  stageStates: WorkflowInstance['stageStates'];
  stageTitleMap: Record<string, string>;
}

export const SeriesStageRail: React.FC<SeriesStageRailProps> = ({
  stageStates,
  stageTitleMap,
}) => (
  <section className="tianti-surface-muted mt-8 rounded-[24px] p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">系列阶段轨道</div>
        <div className="mt-2 text-sm leading-7 text-slate-300">
          把整套漫剧的系列级阶段拉成一条可巡检的工作轨道，方便快速定位卡点和当前推进位置。
        </div>
      </div>
      <div className="text-xs text-slate-400">共 {Object.keys(stageStates).length} 个系列阶段</div>
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-5">
      {Object.entries(stageStates).map(([stageId, stage]) => {
        const Icon = stageIcons[stageId] ?? Sparkles;

        return (
          <div key={stageId} className="tianti-surface rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-2xl bg-white/5 p-3 text-cyan-200">
                <Icon className="h-5 w-5" />
              </div>
              <span className="tianti-chip">
                {stage.status}
              </span>
            </div>
            <div className="mt-4 text-sm font-semibold text-white">{stageTitleMap[stageId] ?? stageId}</div>
          </div>
        );
      })}
    </div>
  </section>
);
