import { describe, expect, it } from 'vitest';
import type { CanvasNode, Episode, EpisodeContext, EpisodeShotStrip } from '../../../types/workflowApp';
import {
  appendManualEpisodeShotSlot,
  buildEpisodeShotClip,
  buildEpisodeShotStrip,
  deleteEpisodeShotSlot,
  findSelectedEpisodeShot,
  formatShotDurationLabel,
  getEpisodeShotStripTotalSeconds,
  normalizeEpisodeShotStrip,
  renameEpisodeShotSlot,
  reorderEpisodeShotSlot,
  saveClipToEpisodeShotStrip,
  selectEpisodeShotSlot,
  upsertEpisodeShotJob,
} from './episodeShotStripHelpers';

const episode: Episode = {
  id: 'ep-1',
  projectId: 'project-1',
  episodeNumber: 1,
  title: '第一集',
  synopsis: '女主夜入庭院。',
  sourceText: '镜头一：长廊。镜头二：庭院。',
  status: 'draft',
  metadata: {},
  createdAt: '2026-03-18T00:00:00.000Z',
  updatedAt: '2026-03-18T00:00:00.000Z',
};

const episodeContext: EpisodeContext = {
  episodeId: 'ep-1',
  projectId: 'project-1',
  contextSummary: '庭院夜戏。',
  precedingSummary: '',
  content: {
    storyboardBeats: ['长廊推进，人物走入画面。', '庭院停步，人物回望。'],
  },
  updatedAt: '2026-03-18T00:00:00.000Z',
};

