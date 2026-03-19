import { evaluateReviewProfileConfig, getReviewProfile } from './reviewRegistry.js';

function asString(value) {
  return String(value || '').trim();
}

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasTemplateValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'boolean') {
    return true;
  }
  return asString(value).length > 0;
}

function interpolateTemplate(template, values) {
  return String(template || '')
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
      const value = values[key];
      if (Array.isArray(value)) {
        return value
          .map((item) => asString(item))
          .filter(Boolean)
          .join('、');
      }
      return asString(value);
    })
    .trim();
}

function describeField(field, depth = 0) {
  const indent = '  '.repeat(depth);
  const line = `${indent}- ${field.key}: ${field.description} (${field.type})`;
  const nested = cleanArray(field.itemFields).map((item) => describeField(item, depth + 1));
  return [line, ...nested];
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

function setValueAtPath(target, path, value) {
  const keys = String(path || '')
    .split('.')
    .filter(Boolean);
  if (keys.length === 0) {
    return;
  }

  let cursor = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }

    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
}

function normalizeFieldValue(field, rawValue, fallbackValue) {
  if (field.type === 'string') {
    const normalized = asString(rawValue);
    return normalized || asString(fallbackValue);
  }

  if (field.type === 'number') {
    const rawNumber = Number(rawValue);
    if (Number.isFinite(rawNumber)) {
      return rawNumber;
    }
    const fallbackNumber = Number(fallbackValue);
    return Number.isFinite(fallbackNumber) ? fallbackNumber : 0;
  }

  if (field.type === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    if (typeof fallbackValue === 'boolean') {
      return fallbackValue;
    }
    return Boolean(rawValue);
  }

  if (field.type === 'string[]') {
    const values = cleanArray(rawValue)
      .map((item) => asString(item))
      .filter(Boolean);
    return values.length > 0
      ? values
      : cleanArray(fallbackValue).map((item) => asString(item)).filter(Boolean);
  }

  if (field.type === 'object') {
    const rawObject = asObject(rawValue);
    const fallbackObject = asObject(fallbackValue);
    const nextObject = {};
    cleanArray(field.itemFields).forEach((itemField) => {
      nextObject[itemField.key] = normalizeFieldValue(
        itemField,
        rawObject[itemField.key],
        fallbackObject[itemField.key],
      );
    });
    return nextObject;
  }

  if (field.type === 'object[]') {
    const rawItems = cleanArray(rawValue).map((item) => asObject(item));
    const fallbackItems = cleanArray(fallbackValue).map((item) => asObject(item));
    const sourceItems = rawItems.length > 0 ? rawItems : fallbackItems;
    return sourceItems
      .map((item, index) => {
        const fallbackItem = fallbackItems[index] || {};
        const nextItem = {};
        cleanArray(field.itemFields).forEach((itemField) => {
          nextItem[itemField.key] = normalizeFieldValue(
            itemField,
            item[itemField.key],
            fallbackItem[itemField.key],
          );
        });
        return nextItem;
      })
      .filter((item) => Object.values(item).some(hasTemplateValue));
  }

  return rawValue ?? fallbackValue;
}

