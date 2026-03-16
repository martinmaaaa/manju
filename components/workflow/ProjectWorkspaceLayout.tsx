import React from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { ProjectWorkspaceNav } from './ProjectWorkspaceNav';
import type { AppView } from '../../stores/ui.store';

type ProjectWorkspaceView = Extract<AppView, 'pipeline' | 'assets' | 'episodes' | 'jobs' | 'workspace' | 'canvas'>;

interface ProjectWorkspaceLayoutProps {
  projectTitle: string;
  currentView: ProjectWorkspaceView;
  hasActiveEpisode: boolean;
  sectionLabel: string;
  sectionDescription: string;
  onChangeView: (view: ProjectWorkspaceView) => void;
  onBackToProjects: () => void;
  onOpenSettings: () => void;
  children: React.ReactNode;
}

export const ProjectWorkspaceLayout: React.FC<ProjectWorkspaceLayoutProps> = ({
  projectTitle,
  currentView,
  hasActiveEpisode,
  sectionLabel,
  sectionDescription,
  onChangeView,
  onBackToProjects,
  onOpenSettings,
  children,
}) => (
  <div className="tianti-shell">
    <div className="relative flex h-screen flex-col overflow-hidden">
      <div className="tianti-shell-header">
        <div className="tianti-shell-container px-6 py-5 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={onBackToProjects}
                className="tianti-button tianti-button-secondary px-4 py-2 text-sm"
              >
                <ArrowLeft size={16} />
                返回项目
              </button>

              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
                  {sectionLabel}
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
                  {projectTitle || '未命名项目'}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  {sectionDescription}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              className="tianti-button tianti-button-secondary self-start px-4 py-2 text-sm"
            >
              <Settings size={16} />
              系统设置
            </button>
          </div>

          <div className="mt-5">
            <ProjectWorkspaceNav
              currentView={currentView}
              onChange={onChangeView}
              hasActiveEpisode={hasActiveEpisode}
            />
          </div>
        </div>
      </div>

      <main className="tianti-shell-container relative flex-1 overflow-y-auto px-6 py-8 lg:px-8">
        {children}
      </main>
    </div>
  </div>
);
