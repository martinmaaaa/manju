function asString(value) {
  return String(value || '').trim();
}

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getValueAtPath(source, path) {
  if (!path || path === '$output') {
    return source;
  }

  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);
}

function fallbackReviewNotes(policyId) {
  if (policyId === 'business-review') {
    return {
      success: '业务审查通过，当前产物满足继续推进的基本交付要求。',
      failure: '业务审查未通过，当前产物还缺少继续推进所需的关键内容。',
    };
  }

  if (policyId === 'compliance-review') {
    return {
      success: '合规审查通过，当前产物未命中显式风险词。',
      failurePrefix: '合规审查命中敏感内容：',
    };
  }

  return {
    success: `${policyId} 通过`,
    failure: `${policyId} 未通过`,
  };
}

export const REVIEW_RULES = [
  {
    id: 'business-script-story-bible-title',
    type: 'required_string',
    field: 'storyBible.title',
    minLength: 1,
    description: '剧本拆解结果必须包含故事标题。',
  },
  {
    id: 'business-script-episodes',
    type: 'min_array_length',
    field: 'storyBible.episodes',
    min: 1,
    description: '剧本拆解结果必须产出至少一集的剧集壳子。',
  },
  {
    id: 'business-asset-assets',
    type: 'min_array_length',
    field: 'assets',
    min: 1,
    description: '资产设计结果必须至少产出一个结构化资产。',
  },
  {
    id: 'business-image-prompt-text',
    type: 'required_string',
    field: 'prompt',
    minLength: 40,
    description: '图片提示词结果必须具备足够细节，才能进入出图阶段。',
  },
  {
    id: 'business-episode-context-summary',
    type: 'required_string',
    field: 'episodeContext.contextSummary',
    minLength: 20,
    description: '单集扩写结果必须包含足够完整的上下文摘要。',
  },
  {
    id: 'business-episode-storyboard-beats',
    type: 'min_array_length',
    field: 'episodeContext.storyboardBeats',
    min: 1,
    description: '单集扩写结果必须产出至少一条分镜节拍。',
  },
  {
    id: 'business-video-prompt-main-prompt',
    type: 'required_string',
    field: 'prompt',
    minLength: 80,
    description: '视频提示词必须具备足够细节。',
  },
  {
    id: 'business-video-prompt-voice',
    type: 'required_string',
    field: 'voicePrompt',
    minLength: 30,
    description: '配音提示词必须具备基本可用性。',
  },
  {
    id: 'business-video-prompt-beats',
    type: 'min_array_length',
    field: 'beatSheet',
    min: 1,
    description: '视频提示词阶段必须至少产出一个分镜节拍。',
  },
  {
    id: 'business-video-preview',
    type: 'truthy',
    field: 'previewUrl',
    description: '视频生成结果必须包含可预览的视频地址。',
  },
  {
    id: 'compliance-blocklist-core',
    type: 'blocklist',
    blockedTerms: ['血腥暴力', '极端政治', '违法毒品', '未成年人不当内容'],
    description: '检查产物中是否包含显式的敏感或违规词。',
  },
];

export const REVIEW_PROFILES = [
  {
    id: 'business-script-decompose-v1',
    strategy: 'all',
    ruleIds: ['business-script-story-bible-title', 'business-script-episodes'],
    successMessage: '剧本拆解结果满足继续推进的基础要求。',
    failureMessage: '剧本拆解结果还缺少标题或剧集壳子，不能直接进入下一阶段。',
  },
  {
    id: 'business-asset-design-v1',
    strategy: 'all',
    ruleIds: ['business-asset-assets'],
    successMessage: '资产设计结果满足继续推进的基础要求。',
    failureMessage: '资产设计结果为空，无法继续推进到素材生产。',
  },
  {
    id: 'business-image-prompt-v1',
    strategy: 'all',
    ruleIds: ['business-image-prompt-text'],
    successMessage: '图片提示词结果满足继续推进的基础要求。',
    failureMessage: '图片提示词结果不够完整，暂时不能直接进入出图阶段。',
  },
  {
    id: 'business-episode-expand-v1',
    strategy: 'all',
    ruleIds: ['business-episode-context-summary', 'business-episode-storyboard-beats'],
    successMessage: '单集扩写结果满足继续推进的基础要求。',
    failureMessage: '单集扩写结果缺少上下文摘要或分镜节拍，不能直接进入分镜阶段。',
  },
  {
    id: 'business-video-prompt-v1',
    strategy: 'any',
    ruleIds: ['business-video-prompt-main-prompt', 'business-video-prompt-voice', 'business-video-prompt-beats'],
    successMessage: '视频提示词结果满足继续推进的基础要求。',
    failureMessage: '视频提示词结果缺少足够可用的提示词或节拍信息。',
  },
  {
    id: 'business-video-generate-v1',
    strategy: 'all',
    ruleIds: ['business-video-preview'],
    successMessage: '视频生成结果已产出可预览内容。',
    failureMessage: '视频生成结果未返回可预览内容。',
  },
  {
    id: 'compliance-default-v1',
    strategy: 'blocklist',
    ruleIds: ['compliance-blocklist-core'],
    successMessage: '合规审查通过，当前产物未命中显式风险词。',
    failureMessagePrefix: '合规审查命中敏感内容：',
  },
];

