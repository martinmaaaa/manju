import React from 'react';
import type { CanvasNode, EpisodeShotJob } from '../../../types/workflowApp';
import { Card } from '../PagePrimitives';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function isImageSource(value: string) {
  return /^data:image\/[\w.+-]+;base64,/i.test(value) || /^https?:\/\//i.test(value);
}

function isVideoSource(value: string) {
  return /^data:video\/[\w.+-]+;base64,/i.test(value) || /^https?:\/\//i.test(value);
}

function isAudioSource(value: string) {
  return /^data:audio\/[\w.+-]+;base64,/i.test(value) || /^https?:\/\//i.test(value);
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass = tone === 'success'
    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
    : tone === 'warning'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : 'border-white/10 bg-white/[0.03] text-slate-100';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

interface EpisodeWorkspacePreviewPanelProps {
  previewTitle: string;
  previewValue: string;
  previewNodeType: CanvasNode['type'] | null;
  previewAsyncState: EpisodeShotJob | null;
  previewSummary?: string | null;
  activeShotTitle?: string | null;
  activeShotDurationLabel?: string | null;
  promptReady: boolean;
  imageReferenceCount: number;
  videoReferenceCount: number;
  audioReferenceCount: number;
  syncedAssetCount: number;
  lockedAssetCount: number;
  promptText: string;
  hasAudioReference: boolean;
  connectedAudioReference: string;
  assetReferences: Array<{
    assetId: string;
    versionId: string | null;
    inputKey: string;
    assetName?: string | null;
    assetType?: string | null;
    versionLabel: string;
    versionNumber?: number | null;
  }>;
  recommendedAssets: Array<{ name: string; matched: boolean }>;
  canCancelJob: boolean;
  canRetryJob: boolean;
  canClearShotResult: boolean;
  canConnectRecommendedAssets: boolean;
  canApplyRecommendation: boolean;
  onCancelJob: () => void;
  onRetryJob: () => void;
  onClearShotResult: () => void;
  onConnectRecommendedAssets: () => void;
  onApplyRecommendation: () => void;
}

export function EpisodeWorkspacePreviewPanel({
  previewTitle,
  previewValue,
  previewNodeType,
  previewAsyncState,
  previewSummary,
  activeShotTitle,
  activeShotDurationLabel,
  promptReady,
  imageReferenceCount,
  videoReferenceCount,
  audioReferenceCount,
  syncedAssetCount,
  lockedAssetCount,
  promptText,
  hasAudioReference,
  connectedAudioReference,
  assetReferences,
  recommendedAssets,
  canCancelJob,
  canRetryJob,
  canClearShotResult,
  canConnectRecommendedAssets,
  canApplyRecommendation,
  onCancelJob,
  onRetryJob,
  onClearShotResult,
  onConnectRecommendedAssets,
  onApplyRecommendation,
}: EpisodeWorkspacePreviewPanelProps) {
  const referenceSummary = `${imageReferenceCount} 图 / ${videoReferenceCount} 视 / ${audioReferenceCount} 音`;
  const assetSummary = `${syncedAssetCount} / ${lockedAssetCount}`;
  const promptStatusLabel = promptReady ? '已就绪' : '待生成';

  return (
    <Card eyebrow="预览" title={previewTitle}>
      {isImageSource(previewValue) ? (
        <img src={previewValue} alt={previewTitle} className="h-[280px] w-full rounded-[24px] object-cover" />
      ) : isVideoSource(previewValue) ? (
        <video src={previewValue} controls className="h-[280px] w-full rounded-[24px] bg-black object-cover" />
      ) : previewNodeType === 'audio' && isAudioSource(previewValue) ? (
        <audio src={previewValue} controls className="w-full" />
      ) : (
        <div className="min-h-[280px] whitespace-pre-wrap rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          {previewValue || '请先在画布里选择一个节点，在这里查看详情。'}
        </div>
      )}
      {previewAsyncState ? (
        <div className={cx(
          'mt-4 rounded-2xl border px-4 py-4 text-sm',
          previewAsyncState.status === 'FAILED' || previewAsyncState.status === 'CANCELLED'
            ? 'border-red-400/20 bg-red-400/10 text-red-100'
            : previewAsyncState.status === 'SUCCEEDED'
              ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
              : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
        )}>
          <div className="flex items-center justify-between gap-3">
            <span>{previewAsyncState.phase || previewAsyncState.status}</span>
            <span>
              {typeof previewAsyncState.progress === 'number'
                ? `${previewAsyncState.progress}%`
                : previewAsyncState.status === 'SUCCEEDED'
                  ? '结果已可预览'
                  : '异步任务'}
            </span>
          </div>
          {previewAsyncState.error ? (
            <div className="mt-2 text-xs text-red-100/90">{previewAsyncState.error}</div>
          ) : previewAsyncState.status === 'SUCCEEDED' && !canClearShotResult ? (
            <div className="mt-2 text-xs text-emerald-100/90">当前结果已完成，使用节点上的“存为分镜”即可回写到底部分镜条。</div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="当前分镜" value={activeShotTitle || '未选择'} />
        <StatCard label="镜头时长" value={activeShotDurationLabel || '未定长'} />
        <StatCard label="提示词" value={promptStatusLabel} tone={promptReady ? 'success' : 'warning'} />
        <StatCard label="参考输入" value={referenceSummary} />
        <StatCard label="已锁定资产" value={assetSummary} />
        <StatCard label="推荐资产" value={recommendedAssets.length ? `${recommendedAssets.length} 项` : '暂无'} />
      </div>

      {previewSummary ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          {previewSummary}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">视频提示词</div>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
            {promptText || '先运行视频提示词生成，再准备最终的动态提示词。'}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">音频参考</div>
          {hasAudioReference ? (
            <audio controls src={connectedAudioReference} className="mt-3 w-full" />
          ) : (
            <div className="mt-2 text-sm leading-7 text-slate-300">把音频节点连到视频节点的全能参考槽位后，这里会显示当前接入的音频参考。</div>
          )}
        </div>
      </div>

      {assetReferences.length ? (
        <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-white">
            已连接资产版本
            <span className="ml-2 text-xs font-normal text-white/45">{assetReferences.length} 项</span>
          </summary>
          <div className="mt-3 space-y-2">
            {assetReferences.map((reference) => (
              <div
                key={`${reference.assetId}-${reference.versionId || 'none'}-${reference.inputKey}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-slate-200"
              >
                <div>
                  <div className="font-semibold text-white">{reference.assetName || reference.assetId}</div>
                  <div className="mt-1 text-white/45">
                    {reference.assetType} · {reference.inputKey} · {reference.versionLabel}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/60">
                  {reference.versionNumber ? `V${reference.versionNumber}` : '无版本'}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {recommendedAssets.length ? (
        <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-white">
            推荐资产命中
            <span className="ml-2 text-xs font-normal text-white/45">{recommendedAssets.length} 项</span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendedAssets.map((entry) => (
              <span
                key={entry.name}
                className={cx(
                  'rounded-full border px-3 py-1 text-xs',
                  entry.matched
                    ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                    : 'border-amber-300/25 bg-amber-300/10 text-amber-100',
                )}
              >
                {entry.name}
              </span>
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canCancelJob ? (
          <button
            type="button"
            onClick={onCancelJob}
            className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
          >
            取消排队
          </button>
        ) : null}
        {canRetryJob ? (
          <button
            type="button"
            onClick={onRetryJob}
            className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-black"
          >
            重试当前分镜
          </button>
        ) : null}
        {canClearShotResult ? (
          <button
            type="button"
            onClick={onClearShotResult}
            className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-100"
          >
            清空当前分镜结果
          </button>
        ) : null}
        {canConnectRecommendedAssets ? (
          <button
            type="button"
            onClick={onConnectRecommendedAssets}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-100"
          >
            接入推荐资产
          </button>
        ) : null}
        {canApplyRecommendation ? (
          <button
            type="button"
            onClick={onApplyRecommendation}
            className="rounded-full bg-cyan-300 px-3 py-2 text-xs font-semibold text-black"
          >
            应用推荐到主视频节点
          </button>
        ) : null}
      </div>
    </Card>
  );
}
