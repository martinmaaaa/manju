import React from 'react';
import { Card } from '../PagePrimitives';

function formatDuration(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

interface EpisodeWorkspaceOverviewCardProps {
  title: string;
  contextSummary: string;
  lockedAssets: Array<{ id: string; type: string; name: string }>;
  onFocusLockedAsset: (assetId: string) => void;
  completedSlots: number;
  totalSlots: number;
  totalSeconds: number;
  activeShotTitle?: string | null;
  promptRecipeName?: string | null;
  promptRecipeDescription?: string | null;
  skillPackName?: string | null;
  onGoScenes: () => void;
  onGenerateStoryboard: () => void;
  onGenerateVideoPrompt: () => void;
  onApplyPromptPreset: () => void;
  onRunPrimaryVideo: () => void;
  onApplyVideoPreset: () => void;
  onSyncAssets: () => void;
  onRepairLayout: () => void;
  storyboardGenerationLocked: boolean;
  videoPromptGenerationLocked: boolean;
  primaryVideoNodeLocked: boolean;
}

export function EpisodeWorkspaceOverviewCard({
  title,
  contextSummary,
  lockedAssets,
  onFocusLockedAsset,
  completedSlots,
  totalSlots,
  totalSeconds,
  activeShotTitle,
  promptRecipeName,
  promptRecipeDescription,
  skillPackName,
  onGoScenes,
  onGenerateStoryboard,
  onGenerateVideoPrompt,
  onApplyPromptPreset,
  onRunPrimaryVideo,
  onApplyVideoPreset,
  onSyncAssets,
  onRepairLayout,
  storyboardGenerationLocked,
  videoPromptGenerationLocked,
  primaryVideoNodeLocked,
}: EpisodeWorkspaceOverviewCardProps) {
  return (
    <Card eyebrow="单集" title={title}>
      <div className="text-sm leading-7 text-slate-300">
        {contextSummary || '请先运行单集分析，准备好本集工作台。'}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {lockedAssets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => onFocusLockedAsset(asset.id)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.08]"
          >
            {asset.type} · {asset.name}
          </button>
        ))}
        {!lockedAssets.length ? <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400">当前还没有锁定资产</div> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
          分镜 {completedSlots} / {totalSlots} 已成片
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
          当前集时长 {formatDuration(totalSeconds)}
        </div>
        {activeShotTitle ? (
          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-xs text-cyan-100">
            当前分镜：{activeShotTitle}
          </div>
        ) : null}
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">提示词方案</div>
        <div className="mt-2 text-sm font-semibold text-white">{promptRecipeName || '未选择提示词方案'}</div>
        <div className="mt-2 text-sm leading-7 text-slate-300">
          {promptRecipeDescription || '请先在阶段设置里选择提示词方案，再生成视频提示词。'}
        </div>
        {skillPackName ? <div className="mt-2 text-xs leading-6 text-white/55">技能包：{skillPackName}</div> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onGoScenes}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
        >
          查看分切
        </button>
        <button
          type="button"
          disabled={storyboardGenerationLocked}
          onClick={onGenerateStoryboard}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {storyboardGenerationLocked ? '分镜生成中...' : '生成分镜'}
        </button>
        <button
          type="button"
          disabled={videoPromptGenerationLocked}
          onClick={onGenerateVideoPrompt}
          className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {videoPromptGenerationLocked ? '视频提示词生成中...' : '生成视频提示词'}
        </button>
        <button
          type="button"
          onClick={onApplyPromptPreset}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
        >
          应用提示词预设
        </button>
        <button
          type="button"
          disabled={primaryVideoNodeLocked}
          onClick={onRunPrimaryVideo}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {primaryVideoNodeLocked ? '主视频节点运行中...' : '运行主视频节点'}
        </button>
        <button
          type="button"
          onClick={onApplyVideoPreset}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
        >
          应用视频预设
        </button>
        <button
          type="button"
          onClick={onSyncAssets}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
        >
          同步资产与主链
        </button>
        <button
          type="button"
          onClick={onRepairLayout}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
        >
          整理布局
        </button>
      </div>
    </Card>
  );
}