export const REVIEW_POLICIES = [
  {
    id: 'business-review',
    name: '业务审查',
    description: '检查阶段产物是否达到继续推进的业务交付标准。',
    defaultEnabledStageKinds: ['script_decompose', 'asset_design', 'episode_expand', 'video_prompt_generate'],
    defaultProfileId: 'business-script-decompose-v1',
    stageProfileIds: {
      script_decompose: 'business-script-decompose-v1',
      asset_design: 'business-asset-design-v1',
      episode_expand: 'business-episode-expand-v1',
      video_prompt_generate: 'business-video-prompt-v1',
      video_generate: 'business-video-generate-v1',
    },
  },
  {
    id: 'compliance-review',
    name: '合规审查',
    description: '检查阶段产物是否命中显式风险或违规内容。',
    defaultEnabledStageKinds: ['script_decompose', 'asset_design', 'episode_expand', 'video_prompt_generate'],
    defaultProfileId: 'compliance-default-v1',
    stageProfileIds: {
      script_decompose: 'compliance-default-v1',
      asset_design: 'compliance-default-v1',
      episode_expand: 'compliance-default-v1',
      video_prompt_generate: 'compliance-default-v1',
      video_generate: 'compliance-default-v1',
    },
  },
];

export function getReviewRule(ruleId) {
  return REVIEW_RULES.find((item) => item.id === ruleId) || null;
}

export function getReviewProfile(profileId) {
  return REVIEW_PROFILES.find((item) => item.id === profileId) || null;
}

export function getReviewPolicy(policyId) {
  return REVIEW_POLICIES.find((item) => item.id === policyId) || null;
}

export function resolveReviewPolicyProfile(policy, stageKind) {
  if (!policy) {
    return null;
  }

  const profileId = policy.stageProfileIds?.[stageKind] || policy.defaultProfileId;
  return getReviewProfile(profileId);
}

export function evaluateReviewRule(rule, outputPayload) {
  const value = getValueAtPath(outputPayload, rule?.field);

  if (rule?.type === 'required_string') {
    return asString(value).length >= (rule.minLength || 1);
  }

  if (rule?.type === 'min_array_length') {
    return cleanArray(value).length >= (rule.min || 1);
  }

  if (rule?.type === 'truthy') {
    return Boolean(value);
  }

  if (rule?.type === 'blocklist') {
    const serialized = JSON.stringify(outputPayload);
    return !cleanArray(rule.blockedTerms).some((term) => serialized.includes(term));
  }

  return true;
}

export function evaluateReviewProfileConfig({ policyId, profile, outputPayload }) {
  const fallbackNotes = fallbackReviewNotes(policyId);

  if (!profile) {
    return {
      policyId,
      passed: true,
      notes: fallbackNotes.success,
    };
  }

  const rules = cleanArray(profile.ruleIds)
    .map((ruleId) => getReviewRule(ruleId))
    .filter(Boolean);
  const results = rules.map((rule) => evaluateReviewRule(rule, outputPayload));
  const passed = profile.strategy === 'any'
    ? results.some(Boolean)
    : results.every(Boolean);

  if (profile.strategy === 'blocklist') {
    const serialized = JSON.stringify(outputPayload);
    const matched = rules
      .flatMap((rule) => cleanArray(rule.blockedTerms))
      .find((term) => serialized.includes(term));

    return {
      policyId,
      passed: !matched,
      notes: matched
        ? `${profile.failureMessagePrefix || fallbackNotes.failurePrefix || '合规审查命中敏感内容：'}${matched}`
        : (profile.successMessage || fallbackNotes.success),
    };
  }

  return {
    policyId,
    passed,
    notes: passed
      ? (profile.successMessage || fallbackNotes.success)
      : (profile.failureMessage || fallbackNotes.failure),
  };
}

export function evaluateReviewPoliciesWithRegistry({ reviewPolicyIds, stageKind, outputPayload }) {
  return cleanArray(reviewPolicyIds).map((policyId) => {
    const policy = getReviewPolicy(policyId);
    const profile = resolveReviewPolicyProfile(policy, stageKind);
    return evaluateReviewProfileConfig({
      policyId,
      profile,
      outputPayload,
    });
  });
}
