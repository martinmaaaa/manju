import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateReviewProfileConfig, getReviewProfile } from './reviewRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const SEEDANCE_SKILLS_ROOT = path.join(REPO_ROOT, 'Seedance 2.0 AI 分镜师团队', 'skills');
const SUPPORTED_OUTPUT_FIELD_TYPES = new Set(['string', 'number', 'boolean', 'string[]', 'object', 'object[]']);
const SUPPORTED_ARTIFACT_BINDING_GROUPS = new Set([
  'workspaceNodes',
  'episodeContextRecord',
  'episodeContext',
  'storyBible',
  'assetRecords',
  'setupMetadata',
]);
const SUPPORTED_ARTIFACT_TRANSFORMS = new Set(['identity', 'joinLines']);

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

function getValueAtPath(source, pathValue) {
  if (!pathValue || pathValue === '$output') {
    return source;
  }

  return String(pathValue)
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);
}

function setValueAtPath(target, pathValue, value) {
  const keys = String(pathValue || '')
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

function walkSchemaFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const results = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.name.startsWith('.')) {
        return;
      }
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        return;
      }
      if (path.extname(entry.name).toLowerCase() === '.json' && absolutePath.includes(`${path.sep}schemas${path.sep}`)) {
        results.push(absolutePath);
      }
    });
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function validateSchema(schemaPath, schema) {
  const requiredStringFields = ['id', 'version', 'stageKind', 'systemInstruction'];
  requiredStringFields.forEach((field) => {
    if (!asString(schema?.[field])) {
      throw new Error(`Skill schema ${schemaPath} 缺少必填字段 ${field}。`);
    }
  });

  if (!Array.isArray(schema?.promptBlocks)) {
    throw new Error(`Skill schema ${schemaPath} 缺少 promptBlocks 数组。`);
  }

  if (!schema?.outputContract || schema.outputContract.format !== 'json' || !Array.isArray(schema.outputContract.fields)) {
    throw new Error(`Skill schema ${schemaPath} 缺少合法的 outputContract。`);
  }

  if (!/^\d+\.\d+\.\d+$/.test(asString(schema.version))) {
    throw new Error(`Skill schema ${schemaPath} 的 version 必须是 semver 形式。`);
  }

  const promptBlockIds = new Set();
  cleanArray(schema.promptBlocks).forEach((block) => {
    if (!asString(block.id) || !asString(block.label) || !asString(block.template)) {
      throw new Error(`Skill schema ${schemaPath} 存在不完整的 promptBlock。`);
    }
    if (promptBlockIds.has(block.id)) {
      throw new Error(`Skill schema ${schemaPath} 存在重复的 promptBlock id: ${block.id}。`);
    }
    promptBlockIds.add(block.id);
    if (block.requiredKeys && !Array.isArray(block.requiredKeys)) {
      throw new Error(`Skill schema ${schemaPath} 的 promptBlock ${block.id} requiredKeys 必须是数组。`);
    }
  });

  const validateField = (field, parentKey = '') => {
    if (!asString(field?.key) || !asString(field?.description) || !SUPPORTED_OUTPUT_FIELD_TYPES.has(asString(field?.type))) {
      throw new Error(`Skill schema ${schemaPath} 的输出字段 ${parentKey || '<root>'} 定义不合法。`);
    }
    if (['object', 'object[]'].includes(field.type)) {
      if (!Array.isArray(field.itemFields) || field.itemFields.length === 0) {
        throw new Error(`Skill schema ${schemaPath} 的字段 ${field.key} 必须声明 itemFields。`);
      }
      const nestedKeys = new Set();
      cleanArray(field.itemFields).forEach((itemField) => {
        if (nestedKeys.has(itemField.key)) {
          throw new Error(`Skill schema ${schemaPath} 的字段 ${field.key} 存在重复子字段 ${itemField.key}。`);
        }
        nestedKeys.add(itemField.key);
        validateField(itemField, `${field.key}.${itemField.key}`);
      });
    }
  };

  const topLevelFieldKeys = new Set();
  cleanArray(schema.outputContract.fields).forEach((field) => {
    if (topLevelFieldKeys.has(field.key)) {
      throw new Error(`Skill schema ${schemaPath} 存在重复的输出字段 ${field.key}。`);
    }
    topLevelFieldKeys.add(field.key);
    validateField(field, field.key);
  });

  Object.entries(asObject(schema.artifactBindings)).forEach(([groupKey, bindings]) => {
    if (!SUPPORTED_ARTIFACT_BINDING_GROUPS.has(groupKey)) {
      throw new Error(`Skill schema ${schemaPath} 使用了未支持的 artifactBindings 分组 ${groupKey}。`);
    }
    cleanArray(bindings).forEach((binding) => {
      if (!asString(binding?.target) || !asString(binding?.sourceField)) {
        throw new Error(`Skill schema ${schemaPath} 的 artifact binding 缺少 target 或 sourceField。`);
      }
      if (binding.transform && !SUPPORTED_ARTIFACT_TRANSFORMS.has(asString(binding.transform))) {
        throw new Error(`Skill schema ${schemaPath} 的 artifact binding 使用了未支持的 transform: ${binding.transform}。`);
      }
    });
  });

  Object.entries(asObject(schema.reviewConfig)).forEach(([policyId, config]) => {
    if (!asString(policyId) || !asString(config?.profileId)) {
      throw new Error(`Skill schema ${schemaPath} 的 reviewConfig 存在空策略或空 profileId。`);
    }
    if (!getReviewProfile(config.profileId)) {
      throw new Error(`Skill schema ${schemaPath} 引用了不存在的 review profile: ${config.profileId}。`);
    }
  });
}

function hydrateSchema(schemaPath) {
  const raw = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  validateSchema(schemaPath, raw);
  return {
    ...raw,
    sourcePath: path.relative(REPO_ROOT, schemaPath).split(path.sep).join('/'),
  };
}

export function loadSkillSchemas() {
  const schemas = walkSchemaFiles(SEEDANCE_SKILLS_ROOT).map(hydrateSchema);
  const seen = new Set();

  schemas.forEach((schema) => {
    if (seen.has(schema.id)) {
      throw new Error(`发现重复的 skill schema id: ${schema.id}`);
    }
    seen.add(schema.id);
  });

  return schemas;
}

export const SKILL_SCHEMAS = loadSkillSchemas();
const SKILL_SCHEMA_MAP = new Map(SKILL_SCHEMAS.map((item) => [item.id, item]));

export function getSkillSchema(schemaId) {
  return SKILL_SCHEMA_MAP.get(schemaId) || null;
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
