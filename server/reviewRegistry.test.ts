import { describe, expect, it } from 'vitest';
import {
  evaluateReviewPoliciesWithRegistry,
  evaluateReviewProfileConfig,
  getReviewPolicy,
  getReviewProfile,
  getReviewRule,
  resolveReviewPolicyProfile,
} from './reviewRegistry.js';

describe('reviewRegistry', () => {
  it('resolves stage-specific profiles from policy registry', () => {
    const policy = getReviewPolicy('business-review');
    const profile = resolveReviewPolicyProfile(policy, 'episode_expand');

    expect(profile?.id).toBe('business-episode-expand-v1');
  });

  it('evaluates business episode expand profile against nested output payload', () => {
    const profile = getReviewProfile('business-episode-expand-v1');
    const result = evaluateReviewProfileConfig({
      policyId: 'business-review',
      profile,
      outputPayload: {
        episodeContext: {
          contextSummary: '当前单集围绕替嫁首夜、身份危机与王府权谋关系展开，并明确下一步冲突。',
          storyboardBeats: ['镜头 1：进入王府。'],
        },
      },
    });

    expect(result.passed).toBe(true);
  });

  it('evaluates compliance blocklist rules from registry', () => {
    const rule = getReviewRule('compliance-blocklist-core');
    expect(rule?.blockedTerms?.length).toBeGreaterThan(0);

    const results = evaluateReviewPoliciesWithRegistry({
      reviewPolicyIds: ['compliance-review'],
      stageKind: 'video_prompt_generate',
      outputPayload: {
        prompt: '这里出现血腥暴力镜头',
      },
    });

    expect(results[0]?.passed).toBe(false);
  });
});
