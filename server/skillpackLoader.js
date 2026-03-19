import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSkillSchema } from './skillSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const SEEDANCE_SKILLS_ROOT = path.join(REPO_ROOT, 'Seedance 2.0 AI 分镜师团队', 'skills');
const SKILLPACK_MANIFEST_PATTERN = /^skillpack\..+\.json$/i;
const PREVIEWABLE_RESOURCE_EXTENSIONS = new Set(['.md', '.txt']);
const SUPPORTED_SCRIPT_RUNTIMES = new Set(['node', 'python', 'powershell']);
const SUPPORTED_SCRIPT_PHASES = new Set(['before_prompt', 'after_normalize', 'before_review']);

function normalizePathForRegistry(value) {
  return String(value || '').split(path.sep).join('/');
}

function toRepoRelativePath(absolutePath) {
  return normalizePathForRegistry(path.relative(REPO_ROOT, absolutePath));
}

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clampText(value, maxLength) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function parseFrontmatter(content) {
  const normalized = String(content || '');
  if (!normalized.startsWith('---')) {
    return { metadata: {}, body: normalized };
  }

  const lines = normalized.split(/\r?\n/);
  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (closingIndex < 0) {
    return { metadata: {}, body: normalized };
  }

  const metadataLines = lines.slice(1, closingIndex + 1);
  const body = lines.slice(closingIndex + 2).join('\n');
  const metadata = metadataLines.reduce((accumulator, line) => {
    const match = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (!match) {
      return accumulator;
    }
    accumulator[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
    return accumulator;
  }, {});

  return { metadata, body };
}

function summarizeMarkdownContent(content) {
  const { metadata, body } = parseFrontmatter(content);
  const normalizedBody = String(body || '').replace(/\r/g, '');
  const lines = normalizedBody.split('\n').map((line) => line.trim());
  const headingLine = lines.find((line) => /^#\s+/.test(line));
  const title = String(metadata.title || metadata.name || (headingLine ? headingLine.replace(/^#\s+/, '') : '')).trim();
  const previewSource = lines
    .filter((line) => line && !/^#/.test(line) && !/^```/.test(line) && !/^---$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title,
    summary: clampText(previewSource, 160),
    previewText: clampText(previewSource, 320),
    content: normalizedBody.trim(),
  };
}

function hydrateResourceDocuments(rootDir) {
  return walkFiles(rootDir)
    .filter((filePath) => PREVIEWABLE_RESOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const summarized = summarizeMarkdownContent(content);
      return {
        path: toRepoRelativePath(filePath),
        title: summarized.title || path.basename(filePath),
        summary: summarized.summary || '',
        previewText: summarized.previewText || '',
        content: summarized.content || String(content || '').trim(),
      };
    });
}

function walkFiles(rootDir) {
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
      results.push(absolutePath);
    });
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function walkSkillpackManifests(rootDir) {
  return walkFiles(rootDir).filter((filePath) => SKILLPACK_MANIFEST_PATTERN.test(path.basename(filePath)));
}

function resolveSchemaMap(capabilitySchemaIds = {}, fallbackSchemaId = null, manifestPath) {
  const schemasByCapability = Object.fromEntries(
    Object.entries(capabilitySchemaIds).map(([capabilityId, schemaId]) => {
      const schema = getSkillSchema(schemaId);
      if (!schema) {
        throw new Error(`Skillpack manifest ${manifestPath} 引用了不存在的 schema: ${schemaId}。`);
      }
      return [capabilityId, schema];
    }),
  );

  const schema = fallbackSchemaId ? getSkillSchema(fallbackSchemaId) : null;
  if (fallbackSchemaId && !schema) {
    throw new Error(`Skillpack manifest ${manifestPath} 引用了不存在的默认 schema: ${fallbackSchemaId}。`);
  }

  return {
    schema,
    schemasByCapability,
  };
}

function resolvePackAssets(manifestDir, manifestAssets = {}) {
  const assetDir = path.join(manifestDir, 'assets');
  const discoveredAssetFiles = walkFiles(assetDir).map(toRepoRelativePath);

  return {
    primaryOutput: String(manifestAssets.primaryOutput || '').trim(),
    artifacts: ensureArray(manifestAssets.artifacts).map((item) => String(item).trim()).filter(Boolean),
    directories: fs.existsSync(assetDir) ? [toRepoRelativePath(assetDir)] : [],
    files: discoveredAssetFiles,
    documents: hydrateResourceDocuments(assetDir),
  };
}

function resolvePackReferences(manifestDir, manifestReferences = {}) {
  const referenceDir = path.join(manifestDir, 'references');
  const discoveredReferenceFiles = walkFiles(referenceDir).map(toRepoRelativePath);
  const skillMdPath = path.join(manifestDir, 'SKILL.md');
  const sourceMaterials = new Set(
    ensureArray(manifestReferences.sourceMaterials)
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => normalizePathForRegistry(path.isAbsolute(item) ? path.relative(REPO_ROOT, item) : path.join(toRepoRelativePath(manifestDir), item))),
  );

  if (fs.existsSync(skillMdPath)) {
    sourceMaterials.add(toRepoRelativePath(skillMdPath));
  }

  return {
    sourceMaterials: Array.from(sourceMaterials),
    directories: fs.existsSync(referenceDir) ? [toRepoRelativePath(referenceDir)] : [],
    files: discoveredReferenceFiles,
    notes: ensureArray(manifestReferences.notes).map((item) => String(item).trim()).filter(Boolean),
    documents: hydrateResourceDocuments(referenceDir),
  };
}

function resolvePackScripts(manifestDir) {
  const scriptsDir = path.join(manifestDir, 'scripts');
  return {
    directories: fs.existsSync(scriptsDir) ? [toRepoRelativePath(scriptsDir)] : [],
    files: walkFiles(scriptsDir).map(toRepoRelativePath),
  };
}

function validateScriptEntry(manifestPath, scriptsDir, entry, knownIds) {
  const id = String(entry?.id || '').trim();
  const label = String(entry?.label || '').trim();
  const runtime = String(entry?.runtime || '').trim();
  const phase = String(entry?.phase || '').trim();
  const relativePath = String(entry?.path || '').trim();

  if (!id || !label || !runtime || !phase || !relativePath) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 script entry 缺少必填字段。`);
  }
  if (knownIds.has(id)) {
    throw new Error(`Skillpack manifest ${manifestPath} 存在重复 script id: ${id}。`);
  }
  if (!SUPPORTED_SCRIPT_RUNTIMES.has(runtime)) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 script ${id} 使用了未支持的 runtime: ${runtime}。`);
  }
  if (!SUPPORTED_SCRIPT_PHASES.has(phase)) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 script ${id} 使用了未支持的 phase: ${phase}。`);
  }

  const absolutePath = path.resolve(scriptsDir, relativePath);
  if (!absolutePath.startsWith(path.resolve(scriptsDir))) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 script ${id} 路径越界。`);
  }
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 script ${id} 文件不存在: ${relativePath}。`);
  }

  const timeoutMs = Number(entry?.timeoutMs);
  if (entry?.timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 script ${id} timeoutMs 必须在 1000-120000 之间。`);
  }

  knownIds.add(id);
  return {
    id,
    label,
    path: toRepoRelativePath(absolutePath),
    runtime,
    phase,
    description: String(entry?.description || '').trim(),
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    allowFailure: Boolean(entry?.allowFailure),
  };
}

