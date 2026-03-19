import { describe, expect, it } from 'vitest';
import {
  applySkillArtifactBindings,
  evaluateSkillReviewPolicies,
  getSkillSchema,
  normalizeSkillOutputWithContract,
  renderSkillPromptBlocks,
} from './skillSchemas.js';

describe('skillSchemas', () => {
  it('renders storyboard schema prompt blocks from structured values', () => {
    const schema = getSkillSchema('seedance-storyboard-core-v1');
    const blocks = renderSkillPromptBlocks(schema, {
      projectTitle: '替嫁王妃',
      episodeTitle: '第 1 集',
      episodeContextSummary: '女主被迫替嫁入王府，并在首夜卷入新的冲突。',
      promptRecipeName: '电影感',
      promptRecipeDescription: '强调镜头语言与构图。',
      skillMethodology: '先拆 beat，再拆 shot，最后收敛提示词。',
    });

    expect(blocks.some((item) => item.includes('项目标题：替嫁王妃'))).toBe(true);
    expect(blocks.some((item) => item.includes('提示词配方：电影感'))).toBe(true);
  });

  it('normalizes storyboard outputs with contract-backed fallback', () => {
    const schema = getSkillSchema('seedance-storyboard-core-v1');
    const fallback = {
      prompt: 'fallback prompt',
      beatSheet: ['镜头 1：建立空间与人物关系。'],
      voicePrompt: 'fallback voice',
      shots: [
        {
          title: '镜头1',
          summary: '建立空间',
          promptText: 'fallback shot prompt',
          durationLabel: '00:05',
        },
      ],
    };

    const normalized = normalizeSkillOutputWithContract({
      schema,
      raw: {
        prompt: '正式 prompt',
        beatSheet: ['镜头 1：推进冲突。'],
      },
      fallback,
    });

    expect(normalized.prompt).toBe('正式 prompt');
    expect(normalized.voicePrompt).toBe('fallback voice');
    expect(normalized.shots[0].title).toBe('镜头1');
  });

  it('applies artifact bindings to workspace and episode context targets', () => {
    const schema = getSkillSchema('seedance-storyboard-core-v1');
    const artifacts = applySkillArtifactBindings(schema?.artifactBindings, {
      beatSheet: ['镜头 1：建立空间。', '镜头 2：推进冲突。'],
      shots: [{ title: '镜头1', summary: '建立空间', promptText: 'prompt', durationLabel: '00:05' }],
      prompt: '完整视频提示词',
    });

    expect(artifacts.workspaceNodeValues.prompt).toBe('完整视频提示词');
    expect(String(artifacts.workspaceNodeValues.storyboard || '')).toContain('镜头 1：建立空间。');
    expect(Array.isArray(artifacts.episodeContextValues.storyboardShots)).toBe(true);
  });

  it('builds episode expand artifacts for both episode context record and workspace seed', () => {
    const schema = getSkillSchema('seedance-episode-expand-core-v1');
    const artifacts = applySkillArtifactBindings(schema?.artifactBindings, {
      contextSummary: '当前单集围绕替嫁首夜与身份危机展开。',
      precedingSummary: '上一集完成替嫁。',
      storyboardBeats: ['镜头 1：进入王府。', '镜头 2：身份危机升级。'],
      worldState: {
        storyBibleTitle: '替嫁王妃',
        styleSummary: '古风、压抑、宫廷权谋',
        targetMedium: '短剧',
      },
      continuityState: {
        lockedAssetIds: ['asset_1'],
        previousEpisodeCount: 1,
      },
      shots: [{ title: '镜头1', summary: '进入王府', promptText: 'shot prompt', durationLabel: '00:05' }],
    });

    expect(artifacts.episodeContextRecordValues.contextSummary).toContain('替嫁');
    expect(Array.isArray(artifacts.episodeContextValues.storyboardShots)).toBe(true);
    expect(String(artifacts.workspaceNodeValues.storyboard || '')).toContain('镜头 1：进入王府。');
  });

  it('normalizes image prompt schema output with prompt fallback', () => {
    const schema = getSkillSchema('seedance-image-prompt-core-v1');
    const normalized = normalizeSkillOutputWithContract({
      schema,
      raw: {},
      fallback: {
        prompt: '古风冷色调，雨夜长廊，人物正面中近景，服饰细节清晰。',
      },
    });

    expect(normalized.prompt).toContain('雨夜长廊');
  });

  it('evaluates director schema review profiles against run output shape', () => {
    const schema = getSkillSchema('seedance-director-core-v1');
    const reviews = evaluateSkillReviewPolicies({
      reviewPolicyIds: ['business-review', 'compliance-review'],
      outputPayload: {
        storyBible: {
          title: '替嫁王妃',
          episodes: [{ episodeNumber: 1, title: '第 1 集' }],
        },
      },
      schema,
    });

    expect(reviews.every((item) => item.passed)).toBe(true);
  });

  it('loads skill schemas from file resources', () => {
    const schema = getSkillSchema('seedance-storyboard-core-v1');
    expect(schema?.sourcePath).toContain('/schemas/seedance-storyboard-core-v1.json');
  });
});