export const SKILL_SCHEMAS = [
  {
    id: 'seedance-director-core-v1',
    version: '1.0.0',
    stageKind: 'script_decompose',
    systemInstruction:
      '你是项目导演，请把长剧本拆解为稳定的项目圣经，并输出严格 JSON。',
    promptBlocks: [
      { id: 'projectTitle', label: '项目标题', template: '项目标题：{{projectTitle}}', requiredKeys: ['projectTitle'] },
      { id: 'targetMedium', label: '目标媒介', template: '目标媒介：{{targetMedium}}', requiredKeys: ['targetMedium'] },
      { id: 'aspectRatio', label: '画幅比例', template: '画幅比例：{{aspectRatio}}', requiredKeys: ['aspectRatio'] },
      { id: 'styleSummary', label: '整体风格', template: '整体风格：{{styleSummary}}', requiredKeys: ['styleSummary'] },
      { id: 'globalPrompts', label: '全局提示', template: '全局提示：{{globalPrompts}}', requiredKeys: ['globalPrompts'] },
      { id: 'skillMethodology', label: '技能方法', template: '技能方法：{{skillMethodology}}', requiredKeys: ['skillMethodology'] },
      { id: 'scriptText', label: '原始剧本', template: '原始剧本：\n{{scriptText}}', requiredKeys: ['scriptText'] },
    ],
    outputContract: {
      format: 'json',
      fields: [
        { key: 'title', type: 'string', description: '项目标题' },
        { key: 'logline', type: 'string', description: '项目一句话概述' },
        { key: 'summary', type: 'string', description: '项目整体摘要' },
        { key: 'worldRules', type: 'string[]', description: '世界规则' },
        { key: 'continuityRules', type: 'string[]', description: '连续性规则' },
        {
          key: 'characters',
          type: 'object[]',
          description: '角色清单',
          itemFields: [
            { key: 'name', type: 'string', description: '角色名' },
            { key: 'description', type: 'string', description: '角色描述' },
          ],
        },
        {
          key: 'scenes',
          type: 'object[]',
          description: '场景清单',
          itemFields: [
            { key: 'name', type: 'string', description: '场景名' },
            { key: 'description', type: 'string', description: '场景描述' },
          ],
        },
        {
          key: 'props',
          type: 'object[]',
          description: '道具清单',
          itemFields: [
            { key: 'name', type: 'string', description: '道具名' },
            { key: 'description', type: 'string', description: '道具描述' },
          ],
        },
        {
          key: 'episodes',
          type: 'object[]',
          description: '剧集壳子',
          itemFields: [
            { key: 'episodeNumber', type: 'number', description: '集数' },
            { key: 'title', type: 'string', description: '集标题' },
            { key: 'synopsis', type: 'string', description: '集概述' },
            { key: 'sourceText', type: 'string', description: '对应原始文本' },
          ],
        },
      ],
    },
    artifactBindings: {
      storyBible: [
        { target: 'title', sourceField: 'title' },
        { target: 'logline', sourceField: 'logline' },
        { target: 'summary', sourceField: 'summary' },
        { target: 'worldRules', sourceField: 'worldRules' },
        { target: 'continuityRules', sourceField: 'continuityRules' },
        { target: 'characters', sourceField: 'characters' },
        { target: 'scenes', sourceField: 'scenes' },
        { target: 'props', sourceField: 'props' },
        { target: 'episodes', sourceField: 'episodes' },
      ],
    },
    reviewConfig: {
      'business-review': { profileId: 'business-script-decompose-v1' },
      'compliance-review': { profileId: 'compliance-default-v1' },
    },
  },
  {
    id: 'seedance-episode-expand-core-v1',
    version: '1.0.0',
    stageKind: 'episode_expand',
    systemInstruction:
      '你是单集导演，请把当前单集扩写为可执行的上下文包与分镜节拍，并输出严格 JSON。',
    promptBlocks: [
      { id: 'projectTitle', label: '项目标题', template: '项目标题：{{projectTitle}}', requiredKeys: ['projectTitle'] },
      { id: 'storySummary', label: '项目摘要', template: '项目摘要：{{storySummary}}', requiredKeys: ['storySummary'] },
      { id: 'episodeTitle', label: '当前单集', template: '当前单集：{{episodeTitle}}', requiredKeys: ['episodeTitle'] },
      { id: 'episodeSynopsis', label: '单集梗概', template: '单集梗概：{{episodeSynopsis}}', requiredKeys: ['episodeSynopsis'] },
      { id: 'previousEpisodeSummary', label: '前情摘要', template: '前情摘要：{{previousEpisodeSummary}}', requiredKeys: ['previousEpisodeSummary'] },
      { id: 'lockedAssetSummary', label: '锁定资产', template: '锁定资产：{{lockedAssetSummary}}', requiredKeys: ['lockedAssetSummary'] },
      { id: 'skillMethodology', label: '技能方法', template: '技能方法：{{skillMethodology}}', requiredKeys: ['skillMethodology'] },
    ],
    outputContract: {
      format: 'json',
      fields: [
        { key: 'contextSummary', type: 'string', description: '单集上下文摘要' },
        { key: 'precedingSummary', type: 'string', description: '前情摘要' },
        { key: 'storyboardBeats', type: 'string[]', description: '单集分镜节拍' },
        {
          key: 'worldState',
          type: 'object',
          description: '单集世界状态',
          itemFields: [
            { key: 'storyBibleTitle', type: 'string', description: '故事圣经标题' },
            { key: 'styleSummary', type: 'string', description: '风格摘要' },
            { key: 'targetMedium', type: 'string', description: '目标媒介' },
          ],
        },
        {
          key: 'continuityState',
          type: 'object',
          description: '连续性状态',
          itemFields: [
            { key: 'lockedAssetIds', type: 'string[]', description: '锁定资产 ID 列表' },
            { key: 'previousEpisodeCount', type: 'number', description: '前置剧集数量' },
          ],
        },
        {
          key: 'shots',
          type: 'object[]',
          description: '结构化分镜',
          itemFields: [
            { key: 'title', type: 'string', description: '分镜标题' },
            { key: 'summary', type: 'string', description: '分镜摘要' },
            { key: 'promptText', type: 'string', description: '分镜视频提示词' },
            { key: 'durationLabel', type: 'string', description: '建议时长标签' },
            { key: 'recommendedModelId', type: 'string', description: '推荐视频模型 deploymentId' },
            { key: 'recommendedModeId', type: 'string', description: '推荐视频生成模式' },
            { key: 'referenceAssetNames', type: 'string[]', description: '推荐参考资产名列表' },
          ],
        },
      ],
    },
    artifactBindings: {
      workspaceNodes: [
        { target: 'storyboard', sourceField: 'storyboardBeats', transform: 'joinLines' },
      ],
      episodeContextRecord: [
        { target: 'contextSummary', sourceField: 'contextSummary' },
        { target: 'precedingSummary', sourceField: 'precedingSummary' },
      ],
      episodeContext: [
        { target: 'worldState', sourceField: 'worldState' },
        { target: 'continuityState', sourceField: 'continuityState' },
        { target: 'storyboardBeats', sourceField: 'storyboardBeats' },
        { target: 'storyboardShots', sourceField: 'shots' },
      ],
    },
    reviewConfig: {
      'business-review': { profileId: 'business-episode-expand-v1' },
      'compliance-review': { profileId: 'compliance-default-v1' },
    },
  },
  {
    id: 'seedance-asset-design-core-v1',
    version: '1.0.0',
    stageKind: 'asset_design',
    systemInstruction:
      '你是资产设计师，请把项目圣经整理为稳定的 canonical assets，并输出严格 JSON。',
    promptBlocks: [
      { id: 'projectTitle', label: '项目标题', template: '项目标题：{{projectTitle}}', requiredKeys: ['projectTitle'] },
      { id: 'storySummary', label: '项目摘要', template: '项目摘要：{{storySummary}}', requiredKeys: ['storySummary'] },
      { id: 'styleSummary', label: '整体风格', template: '整体风格：{{styleSummary}}', requiredKeys: ['styleSummary'] },
      { id: 'skillMethodology', label: '技能方法', template: '技能方法：{{skillMethodology}}', requiredKeys: ['skillMethodology'] },
    ],
    outputContract: {
      format: 'json',
      fields: [
        {
          key: 'assets',
          type: 'object[]',
          description: '结构化资产列表',
          itemFields: [
            { key: 'type', type: 'string', description: '资产类型' },
            { key: 'name', type: 'string', description: '资产名称' },
            { key: 'description', type: 'string', description: '资产描述' },
            { key: 'promptText', type: 'string', description: '主提示词' },
            { key: 'previewHint', type: 'string', description: '预览提示' },
          ],
        },
      ],
    },
    artifactBindings: {
      assetRecords: [
        { target: 'assets', sourceField: 'assets' },
      ],
    },
    reviewConfig: {
      'business-review': { profileId: 'business-asset-design-v1' },
      'compliance-review': { profileId: 'compliance-default-v1' },
    },
  },
  {
    id: 'seedance-image-prompt-core-v1',
    version: '1.0.0',
    stageKind: 'asset_design',
    systemInstruction:
      '你是资产提示词设计师，请为指定资产生成可直接用于图片模型的主提示词，并输出严格 JSON。',
    promptBlocks: [
      { id: 'projectTitle', label: '项目标题', template: '项目标题：{{projectTitle}}', requiredKeys: ['projectTitle'] },
      { id: 'storySummary', label: '项目摘要', template: '项目摘要：{{storySummary}}', requiredKeys: ['storySummary'] },
      { id: 'styleSummary', label: '整体风格', template: '整体风格：{{styleSummary}}', requiredKeys: ['styleSummary'] },
      { id: 'assetType', label: '资产类型', template: '资产类型：{{assetType}}', requiredKeys: ['assetType'] },
      { id: 'assetName', label: '资产名称', template: '资产名称：{{assetName}}', requiredKeys: ['assetName'] },
      { id: 'assetDescription', label: '资产描述', template: '资产描述：{{assetDescription}}', requiredKeys: ['assetDescription'] },
      { id: 'skillMethodology', label: '技能方法', template: '技能方法：{{skillMethodology}}', requiredKeys: ['skillMethodology'] },
    ],
    outputContract: {
      format: 'json',
      fields: [
        { key: 'prompt', type: 'string', description: '图片生成主提示词' },
      ],
    },
    reviewConfig: {
      'business-review': { profileId: 'business-image-prompt-v1' },
      'compliance-review': { profileId: 'compliance-default-v1' },
    },
  },
  {
    id: 'seedance-storyboard-core-v1',
    version: '1.0.0',
    stageKind: 'video_prompt_generate',
    systemInstruction:
      '你是分镜导演，请把单集上下文整理为视频提示词、分镜节拍与配音提示词，并输出严格 JSON。',
    promptBlocks: [
      { id: 'projectTitle', label: '项目标题', template: '项目标题：{{projectTitle}}', requiredKeys: ['projectTitle'] },
      { id: 'episodeTitle', label: '当前单集', template: '当前单集：{{episodeTitle}}', requiredKeys: ['episodeTitle'] },
      { id: 'episodeContextSummary', label: '单集上下文', template: '单集上下文：{{episodeContextSummary}}', requiredKeys: ['episodeContextSummary'] },
      { id: 'precedingSummary', label: '前情摘要', template: '前情摘要：{{precedingSummary}}', requiredKeys: ['precedingSummary'] },
      { id: 'styleSummary', label: '整体风格', template: '整体风格：{{styleSummary}}', requiredKeys: ['styleSummary'] },
      { id: 'lockedAssetSummary', label: '锁定资产', template: '锁定资产：{{lockedAssetSummary}}', requiredKeys: ['lockedAssetSummary'] },
      { id: 'continuitySummary', label: '连续性状态', template: '连续性状态：{{continuitySummary}}', requiredKeys: ['continuitySummary'] },
      {
        id: 'promptRecipe',
        label: '提示词配方',
        template: '提示词配方：{{promptRecipeName}}；说明：{{promptRecipeDescription}}',
        requiredKeys: ['promptRecipeName'],
      },
      { id: 'skillMethodology', label: '技能方法', template: '技能方法：{{skillMethodology}}', requiredKeys: ['skillMethodology'] },
    ],
    outputContract: {
      format: 'json',
      fields: [
        { key: 'prompt', type: 'string', description: '主视频提示词' },
        { key: 'beatSheet', type: 'string[]', description: '分镜节拍列表' },
        { key: 'voicePrompt', type: 'string', description: '配音提示词' },
        {
          key: 'shots',
          type: 'object[]',
          description: '结构化分镜',
          itemFields: [
            { key: 'title', type: 'string', description: '分镜标题' },
            { key: 'summary', type: 'string', description: '分镜摘要' },
            { key: 'promptText', type: 'string', description: '分镜视频提示词' },
            { key: 'durationLabel', type: 'string', description: '建议时长标签' },
            { key: 'recommendedModelId', type: 'string', description: '推荐视频模型 deploymentId' },
            { key: 'recommendedModeId', type: 'string', description: '推荐视频生成模式' },
            { key: 'referenceAssetNames', type: 'string[]', description: '推荐参考资产名列表' },
          ],
        },
      ],
    },
    artifactBindings: {
      workspaceNodes: [
        { target: 'prompt', sourceField: 'prompt' },
        { target: 'storyboard', sourceField: 'beatSheet', transform: 'joinLines' },
      ],
      episodeContext: [
        { target: 'storyboardBeats', sourceField: 'beatSheet' },
        { target: 'storyboardShots', sourceField: 'shots' },
      ],
    },
    reviewConfig: {
      'business-review': { profileId: 'business-video-prompt-v1' },
      'compliance-review': { profileId: 'compliance-default-v1' },
    },
  },
];