describe('episodeShotStripHelpers', () => {
  it('builds storyboard-backed slots and keeps first slot selected', () => {
    const strip = buildEpisodeShotStrip({
      episode,
      episodeContext,
      storyboardText: '',
      videoPromptText: '第一段视频提示词。\n\n第二段视频提示词。',
    });

    expect(strip.selectedShotId).toBe('ep-1-shot-1');
    expect(strip.slots).toHaveLength(2);
    expect(strip.slots[0]).toMatchObject({
      id: 'ep-1-shot-1',
      source: 'storyboard',
      title: '镜头1',
      summary: '长廊推进，人物走入画面。',
      promptText: '第一段视频提示词。',
      durationLabel: formatShotDurationLabel(4),
      clip: null,
    });
    expect(strip.slots.map((slot) => [slot.id, slot.startSeconds, slot.endSeconds])).toEqual([
      ['ep-1-shot-1', 0, 4],
      ['ep-1-shot-2', 4, 9],
    ]);
  });

  it('preserves existing clips and manual slots while refreshing storyboard slots', () => {
    const currentStrip: EpisodeShotStrip = {
      selectedShotId: 'manual-shot',
      slots: [
        {
          id: 'ep-1-shot-1',
          source: 'storyboard',
          title: '镜头1',
          summary: '旧摘要',
          promptText: '旧提示词',
          order: 0,
          durationLabel: '00:05',
          clip: {
            videoUrl: 'https://cdn.example.com/shot-1.mp4',
            sourceNodeId: 'video-1',
            savedAt: '2026-03-18T00:00:00.000Z',
            modelId: 'seedance-2.0@bendi',
            promptText: '旧提示词',
          },
        },
        {
          id: 'manual-shot',
          source: 'manual',
          title: '补充镜头1',
          summary: '补充镜头',
          promptText: '手动提示词',
          order: 1,
          durationLabel: '5s',
          clip: null,
        },
      ],
    };

    const strip = buildEpisodeShotStrip({
      episode,
      episodeContext,
      storyboardText: '',
      videoPromptText: '第一段视频提示词。\n\n第二段视频提示词。',
      currentStrip,
    });

    expect(strip.selectedShotId).toBe('manual-shot');
    expect(strip.slots.map((slot) => slot.id)).toEqual(['ep-1-shot-1', 'manual-shot', 'ep-1-shot-2']);
    expect(strip.slots[0].clip?.videoUrl).toBe('https://cdn.example.com/shot-1.mp4');
    expect(strip.slots[2].order).toBe(2);
  });

  it('adds manual slots and saves clips onto the selected slot', () => {
    const baseStrip = buildEpisodeShotStrip({
      episode,
      episodeContext,
      storyboardText: '',
      videoPromptText: '',
    });
    const withManual = appendManualEpisodeShotSlot(baseStrip);
    const selected = findSelectedEpisodeShot(withManual);

    expect(selected?.source).toBe('manual');

    const node: CanvasNode = {
      id: 'video-node-1',
      type: 'video',
      title: '视频生成',
      x: 0,
      y: 0,
      width: 300,
      height: 220,
      content: 'https://cdn.example.com/current.mp4',
      modelId: 'seedance-2.0@bendi',
    };
    const clip = buildEpisodeShotClip({
      slot: selected!,
      node,
      videoUrl: 'https://cdn.example.com/current.mp4',
      fallbackPromptText: '手动提示词',
    });
    const savedStrip = saveClipToEpisodeShotStrip({
      strip: withManual,
      clip,
    });

    expect(findSelectedEpisodeShot(savedStrip)?.clip?.videoUrl).toBe('https://cdn.example.com/current.mp4');

    const switched = selectEpisodeShotSlot(savedStrip, 'ep-1-shot-1');
    expect(switched.selectedShotId).toBe('ep-1-shot-1');
  });

  it('supports renaming, deleting, reordering, and job updates', () => {
    const baseStrip = buildEpisodeShotStrip({
      episode,
      episodeContext,
      storyboardText: '',
      videoPromptText: '',
    });

    const renamed = renameEpisodeShotSlot(baseStrip, 'ep-1-shot-1', '开场镜头');
    expect(renamed.slots[0].title).toBe('开场镜头');

    const reordered = reorderEpisodeShotSlot({
      strip: renamed,
      fromShotId: 'ep-1-shot-2',
      toShotId: 'ep-1-shot-1',
    });
    expect(reordered.slots.map((slot) => slot.id)).toEqual(['ep-1-shot-2', 'ep-1-shot-1']);

    const withJob = upsertEpisodeShotJob({
      strip: reordered,
      targetShotId: 'ep-1-shot-2',
      job: {
        sourceNodeId: 'video-1',
        providerJobId: 'job-1',
        status: 'RUNNING',
        phase: '排队中',
        progress: 12,
        updatedAt: '2026-03-18T00:00:00.000Z',
      },
    });
    expect(withJob.slots[0].job?.providerJobId).toBe('job-1');

    const deleted = deleteEpisodeShotSlot(withJob, 'ep-1-shot-2');
    expect(deleted.slots.map((slot) => slot.id)).toEqual(['ep-1-shot-1']);
    expect(deleted.removedSlotIds).toContain('ep-1-shot-2');

    const rebuilt = buildEpisodeShotStrip({
      episode,
      episodeContext,
      storyboardText: '',
      videoPromptText: '',
      currentStrip: deleted,
    });
    expect(rebuilt.slots.map((slot) => slot.id)).toEqual(['ep-1-shot-1']);
  });

  it('prefers structured storyboard shots when skill output is available', () => {
    const strip = buildEpisodeShotStrip({
      episode,
      episodeContext: {
        ...episodeContext,
        content: {
          storyboardShots: [
            {
              title: '开场镜头',
              summary: '雨夜长廊，人物缓步进入画面。',
              promptText: '写实古风，长廊雨夜，人物缓步进入画面。',
              durationLabel: '00:06',
              recommendedModelId: 'seedance-2.0@bendi',
              recommendedModeId: 'all_references',
              referenceAssetNames: ['tai-zi', 'gong-lang'],
            },
          ],
        },
      },
      storyboardText: '',
      videoPromptText: '',
    });

    expect(strip.slots).toHaveLength(1);
    expect(strip.slots[0]).toMatchObject({
      title: '开场镜头',
      summary: '雨夜长廊，人物缓步进入画面。',
      promptText: '写实古风，长廊雨夜，人物缓步进入画面。',
      durationLabel: '00:06',
      recommendedModelId: 'seedance-2.0@bendi',
      recommendedModeId: 'all_references',
      referenceAssetNames: ['tai-zi', 'gong-lang'],
    });
  });

  it('normalizes strip timeline metadata and reports total seconds', () => {
    const strip = normalizeEpisodeShotStrip({
      selectedShotId: 'shot-2',
      slots: [
        {
          id: 'shot-1',
          source: 'storyboard',
          title: '镜头1',
          summary: '镜头1',
          promptText: '镜头1',
          order: 0,
          durationLabel: '00:03',
          clip: null,
        },
        {
          id: 'shot-2',
          source: 'storyboard',
          title: '镜头2',
          summary: '镜头2',
          promptText: '镜头2',
          order: 1,
          durationLabel: '00:05',
          clip: null,
        },
      ],
    });

    expect(strip.slots.map((slot) => [slot.id, slot.startSeconds, slot.endSeconds])).toEqual([
      ['shot-1', 0, 3],
      ['shot-2', 3, 8],
    ]);
    expect(getEpisodeShotStripTotalSeconds(strip)).toBe(8);
  });
});
