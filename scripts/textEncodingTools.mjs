import fs from 'node:fs';
import path from 'node:path';

export const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml',
  '.txt',
  '.sql',
  '.ps1',
  '.sh',
  '.cs',
  '.csproj',
  '.sln',
]);

export const TEXT_FILENAMES = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.env',
  '.env.example',
  '.env.local',
]);

export const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'output',
  '.next',
  '.turbo',
  'playwright-user-data',
]);

export const MOJIBAKE_MARKERS = [
  '\u934f\u62bd\u68f4',
  '\u9357\u866b\u2175',
  '\u6d60\u546e\u656e\u93b8',
  '\u93c8\u20ac\u6fb6\u6c2d\u656e\u93b8',
  '\u5a55\ue0a2\u58bd',
  '\u9352\u6d97\u7d94',
  '\u9353\u5d87\ue06c',
  '\u935a\u5ea3\ue06c',
  '\u7459\u55db\ue576',
  '\u9365\u5267\u5896',
  '\u9422\u71b8\u579a',
  '\u7481\u5267\u7586',
  '\u6924\u572d\u6d30',
  '\u93c1\u7248\u5d41',
  '\u941c\ue21a\ue568',
  '\u95b0\u5d87\u7586',
  '\u68e3\u6827\u7b22',
  '\u704f\u60e7\u7b22',
  '\u9286\u003f',
  '\u951f',
];

function compareByName(left, right) {
  return left.name.localeCompare(right.name);
}

export function isTextFile(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  const extension = path.extname(baseName);
  return TEXT_FILENAMES.has(baseName) || TEXT_EXTENSIONS.has(extension);
}

export function collectTextFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort(compareByName);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }

        walk(path.join(currentDir, entry.name));
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isFile() && isTextFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

export function normalizeTextContent(text) {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

export function findTextIssues(text) {
  const issues = [];

  if (text.startsWith('\uFEFF')) {
    issues.push({
      type: 'bom',
      message: '包含 UTF-8 BOM',
    });
  }

  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  if (replacementCount > 0) {
    issues.push({
      type: 'replacement',
      count: replacementCount,
      message: `包含 ${replacementCount} 个替换符`,
    });
  }

  const privateUseCount = (text.match(/[\uE000-\uF8FF]/g) || []).length;
  if (privateUseCount > 0) {
    issues.push({
      type: 'private-use',
      count: privateUseCount,
      message: `包含 ${privateUseCount} 个私有区字符`,
    });
  }

  const markerHits = MOJIBAKE_MARKERS.filter((marker) => text.includes(marker));
  if (markerHits.length > 0) {
    issues.push({
      type: 'mojibake',
      count: markerHits.length,
      message: `命中可疑乱码片段：${markerHits.slice(0, 5).join('、')}`,
    });
  }

  return issues;
}

export function scanTextIntegrity(rootDir) {
  return collectTextFiles(rootDir)
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const issues = findTextIssues(content);
      return issues.length > 0 ? { filePath, issues } : null;
    })
    .filter(Boolean);
}

export function normalizeTextEncoding(rootDir) {
  const modifiedFiles = [];
  const unresolvedFiles = [];

  for (const filePath of collectTextFiles(rootDir)) {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const normalizedContent = normalizeTextContent(originalContent);

    if (normalizedContent !== originalContent) {
      fs.writeFileSync(filePath, normalizedContent, 'utf8');
      modifiedFiles.push(filePath);
    }

    const issues = findTextIssues(normalizedContent).filter((issue) => issue.type !== 'bom');
    if (issues.length > 0) {
      unresolvedFiles.push({ filePath, issues });
    }
  }

  return {
    modifiedFiles,
    unresolvedFiles,
  };
}

export function formatIssueReport(results, rootDir) {
  return results
    .map(({ filePath, issues }) => {
      const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');
      const details = issues.map((issue) => issue.message).join('；');
      return `- ${relativePath}: ${details}`;
    })
    .join('\n');
}