export function getSkillSchema(schemaId) {
  return SKILL_SCHEMAS.find((item) => item.id === schemaId) || null;
}

export function renderSkillPromptBlocks(schema, values) {
  return cleanArray(schema?.promptBlocks)
    .filter((block) => cleanArray(block.requiredKeys).every((key) => hasTemplateValue(values[key])))
    .map((block) => interpolateTemplate(block.template, values))
    .filter(Boolean);
}

export function describeSkillOutputContract(schema) {
  return cleanArray(schema?.outputContract?.fields)
    .flatMap((field) => describeField(field))
    .join('\n');
}

export function normalizeSkillOutputWithContract({ schema, raw, fallback }) {
  const source = asObject(raw);
  const fallbackObject = asObject(fallback);
  const nextOutput = {};

  cleanArray(schema?.outputContract?.fields).forEach((field) => {
    nextOutput[field.key] = normalizeFieldValue(field, source[field.key], fallbackObject[field.key]);
  });

  return nextOutput;
}

export function applySkillArtifactBindings(bindings, outputPayload) {
  const payload = asObject(outputPayload);
  const groups = {
    workspaceNodeValues: {},
    episodeContextRecordValues: {},
    episodeContextValues: {},
    storyBibleValues: {},
    assetRecordValues: {},
    setupMetadataValues: {},
  };

  const groupMap = {
    workspaceNodes: groups.workspaceNodeValues,
    episodeContextRecord: groups.episodeContextRecordValues,
    episodeContext: groups.episodeContextValues,
    storyBible: groups.storyBibleValues,
    assetRecords: groups.assetRecordValues,
    setupMetadata: groups.setupMetadataValues,
  };

  Object.entries(groupMap).forEach(([bindingKey, target]) => {
    cleanArray(bindings?.[bindingKey]).forEach((binding) => {
      const rawValue = getValueAtPath(payload, binding.sourceField);
      const transformedValue = binding.transform === 'joinLines'
        ? cleanArray(rawValue).map((item) => asString(item)).filter(Boolean).join('\n')
        : rawValue;
      setValueAtPath(target, binding.target, transformedValue);
    });
  });

  return groups;
}

export function evaluateSkillReviewPolicies({ reviewPolicyIds, outputPayload, schema }) {
  return cleanArray(reviewPolicyIds).map((policyId) => {
    const profileId = schema?.reviewConfig?.[policyId]?.profileId;
    const profile = getReviewProfile(profileId);
    return evaluateReviewProfileConfig({
      policyId,
      profile,
      outputPayload,
    });
  });
}
