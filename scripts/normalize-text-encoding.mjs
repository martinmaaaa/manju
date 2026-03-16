import path from 'node:path';
import { formatIssueReport, normalizeTextEncoding } from './textEncodingTools.mjs';

const rootDir = process.cwd();
const { modifiedFiles, unresolvedFiles } = normalizeTextEncoding(rootDir);

if (modifiedFiles.length > 0) {
  console.log('已移除 UTF-8 BOM：');
  for (const filePath of modifiedFiles) {
    console.log(`- ${path.relative(rootDir, filePath).replaceAll(path.sep, '/')}`);
  }
} else {
  console.log('没有检测到需要移除的 UTF-8 BOM。');
}

if (unresolvedFiles.length > 0) {
  console.error('以下文件仍然存在需要人工处理的文本问题：');
  console.error(formatIssueReport(unresolvedFiles, rootDir));
  process.exit(1);
}

console.log('文本编码规范化完成。');
