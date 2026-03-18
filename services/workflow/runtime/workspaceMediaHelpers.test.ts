import { describe, expect, it } from 'vitest';
import type { EpisodeWorkspace } from '../../../types/workflowApp';
import {
  collectEpisodeWorkspaceVideoInputs,
  isAudioSource,
} from './workspaceMediaHelpers';

const workspace: EpisodeWorkspace = {
  episodeId: 'episode-1',
  projectId: 'project-1',
  updatedAt: new Date().toISOString(),
  content: {
    nodes: [
      {
        id: 'prompt-1',
        type: 'text',
        title: '视频提示词',
        x: 0,
        y: 0,
        width: 300,
        height: 220,
        content: '镜头沿着宫殿长廊推进，人物停步回望。',
      },
      {
        id: 'visual-1',
        type: 'image',
        title: '场景参考',
        x: 320,
        y: 0,
        width: 300,
        height: 240,
        content: 'https://cdn.example.com/scene-a.png',
      },
      {
        id: 'audio-1',
        type: 'audio',
        title: '音频参考',
        x: 640,
        y: 0,
        width: 300,
        height: 240,
        content: 'https://cdn.example.com/audio-reference.mp3',
      },
      {
        id: 'audio-2',
        type: 'audio',
        title: '旧 data uri',
        x: 960,
        y: 0,
        width: 300,
        height: 240,
        content: 'data:audio/mp3;base64,ZmFrZS1hdWRpbw==',
      },
    ],
  },
};

describe('workspaceMediaHelpers', () => {
  it('detects audio sources from data uri and remote url', () => {
    expect(isAudioSource('data:audio/mp3;base64,ZmFrZS1hdWRpbw==')).toBe(true);
    expect(isAudioSource('https://cdn.example.com/audio-reference.mp3')).toBe(true);
    expect(isAudioSource('音频说明文本')).toBe(false);
  });

  it('collects prompt, image urls, and remote audio references for video generation', () => {
    expect(collectEpisodeWorkspaceVideoInputs(workspace)).toEqual({
      prompt: '镜头沿着宫殿长廊推进，人物停步回望。',
      imageUrls: ['https://cdn.example.com/scene-a.png'],
      audioReferenceUrls: ['https://cdn.example.com/audio-reference.mp3'],
    });
  });

  it('falls back to empty video-generation inputs when workspace is missing', () => {
    expect(collectEpisodeWorkspaceVideoInputs(null)).toEqual({
      prompt: '',
      imageUrls: [],
      audioReferenceUrls: [],
    });
  });
});
