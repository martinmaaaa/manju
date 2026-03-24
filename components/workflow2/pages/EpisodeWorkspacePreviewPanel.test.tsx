import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EpisodeWorkspacePreviewPanel } from './EpisodeWorkspacePreviewPanel';

function renderPanel(overrides?: Partial<React.ComponentProps<typeof EpisodeWorkspacePreviewPanel>>) {
  return render(
    <EpisodeWorkspacePreviewPanel
      previewTitle="主视频预览"
      previewValue="https://example.com/video.mp4"
      previewNodeType="video"
      previewAsyncState={null}
      previewSummary="这是当前镜头摘要。"
      activeShotTitle="镜头 1"
      activeShotDurationLabel="6s"
      promptReady
      imageReferenceCount={2}
      videoReferenceCount={1}
      audioReferenceCount={1}
      syncedAssetCount={3}
      lockedAssetCount={5}
      promptText="生成一个快速推进的镜头。"
      hasAudioReference
      connectedAudioReference="https://example.com/audio.mp3"
      assetReferences={[
        {
          assetId: 'asset-1',
          versionId: 'v1',
          inputKey: 'character',
          assetName: '主角',
          assetType: '角色',
          versionLabel: '已锁定版本',
          versionNumber: 1,
        },
      ]}
      recommendedAssets={[
        { name: '主角', matched: true },
        { name: '场景 A', matched: false },
      ]}
      canCancelJob={false}
      canRetryJob
      canClearShotResult
      canConnectRecommendedAssets
      canApplyRecommendation
      onCancelJob={vi.fn()}
      onRetryJob={vi.fn()}
      onClearShotResult={vi.fn()}
      onConnectRecommendedAssets={vi.fn()}
      onApplyRecommendation={vi.fn()}
      {...overrides}
    />,
  );
}

describe('EpisodeWorkspacePreviewPanel', () => {
  it('renders compact stat cards and collapsible asset sections', () => {
    renderPanel();

    expect(screen.getByText('当前分镜')).toBeTruthy();
    expect(screen.getByText('参考输入')).toBeTruthy();
    expect(screen.getByText('推荐资产')).toBeTruthy();
    expect(screen.getByText('已连接资产版本')).toBeTruthy();
    expect(screen.getByText('推荐资产命中')).toBeTruthy();
    expect(screen.getByText('镜头 1')).toBeTruthy();
    expect(screen.getByText('2 图 / 1 视 / 1 音')).toBeTruthy();
  });

  it('shows fallback guidance when prompt and audio reference are not ready', () => {
    renderPanel({
      promptReady: false,
      promptText: '',
      hasAudioReference: false,
      connectedAudioReference: '',
      assetReferences: [],
      recommendedAssets: [],
    });

    expect(screen.getByText('待生成')).toBeTruthy();
    expect(screen.getByText('先运行视频提示词生成，再准备最终的动态提示词。')).toBeTruthy();
    expect(screen.getByText('把音频节点连到视频节点的全能参考槽位后，这里会显示当前接入的音频参考。')).toBeTruthy();
  });
});
