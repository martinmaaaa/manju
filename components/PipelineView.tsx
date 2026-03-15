import React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Layers3,
  Loader2,
  Settings,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type { AppNode } from '../types';
import {
  getPipelineStageStatuses,
  getPipelineTemplate,
  hasPipelineNodes,
  PIPELINE_TEMPLATES,
  type PipelineStageStatus,
  type PipelineTemplateId,
} from '../services/workflowTemplates';

interface PipelineViewProps {
  projectTitle: string;
  templateId: PipelineTemplateId;
  nodes: AppNode[];
  isInitializing?: boolean;
  onBackToProjects: () => void;
  onOpenCanvas: () => void;
  onOpenSettings: () => void;
  onInitializePipeline: () => void;
  onSelectTemplate: (templateId: PipelineTemplateId) => void;
}

const templateIcons: Record<PipelineTemplateId, React.ComponentType<{ className?: string }>> = {
  'short-drama-standard': Layers3,
  'character-first': Users,
  'storyboard-direct': Clapperboard,
};

const stageIcons: Record<PipelineStageStatus['id'], React.ComponentType<{ className?: string }>> = {
  script: Sparkles,
  character: Users,
  storyboard: Clapperboard,
  prompt: Wand2,
  video: CheckCircle2,
};

const stageStateStyles: Record<PipelineStageStatus['state'], string> = {
  not_started: 'border-white/10 bg-white/[0.03] text-slate-300',
  in_progress: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-50',
};

const stageStateLabels: Record<PipelineStageStatus['state'], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
};

export const PipelineView: React.FC<PipelineViewProps> = ({
  projectTitle,
  templateId,
  nodes,
  isInitializing = false,
  onBackToProjects,
  onOpenCanvas,
  onOpenSettings,
  onInitializePipeline,
  onSelectTemplate,
}) => {
  const template = getPipelineTemplate(templateId);
  const stageStatuses = getPipelineStageStatuses(nodes, templateId);
  const initialized = hasPipelineNodes(nodes);
  const canInitialize = !isInitializing && nodes.length === 0;
  const nextStage = stageStatuses.find(stage => stage.state !== 'completed');

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a0a0c] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.14),_transparent_30%)] pointer-events-none" />
      <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0c]/85 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBackToProjects}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                <ArrowLeft size={16} />
                返回项目
              </button>
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">固定工作流</div>
                <h1 className="mt-1 text-2xl font-semibold text-white">{projectTitle || '未命名项目'}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                <Settings size={16} />
                系统设置
              </button>
              <button
                type="button"
                onClick={onOpenCanvas}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-5 py-2.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/20"
              >
                进入高级模式
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-8 py-10">
          <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">默认入口</div>
              <h2 className="mt-3 text-3xl font-semibold leading-tight">
                先走固定流程，再按需进入画布高级模式
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
                现在项目默认先看阶段化工作流，不再要求你手工连线。内部依然复用原来的节点与画布能力，
                只是在产品入口层把“剧本 → 人物资产 → 分镜 → 提示词 → 视频”固化了。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!canInitialize || initialized}
                  onClick={onInitializePipeline}
                  className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isInitializing && <Loader2 size={16} className="animate-spin" />}
                  {initialized ? '固定流程已创建' : '一键生成固定流程'}
                </button>
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                  {nextStage ? `当前建议：先推进「${nextStage.title}」阶段` : '五个阶段都已具备产出'}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.22em] text-white/45">当前模板</div>
              <h3 className="mt-3 text-2xl font-semibold">{template.name}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{template.summary}</p>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-slate-300">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">适用场景</div>
                <div className="mt-2">{template.recommendedFor}</div>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/45">模板选择</div>
            <div className="grid gap-4 lg:grid-cols-3">
              {PIPELINE_TEMPLATES.map((item) => {
                const Icon = templateIcons[item.id];
                const selected = item.id === templateId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={initialized}
                    onClick={() => onSelectTemplate(item.id)}
                    className={`rounded-[24px] border p-6 text-left transition ${
                      selected
                        ? 'border-cyan-500/40 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-2xl p-3 ${selected ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-slate-300'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-lg font-semibold">{item.name}</div>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-300">{item.summary}</p>
                    <div className="mt-4 text-xs leading-6 text-white/45">{item.recommendedFor}</div>
                    {initialized && selected && (
                      <div className="mt-4 text-xs text-cyan-200/80">当前项目已按此模板初始化</div>
                    )}
                    {initialized && !selected && (
                      <div className="mt-4 text-xs text-white/40">当前项目已有流程图，切换模板建议新建项目</div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/45">阶段总览</div>
            <div className="grid gap-4 lg:grid-cols-5">
              {stageStatuses.map((stage) => {
                const Icon = stageIcons[stage.id];

                return (
                  <div
                    key={stage.id}
                    className={`rounded-[24px] border p-5 backdrop-blur-xl ${stageStateStyles[stage.state]}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="rounded-2xl bg-black/20 p-3">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full border border-current/15 bg-black/15 px-3 py-1 text-[11px] tracking-[0.16em]">
                        {stageStateLabels[stage.state]}
                      </span>
                    </div>
                    <div className="mt-5 text-lg font-semibold">{stage.title}</div>
                    <p className="mt-2 text-sm leading-6 text-inherit/80">{stage.summary}</p>
                    <div className="mt-4 text-xs leading-6 text-inherit/70">产出：{stage.deliverable}</div>
                    <div className="mt-2 text-xs leading-6 text-inherit/70">内部节点数：{stage.nodeCount}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">当前说明</div>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300">
                <div className="font-medium text-white">这个模式已经解决的事</div>
                <div className="mt-3">
                  默认先看流程，不再从空白画布开始；内部节点和连接自动生成；后续仍然保留高级模式做微调和调试。
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-slate-300">
                <div className="font-medium text-white">这一步还没有强行覆盖的事</div>
                <div className="mt-3">
                  现有各阶段的具体表单和自动串联逻辑仍复用原节点能力，所以更细的阶段化交互我会继续往下拆。
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
