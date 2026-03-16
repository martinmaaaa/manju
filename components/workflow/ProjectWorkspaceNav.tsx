import React from 'react';
import { Clapperboard, Layers3, LayoutTemplate, Package2, Sparkles } from 'lucide-react';
import type { AppView } from '../../stores/ui.store';

type ProjectWorkspaceView = Extract<AppView, 'pipeline' | 'assets' | 'episodes' | 'workspace' | 'canvas'>;

interface ProjectWorkspaceNavProps {
  currentView: ProjectWorkspaceView;
  onChange: (view: ProjectWorkspaceView) => void;
  hasActiveEpisode: boolean;
}

const primaryItems: Array<{
  view: Extract<ProjectWorkspaceView, 'pipeline' | 'assets' | 'episodes' | 'workspace'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { view: 'pipeline', label: '工作流', icon: Sparkles },
  { view: 'assets', label: '资产', icon: Package2 },
  { view: 'episodes', label: '剧集', icon: Clapperboard },
  { view: 'workspace', label: '单集工作区', icon: Layers3 },
];

export const ProjectWorkspaceNav: React.FC<ProjectWorkspaceNavProps> = ({
  currentView,
  onChange,
  hasActiveEpisode,
}) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="tianti-nav-group">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        const isDisabled = item.view === 'workspace' && !hasActiveEpisode;
        const isActive = currentView === item.view;

        return (
          <button
            key={item.view}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(item.view)}
            className={`tianti-nav-pill text-sm ${isActive ? 'is-active' : ''} ${
              isDisabled ? 'cursor-not-allowed opacity-40' : ''
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>

    <button
      type="button"
      onClick={() => onChange('canvas')}
      className={`tianti-button px-4 py-3 text-sm ${
        currentView === 'canvas'
          ? 'tianti-button-ghost border-cyan-400/20 bg-cyan-400/12 text-cyan-50'
          : 'tianti-button-ghost'
      }`}
    >
      <LayoutTemplate className="h-4 w-4" />
      高级画布
    </button>
  </div>
);