function hydrateScriptEntries(manifestPath, manifestDir, rawScripts = {}) {
  const scriptsDir = path.join(manifestDir, 'scripts');
  const entries = ensureArray(rawScripts.entries);
  const knownIds = new Set();
  return entries.map((entry) => validateScriptEntry(manifestPath, scriptsDir, entry, knownIds));
}

function validateManifest(manifestPath, manifest) {
  const requiredStringFields = ['id', 'name', 'stageKind', 'executionRole', 'description', 'promptMethodology'];
  requiredStringFields.forEach((field) => {
    if (!String(manifest?.[field] || '').trim()) {
      throw new Error(`Skillpack manifest ${manifestPath} 缺少必填字段 ${field}。`);
    }
  });

  if (!manifest.schemaId && Object.keys(manifest.capabilitySchemaIds || {}).length === 0) {
    throw new Error(`Skillpack manifest ${manifestPath} 至少需要 schemaId 或 capabilitySchemaIds。`);
  }

  if (!manifest.assets || !String(manifest.assets.primaryOutput || '').trim()) {
    throw new Error(`Skillpack manifest ${manifestPath} 缺少 assets.primaryOutput。`);
  }

  ensureArray(manifest.reviewPolicies).forEach((policyId) => {
    if (!String(policyId || '').trim()) {
      throw new Error(`Skillpack manifest ${manifestPath} 存在空的 reviewPolicies 条目。`);
    }
  });
}

function hydrateManifest(manifestPath) {
  const manifestDir = path.dirname(manifestPath);
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  validateManifest(manifestPath, raw);

  const capabilitySchemaIds = raw.capabilitySchemaIds || {};
  const { schema, schemasByCapability } = resolveSchemaMap(capabilitySchemaIds, raw.schemaId || null, manifestPath);
  const manifestStageKind = String(raw.stageKind || '').trim();

  if (schema && String(schema.stageKind || '').trim() !== manifestStageKind) {
    throw new Error(`Skillpack manifest ${manifestPath} 的 schema.stageKind 与 manifest.stageKind 不一致。`);
  }

  Object.entries(schemasByCapability).forEach(([capabilityId, capabilitySchema]) => {
    if (String(capabilitySchema?.stageKind || '').trim() !== manifestStageKind) {
      throw new Error(`Skillpack manifest ${manifestPath} 的 capability ${capabilityId} 映射到了不同 stageKind 的 schema。`);
    }
  });

  return {
    id: String(raw.id).trim(),
    name: String(raw.name).trim(),
    stageKind: manifestStageKind,
    source: toRepoRelativePath(manifestDir),
    executionRole: String(raw.executionRole).trim(),
    schemaId: raw.schemaId ? String(raw.schemaId).trim() : null,
    capabilitySchemaIds,
    description: String(raw.description).trim(),
    promptMethodology: String(raw.promptMethodology).trim(),
    assets: resolvePackAssets(manifestDir, raw.assets),
    references: resolvePackReferences(manifestDir, raw.references),
    scripts: {
      ...resolvePackScripts(manifestDir),
      entries: hydrateScriptEntries(manifestPath, manifestDir, raw.scripts),
    },
    reviewPolicies: ensureArray(raw.reviewPolicies).map((item) => String(item).trim()).filter(Boolean),
    promptRecipes: ensureArray(raw.promptRecipes).map((recipe) => ({
      id: String(recipe?.id || '').trim(),
      name: String(recipe?.name || '').trim(),
      description: String(recipe?.description || '').trim(),
    })).filter((recipe) => recipe.id && recipe.name),
    schema,
    schemasByCapability,
  };
}

export function loadSeedanceSkillPacks() {
  return walkSkillpackManifests(SEEDANCE_SKILLS_ROOT).map(hydrateManifest);
}
